"use client";

import * as React from "react";
import {
  Code2,
  Compass,
  BookOpen,
  FileCode2,
  Gauge,
  Info,
  Hexagon,
  Package,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useViewStore, type ViewId } from "@/lib/view-store";

interface NavItem {
  id: ViewId;
  label: string;
  icon: LucideIcon;
  hint: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "playground", label: "Playground", icon: Code2, hint: "Write and run Aether code" },
  { id: "explorer", label: "Explorer", icon: Compass, hint: "Browse the grammar & types" },
  { id: "stdlib", label: "Standard Library", icon: BookOpen, hint: "Browse built-in functions" },
  { id: "examples", label: "Examples", icon: FileCode2, hint: "Sample programs" },
  { id: "packages", label: "Packages", icon: Package, hint: "Browse the Aether package registry" },
  { id: "benchmarks", label: "Benchmarks", icon: Gauge, hint: "Performance dashboard" },
  { id: "about", label: "About", icon: Info, hint: "About Aether & Project Nexus" },
];

export function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const view = useViewStore((s) => s.view);
  const setView = useViewStore((s) => s.setView);
  return (
    <nav aria-label="Primary" className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = view === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setView(item.id);
              onNavigate?.();
            }}
            aria-current={active ? "page" : undefined}
            title={item.hint}
            className={cn(
              "group flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="flex-1 text-left">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function Brand() {
  return (
    <div className="flex items-center gap-2 px-3 py-1">
      <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Hexagon className="size-4" />
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-semibold tracking-tight text-foreground">
          Aether
        </span>
        <span className="text-xs text-muted-foreground">Project Nexus</span>
      </div>
    </div>
  );
}

/** Desktop sidebar (fixed width w-64) — hidden on mobile. */
export function Sidebar() {
  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:shrink-0 md:border-r md:bg-sidebar">
      <div className="flex h-16 items-center border-b">
        <Brand />
      </div>
      <div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
        <p className="px-3 pb-2 pt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Workspace
        </p>
        <NavList />
      </div>
      <div className="border-t p-4">
        <p className="text-xs text-muted-foreground">
          A v1 language — built by autonomous agents as part of Project Nexus.
        </p>
      </div>
    </aside>
  );
}
