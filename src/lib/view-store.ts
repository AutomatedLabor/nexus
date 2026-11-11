"use client";

import { create } from "zustand";

export type ViewId =
  | "playground"
  | "explorer"
  | "stdlib"
  | "examples"
  | "benchmarks"
  | "about";

export interface ViewState {
  view: ViewId;
  /** The code currently loaded into the playground editor. */
  code: string;
  /** Marker bumped whenever new code is loaded from Examples / Share URL,
   *  so the playground editor can re-sync its textarea. */
  codeVersion: number;
  setView: (v: ViewId) => void;
  loadCode: (code: string, switchToPlayground?: boolean) => void;
}

const DEFAULT_CODE = `// Aether — a small, expression-oriented, statically-typed language.
// Press Run (or Cmd/Ctrl + Enter) to evaluate.
// Note: print() takes a single expression — use string interpolation
// (f"…{expr}…") to compose values.

fn fib(n: int) -> int {
  if n < 2 { n } else { fib(n - 1) + fib(n - 2) }
}

print(fib(10));

// Closures + a mutable counter.
let mut counter = 0;
let bump = fn() -> int { counter = counter + 1; counter };
bump();
bump();
print(counter);

// Algebraic data types + pattern matching.
enum Shape {
  Circle(float),
  Square(float),
  Rect(float, float),
}

fn area(s: Shape) -> float {
  match s {
    Shape::Circle(r)  => 3.14159 * r * r,
    Shape::Square(s)  => s * s,
    Shape::Rect(w, h) => w * h,
  }
}

print(area(Shape::Circle(2.0)));
print(area(Shape::Rect(3.0, 4.0)));

// String interpolation.
let name = "world";
print(f"hello, {name}!");
print(f"fib(10) = {fib(10)}");
`;

export const useViewStore = create<ViewState>((set) => ({
  view: "playground",
  code: DEFAULT_CODE,
  codeVersion: 0,
  setView: (v) => set({ view: v }),
  loadCode: (code, switchToPlayground = true) =>
    set((s) => ({
      code,
      codeVersion: s.codeVersion + 1,
      view: switchToPlayground ? "playground" : s.view,
    })),
}));
