"use client";

/**
 * src/components/playground/assistant-panel.tsx
 * =============================================
 * A self-contained "AI Assistant" panel for the Aether playground.
 *
 * Posts the current playground source plus a natural-language question
 * to the existing `POST /api/assistant` route, which forwards both to
 * the z-ai LLM with an Aether-aware system prompt and returns an
 * answer.  Renders the answer in a scrollable, monospace-flavoured
 * panel with quick-action buttons ("Explain", "Find bugs", "Improve",
 * "Generate test") and the ability to ask follow-up questions.
 *
 * The panel is collapsible (open/closed) and keeps a short history of
 * previous Q/A turns in component state so the user can scroll back
 * through the conversation.
 */

import * as React from "react";
import {
  Sparkles,
  Send,
  Loader2,
  ChevronDown,
  ChevronRight,
  X,
  Bug,
  Wand2,
  FileText,
  HelpCircle,
  AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

/** One Q/A exchange rendered in the assistant history. */
interface Turn {
  /** The user's question verbatim. */
  question: string;
  /** The assistant's answer (markdown-ish text). */
  answer: string;
  /** True while waiting for the server's reply. */
  pending: boolean;
  /** Error message if the fetch failed; null otherwise. */
  error: string | null;
}

interface AssistantPanelProps {
  /** The current Aether source code in the playground editor. */
  code: string;
  /** Optional initial open state.  Defaults to collapsed. */
  defaultOpen?: boolean;
}

/** The four preset question templates — short, pointed, Aether-aware. */
const QUICK_ACTIONS: Array<{ label: string; icon: typeof Bug; prompt: string }> = [
  {
    label: "Explain",
    icon: HelpCircle,
    prompt: "Explain what this Aether code does, step by step. Note any Aether-specific behaviour.",
  },
  {
    label: "Find bugs",
    icon: Bug,
    prompt:
      "Find any bugs in this Aether code. Aether quirks to watch for: for-loop scope, return-after-block, float division `/`. Point at the exact line and suggest a fix.",
  },
  {
    label: "Improve",
    icon: Wand2,
    prompt:
      "Suggest improvements to this Aether code: clarity, idioms, performance. Prefer `while`/`map`/`filter`/`reduce`/recursion over C-style for loops; bare-expression returns over `return X;`.",
  },
  {
    label: "Generate test",
    icon: FileText,
    prompt:
      "Generate a small Aether test program that exercises this code's main paths. Use `assert_eq` and `print`. Keep it under 40 lines.",
  },
];

/** Tiny markdown-ish renderer: code fences and inline code, headings, lists. */
function renderAnswer(text: string): React.ReactNode {
  // Split on triple-backtick fences.  Even indices are prose, odd are code.
  const parts = text.split(/```/);
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {parts.map((part, i) => {
        // Strip a leading language tag like "aether\n" or "js\n" from code blocks.
        const isCode = i % 2 === 1;
        if (isCode) {
          const nl = part.indexOf("\n");
          const body = nl >= 0 ? part.slice(nl + 1) : part;
          // Drop trailing newline only.
          const trimmed = body.replace(/\n$/, "");
          return (
            <pre
              key={i}
              className="overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground"
            >
              {trimmed}
            </pre>
          );
        }
        // Prose: split into lines, render headings/lists/paragraphs/inline code.
        const lines = part.split(/\n/);
        return (
          <div key={i} className="space-y-1.5">
            {lines.map((line, j) => {
              const trimmed = line.trim();
              if (trimmed === "") return null;
              // Headings.
              if (trimmed.startsWith("### ")) {
                return (
                  <div key={j} className="mt-2 text-xs font-semibold text-foreground">
                    {renderInline(trimmed.slice(4))}
                  </div>
                );
              }
              if (trimmed.startsWith("## ")) {
                return (
                  <div key={j} className="mt-2 text-sm font-semibold text-foreground">
                    {renderInline(trimmed.slice(3))}
                  </div>
                );
              }
              if (trimmed.startsWith("# ")) {
                return (
                  <div key={j} className="mt-2 text-sm font-bold text-foreground">
                    {renderInline(trimmed.slice(2))}
                  </div>
                );
              }
              // Unordered list.
              if (/^[-*] /.test(trimmed)) {
                return (
                  <div key={j} className="flex gap-2 pl-2 text-xs text-muted-foreground">
                    <span className="select-none">•</span>
                    <span className="flex-1">{renderInline(trimmed.slice(2))}</span>
                  </div>
                );
              }
              // Ordered list.
              const m = /^(\d+)\. (.*)$/.exec(trimmed);
              if (m) {
                return (
                  <div key={j} className="flex gap-2 pl-2 text-xs text-muted-foreground">
                    <span className="select-none text-foreground">{m[1]}.</span>
                    <span className="flex-1">{renderInline(m[2])}</span>
                  </div>
                );
              }
              // Paragraph.
              return (
                <p key={j} className="text-xs text-muted-foreground">
                  {renderInline(trimmed)}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/** Render inline `code spans` and **bold** within a single line of prose. */
function renderInline(text: string): React.ReactNode {
  // Tokenise on `...` and **...**, preserving order.
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/);
  return tokens.map((tok, i) => {
    if (tok.startsWith("`") && tok.endsWith("`")) {
      return (
        <code
          key={i}
          className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[11px] text-foreground"
        >
          {tok.slice(1, -1)}
        </code>
      );
    }
    if (tok.startsWith("**") && tok.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {tok.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={i}>{tok}</React.Fragment>;
  });
}

export function AssistantPanel({ code, defaultOpen = false }: AssistantPanelProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const [question, setQuestion] = React.useState("");
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom whenever turns change.
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns]);

  /** POST a question to /api/assistant and append the answer to history. */
  const ask = React.useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length === 0) return;
      // Optimistic: append a pending turn.
      const turnId = turns.length;
      setTurns((prev) => [
        ...prev,
        { question: trimmed, answer: "", pending: true, error: null },
      ]);
      setQuestion("");
      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, question: trimmed }),
        });
        const json = await res.json();
        if (!res.ok) {
          const msg =
            (typeof json?.error === "string" && json.error) ||
            `Request failed (HTTP ${res.status})`;
          setTurns((prev) =>
            prev.map((t, i) =>
              i === turnId ? { ...t, pending: false, error: msg } : t,
            ),
          );
          return;
        }
        const answer = typeof json?.answer === "string" ? json.answer : "";
        if (answer.trim().length === 0) {
          setTurns((prev) =>
            prev.map((t, i) =>
              i === turnId
                ? { ...t, pending: false, error: "The model returned an empty answer." }
                : t,
            ),
          );
          return;
        }
        setTurns((prev) =>
          prev.map((t, i) =>
            i === turnId ? { ...t, pending: false, answer } : t,
          ),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "network error";
        setTurns((prev) =>
          prev.map((t, i) =>
            i === turnId ? { ...t, pending: false, error: msg } : t,
          ),
        );
      }
    },
    [code, turns.length],
  );

  /** Enter key in the input submits the question. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ask(question);
    }
  };

  /** Clear the conversation. */
  const clearConversation = () => setTurns([]);

  const busy = turns.some((t) => t.pending);

  return (
    <div className="flex min-h-[280px] min-w-0 flex-col gap-2">
      <Collapsible open={open} onOpenChange={setOpen} className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5 px-2 text-xs">
              {open ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
              <Sparkles className="size-3.5 text-primary" />
              AI Assistant
              {turns.length > 0 && (
                <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {turns.length}
                </span>
              )}
            </Button>
          </CollapsibleTrigger>
          {turns.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-[11px] text-muted-foreground"
              onClick={clearConversation}
              aria-label="Clear conversation"
            >
              <X className="size-3" />
              Clear
            </Button>
          )}
        </div>

        <CollapsibleContent className="flex min-h-0 flex-1 flex-col gap-2 pt-1">
          {/* Conversation history — scrollable. */}
          <div
            ref={scrollRef}
            className="min-h-[140px] flex-1 overflow-auto rounded-lg border bg-muted/20 p-3 scrollbar-thin"
          >
            {turns.length === 0 ? (
              <div className="space-y-2 py-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <Sparkles className="size-3.5 text-primary" />
                  Ask the Aether AI assistant
                </div>
                <p>
                  Ask a question about the code in the editor — explain, find
                  bugs, suggest improvements, or generate a test. The assistant
                  knows Aether&apos;s syntax, builtins, and quirks.
                </p>
                <p className="text-[11px] italic">
                  Tip: use the quick-action buttons below for one-click prompts.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {turns.map((t, i) => (
                  <div key={i} className="space-y-1.5">
                    {/* Question bubble. */}
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-md bg-primary/10 px-3 py-1.5 text-xs text-foreground">
                        <span className="select-none text-[10px] text-primary">You</span>
                        <div className="mt-0.5 whitespace-pre-wrap break-words">
                          {t.question}
                        </div>
                      </div>
                    </div>
                    {/* Answer or status. */}
                    <div className="flex justify-start">
                      <div className="max-w-[92%] rounded-md border bg-background px-3 py-2">
                        <span className="select-none text-[10px] text-muted-foreground">
                          Assistant
                        </span>
                        {t.pending ? (
                          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="size-3.5 animate-spin" />
                            Thinking…
                          </div>
                        ) : t.error ? (
                          <div className="mt-1 flex items-start gap-2 text-xs text-destructive">
                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                            <span className="break-words">{t.error}</span>
                          </div>
                        ) : (
                          <div className="mt-1">{renderAnswer(t.answer)}</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick-action buttons. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {QUICK_ACTIONS.map((qa) => (
              <Button
                key={qa.label}
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 px-2 text-[11px]"
                onClick={() => ask(qa.prompt)}
                disabled={busy}
              >
                <qa.icon className="size-3" />
                {qa.label}
              </Button>
            ))}
          </div>

          {/* Input row. */}
          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              type="text"
              placeholder="Ask about the code…  (e.g. “Why does this loop return 0?”)"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={busy}
              className="h-8 text-xs"
            />
            <Button
              size="sm"
              className="h-8 gap-1.5 px-3"
              onClick={() => ask(question)}
              disabled={busy || question.trim().length === 0}
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
              Ask
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
