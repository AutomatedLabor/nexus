import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingStateProps {
  label?: string;
  className?: string;
}

/** Centered spinner with optional label. */
export function LoadingState({ label, className }: LoadingStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-16 text-center",
        className,
      )}
    >
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
      {label && (
        <p className="text-sm text-muted-foreground">{label}</p>
      )}
    </div>
  );
}
