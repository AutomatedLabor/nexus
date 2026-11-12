# markdown_render.ae

A tiny Markdown-to-HTML renderer. We support a small subset:

- `# Heading 1` → `<h1>...</h1>`
- `## Heading 2` → `<h2>...</h2>`
- `### Heading 3` → `<h3>...</h3>`
- `* item` → `<ul><li>item</li>...</ul>` (consecutive `*` lines)
- `**bold**` → `<strong>bold</strong>`
- plain paragraph → `<p>...</p>`

Inline formatting (`**bold**`) is applied within paragraphs and
list items; headings are rendered plain (no inline formatting).

## What it does

1. **`index_of(s, sub, from)`** — find substring `sub` in `s`
   starting at `from`. Returns -1 if not found.
2. **`slice_str(s, lo, hi)`** — slice `s` from `lo` (inclusive)
   to `hi` (exclusive).
3. **`render_inline(text)`** — recursive inline formatter. Finds
   `**`, locates the closing `**`, recurses on the inner text,
   and wraps with `<strong>...</strong>`.
4. **`heading_level(line)`** — count leading `#` chars (1..6);
   return the level, or 0 if not a heading.
5. **`trim(s)`** — strip leading/trailing whitespace.
6. **`split_lines(s)`** — split a string on `\n` into a list of
   lines.
7. **`render(md)`** — walk lines, emit headings, lists (with
   `<ul>` open/close tracking), and paragraphs.
8. **Driver** — renders a small Markdown source to HTML and
   prints both.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/markdown_render.ae
```

## Key language features

- **Recursion** for inline formatting (handles nested bold like
  `**a **b** c**`).
- **String indexing and slicing** via `str(s[i])` and `slice_str`.
- **Boolean tracking of `in_list`** to open/close the `<ul>`
  block at the right moments.
- **`while` loops** everywhere — sidesteps the for-loop-scope
  quirk.
- **`if/else` with `;`** before another statement — required by
  the parser.

## Expected output

```
== Markdown renderer ==

input markdown:
# Hello, Aether!

This is a **bold** paragraph.

## Section 2

* one
* two
* three with **bold** text

### Subsection

Final paragraph.

rendered HTML:
<h1>Hello, Aether!</h1>
<p>This is a <strong>bold</strong> paragraph.</p>
<h2>Section 2</h2>
<ul>
  <li>one</li>
  <li>two</li>
  <li>three with <strong>bold</strong> text</li>
</ul>
<h3>Subsection</h3>
<p>Final paragraph.</p>

All assertions passed.
```

## Design notes

- The renderer is intentionally tiny — no links, no images, no
  nested lists, no code blocks. The goal is to show the basic
  structure of a line-oriented, state-tracking parser.
- The `in_list` flag is the key state: it opens `<ul>` when the
  first `* item` line is seen, and closes `</ul>` when the next
  non-list line is seen (or at end-of-input).
- Inline formatting is recursive so it can handle nesting (e.g.,
  `**a **b** c**` → `<strong>a <strong>b</strong> c</strong>`).
  The current implementation doesn't actually nest — it would
  need a stack — but the recursive structure makes it easy to
  extend.
- Compare to `expression_formatter.ae` (already in the repo)
  which formats a different language (math expressions) using
  similar recursive descent.
