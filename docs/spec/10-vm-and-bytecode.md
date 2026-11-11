# 10 — VM & Bytecode

> **Status:** 🧪 Experimental
> **Subsystem:** `aether/vm/codegen`, `aether/vm/bytecode`, `aether/vm/vm`
> **Spec version:** 0.1

This section specifies the Aether virtual machine: the bytecode
instruction set, the runtime data structures, the calling
convention, and the image format. The VM is a *register-based*
machine with an explicit operand stack, in the tradition of Lua
5.x's register VM, with borrow-able locals and per-prototype
constant pools.

## 1. Design summary

- **Register-based:** each prototype has a fixed number of
  *locals* (numbered `0..n_locals`); operands are addressed by local
  index.
- **Stack of frames:** each task has a frame stack; each frame has
  its own locals.
- **Per-prototype constant pool:** integers, floats, strings,
  bytes, symbols, type descriptors, prototype pointers.
- **GC-aware:** every heap-allocating opcode is a GC safe point.
- **Async-aware:** opcodes `Await`, `Spawn`, `Yield`, `Resume`
  integrate with the task scheduler.
- **Diagnosable:** every opcode carries source position in the
  debug info, off by `--no-debug-info`.

## 2. Values

The VM uses a single 64-bit tagged value representation:

```
TaggedValue ::= 64-bit word
  - 0b00 : pointer to heap object (Object*, low 2 bits zeroed)
  - 0b01 : 62-bit signed integer (shifted left by 2)
  - 0b10 : float64 (NaN-boxing; the NaN space carries pointers/ints)
  - 0b11 : special (None, False, True, Undefined, …)
```

This is the standard NaN-boxing trick (cf. V8, SpiderMonkey). The
exact bit layout is implementation-defined; the contract is that
the four categories (pointer, integer, float, special) are
distinguishable by tag and that all four fit in one 64-bit
register.

Heap objects have a header:

```
struct Header {
    tag:      ObjectType,   // 1 byte: which kind of object
    color:    Color,        // 2 bits: GC tricolor (white/grey/black)
    flags:    u8,           // 1 byte: GC flags (e.g. forwarded, pinned)
    size:     u32,          // 4 bytes: total size including header
    type_id:  TypeId,       // 4 bytes: type descriptor index
}
```

Object kinds:

| Tag | Object |
|---|---|
| `STRING`  | UTF-8 bytes + length |
| `BYTES`   | raw bytes + length |
| `ARRAY`   | fixed-size array of TaggedValues |
| `SLICE`   | (pointer to ARRAY, start, length) |
| `MAP`     | hash table |
| `SET`     | hash set |
| `STRUCT`  | field array, indexed by field id |
| `ENUM`    | (variant_id, payload) |
| `CLOSURE` | (prototype_id, env_ptr) |
| `PROTO`   | function prototype (immutable) |
| `FRAME`   | a captured continuation (for `await`) |
| `UPVALUE` | a closure-captured variable |
| `CHANNEL` | an async channel |
| `TASK`    | an async task |
| `BIGINT`  | a `BigInt` (optional; disabled by default) |
| `FOREIGN` | an opaque host handle (§14) |

The exact `ObjectType` enumeration is implementation-defined; this
list is the *minimum* set a conformant VM MUST support.

## 3. Prototypes

A *prototype* is the compiled form of a function (or closure body).
A prototype is immutable and may be shared across tasks.

```
struct Prototype {
    name:       Symbol,
    arity:      u16,                 // required parameters (no defaults)
    n_defaults: u16,
    n_locals:   u32,                 // total local slots
    n_captures: u16,
    code:       []Op,                // bytecode ops (see §4)
    constants:  []TaggedValue,       // per-prototype constant pool
    captures:   []CaptureDesc,       // capture descriptions
    debug:      DebugInfo,           // line table, local names (optional)
    flags:      ProtoFlags,
}
struct CaptureDesc {
    kind: CaptureKind,               // ByRef, ByMut, ByMove
    src:  u32,                       // local index in the enclosing frame
}
struct DebugInfo {
    lines:   [(pc: u32, line: u32, col: u32)],
    locals:  [(slot: u32, name: Symbol, scope_start: u32, scope_end: u32)],
}
```

## 4. Instruction set

Each instruction is 4 bytes wide: 1 byte opcode, 3 bytes operand
packed as needed. Some opcodes use a wider form (8 bytes) for
indices that exceed 24 bits; the assembler notation hides this.

The notation below uses:

- `rX` — local register `X`
- `kY` — constant pool index `Y`
- `fZ` — function prototype index `Z` (within the module)
- `sW` — symbol index `W`

### 4.1 Constants and moves

| Op | Operand | Effect |
|---|---|---|
| `Const`     | `rX, kY`   | `rX := constants[kY]` |
| `Move`      | `rX, rY`   | `rX := rY` |
| `MoveWide`  | `rX, rY`   | same, for index ≥ 256 |
| `Null`      | `rX`       | `rX := None` |
| `True`      | `rX`       | `rX := true` |
| `False`     | `rX`       | `rX := false` |
| `Unit`      | `rX`       | `rX := ()` |
| `Int`       | `rX, imm`  | `rX := small integer` |
| `Symbol`    | `rX, sW`   | `rX := symbol[W]` |

