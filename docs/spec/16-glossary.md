# 16 — Glossary

> **Status:** 🔒 Stable
> **Spec version:** 0.1

This glossary defines terms used throughout the Aether specification.
Each term is in *italics* the first time it appears in a given
document, and is defined here for reference.

---

**ADT**
: Algebraic Data Type. A type built from sums (`enum`) and
products (`struct`, tuple). Aether's `enum` and `struct` are
ADTs in the ML tradition.

**Arena**
: A per-compilation bump-allocator used by the parser to store
AST nodes. Arena allocation is fast and never frees individual
nodes; the whole arena is freed at the end of compilation.

**Async function**
: A function declared with `async fn` whose body may suspend at
`await` points. Calling it returns a `Future<Output = T>`.

**AST**
: Abstract Syntax Tree. The tree-shaped intermediate
representation produced by the parser from a token stream. See
[§09 §2.3](./09-compiler-pipeline.md#ast).

**Borrow**
: A lightweight reference (`&T` or `&mut T`) to a value. Borrows do
not transfer ownership; the borrowed value is owned by the GC
or by the local it lives in.

**Bound**
: A constraint on a generic type parameter, written `T: Trait`.
A bound requires the parameter to implement the named trait.

**Bytecode**
: The intermediate representation emitted by `codegen` and
executed by the VM. See [§10](./10-vm-and-bytecode.md).

**Capture**
: A variable referenced (read or written) inside a closure
body. The compiler chooses the capture mode per-use; see
[§07 §3.1](./07-functions-closures-async.md#capture-inference).

**Channel**
: An asynchronous queue for sending values between tasks. See
[§07 §4.3](./07-functions-closures-async.md#channels).

**Checker**
: The compiler stage that runs after sema and verifies
exhaustiveness, definite-assignment, borrow-checking, and
trait conformance. See [§09 §2.5](./09-compiler-pipeline.md#checker).

**Closure**
: A function value together with a captured environment. See
[§07 §3](./07-functions-closures-async.md#closures).

**Constant pool**
: A per-prototype array of compile-time constants (integers,
floats, strings, etc.) addressed by index in bytecode. See
[§10 §3](./10-vm-and-bytecode.md#prototypes).

**Conformance**
: The property of an implementation of matching the observable
behavior of the spec on the conformance test suite. See
[§15](./15-conformance-and-tests.md).

**Constant expression**
: An expression that can be evaluated at compile time. The
initializer of a `const` must be a constant expression; see
[§05 §3.1](./05-statements-and-declarations.md#const-fn).

**Crate**
: A single compilation unit produced from one package: either a
binary crate (with `main.ae`) or a library crate (with
`lib.ae`). See [§06 §6](./06-modules-and-packages.md#crate-root-and-entry-points).

**`dyn Trait`**
: A trait object — a value of any type implementing the named
trait, accessed through a vtable. See
[§03 §1.8](./03-type-system.md#trait-objects).

**Definite assignment**
: The property that a local is initialized on every control-flow
path before its first read. See
[§03 §6.3](./03-type-system.md#definite-assignment).

**Defer**
: A block scheduled to run when its enclosing scope exits, in
LIFO order. See [§08 §6](./08-error-handling.md#defer).

**Diagnostic**
: A compiler message with a severity, code, span, message, and
optional notes/suggestions. See
[§09 §3](./09-compiler-pipeline.md#diagnostic-model).

**Display**
: A trait that provides `to_string` for a type. Used by string
interpolation, `format!`, and `println!`.

**Edition**
: A spec version a package targets, declared in `aether.toml`.
The compiler accepts a rolling window of editions.

**Exhaustiveness**
: The property that a `match` covers every possible value of
the scrutinee type. The checker enforces exhaustiveness; see
[§03 §6.6](./03-type-system.md#exhaustiveness).

**FFI**
: Foreign Function Interface. The mechanism by which Aether
calls and is called by code in other languages. See
[§14](./14-interoperability.md).

**Frame**
: A runtime structure representing one activation of a
function: locals, instruction pointer, defer stack, catch
stack. See [§10 §6](./10-vm-and-bytecode.md#stack-and-frame-layout).

**Future**
: A value representing a computation that may not have
completed yet. See [§07 §4.1](./07-functions-closures-async.md#async-fn-and-future).

**GC**
: Garbage Collector. The subsystem that reclaims unreachable
heap memory. See [§11](./11-memory-and-gc.md).

**GC safe point**
: A point in the bytecode where the VM may pause for
collection. See [§11 §3](./11-memory-and-gc.md#gc-safe-points).

**Generic**
: A function, struct, enum, or trait parameterized by one or
more type variables. See
[§03 §1.6](./03-type-system.md#generic-types).

**Image**
: The output of `aether build`: a single file containing every
prototype, constant pool, and metadata the VM needs to run a
program. See
[§10 §8](./10-vm-and-bytecode.md#image-format).

**`impl`**
: An implementation block, providing trait methods for a type
(`impl Trait for Type`) or inherent methods (`impl Type`). See
[§03 §3.5](./03-type-system.md#implementations).

**Inference**
: The algorithm by which the compiler reconstructs types that
the programmer omitted. See
[§03 §6](./03-type-system.md#inference-algorithm).

**JoinHandle**
: A handle returned by `spawn` that allows awaiting a task's
result. See [§07 §4.4](./07-functions-closures-async.md#spawn-and-joinhandle).

**Lexer**
: The compiler stage that turns source bytes into tokens. See
[§02](./02-lexical-structure.md), [§09 §2.1](./09-compiler-pipeline.md#lexer).

**Lifetime**
: Reserved word for forward-compatibility. Aether has no
Rust-style lifetimes; the apostrophe-prefixed identifiers
(`'a`) are type variables. See
[§02 §4.2](./02-lexical-structure.md#lifetime--type-variable-identifiers).

**Monomorphization**
: The compilation strategy that produces a separate bytecode
prototype for each instantiation of a generic function or
type. See [§03 §1.6](./03-type-system.md#generic-types).

**Module**
: A unit of name resolution corresponding to a single `.ae`
file or a directory tree. See
[§06 §2](./06-modules-and-packages.md#module-hierarchy).

**Never type (`!`)**
: The type of expressions that do not return a value. Coerces
to any other type. See [§03 §1.9](./03-type-system.md#never-type).

**Object-safe**
: The property of a trait that allows it to be used as a
`dyn Trait`. A trait is not object-safe if it has methods that
return `Self`, take `Self` by value, or have generic methods.

**Orphan rule**
: The rule that an `impl` must live in the module that declares
either the trait or the type. See
[§03 §6.5](./03-type-system.md#trait-conformance).

**Package**
: A directory containing an `aether.toml` and at least one
crate. The unit of versioning and distribution. See
[§06 §5](./06-modules-and-packages.md#packages-and-aethertoml).

**Panic**
: An unrecoverable error that aborts the current task. See
[§08 §5](./08-error-handling.md#panics).

**Pattern**
: A grammar that matches values and binds sub-parts. Shared
between `match`, `let`, function parameters, `for`/`spawn`
bindings, and `catch`. See [§08 §4](./08-error-handling.md#patterns).

**Prelude**
: The set of names auto-imported into every module unless
`#![no_prelude]` is set. See
[§06 §4.1](./06-modules-and-packages.md#prelude).

**Prototype**
: The compiled form of a function: opcode array plus
metadata. Immutable and shareable across tasks. See
[§10 §3](./10-vm-and-bytecode.md#prototypes).

**`pub`**
: The visibility modifier that makes an item visible outside its
declaring module. See
[§06 §3](./06-modules-and-packages.md#visibility).

**Safe point**
: See *GC safe point*.

**Sema**
: The compiler stage that resolves names and infers types.
See [§09 §2.4](./09-compiler-pipeline.md#sema-name-resolution--type-inference).

**Span**
: A range of source text, recorded for each token, AST node,
and diagnostic. See [§02 §1](./02-lexical-structure.md#source-representation).

**Stability tier**
: One of *A*, *B*, *C*, *D* describing how stable a part of the
spec is. See [§15 §7](./15-conformance-and-tests.md#stability-tiers).

**Stdlib**
: The standard library, organized into ten modules plus the
prelude. See [§12](./12-stdlib.md).

**Task**
: A unit of asynchronous execution. Tasks are cooperatively
scheduled by the runtime. See
[§07 §4.2](./07-functions-closures-async.md#the-task-scheduler).

**Trait**
: A named set of method signatures and (optionally) default
implementations. Aether's traits are similar to Rust's. See
[§03 §3.4](./03-type-system.md#traits).

**Tricolor**
: The Dijkstra marking scheme used by the GC (white, grey,
black). See [§11 §2](./11-memory-and-gc.md#tricolor-marking).

**Tuple**
: A fixed-size, heterogeneous product type. See
[§03 §1.3](./03-type-system.md#tuples).

**`unsafe`**
: A block or function that asserts invariants the compiler
cannot verify. Used for FFI and raw-pointer operations. See
[§14 §3](./14-interoperability.md#raw-pointers).

**Upvalue**
: A captured variable in a closure's environment. The VM
treats upvalues as GC roots. See
[§10 §4.7](./10-vm-and-bytecode.md#closures).

**Variant**
: One constructor of an `enum`. Variants may be unit, tuple, or
struct-shaped. See [§03 §3.3](./03-type-system.md#enums-algebraic-data-types).

**VM**
: The Aether Virtual Machine. See [§10](./10-vm-and-bytecode.md).

**Write barrier**
: The mechanism by which the GC tracks overwritten reference
fields during incremental collection. See
[§11 §2.1](./11-memory-and-gc.md#incremental-collection).
