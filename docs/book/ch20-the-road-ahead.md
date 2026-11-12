# Chapter 20 — The road ahead

> Aether v3 closes with 4 runtimes, 25 packages, 27 stdlib modules, 92 examples, 3 real apps, a Python compiler port, and a 37.6K-word formal corpus. This chapter looks forward: v3.1 and beyond. The plan is honest about what's next, what's speculative, and what's deliberately *not* on the v3.1 critical path. The headline items are bytecode-level async suspend/resume, ARM64 and RISC-V native backends, a tiered JIT, the package registry, the next four language ports (Ruby, Lua, Scheme, and a second-pass Aether), mechanized proofs in Lean4, and the long-term goal of self-replication. Ten runnable examples sketch features that don't exist yet, marked as such.

Aether v3 is the end of "v3 the language" — the milestone where the trait system, the borrow checker, the async coroutines, the four runtimes, and the 25-package ecosystem all meet and ship on a live playground. The next milestone is v3.1: filling the gaps v3 deliberately left open. Then v4 — a multi-year horizon where the language is its own bootstrap, the proofs are mechanized, and the package registry is real.

This chapter is the long view. Where Chapter 19 was "what we built," this is "what we build next, and why, and how." Each section is one planned change, one piece of the v3.1+ roadmap, with a runnable sketch where the feature is small enough to sketch. The sketches are marked **`// v3.1 — speculative`** to make clear they're not yet implemented.

---

## 20.1 The v3.1 milestone — bytecode-level async suspend/resume

