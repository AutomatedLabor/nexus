/**
 * aether/core/opt/index.ts
 * ========================
 * Public barrel for the Aether IR optimizer.
 *
 *   import {
 *     runPasses, countInstrs, cloneIr,                 // framework
 *     constantFolding, dce, cse, inlining, tco,        // passes
 *     licm, strengthReduction, branchSimplification,
 *     DEFAULT_PASSES,
 *   } from "../opt";
 *
 * See `README.md` for the pass pipeline order and rationale.
 */
export { runPasses, countInstrs, cloneIr } from "./opt";
export type { Pass } from "./opt";

export { constantFolding } from "./constant-folding";
export { dce } from "./dce";
export { cse } from "./cse";
export { inlining } from "./inlining";
export { tco } from "./tco";
export { licm } from "./licm";
export { strengthReduction } from "./strength-reduction";
export { branchSimplification } from "./branch-simplification";

import { constantFolding } from "./constant-folding";
import { dce } from "./dce";
import { cse } from "./cse";
import { inlining } from "./inlining";
import { tco } from "./tco";
import { licm } from "./licm";
import { strengthReduction } from "./strength-reduction";
import { branchSimplification } from "./branch-simplification";
import type { Pass } from "./opt";

/**
 * The default optimization pipeline. Ordering rationale (see README.md for
 * the long version):
 *
 *   1. constantFolding       — folds away the obvious arithmetic so the
 *                              next passes have less to chew on.
 *   2. dce                   — strips the dead instructions exposed by (1).
 *   3. cse                   — collapses redundant expressions.
 *   4. inlining              — inlines small functions, exposing even more
 *                              constants / dead code.
 *   5. tco                   — marks tail calls so inlined bodies that end
 *                              in a tail recursion don't bloat the stack.
 *   6. licm                  — hoists loop-invariant code now that most
 *                              inlining is done.
 *   7. strengthReduction     — replaces expensive multiplies with shifts;
 *                              late so the operand shape is stable.
 *   8. branchSimplification  — collapses constant branches and merges
 *                              trivial blocks left over by previous passes.
 *
 * Running the pipeline once produces a clean, compact IR. For aggressive
 * pipelines you may re-run `DEFAULT_PASSES` 2-3 times; the fixpoint passes
 * will simply no-op on the second run.
 */
export const DEFAULT_PASSES: Pass[] = [
  constantFolding,
  dce,
  cse,
  inlining,
  tco,
  licm,
  strengthReduction,
  branchSimplification,
];
