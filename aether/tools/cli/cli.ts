#!/usr/bin/env bun
/**
 * aether/tools/cli/cli.ts
 * =======================
 * The standalone `aether` CLI — runnable via `bun aether/tools/cli/cli.ts`.
 *
 * Commands:
 *   aether run <file.ae>          Compile + run on the tree-walker (default).
 *   aether run:vm <file.ae>       Compile + run on the bytecode VM.
 *   aether check <file.ae>        Compile + print type errors (exit 1 if any).
 *   aether test <dir>             Run all *.test.ae (and *.ae with assert/_eq).
 *   aether fmt <file.ae>          Re-indent based on brace depth (writes file).
 *   aether repl                    Interactive REPL (reads stdin if piped).
 *   aether new <name>              Scaffold a new project (main.ae + README + aether.toml).
 *   aether build <file.ae> -o <out>  Compile to bytecode + write assembled binary.
 *   aether help / (no args)        Print usage.
 *
 * Exit codes:
 *   0  Success (output printed, command completed).
 *   1  Compile / runtime / parse error in a `run`/`run:vm`/`check`/`test`/`build`.
 *   2  CLI usage error (unknown command, missing arg, file not found).
 *
 * Public surface (for tests):
 *   function main(argv: string[]): number   — entry point, returns exit code.
 *   function formatSource(src: string): string  — the inline formatter.
 *   Each command is a separate exported function so tests can call directly.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  compile,
  compileToVm,
  type CompileResult,
  type CompileVmResult,
} from "../../core/index";
import { assemble } from "../../vm/bytecode/bytecode";
import { runModule } from "../../core/modules/modules";

//----------------------------------------------------------------------------
// Usage / help
//----------------------------------------------------------------------------

const USAGE = `\
aether — the Aether language CLI

Usage:
  aether run <file.ae>              Compile + run on the tree-walker.
  aether run:vm <file.ae>           Compile + run on the bytecode VM.
  aether check <file.ae>            Compile + print type errors only.
  aether test <dir>                 Discover + run *.test.ae / *.ae with assert.
  aether fmt <file.ae> [--check]    Re-indent based on brace depth (writes file).
                                    With --check, exit 1 if the file would change.
  aether repl                       Interactive REPL (or read from stdin if piped).
  aether new <name>                 Scaffold a new project.
  aether build <file.ae> -o <out>   Compile to bytecode + write assembled binary.
  aether help                       Print this message.

Exit codes:
  0  Success.
  1  Compile / runtime / parse / test failure.
  2  CLI usage error (unknown command, missing arg, file not found).

Examples:
  aether run hello.ae
  aether run:vm hello.ae
  aether check hello.ae
  aether test .
  aether fmt hello.ae
  aether new myproject
  aether build hello.ae -o hello.aec
`;

//----------------------------------------------------------------------------
// Output / error helpers
//----------------------------------------------------------------------------

function out(s: string): void {
  process.stdout.write(s);
}

function err(s: string): void {
  process.stderr.write(s);
}

/** Read a file or exit 2 with a clear "file not found" message. */
function readSource(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (e) {
    err(`aether: cannot read '${filePath}': ${(e as Error).message}\n`);
    process.exit(2);
  }
}

//----------------------------------------------------------------------------
// Commands
//----------------------------------------------------------------------------

/**
 * `aether run <file.ae>` — compile + run on the tree-walker, print output.
 *
 * Detects multi-file programs (via `import` regex) and uses `runModule`
 * for those; single-file programs use `compile` directly. Both produce
 * the same output shape.
 *
 * Exits 1 on any compile / runtime error.
 */
export function cmdRun(filePath: string): number {
  const source = readSource(filePath);
  // If the source contains `import { ... } from "..."` or `import "..."`,
  // route through `runModule` for multi-file support.
  if (/^[ \t]*import[ \t]*(\{[^}]*\}[ \t]*from[ \t]*)?"[^"]+"[ \t]*;?[ \t]*$/m.test(source)) {
    const r = runModule(filePath);
    for (const line of r.output) out(line + "\n");
    if (r.error) {
      err(`aether run: error: ${r.error}\n`);
      return 1;
    }
    return 0;
  }
  const result: CompileResult = compile(source);
  for (const line of result.runtime?.output ?? []) out(line + "\n");
  if (result.errors.length > 0 || result.runtime?.error) {
    const msg = result.runtime?.error?.message ?? result.errors[0]?.message;
    err(`aether run: error: ${msg}\n`);
    return 1;
  }
  return 0;
}

