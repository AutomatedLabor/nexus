"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiDownload } from "@/lib/api";
import type {
  Stats,
  EnvironmentsResponse,
  Tool,
  PaginatedResponse,
  Capability,
  Benchmark,
  BenchmarkDetail,
  Limit,
  Report,
  BenchmarkRun,
  ReportFormat,
} from "@/types/atlas";

const qk = {
  stats: ["atlas", "stats"] as const,
  environments: ["atlas", "environments"] as const,
  tools: (params: Record<string, unknown>) => ["atlas", "tools", params] as const,
  capabilities: (params: Record<string, unknown>) =>
    ["atlas", "capabilities", params] as const,
  benchmarks: ["atlas", "benchmarks"] as const,
  benchmark: (id: string) => ["atlas", "benchmark", id] as const,
  limits: (params: Record<string, unknown>) => ["atlas", "limits", params] as const,
  reports: ["atlas", "reports"] as const,
};

export function useStats() {
  return useQuery<Stats>({
    queryKey: qk.stats,
    queryFn: () => apiGet<Stats>("/api/stats"),
  });
}

export function useEnvironments() {
  return useQuery<EnvironmentsResponse>({
    queryKey: qk.environments,
    queryFn: () => apiGet<EnvironmentsResponse>("/api/environments"),
  });
}

export interface ToolsParams {
  q?: string;
  category?: string;
  installed?: string;
  page?: number;
  limit?: number;
}

export function useTools(params: ToolsParams) {
  return useQuery<PaginatedResponse<Tool>>({
    queryKey: qk.tools(params as Record<string, unknown>),
    queryFn: () =>
      apiGet<PaginatedResponse<Tool>>(
        "/api/tools",
        params as Record<string, string | number | undefined>
      ),
  });
}

export interface CapabilitiesParams {
  category?: string;
  environmentId?: string;
  page?: number;
  limit?: number;
}

export function useCapabilities(params: CapabilitiesParams) {
  return useQuery<PaginatedResponse<Capability>>({
    queryKey: qk.capabilities(params as Record<string, unknown>),
    queryFn: () =>
      apiGet<PaginatedResponse<Capability>>(
        "/api/capabilities",
        params as Record<string, string | number | undefined>
      ),
  });
}

export function useBenchmarks() {
  return useQuery<PaginatedResponse<Benchmark>>({
    queryKey: qk.benchmarks,
    queryFn: () => apiGet<PaginatedResponse<Benchmark>>("/api/benchmarks"),
  });
}

export function useBenchmark(id: string | null | undefined) {
  return useQuery<BenchmarkDetail>({
    queryKey: qk.benchmark(id ?? ""),
    queryFn: async () => {
      const res = await apiGet<{ data: BenchmarkDetail } | BenchmarkDetail>(
        `/api/benchmarks/${id}`
      );
      return (res as { data: BenchmarkDetail }).data ?? (res as BenchmarkDetail);
    },
    enabled: !!id,
  });
}

export interface LimitsParams {
  severity?: string;
  kind?: string;
  page?: number;
  limit?: number;
}

export function useLimits(params: LimitsParams) {
  return useQuery<PaginatedResponse<Limit>>({
    queryKey: qk.limits(params as Record<string, unknown>),
    queryFn: () =>
      apiGet<PaginatedResponse<Limit>>(
        "/api/limits",
        params as Record<string, string | number | undefined>
      ),
  });
}

export function useReports() {
  return useQuery<PaginatedResponse<Report>>({
    queryKey: qk.reports,
    queryFn: () => apiGet<PaginatedResponse<Report>>("/api/reports"),
  });
}

export function useRunBenchmark() {
  const qc = useQueryClient();
  return useMutation<BenchmarkRun, Error, { name: string }>({
    mutationFn: async (body) => {
      const res = await apiPost<{ data: BenchmarkRun } | BenchmarkRun>(
        "/api/benchmarks/run",
        body
      );
      // Endpoint wraps the created run in `data`.
      return (res as { data: BenchmarkRun }).data ?? (res as BenchmarkRun);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.benchmarks });
      qc.invalidateQueries({ queryKey: qk.stats });
      qc.invalidateQueries({ queryKey: ["atlas"] });
    },
  });
}

export interface CreateReportInput {
  title: string;
  format: ReportFormat;
  parameters?: Record<string, unknown>;
}

export function useCreateReport() {
  const qc = useQueryClient();
  return useMutation<Report, Error, CreateReportInput>({
    mutationFn: async (body) => {
      const res = await apiPost<{ data: Report } | Report>("/api/reports", body);
      return (res as { data: Report }).data ?? (res as Report);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.reports });
      qc.invalidateQueries({ queryKey: qk.stats });
    },
  });
}

export function useExport() {
  return useMutation<void, Error, "csv" | "json">({
    mutationFn: (format) => apiDownload(`/api/export?format=${format}`, `atlas-export.${format}`),
  });
}