### 4.2 Arithmetic and logic

| Op | Effect |
|---|---|
| `Add  rX, rY, rZ` | `rX := rY + rZ` (with overflow check in debug) |
| `Sub  rX, rY, rZ` | `rX := rY - rZ` |
| `Mul  rX, rY, rZ` | `rX := rY * rZ` |
| `Div  rX, rY, rZ` | `rX := rY / rZ` (panic on 0) |
| `Mod  rX, rY, rZ` | `rX := rY % rZ` |
| `Pow  rX, rY, rZ` | `rX := rY ** rZ` |
| `Neg  rX, rY`     | `rX := -rY` |
| `Not  rX, rY`     | `rX := !rY` (bool) |
| `BitNot rX, rY`   | `rX := ~rY` |
| `BitAnd, BitOr, BitXor, Shl, Shr` | similar |
| `Eq   rX, rY, rZ` | `rX := rY == rZ` (calls `Eq`) |
| `Lt, Le, Gt, Ge`  | similar (calls `Ord`) |

### 4.3 Control flow

| Op | Effect |
|---|---|
| `Jump   target`           | pc := target |
| `JumpIf rX, target`       | if `rX` truthy: pc := target |
| `JumpIfNot rX, target`    | if `rX` falsy: pc := target |
| `JumpIfNone rX, target`   | if `rX is None`: pc := target |
| `JumpIfErr  rX, target`   | if `rX is Err`: pc := target |
| `Switch rX, table, default` | jump table for integer/discriminant switch |
| `Match rX, arm_table`    | arm dispatch (see §4.6) |

### 4.4 Calls and returns

| Op | Effect |
|---|---|
| `Call rDst, fZ, rArgs, n`     | call prototype `fZ` with `n` args starting at `rArgs`; result in `rDst` |
| `CallDyn rDst, rFn, rArgs, n` | call a closure or `dyn Fn` value |
| `TailCall fZ, rArgs, n`       | tail call; replaces the current frame |
| `Return rX`                   | return `rX` to caller |
| `ReturnUnit`                  | return `()` (common case) |
| `Throw rX`                    | propagate `rX` as an error/panic (see §5) |
| `PushDefer rFn, rEnv`         | register a defer block in the current frame |
| `PopDefers`                   | run all pending defers in LIFO order |

The *calling convention* is: args are placed in consecutive locals
starting at `rArgs`; the callee's first `arity` locals are the
parameters; the result lands in a fresh local at the call site
(`rDst`). The frame base is the index of the first parameter; all
local indexing in the callee is relative to the frame base.

### 4.5 Memory

| Op | Effect |
|---|---|
| `AllocArray  rX, n`     | `rX := new Array of n slots` |
| `AllocStruct rX, type_id` | `rX := new Struct of type_id` |
| `AllocEnum   rX, type_id, variant_id, rPayload` | `rX := new Enum variant` |
| `AllocMap    rX, type_id` | `rX := new empty Map` |
| `AllocSet    rX, type_id` | `rX := new empty Set` |
| `GetField    rX, rY, field_id` | `rX := rY.field[field_id]` |
| `SetField    rY, field_id, rX` | `rY.field[field_id] := rX` |
| `GetIndex    rX, rY, rZ` | `rX := rY[rZ]` (calls `Index`) |
| `SetIndex    rY, rZ, rX` | `rY[rZ] := rX` (calls `IndexMut`) |
| `GetSlice    rX, rY, rLo, rHi` | `rX := rY[lo..hi]` |
| `ArrayLen    rX, rY`     | `rX := len(rY)` |
| `StringLen   rX, rY`     | similar |
| `Box         rX, rY`    | `rX := Box::new(rY)` |
| `Unbox       rX, rY`    | `rX := *rY` (deref a Box) |

Every `Alloc*` opcode is a **GC safe point**: the VM MAY trigger a
collection before completing the allocation.

### 4.6 `Match`

`Match rX, arm_table` performs a structured match against the
tagged value in `rX`. The `arm_table` is a list of
`(pattern_descriptor, target_pc)` entries. Pattern evaluation:

- For an enum scrutinee, the variant discriminant is extracted and
  matched against each arm in order. Most arms are compiled to a
  jump table; arms with guards or with non-trivial patterns are
  emitted as a sequence of `JumpIfNot`s.
- For a literal scrutinee, the value is compared to each arm's
  literal via `Eq`.
- For a range scrutinee, the bounds are checked.

Bindings produced by the matching arm are written to fresh locals
before jumping to the arm's body.

### 4.7 Closures

| Op | Effect |
|---|---|
| `MakeClosure rX, fZ, n_captures` | allocate closure; env slots populated by following `CaptureDesc` list in `fZ` |
| `GetUpvalue  rX, rClosure, k`    | `rX := closure.env[k]` |
| `SetUpvalue  rClosure, k, rX`    | `closure.env[k] := rX` |