/**
 * `aether run:vm <file.ae>` — compile + run on the bytecode VM.
 * Exits 1 on any compile / runtime error.
 */
export function cmdRunVm(filePath: string): number {
  const source = readSource(filePath);
  const result: CompileVmResult = compileToVm(source);
  for (const line of result.runtime?.output ?? []) out(line + "\n");
  if (result.runtime?.error) {
    err(`aether run:vm: error: ${result.runtime.error.message}\n`);
    return 1;
  }
  return 0;
}

/**
 * `aether check <file.ae>` — compile + print type errors only.
 * Exits 1 if there are any type errors. Exits 0 with "OK" if clean.
 *
 * Parse errors are also surfaced (they're more fundamental than type
 * errors). Lex errors likewise.
 */
export function cmdCheck(filePath: string): number {
  const source = readSource(filePath);
  const result = compile(source);
  let hadError = false;
  for (const e of result.errors) {
    err(`aether check: ${e.stage}: ${e.message}\n`);
    hadError = true;
  }
  if (hadError) return 1;
  out("OK\n");
  return 0;
}

/**
 * `aether test <dir>` — discover and run all `*.test.ae` files (or any
 * `*.ae` file containing `assert` / `assert_eq`) in the directory tree.
 *
 * Each file is compiled + run via `compile`. If the run produces a
 * runtime error, the test FAILS. If the run completes without error,
 * the test PASSES (the `assert_eq` calls inside the program will have
 * panicked on failure, surfacing as a runtime error).
 *
 * Prints one line per test: `PASS <file>` or `FAIL <file>: <error>`.
 * At the end, prints a summary: `N passed, M failed`.
 *
 * Exits 1 if any test failed, 0 otherwise.
 */
export function cmdTest(dir: string): number {
  if (!fs.existsSync(dir)) {
    err(`aether test: directory not found: '${dir}'\n`);
    return 2;
  }
  const files: string[] = [];
  function walk(d: string): void {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith(".ae")) files.push(p);
    }
  }
  walk(dir);
  // Filter: .test.ae files always run; other .ae files run only if they
  // contain assert / assert_eq.
  const tests = files.filter((f) => {
    if (f.endsWith(".test.ae")) return true;
    const src = fs.readFileSync(f, "utf8");
    return /\bassert(_eq)?\b/.test(src);
  });
  if (tests.length === 0) {
    out("aether test: no test files found in '" + dir + "'\n");
    return 0;
  }
  let pass = 0;
  let fail = 0;
  for (const t of tests) {
    const source = fs.readFileSync(t, "utf8");
    const result = compile(source);
    if (result.runtime?.error) {
      fail++;
      out(`FAIL ${t}: ${result.runtime.error.message}\n`);
    } else if (result.errors.length > 0 && result.runtime === null) {
      fail++;
      out(`FAIL ${t}: ${result.errors[0]?.message ?? "unknown error"}\n`);
    } else {
      pass++;
      out(`PASS ${t}\n`);
    }
  }
  out(`\n${pass} passed, ${fail} failed\n`);
  return fail > 0 ? 1 : 0;
}

/**
 * `aether fmt <file.ae>` — re-indent the source based on brace depth.
 * Writes the formatted source back to the file. With `--check`, exits 1
 * if the file would change (doesn't write).
 *
 * The formatter is intentionally simple (brace-depth-based indenting).
 * It is NOT a full pretty-printer — that's a Wave 3 deliverable. The
 * current formatter:
 *   - Strips trailing whitespace.
 *   - Re-indents each line to `braceDepth * 2` spaces.
 *   - Counts `{` and `}` (and `[` / `]`) at brace depth, but skips
 *     those inside string and char literals.
 *   - Keeps line and block comments intact (no reflow).
 *
 * This is enough to clean up the common case of inconsistent indentation;
 * a proper formatter (à la `gofmt` or `rustfmt`) is future work.
 */
