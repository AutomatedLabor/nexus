"use client";

import { compileAndRun, type CompileResult, type Value } from "@aether/core";

/**
 * aether-worker.ts
 * =================
 * Thin browser-side wrapper around the Aether compiler/runtime.
 *
 * The Aether core is pure TypeScript with no Node dependencies (the io/crypto
 * modules check `typeof process` and throw cleanly when called in the browser),
 * so `compileAndRun` can run directly in the page — no Web Worker, no server
 * round-trip. We expose a tiny async API so the UI can show a "running…"
 * state even though the underlying call is synchronous.
 */

export interface RunHandle {
  result: CompileResult;
  /** Wall-clock time in milliseconds. */
  elapsedMs: number;
}

export interface RunOptions {
  /** Called once per `println` / `print` output line. */
  onOutput?: (line: string) => void;
  /** Step cap — default 1,000,000. */
  maxSteps?: number;
}

/**
 * Compile and run an Aether source string in the browser.
 * Resolves on the next microtask so the UI can paint a loading state.
 */
export function runAether(
  source: string,
  opts: RunOptions = {},
): Promise<RunHandle> {
  return new Promise((resolve) => {
    // Defer one tick so the caller can render a "running" indicator first.
    setTimeout(() => {
      const start =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const result = compileAndRun(source, {
        stdout: opts.onOutput,
        maxSteps: opts.maxSteps,
      });
      const end =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      resolve({ result, elapsedMs: end - start });
    }, 0);
  });
}

/** Format an Aether runtime Value into a readable string. */
export function formatValue(v: Value): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return "[" + v.map(formatValue).join(", ") + "]";
  if (v instanceof Map) {
    const pairs: string[] = [];
    for (const [k, val] of v) pairs.push(`${formatValue(k)}: ${formatValue(val)}`);
    return "{" + pairs.join(", ") + "}";
  }
  if (typeof v === "object" && v !== null) {
    const obj = v as Record<string, unknown>;
    if (obj.__struct) {
      const fields = obj.fields as Record<string, unknown>;
      return `${obj.__struct} { ${
        Object.entries(fields)
          .map(([k, val]) => `${k}: ${formatValue(val as Value)}`)
          .join(", ")
      } }`;
    }
    if (obj.__variant) {
      const data = (obj.data as unknown[] as Value[]) ?? [];
      if (data.length === 0) return `${obj.variant}`;
      return `${obj.variant}(${data.map(formatValue).join(", ")})`;
    }
    if (obj.__closure) return `<fn ${obj.__closure}>`;
    if (obj.__native) return `<native ${obj.__native}>`;
    if (obj.__range) return `${obj.start}..${obj.end}`;
  }
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
