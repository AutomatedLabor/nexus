/**
 * aether/core/modules/modules.ts
 * ===============================
 * A REAL module resolver + loader for multi-file Aether programs.
 *
 * What this is
 * -----------
 * A file-based module system that maps `import { foo } from "./mod.ae";` to a
 * real file on disk, parses + compiles + runs each imported file in
 * topological order, collects each module's `pub` bindings as exports, and
 * wires the imports so an entry file can call functions defined in another
 * file. The implementation is host-side TypeScript (no parser changes); we
 * extract imports via regex, strip them before passing source to the existing
 * parser, and share values via the evaluator's `RunOptions.env`.
 *
 * Why regex preprocessing (and not parser changes)
 * -----------------------------------------------
 * The existing lexer recognizes `import`, `pub`, and `use` as keywords; the
 * parser handles `import "path" { names };` (path first, names after, no
 * `from` keyword) and `pub fn name(...)` (sets `exported: true` on FnDecl).
 * It does NOT support the RFC-003 form `import { names } from "path";`, the
 * `use` keyword, `pub const`, or `pub use`. The RFC explicitly allows the
 * source-preprocessing approach ("extract imports via regex, compile each
 * file, share exports"). We take that route — it's a smaller blast radius
 * (no parser regression risk) and it lets us support the RFC-003 import shape
 * the verification example uses (`import { greet } from "./utils.ae";`).
 *
 * Visibility
 * ----------
 * - `pub fn name(...)` → exported (parser sets `exported = true`).
 * - `pub const NAME = expr;` → exported (we transform to `const NAME = expr;`
 *   and record NAME for export collection after running).
 * - `pub use { a, b } from "./path";` → re-export (we collect `a, b` from the
 *   imported module's exports and add them to our own).
 * - `pub use name from "./path";` → re-export a single name.
 * - `pub use * from "./path";` → wildcard re-export (all exports).
 * - Non-`pub` items are private (visible only within the module).
 *
 * Resolution
 * ----------
 * Only relative paths are supported (the RFC-003 registry protocol is a v2.1
 * item). Paths starting with `./` or `../` are resolved against the importing
 * file's directory. The `.ae` extension is appended if missing. Absolute paths
 * are also accepted for programmatic use.
 *
 * Cycles
 * ------
 * RFC-003 says cycles are allowed (each module is initialized once; subsequent
 * imports see the partially-initialized module). The task spec for this v1
 * prototype says to *throw* with the cycle path, which is what we do. The v2
 * design will revisit partial-initialization semantics.
 *
 * Public surface
 * --------------
 *   interface Module
 *   class ModuleGraph
 *       resolveImport(importPath, fromFile) -> string
 *       load(path, opts?) -> Module
 *       resolveAll(entry) -> Module[]   (topological order, throws on cycle)
 *   function runModule(entryPath, opts?) -> { output, error? }
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { compile, type RunOptions, type Value } from "../index";
import { newEnv, type Env } from "../eval/eval";

//----------------------------------------------------------------------------
// Public types
//----------------------------------------------------------------------------

/** A loaded Aether module. */
export interface Module {
  /** Module name (the absolute file path; v2 will use dotted module paths). */
  name: string;
  /** Absolute file path. */
  path: string;
  /** Original source (before stripping). */
  source: string;
  /** Map of public export name → value (closures, constants, re-exports). */
  exports: Map<string, Value>;
}

/** Run options for the module loader. */
export interface ModuleRunOptions extends RunOptions {
  /**
   * If true, suppress stdout from imported library modules (only the entry
   * module's prints reach the output array). Default: true (production
   * behavior; library modules shouldn't print).
   */
  suppressLibraryStdout?: boolean;
}

/** Result of `runModule`. */
export interface RunModuleResult {
  /** Captured stdout, one entry per `print` from the entry module. */
  output: string[];
  /** Error message (lex/parse/type/runtime/import error), or undefined. */
  error?: string;
}

