"use client";

import * as React from "react";
import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarNav } from "./sidebar-nav";

export function BrandLogo({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex items-center gap-2.5", className)} {...props}>
      <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <Activity className="size-5" aria-hidden="true" />
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-base font-semibold tracking-tight text-foreground">ATLAS</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Autonomous Tech Limits
        </span>
      </div>
    </div>
  );
}

export function AppSidebar() {
  return (
    <aside
      className="hidden h-screen w-64 shrink-0 border-r bg-sidebar text-sidebar-foreground md:flex md:flex-col"
      aria-label="Sidebar navigation"
    >
      <div className="flex h-16 items-center border-b px-5">
        <BrandLogo />
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <SidebarNav />
      </div>
      <div className="border-t p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">ATLAS v1.0</p>
        <p className="mt-0.5">Agent capability telemetry</p>
      </div>
    </aside>
  );
}
