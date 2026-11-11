"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
  icon?: ReactNode;
}

export function ErrorState({ message, onRetry, className, icon }: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center",
        className
      )}
      role="alert"
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        {icon ?? <AlertTriangle className="size-5" aria-hidden="true" />}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          {message ?? "Something went wrong loading this data."}
        </p>
        <p className="text-xs text-muted-foreground">
          Check the API connection and try again.
        </p>
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry} className="mt-1">
          <RefreshCw className="size-4" aria-hidden="true" />
          Retry
        </Button>
      )}
    </div>
  );
}