//----------------------------------------------------------------------------
// Import extraction (regex-based)
//----------------------------------------------------------------------------

/**
 * A parsed import: names to bind + (optional) alias + the import path.
 * `import { a, b as c } from "path";` →
 *   `[{ localName: "a", remoteName: "a" }, { localName: "c", remoteName: "b" }]`
 */
export interface ParsedImport {
  /** Names as bound in the importer's scope. */
  names: Array<{ localName: string; remoteName: string }>;
  /** The path string from the `from` clause. */
  path: string;
}

/** Match `import { a, b as c } from "path";` (with optional `;`). */
const IMPORT_RE = /^[ \t]*import[ \t]*\{([^}]*)\}[ \t]*from[ \t]*"([^"]+)"[ \t]*;?[ \t]*$/gm;

/** Match `import "path";` (whole-module import; we don't bind any names). */
const IMPORT_BARE_RE = /^[ \t]*import[ \t]*"([^"]+)"[ \t]*;?[ \t]*$/gm;

/**
 * Match `pub use { a, b } from "path";` and `pub use a from "path";` and
 * `pub use * from "path";`. We support three shapes:
 *   - `pub use { a, b } from "path";` — re-export listed names.
 *   - `pub use a from "path";` — re-export a single name.
 *   - `pub use * from "path";` — wildcard re-export (all of `path`'s exports).
 * The optional trailing `;` is allowed but not required.
 */
const PUB_USE_LIST_RE = /^[ \t]*pub[ \t]+use[ \t]*\{([^}]*)\}[ \t]*from[ \t]*"([^"]+)"[ \t]*;?[ \t]*$/gm;
const PUB_USE_SINGLE_RE = /^[ \t]*pub[ \t]+use[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t]*from[ \t]*"([^"]+)"[ \t]*;?[ \t]*$/gm;
const PUB_USE_WILDCARD_RE = /^[ \t]*pub[ \t]+use[ \t]+\*[ \t]*from[ \t]*"([^"]+)"[ \t]*;?[ \t]*$/gm;

/** Match `pub const NAME = expr;` for export collection. */
const PUB_CONST_RE = /^[ \t]*pub[ \t]+const[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*([^;]+);[ \t]*$/gm;

/** Parse a `{ a, b as c }` import-list body into name pairs. */
function parseNameList(body: string): Array<{ localName: string; remoteName: string }> {
  return body
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      // `a as b` — localName `b`, remoteName `a`.
      const m = s.match(/^([A-Za-z_][A-Za-z0-9_]*)[ \t]+as[ \t]+([A-Za-z_][A-Za-z0-9_]*)$/);
      if (m) return { localName: m[2], remoteName: m[1] };
      // Just `a` — localName and remoteName are the same.
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) return { localName: s, remoteName: s };
      return null as unknown as { localName: string; remoteName: string };
    })
    .filter((x): x is { localName: string; remoteName: string } => x !== null);
}

/** Extract all imports from a source string. */
export function extractImports(source: string): ParsedImport[] {
  const out: ParsedImport[] = [];
  // `import { names } from "path";`
  for (const m of source.matchAll(IMPORT_RE)) {
    out.push({ names: parseNameList(m[1]), path: m[2] });
  }
  // `import "path";` — whole-module, no names bound. We still record it
  // so the dep gets loaded (for side effects / module initialization), but
  // no names are wired into the importer's env.
  for (const m of source.matchAll(IMPORT_BARE_RE)) {
    out.push({ names: [], path: m[1] });
  }
  return out;
}

/** Strip all import statements from a source string. */
export function stripImports(source: string): string {
  return source
    .replace(IMPORT_RE, "")
    .replace(IMPORT_BARE_RE, "");
}

/** Re-export spec: either listed names, a single name, or a wildcard. */
export interface PubUseSpec {
  /** Names to re-export from the dep. */
  names: Array<{ localName: string; remoteName: string }>;
  /** If true, re-export ALL of the dep's exports (wildcard). */
  wildcard: boolean;
  /** The dep path. */
  path: string;
}

