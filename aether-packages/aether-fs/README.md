# aether-fs

> File system interface for Aether — 10 functions covering host-bound IO (`readFile`, `writeFile`, `fileExists`, `listDir`) and pure-Aether POSIX path manipulation (`pathJoin`, `pathSplit`, `pathExt`, `pathBase`, `pathDir`, `pathNormalize`).

Aether's stdlib `io` module ships `readFileSync`, `writeFileSync`, `fileExists`, plus a clock and `args`/`env`. It does not ship path manipulation, and it does not ship a `listDir` at all. `aether-fs` is the user-space package that fills both gaps:

- **IO** — `readFile`, `writeFile`, `fileExists` delegate to the host's `readFileSync`/`writeFileSync`/`fileExists` builtins (captured by the helper module `_host_fs.ae` so the package can re-export `fileExists` under the same name without shadowing). `listDir` always panics in the current build — there's no host builtin to delegate to.
- **Path ops** — `pathJoin`, `pathSplit`, `pathExt`, `pathBase`, `pathDir`, `pathNormalize` are pure Aether. They walk the string with `charCode`/`strSlice`/`len`, use POSIX semantics (forward slashes, no drive letters), and produce a normalised path. Windows paths are not handled; see the (future) `aether-fs-win` package.

The split between host-bound IO and pure path ops is deliberate. The IO functions need a real filesystem; on hosts without one (browser, sandboxed runtime, `bun -e` without `require`), they throw. The path ops are pure and run on every Aether runtime — tree-walker, VM, WASM, x86 — including the eventual self-hosted bootstrap.

## API

