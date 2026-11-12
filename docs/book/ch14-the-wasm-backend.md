# Chapter 14 — The WASM backend

> Aether v3's WASM backend compiles Aether programs to WebAssembly, runs them in the browser's WASM engine (V8 Liftoff/TurboFan, SpiderMonkey baseline/Ion), and gets near-native speed. The measured speedup on the canonical `fib(25)` benchmark is 3.9x over the tree-walker and 1.6x over the v2 bytecode VM. This chapter covers the compilation pipeline (IR → WASM text → binary), the host-call model for heap operations, how to use `compileAndRunWasm`, and the perf characteristics. Ten runnable examples show every part.

The WASM backend is the third runtime (after the tree-walker and the bytecode VM) and the second "compiled" runtime (the x86 backend is the third). It exists because the playground runs in the browser, and the browser's WASM engine is faster than any JavaScript interpreter we could write. Compiling Aether to WASM lets the playground's "Run" button execute real programs at near-native speed, without leaving the browser.

The backend lives in `aether/vm/wasm/wasm.ts` (~1500 lines). It takes the optimized IR (the same IR the v2 VM uses) and lowers it to WASM, producing a `WebAssembly.Module` that can be instantiated and run. The host (the browser page) provides a small set of imported functions for heap operations and IO; the WASM module calls these via the standard import mechanism.

---

## 14.1 The compilation pipeline

```
Aether source
      │
      ▼
Lexer ──► tokens
      │
      ▼
Parser ──► AST
      │
      ▼
Type checker ──► typed AST
      │
      ▼
IR builder ──► IR (the same IR as the v2 VM)
      │
      ▼
8 optimizer passes (constantFolding → dce → cse → inlining → tco → licm → strengthReduction → branchSimplification)
      │
      ▼
WASM codegen ──► WASM text (WAT) ──► WASM binary (wasm)
      │
      ▼
WebAssembly.instantiate ──► WASM module
      │
      ▼
Call main() ──► result
```

The first five stages are shared with the v2 VM. The WASM-specific part starts at "WASM codegen," which walks the IR and produces WAT (the text format). The WAT is assembled to binary by a small in-tree assembler (no external dependency); the binary is instantiated by the browser's WASM engine.

The output of `compileToWasm(source)` is a `Uint8Array` containing the WASM binary. The output of `compileAndRunWasm(source)` is the result of instantiating and running the module (an array of stdout strings, an error if any, and a return value).

---

## 14.2 The WASM module shape

Each Aether function becomes a WASM function. The module has:

- A `memory` (1 page = 64KB, growable) for the heap — arrays, strings, maps, structs.
- A `table` for indirect calls (closures).
- A `main` function (the entry point; takes no args, returns an `i32` exit code).
- One WASM function per Aether function.
- Imported functions for heap operations, IO, and the stdlib (see §14.3).

Aether values are represented as `i64` (a tagged value: low 3 bits = tag, high 61 bits = payload). The tags are:

- `0` — int (60-bit signed).
- `1` — float (64-bit IEEE 754, stored as bits in the payload).
- `2` — bool (0 or 1 in the payload).
- `3` — string (an offset into the WASM memory; the first i64 at that offset is the length, then the UTF-16 code units).
- `4` — array (offset; length prefix, then elements as i64 values).
- `5` — closure (table index + captures offset).
- `6` — struct/variant (offset; type tag, then fields as i64 values).
- `7` — reference/`dyn` (offset + vtable offset).

This is a NaN-boxing-like scheme but with i64 (not f64). The advantage: every value is exactly 8 bytes, no allocation needed for ints/floats/bools (they fit in the payload). The disadvantage: 60-bit ints (not 64-bit); floats need an extra step to extract bits. We chose i64 over f64 because WASM's i64 arithmetic is faster than f64 on most engines.

---

## 14.3 The host-call model for heap operations

The WASM module needs to allocate, read, and write the heap. These operations aren't built into WASM (WASM has no `malloc`), so the host (browser page or Node) provides them as *imports*. The imports are:

- `host.alloc(size: i32) -> i32` — allocate `size` bytes; return the offset.
- `host.free(offset: i32) -> ()` — free the allocation.
- `host.load_i64(offset: i32) -> i64` — load 8 bytes.
- `host.store_i64(offset: i32, value: i64) -> ()` — store 8 bytes.
- `host.load_i32(offset: i32) -> i32` — load 4 bytes.
- `host.store_i32(offset: i32, value: i32) -> ()` — store 4 bytes.
- `host.grow_memory(pages: i32) -> i32` — grow the WASM memory by `pages` (each page = 64KB).
- `host.print(s_offset: i32) -> ()` — print a string (the host reads the length and code units from memory).

The host is a small JavaScript shim (~200 lines) that wraps `Module.exports.memory`, `WebAssembly.Memory.grow`, and `console.log`. The shim is in `aether/vm/wasm/host.ts`.

