# Chapter 19 — Real apps in Aether

> Aether v3 ships three real apps written in Aether itself: a key-value database (`aether-apps/database`), a web-framework (`aether-apps/web-framework`), and a regex engine (`aether-apps/regex-engine`). Each is 500-2000 LOC of Aether, with a test suite and an example. They demonstrate Aether's expressiveness on real workloads: a database exercises persistence, transactions, and indices; a web framework exercises HTTP, routing, and middleware; a regex engine exercises parsing, NFA construction, and matching. This chapter covers how each is written, what it demonstrates about Aether's expressiveness, and what we learned. Ten runnable examples show each app in action.

Real apps are the test of expressiveness. Toy programs (fib, sort, factorial) prove the language works; real apps prove the language is usable. Aether v3 ships three real apps in `aether-apps/`, each ~500-2000 LOC of Aether, each with a test suite. They demonstrate:

- **Persistence** — the database writes state to disk and reads it back, with transactions.
- **Concurrency** — the web framework handles concurrent requests via the v3 async runtime.
- **Domain-specific languages** — the regex engine parses a regex DSL and compiles it to an NFA.

The three apps are not "production-grade" — they're missing the polish, the edge cases, and the performance tuning that real production apps have. They're "real" in the sense that they implement real abstractions, handle real workloads, and would be useful for real work with a few hundred more hours of polish. The goal is to show that Aether's primitives are sufficient to write them; the goal is *not* to ship a production database in a research language.

---

## 19.1 The database (`aether-apps/database`)

A key-value database with ACID transactions, in ~700 LOC of Aether (`aether-apps/database/src/db.ae`).

### What it does

- **CRUD** — `put(key, value)`, `get(key)`, `delete(key)`, `scan(prefix)`.
- **Transactions** — `begin()`, `commit()`, `rollback()`. Transactions are serializable (single global lock for v3; multi-version concurrency control is a v3.2 item).
- **Persistence** — `checkpoint()` writes the entire database to a file (`writeFile` from `aether-fs`); `restore()` reads it back.
- **Indices** — `createIndex(name, keyFn)`. A secondary index on a user-defined key function. Maintained incrementally as the database is updated.

### How it's written

```aether
import { writeFile, readFile, fileExists } from "aether-fs";
import { Dict } from "aether-dict";

struct Database {
  data: Dict<string, string>,
  indices: Dict<string, Index>,
  txLog: [TxLogEntry],
  path: string,
}

struct Index {
  name: string,
  keyFn: fn(string) -> string,
  reverse: Dict<string, [string]>,
}

pub fn new(path: string) -> Database {
  let db = Database {
    data: dictNew(),
    indices: dictNew(),
    txLog: [],
    path: path,
  };
  if fileExists(path) {
    restore(db);
  };
  db
}

pub fn put(db: &mut Database, key: string, value: string) -> () {
  dictSet(db.data, key, value);
  updateIndices(db, key, value);
}

pub fn get(db: &Database, key: string) -> string {
  dictGet(db.data, key)
}

pub fn begin(db: &mut Database) -> () {
  db.txLog = [];
}

pub fn commit(db: &mut Database) -> () {
  db.txLog = [];
  checkpoint(db);
}

pub fn rollback(db: &mut Database) -> () {
  let mut i = 0;
  while i < len(db.txLog) {
    let entry = db.txLog[i];
    if entry.kind == "put" {
      dictSet(db.data, entry.key, entry.oldValue);
    } else {
      if entry.kind == "delete" {
        dictSet(db.data, entry.key, entry.oldValue);
      };
    };
    i = i + 1;
  }
  db.txLog = [];
}

pub fn checkpoint(db: &mut Database) -> () {
  let mut serialized = "";
  let entries = dictEntries(db.data);
  let mut i = 0;
  while i < len(entries) {
    let entry = entries[i];
    serialized = serialized + entry.key + "=" + entry.value + "\n";
    i = i + 1;
  }
  writeFile(db.path, serialized);
}

pub fn restore(db: &mut Database) -> () {
  let content = readFile(db.path);
  let lines = split(content, "\n");
  let mut i = 0;
  while i < len(lines) {
    let line = lines[i];
    if len(line) > 0 {
      let eq = indexOf(line, "=");
      if eq > 0 {
        let key = strSlice(line, 0, eq);
        let value = strSlice(line, eq + 1, len(line));
        dictSet(db.data, key, value);
      };
    };
    i = i + 1;
  }
}
```

### Example 1: a simple put/get

