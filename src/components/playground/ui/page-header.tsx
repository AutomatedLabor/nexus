import * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

/** Hero block at the top of each view: icon + title + description + actions. */
export function PageHeader({
  title,
  description,
  icon,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {icon && (
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
            {icon}
          </div>
        )}
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {description && (
            <p className="max-w-2xl text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
