"use client";

import * as React from "react";
import { Sidebar } from "./sidebar";
import { Header, RunStatus } from "./header";
import { Footer } from "./footer";
import { useViewStore } from "@/lib/view-store";
import { PlaygroundView } from "./views/playground-view";
import { ExplorerView } from "./views/explorer-view";
import { StdlibView } from "./views/stdlib-view";
import { ExamplesView } from "./views/examples-view";
import { PackagesView } from "./views/packages-view";
import { BenchmarksView } from "./views/benchmarks-view";
import { AboutView } from "./views/about-view";

/**
 * PlaygroundShell — root of the single-page playground.
 *
 * Layout:
 *  ┌─ flex min-h-screen flex-col ────────┐
 *  │ ┌ Sidebar ┬── main flex-col ──────┐ │
 *  │ │        │  Header (sticky)       │ │
 *  │ │        │  Active view (flex-1)   │ │
 *  │ │        │  Footer (mt-auto)      │ │
 *  │ └────────┴────────────────────────┘ │
 *  └────────────────────────────────────┘
 *
 * The Sidebar is fixed-width on md+ (hidden on mobile — Header has a Sheet).
 */
export function PlaygroundShell() {
  const view = useViewStore((s) => s.view);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div className="flex flex-1 flex-col md:flex-row">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header />
          <main className="flex flex-1 flex-col overflow-x-hidden">
            <ViewSwitch view={view} />
          </main>
          <Footer />
        </div>
      </div>
    </div>
  );
}

function ViewSwitch({ view }: { view: string }) {
  switch (view) {
    case "playground":
      return <PlaygroundView />;
    case "explorer":
      return <ExplorerView />;
    case "stdlib":
      return <StdlibView />;
    case "examples":
      return <ExamplesView />;
    case "packages":
      return <PackagesView />;
    case "benchmarks":
      return <BenchmarksView />;
    case "about":
      return <AboutView />;
    default:
      return <PlaygroundView />;
  }
}

export { RunStatus };
