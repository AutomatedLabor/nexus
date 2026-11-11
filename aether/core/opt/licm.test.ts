/**
 * aether/core/opt/licm.test.ts
 * ===========================
 * 25+ before/after pairs for loop-invariant code motion.
 *
 * Test scaffolding uses a canonical "loop" shape:
 *
 *   block 0 (entry):
 *     ...outside-loop instrs...
 *     Br(null, header)
 *   block header (loop header):
 *     ...invariant + loop-variant instrs...
 *     Br(cond, header, exit)        <-- back-edge to `header`
 *   block exit:
 *     ...
 *
 * The back-edge (block > header) is detected as `target.id < current.id`.
 * Invariants are hoisted to a fresh preheader block (max_id+1) that
 * branches to the header; non-loop predecessors of the header are
 * redirected to the preheader.
 */
import { describe, it, expect } from "vitest";
import { licm } from "./licm";
import {
  program, func, block, const_, bin, un, move, ret, br, call,
  loadField, len, allocStruct, allocArray,
} from "./irbuilder";
import { expectProg, expectUnchanged } from "./testutil";

// Helper: build a simple loop with a body containing `bodyInstrs`.
function buildLoop(body: any[], headerId = 1, exitId = 2, condReg = 0, nlocals = 1) {
  return func("f", [], [
    block(0, [br(null, headerId, null)]),
    block(headerId, [...body, br(condReg, headerId, exitId)]),
    block(exitId, [ret(0)]),
  ], 0, nlocals);
}

