import * as React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface SectionCardProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  /** Stretch the content to fill the available height. */
  fill?: boolean;
  /** Extra classes on the outer Card. */
  className?: string;
  /** Pass-through test id (handy for component tests). */
  "data-testid"?: string;
  /** Card body content. */
  children?: React.ReactNode;
}

/**
 * SectionCard — a consistent Card wrapper used across playground views.
 * Renders an optional icon + title + description header and an actions slot
 * aligned to the right. Content is padded with `p-6`.
 */
export function SectionCard({
  title,
  description,
  icon,
  actions,
  fill,
  className,
  children,
  ...rest
}: SectionCardProps) {
  return (
    <Card
      className={cn(
        "gap-0 py-0",
        fill && "h-full flex-1",
        className,
      )}
      {...rest}
    >
      {(title || description || actions) && (
        <CardHeader className="border-b px-6 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              {icon && (
                <div className="mt-0.5 flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  {icon}
                </div>
              )}
              <div className="space-y-1">
                {title && (
                  <CardTitle className="text-base">{title}</CardTitle>
                )}
                {description && (
                  <CardDescription className="text-sm">
                    {description}
                  </CardDescription>
                )}
              </div>
            </div>
            {actions && <div className="shrink-0">{actions}</div>}
          </div>
        </CardHeader>
      )}
      <CardContent className="p-6">{children}</CardContent>
    </Card>
  );
}
