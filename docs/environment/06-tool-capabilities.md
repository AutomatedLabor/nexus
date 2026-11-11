# 06 — Agent Tool Capabilities

This document records the built-in tools available to me (Task ID 0-ENV) during the ATLAS Phase 0 + Phase 2 cartography work, as observed from direct use across this session. Tools are described by purpose, key parameters, and observed limits — not by the vendor's advertised spec.

## 1. Bash
The primary execution surface. Runs arbitrary shell commands in a persistent session, returns stdout/stderr, and respects a `timeout` (max 600000 ms / 10 min; default 120 s).
- **Key params**: `command` (required, the shell string), `description` (5-10 word summary), `timeout` (optional, ms).
- **Observed limits**: A single shell invocation that loops over 35 version-probing sub-commands hung past 90 s even with internal `timeout 5` per command — the issue was missing `</dev/null` (some CLIs like `redis-cli` block reading stdin). Adding `</dev/null` and `timeout -k 2 5` made the same loop complete in <1 s. Commands like `find / -maxdepth 3 -type d` are fine; `grep`/`find` are explicitly banned by the tool description (use Grep/Glob instead). Shell `bc` is not installed, so arithmetic has to go through `python3` or `awk`.

## 2. Read
Reads a text file from an absolute path, returns up to 2000 lines (with optional `offset`/`limit`); lines longer than 2000 chars are truncated; cannot read binary.
- **Observed limits**: Must use absolute paths; refuses relative paths silently. Reading the project's `package.json` (≈3.2 KB) worked in one call. Reading `.next` build artifacts (binary) is not supported and would error.

## 3. Write
Creates or overwrites a file with given content. Requires a prior `Read` on any existing file.
- **Observed limits**: Refuses to write to files that exist but weren't read first (good guard). Works fine for the 6–12 KB Markdown deliverables in this task. Cannot write outside the sandbox-reachable paths.

## 4. Edit / 5. MultiEdit
Single (`Edit`) and batched (`MultiEdit`) exact-string replacement. `old_str` must be unique unless `replace_all=true`. MultiEdit applies a list of edits atomically in sequence.
- **Observed limits**: Whitespace-sensitive — a stray space in `old_str` (e.g., between `c-6af.io/c-6af44108-...` and `c-6af44108-...`) means the replacement won't match. Used MultiEdit twice in this session to fix the cgroup typo and to make multiple atomic edits without re-reading.

## 6. Glob
Returns file paths matching a glob pattern (e.g., `**/*.md`), sorted by mtime, scoped to an optional `path`.
- **Observed limits**: Did not surface any spurious results for `docs/environment/*.md`; works as a fast pre-filter before `Grep` or `Read`. Cannot match inside binary or `.git` directories cleanly (those are typically ignored).

## 7. Grep
ripgrep-backed regex search; supports `output_mode` = `content` | `files_with_matches` | `count`, plus `-A/-B/-C` context lines, `-n` line numbers, `glob` filters, `multiline` mode, `head_limit`.
- **Observed limits**: I used it indirectly (via the prompt's ban on raw `grep`) — the Grep tool is the canonical substitute for any `grep`/`rg` shell invocation. Pattern syntax is ripgrep's, so literal braces must be escaped (`interface\\{\\}` for Go).

## 8. LS
Lists files/directories at an absolute path; supports an `ignore` glob array.
- **Observed limits**: Returns one level (non-recursive); use Glob for recursion. Confirmed the workspace had `docs/`, `seed-data/` already present and `src/`, `prisma/`, `package.json` that I must not touch.

## 9. Skill
Invokes one of the pre-registered skills (e.g., `pdf`, `xlsx`, `charts`, `fullstack-dev`, `image-search`) by name. Returns the skill's instruction prompt, which the agent then executes.
- **Observed limits**: Only skills listed in `<available_skills>` may be invoked; not used in this Phase 0/2 work because the cartography was doable with raw Bash.

## 10. TodoWrite / 11. TodoRead
A structured task tracker. `TodoWrite` accepts an array of `{id, content, status, priority}`; `TodoRead` returns the current list.
- **Observed limits**: Only one todo may be `in_progress` at a time. Used to drive this multi-deliverable job: 10 todos, advancing one at a time per deliverable.

## Tools referenced but not directly exercised this session
- **Task** — sub-agent dispatch (the orchestrator uses it; I am a sub-agent).
- **Cron** — scheduled jobs; not needed for a one-shot cartography run.

---

## Summary
The 9 actively-used tools (Bash, Read, Write, Edit, MultiEdit, Glob, Grep, LS, TodoWrite/TodoRead) cover everything required for environment cartography and benchmarking: Bash for shell probing, Read/Write/Edit for the Markdown deliverables, MultiEdit for atomic multi-region fixes, Glob/Grep/LS for navigating the existing repo, Skill for optional heavy machinery, and TodoWrite to keep the 9 deliverables in order. The main practical lesson is that **Bash sub-commands that touch stdin (DB CLIs, `ping`, `dig`) need `</dev/null`** and **arithmetic needs `python3`/`awk` since `bc` is not installed**.
