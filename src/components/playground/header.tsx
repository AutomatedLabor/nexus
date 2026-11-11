"use client";

import * as React from "react";
import { Sun, Moon, Menu, Github, Check } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Brand, NavList, NAV_ITEMS } from "./sidebar";
import { useViewStore } from "@/lib/view-store";

const GITHUB_URL = "https://github.com/AutomatedLabor/nexus";

/** Header — sticky at top of main content; contains mobile menu trigger,
 *  current view title, theme toggle and GitHub link. */
export function Header({ runStatus }: { runStatus?: React.ReactNode }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const view = useViewStore((s) => s.view);
  const current = NAV_ITEMS.find((i) => i.id === view);

  React.useEffect(() => setMounted(true), []);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur md:px-6">
      {/* Mobile menu trigger */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open navigation menu"
          >
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="flex h-16 items-center border-b px-4">
            <Brand />
          </SheetTitle>
          <SheetDescription className="sr-only">
            Aether playground navigation menu — switch between views.
          </SheetDescription>
          <div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
            <p className="px-3 pb-2 pt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Workspace
            </p>
            <NavList onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Current view title (mobile shows short, desktop shows full) */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <h2 className="truncate text-base font-semibold text-foreground md:text-lg">
          {current?.label ?? "Playground"}
        </h2>
        <Badge variant="secondary" className="hidden sm:inline-flex">
          v1.0
        </Badge>
      </div>

      <div className="flex items-center gap-2">
        {runStatus}
        {mounted ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
          >
            {theme === "dark" ? (
              <Sun className="size-5" />
            ) : (
              <Moon className="size-5" />
            )}
          </Button>
        ) : (
          <Button variant="ghost" size="icon" aria-hidden disabled>
            <Sun className="size-5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          asChild
          aria-label="Open Aether on GitHub"
        >
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">
            <Github className="size-5" />
          </a>
        </Button>
      </div>
    </header>
  );
}

/** Small "OK / Running / Error" indicator that lives in the header. */
export function RunStatus({
  status,
  lastMs,
}: {
  status: "idle" | "running" | "ok" | "error";
  lastMs?: number;
}) {
  const color =
    status === "ok"
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      : status === "error"
        ? "bg-destructive/15 text-destructive"
        : status === "running"
          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
          : "bg-muted text-muted-foreground";
  const label =
    status === "ok"
      ? "Ready"
      : status === "error"
        ? "Error"
        : status === "running"
          ? "Running"
          : "Idle";
  return (
    <span
      className={`hidden items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium sm:inline-flex ${color}`}
      aria-live="polite"
    >
      {status === "ok" ? (
        <Check className="size-3.5" />
      ) : status === "running" ? (
        <span className="size-2 animate-pulse rounded-full bg-current" />
      ) : (
        <span className="size-2 rounded-full bg-current opacity-70" />
      )}
      {label}
      {typeof lastMs === "number" && status !== "running" && (
        <span className="opacity-60">· {lastMs.toFixed(1)}ms</span>
      )}
    </span>
  );
}
