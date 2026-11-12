# aether-apps/markdown-engine

A real markdown → HTML renderer written in pure Aether. The
engine is a single 300-LoC module (`src/markdown.ae`) with two
public functions: `new()` and `render(state, md)`. It supports
the common subset of markdown that you'd find in a project's
README, a blog post, or a documentation page, and produces
valid HTML.

## Public surface

```aether
import { new, render } from "aether-apps/markdown-engine/src/markdown.ae";

let state = new();
let html = render(state, "# Hello, world\n\nThis is a **markdown** doc.");
```

- `new() -> MdState` — create a fresh engine state. The state
  is a placeholder struct reserved for future options (escape
  mode, base URL for relative links, etc.); in v1 it's an empty
  struct.
- `render(state: MdState, md: string) -> string` — render a
  markdown document to an HTML string. The state is currently
  unused (the placeholder exists for forward compatibility with
  per-render options); passing `new()` is fine.

## Supported markdown constructs

| Construct | Syntax | Output |
| --- | --- | --- |
| Heading h1 | `# text` | `<h1>text</h1>` |
| Heading h2 | `## text` | `<h2>text</h2>` |
| Heading h3 | `### text` | `<h3>text</h3>` |
| Heading h4 | `#### text` | `<h4>text</h4>` |
| Heading h5 | `##### text` | `<h5>text</h5>` |
| Heading h6 | `###### text` | `<h6>text</h6>` |
| Unordered list | `* item` or `- item` | `<ul><li>item</li></ul>` |
| Ordered list | `1. item` | `<ol><li>item</li></ol>` |
| Bold | `**text**` | `<strong>text</strong>` |
| Italic | `*text*` | `<em>text</em>` |
| Inline code | `` `text` `` | `<code>text</code>` |
| Link | `[text](url)` | `<a href="url">text</a>` |
| Blockquote | `> text` | `<blockquote>text</blockquote>` |
| Fenced code block | ` ``` `...` ``` ` | `<pre><code>...</code></pre>` |
| Horizontal rule | `---` | `<hr/>` |
| Paragraph | (plain text) | `<p>text</p>` |

### HTML escaping

The engine HTML-escapes `<`, `>`, and `&` in normal text and
inline code. Inside fenced code blocks, the entire content is
escaped (so `<html>` in a code block renders as
`&lt;html&gt;`). Inside link URLs, `"` is also escaped as
`&quot;` (in case the URL contains a literal quote).

## Architecture

The engine is a two-pass renderer:

1. **Block-level pass** (the `render` function): scans the
   input line-by-line and dispatches each line to a block
   handler based on its prefix. The handlers emit the
   appropriate HTML block (`<h1>`, `<ul>`, `<pre><code>`,
   etc.) and track the current state (in-paragraph, in-ul,
   in-ol, in-code-block) so they can close open blocks when
   the block type changes.

2. **Inline pass** (the `inline` function): processes the
   body of each block (heading text, list item text,
   paragraph text, etc.) and replaces inline markup
   (`**bold**`, `*italic*`, `` `code` ``, `[text](url)`)
   with the corresponding HTML tags. The inline pass is a
   single left-to-right scan that recognizes each marker
   when it sees it; nesting is not supported in this v1.

The block-level pass maintains four state flags:
`in_paragraph`, `in_ul`, `in_ol`, `in_code`. When a new block
starts, it closes any open blocks of different types; when a
blank line is encountered, all open blocks are closed. Fenced
code blocks are special — lines inside them are passed through
verbatim (after HTML escaping) until the closing ` ``` ` is
found.

The inline pass is recursive: the contents of `<strong>`,
`<em>`, and `<a>` are passed through `inline` again, so you
can nest `*italic*` inside `**bold**` (e.g. `**bold *and
italic**` works). The recursion is bounded by the input
length.

## Aether-specific implementation notes

The engine was written to avoid three known v1 evaluator
quirks (documented in the project's `PROGRESS.md`):

1. **For-loop-scope bug** — every iteration uses `while`
   with explicit indices, never `for`.
2. **`return X;` after a block** — the `render` and
   `inline` functions use bare-expression returns (e.g.
   `out` at the end of `inline`), and the `render` function
   accumulates output in a `let mut html = "";` rather than
   building it via early returns.
3. **`/` float division** — the engine never divides; all
   arithmetic is integer addition / subtraction / comparison.

In addition, the v1 parser is strict about semicolons after
`if ... { ... }` blocks when they're used as statements (not
the last expression of a function). Every such block in the
engine is followed by `;`, which the parser requires. This is
verbose but unambiguous.

The engine uses only the following Aether builtins:
`push`, `len`, `charCode`, `str`, `type_of`, `panic`. No
external packages, no host functions, no I/O. The `new()`
function returns a struct (the `MdState`); the `render`
function takes the state and a markdown string and returns an
HTML string. There are no side effects beyond the function
return value.

## Example

```aether
import { new, render } from "aether-apps/markdown-engine/src/markdown.ae";

