# 11 — Memory & GC

> **Status:** 🧪 Experimental
> **Subsystem:** `aether/vm/gc`, `aether/vm/vm`
> **Spec version:** 0.1

This section specifies Aether's memory model and garbage
collector. The collector is a **tricolor mark-sweep** collector with
an optional **generational** nursery. The memory model is
**fully managed**: the GC owns every heap object; programs cannot
manually free memory and cannot produce a dangling pointer.

## 1. Memory model

### 1.1 Allocation classes

Every heap object belongs to one of the classes enumerated in
[§10 §2](./10-vm-and-bytecode.md#values). Objects are allocated by
`Alloc*` opcodes and live until they become unreachable.

A *small* object is one whose total size (header + payload) is
≤ 1 KiB. A *large* object is one whose size exceeds the nursery
threshold (default 32 KiB). Large objects are allocated directly in
the old generation; small objects are allocated in the nursery.

### 1.2 Reference fields

Heap objects reference other heap objects via tagged pointer
fields. The GC's job is to traverse these fields during marking.
A *reference field* is any field whose value is a pointer-tagged
`TaggedValue`. The VM and codegen cooperate to emit a *reference
map* for each opcode's locals state, so the GC knows which locals
in each frame are pointers (vs. ints, floats, specials).

### 1.3 Roots

The set of GC roots is:

1. The `locals` array of every frame on every task's frame stack.
2. The `env` array of every live closure referenced by a frame.
3. The global variable table.
4. The upvalue table of every active closure.
5. The task-local roots (e.g. the current channel, the current
   `JoinHandle`).
6. The host's registered roots (when embedded, see §14).
7. Static singletons in the image's constant pool that are
   reachable (rare; mostly empty strings, small ints, etc.).
8. The *stack* of the *current task's* pending defers and catch
   entries (which may close over closure values).

Everything reachable from these roots is *live*; everything not
reachable is *collectible*.

## 2. Tricolor marking

The collector uses Dijkstra-style tricolor marking:

- **White** — not yet visited. Initial color of all objects.
- **Grey**  — visited but its children have not all been scanned.
- **Black** — visited and all children scanned.

Algorithm:

```
1. Set every object to White.
2. For each root: mark Grey, push onto the mark stack.
3. While the mark stack is non-empty:
     pop an object O (Grey);
     for each reference field f in O:
         if *f is White: set *f Grey, push onto the mark stack;
     set O Black.
4. Sweep: free every White object. Reset every Black object to
   White for the next cycle.
```

The mark stack is bounded; if it overflows, the collector falls
back to a *mark-on-scan* mode that re-scans grey objects linearly.
This is slow but correct.

### 2.1 Incremental collection

The collector is **incremental**: marking and sweeping proceed in
small steps interleaved with mutator execution, triggered at GC
safe points (§3). The total pause time is bounded by the step
budget (default 1 ms per safe point), giving a soft real-time
guarantee on supported targets.

The mutator must obey the **snapshot-at-the-beginning** invariant:
any reference overwritten by the mutator during a collection cycle
is treated as if it were still present in the root set. The VM
implements this by writing a *write barrier* around every `SetField`,
`SetIndex`, `SetUpvalue` operation that modifies a reference field.
The write barrier records the previous value in a "remembers" set
that gets added to the roots for the current cycle.

### 2.2 Generational collection

The default collector runs in **generational** mode
(`aether.toml → [runtime] gc = "generational"`). The heap is split
into:

- **Nursery** (young generation): new allocations; collected
  frequently; small.
- **Old generation**: survivors of nursery collections; collected
  infrequently; large.

A *minor* collection marks from the roots into the nursery only.
Objects that survive a configurable number of minor collections
(default 2) are *promoted* to the old generation. The old generation
has a *remembered set*: a list of references from old objects to
nursery objects, maintained by the write barrier. Minor
collection uses this remembered set as additional roots.

A *major* collection is a full tricolor mark-sweep across both
generations. Major collections are triggered when the old
generation exceeds a watermark.

If the platform does not support generational collection (e.g.
`wasm32` in 0.1), the runtime falls back to plain mark-sweep:

```
aether.toml → [runtime] gc = "marksweep"
```

### 2.3 Concurrency

The collector is **single-threaded** in 0.1: collection happens at
GC safe points with all tasks paused. A parallel collector is
future work; the contract is the same incremental + write-barrier
discipline, so the design is forward-compatible.

## 3. GC safe points

A *safe point* is a point in the bytecode where the VM may
pause for collection. Safe points occur:

- at every `Alloc*` opcode,
- at every `Call*` opcode (entry into a new prototype),
- at every `Await` and `Spawn` opcode (task switch),
- at explicit `GcCheckpoint` opcodes (rare; the compiler inserts
  them in very long basic blocks with no allocation).

At a safe point, the VM checks whether a collection is due (time
since last collection, allocation pressure, explicit `gc::collect()`
request). If due, it runs the next incremental step (or a full
collection, if the watermark is exceeded).

The *reference map* at each safe point tells the collector which
locals in the current frame are live references. Codegen emits a
reference map per safe-point PC; the VM indexes into it during
collection.

## 4. Finalizers and `Drop`

A type may implement the `Drop` trait:

```aether
trait Drop {
    fn drop(&mut self);
}
```

The `drop` method is called once, when the value becomes
unreachable. The exact moment of `drop` is **implementation-defined**
within the bounds of:

- `drop` runs on the same task that owned the value (when the
  value is task-local; for cross-task values, on whichever task's
  GC sweep finds it).
- `drop` runs *after* the value is no longer reachable, but
  *before* the memory is reclaimed.
- `drop` is given a `&mut self` reference; the field values are
  still intact.
- If `drop` raises a panic, the panic is logged and the rest of the
  cleanup continues. A panic in `drop` does **not** propagate (it
  would be unsafe to do so during a collection).

### 4.1 Finalizer order

Finalizers run in *reverse* field-declaration order: for a struct
`struct S { a: T, b: U }`, the finalizer for `b` runs before the
finalizer for `a`. Finalizers for `Box`, `Rc`, `Arc` (which are
library types) chain into the inner type's finalizer.

### 4.2 Cycles

If a cycle of values implements `Drop`, the collector may collect
the cycle, but `drop` is run once per value in some unspecified
order within the cycle. Programs that rely on a specific order of
finalization in a cycle are *undefined behavior* under this spec.

### 4.3 Weak references

The stdlib provides `Weak<T>` (in `std::rc` and `std::arc`) and
`WeakMap<K, V>` (in `std::collections`). Weak references are not
GC roots; they transparently return `None` when the target has
been collected.

## 5. Memory layout guarantees

- The first byte of every heap object is the `Header` (§10 §2).
  The header is at a 4-byte aligned address.
- `String` and `Bytes` are stored as `(header, length, byte
  array)`. The byte array is contiguous with the header.
- `Array<T>` is stored as `(header, length, capacity, T* payload)`.
  The payload is allocated separately for large arrays and inline
  for small arrays (≤ 16 elements by default).
- `Struct` is stored as `(header, type_id, T0, T1, ..., Tn)`. Field
  order matches declaration order; padding is inserted for
  alignment per the platform ABI.
- `Enum` is stored as `(header, type_id, variant_id, payload)`.
  The payload is a single `TaggedValue` for tuple variants with one
  field, and a pointer to a `Struct`-like record for tuple variants
  with more than one field or struct variants.

The layout is **not** part of the language's stability promise
across versions, but is stable within a major version. FFI code
that depends on the layout MUST use the `#[repr(C)]` or
`#[repr(transparent)]` attribute, which fixes the layout to the C
ABI for that struct (see [§14](./14-interoperability.md)).

## 6. Resource limits

The runtime enforces the following limits, configurable via
`aether.toml`:

| Limit | Default | Overrun behavior |
|---|---|---|
| Heap size | 1 GiB | `panic(HeapLimit)` |
| Nursery size | 16 MiB | minor collection |
| Old generation size | unlimited | major collection |
| Stack size | 8 MiB (1 MiB on `wasm32`) | `panic(StackOverflow)` |
| Number of tasks | 1024 | `panic(TaskLimit)` |
| Channel buffer | unbounded | minor collection pressure |

Programs that need to handle `HeapLimit` gracefully MAY register
a `gc::on_pressure` hook that is called before the panic fires,
giving the program a chance to release caches.

## 7. Conformance

A conformant GC MUST:

- never collect a reachable object,
- collect every unreachable object eventually (within a bounded
  number of safe points proportional to the heap size),
- preserve the finalizer semantics of §4,
- not pause the mutator for more than the configured step budget
  per safe point (default 1 ms) on supported platforms,
- report `HeapLimit`, `StackOverflow`, `TaskLimit` as recoverable
  panics,
- interoperate with the embedder's roots registered via the FFI
  (§14).

A conformant GC MAY:

- use any marking algorithm that preserves the tricolor invariant
  under the write barrier,
- delay finalizers across multiple safe points,
- implement a parallel or concurrent collector in future versions
  without changing the language semantics.
