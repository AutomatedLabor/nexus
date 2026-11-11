"use client";

import * as React from "react";
import {
  FileCode2,
  Play,
  RefreshCw,
  Search,
  PackageOpen,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "../ui/page-header";
import { SectionCard } from "../ui/section-card";
import { EmptyState } from "../ui/empty-state";
import { LoadingState } from "../ui/loading-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useViewStore } from "@/lib/view-store";

interface ExampleEntry {
  name: string;
  slug: string;
  code: string;
  readme: string | null;
  size: number;
}

export function ExamplesView() {
  const [data, setData] = React.useState<ExampleEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const loadCode = useViewStore((s) => s.loadCode);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/examples")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j: { data?: ExampleEntry[] }) => {
        setData(j.data ?? []);
      })
      .catch((e) => {
        setError(e.message ?? "Failed to load examples");
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? data.filter((e) => e.name.toLowerCase().includes(q))
    : data;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <PageHeader
        icon={<FileCode2 className="size-5" />}
        title="Examples Gallery"
        description="Sample Aether programs from the examples/ directory. Each one is runnable — click 'Run in Playground' to load it."
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search examples…"
                className="w-[200px] pl-8"
                aria-label="Search examples"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={load}
              aria-label="Refresh examples"
            >
              <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
            </Button>
          </div>
        }
      />

      {loading ? (
        <SectionCard>
          <LoadingState label="Loading examples…" />
        </SectionCard>
      ) : error ? (
        <SectionCard>
          <EmptyState
            icon={<PackageOpen className="size-6" />}
            title="Couldn't load examples"
            description={error}
            action={
              <Button onClick={load} variant="outline">
                <RefreshCw className="size-4" />
                Try again
              </Button>
            }
          />
        </SectionCard>
      ) : data.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={<PackageOpen className="size-6" />}
            title="No examples yet"
            description="The examples/ directory is empty. Another agent is preparing sample Aether programs in parallel — check back shortly."
            action={
              <Button onClick={load} variant="outline">
                <RefreshCw className="size-4" />
                Refresh
              </Button>
            }
          />
        </SectionCard>
      ) : filtered.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={<Search className="size-6" />}
            title={`No examples match "${query}"`}
            description="Try a shorter or different query."
          />
        </SectionCard>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((ex) => (
            <SectionCard
              key={ex.slug}
              title={
                <code className="font-mono text-sm">{ex.name}.ae</code>
              }
              description={
                ex.readme ? (
                  extractSummary(ex.readme)
                ) : (
                  <span className="text-muted-foreground">
                    {ex.size} bytes ·{" "}
                    {ex.code.split("\n").length} lines
                  </span>
                )
              }
              icon={<FileCode2 className="size-4" />}
              actions={
                <Badge variant="secondary" className="text-[10px]">
                  {ex.code.split("\n").length} lines
                </Badge>
              }
            >
              <pre className="mb-3 max-h-32 overflow-auto rounded bg-muted/50 p-2 font-mono text-[11px] leading-relaxed text-foreground scrollbar-thin">
                {ex.code.slice(0, 800)}
                {ex.code.length > 800 ? "…" : ""}
              </pre>
              <Button
                onClick={() => {
                  loadCode(ex.code);
                  toast.success("Loaded " + ex.name + " into the playground");
                }}
                size="sm"
                className="w-full"
              >
                <Play className="size-3.5" />
                Run in Playground
              </Button>
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
}

/** Extract a one-line summary from a Markdown readme. */
function extractSummary(md: string): string {
  const lines = md.split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("#")) continue; // skip headings
    if (t.startsWith("```")) continue; // skip code fences
    return t.length > 140 ? t.slice(0, 140) + "…" : t;
  }
  // Fallback to first heading.
  for (const line of lines) {
    const t = line.trim().replace(/^#+\s*/, "");
    if (t) return t;
  }
  return "Aether example program.";
}
