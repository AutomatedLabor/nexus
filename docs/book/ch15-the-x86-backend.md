# Chapter 15 — The x86 backend

> Aether v3's x86 backend compiles Aether programs to x86-64 assembly (NASM syntax), runs them via a structured interpreter, and gets near-native speed without requiring a real assembler or the ability to execute machine code in the sandbox. This chapter covers the IR → NASM lowering, instruction selection, register allocation, the calling convention, the structured interpreter, and how to use `compileAndRunNative`. Ten runnable examples show every part.

The x86 backend is the v3 fourth runtime (after the tree-walker, the VM, and the WASM backend). It exists for two reasons: (1) to demonstrate that Aether's IR is target-independent — the same IR lowers to WASM and to x86-64 — and (2) to give the playground a "real" backend that users can read at the assembly level. The WASM backend is faster in the browser (the browser's WASM engine is heavily optimised); the x86 backend is more *instructive* — the assembly is human-readable, the calling convention is documented, and the structured interpreter's source is open.

The backend lives in `aether/vm/x86/x86.ts` (~1800 lines). It takes the optimized IR (the same IR the v2 VM and the WASM backend use) and lowers it to NASM assembly, then either assembles + runs the binary (in Node, with NASM available) or interprets the assembly via a structured interpreter (in the browser, where running native code is forbidden). The structured interpreter is the v3 default; the native execution path is a v3.1 roadmap item.

---

## 15.1 The compilation pipeline

```
Aether source
      │
      ▼
Lexer ──► tokens ──► Parser ──► AST ──► typed AST
      │
      ▼
IR builder ──► IR (the same IR as the v2 VM and WASM)
      │
      ▼
8 optimizer passes (constantFolding → dce → cse → inlining → tco → licm → strengthReduction → branchSimplification)
      │
      ▼
x86 instruction selection ──► x86 IR (virtual registers, no real reg assignment yet)
      │
      ▼
Register allocation (linear-scan) ──► x86 IR with real regs (rax, rbx, ..., r15)
      │
      ▼
NASM assembly emission ──► .asm file (text)
      │
      ▼
Either (a) NASM + linker ──► native binary ──► exec
   or (b) structured interpreter ──► run the .asm in a JS simulator
```

The first five stages are shared with the v2 VM and the WASM backend. The x86-specific part starts at "x86 instruction selection," which lowers the IR to x86 instructions operating on *virtual* registers (an unbounded set, named `%v0`, `%v1`, ...). The register allocator then maps virtual registers to real x86-64 registers (a 16-register file: rax, rbx, rcx, rdx, rsi, rdi, rbp, rsp, r8-r15), spilling to the stack when there aren't enough.

The output of `compileToNative(source)` is a string of NASM assembly. The output of `compileAndRunNative(source)` is the result of running the assembly via the structured interpreter (or, in Node, via NASM if available).

---

## 15.2 Instruction selection

The IR is target-independent; the x86 backend lowers each IR op to one or more x86 instructions. The lowering is straightforward:

| IR op | x86-64 |
| --- | --- |
| `Add(r, a, b)` | `mov r, a; add r, b` (or `lea r, [a + b]` if both are registers) |
| `Sub(r, a, b)` | `mov r, a; sub r, b` |
| `Mul(r, a, b)` | `mov r, a; imul r, b` |
| `Lt(r, a, b)` | `cmp a, b; setl rax; movzx r, al` |
| `Eq(r, a, b)` | `cmp a, b; sete rax; movzx r, al` |
| `JmpIf(cond, target)` | `test cond, cond; jnz target` |
| `Call(r, fn, args)` | `mov rdi, args[0]; mov rsi, args[1]; ...; call fn; mov r, rax` |
| `Return(v)` | `mov rax, v; ret` |

A few IR ops have non-obvious lowerings:

