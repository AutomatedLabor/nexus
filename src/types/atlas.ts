// ATLAS — Autonomous Technical Limit Assessment System
// Shared types that match the backend JSON shapes.

export type ISODateString = string;

export interface EnvironmentCounts {
  tools: number;
  capabilities: number;
  benchmarkRuns: number;
  limits: number;
}

export interface Environment {
  id: string;
  hostname: string;
  osName: string;
  osVersion: string;
  kernel: string;
  cpuModel: string;
  cpuCores: number;
  memoryMb: number;
  swapMb: number;
  diskGb: number;
  container: string;
  publicIp: string;
  arch: string;
  createdAt: ISODateString;
  counts?: EnvironmentCounts;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page?: number;
  limit?: number;
}

export type EnvironmentsResponse = PaginatedResponse<Environment>;

export interface Tool {
  id: string;
  name: string;
  category: string;
  version: string | null;
  path: string | null;
  installed: boolean;
  environmentId: string;
  createdAt: ISODateString;
  environment?: { hostname: string };
}

export interface Capability {
  id: string;
  environmentId: string;
  category: string;
  name: string;
  value: number;
  unit: string;
  details: string | null;
  createdAt: ISODateString;
  environment?: { hostname: string };
}

export interface Benchmark {
  id: string;
  name: string;
  category: string;
  description: string | null;
  unit: string;
  runCount: number;
  latestRunMs: number | null;
  latestRunAt: ISODateString | null;
}

export interface BenchmarkDetail extends Benchmark {
  runs: BenchmarkRun[];
}

export interface BenchmarkRun {
  id: string;
  benchmarkId: string;
  environmentId: string;
  durationMs: number;
  throughput: number | null;
  success: boolean;
  details: string | null;
  createdAt: ISODateString;
  environment?: { hostname: string };
}

export type LimitSeverity = "critical" | "warning" | "info";

export interface Limit {
  id: string;
  environmentId: string;
  resource: string;
  limitValue: string;
  unit: string;
  kind: string;
  details: string | null;
  severity: LimitSeverity;
  createdAt: ISODateString;
  environment?: { hostname: string };
}

export type ReportFormat = "html" | "json" | "csv";

export interface Report {
  id: string;
  title: string;
  format: ReportFormat;
  parameters: string | null;
  content: string | null;
  createdAt: ISODateString;
}

export interface Stats {
  environments: number;
  tools: number;
  capabilities: number;
  benchmarks: number;
  benchmarkRuns: number;
  limits: number;
  reports: number;
  lastRunAt: ISODateString | null;
  avgRunMs: number;
}

export type AtlasView =
  | "dashboard"
  | "environment"
  | "benchmarks"
  | "limits"
  | "reports"
  | "settings";
