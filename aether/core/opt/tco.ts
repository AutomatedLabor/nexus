/**
 * aether/core/opt/tco.ts
 * =======================
 * Pass 5: Tail Call Optimization.
 *
 * Detects the pattern
 *
 *     Call(fn, args, dest)
 *     Return(dest)
 *
 * inside the same block and replaces it with a single `TailCall(fn, args)`
 * instruction. `TailCall` semantically tail-calls `fn(args)` and forwards
 * the result directly to the caller of the current frame — no extra stack
 * frame is needed. A backend can lower this to a jump instead of a call.
 *
 * Representation choice
 * ----------------------
 * The task offered two options: add a new `TailCall` opcode, or represent
 * the transformation as `Move(arg params) + Jmp to entry block`. We chose the
 * dedicated `TailCall` opcode (added to `IrOp` in `./types.ts`) because:
 *
 *   - It is explicit and self-documenting in IR dumps.
 *   - It preserves the callee's identity (`fn`), which lets downstream
 *     passes (e.g. a future devirtualizer or trampoline-aware backend)
 *     reason about tail calls without re-deriving them.
 *   - It avoids overwriting the function's parameter registers (which
 *     would require scratch registers and would complicate liveness).
 *
 * The alternative representation (`Move(arg params) + Jmp to entry`) is
 * cheaper to implement but loses information: a backend couldn't tell a
 * recursive self-loop from a function that just happens to branch back to
 * the entry. We preferred clarity over micro-compactness here.
 *
 * Strictness
 * ----------
 * We only fire when the `Call` is *immediately* followed by `Return(dest)`
 * in the same block, with no intervening instructions and with the
 * `Return`'s src matching the `Call`'s dest. This is the textbook
 * tail-position definition; more aggressive detection (e.g. through Moves)
 * is left to future work.
 *
 * `TailCall` is a terminator (no successor instructions). Anything after
 * the original `Return` would have been unreachable anyway. The pass
 * removes both the `Call` and the `Return` and inserts `TailCall` in
 * their place.
 *
 * The pass is pure: clones input, mutates only the clone.
 */
import type { IrProgram, IrFunc, IrBlock, IrOp } from "./types";
import { cloneIr } from "./opt";

//----------------------------------------------------------------------------

/** Run TCO on a single block. Returns true if anything changed. */
function tcoBlock(block: IrBlock): boolean {
  let changed = false;
  const out: IrOp[] = [];
  for (let i = 0; i < block.instrs.length; i++) {
    const instr = block.instrs[i];
    const op = (instr as { op?: string }).op;
    if (op === "Call" && i + 1 < block.instrs.length) {
      const next = block.instrs[i + 1];
      const nOp = (next as { op?: string }).op;
      const call = instr as { fn: string; args: number[]; dest: number };
      if (nOp === "Return") {
        const r = next as { src: number | null };
        if (r.src !== null && r.src === call.dest) {
          // Replace Call + Return with TailCall.
          out.push({ op: "TailCall", fn: call.fn, args: call.args });
          i++; // skip the Return
          changed = true;
          continue;
        }
      }
    }
    out.push(instr);
  }
  if (changed) block.instrs = out;
  return changed;
}

//----------------------------------------------------------------------------

/** The TCO pass. Pure: clones input, mutates only the clone. */
export function tco(prog: IrProgram): IrProgram {
  const result = cloneIr(prog);
  let changed = true;
  let iters = 0;
  while (changed && iters < 100) {
    changed = false;
    for (const func of result.funcs) {
      for (const block of func.blocks) {
        if (tcoBlock(block)) changed = true;
      }
    }
    iters++;
  }
  return result;
}