/** Extract all `pub use ... from "..."` re-export specs. */
export function extractPubUses(source: string): PubUseSpec[] {
  const out: PubUseSpec[] = [];
  for (const m of source.matchAll(PUB_USE_LIST_RE)) {
    out.push({ names: parseNameList(m[1]), wildcard: false, path: m[2] });
  }
  for (const m of source.matchAll(PUB_USE_SINGLE_RE)) {
    out.push({ names: [{ localName: m[1], remoteName: m[1] }], wildcard: false, path: m[2] });
  }
  for (const m of source.matchAll(PUB_USE_WILDCARD_RE)) {
    out.push({ names: [], wildcard: true, path: m[1] });
  }
  return out;
}

/** Strip `pub use ...` statements from source. */
export function stripPubUses(source: string): string {
  return source
    .replace(PUB_USE_LIST_RE, "")
    .replace(PUB_USE_SINGLE_RE, "")
    .replace(PUB_USE_WILDCARD_RE, "");
}

/** `pub const` declaration extracted for export collection. */
export interface PubConstSpec {
  name: string;
  /** The initializer expression source. */
  expr: string;
}

/** Extract all `pub const NAME = expr;` declarations. */
export function extractPubConsts(source: string): PubConstSpec[] {
  const out: PubConstSpec[] = [];
  for (const m of source.matchAll(PUB_CONST_RE)) {
    out.push({ name: m[1], expr: m[2] });
  }
  return out;
}

/**
 * Transform `pub const NAME = expr;` → `const NAME = expr;` so the existing
 * parser handles it (it doesn't support `pub const`). The NAME is recorded
 * separately by `extractPubConsts` for export collection after running.
 */
export function stripPubConst(source: string): string {
  return source.replace(PUB_CONST_RE, (full, name, expr) => `const ${name} = ${expr};`);
}

/**
 * Apply all source-preprocessing transforms: strip imports + pub uses,
 * downgrade `pub const` → `const`. Returns the cleaned source plus the
 * extracted import / pub use / pub const specs.
 */
export interface PreprocessedSource {
  source: string;
  imports: ParsedImport[];
  pubUses: PubUseSpec[];
  pubConsts: PubConstSpec[];
}

export function preprocess(source: string): PreprocessedSource {
  const imports = extractImports(source);
  const pubUses = extractPubUses(source);
  const pubConsts = extractPubConsts(source);
  let cleaned = source;
  cleaned = stripImports(cleaned);
  cleaned = stripPubUses(cleaned);
  cleaned = stripPubConst(cleaned);
  return { source: cleaned, imports, pubUses, pubConsts };
}

//----------------------------------------------------------------------------
// ModuleGraph
//----------------------------------------------------------------------------

/**
 * Loads Aether modules, caching by absolute path. Detects cycles in the
 * current loading chain (per the task spec — RFC-003's "partial-initialization
 * on cycle" is a v2 follow-up).
 *
 * One `ModuleGraph` per `runModule` call (it carries the cycle stack and the
 * cache).
 */
export class ModuleGraph {
  private cache = new Map<string, Module>();
  private stack: string[] = [];
  /** Set if any load threw; surfaced via `runModule`'s `error`. */
  error?: string;

  //------------------------------------------------------------------
  // Path resolution
  //------------------------------------------------------------------

