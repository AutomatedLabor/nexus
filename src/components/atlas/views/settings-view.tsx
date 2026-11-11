"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Plus, Trash2, KeyRound, Globe, Bell, Moon, Sun, Laptop, Github, Info } from "lucide-react";
import { PageHeader } from "@/components/atlas/ui/page-header";
import { SectionCard } from "@/components/atlas/ui/section-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useNotificationPrefs } from "@/lib/view-store";

interface StoredKey {
  id: string;
  label: string;
  value: string;
  createdAt: string;
}

const STORAGE_KEY = "atlas:api-keys";

function loadKeys(): StoredKey[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveKeys(keys: StoredKey[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch {
    /* ignore */
  }
}

function ThemeControls() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const options: { value: "light" | "dark" | "system"; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Laptop },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const Icon = opt.icon;
          const active = mounted && theme === opt.value;
          return (
            <Button
              key={opt.value}
              variant={active ? "default" : "outline"}
              size="sm"
              onClick={() => setTheme(opt.value)}
              aria-pressed={active ? "true" : "false"}
            >
              <Icon className="size-4" aria-hidden="true" />
              {opt.label}
            </Button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Theme preference is stored locally via next-themes and applied with a class on the root html element.
      </p>
    </div>
  );
}

function ApiKeyManager() {
  const [keys, setKeys] = useState<StoredKey[]>(() => loadKeys());
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");

  const addKey = () => {
    if (!label.trim() || !value.trim()) {
      toast.error("Provide both a label and a key value.");
      return;
    }
    const newKey: StoredKey = {
      id: crypto.randomUUID(),
      label: label.trim(),
      value: value.trim(),
      createdAt: new Date().toISOString(),
    };
    const next = [newKey, ...keys];
    setKeys(next);
    saveKeys(next);
    setLabel("");
    setValue("");
    toast.success(`Added key "${newKey.label}".`);
  };

  const removeKey = (id: string) => {
    const next = keys.filter((k) => k.id !== id);
    setKeys(next);
    saveKeys(next);
    toast.success("Key removed.");
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="key-label">Label</Label>
          <Input
            id="key-label"
            placeholder="Production agent"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="key-value">Key</Label>
          <Input
            id="key-value"
            type="password"
            placeholder="atlas_sk_..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <Button onClick={addKey} className="w-full sm:w-auto">
            <Plus className="size-4" aria-hidden="true" />
            Add
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Keys are stored only in your browser&apos;s local storage. They are never sent to the server.
      </p>

      {keys.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          No API keys configured.
        </div>
      ) : (
        <ul className="space-y-2">
          {keys.map((k) => (
            <li
              key={k.id}
              className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <KeyRound className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  <p className="truncate text-sm font-medium text-foreground">{k.label}</p>
                </div>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {k.value.slice(0, 4)}••••••{k.value.slice(-4)}
                </p>
              </div>
              <Badge variant="outline" className="text-muted-foreground">
                {new Date(k.createdAt).toLocaleDateString()}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeKey(k.id)}
                aria-label={`Remove key ${k.label}`}
              >
                <Trash2 className="size-4 text-muted-foreground" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotificationControls() {
  const prefs = useNotificationPrefs();
  const items: {
    key: keyof typeof prefs;
    label: string;
    description: string;
  }[] = [
    {
      key: "toastOnBenchmarkComplete",
      label: "Benchmark complete",
      description: "Toast when a benchmark run finishes successfully.",
    },
    {
      key: "toastOnReportReady",
      label: "Report ready",
      description: "Toast when a generated report becomes available.",
    },
    {
      key: "toastOnExport",
      label: "Export downloaded",
      description: "Toast when an export download is triggered.",
    },
  ];

  return (
    <ul className="space-y-4">
      {items.map((it) => {
        const value = prefs[it.key] as boolean;
        return (
          <li
            key={it.key}
            className="flex items-start justify-between gap-3 rounded-lg border bg-card p-3"
          >
            <div>
              <p className="text-sm font-medium text-foreground">{it.label}</p>
              <p className="text-xs text-muted-foreground">{it.description}</p>
            </div>
            <Switch
              checked={value}
              onCheckedChange={(v) => prefs.setPref(it.key, v)}
              aria-label={it.label}
            />
          </li>
        );
      })}
    </ul>
  );
}

export function SettingsView() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Personalize ATLAS: theme, credentials, data source, and notifications."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard
          title="Appearance"
          description="Choose how ATLAS looks on this device."
        >
          <ThemeControls />
        </SectionCard>

        <SectionCard
          title="Data source"
          description="Where ATLAS reads its telemetry from."
        >
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground inline-flex items-center gap-2">
                <Globe className="size-4" aria-hidden="true" /> API base URL
              </span>
              <code className="rounded-md border bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
                /api
              </code>
            </li>
            <Separator />
            <li className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Polling interval</span>
              <span className="text-xs text-foreground">30s (default)</span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Retry on failure</span>
              <span className="text-xs text-foreground">1 attempt</span>
            </li>
          </ul>
        </SectionCard>

        <SectionCard
          title="API keys"
          description="Manage credentials stored locally for agent access. (Mock — client only.)"
          className="lg:col-span-2"
        >
          <ApiKeyManager />
        </SectionCard>

        <SectionCard
          title="Notifications"
          description="Toast feedback preferences for ATLAS actions."
          className="lg:col-span-2"
          action={<Bell className="size-4 text-muted-foreground" aria-hidden="true" />}
        >
          <NotificationControls />
        </SectionCard>

        <SectionCard
          title="About"
          description="ATLAS — Autonomous Technical Limit Assessment System."
          className="lg:col-span-2"
        >
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <div className="flex size-12 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Info className="size-6" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <p className="text-base font-semibold text-foreground">ATLAS v1.0</p>
              <p className="text-xs text-muted-foreground">
                Real-time dashboard for AI agent capability, limit, and benchmark telemetry.
              </p>
            </div>
            <Button variant="outline" asChild>
              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2"
              >
                <Github className="size-4" aria-hidden="true" />
                View source
              </a>
            </Button>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
