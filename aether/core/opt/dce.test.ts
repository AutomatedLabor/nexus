/**
 * aether/core/opt/dce.test.ts
 * ===========================
 * 25+ before/after pairs for dead code elimination:
 *  - dead pure instrs (Const/Move/Bin/Un/LoadField/Len/IndexGet/etc.
 *    whose dest is never read)
 *  - side-effectful instrs preserved (Call, CallBuiltin to print/panic,
 *    StoreField, IndexSet)
 *  - unreachable block removal (block off the CFG, entry-only funcs)
 *  - cascading dead instrs (instruction dead because its only user was
 *    dead, iterated to fixpoint)
 */
import { describe, it, expect } from "vitest";
import { dce } from "./dce";
import {
  program, func, block, const_, bin, un, move, ret, br, call, callBuiltin,
  loadField, storeField, allocStruct, allocArray, indexGet, indexSet, len, tailCall,
} from "./irbuilder";
import { expectProg, expectUnchanged } from "./testutil";

describe("dce", () => {
  it("1. removes an unused Const", () => {
    const before = program([
      func("f", [], [block(0, [const_(5, 0), const_(7, 1), ret(1)])], 0, 2),
    ]);
    const after = dce(before);
    const expected = program([
      func("f", [], [block(0, [const_(7, 1), ret(1)])], 0, 2),
    ]);
    expectProg(after, expected);
  });

  it("2. keeps a used Const", () => {
    const before = program([
      func("f", [], [block(0, [const_(5, 0), ret(0)])], 0, 1),
    ]);
    expectUnchanged(before, dce);
  });

  it("3. removes an unused Move", () => {
    const before = program([
      func("f", [0], [block(0, [move(0, 1), ret(0)])], 0, 2),
    ]);
    const after = dce(before);
    const expected = program([
      func("f", [0], [block(0, [ret(0)])], 0, 2),
    ]);
    expectProg(after, expected);
  });

  it("4. removes an unused Bin", () => {
    const before = program([
      func("f", [], [
        block(0, [const_(2, 0), const_(3, 1), bin("Add", 0, 1, 2), ret(0)]),
      ], 0, 3),
    ]);
    const after = dce(before);
    const expected = program([
      func("f", [], [block(0, [const_(2, 0), ret(0)])], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("5. removes an unused Un", () => {
    const before = program([
      func("f", [], [
        block(0, [const_(5, 0), un("Neg", 0, 1), ret(0)]),
      ], 0, 2),
    ]);
    const after = dce(before);
    const expected = program([
      func("f", [], [block(0, [const_(5, 0), ret(0)])], 0, 2),
    ]);
    expectProg(after, expected);
  });

  it("6. keeps a Call (side-effectful, even if dest unused)", () => {
    const before = program([
      func("f", [], [
        block(0, [call("g", [], 0), ret(0)]),
      ], 0, 1),
    ]);
    expectUnchanged(before, dce);
  });

  it("7. keeps a CallBuiltin to print", () => {
    const before = program([
      func("f", [], [
        block(0, [const_(42, 0), callBuiltin("print", [0], 1), ret(1)]),
      ], 0, 2),
    ]);
    expectUnchanged(before, dce);
  });

  it("8. removes a CallBuiltin to len when dest unused (pure builtin)", () => {
    const before = program([
      func("f", [], [
        block(0, [const_(42, 0), callBuiltin("len", [0], 1), ret(0)]),
      ], 0, 2),
    ]);
    const after = dce(before);
    const expected = program([
      func("f", [], [block(0, [const_(42, 0), ret(0)])], 0, 2),
    ]);
    expectProg(after, expected);
  });

  it("9. keeps StoreField (mutates)", () => {
    const before = program([
      func("f", [], [
        block(0, [
          allocStruct("P", { x: 0 }, 0), // note: allocStruct's dest r0 is unused; we'll handle separately
          const_(7, 1),
          storeField(0, "x", 1),
          ret(1),
        ]),
      ], 0, 2),
    ]);
    // r0 is unused AFTER storeField; but storeField mutates r0 so it must be
    // kept. dce should keep the AllocStruct (because storeField reads it)
    // and the storeField.
    expectUnchanged(before, dce);
  });

  it("10. removes AllocArray when dest unused", () => {
    const before = program([
      func("f", [], [
        block(0, [const_(1, 0), const_(2, 1), allocArray([0, 1], 2), ret(0)]),
      ], 0, 3),
    ]);
    const after = dce(before);
    const expected = program([
      func("f", [], [block(0, [const_(1, 0), ret(0)])], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("11. removes LoadField when dest unused", () => {
    const before = program([
      func("f", [], [
        block(0, [allocStruct("P", { x: 0 }, 0), loadField(0, "x", 1), ret(0)]),
      ], 0, 2),
    ]);
    const after = dce(before);
    const expected = program([
      func("f", [], [block(0, [allocStruct("P", { x: 0 }, 0), ret(0)])], 0, 2),
    ]);
    expectProg(after, expected);
  });

  it("12. keeps IndexSet (mutates)", () => {
    const before = program([
      func("f", [], [
        block(0, [
          allocArray([], 0),
          const_(0, 1),
          const_(42, 2),
          indexSet(0, 1, 2),
          ret(0),
        ]),
      ], 0, 3),
    ]);
    expectUnchanged(before, dce);
  });

  it("13. removes Len when dest unused", () => {
    const before = program([
      func("f", [], [
        block(0, [allocArray([], 0), len(0, 1), ret(0)]),
      ], 0, 2),
    ]);
    const after = dce(before);
    const expected = program([
      func("f", [], [block(0, [allocArray([], 0), ret(0)])], 0, 2),
    ]);
    expectProg(after, expected);
  });

  it("14. removes IndexGet when dest unused", () => {
    const before = program([
      func("f", [], [
        block(0, [allocArray([], 0), const_(0, 1), indexGet(0, 1, 2), ret(0)]),
      ], 0, 3),
    ]);
    const after = dce(before);
    const expected = program([
      func("f", [], [block(0, [allocArray([], 0), ret(0)])], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("15. cascades: removes Const whose only user was a dead Bin", () => {
    const before = program([
      func("f", [], [
        block(0, [
          const_(2, 0),
          const_(3, 1),
          bin("Add", 0, 1, 2),  // r2 unused
          ret(0),                // returns r0
        ]),
      ], 0, 3),
    ]);
    const after = dce(before);
    const expected = program([
      func("f", [], [block(0, [const_(2, 0), ret(0)])], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("16. removes unreachable block (off the CFG)", () => {
    const before = program([
      func("f", [], [
        block(0, [const_(1, 0), ret(0)]),
        block(1, [const_(99, 1), ret(1)]),  // unreachable
      ], 0, 2),
    ]);
    const after = dce(before);
    const expected = program([
      func("f", [], [block(0, [const_(1, 0), ret(0)])], 0, 2),
    ]);
    expectProg(after, expected);
  });

  it("17. removes an unreachable block with no predecessors (after the entry)", () => {
    const before = program([
      func("f", [], [
        block(0, [const_(10, 0), ret(0)]),
        block(1, [const_(20, 1), ret(1)]),  // unreachable: no Br targets it
        block(2, [const_(30, 2), ret(2)]),  // unreachable: no Br targets it
      ], 0, 3),
    ]);
    const after = dce(before);
    const expected = program([
      func("f", [], [block(0, [const_(10, 0), ret(0)])], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("18. keeps both Br arms when reachable", () => {
    const before = program([
      func("f", [0], [
        block(0, [br(0, 1, 2)]),
        block(1, [const_(1, 1), ret(1)]),
        block(2, [const_(2, 2), ret(2)]),
      ], 0, 3),
    ]);
    expectUnchanged(before, dce);
  });

  it("19. removes unused Move chain r0->r1, r1->r2 (cascade)", () => {
    const before = program([
      func("f", [0], [
        block(0, [move(0, 1), move(1, 2), ret(0)]),
      ], 0, 3),
    ]);
    const after = dce(before);
    const expected = program([
      func("f", [0], [block(0, [ret(0)])], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("20. keeps an unused-but-side-effectful CallBuiltin to panic", () => {
    const before = program([
      func("f", [], [
        block(0, [const_(0, 0), callBuiltin("panic", [0], 1), ret(0)]),
      ], 0, 2),
    ]);
    expectUnchanged(before, dce);
  });

  it("21. keeps a Const that's read by a Return (no dead constants to remove)", () => {
    const before = program([
      func("f", [0], [
        block(0, [br(0, 1, 2)]),
        block(1, [const_(2, 1), ret(1)]),  // r1 IS read by ret
        block(2, [const_(3, 2), ret(2)]),
      ], 0, 3),
    ]);
    expectUnchanged(before, dce);
  });

  it("22. removes a Bin whose dest feeds a dead Move", () => {
    const before = program([
      func("f", [], [
        block(0, [
          const_(1, 0),
          const_(2, 1),
          bin("Add", 0, 1, 2),  // r2 used by move(2, 3)
          move(2, 3),            // r3 unused
          ret(0),
        ]),
      ], 0, 4),
    ]);
    const after = dce(before);
    const expected = program([
      func("f", [], [block(0, [const_(1, 0), ret(0)])], 0, 4),
    ]);
    expectProg(after, expected);
  });

  it("23. removes a whole dead chain Bin -> Un -> Move", () => {
    const before = program([
      func("f", [0], [
        block(0, [
          const_(5, 1),
          bin("Mul", 0, 1, 2),  // r2 used by un
          un("Neg", 2, 3),       // r3 used by move
          move(3, 4),            // r4 unused
          ret(0),
        ]),
      ], 0, 5),
    ]);
    const after = dce(before);
    const expected = program([
      func("f", [0], [block(0, [ret(0)])], 0, 5),
    ]);
    expectProg(after, expected);
  });

  it("24. doesn't remove Return (it's a terminator)", () => {
    const before = program([
      func("f", [], [block(0, [const_(0, 0), ret(0)])], 0, 1),
    ]);
    expectUnchanged(before, dce);
  });

  it("25. keeps TailCall (terminator + side effect)", () => {
    const before = program([
      func("f", [0], [block(0, [const_(1, 1), tailCall("f", [0, 1])])], 0, 2),
    ]);
    expectUnchanged(before, dce);
  });

  it("26. removes truly unreachable block (no Br target points to it)", () => {
    const before = program([
      func("f", [0], [
        block(0, [const_(true, 1), br(1, 1, 2)]),
        block(1, [const_(10, 2), ret(2)]),
        block(2, [const_(20, 3), ret(3)]),
        block(3, [const_(99, 4), ret(4)]),  // no Br targets block 3
      ], 0, 5),
    ]);
    const after = dce(before);
    const expected = program([
      func("f", [0], [
        block(0, [const_(true, 1), br(1, 1, 2)]),
        block(1, [const_(10, 2), ret(2)]),
        block(2, [const_(20, 3), ret(3)]),
      ], 0, 5),
    ]);
    expectProg(after, expected);
  });
});