export function cmdFmt(filePath: string, checkOnly = false): number {
  const source = readSource(filePath);
  const formatted = formatSource(source);
  if (checkOnly) {
    if (formatted !== source) {
      out(`aether fmt: '${filePath}' would change\n`);
      return 1;
    }
    return 0;
  }
  fs.writeFileSync(filePath, formatted, "utf8");
  out(`aether fmt: formatted '${filePath}'\n`);
  return 0;
}

/**
 * `aether repl` — interactive REPL, or read from stdin if non-interactive.
 *
 * For each line (or block ending in `;`), compile + run, print the value
 * of the last expression. Errors are caught and printed but don't exit
 * the REPL.
 *
 * In a non-TTY (piped) environment, the REPL reads all of stdin, splits
 * on `;` (with simple brace-depth awareness), and runs each chunk.
 *
 * Returns synchronously when the input is non-interactive (piped stdin);
 * returns a Promise<number> (exit code) for interactive mode (the
 * caller should `await` it or use `.then(code => process.exit(code))`).
 * The dispatcher in `main()` passes the value through; the entry-point
 * guard at the bottom of this file calls `process.exit(code)` regardless
 * of whether `code` is a number or a Promise<number>.
 */
export function cmdRepl(): number | Promise<number> {
  // For non-interactive use (piped stdin), read everything and run as one program.
  if (!process.stdin.isTTY) {
    const source = fs.readFileSync(0, "utf8"); // 0 = stdin
    const result = compile(source);
    for (const line of result.runtime?.output ?? []) out(line + "\n");
    if (result.runtime?.error) {
      err(`aether repl: error: ${result.runtime.error.message}\n`);
      return 1;
    }
    return 0;
  }
  // Interactive: line-by-line. This is a minimal REPL — each line is
  // compiled + run independently (no persistent env between lines yet).
  // A proper REPL with persistent env is a Wave 3 deliverable.
  out("aether repl — type :q to quit, :help for help\n");
  const readline = require("node:readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise<number>((resolve) => {
    rl.on("line", (line: string) => {
      if (line === ":q" || line === ":quit") { rl.close(); resolve(0); return; }
      if (line === ":help") { out(":q quit, :help help, otherwise type Aether code\n"); return; }
      try {
        const r = compile(line);
        for (const l of r.runtime?.output ?? []) out(l + "\n");
        if (r.runtime?.error) err(`error: ${r.runtime.error.message}\n`);
        else if (r.runtime && r.runtime.value !== null) out(`=> ${JSON.stringify(r.runtime.value)}\n`);
      } catch (e) {
        err(`error: ${(e as Error).message}\n`);
      }
      out("> ");
    });
    rl.on("close", () => resolve(0));
    out("> ");
  });
}

/**
 * `aether new <name>` — scaffold a new project at `<name>/`:
 *   - <name>/main.ae      — hello-world program.
 *   - <name>/README.md     — short project README.
 *   - <name>/aether.toml   — package manifest stub.
 * Exits 2 if the directory already exists.
 *
 * The `name` argument is the directory name (and the package name). If
 * the user passes a path like `/tmp/foo`, the directory is created at
 * that path and the package name is `path.basename(name)`.
 */
export function cmdNew(name: string): number {
  const dir = path.resolve(process.cwd(), name);
  if (fs.existsSync(dir)) {
    err(`aether new: directory '${dir}' already exists\n`);
    return 2;
  }
  const pkgName = path.basename(name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "main.ae"),
    `// ${pkgName} — an Aether program\n` +
      `// Run with: aether run main.ae\n\n` +
      `pub fn main() -> int {\n` +
      `  print("Hello, Aether!");\n` +
      `  0\n` +
      `}\n\n` +
      `print(main());\n`,
  );
  fs.writeFileSync(
    path.join(dir, "README.md"),
    `# ${pkgName}\n\n` +
      `An Aether program.\n\n` +
      `## Run\n\n` +
      `\`\`\`sh\n` +
      `aether run main.ae\n` +
      `\`\`\`\n\n` +
      `## Build\n\n` +
      `\`\`\`sh\n` +
      `aether build main.ae -o main.aec\n` +
      `\`\`\`\n`,
  );
  fs.writeFileSync(
    path.join(dir, "aether.toml"),
    `[package]\n` +
      `name = "${pkgName}"\n` +
      `version = "0.1.0"\n` +
      `edition = "v2"\n\n` +
      `[dependencies]\n` +
      `# aether-http = "1.2.3"\n` +
      `# serde = { version = "0.4", source = "github:aether-lang/serde" }\n`,
  );
  out(`aether new: created '${pkgName}' in '${dir}' (main.ae, README.md, aether.toml)\n`);
  return 0;
}

