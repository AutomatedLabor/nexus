# aether/stdlib/lens

`lens` provides functional lenses: composable pairs of a getter and a
setter that focus on a part of a data structure. Lenses are the
standard tool for expressing **immutable updates** of nested data:
rather than writing `obj.a.b.c = new_value` (which mutates), you write

```aether
lensSet(lensPath(["a", "b", "c"]), obj, new_value)
```

and get back a new object with the focus replaced, leaving the
original untouched.

## The ten functions

| Name | Signature | Description |
| --- | --- | --- |
| `lensNew` | `(get, set) -> Lens` | Build a lens from a getter and setter. |
| `lensGet` | `(l, obj) -> any` | Read the focus of a lens. |
| `lensSet` | `(l, obj, v) -> obj` | Write a new value at the focus; returns a new object. |
| `lensModify` | `(l, obj, fn) -> obj` | Apply `fn` to the focus; returns a new object. |
| `lensCompose` | `(a, b) -> Lens` | Compose two lenses (focus-of-focus). |
| `lensAt` | `(key) -> Lens` | Lens focusing the value at `key` in a record. |
| `lensIndex` | `(i) -> Lens` | Lens focusing the element at index `i` in an array. |
| `lensPath` | `(path) -> Lens` | Lens focusing a nested path of keys/indices. |
| `lensProp` | `(name) -> Lens` | Alias of `lensAt(name)` (Ramda-style spelling). |
| `lensOptional` | `(l) -> Lens` | Wrap a lens to return `undefined` on unreachable focus. |

## Purity invariant

All `set` operations return a **new** object/array; the input is never
mutated. Specifically:

- `lensAt(key).set(obj, v)` returns `{ ...obj, [key]: v }` — a shallow
  clone of `obj` with the key replaced.
- `lensIndex(i).set(arr, v)` returns `arr.slice()` with `out[i] = v` —
  a shallow clone of `arr` with the slot replaced.
- `lensPath(path).set(obj, v)` walks the path one level at a time,
  shallow-cloning each level so the rest of the structure is preserved.

This makes lenses safe to use in functional pipelines where the
original object must be retained (for example, in a state-reducer
pattern).

## Reading: `lensGet`

`lensGet` reads the focus. Missing keys or out-of-bounds indices return
`undefined`:

```aether
lensGet(lensAt("a"), { b: 1 })           // undefined
lensGet(lensIndex(10), [1, 2, 3])        // undefined
lensGet(lensPath(["a", "b", "c"]), { a: { b: 1 } })   // undefined
```

## Writing: `lensSet` and `lensModify`

`lensSet` writes a fixed value at the focus. `lensModify` applies a
function to the current focus and writes the result — equivalent to
`lensSet(l, obj, fn(lensGet(l, obj)))` but slightly more convenient.

```aether
let obj = { count: 10 };
let bumped = lensModify(lensAt("count"), obj, fn(v: int) -> int { v + 5 });
// bumped == { count: 15 }
// obj    == { count: 10 }  (unchanged)
```

## Composition: `lensCompose`

`lensCompose(a, b)` produces a lens that focuses on the part of `a`'s
focus that `b` further focuses on. Reading walks `a.get(b.get(obj))`;
writing writes through `b`, then through `a`.

```aether
let composed = lensCompose(lensAt("outer"), lensAt("inner"));
lensGet(composed, { outer: { inner: 42 } })   // 42
lensSet(composed, { outer: { inner: 1 } }, 99)
// { outer: { inner: 99 } }
```

Composition is the workhorse for nested updates: combine small,
single-focus lenses into a path-focusing lens with a single line of
code. For deep paths, `lensPath` is a more concise shortcut.

## Path lenses: `lensPath`

`lensPath(["a", "b", 2, "c"])` builds a lens that focuses the value at
`obj.a.b[2].c`. Reads return `undefined` if any intermediate is
missing; writes clone each level along the path, preserving the rest
of the structure.

```aether
let obj = { users: [{ name: "Alice" }, { name: "Bob" }] };
let out = lensSet(lensPath(["users", 1, "name"]), obj, "Robert");
// out == { users: [{ name: "Alice" }, { name: "Robert" }] }
// obj unchanged
```

Path steps may be strings (for object keys) or numbers (for array
indices). Mixing is fine: `lensPath(["a", 0, "b"])` is a legal path
that focuses `obj.a[0].b`. Setting through a path that mixes string
and numeric steps in the wrong slot (e.g. indexing an object with a
number, or an array with a string) throws.

## Optional lenses: `lensOptional`

`lensOptional(l)` wraps a lens so that `get` returns `undefined`
instead of throwing when the focus isn't reachable (missing key,
out-of-bounds index, null parent). `set` continues to throw on
unreachable foci — silently inserting a value at a path that doesn't
exist is rarely what the caller intended, so the wrapper deliberately
does not swallow set errors. The one exception is `set` with
`undefined` as the new value, which is a no-op if the focus doesn't
exist (this lets you write `lensSet(opt, obj, undefined)` as a safe
"clear if present" operation).

## Limitations

- Lenses are untyped at the FFI boundary: `lensGet` returns `any`
  rather than a typed `V`. Type the carrier and focus through comments
  or wrappers in Aether; the runtime relies on duck typing.
- Shallow cloning only: `lensAt` / `lensIndex` / `lensPath` all use
  `{ ...obj }` or `arr.slice()`. Deeply nested objects outside the
  focus path are shared by reference. If you need a fully deep clone,
  post-process the result.
- `lensIndex` set throws when the index is out of bounds. To append,
  use the stdlib `push` builtin instead of a lens.
- `lensPath` set throws when an intermediate focus isn't an object or
  array, or when the path tries to index an object with a number (or
  vice versa). This is intentional: type errors at the path level
  should fail loudly.
- `lensOptional` only catches "not found" panics on `get`. Other
  runtime errors (e.g. attempting to set through a non-object) still
  propagate.

## Test coverage

The test suite in `index.test.ts` contains 25 cases covering:

- construction (`lensNew`) with valid and invalid arguments;
- `lensGet`, `lensSet`, `lensModify` happy paths;
- purity invariant (original object untouched after `set`);
- `lensAt` for existing, missing, and null objects;
- `lensIndex` for in-bounds and out-of-bounds gets, in-bounds sets,
  and out-of-bounds sets (which throw);
- `lensPath` for nested gets, gets through array indices, missing
  intermediates, and nested sets (with purity check);
- `lensProp` as an alias of `lensAt`;
- `lensCompose` for read, write, and modify through two composed
  lenses;
- `lensOptional` for missing foci (returns `undefined`), present
  foci (forwards to inner lens), and `set undefined` on a missing
  focus (no-op).
