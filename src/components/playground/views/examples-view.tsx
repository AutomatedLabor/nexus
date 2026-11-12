"use client";

import * as React from "react";
import {
  FileCode2,
  Play,
  RefreshCw,
  Search,
  PackageOpen,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "../ui/page-header";
import { SectionCard } from "../ui/section-card";
import { EmptyState } from "../ui/empty-state";
import { LoadingState } from "../ui/loading-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useViewStore } from "@/lib/view-store";

interface ExampleEntry {
  name: string;
  slug: string;
  code: string;
  readme: string | null;
  size: number;
}

/** Derive a category from the example's slug + README.
 *
 *  Rules:
 *  - If the README has a `Category:` line, use it (case-insensitive).
 *  - Else if the slug starts with a known prefix, classify accordingly
 *    (trait_* → Traits, borrow_* → Borrow, async_* → Async, etc.).
 *  - Else infer from name keywords (sort → Algorithms, sort → Data Structures,
 *    bfs/dfs → Graphs, etc.).
 *  - Default → "Misc".
 */
function deriveCategory(ex: ExampleEntry): string {
  const slug = ex.slug.toLowerCase();
  const name = ex.name.toLowerCase();

  // Explicit `Category:` line in README wins.
  if (ex.readme) {
    for (const line of ex.readme.split("\n")) {
      const t = line.trim();
      const m = t.match(/^category\s*:\s*(.+)$/i);
      if (m) return m[1].trim();
    }
  }

  // Prefix-based categories (the v3 trait_* and borrow_* examples).
  if (slug.startsWith("trait_") || slug.includes("trait")) return "Traits";
  if (slug.startsWith("borrow_") || slug.includes("borrow")) return "Borrow";
  if (slug.startsWith("async_") || slug.includes("coroutine") || slug.includes("spawn")) {
    return "Async";
  }

  // Name-keyword inference.
  const sorters = ["sort", "quicksort", "merge_sort", "bubble", "insertion", "radix", "counting", "bogo"];
  if (sorters.some((s) => name.includes(s))) return "Algorithms";
  if (["fib", "fibonacci", "factorial", "ackermann", "collatz", "gcd", "lcm", "armstrong", "prime", "modular_exp", "pi_leibniz", "pascal", "chinese_remainder", "euclid", "e_series", "power_fn", "newton_sqrt", "sum_digits", "reverse_number", "knapsack", "coin_change", "factorial_digit_sum", "neural_net_xor"].some((s) => name.includes(s))) {
    return "Math";
  }
  if (["linked_list", "binary_tree", "rb_tree", "lru_cache", "queue", "stack", "heap", "dict", "set"].some((s) => name.includes(s))) {
    return "Data Structures";
  }
  if (["bfs", "dfs", "dijkstra", "graph", "topological_sort", "maze", "nqueens", "sudoku", "hanoi", "turing_machine", "state_machine", "game_of_life", "rabin_karp", "kmp_search"].some((s) => name.includes(s))) {
    return "Algorithms";
  }
  if (["json_parser", "base64", "huffman", "string_compress", "string_decompress", "rle", "string_utils", "string_reverse", "title_case", "atbash", "caesar", "rot13", "expression", "infix_to_rpn", "expression_eval", "expression_formatter", "interpret_brainfuck"].some((s) => name.includes(s))) {
    return "Strings";
  }
  if (["palindrome", "anagram", "count_words", "substring_count", "longest_common_prefix", "diff_strings", "string_reverse_words", "title_case"].some((s) => name.includes(s))) {
    return "Strings";
  }
  if (["todo_cli", "calculator", "websocket", "number_guessing"].some((s) => name.includes(s))) {
    return "Web";
  }
  if (["matrix_ops", "matrix"].some((s) => name.includes(s))) return "Math";
  if (["fizzbuzz", "primes", "prime_sieve", "prime_factors", "e_series", "pascals_triangle"].some((s) => name.includes(s))) {
    return "Math";
  }
  return "Misc";
}

const ALL_CATEGORIES = [
  "All",
  "Algorithms",
  "Data Structures",
  "Math",
  "Strings",
  "Web",
  "Traits",
  "Borrow",
  "Async",
  "Misc",
] as const;
type CategoryFilter = (typeof ALL_CATEGORIES)[number];

export function ExamplesView() {
  const [data, setData] = React.useState<ExampleEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<CategoryFilter>("All");
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

  // Pre-compute categories for each example.
  const examplesWithCategory = React.useMemo(
    () => data.map((ex) => ({ ex, category: deriveCategory(ex) })),
    [data],
  );

  // Derive available categories from the data (only show ones that have at
  // least one example). Always include "All".
  const availableCategories = React.useMemo(() => {
    const set = new Set<string>();
    for (const { category } of examplesWithCategory) set.add(category);
    return ALL_CATEGORIES.filter((c) => c === "All" || set.has(c));
  }, [examplesWithCategory]);

  const q = query.trim().toLowerCase();
  const filtered = examplesWithCategory.filter(({ ex, category: cat }) => {
    if (category !== "All" && cat !== category) return false;
    if (q && !ex.name.toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <PageHeader
        icon={<FileCode2 className="size-5" />}
        title="Examples Gallery"
        description="Sample Aether programs from the examples/ directory. Each one is runnable — click 'Run in Playground' to load it. Filter by category to find what you need."
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
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as CategoryFilter)}
            >
              <SelectTrigger className="w-[160px]" aria-label="Category filter">
                <Filter className="size-3.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableCategories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

      {/* Summary row: count by category. */}
      {!loading && !error && data.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="gap-1">
            <FileCode2 className="size-3" />
            {filtered.length} shown
          </Badge>
          {availableCategories
            .filter((c) => c !== "All")
            .map((c) => {
              const count = examplesWithCategory.filter(
                ({ category: cat }) => cat === c,
              ).length;
              return (
                <Badge
                  key={c}
                  variant={category === c ? "default" : "secondary"}
                  className="cursor-pointer text-[10px]"
                  onClick={() => setCategory(c)}
                >
                  {c}: {count}
                </Badge>
              );
            })}
        </div>
      )}

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
            title={`No examples match "${query}" in ${category}`}
            description="Try a different category or a shorter query."
          />
        </SectionCard>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(({ ex, category: cat }) => (
            <SectionCard
              key={ex.slug}
              title={<code className="font-mono text-sm">{ex.name}.ae</code>}
              description={
                ex.readme ? (
                  extractSummary(ex.readme)
                ) : (
                  <span className="text-muted-foreground">
                    {ex.size} bytes · {ex.code.split("\n").length} lines
                  </span>
                )
              }
              icon={<FileCode2 className="size-4" />}
              actions={
                <div className="flex items-center gap-1">
                  <Badge variant="secondary" className="text-[10px]">
                    {cat}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {ex.code.split("\n").length} lines
                  </Badge>
                </div>
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
    if (t.toLowerCase().startsWith("category:")) continue; // skip category line
    return t.length > 140 ? t.slice(0, 140) + "…" : t;
  }
  // Fallback to first heading.
  for (const line of lines) {
    const t = line.trim().replace(/^#+\s*/, "");
    if (t) return t;
  }
  return "Aether example program.";
}
