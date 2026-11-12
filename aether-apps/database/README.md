# aether-apps/database

A key-value store with a tiny SQL-ish query engine, written entirely in Aether. Two storage layers share one `DB` handle:

- a **KV store** backed by a real `Map` (via the stdlib `mapNew` / `mapSet` / `mapGet` family), keyed by any Aether value, with O(1) average `get` / `put` / `delete`;
- a **table**: an array of row `Map`s (column name → value), supporting `insert`, `select` (with column projection), `update`, `deleteRows`, and a tiny SQL-ish `query` parser.

The SQL-ish parser handles the subset:

```
SELECT <cols> FROM <table> [WHERE <col> = <literal> [AND <col> = <literal>]...]
```

where `<cols>` is either `*` or a comma-separated list of identifiers, `<table>` is an identifier (currently ignored — the table is always `db.rows`), and `<literal>` is an integer (with optional leading `-`), `true`, `false`, or a double-quoted string. Keywords (`SELECT`, `FROM`, `WHERE`, `AND`) are case-insensitive.

## Storage layout

A `DB` is a struct with four fields:

```aether
struct DB {
  storage: any,   // Map<any, any> — KV store
  rows: any,      // [Map<string, any>] — table rows
  columns: any,   // [string] — schema (best-effort, optional)
  next_id: int,   // auto-increment id for inserted rows
}
```

The sema doesn't accept generic struct field types like `map<string, any>`, so we use `any` and rely on the runtime to dispatch via the `mapNew` / `mapSet` / `mapGet` / `mapHas` / `mapDelete` / `mapKeys` / `mapValues` / `mapSize` stdlib builtins.

## Public surface (18 functions)

### KV store

- `new() -> DB` — return an empty DB (zero entries, zero rows, `next_id = 1`).
- `put(db, key, val) -> DB` — store `key -> val` in the KV map. Mutates `db.storage` in place; returns `db` so you can chain: `db = put(db, "k", 1)`.
- `get(db, key) -> any` — return the value for `key`, or unit `()` if not present.
- `getOr(db, key, default) -> any` — return the value for `key`, or `default` if not present.
- `delete(db, key) -> bool` — remove the entry for `key`. Returns `true` if it existed, `false` otherwise.
- `has(db, key) -> bool` — true if the key exists in the KV store.
- `scan(db, filter_fn) -> [any]` — return a list of `[key, val]` pairs (each pair is a 2-element array) where `filter_fn(key, val)` is true.
- `count(db) -> int` — number of entries in the KV store.
- `keys(db) -> [any]` — array of all keys in the KV store (insertion order, per JS `Map`).
- `values(db) -> [any]` — array of all values in the KV store (insertion order).

### Table

- `insert(db, row) -> int` — append a row (a `Map<string, any>`) to the table. If the row doesn't have an `id` field, one is auto-assigned from `db.next_id` (which is bumped). If the row has an explicit `id`, that id is used and `db.next_id` is bumped past it. Returns the row's id.
- `select(db, cols, where_fn) -> [any]` — return rows where `where_fn(row)` is true. If `cols` is empty, returns the whole row; otherwise projects only the named columns (preserving column order from the input list).
- `update(db, where_fn, update_fn) -> int` — for every row where `where_fn(row)` is true, call `update_fn(row)` (which mutates the row in place via `mapSet`). Returns the number of rows updated.
- `deleteRows(db, where_fn) -> int` — remove every row where `where_fn(row)` is true. Returns the number of rows deleted.
- `rowCount(db) -> int` — number of rows in the table.

### Display

- `to_table(rows) -> string` — render a list of row `Map`s as a pipe-separated table. The header is the union of every row's keys (preserving first-seen order). An empty input renders as `(empty table)`.

### SQL-ish query

- `query(db, sql) -> [any]` — parse and execute a tiny SQL subset (grammar above). Returns the resulting rows as a list of `Map`s (projected if columns are specified, full row if `*`).

## Example

```aether
import { new, put, get, insert, query, to_table } from "../src/db.ae";

let mut db = new();
db = put(db, "alpha", 1);
db = put(db, "beta", 2);
print(get(db, "alpha"));     // 1
print(get(db, "missing"));   // () (unit)

let r = mapNew();
mapSet(r, "name", "Ada");
mapSet(r, "age", 36);
insert(db, r);

let londoners = query(db, "SELECT name, age FROM t WHERE city = \"London\"");
print(to_table(londoners));
```

## SQL-ish parser internals

The parser is a tiny recursive-descent hand-rolled scanner. State is a `Parser` struct:

```aether
struct Parser {
  pos: int,
  src: string,
}
```

with helpers `peek`, `advance`, `skip_ws`, `read_word`, `parse_select`, `parse_from`, `parse_where`, `parse_condition`, `parse_literal`. All helpers close over the `Parser` struct and mutate `p.pos` in place.

The supported grammar:

