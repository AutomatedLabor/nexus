# aether/stdlib/optparse2

Companion module to `aether/stdlib/optparse`. The original `optparse`
module ships the ten core CLI-parser functions — `optNew`,
`optFlag`, `optString`, `optInt`, `optFloat`, `optParse`, `optHelp`,
`optHas`, `optGet`, `optPositional` — covering the everyday needs of
short CLIs. This module ships ten (plus one bonus) additional
helpers that come up in real CLIs:

| Function | Mutates? | Purpose |
| --- | --- | --- |
| `optSetProg(spec, name)` | spec | Set the program name shown in help text. |
| `optChoice(spec, name, short, def, choices, desc?)` | spec | String option restricted to a list of choices. |
| `optMulti(spec, name, short, def?, desc?)` | spec | Multi-value option (collect into array). |
| `optCount(spec, name, short, desc?)` | spec | Count flag occurrences (e.g. `-vvv = 3`). |
| `optRequire(spec, name)` | spec | Mark an option as required (checked by optFinalize). |
| `optAllowUnknown(spec, allow)` | spec | Toggle whether unknown options are tolerated. |
| `optGetAll(result)` | result (read-only) | Return all parsed values as a record (shallow copy). |
| `optGetDefault(result, name, def)` | result (read-only) | Get with an explicit fallback (ignores spec default). |
| `optDump(result)` | result (read-only) | Pretty-print the result for debugging. |
| `optShortHelp(spec)` | spec (read-only) | One-line usage summary (lighter than `optHelp`). |
| `optFinalize(spec, result)` | result | Post-parse: enforce required, choices, multi, count. |

The first six mutate or extend the existing `OptSpec` shape from
`optparse`; the next four are read-only accessors that operate on
the `OptResult` produced by `optparse.optParse`; `optFinalize` is
a post-parse processor that enforces the spec's `_required`,
`_choices`, `_multi`, and `_count` annotations. All eleven work
with the existing parser — you don't need a different `optParse2`;
`optParse` from `optparse` is still the parser.

## Why these eleven?

The original `optparse` covers flag/string/int/float options and
the basic parse + help flow. These eleven cover the gaps:

- **`optSetProg`** — the help text defaults to `Usage: program ...`;
  `optSetProg` lets you override "program" with your tool's name so
  the help text reads correctly. Trivial but easy to forget.
- **`optChoice`** — enum options. Common pattern: `--color red|green|blue`,
  `--log-level debug|info|warn|error`. The choice list is enforced
  by `optFinalize` (which throws on out-of-choices values) and
  displayed in the help text via the option's `description` field.
- **`optMulti`** — options that can be supplied more than once and
  accumulate into an array. Common pattern: `--include path1 --include
  path2`. The existing parser overwrites values on repeated options;
  `optFinalize` wraps a single supplied value into a 1-element array
  (so the caller always sees an array).
- **`optCount`** — flags that count occurrences. Common pattern:
  `-v` (verbose), `-vv` (more verbose), `-vvv` (debug). The existing
  parser only sees a boolean; `optFinalize` defaults unsupplied to 0.
- **`optRequire`** — mark an option as required. `optFinalize` throws
  if a required option wasn't supplied. The existing parser only
  supplies defaults, which doesn't distinguish "user explicitly set
  to default" from "user didn't supply".
- **`optAllowUnknown`** — toggle unknown-option tolerance. The
  existing spec has `allowUnknown` (defaults to false), but no setter;
  `optAllowUnknown` is the explicit setter. When true, unknown
  `--foo` is added to positionals rather than causing a parse error.
- **`optGetAll`** — return all parsed values as a plain record. The
  existing `optGet` returns one value at a time; `optGetAll` is for
  passing the whole config to a downstream function as a record.
