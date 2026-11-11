"use client";

import { useViewStore } from "@/lib/view-store";
import { AppSidebar } from "./layout/app-sidebar";
import { AppHeader } from "./layout/app-header";
import { AppFooter } from "./layout/app-footer";
import { DashboardView } from "./views/dashboard-view";
import { EnvironmentView } from "./views/environment-view";
import { BenchmarksView } from "./views/benchmarks-view";
import { LimitsView } from "./views/limits-view";
import { ReportsView } from "./views/reports-view";
import { SettingsView } from "./views/settings-view";
import { TooltipProvider } from "@/components/ui/tooltip";

export function AtlasApp() {
  const view = useViewStore((s) => s.view);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <div className="flex flex-1 flex-col md:flex-row">
          <AppSidebar />
          <div className="flex min-h-screen flex-1 flex-col">
            <AppHeader />
            <main id="atlas-main" className="flex-1 px-4 py-6 md:px-8" tabIndex={-1}>
              <div className="mx-auto w-full max-w-7xl">
                {view === "dashboard" && <DashboardView />}
                {view === "environment" && <EnvironmentView />}
                {view === "benchmarks" && <BenchmarksView />}
                {view === "limits" && <LimitsView />}
                {view === "reports" && <ReportsView />}
                {view === "settings" && <SettingsView />}
              </div>
            </main>
            <AppFooter />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