```
sql        := "SELECT" cols "FROM" ident [where]
cols       := "*" | ident ("," ident)*
where      := "WHERE" cond ("AND" cond)*
cond       := ident "=" literal
literal    := int | "true" | "false" | "null" | string
string     := '"' char* '"'
int        := ["-"] digit+
ident      := alpha alnum*
```

`AND` is the only boolean combinator (no `OR`, no `NOT`). Equality (`=`) is the only comparison (no `<`, `>`, `<=`, `>=`, `!=`). The parser is case-insensitive on the SQL keywords (`SELECT`, `FROM`, `WHERE`, `AND`, `true`, `false`, `null`).

After parsing, `query` builds a single `where_fn(row) -> bool` closure that checks every parsed `[col, literal]` condition (short-circuits on the first miss) and forwards it to `select(db, cols, where_fn)`. The query engine is therefore just `parse → select`; no SQL execution planner.

## Equality semantics

`val_eq(a, b)` checks `type_of(a) == type_of(b)` first; if the types match and are `int`, `float`, `string`, or `bool`, it compares with `==`. For `unit`, two unit values are equal. For `array` and `map`, this minimal engine falls back to reference equality (which is rarely what you want — the parser only ever produces `int`, `bool`, and `string` literals, so this is fine in practice).

## What this is NOT

This is a teaching-grade demo, not a real database:

- **No persistence.** Everything lives in memory; when the program exits, the data is gone.
- **No transactions.** Updates are atomic per-row, but there's no `BEGIN` / `COMMIT` / `ROLLBACK`.
- **No indexes.** `select` / `update` / `deleteRows` are O(n) full-table scans. For small tables this is fine; for tens of thousands of rows you'd want a hash index on the columns you query.
- **No JOIN, GROUP BY, ORDER BY, LIMIT, OFFSET.** The SQL-ish parser only handles a single table with WHERE filters and column projection.
- **No type checking on column values.** A row can have any mix of `int`, `string`, `bool`, `()`. The `query` literal parser only produces `int`, `bool`, `string`, and `()` literals; other types (arrays, maps, structs) can't appear in a WHERE clause.
- **No concurrency.** Single-threaded; the `DB` is mutated in place, so concurrent access would need a mutex (Aether v1 has no green threads; `spawn` lives in the stdlib `async` module and is callable only from host code).

## Why this design

The point of this app is to demonstrate that Aether — even in its v1 form — has enough expressive power (closures, structs, real `Map`s, pattern matching, recursion, string manipulation) to host a small but real application, not just a single-file demo. The KV store uses the stdlib `Map` directly (no assoc-list workaround like `aether-dict`); the table is just an array of `Map`s; the SQL-ish parser is a hand-rolled recursive-descent scanner that builds a closure which the existing `select` machinery executes.

The whole module is ~620 lines of Aether with no native dependencies beyond the stdlib `map*` builtins. The test suite (`tests/tests.ae`) has 30+ assertions covering every public function and the SQL-ish parser; the example (`examples/example.ae`) walks through every public function and prints the results.

## Running

```bash
# Run the example (prints the demo session):
aether run aether-apps/database/examples/example.ae

# Run the tests (asserts via the test-runner):
aether test aether-apps/database/tests/tests.ae
```

Or from the host (without the CLI):

```bash
bun -e "import {runModule} from '/home/z/my-project/aether/core/modules/modules'; \
  const r = runModule('aether-apps/database/examples/example.ae', {maxSteps:5000000}); \
  console.log('lines=', r.output?.length, 'err=', r.error?.message??'none')"
```

The module loader (`aether/core/modules/modules.ts`) wires the stdlib builtins (`mapNew`, `mapSet`, `mapGet`, `mapHas`, `mapDelete`, `mapKeys`, `mapValues`, `mapSize`) into every module's run, so the database app has access to the real `Map` API without any host-side glue.

## File layout

```
aether-apps/database/
├── aether.toml           # package manifest
├── src/
│   └── db.ae             # the library (~620 LOC, 18 pub fns)
├── tests/
│   └── tests.ae          # 30+ top-level asserts
├── examples/
│   └── example.ae        # end-to-end demo
└── README.md            # this file
```

## Limitations and next steps

The natural follow-ups are:

- a `select_where_col_eq_lit(db, col, lit)` that uses a hash index on `col` (built lazily on first call, invalidated on `insert` / `update` / `deleteRows`);
- support for `OR` in the WHERE clause (it's a small change to `parse_where`: collect an OR-list of AND-lists);
- support for `<`, `>`, `<=`, `>=`, `!=` (each condition becomes `(col, op, lit)` instead of `(col, lit)`);
- support for `LIMIT n` and `ORDER BY col [ASC|DESC]`;
- a `schema(db)` function that returns the inferred column list (currently `db.columns` is best-effort and may be incomplete if rows are inserted out of order);
- a `dump(db) -> string` that serializes the whole DB to a single string (a poor man's `pg_dump`).

Each of these is a small, well-scoped addition; the parser is already structured to extend (a new clause is a new `parse_*` function and one more field on the parser state).
