"use client";

import { useViewStore } from "@/lib/view-store";
import type { AtlasView } from "@/types/atlas";
import {
  LayoutDashboard,
  Server,
  Gauge,
  AlertOctagon,
  FileText,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  view: AtlasView;
  label: string;
  icon: typeof LayoutDashboard;
  description: string;
}

export const NAV_ITEMS: NavItem[] = [
  { view: "dashboard", label: "Dashboard", icon: LayoutDashboard, description: "Overview of agent limits & performance" },
  { view: "environment", label: "Environment", icon: Server, description: "Hardware, tools, and capabilities" },
  { view: "benchmarks", label: "Benchmarks", icon: Gauge, description: "Run and analyze benchmarks" },
  { view: "limits", label: "Limits", icon: AlertOctagon, description: "Resource & capability limits" },
  { view: "reports", label: "Reports", icon: FileText, description: "Generate and export reports" },
  { view: "settings", label: "Settings", icon: Settings, description: "App preferences" },
];

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const view = useViewStore((s) => s.view);
  const setView = useViewStore((s) => s.setView);

  return (
    <nav className="flex flex-col gap-1" aria-label="Primary">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = view === item.view;
        return (
          <button
            key={item.view}
            type="button"
            onClick={() => {
              setView(item.view);
              onNavigate?.();
            }}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-start gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-primary/10 text-primary"
                : "text-foreground/70 hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 size-4 shrink-0",
                active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
              )}
              aria-hidden="true"
            />
            <div className="flex flex-col">
              <span>{item.label}</span>
              <span
                className={cn(
                  "text-xs font-normal",
                  active ? "text-primary/70" : "text-muted-foreground"
                )}
              >
                {item.description}
              </span>
            </div>
          </button>
        );
      })}
    </nav>
  );
}
