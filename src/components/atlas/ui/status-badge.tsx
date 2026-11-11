"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  XCircle,
  AlertOctagon,
  AlertTriangle,
  Info,
} from "lucide-react";
import type { LimitSeverity } from "@/types/atlas";

type ToolStatus = "installed" | "missing";

export function ToolStatusBadge({ installed }: { installed: boolean }) {
  const status: ToolStatus = installed ? "installed" : "missing";
  if (status === "installed") {
    return (
      <Badge
        variant="secondary"
        className={cn(
          "gap-1 border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
        )}
      >
        <CheckCircle2 className="size-3" aria-hidden="true" />
        Installed
      </Badge>
    );
  }
  return (
    <Badge
      variant="secondary"
      className="gap-1 border-transparent bg-rose-500/15 text-rose-700 dark:text-rose-400"
    >
      <XCircle className="size-3" aria-hidden="true" />
      Missing
    </Badge>
  );
}

export function SeverityBadge({ severity }: { severity: LimitSeverity }) {
  const map: Record<
    LimitSeverity,
    { className: string; icon: React.ReactNode; label: string }
  > = {
    critical: {
      className: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
      icon: <AlertOctagon className="size-3" aria-hidden="true" />,
      label: "Critical",
    },
    warning: {
      className:
        "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
      icon: <AlertTriangle className="size-3" aria-hidden="true" />,
      label: "Warning",
    },
    info: {
      className: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
      icon: <Info className="size-3" aria-hidden="true" />,
      label: "Info",
    },
  };
  const cfg = map[severity] ?? map.info;
  return (
    <Badge variant="outline" className={cn("gap-1", cfg.className)}>
      {cfg.icon}
      {cfg.label}
    </Badge>
  );
}

export function KindBadge({ kind }: { kind: string }) {
  return (
    <Badge variant="outline" className="text-muted-foreground">
      {kind}
    </Badge>
  );
}

export function FormatBadge({ format }: { format: string }) {
  const colour: Record<string, string> = {
    html: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    json: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
    csv: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
  };
  return (
    <Badge variant="outline" className={colour[format] ?? ""}>
      {format.toUpperCase()}
    </Badge>
  );
}