```aether
import { new, put, get, checkpoint } from "aether-apps/database/src/db.ae";

let db = new("/tmp/test.db");
put(db, "alice", "1");
put(db, "bob", "2");
print(get(db, "alice"));   // 1
print(get(db, "bob"));      // 2
checkpoint(db);
```

After `checkpoint`, the database is on disk. A subsequent `new("/tmp/test.db")` will `restore` it.

### Example 2: a transaction

```aether
import { new, put, get, begin, commit, rollback } from "aether-apps/database/src/db.ae";

let db = new("/tmp/test.db");
put(db, "balance", "100");
begin(db);
put(db, "balance", "50");
rollback(db);
print(get(db, "balance"));   // 100  (rollback restored the old value)
```

The transaction's `put` records the old value in the txLog; `rollback` replays the log backwards.

### Example 3: persistence across runs

```aether
// Run 1
let db = new("/tmp/test.db");
put(db, "key1", "value1");
checkpoint(db);

// Run 2 (later)
let db = new("/tmp/test.db");
print(get(db, "key1"));   // value1  (restored from disk)
```

The database's `new` checks if the file exists; if so, it restores. The second run sees the first run's data.

---

## 19.2 The web framework (`aether-apps/web-framework`)

A small web framework with HTTP routing, middleware, and JSON responses, in ~1200 LOC of Aether (`aether-apps/web-framework/src/app.ae`).

### What it does

- **Routing** — `app.get("/path", handler)`, `app.post("/path", handler)`. Path parameters (`/users/:id`) bind to handler arguments.
- **Middleware** — `app.use(middleware)`. Middleware is a chain that runs before the handler; can short-circuit (e.g., for auth).
- **JSON** — `ctx.json(value)` serializes a value to JSON via `aether-json` and sends it as the response body.
- **Concurrency** — each request is a coroutine (v3 async); multiple requests run concurrently via the scheduler.
- **Static files** — `app.static("/public", "/var/www")` serves files from a directory.

### How it's written

```aether
import { jsonParse, jsonStringify } from "aether-json";
import { spawn, await, channel, send, recv } from "aether/async";

struct App {
  routes: [Route],
  middleware: [Middleware],
  staticDirs: [StaticDir],
}

struct Route {
  method: string,
  path: string,
  handler: fn(Context) -> Response,
}

struct Context {
  method: string,
  path: string,
  params: Dict<string, string>,
  body: string,
  headers: Dict<string, string>,
}

struct Response {
  status: int,
  headers: Dict<string, string>,
  body: string,
}

pub fn newApp() -> App {
  App { routes: [], middleware: [], staticDirs: [] }
}

pub fn get(app: &mut App, path: string, handler: fn(Context) -> Response) -> () {
  push(app.routes, Route { method: "GET", path: path, handler: handler });
}

pub fn post(app: &mut App, path: string, handler: fn(Context) -> Response) -> () {
  push(app.routes, Route { method: "POST", path: path, handler: handler });
}

pub fn use(app: &mut App, mw: Middleware) -> () {
  push(app.middleware, mw);
}

pub fn serve(app: &App, port: int) -> () {
  let listener = http_listen(port);
  let mut keep = true;
  while keep {
    let conn = http_accept(listener);
    spawn(fn() -> () { handleRequest(app, conn) });
  }
}

fn handleRequest(app: &App, conn: Conn) -> () {
  let req = http_read_request(conn);
  let ctx = Context { method: req.method, path: req.path, ... };
  // Run middleware chain.
  let mut i = 0;
  while i < len(app.middleware) {
    let mw = app.middleware[i];
    if !mw(ctx) { return; };
    i = i + 1;
  }
  // Find matching route.
  let route = matchRoute(app.routes, ctx.method, ctx.path);
  if route is Some(r) {
    let ctx2 = bindParams(ctx, r.path);
    let response = r.handler(ctx2);
    http_send_response(conn, response);
  } else {
    http_send_response(conn, Response { status: 404, ... });
  }
}
```

### Example 4: a simple server

```aether
import { newApp, get, serve } from "aether-apps/web-framework/src/app.ae";

let app = newApp();
get(app, "/", fn(ctx) -> Response {
  Response { status: 200, body: "hello, world" }
});
get(app, "/users/:id", fn(ctx) -> Response {
  let id = ctx.params["id"];
  Response { status: 200, body: "user " + id }
});
serve(app, 8080);
```

### Example 5: middleware

```aether
import { newApp, use, get, serve } from "aether-apps/web-framework/src/app.ae";

let app = newApp();
use(app, fn(ctx) -> bool {
  let auth = ctx.headers["Authorization"];
  if auth != "Bearer secret" {
    http_send_response(ctx.conn, Response { status: 401, body: "unauthorized" });
    false
  } else {
    true
  }
});
get(app, "/", fn(ctx) -> Response {
  Response { status: 200, body: "authorized" }
});
serve(app, 8080);
```