/**
 * `aether build <file.ae> -o <out>` — compile to bytecode, write the
 * assembled binary (uses `assemble` from `aether/vm/bytecode`).
 *
 * The output file contains the `BytecodeModule` serialized via
 * `assemble()` — magic `AETH` + version + func count + per-func blobs
 * (see `aether/vm/bytecode/bytecode.ts` for the format).
 *
 * Exits 1 on compile error, 2 on missing `-o`.
 */
export function cmdBuild(filePath: string, outPath: string | undefined): number {
  if (!outPath) {
    err(`aether build: -o <output> is required\n`);
    return 2;
  }
  const source = readSource(filePath);
  // Validate first via the tree-walker pipeline (which exposes parseErrors).
  const checkResult = compile(source);
  if (checkResult.parseErrors.length > 0) {
    err(`aether build: parse error: ${checkResult.parseErrors[0].message}\n`);
    return 1;
  }
  // Now compile to bytecode via the VM pipeline.
  const result = compileToVm(source);
  if (!result.ok && result.runtime?.error) {
    err(`aether build: compile error: ${result.runtime.error.message}\n`);
    return 1;
  }
  const bytes = assemble(result.bytecode);
  fs.writeFileSync(outPath, bytes);
  out(`aether build: wrote ${bytes.length} bytes to '${outPath}'\n`);
  return 0;
}

//----------------------------------------------------------------------------
// Inline formatter (brace-depth re-indenter)
//----------------------------------------------------------------------------

/**
 * Re-indent Aether source based on brace depth. Counts `{` `}` `[` `]`
 * `(` `)` (skipping those inside string and char literals), and indents
 * each line by `2 * braceDepth` spaces. Strips trailing whitespace.
 *
 * Algorithm:
 *   - Walk the source character by character, tracking `inString`,
 *     `inChar`, `inLineComment`, `inBlockComment`.
 *   - For each line, count the net change in brace depth (`{` `}` `(` `)`
 *     `[` `]` — but we only indent on `{}`; `()` and `[]` are inline).
 *   - Actually: indent based on `{` depth only. `()` and `[]` are
 *     usually on one line; if they span lines, the formatter doesn't
 *     indent them (matches the common case).
 *   - For each line:
 *       1. Determine the brace depth at the START of the line.
 *       2. Strip leading whitespace.
 *       3. Print `2 * depth` spaces, then the line.
 *       4. Update depth for the next line based on `{` `}` in this line.
 *   - Trailing whitespace stripped.
 *
 * This is intentionally simple — not a full pretty-printer. It handles
 * the common case of inconsistent indentation in hand-written Aether.
 */
export function formatSource(src: string): string {
  const hadTrailingNewline = src.endsWith("\n");
  const lines = src.split("\n");
  // If the source ends with a newline, split produces a trailing "" — drop
  // it so we don't re-indent an empty line; we'll re-add the newline below.
  if (hadTrailingNewline && lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  let depth = 0;
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+$/, "");
    const trimmedStart = line.replace(/^\s+/, "");
    // Empty / whitespace-only line — keep it blank (no indent).
    if (trimmedStart.length === 0) {
      out.push("");
      continue;
    }
    // Compute the indent for this line. If it starts with `}`, de-indent.
    const startsWithClose = trimmedStart.startsWith("}");
    const effectiveDepth = startsWithClose ? Math.max(0, depth - 1) : depth;
    out.push("  ".repeat(effectiveDepth) + trimmedStart);

    // Update depth based on the line's net `{` `}` (skipping strings/chars/comments).
    let inStr = false;
    let inChar = false;
    let inLineComment = false;
    let inBlockComment = false;
    for (let j = 0; j < trimmedStart.length; j++) {
      const c = trimmedStart[j];
      if (inLineComment) continue;
      if (inStr) {
        if (c === "\\") { j++; continue; }
        if (c === '"') inStr = false;
        continue;
      }
      if (inChar) {
        if (c === "\\") { j++; continue; }
        if (c === "'") inChar = false;
        continue;
      }
      if (inBlockComment) {
        if (c === "*" && trimmedStart[j + 1] === "/") { inBlockComment = false; j++; }
        continue;
      }
      if (c === "/" && trimmedStart[j + 1] === "/") { inLineComment = true; continue; }
      if (c === "/" && trimmedStart[j + 1] === "*") { inBlockComment = true; j++; continue; }
      if (c === '"') { inStr = true; continue; }
      if (c === "'") { inChar = true; continue; }
      if (c === "{") depth++;
      else if (c === "}") depth = Math.max(0, depth - 1);
    }
  }
  return out.join("\n") + (hadTrailingNewline ? "\n" : "");
}

