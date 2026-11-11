"use client";

import { create } from "zustand";
import type { AtlasView } from "@/types/atlas";

interface ViewState {
  view: AtlasView;
  setView: (v: AtlasView) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  view: "dashboard",
  setView: (v) => set({ view: v }),
}));

interface NotificationPrefs {
  toastOnBenchmarkComplete: boolean;
  toastOnReportReady: boolean;
  toastOnExport: boolean;
  setPref: (k: keyof NotificationPrefs, v: boolean) => void;
}

export const useNotificationPrefs = create<NotificationPrefs>((set) => ({
  toastOnBenchmarkComplete: true,
  toastOnReportReady: true,
  toastOnExport: true,
  setPref: (k, v) => set({ [k]: v } as Partial<NotificationPrefs>),
}));
