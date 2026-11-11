"use client";

import { useMemo, useState } from "react";
import {
  Cpu,
  MemoryStick,
  HardDrive,
  RotateCw,
  Container,
  Globe,
  Boxes,
  Search,
  Server,
  Activity,
} from "lucide-react";
import { useEnvironments, useTools, useCapabilities } from "@/hooks/atlas";
import { PageHeader } from "@/components/atlas/ui/page-header";
import { SectionCard } from "@/components/atlas/ui/section-card";
import { DataTable, type Column } from "@/components/atlas/ui/data-table";
import { EmptyState } from "@/components/atlas/ui/empty-state";
import { ErrorState } from "@/components/atlas/ui/error-state";
import { ToolStatusBadge } from "@/components/atlas/ui/status-badge";
import { CardGridSkeleton, TableSkeleton } from "@/components/atlas/ui/loading-skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ToolsCategoryBar } from "@/components/atlas/charts/tools-category-bar";
import type { Tool, Capability } from "@/types/atlas";

function InfoTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="gap-2 p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-lg font-semibold tabular-nums text-foreground break-words">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

export function EnvironmentView() {
  const envQ = useEnvironments();
  const env = envQ.data?.data?.[0];

  // Tools filter state
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("");
  const [installed, setInstalled] = useState<string>("");
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const toolsQ = useTools({ q, category, installed, page, limit: pageSize });
  const allToolsForChart = useTools({ limit: 200 });
  const capsQ = useCapabilities({ limit: 100 });

  // Reset page when filters change
  const updateFilter = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  const toolColumns: Column<Tool>[] = [
    {
      key: "name",
      header: "Name",
      cell: (t) => <span className="font-medium text-foreground">{t.name}</span>,
    },
    {
      key: "category",
      header: "Category",
      cell: (t) => <Badge variant="outline" className="text-muted-foreground">{t.category}</Badge>,
    },
    {
      key: "version",
      header: "Version",
      cell: (t) => (
        <span className="text-sm tabular-nums text-muted-foreground">
          {t.version ?? "—"}
        </span>
      ),
    },
    {
      key: "path",
      header: "Path",
      cell: (t) => (
        <span className="font-mono text-xs text-muted-foreground">{t.path ?? "—"}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (t) => <ToolStatusBadge installed={t.installed} />,
    },
  ];

  const categories = useMemo(() => {
    const set = new Set<string>();
    allToolsForChart.data?.data?.forEach((t) => set.add(t.category));
    return Array.from(set).sort();
  }, [allToolsForChart.data]);

  const capsByCategory = useMemo(() => {
    const m = new Map<string, Capability[]>();
    capsQ.data?.data?.forEach((c) => {
      const arr = m.get(c.category) ?? [];
      arr.push(c);
      m.set(c.category, arr);
    });
    return Array.from(m.entries());
  }, [capsQ.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Environment"
        description="Hardware, tools, and capability telemetry for the registered agent runtime."
      />

      {envQ.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <CardGridSkeleton key={i} count={1} />
          ))}
        </div>
      ) : envQ.isError ? (
        <ErrorState message="Failed to load environment" onRetry={() => envQ.refetch()} />
      ) : env ? (
        <>
          {/* Hardware tiles */}
          <section aria-label="Hardware" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <InfoTile icon={Cpu} label="CPU" value={env.cpuModel} hint={`${env.cpuCores} cores · ${env.arch}`} />
            <InfoTile icon={MemoryStick} label="Memory" value={`${env.memoryMb.toLocaleString()} MB`} hint={`${env.swapMb.toLocaleString()} MB swap`} />
            <InfoTile icon={HardDrive} label="Disk" value={`${env.diskGb} GB`} hint="Allocated volume" />
            <InfoTile icon={RotateCw} label="Kernel" value={env.kernel} hint={`${env.osName} ${env.osVersion}`} />
            <InfoTile icon={Container} label="Container" value={env.container} hint="Isolation boundary" />
            <InfoTile icon={Globe} label="Public IP" value={env.publicIp} hint="Egress address" />
            <InfoTile icon={Server} label="Hostname" value={env.hostname} hint="Runtime identifier" />
            <InfoTile icon={Boxes} label="Counts" value={`${env.counts?.tools ?? 0} tools`} hint={`${env.counts?.capabilities ?? 0} capabilities · ${env.counts?.limits ?? 0} limits`} />
          </section>

          {/* Tool category chart */}
          <SectionCard
            title="Tools by category"
            description="Distribution of mapped tools per category"
          >
            {allToolsForChart.isLoading ? (
              <TableSkeleton rows={4} cols={3} />
            ) : (
              <ToolsCategoryBar tools={allToolsForChart.data?.data ?? []} />
            )}
          </SectionCard>

          {/* Tool inventory */}
          <SectionCard
            title="Tool inventory"
            description="Searchable, filterable list of all detected tools"
            action={
              <span className="text-xs text-muted-foreground">
                {toolsQ.data?.total ?? 0} tools
              </span>
            }
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  className="pl-8"
                  placeholder="Search tools by name or path…"
                  aria-label="Search tools"
                  value={q}
                  onChange={(e) => updateFilter(setQ)(e.target.value)}
                />
              </div>
              <Select value={category || "__all__"} onValueChange={(v) => updateFilter(setCategory)(v === "__all__" ? "" : v)}>
                <SelectTrigger className="w-full sm:w-44" aria-label="Filter by category">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={installed || "__all__"} onValueChange={(v) => updateFilter(setInstalled)(v === "__all__" ? "" : v)}>
                <SelectTrigger className="w-full sm:w-40" aria-label="Filter by status">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All statuses</SelectItem>
                  <SelectItem value="true">Installed</SelectItem>
                  <SelectItem value="false">Missing</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="mt-4">
              {toolsQ.isLoading ? (
                <TableSkeleton rows={6} cols={5} />
              ) : toolsQ.isError ? (
                <ErrorState message="Failed to load tools" onRetry={() => toolsQ.refetch()} />
              ) : (
                <DataTable
                  columns={toolColumns}
                  data={toolsQ.data?.data ?? []}
                  rowKey={(t) => t.id}
                  page={page}
                  pageSize={pageSize}
                  total={toolsQ.data?.total}
                  onPageChange={setPage}
                  empty={
                    <EmptyState
                      icon={<Search className="size-5" />}
                      title="No tools match your filters"
                      description="Try clearing search or category filters."
                    />
                  }
                />
              )}
            </div>
          </SectionCard>

          {/* Capabilities */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">Capabilities</h2>
            {capsQ.isLoading ? (
              <CardGridSkeleton count={6} />
            ) : capsQ.isError ? (
              <ErrorState message="Failed to load capabilities" onRetry={() => capsQ.refetch()} />
            ) : capsQ.data?.data.length === 0 ? (
              <EmptyState
                icon={<Activity className="size-5" />}
                title="No capabilities recorded"
                description="Run a benchmark to populate capability metrics."
              />
            ) : (
              <div className="space-y-6">
                {capsByCategory.map(([cat, list]) => (
                  <div key={cat} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-foreground capitalize">{cat}</h3>
                      <Badge variant="outline" className="text-muted-foreground">
                        {list.length}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {list.map((c) => (
                        <Card key={c.id} className="gap-1.5 p-4">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-mono text-sm font-medium text-foreground">
                              {c.name}
                            </p>
                            <Badge variant="outline" className="text-muted-foreground">
                              {c.unit}
                            </Badge>
                          </div>
                          <p className="text-xl font-semibold tabular-nums text-foreground">
                            {c.value.toLocaleString()}
                            <span className="ml-1 text-xs font-normal text-muted-foreground">
                              {c.unit}
                            </span>
                          </p>
                          {c.details && (
                            <p className="line-clamp-2 text-xs text-muted-foreground">
                              {c.details}
                            </p>
                          )}
                        </Card>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <EmptyState
          icon={<Server className="size-5" />}
          title="No environment registered"
          description="Once an agent runs the ATLAS probe, its environment will appear here."
        />
      )}
    </div>
  );
}
