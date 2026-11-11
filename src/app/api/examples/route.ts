import { NextResponse } from "next/server";
import { readdir, readFile, stat } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

interface ExampleFile {
  name: string;
  slug: string;
  code: string;
  readme: string | null;
  /** File size in bytes (used for sorting/styling). */
  size: number;
}

const EXAMPLES_DIR = path.resolve(process.cwd(), "examples");

/**
 * GET /api/examples
 *
 * Lists every `*.ae` file in the project's `examples/` directory (created by
 * another subagent in parallel). For each `foo.ae`, if a `foo.md` exists
 * alongside it, its contents is returned as `readme`. The route returns:
 *
 *   { data: ExampleFile[] }
 *
 * The route is intentionally tolerant: if the examples directory does not
 * exist yet (the other agent hasn't finished), it returns `{ data: [] }`
 * with a 200 status so the playground's Examples view can still render.
 */
export async function GET() {
  try {
    await stat(EXAMPLES_DIR);
  } catch {
    return NextResponse.json({ data: [] as ExampleFile[] });
  }

  let entries: string[];
  try {
    entries = await readdir(EXAMPLES_DIR);
  } catch {
    return NextResponse.json({ data: [] as ExampleFile[] });
  }

  const aeFiles = entries.filter((f) => f.endsWith(".ae")).sort();
  const data: ExampleFile[] = [];

  for (const file of aeFiles) {
    const slug = file.slice(0, -3);
    try {
      const code = await readFile(path.join(EXAMPLES_DIR, file), "utf8");
      let readme: string | null = null;
      const mdPath = path.join(EXAMPLES_DIR, `${slug}.md`);
      try {
        readme = await readFile(mdPath, "utf8");
      } catch {
        // no readme — fine
      }
      const st = await stat(path.join(EXAMPLES_DIR, file));
      data.push({ name: slug, slug, code, readme, size: st.size });
    } catch {
      // skip unreadable
    }
  }

  return NextResponse.json({ data });
}
