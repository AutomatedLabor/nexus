"use client";

import * as React from "react";
import {
  Package,
  PackageOpen,
  RefreshCw,
  Search,
  FileCode2,
  FileText,
  Hash,
  Play,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useViewStore } from "@/lib/view-store";

/**
 * Shape returned by GET /api/packages. Matches `PackageEntry` in the route.
 */
interface PackageEntry {
  name: string;
  description: string;
  version: string;
  source: string;
  readme: string | null;
  loc: number;
  functionCount: number;
  size: number;
}

export function PackagesView() {
  const [data, setData] = React.useState<PackageEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState<PackageEntry | null>(null);
  const loadCode = useViewStore((s) => s.loadCode);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/packages")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j: { data?: PackageEntry[] }) => {
        setData(j.data ?? []);
      })
      .catch((e) => {
        setError(e.message ?? "Failed to load packages");
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? data.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q),
      )
    : data;

  // Summary stats.
  const totalFns = data.reduce((a, p) => a + p.functionCount, 0);
  const totalLoc = data.reduce((a, p) => a + p.loc, 0);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <PageHeader
        icon={<Package className="size-5" />}
        title="Package Browser"
        description="Browse the Aether package registry — 15 installable libraries written in Aether itself. View source, README, and stats, or load any package's example into the playground."
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search packages…"
                className="w-[220px] pl-8"
                aria-label="Search packages"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={load}
              aria-label="Refresh packages"
            >
              <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
            </Button>
          </div>
        }
      />

      {/* Summary stats row. */}
      {!loading && !error && data.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryStat
            icon={<Package className="size-4" />}
            label="Packages"
            value={data.length.toString()}
            hint="in the registry"
          />
          <SummaryStat
            icon={<Hash className="size-4" />}
            label="Public functions"
            value={totalFns.toLocaleString()}
            hint="across all packages"
          />
          <SummaryStat
            icon={<FileCode2 className="size-4" />}
            label="Lines of Aether"
            value={totalLoc.toLocaleString()}
            hint="written in Aether itself"
          />
        </div>
      )}

      {loading ? (
        <SectionCard>
          <LoadingState label="Loading packages…" />
        </SectionCard>
      ) : error ? (
        <SectionCard>
          <EmptyState
            icon={<PackageOpen className="size-6" />}
            title="Couldn't load packages"
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
            title="No packages yet"
            description="The aether-packages/ directory is empty or missing."
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
            title={`No packages match "${query}"`}
            description="Try a shorter or different query."
          />
        </SectionCard>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((pkg) => (
            <SectionCard
              key={pkg.name}
              title={<code className="font-mono text-sm">{pkg.name}</code>}
              description={
                <span className="line-clamp-2 text-muted-foreground">
                  {pkg.description}
                </span>
              }
              icon={<Package className="size-4" />}
              actions={
                <div className="flex flex-wrap items-center gap-1">
                  <Badge variant="secondary" className="text-[10px]">
                    v{pkg.version}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {pkg.functionCount} fns
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {pkg.loc} loc
                  </Badge>
                </div>
              }
            >
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <FileCode2 className="size-3.5" />
                <span>
                  {pkg.size.toLocaleString()} bytes · {pkg.loc} lines · {pkg.functionCount}{" "}
                  pub fns
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => setActive(pkg)}
                >
                  <FileText className="size-3.5" />
                  View
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    loadCode(pkg.source);
                    toast.success("Loaded " + pkg.name + " source into the playground");
                  }}
                >
                  <Play className="size-3.5" />
                  Load
                </Button>
              </div>
            </SectionCard>
          ))}
        </div>
      )}

      <PackageDialog
        pkg={active}
        onClose={() => setActive(null)}
        onLoad={(code) => {
          loadCode(code);
          setActive(null);
          toast.success("Loaded package source into the playground");
        }}
      />
    </div>
  );
}

function SummaryStat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-background p-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="font-mono text-lg font-semibold text-foreground">{value}</span>
        <span className="text-[10px] text-muted-foreground">{hint}</span>
      </div>
    </div>
  );
}

/** Modal showing a package's README + source. */
function PackageDialog({
  pkg,
  onClose,
  onLoad,
}: {
  pkg: PackageEntry | null;
  onClose: () => void;
  onLoad: (code: string) => void;
}) {
  return (
    <Dialog open={pkg !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2 font-mono">
            <Package className="size-4 text-primary" />
            {pkg?.name ?? ""}
            {pkg && (
              <Badge variant="secondary" className="text-[10px]">
                v{pkg.version}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="line-clamp-2">
            {pkg?.description}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 border-b px-6 py-2 text-xs text-muted-foreground">
          <Hash className="size-3.5" />
          <span>
            {pkg?.functionCount ?? 0} pub fns · {pkg?.loc ?? 0} lines ·{" "}
            {(pkg?.size ?? 0).toLocaleString()} bytes
          </span>
        </div>
        <Tabs defaultValue="readme" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-6 mt-2 self-start">
            <TabsTrigger value="readme" className="gap-1.5">
              <FileText className="size-3.5" /> README
            </TabsTrigger>
            <TabsTrigger value="source" className="gap-1.5">
              <FileCode2 className="size-3.5" /> Source
            </TabsTrigger>
          </TabsList>
          <TabsContent
            value="readme"
            className="min-h-0 flex-1 overflow-auto px-6 pb-4 pt-2 scrollbar-thin"
          >
            {pkg?.readme ? (
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
                {pkg.readme}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">
                This package has no README.md. The library is documented inline
                in <code className="font-mono text-xs">src/lib.ae</code> — see the
                Source tab.
              </p>
            )}
          </TabsContent>
          <TabsContent
            value="source"
            className="min-h-0 flex-1 overflow-auto px-6 pb-4 pt-2 scrollbar-thin"
          >
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground">
              {pkg?.source}
            </pre>
          </TabsContent>
        </Tabs>
        <DialogFooter className="border-t px-6 py-3">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            onClick={() => pkg && onLoad(pkg.source)}
            disabled={!pkg}
          >
            <Play className="size-4" />
            Load into Playground
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
