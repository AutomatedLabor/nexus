/**
 * aether/core/opt/testutil.ts
 * ==========================
 * Shared helpers for pass tests.
 *
 * `expectProg` deep-compares two IrPrograms by serializing both through
 * `dumpProg` (a stable, deterministic string). Using string equality gives
 * readable diff output via vitest's standard matcher and avoids subtle
 * issues comparing `Map`s deep-structurally.
 */
import type { IrProgram } from "./types";
import { dumpProg } from "./irbuilder";

/** Assert that `actual` matches `expected` structurally. */
export function expectProg(actual: IrProgram, expected: IrProgram): void {
  const aStr = dumpProg(actual);
  const eStr = dumpProg(expected);
  if (aStr !== eStr) {
    throw new Error(
      `\nProgram mismatch.\n=== actual ===\n${aStr}\n=== expected ===\n${eStr}\n=== end ===`,
    );
  }
}

/** Assert that the program is unchanged by some transform. */
export function expectUnchanged(prog: IrProgram, run: (p: IrProgram) => IrProgram): void {
  expectProg(run(prog), prog);
}

/** Count instructions in a single function. */
export function countFuncInstrs(prog: IrProgram, fnName: string): number {
  const f = prog.funcs.find(x => x.name === fnName);
  if (!f) throw new Error(`no such function: ${fnName}`);
  let n = 0;
  for (const b of f.blocks) n += b.instrs.length;
  return n;
}