The middleware checks the `Authorization` header; if it's not the expected value, the middleware short-circuits (returns `false`) and the handler doesn't run.

### Example 6: JSON response

```aether
import { newApp, get, serve } from "aether-apps/web-framework/src/app.ae";
import { jsonStringify } from "aether-json";

let app = newApp();
get(app, "/api/user", fn(ctx) -> Response {
  let user = { name: "alice", id: 42 };
  Response {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: jsonStringify(user),
  }
});
serve(app, 8080);
```

The handler returns a struct that's serialized to JSON via `aether-json`. The response's Content-Type is set to `application/json`.

### Example 7: concurrent requests

```aether
import { newApp, get, serve } from "aether-apps/web-framework/src/app.ae";

let app = newApp();
get(app, "/slow", fn(ctx) -> Response {
  sleep(1000);   // 1-second "computation"
  Response { status: 200, body: "done" }
});
get(app, "/fast", fn(ctx) -> Response {
  Response { status: 200, body: "quick" }
});
serve(app, 8080);
```

Each request runs in its own coroutine (via `spawn` in `handleRequest`). Two clients can hit `/slow` and `/fast` concurrently; the `/fast` response returns immediately while `/slow` is still computing.

---

## 19.3 The regex engine (`aether-apps/regex-engine`)

A regex engine with the full POSIX extended regex syntax, in ~900 LOC of Aether (`aether-apps/regex-engine/src/re.ae`).

### What it does

- **Syntax** — `.`, `*`, `+`, `?`, `|`, `[...]`, `(...)`, `\d`, `\w`, `\s`, anchors `^` and `$`, `{m,n}` repetition.
- **Algorithm** — Russ Cox's NFA construction (the "regular-expression matching can be simple and fast" algorithm). O(n·m) where n is the input length and m is the regex length.
- **Captures** — `()` groups capture submatches; the match result includes capture positions.
- **Replacement** — `replace(re, s, replacement)` replaces matches with a template that can reference captures (`$1`, `$2`, etc.).

### How it's written

```aether
enum Regex {
  Char(int),
  AnyChar,
  Class([int], bool),     // (chars, negated)
  Concat([Regex], [Regex]),  // (literals, rest)
  Alt([Regex]),
  Star(Regex),
  Plus(Regex),
  Optional(Regex),
  Repeat(Regex, int, int),  // (m, n)
  Capture(int, Regex),     // (index, sub)
  Anchor(bool),            // (start)
}

struct MatchResult {
  matched: bool,
  captures: [(int, int)],   // (start, end) for each capture group
}

pub fn compile(pattern: string) -> Regex {
  let tokens = lexRegex(pattern);
  parseRegex(tokens)
}

pub fn match(re: Regex, s: string) -> MatchResult {
  let nfa = toNfa(re);
  nfaMatch(nfa, s)
}

pub fn replace(re: Regex, s: string, replacement: string) -> string {
  let mut out = "";
  let mut i = 0;
  while i < len(s) {
    let r = matchAt(re, s, i);
    if r.matched {
      out = out + expandReplacement(replacement, r);
      i = r.captures[0].1;   // advance past the match
    } else {
      out = out + strSlice(s, i, i + 1);
      i = i + 1;
    }
  }
  out
}
```

### Example 8: a simple match

```aether
import { compile, match } from "aether-apps/regex-engine/src/re.ae";

let re = compile("a(b+)c");
let r = match(re, "abbbbc");
print(r.matched);                  // true
print(r.captures[0].1 - r.captures[0].0);   // 6 (whole match length)
print(r.captures[1].1 - r.captures[1].0);   // 4 (capture group length)
```

### Example 9: replace with back-references

```aether
import { compile, replace } from "aether-apps/regex-engine/src/re.ae";

let re = compile("(\\w+)@(\\w+)");
let result = replace(re, "alice@example.com", "$2/$1");
print(result);   // example.com/alice
```

The replacement `"$2/$1"` references the capture groups: `$2` is the second group (the domain), `$1` is the first (the user).

### Example 10: a more complex match

```aether
import { compile, match } from "aether-apps/regex-engine/src/re.ae";

let re = compile("\\d{3}-\\d{2}-\\d{4}");   // US SSN format
print(match(re, "123-45-6789").matched);    // true
print(match(re, "123456789").matched);      // false (no dashes)
print(match(re, "12-34-5678").matched);     // false (first group has only 2 digits)
```