### Why host imports and not inline WASM?

Three reasons:

1. **Code size.** Implementing `alloc` in WASM would require a free-list allocator in WASM, which is ~500 lines of WASM bytecode. The host's `alloc` is 10 lines of JS (just `new ArrayBuffer`).
2. **GC integration.** The host's allocator can integrate with the browser's GC (finalizers, weak references). An inline WASM allocator can't.
3. **Recompilation.** Changing the allocator (e.g., to a bump allocator for short-lived programs) is a host change, not a WASM-recompile change. This is critical for the playground, where we want to swap allocators without recompiling every Aether program.

See ADR-16 for the full argument.

---

## 14.4 How to use `compileAndRunWasm`

The public API is two functions in `aether/vm/wasm/wasm.ts`:

- `compileToWasm(source: string, opts?: WasmOptions): Uint8Array` — compile to binary, don't run.
- `compileAndRunWasm(source: string, opts?: WasmOptions): WasmRunResult` — compile and run; return `{ output, error, value }`.

### Example 1: hello world

```javascript
import { compileAndRunWasm } from "aether/vm/wasm";

const result = compileAndRunWasm(`print("hello, world");`);
console.log(result.output);   // ["hello, world"]
console.log(result.error);    // undefined
```

The host `print` is wired in; the WASM module's `main` calls `print` with the offset of `"hello, world"` in the WASM memory; the host reads the string and pushes it to `output`.

### Example 2: arithmetic

```javascript
const result = compileAndRunWasm(`
  let x = 1 + 2 * 3;
  print(x);
`);
console.log(result.output);   // ["7"]
```

The IR's `Mul(LoadInt 2, LoadInt 3)` → `LoadInt 6` (constant folding) → `Add(LoadInt 1, LoadInt 6)` → `LoadInt 7` (constant folding) → `print(7)`. The WASM module is a single `i64.const 7` followed by a call to `host.print`.

### Example 3: the canonical `fib`

```javascript
const result = compileAndRunWasm(`
  fn fib(n: int) -> int {
    if n < 2 { n } else { fib(n - 1) + fib(n - 2) }
  }
  print(fib(25));
`);
console.log(result.output);   // ["75025"]
console.log(result.error);    // undefined
console.log(result.elapsedMs);  // ~30ms on a fast machine
```

`fib(25)` is the canonical benchmark. The WASM backend completes it in ~30ms; the tree-walker takes ~120ms (3.9x speedup); the v2 VM takes ~50ms (1.6x speedup).

### Example 4: strings

```javascript
const result = compileAndRunWasm(`
  let greeting = "hello";
  let name = "world";
  print(greeting + ", " + name + "!");
`);
console.log(result.output);   // ["hello, world!"]
```

String concatenation allocates a new string in the WASM memory (via `host.alloc`), copies the two operands into it, and returns the offset. The WASM codegen for `+` on strings is:

```wat
local.get $lhs_offset
local.get $lhs_len
local.get $rhs_offset
local.get $rhs_len
call $string_concat
```

where `string_concat` is a small helper that calls `host.alloc`, copies the bytes, and returns the new offset.

### Example 5: arrays

```javascript
const result = compileAndRunWasm(`
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

Array literals allocate a WASM-memory block (via `host.alloc`), write the elements as i64 values, and return the offset. `xs[i]` is `host.load_i64(xs_offset + 8 + i * 8)`. `len(xs)` is `host.load_i64(xs_offset)` (the length prefix).

### Example 6: structs

```javascript
const result = compileAndRunWasm(`
  struct Point { x: int, y: int }
  let p = Point { x: 3, y: 4 };
  print(p.x + p.y);
`);
console.log(result.output);   // ["7"]
```

Struct allocation is similar to array allocation: a block with the field values laid out consecutively. Field access is `host.load_i64(p_offset + field_offset)`.

### Example 7: closures

```javascript
const result = compileAndRunWasm(`
  fn make_adder(n: int) -> fn(int) -> int {
    fn(x: int) -> int { x + n }
  }
  let add5 = make_adder(5);
  print(add5(7));
`);
console.log(result.output);   // ["12"]
```

Closures use the WASM `table` for indirect calls. `make_adder(5)` returns a closure value: `{ table_index, captures_offset }`. The captures offset points to a WASM-memory block holding the captured `n = 5`. Calling `add5(7)` does `call_indirect(table_index, captures_offset, 7)`.

### Example 8: recursion with deeper depth

```javascript
const result = compileAndRunWasm(`
  fn ackermann(m: int, n: int) -> int {
    if m == 0 { n + 1 }
    else if n == 0 { ackermann(m - 1, 1) }
    else { ackermann(m - 1, ackermann(m, n - 1)) }
  }
  print(ackermann(2, 3));