For non-capturing closures, `MakeClosure` is folded into `Const`
(pointing at a pre-built closure singleton).

### 4.8 Async

| Op | Effect |
|---|---|
| `FutureStart rX, fZ, rArgs, n` | allocate a future state machine; `rX := Future` |
| `Await       rX, rY`          | `rX := await rY`; this is a suspension point |
| `Spawn       rX, rY`          | `rX := spawn rY as a new task` |
| `Yield`                        | cooperative yield to scheduler |
| `Resume rX, rY`                | poll a future once; `rX := Poll` |

`Await` desugars to a poll-loop with a state index (see §07 4.1):
the prototype has a state field; `Await` reads the future's state,
and on `Pending` saves the current frame and `Yield`s. On resume,
the scheduler jumps back to the instruction after `Await`.

### 4.9 Foreign calls

| Op | Effect |
|---|---|
| `CallForeign rDst, ffn_id, rArgs, n` | call into a host function (§14) |
| `ForeignGet  rX, rHandle, key` | read a field of a host object |
| `ForeignSet  rHandle, key, rX` | write a field of a host object |
| `ForeignCall rX, rHandle, method, rArgs, n` | method call on a host object |

### 4.10 Misc

| Op | Effect |
|---|---|
| `GcCheckpoint` | explicit GC safe point (rare; usually `Alloc*` is enough) |
| `Panic rX`     | raise a panic with payload `rX` |
| `Trace rX`     | emit `rX` to the debug log (only with `--trace`) |
| `Nop`          | no-op (used for patching during optimization) |
| `Trap`         | abort the VM with a fatal error (unreachable code) |

## 5. Error propagation

`Throw rX` is the universal "propagate this value" opcode. The VM
checks the kind of `rX`:

- `Err(e)` — pop defers, unwind the frame, propagate up to the
  nearest `try` block. If no `try` block exists in the task, the
  task aborts with `TaskFailed`.
- `Panic(p)` — same as `Err`, but the catch handler must
  explicitly match `Panic { ... }`.
- `None` — only valid as a result of `?` on `Option`; unwinds as
  `Err` would and re-emerges as `None` at the caller.

A `try` block compiles to: a `try` pseudo-frame pushed on the
*defers* stack, with a catch handler address. `Throw` jumps to the
nearest handler and lets it run.

## 6. Stack and frame layout

```
Task
├── frame stack
│   ├── frame[0]  (main)
│   │     ├── prototype pointer
│   │     ├── locals[0..n_locals]
│   │     ├── ip
│   │     ├── defer stack (List<DeferEntry>)
│   │     └── catch stack (List<CatchEntry>)
│   ├── frame[1]  (called from main)
│   └── ...
├── gc roots (the union of all live locals across frames)
└── task-local data (current channel, current handle, etc.)
```

- Frames are heap-allocated (one allocation per call). Tail-call
  optimization reuses the current frame for `TailCall` instead of
  pushing a new one.
- Each frame's `locals` array is also a GC root while the frame is
  on the frame stack. When a frame is popped, its locals become
  unreachable for GC purposes (after `Drop` finalizers run).

## 7. Assembly form

For debugging, `aether build --emit asm` emits a textual form:

```
function main/0 (arity=0, locals=3, captures=0):
  0:  Const      r0, k0            ; "hello, {name}"
  1:  Const      r1, k1            ; "world"
  2:  Call       r2, f1, r1, 1     ; format(...)
  3:  Call       r0, f2, r2, 1     ; println(...)
  4:  ReturnUnit
```

The form is line-oriented; each line is `<pc>: <opcode> <operands>
;<comment>`. Comments include source location and constant
literal value where useful. The assembler is round-trippable
with `aether build --from-asm`.

## 8. Image format

The output of `aether build` is a *bytecode image*: a single file
containing everything the VM needs to run a program. The format
is:

```
Image ::= Header Section+
Header ::= "AETH"      ; magic, 4 bytes
           u16 ver_major, u16 ver_minor
           u32 n_sections, u32 flags
Section ::= SectionTag u32 size bytes
SectionTag ::= "PROT"   ; prototypes
              | "CONST" ; global constant pool
              | "STRS"  ; interned strings
              | "SYMS"  ; interned symbols
              | "TYPES" ; type descriptors
              | "DEBUG" ; debug info
              | "IMPS"  ; import table (host symbols)
              | "META"  ; manifest (entry, deps, edition)
```

The image format is versioned with the spec version. The loader
refuses to load images whose `ver_major` differs from the VM's
own.

## 9. Conformance

A conformant VM MUST:

- implement every opcode listed above,
- produce observable behavior matching the dynamic semantics of
  §04, §07, §08, and §11,
- detect stack overflow (§07 1.2) and division by zero as
  recoverable panics,
- support the image format described in §8,
- refuse to execute an image whose `ver_major` differs from its
  own with `E5999`.

A conformant VM MAY:

- reorder, fuse, or specialize opcodes provided observable
  behavior is preserved,
- support additional opcodes behind an opt-in flag (prefixed with
  `Ext` to avoid collisions with future spec opcodes),
- support a JIT that compiles hot prototypes to native code
  transparently.