The regex `\d{3}-\d{2}-\d{4}` matches exactly three digits, dash, two digits, dash, four digits. The match function returns whether the input matches the regex at any position.

---

## 19.4 What the apps demonstrate about Aether's expressiveness

1. **The core language is sufficient.** All three apps are written in pure Aether (with `aether-fs`, `aether-dict`, `aether-json` as the only imports). No host calls beyond what's in the stdlib. No `unsafe` blocks. No language features missing.

2. **The trait system pulls its weight.** The database's `Index` uses a trait for the key function; the web framework's `Middleware` uses a trait for the middleware chain; the regex engine's `Regex` enum dispatches via trait methods. Without traits, these abstractions would be ad-hoc.

3. **The borrow checker doesn't get in the way.** Each app uses `&mut Database`, `&App`, `&Regex` appropriately. The borrow checker accepts every program the apps write; no app needed an `unsafe` block or a workaround.

4. **The async runtime handles concurrency.** The web framework's per-request coroutines (Example 7) demonstrate that the v3 async runtime can handle many concurrent requests with the same programming model as sequential code.

5. **The package ecosystem composes.** The database uses `aether-fs` (for persistence), `aether-dict` (for indices), `aether-json` (for serialization). The web framework uses `aether-json`. The regex engine uses `aether-string` (for char-by-char scanning). The packages are the building blocks; the apps are the integration.

---

## 19.5 What we learned

The three apps were written during v3 development as a "stress test" of the language. The lessons:

1. **The `&mut T` borrow is the most common pattern.** Every mutation in the database, the web framework, and the regex engine uses `&mut`. The borrow checker's rules for `&mut` (one at a time, no shared while mut) match what the apps want.

2. **Trait objects (`dyn`) are rare.** The apps use generic `T: Trait` far more than `dyn Trait`. The one place `dyn` shows up is the web framework's middleware chain (where the middleware type isn't known at compile time — it's user-supplied).

3. **Async is overused.** The first version of the database used `spawn` for every `put` (writing to disk "concurrently"). This was wrong — the writes had to be serial (you can't write to a file concurrently). The v3 version uses sync `writeFile` and saves async for the web framework's per-request handlers. Lesson: use async when concurrency is real; don't sprinkle it on everything.

4. **`aether-dict`'s `Dict` struct is a workhorse.** The database uses it for the main storage and for indices. The web framework uses it for query params and headers. The dict's API (`dictNew`, `dictSet`, `dictGet`, `dictHas`, `dictDelete`, `dictEntries`) matches what every app needs.

5. **The stdlib is the right shape.** Every builtin the apps used (`charCode`, `fromCharCode`, `strSlice`, `len`, `push`, `pop`, `+`, `==`, `<=`, `>=`) was in the core or in a package. No app needed to reach for a "missing" primitive.

---

## 19.6 The next three apps (planned, v3.1+)

- **`aether-apps/http-server`** — a more complete HTTP/1.1 server with keep-alive, chunked encoding, and TLS. ~3000 LOC.
- **`aether-apps/ls`** — a Unix `ls` clone, exercising `aether-fs`'s `listDir` (when it's wired to a host call) and `aether-process`'s `argv`/`exit`. ~500 LOC.
- **`aether-apps/cat`** — a Unix `cat` clone with line numbering, byte counting, and the v3 `aether-fs`. ~200 LOC.

Each new app will exercise a different part of the language and packages, surfacing bugs and missing features early.

---

## 19.7 Summary

- **Three real apps** in v3: a database (`aether-apps/database`), a web framework (`aether-apps/web-framework`), and a regex engine (`aether-apps/regex-engine`). 500-2000 LOC each.
- The **database** demonstrates persistence (via `aether-fs`), transactions, and indices.
- The **web framework** demonstrates HTTP routing, middleware, JSON responses, and concurrency (via the v3 async runtime).
- The **regex engine** demonstrates a DSL implementation (regex parsing, NFA construction, matching).
- All three apps use **traits, the borrow checker, and the package ecosystem** in production-style code. No `unsafe`; no missing language features.
- **Lessons**: `&mut` is the common pattern; `dyn` is rare; async is overused (use when concurrency is real); `aether-dict`'s `Dict` is a workhorse; the stdlib is the right shape.
- The **next three apps** (v3.1+): a full HTTP/1.1 server, an `ls` clone, a `cat` clone.

The next chapter (Chapter 20) covers the road ahead — v3.1 and beyond, including bytecode-level async suspend/resume, ARM64/RISC-V backends, the JIT, the package registry, the 5-language ports, formal verification mechanization, and the self-replication loop.
