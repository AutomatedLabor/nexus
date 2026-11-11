# 14 — Interoperability & FFI

> **Status:** 🧪 Experimental
> **Subsystem:** `aether/vm` (foreign-object support), host bindings
> **Spec version:** 0.1

Aether is designed to be embedded in a host application and to
call into the host's native code. This section specifies the
foreign-function interface (FFI), the host-binding protocol, and
the opt-in `dynamic` escape hatch for glue code.

## 1. Two directions of interop

| Direction | Mechanism | Example |
|---|---|---|
| Aether calls host code | `extern` declarations + `CallForeign` opcode | Aether calls a C `printf` |
| Host calls Aether code | Embedder API: load image, push args, invoke prototype | JS host calls an Aether `fn` |
| Aether reads host objects | `ForeignGet` / `ForeignCall` | Aether reads a JS object field |
| Aether writes host objects | `ForeignSet` | Aether writes a JS object field |

The mechanism is the same in both directions at the VM level: a
**foreign object** is a heap value of kind `FOREIGN` that wraps an
opaque host pointer plus a *vtable* describing how to call its
methods, get/set its fields, and free it.

## 2. `extern` blocks

```aether
extern "c" {
    fn c_strlen(s: *const u8) -> usize;
    fn c_printf(fmt: *const u8, ...) -> Int;
    static EXIT_HANDLER: *mut Void;
}

extern "host" {
    fn host_log(msg: String) -> Unit;
    fn host_clock() -> Float;
}
```

- `extern "abi"` declares the calling convention. Supported ABIs
  in 0.1:
  - `"c"` — the platform's C ABI.
  - `"host"` — the embedder's native calling convention (used
    when Aether is embedded in a non-C host; e.g. a JS engine).
  - `"aether"` — the Aether ABI itself (used by `extern`-style
    declarations across Aether modules in the same image; rarely
    needed).
- `extern "c"` declarations resolve symbols by name at image-load
  time via the host's dynamic loader. Missing symbols are
  `E1400` at startup.
- `extern "host"` declarations resolve to functions registered by
  the embedder via `vm.register_function(name, callback)`. The
  callback is a host function pointer that the VM dispatches to
  via `CallForeign`.
- `static` declarations resolve to fixed host addresses; reads
  and writes go through the host ABI.

### 2.1 FFI-safe types

Only the following Aether types are FFI-safe:

- `Int`, `Uint`, `i*`, `u*`, `Float`, `f32`, `f64`, `Bool`,
  `Char`, `Unit`,
- `*const T`, `*mut T` (raw pointers; see §3),
- `&[T]` for `T: Copy` (passes a pointer + length pair),
- `extern "abi" fn(...)` (function pointers),
- structs annotated `#[repr(C)]` whose every field is FFI-safe.

Other types (`String`, `Bytes`, `List`, `Map`, closures, async
futures, trait objects) are *not* FFI-safe and produce `E1410` if
used in an `extern` signature.

### 2.2 Variadic C functions

A trailing `...` in an `extern "c"` function declares a variadic
function:

```aether
extern "c" fn c_printf(fmt: *const u8, ...) -> Int;
```

Callers must pass the correct number and types of variadic
arguments; the VM does not check. A variadic call into a function
that expects a fixed number of arguments is undefined behavior
under the FFI stability promise.

## 3. Raw pointers

```aether
let p: *const u8 = unsafe { foreign::malloc(64) };
let q: *mut u8   = p as *mut u8;
unsafe { *q = 7; }
unsafe { foreign::free(p as *mut Void); }
```

- Raw pointers `*const T` and `*mut T` are address-sized integers
  in disguise. They are `Copy` and do not own the memory they
  point to.
- Dereferencing a raw pointer (`*p`, `*p = v`) requires an
  `unsafe` block. The compiler does not check aliasing,
  lifetimes, or alignment.