- **`optGetDefault`** — get with an explicit fallback. The existing
  `optGet` returns the spec-level default when the option wasn't
  supplied; `optGetDefault` lets you override that fallback with a
  different one (e.g. "if not supplied, use the value from the config
  file rather than the spec's hard-coded default").
- **`optDump`** — pretty-print the result. Useful for debugging
  parsers and for `--debug` output in CLIs.
- **`optShortHelp`** — one-line usage summary. The existing `optHelp`
  produces a multi-line string listing every option; `optShortHelp`
  is for one-line summaries (e.g. in error messages or `--version`
  output).
- **`optFinalize`** — post-parse processor. Enforces the spec's
  `_required`, `_choices`, `_multi`, and `_count` annotations. Call
  this after `optParse` to validate and normalize the result.

## Aether usage

```aether
import {
  optNew, optFlag, optString, optInt, optParse, optHelp, optPositional,
} from "aether/stdlib/optparse";
import {
  optSetProg, optChoice, optMulti, optCount, optRequire,
  optAllowUnknown, optGetAll, optGetDefault, optDump, optShortHelp,
  optFinalize,
} from "aether/stdlib/optparse2";

let spec = optNew();
optSetProg(spec, "mytool");
optChoice(spec, "color", undefined, "red", ["red", "green", "blue"], "Color to use");
optMulti(spec, "include", "I", [], "Paths to include");
optCount(spec, "verbose", "v", "Verbosity level");
optRequire(spec, "color");
optAllowUnknown(spec, false);
optString(spec, "name", undefined, "", "Your name");
optInt(spec, "count", "c", 0, "Repeat count");
optFlag(spec, "dry-run", undefined, false, "Don't actually do anything");

let r = optParse(spec, ["--color", "green", "-vv", "-I", "src", "-I", "lib", "--name", "Alice"]);
optFinalize(spec, r);  // enforces _required, _choices, _multi, _count

print(optShortHelp(spec));
print(optDump(r));
let all = optGetAll(r);
let name = optGetDefault(r, "name", "Anonymous");
```

## How multi-value and count flags work

The existing `optParse` parser doesn't have native multi-value or
count support — it overwrites the value on each occurrence for
value-options, and sets `true` on each occurrence for flags. The
`optparse2` module sidesteps this by annotating options with
`_multi: true` or `_count: true` at declare time and post-processing
the result with `optFinalize`.

For `optMulti`: if the option was supplied once, `optFinalize`
wraps the single value into a 1-element array (so the caller always
sees an array). If the option wasn't supplied, `optFinalize` leaves
the spec's default in place (which `optMulti` initializes to `[]`).
Note that `optFinalize` cannot recover the full list of supplied
values when an option was supplied multiple times — the parser
already overwrote them. To get full multi-value semantics, the
caller must use a custom argv preprocessor (e.g. collect `--include
X --include Y` into `--include X,Y` before calling `optParse`).
This limitation is documented; a future v2 stdlib may add a
streaming parser.

For `optCount`: the parser only sees a boolean flag (true if
present). `optFinalize` defaults unsupplied to 0 (the spec's
default); the caller can read the boolean as a count proxy. Like
`optMulti`, recovering the actual occurrence count requires a
custom argv preprocessor.

For `optChoice`: `optFinalize` validates that the supplied value
is in the choices list and throws otherwise. The spec's default
must already be in the choices (validated at declare time).

For `optRequire`: `optFinalize` checks `result.supplied[name]` and
throws if the option wasn't supplied. Note: `optRequire` does NOT
mark the option as required in the parser itself — it only marks
it for `optFinalize` to check post-parse. The parser still supplies
the spec's default if the option is absent.

## Limitations

- `optMulti` and `optCount` can't recover the full list / count of
  occurrences from a single `optParse` call — the parser overwrote
  the values. Use a custom argv preprocessor if you need the full
  list/count.
- `optFinalize` mutates the result (it converts single values to
  arrays for `_multi` options, and 0-izes unsupplied `_count`
  options). Pass a copy if you need to preserve the original.
- `optChoice`'s choices list is stored on the option as a hidden
  `_choices` array; `optFinalize` reads it. If you manipulate the
  spec's options directly (e.g. via `spec.options["x"]._choices =
  [...]`), make sure to do it BEFORE calling `optFinalize`.
- `optAllowUnknown` toggles a spec-level flag; the parser respects
  it at parse time, not at finalize time.
- All functions throw plain `Error` on invalid input; the evaluator
  converts thrown errors into Aether panics.

## Test coverage

The test suite in `index.test.ts` contains 41 cases covering:

- the spec mutators (`optSetProg`, `optChoice`, `optMulti`,
  `optCount`, `optRequire`, `optAllowUnknown`) on their own;
- the read-only accessors (`optGetAll`, `optGetDefault`, `optDump`,
  `optShortHelp`) on parsed results;
- the post-parse processor (`optFinalize`) for required, choice,
  multi, and count options;
- error cases (non-spec input, non-OptResult input, default not in
  choices, missing required option, value outside choices, unknown
  option name for `optRequire`);
- pluralization (`optShortHelp` with 1 vs 2 options);
- the `optAllowUnknown` flag's effect on unknown long options
  (they become positionals rather than causing a parse error);
- the marking of supplied options in `optDump` (with `*`).
