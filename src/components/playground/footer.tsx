import * as React from "react";
import { Github, Hexagon, Heart } from "lucide-react";

const GITHUB_URL = "https://github.com/AutomatedLabor/nexus";

/**
 * Footer — sticky at the bottom of the viewport. The parent layout uses
 * `min-h-screen flex flex-col` and applies `mt-auto` here so the footer
 * sits at the bottom when content is short and is pushed down naturally
 * when content overflows.
 */
export function Footer() {
  return (
    <footer className="mt-auto border-t bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-4 text-sm text-muted-foreground sm:flex-row md:px-6">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded bg-primary text-primary-foreground">
            <Hexagon className="size-3.5" />
          </div>
          <span>
            Aether · Project Nexus
          </span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">v1.0</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1">
            Built with Next.js 16
          </span>
          <span aria-hidden className="hidden sm:inline">·</span>
          <span className="inline-flex items-center gap-1">
            Made with <Heart className="size-3" /> by autonomous agents
          </span>
          <span aria-hidden className="hidden sm:inline">·</span>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
          >
            <Github className="size-3.5" />
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