  /**
   * Resolve a (relative or absolute) import path against the importing file.
   *
   * - `./mod.ae` and `../mod.ae` resolve against the importer's directory.
   * - `/abs/path/mod.ae` is treated as absolute.
   * - Bare names like `aether.http.server` are NOT supported (registry is
   *   a v2.1 item) — they throw.
   * - The `.ae` extension is appended if missing.
   *
   * Throws if the resolved file doesn't exist.
   */
  resolveImport(importPath: string, fromFile: string): string {
    if (!importPath.startsWith("./") && !importPath.startsWith("../") && !path.isAbsolute(importPath)) {
      throw new Error(
        `module not found: '${importPath}' (only relative paths (./../) and absolute paths are supported; ` +
          `the RFC-003 registry protocol is a v2.1 item)`,
      );
    }
    const fromDir = path.dirname(fromFile);
    let resolved = path.resolve(fromDir, importPath);
    if (!resolved.endsWith(".ae")) resolved += ".ae";
    if (!fs.existsSync(resolved)) {
      throw new Error(`module not found: '${importPath}' (resolved to '${resolved}')`);
    }
    return resolved;
  }

  //------------------------------------------------------------------
  // Load + run
  //------------------------------------------------------------------

  /**
   * Load (parse + compile + run) the module at `absPath`, recursively loading
   * its imports first. Returns the cached Module.
   *
   * Throws on:
   *   - File not found (from `resolveImport`).
   *   - Missing export (importer asks for a name the dep doesn't export).
   *   - Circular dependency (the dep is already on the loading stack).
   *   - Compile / runtime error (lex / parse / type / runtime; surfaced via
   *     `this.error` and re-thrown).
   *
   * `opts.stdout` is used for the entry's prints; library modules (any
   * module loaded via a recursive `load` call from another module) get
   * stdout suppressed (unless `opts.suppressLibraryStdout === false`).
   */
  load(absPath: string, opts: ModuleRunOptions = {}, isEntry = false): Module {
    // Already loaded — return cached.
    if (this.cache.has(absPath)) return this.cache.get(absPath) as Module;

    // Cycle detection.
    if (this.stack.includes(absPath)) {
      const cycle = [...this.stack, absPath].join(" -> ");
      this.error = `circular dependency: ${cycle}`;
      throw new Error(this.error);
    }

    let source: string;
    try {
      source = fs.readFileSync(absPath, "utf8");
    } catch (e) {
      this.error = `cannot read file '${absPath}': ${(e as Error).message}`;
      throw new Error(this.error);
    }

    this.stack.push(absPath);

    const pre = preprocess(source);

    // Build the env, pre-populated with imported bindings.
    const env: Env = newEnv();

    // Recursively load each import; wire names into env.
    for (const imp of pre.imports) {
      const depAbs = this.resolveImport(imp.path, absPath);
      // Library modules: suppress stdout (per default opts).
      const depOpts: ModuleRunOptions = {
        ...opts,
        stdout: opts.suppressLibraryStdout === false ? opts.stdout : (() => {}),
      };
      const dep = this.load(depAbs, depOpts, false);

      // Wire names: each `import { remoteName as localName } from ...` binds
      // dep.exports[remoteName] to localName in this module's env.
      for (const n of imp.names) {
        const v = dep.exports.get(n.remoteName);
        if (v === undefined) {
          this.error = `module '${depAbs}' does not export '${n.remoteName}'`;
          throw new Error(this.error);
        }
        env.vars.set(n.localName, { value: v, mut: false });
      }
    }

    // Suppress stdout for library runs (only the entry's prints reach output).
    const stdout = isEntry
      ? opts.stdout ?? ((s: string) => { (this._entryOutput = this._entryOutput ?? []).push(s); })
      : () => {};

    // Compile + run the cleaned source.
    const result = compile(pre.source, { ...opts, env, stdout });
    if (result.runtime?.error) {
      this.error = `runtime error in '${absPath}': ${result.runtime.error.message}`;
      this.stack.pop();
      throw new Error(this.error);
    }
    // Parse errors are non-fatal in the playground lenient mode; surface them
    // as module-load errors here because a broken import should not silently
    // produce wrong exports.
    if (result.parseErrors.length > 0) {
      this.error = `parse error in '${absPath}': ${result.parseErrors[0].message}`;
      this.stack.pop();
      throw new Error(this.error);
    }

    // Build the Module.
    const mod: Module = {
      name: absPath,
      path: absPath,
      source,
      exports: new Map(),
    };

    // Collect `pub fn` exports (parser sets `exported = true` on FnDecl).
    for (const stmt of result.ast.body) {
      if (stmt.kind === "FnDecl" && (stmt as { exported?: boolean }).exported) {
        const v = env.vars.get(stmt.name);
        if (v) mod.exports.set(stmt.name, v.value);
      }
    }

    // Collect `pub const NAME = expr;` exports.
    for (const pc of pre.pubConsts) {
      const v = env.vars.get(pc.name);
      if (v) mod.exports.set(pc.name, v.value);
    }

    // Apply `pub use` re-exports.
    for (const u of pre.pubUses) {
      const depAbs = this.resolveImport(u.path, absPath);
      const dep = this.cache.get(depAbs) ?? this.load(depAbs, { ...opts, stdout: () => {} }, false);
      if (u.wildcard) {
        for (const [k, v] of dep.exports) mod.exports.set(k, v);
      } else {
        for (const n of u.names) {
          const v = dep.exports.get(n.remoteName);
          if (v === undefined) {
            this.error = `cannot re-export '${n.remoteName}' from '${depAbs}': not exported`;
            this.stack.pop();
            throw new Error(this.error);
          }
          mod.exports.set(n.localName, v);
        }
      }
    }

    this.cache.set(absPath, mod);
    this.stack.pop();
    return mod;
  }

