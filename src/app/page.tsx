import { PlaygroundShell } from "@/components/playground/playground-shell";

/**
 * Root page — the entire Aether playground is a single-page app rendered at
 * `/`. View switching happens client-side via Zustand (`view-store.ts`), so
 * there's only one Next.js route.
 */
export default function HomePage() {
  return <PlaygroundShell />;
}