- `unsafe` is a block expression:

  ```aether
  let n = unsafe { read_raw_register() };
  ```

  The `unsafe` block asserts that the programmer has verified the
  invariants that the compiler cannot. Panics inside an `unsafe`
  block propagate normally.
- Raw pointers may be stored in `struct` fields and returned from
  `extern` functions. They may *not* be passed to non-`extern`
  Aether functions except as opaque values; the borrow checker
  treats them as `!Sync` and `!Send` (so they cannot cross a
  `spawn` boundary).

### 3.1 `unsafe fn`

A function may be declared `unsafe fn`, requiring callers to wrap
the call in `unsafe`:

```aether
unsafe fn raw_write(p: *mut u8, v: u8) { *p = v; }

unsafe { raw_write(ptr, 7); }
```

`unsafe fn` is the standard way to encapsulate an invariant;
`extern` functions are implicitly `unsafe fn`.

## 4. Foreign objects and the host vtable

When the embedder registers a host object, the VM allocates a
`FOREIGN` value with a vtable:

```aether
struct ForeignVTable {
    call:    Option<fn(Foreign, args: &[Value]) -> Result<Value, Panic>>,
    get:     Option<fn(Foreign, key: Symbol)  -> Value>,
    set:     Option<fn(Foreign, key: Symbol, Value) -> Unit>,
    iterate: Option<fn(Foreign) -> ForeignIter>,
    drop:    Option<fn(Foreign) -> Unit>,
}
```

Aether-side, a foreign object is typed as `dynamic` (§5) or as a
specific `extern "host" type` declared with `#[repr(host)]`:

```aether
#[repr(host)]
extern type JsObject;
impl JsObject {
    extern "host" fn get(self, key: String) -> dynamic;
    extern "host" fn set(self, key: String, value: dynamic) -> Unit;
}
```

