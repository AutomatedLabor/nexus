# aether/stdlib/optparse

`optparse` is a tiny command-line option parser. It gives you just
enough structure to declare flags and typed options, parse an argv
array, and read the result. It's designed for short CLIs that don't
want to pull in a full argparse-style library.

## The ten functions

| Name | Signature | Description |
| --- | --- | --- |
| `optNew` | `() -> OptSpec` | Create a fresh, empty option parser spec. |
| `optFlag` | `(spec, name, short?, def?, desc?) -> OptSpec` | Declare a boolean flag. |
| `optString` | `(spec, name, short?, def?, desc?) -> OptSpec` | Declare a string option. |
| `optInt` | `(spec, name, short?, def?, desc?) -> OptSpec` | Declare an integer option. |
| `optFloat` | `(spec, name, short?, def?, desc?) -> OptSpec` | Declare a float option. |
| `optParse` | `(spec, argv) -> OptResult` | Parse argv against the spec. |
| `optHelp` | `(spec) -> string` | Build a multi-line help string. |
| `optHas` | `(result, name) -> bool` | True if the option was supplied by the user. |
| `optGet` | `(result, name) -> any` | Get the value of an option (or its default). |
| `optPositional` | `(result) -> string[]` | Return the array of positional arguments. |

## Supported syntax

The parser recognises these forms:

```
--flag            boolean flag (true if present)
--no-flag         boolean flag negation (false if present)
--opt value       long option with value (next argv element)
--opt=value       long option with value (same argv element)
-f                short flag (single char)
-fvalue           short flag with attached value (e.g. -n42)
```

Anything that isn't a flag/option is treated as a positional argument.
The first standalone `--` terminates option parsing; everything after
it is positional, even if it starts with `-`.

## Aether usage

```aether
import {
  optNew, optFlag, optString, optInt, optParse, optHelp, optHas, optGet,
  optPositional,
} from "aether/stdlib/optparse";

// Declare a spec
let spec = optNew();
spec = optFlag(spec, "verbose", "v", false, "verbose mode");
spec = optString(spec, "name", "n", "anon", "user name");
spec = optInt(spec, "count", "c", 0, "iteration count");

// Parse an argv
let argv = ["--verbose", "--name", "Alice", "-c42", "file.txt"];
let r = optParse(spec, argv);

// Read results
print(optGet(r, "verbose"));  // true
print(optGet(r, "name"));     // "Alice"
print(optGet(r, "count"));    // 42
print(optPositional(r));      // ["file.txt"]
print(optHas(r, "name"));    // true
print(optHas(r, "ratio"));   // false (not declared -> throws)

// Print help
print(optHelp(spec));
```

## Error handling

`optParse` throws on:

- Unknown options (e.g. `--bogus`), unless `spec.allowUnknown` is
  `true` (in which case the unknown option is treated as a positional).
- Missing values for value options (e.g. `--name` at the end of argv
  with no value to consume).
- Type coercion failures (e.g. `--count abc` when `count` is an int).
- Using `--no-NAME` on a non-flag option.
- Using `--NAME=value` on a flag (flags don't take values).

`optGet` throws if the option name wasn't declared on the spec —
this catches typos that would otherwise silently return `undefined`.

`optHas` and `optPositional` throw if their first argument isn't an
`OptResult` (i.e. not the return value of `optParse`).

## Defaults vs. supplied

Every option has a default value (which is set when the spec is built
via `optFlag` / `optString` / `optInt` / `optFloat`). When the option
isn't supplied on the command line, `optGet` returns the default.
When the option *is* supplied, `optHas` returns `true` and `optGet`
returns the parsed value.

This distinction is useful when you need to know whether the user
explicitly chose a value versus accepted the default. For example,
a CLI might want to print a warning when `--count` is supplied but
zero, but not when it's left at its default of zero.

## Help text

`optHelp(spec)` returns a multi-line string suitable for printing as
a usage message. Each option is shown with its short alias (if any),
its long form, its value type (for non-flag options), its default
value (if non-trivial), and its description (if any). The format is
intentionally simple:

```
Usage: program [options] [args...]

Options:
  -v, --verbose        verbose mode
      --name <string>  (default: "anon")    user name
  -c, --count <int>    iteration count
```

The `progName` field on the spec (defaults to `"program"`) appears in
the `Usage:` line. Override it by setting `spec.progName = "my-tool"`
before calling `optHelp`.

## Limitations

- Only long options (`--name`) and single-char short options (`-n`)
  are supported. There's no `-abc` cluster of multiple short flags
  (use `-a -b -c` instead).
- Option values are not validated beyond their declared type (int /
  float / string). For range or format validation, post-process the
  result with `optGet`.
- The parser does not support `--` followed by an option name as a
  way to disambiguate (e.g. `-- --verbose` would treat `--verbose` as
  a positional, not as a flag — this is intentional and matches the
  POSIX convention).
- `allowUnknown` is off by default; turning it on makes unknown long
  options silently flow into the positionals. This is rarely what you
  want; prefer to declare every option explicitly.
- The spec is mutable: `optFlag` etc. mutate the spec in place and
  return it for convenience. If you need to keep a pristine copy,
  clone the spec first.
- No sub-commands. For sub-command CLIs, build a separate spec per
  sub-command and dispatch on the first positional.

## Test coverage

The test suite in `index.test.ts` contains 25 cases covering:

- `optNew` returns a fresh spec;
- `optFlag` / `optString` / `optInt` / `optFloat` register options
  with the right kind, default, and short alias;
- duplicate-name detection on `optFlag`;
- short-alias validation (must be a single char);
- parsing of `--flag`, `--no-flag`, `--opt value`, `--opt=value`,
  `-f`, `-fvalue` forms;
- short-option value via attached form and next-arg form;
- int coercion success and failure (non-numeric throws);
- float parsing (close-to comparison);
- missing value (throws at end of argv);
- unknown option (throws by default);
- positionals (mixed with flags, after `--` separator, plain);
- `optHelp` output (contains `Usage:`, the long form, the short
  alias, and the description);
- `optGet` happy path, default fallback, and unknown-name throw;
- `optHas` returns the supplied flag correctly.
