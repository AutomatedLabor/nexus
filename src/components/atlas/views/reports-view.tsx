"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { FileText, Download, Eye, FilePlus2 } from "lucide-react";
import { useReports, useCreateReport, useExport } from "@/hooks/atlas";
import { useNotificationPrefs } from "@/lib/view-store";
import { PageHeader } from "@/components/atlas/ui/page-header";
import { SectionCard } from "@/components/atlas/ui/section-card";
import { DataTable, type Column } from "@/components/atlas/ui/data-table";
import { EmptyState } from "@/components/atlas/ui/empty-state";
import { ErrorState } from "@/components/atlas/ui/error-state";
import { TableSkeleton } from "@/components/atlas/ui/loading-skeleton";
import { FormatBadge } from "@/components/atlas/ui/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Report, ReportFormat } from "@/types/atlas";

export function ReportsView() {
  const reportsQ = useReports();
  const createMut = useCreateReport();
  const exportMut = useExport();
  const prefs = useNotificationPrefs();

  const [title, setTitle] = useState("");
  const [format, setFormat] = useState<ReportFormat>("html");
  const [parameters, setParameters] = useState(
    '{\n  "include": ["stats", "benchmarks", "limits"],\n  "environmentId": "auto"\n}'
  );
  const [openReport, setOpenReport] = useState<Report | null>(null);

  const reports = reportsQ.data?.data ?? [];

  const handleGenerate = () => {
    if (!title.trim()) {
      toast.error("Please provide a report title.");
      return;
    }
    let parsedParameters: Record<string, unknown> | undefined = undefined;
    if (parameters.trim()) {
      try {
        const parsed = JSON.parse(parameters);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          parsedParameters = parsed as Record<string, unknown>;
        } else {
          toast.error("Parameters must be a JSON object.");
          return;
        }
      } catch {
        toast.error("Parameters are not valid JSON.");
        return;
      }
    }
    createMut.mutate(
      {
        title: title.trim(),
        format,
        parameters: parsedParameters,
      },
      {
        onSuccess: (r) => {
          if (prefs.toastOnReportReady) {
            toast.success(`Report "${r.title}" generated as ${r.format.toUpperCase()}.`);
          }
          setTitle("");
          setParameters(
            '{\n  "include": ["stats", "benchmarks", "limits"],\n  "environmentId": "auto"\n}'
          );
        },
        onError: (e) => toast.error(`Generation failed: ${e.message}`),
      }
    );
  };

  const handleExport = (fmt: "csv" | "json") => {
    exportMut.mutate(fmt, {
      onSuccess: () => {
        if (prefs.toastOnExport) {
          toast.success(`Export ready — ${fmt.toUpperCase()} downloaded.`);
        }
      },
      onError: (e) => toast.error(`Export failed: ${e.message}`),
    });
  };

  const columns: Column<Report>[] = [
    {
      key: "title",
      header: "Title",
      cell: (r) => <span className="font-medium text-foreground">{r.title}</span>,
    },
    {
      key: "format",
      header: "Format",
      cell: (r) => <FormatBadge format={r.format} />,
    },
    {
      key: "createdAt",
      header: "Created",
      cell: (r) => (
        <span className="text-sm text-muted-foreground">
          {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      cell: (r) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpenReport(r)}
          aria-label={`View report ${r.title}`}
        >
          <Eye className="size-4" aria-hidden="true" />
          View
        </Button>
      ),
      width: "96px",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Generate formatted reports and export the full ATLAS dataset."
        actions={
          <>
            <Button variant="outline" onClick={() => handleExport("csv")} disabled={exportMut.isPending}>
              <Download className="size-4" aria-hidden="true" />
              CSV
            </Button>
            <Button variant="outline" onClick={() => handleExport("json")} disabled={exportMut.isPending}>
              <Download className="size-4" aria-hidden="true" />
              JSON
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard
          title="New report"
          description="Generate a formatted report from the current dataset."
          className="lg:col-span-1"
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="report-title">Title</Label>
              <Input
                id="report-title"
                placeholder="Weekly limits summary"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-format">Format</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as ReportFormat)}>
                <SelectTrigger id="report-format" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="html">HTML</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-params">Parameters (JSON)</Label>
              <Textarea
                id="report-params"
                rows={8}
                value={parameters}
                onChange={(e) => setParameters(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <Button
              onClick={handleGenerate}
              disabled={createMut.isPending}
              className="w-full"
            >
              <FilePlus2 className="size-4" aria-hidden="true" />
              {createMut.isPending ? "Generating…" : "Generate report"}
            </Button>
          </div>
        </SectionCard>

        <SectionCard
          title="Generated reports"
          description={`${reports.length} report${reports.length === 1 ? "" : "s"} on file`}
          className="lg:col-span-2"
        >
          {reportsQ.isLoading ? (
            <TableSkeleton rows={5} cols={4} />
          ) : reportsQ.isError ? (
            <ErrorState message="Failed to load reports" onRetry={() => reportsQ.refetch()} />
          ) : reports.length === 0 ? (
            <EmptyState
              icon={<FileText className="size-5" />}
              title="No reports yet"
              description="Generate your first report using the form on the left."
            />
          ) : (
            <DataTable
              columns={columns}
              data={reports}
              rowKey={(r) => r.id}
            />
          )}
        </SectionCard>
      </div>

      {/* Export hint card */}
      <SectionCard
        title="Full data export"
        description="Download the complete ATLAS dataset for offline analysis or archival."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Card>
            <CardContent className="flex items-center gap-4">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Download className="size-5" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">CSV export</p>
                <p className="text-xs text-muted-foreground">Flat CSV of environments, tools, capabilities, limits.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleExport("csv")} disabled={exportMut.isPending}>
                Download
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Download className="size-5" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">JSON export</p>
                <p className="text-xs text-muted-foreground">Structured JSON of the full dataset.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleExport("json")} disabled={exportMut.isPending}>
                Download
              </Button>
            </CardContent>
          </Card>
        </div>
      </SectionCard>

      <Dialog open={!!openReport} onOpenChange={(o) => !o && setOpenReport(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{openReport?.title}</DialogTitle>
            <DialogDescription>
              Format: {openReport?.format.toUpperCase()} · Created{" "}
              {openReport ? formatDistanceToNow(new Date(openReport.createdAt), { addSuffix: true }) : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/30">
            <ScrollArea className="h-72 w-full">
              <pre className="whitespace-pre-wrap break-words p-4 text-xs font-mono text-foreground">
                {openReport?.content ?? "(no content)"}
              </pre>
            </ScrollArea>
          </div>
          {openReport?.parameters && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Parameters</p>
              <pre className="rounded-lg border bg-muted/30 p-3 text-xs font-mono text-foreground whitespace-pre-wrap break-words">
                {openReport.parameters}
              </pre>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
