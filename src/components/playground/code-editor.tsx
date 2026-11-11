"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface CodeEditorProps {
  value: string;
  onChange: (next: string) => void;
  onRun?: () => void;
  className?: string;
  placeholder?: string;
  /** Aria label for the textarea. */
  label?: string;
  minLines?: number;
}

/**
 * CodeEditor — a lightweight, dependency-free code editor.
 *
 * Renders a textarea with a synced line-number gutter on the left. The
 * textarea is the source of truth; the gutter re-renders from `value`'s
 * line count. Monospace, comfortable line-height, theme-aware colors.
 *
 * Keyboard: Cmd/Ctrl+Enter triggers `onRun`.
 */
export function CodeEditor({
  value,
  onChange,
  onRun,
  className,
  placeholder = "// Write Aether code here…",
  label = "Aether source editor",
  minLines = 12,
}: CodeEditorProps) {
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const gutterRef = React.useRef<HTMLDivElement>(null);

  const lineCount = React.useMemo(() => {
    const n = value.split("\n").length;
    return Math.max(minLines, n);
  }, [value, minLines]);

  // Sync scroll between textarea and gutter.
  function onScroll() {
    const ta = taRef.current;
    const g = gutterRef.current;
    if (ta && g) g.scrollTop = ta.scrollTop;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl + Enter → Run
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onRun?.();
      return;
    }
    // Tab inserts two spaces (keeps selection simple).
    if (e.key === "Tab" && !e.altKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      const ta = e.currentTarget;
      const { selectionStart: s, selectionEnd: en } = ta;
      const next =
        value.slice(0, s) + "  " + value.slice(en);
      onChange(next);
      // Restore caret on next tick.
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = s + 2;
      });
    }
  }

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-1 overflow-hidden rounded-lg border bg-muted/30",
        "focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30",
        className,
      )}
    >
      {/* Gutter */}
      <div
        ref={gutterRef}
        aria-hidden
        className="select-none overflow-hidden border-r bg-muted/40 px-3 py-3 text-right font-mono text-xs leading-relaxed text-muted-foreground/70"
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i} className="tabular-nums">
            {i + 1}
          </div>
        ))}
      </div>

      {/* Textarea */}
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        wrap="off"
        aria-label={label}
        placeholder={placeholder}
        className={cn(
          "block flex-1 resize-none bg-transparent px-3 py-3 font-mono text-xs leading-relaxed text-foreground outline-none",
          "placeholder:text-muted-foreground/50",
          "scrollbar-thin",
        )}
        style={{ tabSize: 2 }}
      />
    </div>
  );
}