//----------------------------------------------------------------------------
// Argument parsing + dispatch
//----------------------------------------------------------------------------

export interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0] ?? "help";
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      // `--flag value` or `--flag` (boolean).
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (a.startsWith("-") && a.length > 1) {
      const key = a.slice(1);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { command, positional, flags };
}

/**
 * The CLI entry point. `argv` should be `process.argv.slice(2)`.
 * Returns the exit code (or a Promise<number> for the async REPL);
 * tests can call this directly without spawning a subprocess.
 *
 * The dispatcher passes the value through; the entry-point guard at
 * the bottom of this file handles both `number` and `Promise<number>`
 * return values.
 */
export function main(argv: string[]): number | Promise<number> {
  const args = parseArgs(argv);
  switch (args.command) {
    case "help":
    case "--help":
    case "-h":
    case "":
      out(USAGE);
      return 0;
    case "run":
      if (args.positional.length < 1) {
        err("aether run: missing <file.ae>\n");
        return 2;
      }
      return cmdRun(args.positional[0]);
    case "run:vm":
      if (args.positional.length < 1) {
        err("aether run:vm: missing <file.ae>\n");
        return 2;
      }
      return cmdRunVm(args.positional[0]);
    case "check":
      if (args.positional.length < 1) {
        err("aether check: missing <file.ae>\n");
        return 2;
      }
      return cmdCheck(args.positional[0]);
    case "test":
      if (args.positional.length < 1) {
        err("aether test: missing <dir>\n");
        return 2;
      }
      return cmdTest(args.positional[0]);
    case "fmt":
      if (args.positional.length < 1) {
        err("aether fmt: missing <file.ae>\n");
        return 2;
      }
      return cmdFmt(args.positional[0], args.flags["check"] === true);
    case "repl":
      return cmdRepl();
    case "new":
      if (args.positional.length < 1) {
        err("aether new: missing <name>\n");
        return 2;
      }
      return cmdNew(args.positional[0]);
    case "build": {
      if (args.positional.length < 1) {
        err("aether build: missing <file.ae>\n");
        return 2;
      }
      const o = args.flags["o"];
      if (typeof o !== "string") {
        err("aether build: missing -o <output>\n");
        return 2;
      }
      return cmdBuild(args.positional[0], o);
    }
    default:
      err(`aether: unknown command '${args.command}'\n\n${USAGE}`);
      return 2;
  }
}

//----------------------------------------------------------------------------
// Entry point (only when run as a script, not when imported)
//----------------------------------------------------------------------------

// Guard against being imported (e.g. by tests in vitest's node env). The
// entry point only fires when this file is the main module. We use a
// runtime check that doesn't depend on `Bun` (which is undefined in the
// vitest node environment) or `import.meta.path` (which isn't in the
// standard TS lib types).
//
// The guard: only run if there's a `process` global AND we have CLI
// args beyond the script name AND `require.main !== module` doesn't
// disqualify us. The simplest cross-runtime check: when this file is
// invoked via `bun aether/tools/cli/cli.ts ...`, `process.argv[1]`
// points to this file. When imported by a test, `process.argv[1]`
// points to vitest's worker.
const isMainModule = (() => {
  if (typeof process === "undefined" || !process.argv || process.argv.length < 2) return false;
  const scriptArg = process.argv[1] ?? "";
  return scriptArg.endsWith("cli.ts") && scriptArg.includes("aether/tools/cli");
})();
if (isMainModule) {
  const code = main(process.argv.slice(2));
  if (typeof code === "number") {
    process.exit(code);
  } else {
    code.then((c) => process.exit(c)).catch(() => process.exit(1));
  }
}
