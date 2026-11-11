"use client";

import { Server, Globe, BookOpen } from "lucide-react";
import { useEnvironments } from "@/hooks/atlas";

export function AppFooter() {
  const { data } = useEnvironments();
  const env = data?.data?.[0];
  const year = new Date().getFullYear();

  return (
    <footer
      className="mt-auto border-t bg-background/60 px-4 py-4 md:px-6"
      aria-label="Footer"
    >
      <div className="flex flex-col items-start justify-between gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-medium text-foreground">ATLAS v1.0</span>
          <span className="hidden sm:inline text-muted-foreground/40">·</span>
          <span>Autonomous Technical Limit Assessment System</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {env && (
            <>
              <span className="inline-flex items-center gap-1.5" title="Environment hostname">
                <Server className="size-3.5" aria-hidden="true" />
                <span className="font-mono">{env.hostname}</span>
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span className="inline-flex items-center gap-1.5" title="Egress IP">
                <Globe className="size-3.5" aria-hidden="true" />
                <span className="font-mono">{env.publicIp}</span>
              </span>
              <span className="text-muted-foreground/40">·</span>
            </>
          )}
          <a
            href="#"
            className="inline-flex items-center gap-1.5 hover:text-foreground"
            onClick={(e) => e.preventDefault()}
          >
            <BookOpen className="size-3.5" aria-hidden="true" />
            Docs
          </a>
          <span className="text-muted-foreground/40">·</span>
          <span>&copy; {year} ATLAS</span>
        </div>
      </div>
    </footer>
  );
}