All 10 functions are `pub fn` declarations in `src/lib.ae`. The IO functions are not pure (they read/write the host's filesystem); the path ops are pure.

### Host-bound IO

| Function | Signature | Description |
| --- | --- | --- |
| `readFile(path)` | `(string) -> string` | Read a file as UTF-8. Delegates to host `readFileSync`. Throws on host error. |
| `writeFile(path, content)` | `(string, string) -> ()` | Write content to a file as UTF-8. Delegates to host `writeFileSync`. Throws on host error. |
| `fileExists(path)` | `(string) -> bool` | True if a file is accessible at `path`. Delegates to host `fileExists`. Throws on host error. |
| `listDir(path)` | `(string) -> [string]` | List directory entries. Always panics in current build (no host builtin to delegate to). |

### Path manipulation (pure Aether, POSIX semantics)

| Function | Signature | Description |
| --- | --- | --- |
| `pathJoin(a, b)` | `(string, string) -> string` | Join two path components with a single `/`. Absolute right operand wins. |
| `pathSplit(p)` | `(string) -> [string]` | Split a path into its non-empty components (no separators). |
| `pathExt(p)` | `(string) -> string` | File extension, including the leading dot. Empty if none. Leading-dot files have no ext. |
| `pathBase(p)` | `(string) -> string` | Final path component (the "filename"). |
| `pathDir(p)` | `(string) -> string` | Directory portion. Matches Python `os.path.dirname` (does not strip trailing slashes). |
| `pathNormalize(p)` | `(string) -> string` | Collapse `.` and `..` segments and duplicate slashes. |

## How to use

### As a dependency

Add `aether-fs` to your project's `aether.toml`:

```toml
[dependencies]
aether-fs = "0.1.0"
```

Then in your Aether source:

```aether
import { pathJoin, pathDir, pathBase, pathExt, pathNormalize } from "aether-fs";

let p = "/home/user/projects/aether/main.ae";
print(pathDir(p));        // /home/user/projects/aether
print(pathBase(p));      // main.ae
print(pathExt(p));       // .ae

let sibling = pathJoin(pathDir(p), "tests");
print(sibling);          // /home/user/projects/aether/tests
print(pathNormalize(sibling + "/../examples"));  // /home/user/projects/aether/examples
```

### Locally (without the registry)

```aether
import { pathSplit, pathJoin } from "./aether-packages/aether-fs/src/lib.ae";

let parts = pathSplit("a/b/c");
print(parts);             // [a, b, c]
print(pathJoin(parts[0], parts[1]));   // a/b
```

### Reading and writing files

The IO functions delegate to the host builtins. In Node, they work as expected:

```aether
import { writeFile, readFile, fileExists } from "aether-fs";

writeFile("/tmp/hello.txt", "hello, world");
print(fileExists("/tmp/hello.txt"));   // true
print(readFile("/tmp/hello.txt"));     // hello, world
```

In a browser or a sandboxed runtime without `require('fs')`, the host builtins throw `"io: fs unavailable"` or `"io.readFileSync: not available in browser"`. The package does not catch this — the error propagates to the caller, so the program fails loudly rather than silently doing the wrong thing.

### Running the test suite

```sh
aether test aether-packages/aether-fs/tests
# PASS aether-packages/aether-fs/tests/tests.ae
# 1 passed, 0 failed
```

The test file has 30+ `assert_eq` cases covering every path-manipulation function. The IO functions are not tested (they're host-bound and don't run in every environment).

### Running the example

```sh
aether run aether-packages/aether-fs/examples/example.ae
```

The example exercises every path-manipulation function with a small input. The IO functions are documented in the example's footer but not exercised (they would throw in the playground).

## Design notes

### Why is `listDir` a stub?

The host's stdlib `io` module ships `readFileSync`/`writeFileSync`/`fileExists` but no `listDir`. Adding one would require a new host builtin (`fs.readdirSync` on Node, `@nitrog7/file-system` on Bun, no equivalent on the browser) and corresponding changes to the runtime. For v3, the package documents the gap explicitly and panics with a clear message; a future `aether-fs-extra` may wire the host call.

### Why does `_host_fs.ae` exist?

For the same reason `aether-datetime`'s `_host_clock.ae` exists: to capture a same-named host builtin (`fileExists`) before the package's own `fileExists` declaration shadows it. The pattern is:

```aether
// _host_fs.ae
pub const HOST_FILE_EXISTS = fileExists;
```

```aether
// lib.ae
import { HOST_FILE_EXISTS } from "./_host_fs.ae";
pub fn fileExists(path: string) -> bool { HOST_FILE_EXISTS(path) }
```

Without the helper module, `pub fn fileExists(path: string) -> bool { fileExists(path) }` would be infinite recursion (the local `fileExists` shadows the host builtin everywhere in the same module). The const captures the host builtin's value at `_host_fs.ae`'s load time, before `lib.ae`'s `fileExists` declaration takes effect.

### Why POSIX-only path semantics?

POSIX (forward slashes, no drive letters) is the universal subset. Windows paths (`C:\`, backslashes, UNC paths) need their own package — `aether-fs-win` — because the parsing rules are different (backslash vs. forward slash, drive letters, case-insensitivity for some operations). For now, `aether-fs` handles POSIX paths; Windows users can convert with `replace_all` first.

### Why does `pathDir` match Python's `os.path.dirname` and not POSIX `dirname`?

POSIX `dirname("a/b/")` strips the trailing slash first and returns `"a"`. Python's `os.path.dirname("a/b/")` returns `"a/b"` (no stripping). We chose the Python behavior because it's more predictable — the caller's trailing slash survives the operation, which means round-tripping `pathDir(p) + "/" + pathBase(p)` recovers the original `p` exactly. With POSIX semantics, the trailing slash would be lost.

### Why does `pathExt` skip leading-dot files?

A file like `.gitignore` is a *hidden* file, not a file with extension `.gitignore`. This matches Python's `os.path.splitext(".gitignore")` → `(".gitignore", "")` and most Unix tools' behavior. Files like `file.tar.gz` correctly return `.gz` (the extension after the last dot).

### Why does `pathNormalize` allow `..` to escape the root for relative paths?

`pathNormalize("../a")` returns `"../a"` — the `..` is preserved because the path is relative and there's no parent to resolve against. `pathNormalize("/../a")` returns `"/a"` — the `..` is dropped because the path is absolute and the root has no parent. This matches Python's `os.path.normpath`.

## Implementation patterns

### Pattern 1: const-capture of a same-named builtin

The `_host_fs.ae` / `lib.ae` pattern (see "Why does `_host_fs.ae` exist?" above) is the canonical way to wrap a same-named host builtin. The same pattern is used by `aether-datetime` for `now`/`today` and would work for any other case.

### Pattern 2: pathSplit as the shared primitive

`pathSplit(p)` is the foundation that `pathBase` and `pathNormalize` build on:

- `pathBase(p)` returns `pathSplit(p).last`.
- `pathNormalize(p)` calls `pathSplit(p)`, processes the components (dropping `.`, popping for `..`), and rejoins with `/`.

Building `pathSplit` once and reusing it keeps the rest of the codebase small.

### Pattern 3: explicit absolute-path handling

`pathNormalize` tracks whether the path was absolute (starts with `/`) before splitting, then uses that flag during the rebuild to add the leading slash. This is cleaner than threading the slash through the component list.

## Future work

- **`listDir` with a host call.** A future `aether-fs-extra` could wire a host builtin (`fs.readdirSync`) for environments that have it. The current `aether-fs` deliberately ships the stub so callers see the limitation immediately.
- **`pathRelative(a, b)`.** Compute the relative path from `a` to `b`. Tricky for paths with no common prefix.
- **`pathResolve(p)`.** Resolve a path against the current working directory. Needs a `cwd()` host call (currently in `aether-process`).
- **Windows paths.** `aether-fs-win` would handle `C:\`, backslashes, and UNC paths. Parsing rules are different enough to justify a separate package.
- **Async IO.** `readFileAsync`/`writeFileAsync` that use the async runtime. Needs the v3 async coroutines.

## License

MIT — same as the Aether language.