describe("licm", () => {
  it("1. hoists a Const out of a single-block loop", () => {
    const before = program([
      func("f", [], [
        block(0, [br(null, 1, null)]),
        block(1, [const_(100, 1), br(0, 1, 2)]),  // r1 = Const(100) is invariant
        block(2, [ret(0)]),
      ], 0, 2),
    ]);
    const after = licm(before);
    const expected = program([
      func("f", [], [
        block(0, [br(null, 3, null)]),  // redirected to preheader (id=3)
        // preheader (new block 3)
        block(3, [const_(100, 1), br(null, 1, null)]),
        block(1, [br(0, 1, 2)]),  // Const(100, r1) hoisted out
        block(2, [ret(0)]),
      ], 0, 2),
    ]);
    expectProg(after, expected);
  });

  it("2. hoists a Bin that uses only outer-scope registers", () => {
    const before = program([
      func("f", [], [
        block(0, [const_(2, 0), const_(3, 1), br(null, 1, null)]),  // r0, r1 outside
        block(1, [bin("Add", 0, 1, 2), br(0, 1, 2)]),  // Bin uses only r0, r1
        block(2, [ret(0)]),
      ], 0, 3),
    ]);
    const after = licm(before);
    const expected = program([
      func("f", [], [
        block(0, [const_(2, 0), const_(3, 1), br(null, 3, null)]),
        block(3, [bin("Add", 0, 1, 2), br(null, 1, null)]),
        block(1, [br(0, 1, 2)]),
        block(2, [ret(0)]),
      ], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("3. doesn't hoist a Bin that uses a loop-defined register", () => {
    const before = program([
      func("f", [], [
        block(0, [const_(2, 0), br(null, 1, null)]),
        block(1, [
          const_(3, 1),  // r1 defined inside loop
          bin("Add", 0, 1, 2),  // uses r1 (loop-defined) — not invariant
          br(0, 1, 2),
        ]),
        block(2, [ret(0)]),
      ], 0, 3),
    ]);
    expectUnchanged(before, licm);
  });

  it("4. doesn't hoist a Call (side-effectful)", () => {
    const before = program([
      func("f", [], [
        block(0, [br(null, 1, null)]),
        block(1, [call("g", [], 0), br(0, 1, 2)]),
        block(2, [ret(0)]),
      ], 0, 1),
    ]);
    expectUnchanged(before, licm);
  });

  it("5. hoists multiple invariants", () => {
    const before = program([
      func("f", [], [
        block(0, [const_(1, 0), const_(2, 1), br(null, 1, null)]),
        block(1, [
          const_(10, 2),    // invariant
          const_(20, 3),    // invariant
          bin("Add", 0, 1, 4),  // invariant (uses only r0, r1)
          br(0, 1, 2),
        ]),
        block(2, [ret(0)]),
      ], 0, 5),
    ]);
    const after = licm(before);
    const expected = program([
      func("f", [], [
        block(0, [const_(1, 0), const_(2, 1), br(null, 3, null)]),
        block(3, [
          const_(10, 2),
          const_(20, 3),
          bin("Add", 0, 1, 4),
          br(null, 1, null),
        ]),
        block(1, [br(0, 1, 2)]),
        block(2, [ret(0)]),
      ], 0, 5),
    ]);
    expectProg(after, expected);
  });

  it("6. transitive invariant: B depends on A, both hoisted in order", () => {
    const before = program([
      func("f", [], [
        block(0, [const_(2, 0), br(null, 1, null)]),
        block(1, [
          const_(3, 1),     // A: invariant (no sources)
          bin("Mul", 0, 1, 2),  // B: invariant (sources r0 outside, r1 = A's dest)
          br(0, 1, 2),
        ]),
        block(2, [ret(0)]),
      ], 0, 3),
    ]);
    const after = licm(before);
    // A (Const(3, r1)) hoisted first, then B (Bin(Mul, r0, r1, r2)) hoisted.
    // Order in preheader: Const(3, r1), Bin(Mul, r0, r1, r2).
    const expected = program([
      func("f", [], [
        block(0, [const_(2, 0), br(null, 3, null)]),
        block(3, [const_(3, 1), bin("Mul", 0, 1, 2), br(null, 1, null)]),
        block(1, [br(0, 1, 2)]),
        block(2, [ret(0)]),
      ], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("7. doesn't hoist from a non-loop (no back-edges)", () => {
    const before = program([
      func("f", [], [
        block(0, [const_(1, 0), br(null, 1, null)]),
        block(1, [const_(2, 1), br(null, 2, null)]),
        block(2, [const_(3, 2), ret(0)]),
      ], 0, 3),
    ]);
    expectUnchanged(before, licm);
  });

  it("8. back-edge block keeps targeting header (not redirected to preheader)", () => {
    const before = program([
      func("f", [], [
        block(0, [br(null, 1, null)]),
        block(1, [const_(1, 1), br(0, 1, 2)]),  // back-edge to block 1
        block(2, [ret(0)]),
      ], 0, 2),
    ]);
    const after = licm(before);
    const expected = program([
      func("f", [], [
        block(0, [br(null, 3, null)]),
        block(3, [const_(1, 1), br(null, 1, null)]),
        block(1, [br(0, 1, 2)]),  // back-edge target still 1 (header)
        block(2, [ret(0)]),
      ], 0, 2),
    ]);
    expectProg(after, expected);
  });

  it("9. hoist when the loop has multiple blocks in the body", () => {
    const before = program([
      func("f", [], [
        block(0, [const_(2, 0), br(null, 1, null)]),
        block(1, [const_(5, 1), br(null, 2, null)]),  // r1 invariant (no loop deps)
        block(2, [bin("Add", 0, 1, 2), br(0, 1, 3)]),  // back-edge to block 1
        block(3, [ret(0)]),
      ], 0, 3),
    ]);
    const after = licm(before);
    // Body = {1, 2}. Invariants: Const(5, r1) and Bin(Add, r0, r1, r2) (both
    // sources outside or hoisted). Preheader gets both, in order.
    const expected = program([
      func("f", [], [
        block(0, [const_(2, 0), br(null, 4, null)]),
        block(4, [const_(5, 1), bin("Add", 0, 1, 2), br(null, 1, null)]),
        block(1, [br(null, 2, null)]),
        block(2, [br(0, 1, 3)]),
        block(3, [ret(0)]),
      ], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("10. nested loop: outer preheader hoists outer-invariants first", () => {
    const before = program([
      func("f", [], [
        block(0, [const_(2, 0), br(null, 1, null)]),
        block(1, [const_(10, 1), br(null, 2, null)]),  // outer-loop body
        block(2, [const_(20, 2), br(0, 2, 3)]),       // inner loop (back-edge to 2)
        block(3, [br(0, 1, 4)]),                       // outer back-edge to 1
        block(4, [ret(0)]),
      ], 0, 3),
    ]);
    const after = licm(before);
    // Outer loop: header=1, body={1,2,3}. Invariants: Const(10, r1), Const(20, r2).
    // Inner loop: header=2, body={2}. Invariant: Const(20, r2).
    // Both preheaders get created. We process headers in ascending id order:
    //   header=1 (outer) first → preheader P1 (id 5): hoist r1, r2; Br to 1.
    //   header=2 (inner) next → preheader P2 (id 6): hoist r2; Br to 2.
    //   But wait: after outer hoisting, r1 and r2 are no longer in the body.
    //   Inner loop's body={2} no longer has any invariants — so no inner preheader.
    // Result: just one preheader for outer, hoisting both r1 and r2.
    const expected = program([
      func("f", [], [
        block(0, [const_(2, 0), br(null, 5, null)]),
        block(5, [const_(10, 1), const_(20, 2), br(null, 1, null)]),
        block(1, [br(null, 2, null)]),
        block(2, [br(0, 2, 3)]),
        block(3, [br(0, 1, 4)]),
        block(4, [ret(0)]),
      ], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("11. loop body has a conditional Br — both successors stay in body", () => {
    const before = program([
      func("f", [], [
        block(0, [const_(2, 0), const_(true, 1), br(null, 1, null)]),
        block(1, [const_(3, 2), br(1, 2, 1)]),  // inner split
        block(2, [bin("Add", 0, 2, 3), br(0, 1, 3)]),  // back-edge to 1
        block(3, [ret(0)]),
      ], 0, 4),
    ]);
    const after = licm(before);
    // Body = {1, 2}. Invariants: Const(3, r2), Bin(Add, r0, r2, r3) (r2 is hoisted).
    const expected = program([
      func("f", [], [
        block(0, [const_(2, 0), const_(true, 1), br(null, 4, null)]),
        block(4, [const_(3, 2), bin("Add", 0, 2, 3), br(null, 1, null)]),
        block(1, [br(1, 2, 1)]),
        block(2, [br(0, 1, 3)]),
        block(3, [ret(0)]),
      ], 0, 4),
    ]);
    expectProg(after, expected);
  });

  it("12. function with no loops is unchanged", () => {
    const before = program([
      func("f", [], [
        block(0, [const_(1, 0), br(null, 1, null)]),
        block(1, [const_(2, 1), ret(1)]),
      ], 0, 2),
    ]);
    expectUnchanged(before, licm);
  });

  it("13. loop body with no invariants is unchanged (no preheader created)", () => {
    const before = program([
      func("f", [0], [
        block(0, [bin("Add", 0, 0, 0), br(0, 0, 1)]),  // self-loop; r0 is the param, modified in loop
        block(1, [ret(0)]),
      ], 0, 1),
    ]);
    // r0 is the function param, but it's modified inside the loop (Bin's dest is r0).
    // The Bin is not invariant because its dest is loop-defined AND
    // we don't consider its dest (the check is on sources only). Wait — actually
    // the Bin's source is r0, which is defined in the loop (the Bin's own dest).
    // So it's not invariant. Good.
    expectUnchanged(before, licm);
  });

  it("14. hoist a LoadField (pure) when the object is defined outside the loop", () => {
    const before = program([
      func("f", [], [
        block(0, [allocStruct("P", { x: 0 }, 0), br(null, 1, null)]),
        block(1, [loadField(0, "x", 1), br(0, 1, 2)]),
        block(2, [ret(0)]),
      ], 0, 2),
    ]);
    const after = licm(before);
    const expected = program([
      func("f", [], [
        block(0, [allocStruct("P", { x: 0 }, 0), br(null, 3, null)]),
        block(3, [loadField(0, "x", 1), br(null, 1, null)]),
        block(1, [br(0, 1, 2)]),
        block(2, [ret(0)]),
      ], 0, 2),
    ]);
    expectProg(after, expected);
  });

  it("15. hoist a Len (pure) when the array is defined outside the loop", () => {
    const before = program([
      func("f", [], [
        block(0, [allocArray([0, 0], 0), br(null, 1, null)]),
        block(1, [len(0, 1), br(0, 1, 2)]),
        block(2, [ret(0)]),
      ], 0, 2),
    ]);
    const after = licm(before);
    const expected = program([
      func("f", [], [
        block(0, [allocArray([0, 0], 0), br(null, 3, null)]),
        block(3, [len(0, 1), br(null, 1, null)]),
        block(1, [br(0, 1, 2)]),
        block(2, [ret(0)]),
      ], 0, 2),
    ]);
    expectProg(after, expected);
  });

  it("16. doesn't hoist a StoreField (side effect)", () => {
    const before = program([
      func("f", [], [
        block(0, [allocStruct("P", { x: 0 }, 0), const_(7, 1), br(null, 1, null)]),
        block(1, [
          // storeField(0, "x", 1) — side effect, not hoistable.
          (require("./irbuilder") as any).storeField(0, "x", 1),
          br(0, 1, 2),
        ]),
        block(2, [ret(0)]),
      ], 0, 2),
    ]);
    expectUnchanged(before, licm);
  });

  it("17. doesn't hoist a Move whose src is loop-defined", () => {
    const before = program([
      func("f", [0], [
        block(0, [br(null, 1, null)]),
        block(1, [bin("Add", 0, 0, 1), move(1, 2), br(0, 1, 2)]),  // r1 is loop-defined
        block(2, [ret(0)]),
      ], 0, 3),
    ]);
    expectUnchanged(before, licm);
  });

  it("18. function with multiple loops at the same level (different headers)", () => {
    const before = program([
      func("f", [], [
        block(0, [const_(1, 0), br(null, 1, null)]),
        block(1, [const_(2, 1), br(0, 1, 2)]),  // loop 1: header 1, body {1}
        block(2, [const_(3, 2), br(null, 3, null)]),
        block(3, [const_(4, 3), br(0, 3, 4)]),  // loop 2: header 3, body {3}
        block(4, [ret(0)]),
      ], 0, 4),
    ]);
    const after = licm(before);
    // Two preheaders created: 5 (for loop 1) and 6 (for loop 2).
    // block 0 → block 5 (preheader 1), block 5 → block 1
    // block 2 → block 6 (preheader 2), block 6 → block 3
    const expected = program([
      func("f", [], [
        block(0, [const_(1, 0), br(null, 5, null)]),
        block(5, [const_(2, 1), br(null, 1, null)]),
        block(1, [br(0, 1, 2)]),
        block(2, [const_(3, 2), br(null, 6, null)]),
        block(6, [const_(4, 3), br(null, 3, null)]),
        block(3, [br(0, 3, 4)]),
        block(4, [ret(0)]),
      ], 0, 4),
    ]);
    expectProg(after, expected);
  });

  it("19. function with a Phi in the loop (treated conservatively)", () => {
    // Phi is pure and dest-bearing, so it's hoistable if its incomings are
    // all outside the loop. Here incomings reference block 0 (outside) and
    // block 2 (inside the loop) — not invariant.
    const before = program([
      func("f", [], [
        block(0, [const_(0, 0), br(null, 1, null)]),
        block(1, [phi([{ from: 0, src: 0 }, { from: 2, src: 1 }], 1), br(0, 1, 2)]),
        block(2, [const_(1, 2), br(0, 1, 3)]),
        block(3, [ret(0)]),
      ], 0, 3),
    ]);
    // phi's src `r1` is loop-defined. Not invariant.
    expectUnchanged(before, licm);
  });

  it("20. invariant inside an inner loop block (not the header)", () => {
    const before = program([
      func("f", [], [
        block(0, [const_(2, 0), br(null, 1, null)]),
        block(1, [br(null, 2, null)]),
        block(2, [const_(3, 1), br(0, 2, 3)]),  // inner loop header 2, body {2}
        block(3, [ret(0)]),
      ], 0, 2),
    ]);
    const after = licm(before);
    // Inner loop body = {2}. Invariant: Const(3, r1). Preheader created for inner.
    const expected = program([
      func("f", [], [
        block(0, [const_(2, 0), br(null, 1, null)]),
        block(1, [br(null, 4, null)]),
        block(4, [const_(3, 1), br(null, 2, null)]),
        block(2, [br(0, 2, 3)]),
        block(3, [ret(0)]),
      ], 0, 2),
    ]);
    expectProg(after, expected);
  });

  it("21. loop entry from a non-entry block (entry is header)", () => {
    const before = program([
      func("f", [0], [
        block(0, [const_(5, 1), br(0, 0, 1)]),  // entry IS the header
        block(1, [ret(0)]),
      ], 0, 2),
    ]);
    const after = licm(before);
    // The function entry IS the header. After LICM, we redirect the entry
    // to the preheader (per our code's `func.entry = preId` branch).
    const expected = program([
      func("f", [0], [
        block(3, [const_(5, 1), br(null, 0, null)]),  // preheader
        block(0, [br(0, 0, 1)]),  // back-edge still targets 0 (header)
        block(1, [ret(0)]),
      ], 0, 2),
    ]);
    // Update: entry is now 3.
    expected.funcs[0].entry = 3;
    expectProg(after, expected);
  });

  it("22. invariant in a multi-block loop with a Mix of pure/impure instrs", () => {
    const before = program([
      func("f", [], [
        block(0, [const_(2, 0), const_(3, 1), br(null, 1, null)]),
        block(1, [bin("Add", 0, 1, 2), call("h", [2], 3), br(0, 1, 2)]),
        block(2, [ret(0)]),
      ], 0, 4),
    ]);
    const after = licm(before);
    // Bin(Add, r0, r1, r2) is invariant; Call("h", [r2], r3) is not (side effect).
    const expected = program([
      func("f", [], [
        block(0, [const_(2, 0), const_(3, 1), br(null, 3, null)]),
        block(3, [bin("Add", 0, 1, 2), br(null, 1, null)]),
        block(1, [call("h", [2], 3), br(0, 1, 2)]),
        block(2, [ret(0)]),
      ], 0, 4),
    ]);
    expectProg(after, expected);
  });

  it("23. loop with multiple back-edges to the same header", () => {
    const before = program([
      func("f", [0], [
        block(0, [br(0, 1, 1)]),  // entry -> header
        block(1, [const_(10, 1), br(0, 2, 3)]),  // header, has Const invariant
        block(2, [br(0, 1, 4)]),  // back-edge to 1
        block(3, [br(0, 1, 4)]),  // back-edge to 1
        block(4, [ret(0)]),
      ], 0, 2),
    ]);
    const after = licm(before);
    // Both block 2 and block 3 are back-edges to header 1. Body = {1, 2, 3}.
    // Invariant: Const(10, r1). Preheader created once (id 5).
    // Non-loop preds of header 1: just block 0 (entry). Block 0's Br(0, 1, 1) redirected to Br(0, 5, 5).
    const expected = program([
      func("f", [0], [
        block(0, [br(0, 5, 5)]),
        block(5, [const_(10, 1), br(null, 1, null)]),
        block(1, [br(0, 2, 3)]),
        block(2, [br(0, 1, 4)]),
        block(3, [br(0, 1, 4)]),
        block(4, [ret(0)]),
      ], 0, 2),
    ]);
    expectProg(after, expected);
  });

  it("24. hoist invariant IndexGet", () => {
    const before = program([
      func("f", [], [
        block(0, [allocArray([0, 0, 0], 0), const_(0, 1), br(null, 1, null)]),
        block(1, [indexGet(0, 1, 2), br(0, 1, 2)]),  // src=0 (outer), idx=1 (outer) — invariant
        block(2, [ret(0)]),
      ], 0, 3),
    ]);
    const after = licm(before);
    const expected = program([
      func("f", [], [
        block(0, [allocArray([0, 0, 0], 0), const_(0, 1), br(null, 3, null)]),
        block(3, [indexGet(0, 1, 2), br(null, 1, null)]),
        block(1, [br(0, 1, 2)]),
        block(2, [ret(0)]),
      ], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("25. doesn't hoist IndexGet whose idx is loop-defined", () => {
    const before = program([
      func("f", [], [
        block(0, [allocArray([0, 0, 0], 0), br(null, 1, null)]),
        block(1, [const_(0, 1), indexGet(0, 1, 2), br(0, 1, 2)]),  // r1 is loop-defined
        block(2, [ret(0)]),
      ], 0, 3),
    ]);
    expectUnchanged(before, licm);
  });

  it("26. invariant AllocArray", () => {
    const before = program([
      func("f", [], [
        block(0, [const_(1, 0), const_(2, 1), br(null, 1, null)]),
        block(1, [allocArray([0, 1], 2), br(0, 1, 2)]),
        block(2, [ret(0)]),
      ], 0, 3),
    ]);
    const after = licm(before);
    const expected = program([
      func("f", [], [
        block(0, [const_(1, 0), const_(2, 1), br(null, 3, null)]),
        block(3, [allocArray([0, 1], 2), br(null, 1, null)]),
        block(1, [br(0, 1, 2)]),
        block(2, [ret(0)]),
      ], 0, 3),
    ]);
    expectProg(after, expected);
  });
});

// Local helper to access phi from irbuilder without listing it in every test.
function phi(incomings: Array<{ from: number; src: number }>, dest: number): any {
  return { op: "Phi" as const, incomings, dest };
}