let state = new();
let md = "# Hello\n\nThis is **bold** and *italic*.\n\n- a\n- b\n";
let html = render(state, md);
print(html);
```

Output:

```
<h1>Hello</h1>
<p>This is <strong>bold</strong> and <em>italic</em>.</p>
<ul>
<li>a</li>
<li>b</li>
</ul>
```

A more complete example (with a heading, paragraph, lists,
blockquote, code block, and horizontal rule) is in
`examples/example.ae`.

## Tests

The test suite in `tests/tests.ae` contains 35 assertions
covering every supported construct:

- Each heading level (h1 through h6).
- A line with seven `#`s is NOT a heading (it's a paragraph).
- Single-line and multi-line paragraphs.
- Unordered lists with `*` and `-`.
- Ordered lists with `1.`, `2.`, `3.`.
- Blockquote.
- Horizontal rule.
- Fenced code blocks (including HTML-escaping inside).
- Inline bold, italic, code, link.
- Inline combinations (e.g. `**bold** and *italic*`).
- HTML escaping in text.
- Mixed documents (heading + paragraph + list, etc.).
- Empty input.
- Links with special chars in the URL (e.g. `?a=1&b=2`).

Run the tests via the module loader:

```bash
bun -e "import {runModule} from '/home/z/my-project/aether/core/modules/modules'; \
  const r = runModule('/home/z/my-project/aether-apps/markdown-engine/tests/tests.ae', \
  {maxSteps:50000000}); console.log('err=', r.error ?? 'none');"
```

If all assertions pass, the test file prints "All 0 assertions
passed." and exits cleanly (the "0" is because the test file
doesn't track a count — it relies on `assert_eq` to panic on
mismatch).

## Limitations of v1

The engine supports the common subset of markdown that you'd
find in a project's README. The following constructs are
**not** supported in v1:

- **Nested lists** — no indented sub-items. Every `* ` or
  `1. ` line is a top-level list item.
- **Reference-style links** — `[text][1]` / `[1]: url`. Only
  inline links `[text](url)` are supported.
- **Images** — `![alt](url)`. Image tags would need to be
  added to the inline parser.
- **Tables** — the pipe-table syntax (`| a | b |`).
- **Multi-line blockquotes** — each `>` line is its own
  `<blockquote>`; consecutive `>` lines don't merge.
- **Setext-style headings** — `===` or `---` under a
  paragraph line. The engine treats `---` as a horizontal
  rule.
- **Nested inline markup** — the inline parser does recurse
  on `<strong>`, `<em>`, and `<a>` contents, but you can't
  put `**bold**` inside `` `code` `` (code blocks disable
  inline parsing).

Most of these are deliberate v1 scoping decisions; they'll
be added in v2 once the v1 surface is stable and the test
suite is comprehensive enough to detect regressions.

## Design choices

A few decisions worth documenting:

- **Line-by-line block parsing** rather than a streaming
  character parser. This is simpler and matches how most
  markdown engines work (CommonMark's reference implementation
  is also block-by-block). The trade-off is that some
  constructs (e.g. setext headings) need a 2-line lookahead,
  which the engine doesn't support in v1.

- **Recursive inline parser** for `<strong>`, `<em>`, and
  `<a>`. This makes `**bold *and italic**` work without
  special-casing. The recursion is bounded by the input
  length, so it's safe.

- **HTML escaping inside `<code>` blocks**. This is the
  correct behavior (raw `<` in a code block would be
  ambiguous with the start of a tag), but some markdown
  engines let you opt out. The engine escapes always.

- **No trailing newline normalization**. The engine preserves
  the line structure of the input; a blank line in the input
  becomes a block separator (closing any open paragraph /
  list), but the engine doesn't add or remove newlines beyond
  what's needed for valid HTML.

## License

Same as the rest of the Aether project (see the top-level
`LICENSE` file).

## See also

- `examples/markdown_to_html.ae` — a standalone example that
  renders a small markdown doc without using the app's
  package structure.
- `examples/markdown_render.ae` — another standalone example
  using a slightly different inline-parser design.
- The Aether `aether-string` package — provides `split`,
  `replace`, etc. that a more complete v2 could use to
  simplify the implementation.