- **`MakeArray`** — call the runtime's `array_alloc(n)` to allocate, then store the elements with `mov [rax + 8 + i*8], elem_i`.
- **`MakeStruct`** — same pattern as `MakeArray`, but with a type tag at offset 0.
- **`MakeClosure`** — allocate a captures block, copy the captures in, return `{ fn_ptr, captures_offset }`.
- **`CallIndirect`** — load the function pointer from the closure, load the captures offset, push captures as the first argument, `call rax`.

The x86 backend uses the System V AMD64 calling convention (the Linux/macOS convention) — integer args in `rdi, rsi, rdx, rcx, r8, r9`, return in `rax`. This is the convention NASM uses by default; the structured interpreter simulates it.

---

## 15.3 Register allocation

The register allocator is a linear-scan allocator (the Poletto-Sarkar algorithm, simplified):

1. **Compute live intervals** for each virtual register: a `[start, end]` range over the IR's linear instruction sequence.
2. **Sort** the intervals by start.
3. **Walk** the intervals, assigning real registers. When a real register is free at the interval's start, use it; when not, spill the current interval to the stack.
4. **Spill slots** are tracked in a frame-allocated stack region (`rbp - 8 * spill_index`).

The allocator is conservative — it doesn't try to reuse stack slots across non-overlapping intervals (which would require a more sophisticated allocator). The cost is ~5-10% more stack usage than a perfect allocator; the benefit is ~500 lines of code vs. ~5000 for a graph-coloring allocator.

### Example: register allocation for a small function

```aether
fn add3(a: int, b: int, c: int) -> int {
  a + b + c
}
```

IR:

```
Add v0, a, b
Add v1, v0, c
Return v1
```

Live intervals: `a = [0, 0]`, `b = [0, 0]`, `c = [1, 1]`, `v0 = [1, 1]`, `v1 = [2, 2]`.

Allocation:
- `a` → `rdi` (the first argument).
- `b` → `rsi` (the second argument).
- `v0` = `a + b` → allocated to `rdi` (since `a` is dead after instruction 0).
- `c` → `rdx` (the third argument).
- `v1` = `v0 + c` → allocated to `rdi` (reused).
- Return `rdi` (which holds `v1`).

Emitted NASM:

```nasm
add3:
  add rdi, rsi        ; v0 = a + b (rdi was a, rsi was b)
  add rdi, rdx        ; v1 = v0 + c (rdi is reused, rdx is c)
  mov rax, rdi
  ret
```

Three instructions, no spills. A graph-coloring allocator would produce the same output here; the difference shows up only in larger functions with more pressure.

---

## 15.4 The structured interpreter

The structured interpreter is a JS function that takes NASM assembly (as a parsed AST of instructions, not raw text) and executes it, simulating x86-64 registers, flags, the stack, and memory. It exists because the browser sandbox forbids executing native machine code — even if we generated the bytes, we couldn't `mmap` them as executable. The structured interpreter is the workaround: it interprets the assembly, producing the same result a real x86-64 would.

The interpreter is structured (not a flat switch on opcodes) — each instruction is a small JS function, and the dispatch is a function-table lookup. The interpreter is ~800 lines of JS; it implements ~80 x86-64 instructions (the subset the codegen emits). Each instruction is one entry in the table; each takes the simulator state (registers, flags, memory) and updates it.

### Why not just use the bytecode VM?

Two reasons:

1. **Pedagogy.** The x86 backend's output is human-readable NASM. Users can see exactly what their Aether program compiles to. The bytecode VM's output is opaque bytecode — useful for execution but not for learning.
2. **IR portability proof.** The same IR lowers to WASM (binary) and to x86-64 (assembly). The x86 backend demonstrates that the IR is target-independent, which is a key design goal of v3.

The structured interpreter's speed is ~1.5x slower than the WASM backend (the WASM JIT runs circles around a JS interpreter of x86). For the playground, the WASM backend is the default; the x86 backend is opt-in for users who want to see the assembly.

See ADR-17 for the full argument for the structured interpreter (vs. requiring NASM or a WebAssembly-based assembler).

---

## 15.5 How to use `compileAndRunNative`

The public API is two functions in `aether/vm/x86/x86.ts`:

- `compileToNative(source: string, opts?: NativeOptions): string` — compile to NASM assembly text.
- `compileAndRunNative(source: string, opts?: NativeOptions): NativeRunResult` — compile and run via the structured interpreter (or, in Node with NASM installed, via the native path). Returns `{ output, error, value, asm }`.

### Example 1: hello world

```javascript
import { compileAndRunNative } from "aether/vm/x86";

const result = compileAndRunNative(`print("hello, world");`);
console.log(result.output);   // ["hello, world"]
console.log(result.asm);      // the NASM text (see below)
```

The `asm` field contains the generated NASM:

```nasm
section .text
global main

main:
  mov rdi, .str0         ; offset of "hello, world"
  call host_print
  mov rax, 0
  ret

section .data
.str0: db "hello, world", 0
```

### Example 2: arithmetic

```javascript
const result = compileAndRunNative(`
  let x = 1 + 2 * 3;
  print(x);
`);
console.log(result.output);   // ["7"]
```

After constant folding, the IR is just `LoadInt 7; CallBuiltin print`. The NASM:

```nasm
main:
  mov rdi, 7
  call host_print
  mov rax, 0
  ret
```

### Example 3: fib (the canonical benchmark)

```javascript
const result = compileAndRunNative(`
  fn fib(n: int) -> int {
    if n < 2 { n } else { fib(n - 1) + fib(n - 2) }
  }
  print(fib(10));
`);
console.log(result.output);   // ["55"]
console.log(result.elapsedMs);  // ~15ms (structured interpreter)
```

`fib(10)` is 55. The structured interpreter completes it in ~15ms; the WASM backend in ~10ms; the tree-walker in ~50ms. The fib(10) number is the canonical "did the x86 backend work" check.

### Example 4: calling convention

```javascript
const result = compileAndRunNative(`
  fn add(a: int, b: int) -> int { a + b }
  fn sub(a: int, b: int) -> int { a - b }
  print(add(3, 4));
  print(sub(10, 3));
`);
console.log(result.output);   // ["7", "7"]
```

The NASM for `add`:

```nasm
add:
  mov rax, rdi          ; a (first arg) is in rdi
  add rax, rsi          ; b (second arg) is in rsi
  ret
```

The caller passes `3` in `rdi` and `4` in `rsi`, calls `add`, reads the result from `rax`. This matches the System V AMD64 calling convention.

### Example 5: recursion

```javascript
const result = compileAndRunNative(`
  fn fact(n: int) -> int {
    if n <= 1 { 1 } else { n * fact(n - 1) }
  }
  print(fact(5));
`);
console.log(result.output);   // ["120"]
```

Recursion uses the x86 stack (`push rbp; mov rbp, rsp; sub rsp, N` prolog, `mov rsp, rbp; pop rbp; ret` epilog). Each `fact` call pushes a frame; the structured interpreter simulates the stack pointer.

### Example 6: arrays

```javascript
const result = compileAndRunNative(`
  let xs = [1, 2, 3, 4, 5];
  let mut sum = 0;
  let mut i = 0;
  while i < len(xs) {
    sum = sum + xs[i];
    i = i + 1;
  }
  print(sum);
`);
console.log(result.output);   // ["15"]
```

Arrays are allocated via `host_alloc` (the same host-call model as the WASM backend, see §14.3). `xs[i]` is `mov rax, [base + 8 + i*8]` — direct memory access, no bounds check (the borrow checker ensures `i` is in range at compile time).

### Example 7: structs

```javascript
const result = compileAndRunNative(`
  struct Point { x: int, y: int }
  let p = Point { x: 3, y: 4 };
  print(p.x * p.x + p.y * p.y);
`);
console.log(result.output);   // ["25"]
```

Struct fields are accessed by offset: `p.x` is `[p + 0]`, `p.y` is `[p + 8]`. The offsets are computed by the codegen from the struct's field layout (each field is 8 bytes, padded to i64).

### Example 8: closures

```javascript
const result = compileAndRunNative(`
  fn make_adder(n: int) -> fn(int) -> int {
    fn(x: int) -> int { x + n }
  }
  let add5 = make_adder(5);
  print(add5(7));