  /** Output captured from the entry module's prints. */
  private _entryOutput?: string[];

  //------------------------------------------------------------------
  // Topological order
  //------------------------------------------------------------------

  /**
   * Resolve all modules reachable from `entry` in topological order (deps
   * first, entry last). Throws on cycle.
   *
   * Useful for build tools (e.g. `aether build`) that need to compile every
   * module in a project. The result includes the entry as the last element.
   */
  resolveAll(entry: string, opts: ModuleRunOptions = {}): Module[] {
    // Load everything (caches via this.cache). Throws on cycle.
    this.load(entry, opts, true);
    // The cache is populated in load order (deps first because each
    // load() recurses into deps before caching itself). Returning
    // Array.from(this.cache.values()) preserves that order.
    return Array.from(this.cache.values());
  }
}

//----------------------------------------------------------------------------
// runModule — the convenience entry point
//----------------------------------------------------------------------------

/**
 * Load + run an Aether entry file as a multi-file program.
 *
 * - Resolves `import { names } from "path";` against the entry's directory.
 * - Loads each dep in topological order, collecting `pub fn` / `pub const` /
 *   `pub use` exports.
 * - Wires imports into the entry's env (closures, constants, re-exports).
 * - Runs the entry, capturing stdout into `output`.
 * - Library modules' prints are suppressed by default; set
 *   `opts.suppressLibraryStdout = false` to include them.
 *
 * Returns `{ output, error? }`. On any load / compile / runtime error,
 * `error` is set and `output` contains any prints captured before the error.
 */
export function runModule(entryPath: string, opts: ModuleRunOptions = {}): RunModuleResult {
  // Resolve the entry to an absolute path first (so error messages are clear).
  const abs = path.isAbsolute(entryPath) ? entryPath : path.resolve(process.cwd(), entryPath);
  if (!fs.existsSync(abs)) {
    return { output: [], error: `entry file not found: '${abs}'` };
  }

  const output: string[] = [];
  const stdout = opts.stdout ?? ((s: string) => output.push(s));

  const graph = new ModuleGraph();
  try {
    graph.load(abs, { ...opts, stdout }, true);
  } catch (e) {
    return { output, error: graph.error ?? (e as Error).message };
  }
  return { output, error: graph.error };
}

//----------------------------------------------------------------------------
// Helpers re-exported for tests
//----------------------------------------------------------------------------

export type { Env, Value, RunOptions };
