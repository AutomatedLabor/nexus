/**
 * aether/core/opt/tco.test.ts
 * ===========================
 * 25+ before/after pairs for tail-call optimization.
 *
 * The pass detects `Call(fn, args, dest)` *immediately* followed by
 * `Return(dest)` (same block, no intervening instructions, dest matches)
 * and replaces both with a single `TailCall(fn, args)`.
 *
 * Negative cases:
 *  - Call+Return(dest') where dest' != dest
 *  - Call+other+Return (not adjacent)
 *  - TailCall already present (idempotent)
 *  - Call not in tail position (other instructions after)
 */
import { describe, it, expect } from "vitest";
import { tco } from "./tco";
import {
  program, func, block, const_, bin, move, ret, br, call, tailCall,
} from "./irbuilder";
import { expectProg, expectUnchanged } from "./testutil";

describe("tco", () => {
  it("1. converts Call+Return(dest) -> TailCall", () => {
    const before = program([
      func("f", [], [block(0, [call("g", [], 0), ret(0)])], 0, 1),
    ]);
    const after = tco(before);
    const expected = program([
      func("f", [], [block(0, [tailCall("g", [])])], 0, 1),
    ]);
    expectProg(after, expected);
  });

  it("2. converts Call(args)+Return(dest) -> TailCall(args)", () => {
    const before = program([
      func("f", [0, 1], [
        block(0, [call("g", [0, 1], 2), ret(2)]),
      ], 0, 3),
    ]);
    const after = tco(before);
    const expected = program([
      func("f", [0, 1], [block(0, [tailCall("g", [0, 1])])], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("3. doesn't convert if Return's src != Call's dest", () => {
    const before = program([
      func("f", [], [
        block(0, [const_(5, 0), call("g", [], 1), ret(0)]),  // ret(0) not ret(1)
      ], 0, 2),
    ]);
    expectUnchanged(before, tco);
  });

  it("4. doesn't convert if Return is null (shouldn't happen but defensive)", () => {
    // Our IR's Return always has a src, so this case is hard to construct.
    // Instead, test that an intervening Const prevents TCO.
    const before = program([
      func("f", [], [
        block(0, [call("g", [], 0), const_(1, 1), ret(0)]),
      ], 0, 2),
    ]);
    expectUnchanged(before, tco);
  });

  it("5. doesn't convert if there's an instruction between Call and Return", () => {
    const before = program([
      func("f", [], [
        block(0, [call("g", [], 0), move(0, 1), ret(1)]),  // Move in between
      ], 0, 2),
    ]);
    expectUnchanged(before, tco);
  });

  it("6. converts at the end of a block with multiple preceding instrs", () => {
    const before = program([
      func("f", [0], [
        block(0, [bin("Add", 0, 0, 1), call("g", [1], 2), ret(2)]),
      ], 0, 3),
    ]);
    const after = tco(before);
    const expected = program([
      func("f", [0], [
        block(0, [bin("Add", 0, 0, 1), tailCall("g", [1])]),
      ], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("7. converts TailCall+Return isn't possible — TailCall has no dest", () => {
    // TailCall is already a terminator; there's nothing after.
    const before = program([
      func("f", [], [block(0, [tailCall("g", [])])], 0, 0),
    ]);
    expectUnchanged(before, tco);
  });

  it("8. handles multiple Call+Return pairs in the same block (none)", () => {
    // In one block, only the LAST Call can be tail-positioned. A Call in
    // the middle can't be tail-positioned because something executes after.
    const before = program([
      func("f", [], [
        block(0, [
          call("g", [], 0),
          call("h", [], 1),  // h is tail-positioned
          ret(1),
        ]),
      ], 0, 2),
    ]);
    const after = tco(before);
    const expected = program([
      func("f", [], [
        block(0, [
          call("g", [], 0),  // not tail-positioned
          tailCall("h", []),
        ]),
      ], 0, 2),
    ]);
    expectProg(after, expected);
  });

  it("9. handles TailCall in different blocks (each tail-positioned)", () => {
    const before = program([
      func("f", [0], [
        block(0, [br(0, 1, 2)]),
        block(1, [call("g", [], 1), ret(1)]),  // tail call to g
        block(2, [call("h", [], 2), ret(2)]),  // tail call to h
      ], 0, 3),
    ]);
    const after = tco(before);
    const expected = program([
      func("f", [0], [
        block(0, [br(0, 1, 2)]),
        block(1, [tailCall("g", [])]),
        block(2, [tailCall("h", [])]),
      ], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("10. converts recursive self tail call", () => {
    const before = program([
      func("rec", [0], [
        block(0, [
          const_(0, 1),
          bin("Eq", 0, 1, 2),
          br(2, 1, 2),
        ]),
        block(1, [ret(0)]),
        block(2, [
          const_(1, 3),
          bin("Sub", 0, 3, 4),
          call("rec", [4], 5),
          ret(5),
        ]),
      ], 0, 6),
    ]);
    const after = tco(before);
    const expected = program([
      func("rec", [0], [
        block(0, [const_(0, 1), bin("Eq", 0, 1, 2), br(2, 1, 2)]),
        block(1, [ret(0)]),
        block(2, [const_(1, 3), bin("Sub", 0, 3, 4), tailCall("rec", [4])]),
      ], 0, 6),
    ]);
    expectProg(after, expected);
  });

  it("11. handles a Call followed by a Return of a function arg", () => {
    // The Return value is the Call's dest, not the function's arg.
    const before = program([
      func("f", [0], [block(0, [call("g", [0], 1), ret(0)])], 0, 2),
    ]);
    expectUnchanged(before, tco);
  });

  it("12. handles args that include computed values", () => {
    const before = program([
      func("f", [0], [
        block(0, [
          const_(2, 1),
          bin("Mul", 0, 1, 2),
          call("g", [2], 3),
          ret(3),
        ]),
      ], 0, 4),
    ]);
    const after = tco(before);
    const expected = program([
      func("f", [0], [
        block(0, [
          const_(2, 1),
          bin("Mul", 0, 1, 2),
          tailCall("g", [2]),
        ]),
      ], 0, 4),
    ]);
    expectProg(after, expected);
  });

  it("13. handles args with multiple registers", () => {
    const before = program([
      func("f", [0, 1], [
        block(0, [call("g", [0, 1], 2), ret(2)]),
      ], 0, 3),
    ]);
    const after = tco(before);
    const expected = program([
      func("f", [0, 1], [block(0, [tailCall("g", [0, 1])])], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("14. handles TailCall when Return src is 0 (the call's dest is also 0)", () => {
    const before = program([
      func("f", [], [block(0, [call("g", [], 0), ret(0)])], 0, 1),
    ]);
    const after = tco(before);
    const expected = program([
      func("f", [], [block(0, [tailCall("g", [])])], 0, 1),
    ]);
    expectProg(after, expected);
  });

  it("15. doesn't convert CallBuiltin+Return (only Call triggers TCO)", () => {
    const before = program([
      func("f", [], [
        block(0, [
          const_(42, 0),
          callBuiltin_alias("len", [0], 1),
          ret(1),
        ]),
      ], 0, 2),
    ] as any);
    expectUnchanged(before, tco);
  });

  it("16. handles Call immediately followed by Br (no Return — no TCO)", () => {
    const before = program([
      func("f", [0], [
        block(0, [call("g", [0], 1), br(1, 1, 2)]),
        block(1, [ret(1)]),
        block(2, [ret(0)]),
      ], 0, 2),
    ]);
    expectUnchanged(before, tco);
  });

  it("17. preserves any preceding instructions when converting", () => {
    const before = program([
      func("f", [0], [
        block(0, [
          const_(0, 1),
          const_(1, 2),
          bin("Lt", 0, 2, 3),  // not tail
          call("g", [3], 4),
          ret(4),
        ]),
      ], 0, 5),
    ]);
    const after = tco(before);
    const expected = program([
      func("f", [0], [
        block(0, [
          const_(0, 1),
          const_(1, 2),
          bin("Lt", 0, 2, 3),
          tailCall("g", [3]),
        ]),
      ], 0, 5),
    ]);
    expectProg(after, expected);
  });

  it("18. multiple tail calls in different blocks (each converted)", () => {
    const before = program([
      func("f", [0], [
        block(0, [br(0, 1, 2)]),
        block(1, [call("g", [], 1), ret(1)]),
        block(2, [call("h", [], 2), ret(2)]),
        block(3, [call("i", [], 3), ret(3)]),  // unreachable, but still converted
      ], 0, 4),
    ]);
    const after = tco(before);
    const expected = program([
      func("f", [0], [
        block(0, [br(0, 1, 2)]),
        block(1, [tailCall("g", [])]),
        block(2, [tailCall("h", [])]),
        block(3, [tailCall("i", [])]),
      ], 0, 4),
    ]);
    expectProg(after, expected);
  });

  it("19. doesn't convert Call with no Return at all", () => {
    const before = program([
      func("f", [], [
        block(0, [call("g", [], 0), br(null, 0, null)]),  // infinite loop
      ], 0, 1),
    ]);
    expectUnchanged(before, tco);
  });

  it("20. converts even if dest register matches a parameter", () => {
    const before = program([
      func("f", [0], [block(0, [call("g", [], 0), ret(0)])], 0, 1),
    ]);
    const after = tco(before);
    const expected = program([
      func("f", [0], [block(0, [tailCall("g", [])])], 0, 1),
    ]);
    expectProg(after, expected);
  });

  it("21. idempotent on already-converted TailCall", () => {
    const before = program([
      func("f", [], [block(0, [tailCall("g", [])])], 0, 0),
    ]);
    expectUnchanged(before, tco);
  });

  it("22. tail call to a function with a different name preserves fn field", () => {
    const before = program([
      func("f", [], [block(0, [call("uniq_name", [], 0), ret(0)])], 0, 1),
    ]);
    const after = tco(before);
    const f = after.funcs[0];
    const tc = f.blocks[0].instrs[0] as { op: string; fn: string };
    expect(tc.op).toBe("TailCall");
    expect(tc.fn).toBe("uniq_name");
  });

  it("23. converts in a function that has multiple blocks (tail at non-entry)", () => {
    const before = program([
      func("f", [0], [
        block(0, [const_(0, 1), bin("Lt", 0, 1, 2), br(2, 1, 2)]),
        block(1, [ret(0)]),
        block(2, [call("g", [0], 3), ret(3)]),
      ], 0, 4),
    ]);
    const after = tco(before);
    const expected = program([
      func("f", [0], [
        block(0, [const_(0, 1), bin("Lt", 0, 1, 2), br(2, 1, 2)]),
        block(1, [ret(0)]),
        block(2, [call("g", [0], 3), tailCall("g", [0])]),
        // wait — we replaced [Call, Return] with [TailCall], so block 2 has
        // just [TailCall(g, [0])].
      ], 0, 4),
    ]);
    // Correct expected: block 2 has only TailCall(g, [0]).
    const expected2 = program([
      func("f", [0], [
        block(0, [const_(0, 1), bin("Lt", 0, 1, 2), br(2, 1, 2)]),
        block(1, [ret(0)]),
        block(2, [tailCall("g", [0])]),
      ], 0, 4),
    ]);
    expectProg(after, expected2);
  });

  it("24. handles self tail recursion with multiple parameters", () => {
    const before = program([
      func("rec", [0, 1], [
        block(0, [
          const_(0, 2),
          bin("Eq", 0, 2, 3),
          br(3, 1, 2),
        ]),
        block(1, [ret(1)]),
        block(2, [
          const_(1, 4),
          bin("Sub", 0, 4, 5),
          bin("Mul", 0, 1, 6),
          call("rec", [5, 6], 7),
          ret(7),
        ]),
      ], 0, 8),
    ]);
    const after = tco(before);
    const expected = program([
      func("rec", [0, 1], [
        block(0, [const_(0, 2), bin("Eq", 0, 2, 3), br(3, 1, 2)]),
        block(1, [ret(1)]),
        block(2, [
          const_(1, 4),
          bin("Sub", 0, 4, 5),
          bin("Mul", 0, 1, 6),
          tailCall("rec", [5, 6]),
        ]),
      ], 0, 8),
    ]);
    expectProg(after, expected);
  });

  it("25. TailCall args preserve order", () => {
    const before = program([
      func("f", [0, 1, 2], [
        block(0, [call("g", [2, 1, 0], 3), ret(3)]),  // args reversed
      ], 0, 4),
    ]);
    const after = tco(before);
    const expected = program([
      func("f", [0, 1, 2], [block(0, [tailCall("g", [2, 1, 0])])], 0, 4),
    ]);
    expectProg(after, expected);
  });

  it("26. handles an empty block (no instructions)", () => {
    const before = program([
      func("f", [], [block(0, [])], 0, 0),
    ]);
    expectUnchanged(before, tco);
  });
});

// Local helper alias for tests that want a CallBuiltin (avoids importing the
// real one just to verify TCO doesn't touch CallBuiltin).
function callBuiltin_alias(name: string, args: number[], dest: number) {
  return { op: "CallBuiltin" as const, fn: name, args, dest };
}