`);
console.log(result.output);   // ["12"]
```

Closures are represented as `{ fn_ptr, captures_offset }` (a 16-byte value, two 8-byte fields). `make_adder` allocates a captures block containing `n`, returns the closure. `add5(7)` calls the function pointer with `7` in `rdi` and the captures offset in `rsi`.

### Example 9: the trait system

```javascript
const result = compileAndRunNative(`
  trait Show { fn show(self) -> string; }
  struct Point { x: int, y: int }
  impl Show for Point {
    fn show(self) -> string {
      "Point(" + str(self.x) + ", " + str(self.y) + ")"
    }
  }
  let p = Point { x: 1, y: 2 };
  print(p.show());
`);
console.log(result.output);   // ["Point(1, 2)"]
```

Trait method calls are direct calls (monomorphised). `p.show()` becomes `call Point__show(p_offset)` — a direct call, no vtable.

### Example 10: known quirk — match on float returns 0

```javascript
const result = compileAndRunNative(`
  fn classify(x: float) -> int {
    match x {
      0.0 => 1,
      _ => 2,
    }
  }
  print(classify(3.14));
`);
console.log(result.output);   // ["0"]  (QUIRK: should be 2)
```

This is the documented quirk: the x86 backend's match-on-float lowering has a bug where the comparison `x == 0.0` succeeds for all floats (the `ucomisd` flags aren't read correctly). The fix is on the v3.1 roadmap; for now, programs that match on floats should use `if`/`else` chains instead. See `aether/vm/x86/x86.test.ts` for the test that documents this.

---

## 15.6 The structured interpreter's correctness

The structured interpreter must produce the same result as a real x86-64 would for every program the codegen emits. The test suite (`aether/vm/x86/x86.test.ts`, ~50 tests) covers every instruction the codegen uses. The known failure is the match-on-float quirk (Example 10).

For programs that *don't* use the quirky path, the structured interpreter and a real x86-64 agree. The tree-walker and the structured interpreter also agree on the 13/15 canonical examples; the two exceptions are the same as for the v2 VM (the match-on-float quirk and one other).

---

## 15.7 Limitations

- **No `unsafe`.** The borrow checker runs before codegen, so `unsafe` blocks would need a separate code path. Future v3.1.
- **No `eval`.** The structured interpreter is closed; you can't add new functions at runtime.
- **Match-on-float quirk.** See Example 10. Workaround: use `if`/`else` for float comparisons.
- **No inline assembly.** Aether doesn't expose an `asm!` macro; the assembly is generated by the codegen, not user-controlled.
- **No vector instructions.** The codegen emits only scalar x86-64; SSE/AVX for SIMD is a future item.
- **Step limit.** The structured interpreter has a fuel budget (default 100M instructions); raising it via `RunOptions.maxFuel` is supported.

---

## 15.8 Summary

- The **x86 backend** compiles Aether to x86-64 NASM assembly via the same IR as the v2 VM and the WASM backend.
- **Instruction selection** lowers each IR op to one or more x86-64 instructions, using the System V AMD64 calling convention.
- **Register allocation** is linear-scan: ~500 lines of code, ~5-10% more stack usage than a graph-coloring allocator.
- The **structured interpreter** is a JS simulator of x86-64 (registers, flags, stack, memory) that runs the NASM in the browser sandbox. ~800 lines, ~80 instructions.
- The **public API** is `compileToNative(source)` (returns NASM text) and `compileAndRunNative(source)` (returns `{ output, error, value, asm }`).
- The **speedup** over the tree-walker is ~3x (the structured interpreter is ~1.5x slower than the WASM backend); the fib(10) benchmark runs in ~15ms.
- **Limitations**: no `unsafe`, no `eval`, match-on-float quirk (returns 0 — known bug, on the v3.1 roadmap). Step limit configurable.

The next chapter (Chapter 16) covers self-hosting — the Aether-in-Aether bootstrap that uses the x86 backend as the "real" execution substrate.
