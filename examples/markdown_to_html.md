# markdown_to_html.ae

A tiny Markdown-to-HTML renderer. Supported syntax:

- `# h1`, `## h2`, `### h3` → `<h1>…</h1>` etc.
- `* item` → `<ul><li>…</li></ul>` (consecutive `*` lines)
- `**bold**` → `<strong>bold</strong>`
- `[text](url)` → `<a href="url">text</a>`
- plain paragraph → `<p>…</p>`

Inline formatting is applied within paragraphs and list
items; headings are rendered plain (no inline formatting) for
simplicity.

## What it does

1. **`trim(s)`** — strip leading/trailing whitespace.
2. **`index_of(s, sub, from)`** — find substring `sub` in `s`
   starting at `from`; return -1 if not found.
3. **`heading_level(line)`** — count leading `#` chars
   (1..6); return the level, or 0 if not a heading.
4. **`render_inline(text)`** — recursive inline formatter.
   Handles `**bold**` and `[text](url)`, recursing on the
   inner of `<strong>` and on link text.
5. **`split_lines(s)`** — split on `\n`.
6. **`render(md)`** — walk lines, emit headings, lists (with
   `<ul>` open/close tracking), and paragraphs.
7. **Driver** — renders a small Markdown source to HTML and
   prints both.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/markdown_to_html.ae
```

## Key language features

- **Recursion** for inline formatting (handles nested
  structures, e.g. `[**bold link**](url)`).
- **String indexing and slicing** via `strSlice`.
- **Boolean tracking of `in_list`** to open/close the `<ul>`
  block at the right moments.
- **`while` loops** everywhere — sidesteps the for-loop-scope
  quirk.

## Why two passes?

The line pass (in `render`) handles block structure
(headings, lists, paragraphs). The inline pass (in
`render_inline`) handles character-level markup (`**bold**`,
`[link](url)`). Splitting these into two passes is the standard
Markdown architecture — it keeps the line logic simple and the
inline logic recursive.

## Expected output

```
== Markdown -> HTML ==

input markdown:
# Hello, Aether!

This is a **bold** paragraph with a [link](https://example.com).

## Section 2

* one
* two with **bold** text
* three with [a](https://b.io) link

### Subsection

Final paragraph.

rendered HTML:
<h1>Hello, Aether!</h1>
<p>This is a <strong>bold</strong> paragraph with a <a href="https://example.com">link</a>.</p>
<h2>Section 2</h2>
<ul>
  <li>one</li>
  <li>two with <strong>bold</strong> text</li>
  <li>three with <a href="https://b.io">a</a> link</li>
</ul>
<h3>Subsection</h3>
<p>Final paragraph.</p>

All assertions passed.
```

## Design notes

- The renderer is intentionally tiny — no images, no code
  blocks, no nested lists, no escape sequences. The goal is
  to show the basic structure of a line-oriented,
  state-tracking parser.
- The `in_list` flag is the key state: it opens `<ul>` when
  the first `* item` line is seen, and closes `</ul>` when
  the next non-list line is seen (or at end-of-input).
- Compare to `markdown_render.ae` (already in the repo) which
  renders the same language subset but without the `[link](url)`
  support added here.
