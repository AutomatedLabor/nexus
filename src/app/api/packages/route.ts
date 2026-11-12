import { NextResponse } from "next/server";
import { readdir, readFile, stat } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

/**
 * A single Aether package's metadata + source + README.
 *
 * Returned by GET /api/packages.
 */
export interface PackageEntry {
  /** Directory name (e.g. "aether-string"). */
  name: string;
  /** Short description — from aether.toml's `description` if present,
   *  otherwise the first non-empty line of the README, otherwise a fallback. */
  description: string;
  /** Version string from aether.toml, or "0.0.0" if not present. */
  version: string;
  /** Full source of `src/lib.ae` (UTF-8). */
  source: string;
  /** Full text of README.md, or null if the package has no README. */
  readme: string | null;
  /** Lines of code (non-empty, non-comment-only lines in `src/lib.ae`). */
  loc: number;
  /** Number of `pub fn` declarations in `src/lib.ae`. */
  functionCount: number;
  /** File size of `src/lib.ae` in bytes. */
  size: number;
}

const PACKAGES_DIR = path.resolve(process.cwd(), "aether-packages");

/**
 * Best-effort TOML parser — extracts the first `key = "value"` pair under
 * [package] for the given key. This is intentionally minimal: aether.toml
 * files are small, hand-written, and don't need a real TOML parser.
 */
function extractTomlField(toml: string, key: string): string | null {
  const re = new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, "m");
  const m = toml.match(re);
  return m ? m[1] : null;
}

/** Count `pub fn` declarations in Aether source. */
function countPubFns(source: string): number {
  const matches = source.match(/\bpub\s+fn\b/g);
  return matches ? matches.length : 0;
}

/** Count non-empty, non-comment-only lines. */
function countLoc(source: string): number {
  let n = 0;
  for (const line of source.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("//")) continue;
    n++;
  }
  return n;
}

/** Extract the first non-empty, non-heading line of a Markdown README as
 *  a short description. Falls back to the first heading. */
function extractReadmeSummary(md: string): string | null {
  for (const line of md.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("#")) continue;
    if (t.startsWith("```")) continue;
    return t.length > 180 ? t.slice(0, 180) + "…" : t;
  }
  for (const line of md.split("\n")) {
    const t = line.trim().replace(/^#+\s*/, "");
    if (t) return t.length > 180 ? t.slice(0, 180) + "…" : t;
  }
  return null;
}

/**
 * GET /api/packages
 *
 * Lists every directory under `/aether-packages/` that contains a
 * `src/lib.ae` file. For each one, returns:
 *
 *   { name, description, version, source, readme, loc, functionCount, size }
 *
 * The route is intentionally tolerant: if a package is missing its README
 * or aether.toml, the fields are filled with sensible fallbacks (null
 * readme, "0.0.0" version, a one-line description derived from the source
 * file's first comment). If the entire `aether-packages/` directory is
 * missing, it returns `{ data: [] }` with a 200 status so the Packages
 * view can still render.
 */
export async function GET() {
  try {
    await stat(PACKAGES_DIR);
  } catch {
    return NextResponse.json({ data: [] as PackageEntry[] });
  }

  let entries: string[];
  try {
    entries = await readdir(PACKAGES_DIR);
  } catch {
    return NextResponse.json({ data: [] as PackageEntry[] });
  }

  const data: PackageEntry[] = [];
  for (const dirName of entries.sort()) {
    const dir = path.join(PACKAGES_DIR, dirName);
    let isDir = false;
    try {
      const st = await stat(dir);
      isDir = st.isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;

    const srcPath = path.join(dir, "src", "lib.ae");
    let source: string;
    try {
      source = await readFile(srcPath, "utf8");
    } catch {
      // Not a package — no src/lib.ae.
      continue;
    }
    let size = 0;
    try {
      size = (await stat(srcPath)).size;
    } catch {
      /* ignore */
    }

    // README — optional.
    let readme: string | null = null;
    try {
      readme = await readFile(path.join(dir, "README.md"), "utf8");
    } catch {
      /* no readme */
    }

    // aether.toml — optional.
    let version = "0.0.0";
    let tomlDescription: string | null = null;
    try {
      const toml = await readFile(path.join(dir, "aether.toml"), "utf8");
      const v = extractTomlField(toml, "description");
      if (v) tomlDescription = v;
      const ver = extractTomlField(toml, "version");
      if (ver) version = ver;
    } catch {
      /* no toml */
    }

    // Derive description.
    let description: string;
    if (tomlDescription) {
      description = tomlDescription;
    } else if (readme) {
      description = extractReadmeSummary(readme) ?? `Aether package: ${dirName}`;
    } else {
      // Pull the first `//`-comment line from the source as a fallback.
      const firstLine = source.split("\n").map((l) => l.trim()).find((l) => l.startsWith("//"));
      description = firstLine
        ? firstLine.replace(/^\/\/\s*/, "").slice(0, 180)
        : `Aether package: ${dirName}`;
    }

    data.push({
      name: dirName,
      description,
      version,
      source,
      readme,
      loc: countLoc(source),
      functionCount: countPubFns(source),
      size,
    });
  }

  return NextResponse.json({ data });
}