The compiler emits `ForeignGet` / `ForeignSet` / `ForeignCall`
opcodes for these operations (see [§10 §4.9](./10-vm-and-bytecode.md#foreign-calls)).

## 5. `dynamic`

A `dynamic` value is an opt-in, statically unchecked escape
hatch. It is intended for FFI glue and for prototyping; the
linter warns on its use in `pub` declarations of library code.

```aether
let x: dynamic = host_call();
let n = x as Int;            // runtime-checked cast; panic if not Int
let s = x.to_string();       // dynamic dispatch: looks up `to_string` on x at runtime
```

- `dynamic` carries the runtime type of its value; the `is` and
  `as` operators (§04 §6.4) perform runtime checks.
- Method calls on `dynamic` perform late binding by name through
  the foreign vtable (§4). A method that does not exist on the
  underlying type is a runtime error `E1420`.
- `dynamic` is *not* `Send` or `Sync` by default; the runtime
  rejects cross-`spawn` transfer of a `dynamic` value unless the
  embedder has registered it as safe (§4).

## 6. Embedding API

The embedder's view of the VM is a small C ABI:

```c
typedef struct AetherVM     AetherVM;
typedef struct AetherValue   AetherValue;
typedef struct AetherImage   AetherImage;

AetherImage* aether_load(const uint8_t* bytes, size_t n);
void         aether_image_free(AetherImage*);

AetherVM*    aether_vm_new(const AetherConfig* config);
void         aether_vm_free(AetherVM*);

// Register a host function for `extern "host"` calls.
void aether_register_host_fn(AetherVM*, const char* name,
                              AetherHostFn fn, void* userdata);

// Run the image's entry function; returns the exit code.
int  aether_run(AetherVM*, AetherImage*, int argc, const char** argv);

// Call a specific prototype (by module + name) with explicit args.
AetherValue aether_call(AetherVM*, AetherImage*,
                         const char* module, const char* name,
                         const AetherValue* args, size_t n);

// Convert between native C values and Aether values.
AetherValue aether_int(int64_t v);
AetherValue aether_float(double v);
AetherValue aether_string(const char* s);
int64_t     aether_as_int(AetherValue);
// ...

// Register GC roots the VM should treat as live.
void aether_register_root(AetherVM*, AetherValue* slot);
void aether_unregister_root(AetherVM*, AetherValue* slot);
```

The embedder is responsible for:

- creating a `AetherVM`,
- loading an image (from a file or a buffer),
- registering any host functions the image expects,
- pushing arguments and invoking the entry or named prototype,
- draining the VM until it returns or panics,
- freeing the VM and image.

The VM exposes a *task-based* model: each `aether_call` runs on
a fresh task with its own frame stack. Concurrent calls into the
same VM are safe only if the embedder holds the VM's lock (the
VM is single-threaded in 0.1; multi-threaded use requires one
`AetherVM` per worker thread, with cross-VM communication via
the embedder's own channels).

## 7. Embedder example (pseudo-C)

```c
int main(int argc, char** argv) {
    uint8_t* image_bytes; size_t image_len;
    load_file("app.aimg", &image_bytes, &image_len);

    AetherImage* img = aether_load(image_bytes, image_len);
    AetherVM* vm = aether_vm_new(NULL);
    aether_register_host_fn(vm, "host_log", host_log_cb, NULL);
    aether_register_host_fn(vm, "host_clock", host_clock_cb, NULL);

    int exit_code = aether_run(vm, img, argc - 1, argv + 1);

    aether_vm_free(vm);
    aether_image_free(img);
    return exit_code;
}
```

The matching Aether side:

```aether
// app.ae
extern "host" {
    fn host_log(msg: String) -> Unit;
    fn host_clock() -> Float;
}

pub fn main() {
    host_log("starting at " + host_clock().to_string());
}
```

## 8. JavaScript embedding

When the host is a JavaScript engine (e.g. Aether compiled to
`wasm32` and loaded by a JS module), the `"host"` ABI is exposed
via a small JS wrapper:

```js
import { AetherVM } from "aether-wasm";

const vm = new AetherVM();
await vm.load(wasmBytes);
vm.registerHostFn("host_log", (msg) => console.log(msg));
vm.registerHostFn("host_clock", () => performance.now() / 1000);

const exitCode = await vm.run();
```

The JS wrapper exposes `AetherValue` as a JS `Value` that is
marshalled across the wasm boundary using the standard
wasm-bindgen-style ABI. The Aether `String` ↔ JS `string` and
Aether `Bytes` ↔ JS `Uint8Array` conversions are built-in.

## 9. Safety and stability

- FFI calls are `unsafe` by default; the compiler cannot verify
  the host's side of the contract.
- The `#[repr(C)]` and `#[repr(host)]` attributes fix the layout
  of a struct/type for FFI. Without them, the layout is
  unspecified and may change between minor versions.
- The `extern "host"` ABI is *not* part of the cross-embedder
  stability promise: different embedders define their own
  `"host"` ABI. The `"c"` ABI *is* part of the stability promise
  and follows the platform's standard C calling convention.
- Embedders MUST ensure that any values handed to the VM
  (`AetherValue`s constructed via the C API) are released via
  `aether_unregister_root` or by letting the VM collect them.
  Leaks are the embedder's responsibility.

## 10. Conformance

A conformant implementation MUST:

- support `extern "c"` with the platform's standard C ABI,
- support `extern "host"` with a documented per-embedder ABI,
- support the embedding API described in §6,
- support raw pointers and `unsafe` blocks with the semantics of
  §3,
- support `dynamic` with runtime-checked `is` and `as`,
- treat FFI panics as recoverable panics (catchable by `try`).

A conformant implementation MAY:

- add additional ABIs behind a documented name (e.g. `"stdcall"`,
  `"sysv64"`, `"win64"` on Windows),
- restrict which platforms support which ABIs (e.g. no `"c"` on
  `wasm32`),
- provide a higher-level wrapper API for specific embedders (e.g.
  the JS wrapper of §8).