The biggest v3.1 change is moving async off JS Promises onto the bytecode VM's own suspend/resume. ADR-13 (and the v2 design) chose JS Promises because they exist, are debugged, and integrate with the host's microtask queue. The cost is that Aether's async isn't *Aether* — it's a thin wrapper around JS. That means async code can't run on the WASM backend, can't run on the x86 backend, and can't run on the bytecode VM in pure-Aether mode (the VM relies on the host's event loop).

v3.1 adds two new opcodes to the bytecode VM: `Op.Suspend` and `Op.Resume`. A `Suspend` captures the frame (registers, IP, captures, operand stack pointer) into a heap-allocated *frame object*, hands it to the executor, and returns control. A `Resume` re-hydrates the frame and continues. This is the same design sketched in RFC-002 §3.6; v3.1 actually implements it.

### Example 1: an async function, v3.1 style

```aether
// v3.1 — speculative
async fn fetch_user(id: int) -> User {
  let row = await query_db("SELECT * FROM users WHERE id = " + str(id));
  User { id: row.id, name: row.name }
}

async fn main() -> () {
  let u1 = fetch_user(1);
  let u2 = fetch_user(2);
  let both = await join([u1, u2]);
  print(both[0].name);
  print(both[1].name);
}
```

The `async` keyword lowers the function to a state machine: each `await` is a potential suspend point. The compiled bytecode is a sequence of blocks; each block ends with either a normal instruction or a `Suspend` that hands control to the executor with a continuation pointer. The state machine has no heap-allocated `Promise` — just a frame object that the executor owns.

The payoff: async now runs on the WASM backend (the WASM module has its own `suspend`/`resume` builtins) and on the x86 backend (the native code has its own). And the playground's "async demo" no longer depends on JS — it's pure Aether.

The cost: the executor, the scheduler, the channel implementation, and the `select`/`join`/`race`/`timeout` primitives all need rewriting on top of the new primitive. ADR-20 outlines the design.

---

## 20.2 The v3.1 milestone — ARM64 native backend

The x86 backend (Chapter 15) lowers Aether IR to NASM assembly and runs it via a structured interpreter (because the sandbox can't shell out to `nasm`). The ARM64 backend (RFC-009) does the same for ARM64 — the ISA used by Apple Silicon, by AWS Graviton, by every modern Android phone, and by every Raspberry Pi 3+.

ARM64 matters because the playground's audience increasingly runs on Apple Silicon, and because the server market is shifting to Graviton. An Aether that compiles to ARM64 in the browser and runs near-native speed on Apple Silicon is a real differentiator.

The ARM64 backend shares the IR-building, optimizer, and instruction-selection framework with the x86 backend. The new work is the register file (ARM64 has 31 GP registers vs x86-64's 16), the calling convention (ARM64 uses r0–r7 for arguments, r9–r15 for temporaries, r19–r28 for callee-saved), and the instruction encoding (a fixed 32-bit format that's simpler than x86's variable-length).

### Example 2: an ARM64-shaped trace

```aether
// v3.1 — speculative
fn add(a: int, b: int) -> int { a + b }
print(add(2, 3));
```

The compiled ARM64 (sketch, not real assembly):

```
add:
  mov r0, r1       ; a
  mov r1, r2       ; b
  add r0, r0, r1   ; a + b → r0
  ret
```

vs the x86 version:

```
add:
  mov rax, rdi    ; a
  add rax, rsi    ; a + b → rax
  ret
```

Same instruction count, but ARM64's register pressure is higher (more registers = less spilling). The structured-interpreter approach (ADR-17) is unchanged: the sandbox can't shell out to `as`/`ld` either, so the ARM64 backend, like the x86 backend, uses a structured interpreter that simulates the ARM64 machine.

The expected speedup over the v2 VM on ARM64 hardware is ~3-4x (same as the x86 backend's measured 3.5x). On non-ARM64 hardware (running on an x86 laptop), the ARM64 backend is for *cross-compilation*: the user compiles to ARM64, downloads the binary, runs it on their Pi or Graviton.

---

## 20.3 The v3.1 milestone — RISC-V native backend

RISC-V (RFC-010) is the third native backend. The motivation is different from x86 and ARM64: those are pragmatic (the playground's users run on those ISAs). RISC-V is principled — it's the open ISA, the one anyone can implement, the one being adopted by academia and by emerging markets (SiFive, the RISC-V International ecosystem). An Aether that compiles to RISC-V is a hedge against the closed-ISA future.

The RISC-V backend is also the cleanest target: the ISA is small (the base RV32I is 37 instructions), regular (fixed 16/32-bit encoding), and well-documented. The implementation is smaller than the x86 or ARM64 backends.

### Example 3: a RISC-V-shaped trace

```aether
// v3.1 — speculative
fn fib(n: int) -> int { if n < 2 { n } else { fib(n - 1) + fib(n - 2) } }
print(fib(10));
```

The compiled RISC-V (sketch):

```
fib:
  li t0, 2
  blt a0, t0, .base     ; if n < 2, jump to base
  addi sp, sp, -16
  sd ra, 0(sp)
  sd s0, 8(sp)
  mv s0, a0
  addi a0, s0, -1
  call fib
  mv t1, a0
  addi a0, s0, -2
  call fib
  add a0, t1, a0
  ld ra, 0(sp)
  ld s0, 8(sp)
  addi sp, sp, 16
  ret
.base:
  ret
```

Same fib(10) = 55 as every other backend. The structured interpreter runs it on a simulated RISC-V core. On real RISC-V hardware (a SiFive board, a VisionFive 2), the binary runs natively.

The RISC-V backend is the *teaching* backend. The ISA's regularity makes the instruction selection almost mechanical; the small register file (16 GP registers) makes register allocation a textbook linear-scan. The RISC-V backend is the one we'd hand to a student who wanted to learn native codegen.

---

## 20.4 The v3.2 milestone — the JIT

The JIT (RFC-011) is the long-running performance bet. The motivation: the v2 VM is 10x faster than the tree-walker, the WASM backend is 1.6x faster than the VM, the x86 backend is 3.5x faster than the VM — but native code (a real AOT compiler) is still 2-3x faster than the structured interpreter. A JIT closes the gap by compiling hot functions to native x86 in-memory, on the fly.

The design is tiered: tier 0 is the v2 VM (interpret); tier 1 is the structured interpreter (Chapter 15's approach, but with a hot-function profiler); tier 2 is the JIT (compile tier-1 hot functions to real x86 in a memory page, mark it executable, jump to it).

### Example 4: a JIT-compiled loop

```aether
// v3.2 — speculative
fn sum(n: int) -> int {
  let mut total = 0;
  let mut i = 0;
  while i < n {
    total = total + i;
    i = i + 1;
  };
  total
}
print(sum(1_000_000));
```

The v2 VM runs this in ~80ms (10M fuel). The structured interpreter runs it in ~25ms. The JIT, after `sum` is detected hot (called >100 times or running >10K fuel), compiles it to:

```
sum:
  mov rax, 0           ; total = 0
  mov rcx, 0           ; i = 0
.loop:
  cmp rcx, rdi         ; i < n?
  jge .done
  add rax, rcx         ; total += i
  add rcx, 1           ; i += 1
  jmp .loop
.done:
  ret
```

The JIT version runs in ~3ms — 8x faster than the structured interpreter, ~25x faster than the v2 VM. The JIT supports deopt: if a type assumption (e.g., "n is always int") is violated, the JIT falls back to the structured interpreter and re-compiles with the new assumption. The deopt table is a side-table that maps each JIT-compiled instruction to the structured-interpreter IP that resumes it.

The JIT is the v3.2 critical path. The ARM64 and RISC-V backends come first (v3.1) because they're more impactful (more users on ARM64 than on JIT-needed hot loops). The JIT is the v3.2 capstone.

---

## 20.5 The v3.2 milestone — the package registry

The 25 packages (Chapter 17) live in the Aether repo. There's no registry, no `aether install`, no version resolution, no published-vs-local distinction. That's fine for v3 — the packages are part of the language. It's not fine for v3.2, where we want third-party packages.

The package registry (RFC-012) is a server that hosts `.ae` source files plus `aether.toml` manifests. The `aether` CLI gets an `aether install` command that resolves a package, downloads it, and adds it to `aether.toml`. Version resolution is Cargo-style (SemVer with a `^` default).

### Example 5: a registry-shaped workflow

```bash
# v3.2 — speculative
$ aether init myproject
Created myproject/
  myproject/main.ae
  myproject/aether.toml

$ cd myproject
$ aether install aether-http@0.4.2
Added aether-http 0.4.2 to aether.toml
  Downloaded aether-http 0.4.2 (12.3 KB)
  Resolved 3 dependencies: aether-string, aether-result, aether-bytes

$ aether run main.ae
Server listening on http://localhost:3000
```

The registry server is a thin HTTP API: `GET /packages/<name>` returns the manifest; `GET /packages/<name>/<version>` returns the source tarball; `POST /packages` publishes (with auth). The server is implemented in Aether itself (using the v3 web-framework app, Chapter 19), which is the kind of self-application that proves the language is real.

The registry is *not* a package *manager* — it doesn't run build scripts, doesn't have post-install hooks, doesn't have a Turing-complete config language. A package is a directory of `.ae` files plus an `aether.toml`. The CLI copies the files into the local `.aether/` cache and adds the path to the import resolver. Simple, auditable, no surprises.

---

## 20.6 The v3.3 milestone — five-language ports

The Python port (Chapter 16, the bootstrap) is the first "self-application": a real compiler (lexer + parser for Python, written in Aether) that runs on Aether. The next four ports are:

- **Ruby** — the second port. Ruby's grammar is more complex than Python's (heredocs, regex literals, the `END { }` block, the various string-interpolation forms), but the AST shape is similar. The goal: a `ruby2ae` transpiler that takes a Ruby script and produces an Aether program with the same semantics, runnable on the v3 VM.
- **Lua** — the third port. Lua is small (the grammar is 50 productions), the semantics are simple (one data structure: the table), and the goal is *embedding*: Aether as a Lua replacement for game scripting, with a real type system.
- **Scheme** — the fourth port. Scheme is the Lisp of the set; the goal is to demonstrate that Aether's AST is a good host for a Lisp-style language (s-expressions, tail calls, call/cc). The Scheme port includes a `call/cc`-to-Aether lowering that uses the v3.1 suspend/resume (§20.1).
- **Aether → Aether (second pass)** — the fifth port is the bootstrap done right. The first bootstrap (Chapter 16) is a lexer + AST + parser written in Aether. The second pass is the *full* compiler — type checker, IR builder, optimizer, codegen — written in Aether. This is the milestone where Aether stops depending on the TypeScript host compiler and becomes self-hosting.

### Example 6: a Ruby-to-Aether sketch

```ruby
# ruby input
def fib(n)
  n < 2 ? n : fib(n-1) + fib(n-2)
end
puts fib(10)
```

```aether
// Aether output
fn fib(n: int) -> int {
  if n < 2 { n } else { fib(n - 1) + fib(n - 2) }
}
print(fib(10));
```

The transpiler is ~2000 LOC of Aether. It reads Ruby, produces an Aether AST, and emits Aether source. The Ruby grammar is parsed with the v3 `aether-parser` package (Chapter 17). The transpiler is the second self-application: it's a real compiler, written in Aether, running on Aether, producing Aether.

---

## 20.7 The v3.3 milestone — mechanized proofs

The formal semantics corpus (Chapter 18, 37.6K words) is *prose*. The 10 proof outlines are sketches — the lemmas are stated, the cases are listed, but the proofs are "this case is by induction on the typing derivation; the other cases are similar." That's honest: prose proofs are how most PL papers are written. But they're not *machine-checked*. A mistake in the prose (an omitted case, an induction that doesn't quite go through) wouldn't be caught.

The mechanization (RFC-013) is the v3.3 milestone: translate the 10 proof outlines into Lean4 (preferred for the modern tooling) or Coq (preferred for the existing library). The goal is *not* to mechanize the whole language — that's a multi-year project. The goal is to mechanize the three core theorems: type preservation (proof 01), progress (proof 02), and borrow safety (proof 03).

### Example 7: a Lean4 sketch of progress

```lean
-- v3.3 — speculative
inductive AetherType where
  | int : AetherType
  | float : AetherType
  | bool : AetherType
  | string : AetherType
  | arrow : AetherType → AetherType → AetherType

inductive AetherValue where
  | int : Int → AetherValue
  | float : Float → AetherValue
  | bool : Bool → AetherValue
  | string : String → AetherValue
  | closure : AetherType → AetherType → AetherExpr → AetherValue

theorem progress :
  ∀ Γ e τ, Γ ⊢ e : τ → (is_value e ∨ ∃ e', step e e')
  := by
    intros Γ e τ H
    induction H
    -- ~12 cases, each by either Disj.left (it's a value)
    -- or Disj.right (it steps)
    sorry  -- the actual proof
```

The `sorry` is a placeholder. The v3.3 milestone is to replace each `sorry` with a real Lean4 proof. The borrow-safety proof (proof 03) is the hardest — the borrow rules are non-syntactic (they involve a borrow graph), and the proof needs an inductive invariant that the borrow graph is well-formed.

Mechanization is the longest of the v3.x milestones — 6-12 months of focused work. It's the "v3 done right" milestone: the moment when the formal semantics stop being prose and become machine-checked.

---

## 20.8 The v4 milestone — self-replication

The long horizon is *self-replication*: the Aether compiler is written in Aether, compiled by the Aether compiler, and runs on the Aether VM. The bootstrap (Chapter 16) is the first step (lexer + parser); the second-pass Aether port (§20.6) is the second step (full compiler). Self-replication is the third step: the Aether compiler *compiles itself* and produces a binary that's identical to the binary the TypeScript host compiler produces.

### Example 8: the self-replication test

```bash
# v4 — speculative
$ aether build aether-compiler.ae -o aether-self.bin
Wrote aether-self.bin (1.2 MB)

$ aether-self.bin build aether-compiler.ae -o aether-self2.bin
Wrote aether-self2.bin (1.2 MB)

$ diff aether-self.bin aether-self2.bin
# (no output — identical)
```

If the two binaries are byte-identical, the bootstrap is *closed*: the Aether compiler is its own compiler. This is the Wilkinson milestone (named after the early bootstrap work). It's a multi-year project. The challenges:

- The IR builder, the optimizer, and the codegen have to be written in Aether. Each is ~1000 LOC of TypeScript; the Aether version is similar (Aether and TypeScript are similar in expressiveness).
- The stdlib has to be sufficient to implement a compiler — file IO, string manipulation, hash maps, sorted maps. The v3 stdlib is mostly there (27 modules, 566 functions); the v3.1 stdlib needs to fill the gaps (proper file IO, byte buffers, codepoint-correct strings).
- The cross-compiler has to be deterministic — same input, same output, byte-for-byte. The current TypeScript compiler is *not* deterministic (it uses `Map` iteration order, which is insertion order in V8 but unspecified in the spec). The Aether version has to be deterministic.

The self-replication milestone is v4 — beyond the horizon of this chapter. But the work to get there starts in v3.1 (the second-pass Aether port) and continues through v3.x. Each milestone is a step: lexer (v3, done), parser (v3, done), type checker (v3.x), IR builder (v3.x), optimizer (v3.x), codegen (v3.x), self-replication (v4).

---

## 20.9 The non-goals — what v3.x deliberately *doesn't* do

A roadmap is as much about what's *not* on it as what is. The deliberate non-goals for v3.x:

- **No GPU backend.** GPUs are a research project (CUDA, ROCm, Metal — each is its own compiler). Aether v3.x stays on CPU. A GPU backend is a v5+ item, if ever.
- **No full kernel-level async (epoll/io_uring).** The v3.1 async (§20.1) is user-space cooperative. Kernel-level async (epoll, io_uring, IOCP) is the v4 item, after the package registry and the JIT.
- **No macros.** Aether v3.x has no `macro_rules!`, no procedural macros, no compile-time metaprogramming. The `#[derive]` attribute is a hard-coded compiler pass, not a macro. Real macros are a v4 item — the design space is large (Rust-style, Lisp-style, Scheme-style) and the choice has long-term consequences.
- **No FFI beyond `unsafe` calls.** The v3 `unsafe` mechanism (RFC-004, post-borrow-checker) lets you call out to the host (e.g., `print`, `setTimeout`). It doesn't let you call C libraries, link to .so/.dll files, or bind to system headers. Real FFI (cffi, ctypes) is a v4 item.
- **No incremental compilation.** The v3 compiler is whole-program. A 1000-line file compiles in ~50ms; a 10K-line file compiles in ~500ms. Incremental compilation (a la Rust's `r-ls` or the new `rust-analyzer`) is a v4 item, dependent on the LSP (RFC-007) maturing first.

Each of these is a deliberate scope choice. Aether v3 is a research language that demonstrates a coherent set of features (4 runtimes, traits, borrow checker, async, packages, formal semantics). Adding macros + FFI + incremental + GPU would make v3 *less* coherent, not more.

---

## 20.10 A runnable v3.1 sketch — what v3 looks like today, and what v3.1 will look like

```aether
// v3 — today (works in the playground)
fn fib(n: int) -> int { if n < 2 { n } else { fib(n - 1) + fib(n - 2) } }

print(fib(10));                          // 55, tree-walker
print(compileToVm(fib 15));              // 610, v2 VM
print(compileAndRunWasm(fib 10));        // 55, WASM backend
print(compileAndRunNative(fib 10));      // 55, x86 backend
```

```aether
// v3.1 — speculative
async fn fetch(url: string) -> string { /* suspend/resume, not JS Promise */ }
let body = await fetch("https://example.com");
print(body);

// v3.1 — speculative
print(compileAndRunNative_arm64(fib 10));    // 55, ARM64 backend (cross-compile)
print(compileAndRunNative_riscv(fib 10));    // 55, RISC-V backend

// v3.2 — speculative
print(sum(1_000_000));                        // 499500, JIT-compiled

// v3.2 — speculative
// aether install aether-http
import { Server } from "aether-http";
let s = Server::new();
s.get("/", fn(_req) -> Response { Response::ok("hello") });
s.listen(3000);
```

The v3 line is real — paste it into the playground, it runs. The v3.1/v3.2 lines are sketches of the future. The gap between them is the next 12-18 months of work.

---

## 20.11 Summary

- **v3.1** is bytecode-level async (suspend/resume, ADR-20), the ARM64 backend (RFC-009), and the RISC-V backend (RFC-010). All three are sketched and design-ready; the implementation work is the next 6 months.
- **v3.2** is the JIT (RFC-011) and the package registry (RFC-012). The JIT closes the perf gap to real native; the registry unlocks third-party packages.
- **v3.3** is the four language ports (Ruby, Lua, Scheme, second-pass Aether) and the mechanized proofs (RFC-013, Lean4). The ports prove the language is a good host; the mechanization proves the proofs are real.
- **v4** is self-replication — the Aether compiler written in Aether, compiling itself to a byte-identical binary.
- **Deliberate non-goals** for v3.x: GPU, kernel-level async, macros, real FFI, incremental compilation. Each is a v4+ item.
- **The honest summary**: v3 is a coherent research language with 4 runtimes, 25 packages, 3 real apps, a Python compiler port, and 37.6K words of formal semantics. v3.1 is the next 6 months. v4 is the next 2-3 years. The path is sketched; the work is to walk it.

The book closes here. The next chapter is the book's appendix — a glossary, a bibliography, and an index. Or you can stop here, open the playground at `https://nexus-aip-roj-builder.vercel.app`, and run v3 yourself.