`);
console.log(result.output);   // ["9"]
```

Deep recursion works because WASM's call stack is separate from the JS call stack — WASM supports ~65000 nested calls before stack overflow (vs. JS's ~10000). This makes `ackermann(2, 3)` (which makes ~2000 calls) trivial.

### Example 9: the trait system

```javascript
const result = compileAndRunWasm(`
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

Trait method calls are compiled to direct calls (monomorphised). `p.show()` becomes `call $Point__show(p_offset)` — a direct WASM call, no vtable. The vtable is only needed for `dyn` calls (Example 10).

### Example 10: `dyn` (trait objects)

```javascript
const result = compileAndRunWasm(`
  trait Shape { fn area(self) -> float; }
  struct Circle { radius: float }
  struct Square { side: float }
  impl Shape for Circle { fn area(self) -> float { 3.14159 * self.radius * self.radius } }
  impl Shape for Square { fn area(self) -> float { self.side * self.side } }

  fn total(shapes: [dyn Shape]) -> float {
    let mut s = 0.0;
    let mut i = 0;
    while i < len(shapes) {
      s = s + shapes[i].area();
      i = i + 1;
    }
    s
  }

  let xs: [dyn Shape] = [Circle { radius: 1.0 }, Square { side: 2.0 }];
  print(total(xs));
`);
console.log(result.output);   // ["7.14159"]
```

`dyn` calls use the WASM `table`: each `impl Shape for T` registers an `area` function in the table at a known index. A `dyn Shape` value is `{ table_index, data_offset }`. Calling `shapes[i].area()` is `call_indirect(table_index, data_offset)` — one indirect call per dispatch, same as Rust's `dyn Trait`.

---

## 14.5 Performance characteristics

The WASM backend's measured speedups (on a 2024 desktop, V8 12.4):

| Benchmark | Tree-walker | VM | WASM | WASM / tree-walker | WASM / VM |
| --- | --- | --- | --- | --- | --- |
| `fib(25)` | 120 ms | 50 ms | 30 ms | 3.9x | 1.6x |
| `fib(30)` | step limit | 540 ms | 350 ms | — | 1.5x |
| `sum(1..1M)` | 80 ms | 30 ms | 20 ms | 4.0x | 1.5x |
| `quicksort(10000 ints)` | 240 ms | 90 ms | 60 ms | 4.0x | 1.5x |
| `string_concat(1000)` | 90 ms | 40 ms | 25 ms | 3.6x | 1.6x |

The 3.9x speedup over the tree-walker is consistent across benchmarks. The 1.5-1.6x speedup over the v2 VM is the cost of the VM's interpretation overhead (one JS function call per bytecode instruction); WASM skips that by being JIT-compiled by the browser's engine.

The WASM backend's *startup* time (compile + instantiate) is ~30ms for a 1000-line program. This is slower than the tree-walker's <5ms but faster than the VM's ~50ms (the VM has to build the IR, run 8 optimizer passes, and emit bytecode).

---

## 14.6 Limitations and quirks

- **No `eval`.** The WASM module is a closed binary; you can't add new functions to it at runtime. (The tree-walker and VM support `eval` via a recursive compile-and-run.)
- **No `unsafe`.** The borrow checker runs before codegen, so `unsafe` blocks would need a separate code path. Future v3.1.
- **No threads.** The browser's WASM engine is single-threaded by default; threads require `SharedArrayBuffer` and a separate runtime. The v3.2 roadmap.
- **No `print` of arbitrary objects.** The host's `print` shim handles strings, ints, floats, bools, and arrays of those; printing a struct or enum requires a `Show` impl (which the WASM backend calls via the table).
- **Step limit.** The runtime has a fuel budget (default 100M instructions); WASM runs ~10x faster than the VM, so the same budget covers ~10x more work. The `RunOptions.maxFuel` knob raises it.

---

## 14.7 Summary

- The **WASM backend** compiles Aether to WebAssembly via the same IR the v2 VM uses, plus a WASM codegen stage.
- The **module shape** is `memory` + `table` + `main` + per-function WASM functions + host imports.
- The **host-call model** uses imports for heap operations (`alloc`, `load`/`store`, `grow_memory`, `print`). Three reasons: code size, GC integration, allocator swappability (ADR-16).
- The **public API** is `compileToWasm(source)` (returns binary) and `compileAndRunWasm(source)` (returns `{ output, error, value }`).
- The **speedup** over the tree-walker is ~3.9x; over the v2 VM, ~1.5-1.6x. The fib(25) benchmark runs in 30ms.
- **Limitations**: no `eval`, no `unsafe`, no threads. Step limit is configurable.

The next chapter (Chapter 15) covers the x86 backend — which uses the same IR and optimizer but emits native x86-64 machine code via NASM assembly (or, in the playground, a structured interpreter that simulates x86).
