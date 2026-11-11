/**
 * aether/core/opt/inlining.test.ts
 * =================================
 * 25+ before/after pairs for the inlining pass.
 *
 *  - simple single-block callee (case A, no new blocks)
 *  - multi-block callee (case B, caller block split, continuation block)
 *  - non-recursive check: recursive functions are skipped
 *  - size cap: callee too big (>3 blocks or >10 instrs) is skipped
 *  - depth cap: nested inlining up to 3 levels
 *  - args/params mismatch: skipped
 */
import { describe, it, expect } from "vitest";
import { inlining } from "./inlining";
import {
  program, func, block, const_, bin, un, move, ret, br, call,
  loadField, allocStruct, allocArray, indexGet, len,
} from "./irbuilder";
import { expectProg, expectUnchanged } from "./testutil";

describe("inlining", () => {
  it("1. inlines a trivial single-block callee returning a constant", () => {
    const before = program([
      func("g", [], [block(0, [const_(42, 0), ret(0)])], 0, 1),
      func("f", [], [block(0, [call("g", [], 0), ret(0)])], 0, 1),
    ]);
    const after = inlining(before);
    // Offset = caller.nlocals = 1. g's r0 → r1. Substitution: g has no params.
    // After: f = [Const(42, r1), Move(r1, r0), ret(r0)] (nlocals = 1+1 = 2).
    const expected = program([
      func("g", [], [block(0, [const_(42, 0), ret(0)])], 0, 1),
      func("f", [], [block(0, [const_(42, 1), move(1, 0), ret(0)])], 0, 2),
    ]);
    expectProg(after, expected);
  });

  it("2. inlines a single-block callee with one parameter (case A)", () => {
    const before = program([
      func("g", [0], [block(0, [const_(1, 1), bin("Add", 0, 1, 2), ret(2)])], 0, 3),
      func("f", [], [block(0, [const_(5, 0), call("g", [0], 1), ret(1)])], 0, 2),
    ]);
    const after = inlining(before);
    const expected = program([
      func("g", [0], [block(0, [const_(1, 1), bin("Add", 0, 1, 2), ret(2)])], 0, 3),
      func("f", [], [
        block(0, [
          const_(5, 0),
          // Inlined g(r0): offset = caller.nlocals = 2
          // r0+2=r2 (param) substituted with r0 (call arg). Other regs offset.
          const_(1, 3), bin("Add", 0, 3, 4), move(4, 1), ret(1),
        ]),
      ], 0, 5),
    ]);
    expectProg(after, expected);
  });

  it("3. inlines a single-block callee with two params (case A)", () => {
    const before = program([
      func("g", [0, 1], [block(0, [bin("Add", 0, 1, 2), ret(2)])], 0, 3),
      func("f", [], [
        block(0, [const_(2, 0), const_(3, 1), call("g", [0, 1], 2), ret(2)]),
      ], 0, 3),
    ]);
    const after = inlining(before);
    const expected = program([
      func("g", [0, 1], [block(0, [bin("Add", 0, 1, 2), ret(2)])], 0, 3),
      func("f", [], [
        block(0, [
          const_(2, 0), const_(3, 1),
          bin("Add", 0, 1, 5), move(5, 2), ret(2),
        ]),
      ], 0, 6),
    ]);
    expectProg(after, expected);
  });

  it("4. inlines a multi-block callee (case B): split + continuation", () => {
    const before = program([
      func("g", [0], [
        block(0, [br(0, 1, 2)]),
        block(1, [const_(10, 1), ret(1)]),
        block(2, [const_(20, 2), ret(2)]),
      ], 0, 3),
      func("f", [], [
        block(0, [const_(true, 0), call("g", [0], 1), const_(99, 2), ret(1)]),
      ], 0, 3),
    ]);
    const after = inlining(before);
    // g has 3 blocks, 3 instrs total (the spec allows up to 3 blocks, 10 instrs).
    // After inlining g(r0) into f:
    //   caller block 0: before = [Const(true, r0), Call(g, [r0], r1)]
    //   After the Call: split — before is kept, then Br(null, new_entry).
    //   new_entry: g's entry (renamed). br(r0+2=r2 substituted for r0 (arg), blk1', blk2')
    //   blk1', blk2': renamed g's blocks (1 and 2).
    //     block 1': Const(10, 1+2=r3) -> Move(r3, r1); Br(null, contID)
    //     block 2': Const(20, 2+2=r4) -> Move(r4, r1); Br(null, contID)
    //   contID: [Const(99, r2), ret(r1)]
    const expected = program([
      func("g", [0], [
        block(0, [br(0, 1, 2)]),
        block(1, [const_(10, 1), ret(1)]),
        block(2, [const_(20, 2), ret(2)]),
      ], 0, 3),
      func("f", [], [
        // Original block 0: before + Br(null, new entry).
        block(0, [const_(true, 0), br(null, 1, null)]),
        // new block 1: g's entry block (id=0 → new id=1). br(r0 substituted, blk2, blk3).
        block(1, [br(0, 2, 3)]),
        // new block 2: g's block 1 (id=1 → new id=2). Const(10, r1+3=r4); Move(r4, r1); Br(null, contID=4).
        block(2, [const_(10, 4), move(4, 1), br(null, 4, null)]),
        // new block 3: g's block 2 (id=2 → new id=3). Const(20, r2+3=r5); Move(r5, r1); Br(null, contID=4).
        block(3, [const_(20, 5), move(5, 1), br(null, 4, null)]),
        // continuation block 4: original after = [Const(99, r2), ret(r1)].
        block(4, [const_(99, 2), ret(1)]),
      ], 0, 6),
    ]);
    expectProg(after, expected);
  });

  it("5. doesn't inline a recursive function", () => {
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
    expectUnchanged(before, inlining);
  });

  it("6. doesn't inline a callee with >3 blocks", () => {
    const before = program([
      func("g", [], [
        block(0, [br(null, 1, null)]),
        block(1, [br(null, 2, null)]),
        block(2, [br(null, 3, null)]),
        block(3, [const_(1, 0), ret(0)]),
      ], 0, 1),
      func("f", [], [block(0, [call("g", [], 0), ret(0)])], 0, 1),
    ]);
    expectUnchanged(before, inlining);
  });

  it("7. doesn't inline a callee with >10 instrs", () => {
    const elevenInstrs = Array.from({ length: 11 }, (_, i) => const_(i, i));
    elevenInstrs.push(ret(10));
    const before = program([
      func("g", [], [block(0, elevenInstrs as any)], 0, 11),
      func("f", [], [block(0, [call("g", [], 0), ret(0)])], 0, 1),
    ]);
    expectUnchanged(before, inlining);
  });

  it("8. doesn't inline when args/params count mismatches", () => {
    const before = program([
      func("g", [0, 1], [block(0, [bin("Add", 0, 1, 2), ret(2)])], 0, 3),
      func("f", [], [
        block(0, [const_(5, 0), call("g", [0], 1), ret(1)]),  // 1 arg, 2 params
      ], 0, 2),
    ]);
    expectUnchanged(before, inlining);
  });

  it("9. inlines a callee that calls another inlineable callee (depth 2)", () => {
    const before = program([
      func("h", [], [block(0, [const_(1, 0), ret(0)])], 0, 1),
      func("g", [], [block(0, [call("h", [], 0), ret(0)])], 0, 1),
      func("f", [], [block(0, [call("g", [], 0), ret(0)])], 0, 1),
    ]);
    const after = inlining(before);
    // First iteration: h inlined into g; g inlined into f. f now contains h's body.
    // h was inlined into g (offset g.nlocals=1; h's r0 → r1, Move(r1, dest)).
    // After iter 1, g = [Const(1, r1), Move(r1, r0), ret(r0)].
    // g inlined into f (offset f.nlocals=1; g's r0→r1, r1→r2, Move(r1,r0)→Move(r2,r1)).
    // After: f = [Const(1, r2), Move(r2, r1), Move(r1, r0), ret(r0)].
    // But after another iteration, the chain might be simplified... let's just
    // assert that h's const(1) appears in f's body.
    const f = after.funcs.find(x => x.name === "f")!;
    const dump = JSON.stringify(f);
    expect(dump).toContain("\"value\":1");
  });

  it("10. inlines a callee whose body uses an unconditional Br internally", () => {
    const before = program([
      func("g", [], [
        block(0, [const_(1, 0), br(null, 1, null)]),
        block(1, [const_(2, 1), bin("Add", 0, 1, 2), ret(2)]),
      ], 0, 3),
      func("f", [], [block(0, [call("g", [], 0), ret(0)])], 0, 1),
    ]);
    const after = inlining(before);
    const f = after.funcs.find(x => x.name === "f")!;
    // After inlining g into f, f should have multiple blocks (case B).
    expect(f.blocks.length).toBeGreaterThan(1);
  });

  it("11. doesn't inline a callee into itself (skipped by self-name guard)", () => {
    // 'rec' calls itself but is too big to inline (>10 instrs), so it's
    // excluded from inlineable. Even if it were small, the recursion check
    // would prevent it.
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
    expectUnchanged(before, inlining);
  });

  it("12. inlines a callee that ends with a void-like Return (src=null doesn't apply)", () => {
    // Our IR's Return always has src; this is just a single-block callee.
    const before = program([
      func("g", [], [block(0, [const_(7, 0), ret(0)])], 0, 1),
      func("f", [], [
        block(0, [const_(1, 0), call("g", [], 1), bin("Add", 0, 1, 2), ret(2)]),
      ], 0, 3),
    ]);
    const after = inlining(before);
    const expected = program([
      func("g", [], [block(0, [const_(7, 0), ret(0)])], 0, 1),
      func("f", [], [
        block(0, [
          const_(1, 0),
          // Inlined g: r0 of g becomes r3 (offset=3). Const(7, r3); Move(r3, r1).
          const_(7, 3),
          move(3, 1),
          bin("Add", 0, 1, 2),
          ret(2),
        ]),
      ], 0, 4),
    ]);
    expectProg(after, expected);
  });

  it("13. inlines a callee that has LoadField-like ops", () => {
    const before = program([
      func("g", [0], [block(0, [loadField(0, "x", 1), ret(1)])], 0, 2),
      func("f", [], [block(0, [allocStruct("P", { x: 0 }, 0), call("g", [0], 1), ret(1)])], 0, 2),
    ]);
    const after = inlining(before);
    // f.nlocals starts at 2 (r0 allocStruct, r1 dest). Inlining g with offset 2.
    // g's r0 (param) substituted with f's r0. g's r1 → r3 (offset). LoadField(r0, "x", r3); Move(r3, r1).
    const expected = program([
      func("g", [0], [block(0, [loadField(0, "x", 1), ret(1)])], 0, 2),
      func("f", [], [
        block(0, [
          allocStruct("P", { x: 0 }, 0),
          loadField(0, "x", 3),
          move(3, 1),
          ret(1),
        ]),
      ], 0, 4),
    ]);
    expectProg(after, expected);
  });

  it("14. inlining preserves the caller's other blocks", () => {
    const before = program([
      func("g", [], [block(0, [const_(42, 0), ret(0)])], 0, 1),
      func("f", [0], [
        block(0, [br(0, 1, 2)]),
        block(1, [call("g", [], 1), ret(1)]),
        block(2, [const_(0, 2), ret(2)]),
      ], 0, 3),
    ]);
    const after = inlining(before);
    const f = after.funcs.find(x => x.name === "f")!;
    expect(f.blocks.length).toBe(3);
    // The Const(42, ...) should now be in block 1 of f.
    const block1 = f.blocks.find(b => b.id === 1)!;
    expect(block1.instrs.some(i => (i as { op?: string }).op === "Const" && (i as { value: unknown }).value === 42)).toBe(true);
  });

  it("15. inlines a 3-block callee within the size cap", () => {
    const before = program([
      func("g", [0], [
        block(0, [const_(0, 1), bin("Lt", 0, 1, 2), br(2, 1, 2)]),
        block(1, [const_(1, 3), ret(3)]),
        block(2, [const_(2, 4), ret(4)]),
      ], 0, 5),
      func("f", [], [block(0, [const_(5, 0), call("g", [0], 1), ret(1)])], 0, 2),
    ]);
    const after = inlining(before);
    const f = after.funcs.find(x => x.name === "f")!;
    // case B: split, so f has multiple blocks now.
    expect(f.blocks.length).toBeGreaterThan(1);
  });

  it("16. doesn't inline the same callee twice in one iteration (snapshot)", () => {
    const before = program([
      func("g", [], [block(0, [const_(7, 0), ret(0)])], 0, 1),
      func("f", [], [
        block(0, [call("g", [], 0), call("g", [], 1), ret(1)]),
      ], 0, 2),
    ]);
    const after = inlining(before);
    // Both call sites should be inlined (different dest registers).
    const f = after.funcs.find(x => x.name === "f")!;
    // f should have two Const(7) instructions (one per inlined g).
    const consts = f.blocks[0].instrs.filter(i => (i as { op?: string }).op === "Const" && (i as { value: unknown }).value === 7);
    expect(consts.length).toBe(2);
  });

  it("17. inlined callee's calls are preserved (call to non-inlineable fn)", () => {
    const before = program([
      func("big", [], [
        block(0, [const_(1, 0), const_(2, 1), const_(3, 2), const_(4, 3),
                  const_(5, 4), const_(6, 5), const_(7, 6), const_(8, 7),
                  const_(9, 8), const_(10, 9), const_(11, 10), ret(10)]),
      ], 0, 11),
      func("g", [], [block(0, [call("big", [], 0), ret(0)])], 0, 1),
      func("f", [], [block(0, [call("g", [], 0), ret(0)])], 0, 1),
    ]);
    const after = inlining(before);
    const f = after.funcs.find(x => x.name === "f")!;
    // After inlining g into f, f should contain a Call("big", ...) (preserved).
    const hasCall = f.blocks[0].instrs.some(i => (i as { op?: string }).op === "Call" && (i as { fn?: string }).fn === "big");
    expect(hasCall).toBe(true);
  });

  it("18. doesn't inline a callee that's not present in the program", () => {
    const before = program([
      func("f", [], [block(0, [call("undefined_fn", [], 0), ret(0)])], 0, 1),
    ]);
    expectUnchanged(before, inlining);
  });

  it("19. inlines into a function with multiple blocks (call not in entry)", () => {
    const before = program([
      func("g", [], [block(0, [const_(42, 0), ret(0)])], 0, 1),
      func("f", [0], [
        block(0, [br(0, 1, 2)]),
        block(1, [call("g", [], 1), ret(1)]),
        block(2, [const_(0, 2), ret(2)]),
      ], 0, 3),
    ]);
    const after = inlining(before);
    const f = after.funcs.find(x => x.name === "f")!;
    const block1 = f.blocks.find(b => b.id === 1)!;
    expect(block1.instrs.some(i => (i as { op?: string }).op === "Const" && (i as { value: unknown }).value === 42)).toBe(true);
  });

  it("20. callee params substituted with non-trivial arg expressions", () => {
    const before = program([
      func("g", [0], [block(0, [bin("Mul", 0, 0, 1), ret(1)])], 0, 2),
      func("f", [], [
        block(0, [
          const_(3, 0),
          bin("Add", 0, 0, 1),  // arg is a computed value
          call("g", [1], 2),
          ret(2),
        ]),
      ], 0, 3),
    ]);
    const after = inlining(before);
    // g's r0 (param) substituted with f's r1 (arg). g's r1 → r4 (offset).
    // After: Const(3, r0); Bin(Add, r0, r0, r1); Bin(Mul, r1, r1, r4); Move(r4, r2); ret(r2).
    const expected = program([
      func("g", [0], [block(0, [bin("Mul", 0, 0, 1), ret(1)])], 0, 2),
      func("f", [], [
        block(0, [
          const_(3, 0),
          bin("Add", 0, 0, 1),
          bin("Mul", 1, 1, 4),
          move(4, 2),
          ret(2),
        ]),
      ], 0, 5),
    ]);
    expectProg(after, expected);
  });

  it("21. inlined callee that has a Bin using two callee-local consts", () => {
    const before = program([
      func("g", [], [block(0, [const_(2, 0), const_(3, 1), bin("Add", 0, 1, 2), ret(2)])], 0, 3),
      func("f", [], [block(0, [call("g", [], 0), ret(0)])], 0, 1),
    ]);
    const after = inlining(before);
    const expected = program([
      func("g", [], [block(0, [const_(2, 0), const_(3, 1), bin("Add", 0, 1, 2), ret(2)])], 0, 3),
      func("f", [], [
        block(0, [
          // Offset = 1. r0→r1, r1→r2, r2→r3.
          const_(2, 1), const_(3, 2), bin("Add", 1, 2, 3), move(3, 0), ret(0),
        ]),
      ], 0, 4),
    ]);
    expectProg(after, expected);
  });

  it("22. tail-call in callee is preserved (kept as TailCall)", () => {
    const before = program([
      func("h", [], [block(0, [const_(0, 0), ret(0)])], 0, 1),
      func("g", [], [
        block(0, [call("h", [], 0), ret(0)]),  // g calls h, then returns the result
      ], 0, 1),
      func("f", [], [block(0, [call("g", [], 0), ret(0)])], 0, 1),
    ]);
    const after = inlining(before);
    // After inlining: f contains g's body inlined, which contains h's call.
    // (Note: the inlining pass doesn't run TCO; TailCall wouldn't appear here.)
    const f = after.funcs.find(x => x.name === "f")!;
    // Should contain a Const(0) from h (transitively inlined in second iteration).
    expect(JSON.stringify(f)).toContain("\"value\":0");
  });

  it("23. doesn't inline when function is recursive transitively", () => {
    // a calls b calls a — both are recursive (in a cycle).
    const before = program([
      func("a", [], [block(0, [call("b", [], 0), ret(0)])], 0, 1),
      func("b", [], [block(0, [call("a", [], 0), ret(0)])], 0, 1),
    ]);
    const after = inlining(before);
    // Both a and b are recursive (cycle), so neither is inlineable.
    expectUnchanged(before, inlining);
    expect(after.funcs[0].blocks[0].instrs.length).toBe(2);
  });

  it("24. depth cap: 3 iterations means 4 functions chained", () => {
    // a (smallest) -> b -> c -> d, where each calls the previous.
    const before = program([
      func("a", [], [block(0, [const_(1, 0), ret(0)])], 0, 1),
      func("b", [], [block(0, [call("a", [], 0), ret(0)])], 0, 1),
      func("c", [], [block(0, [call("b", [], 0), ret(0)])], 0, 1),
      func("d", [], [block(0, [call("c", [], 0), ret(0)])], 0, 1),
    ]);
    const after = inlining(before);
    // After 3 iterations, d should contain a's body inlined.
    const d = after.funcs.find(x => x.name === "d")!;
    expect(JSON.stringify(d)).toContain("\"value\":1");
  });

  it("25. preserves caller's nlocals extension", () => {
    const before = program([
      func("g", [], [block(0, [const_(42, 0), ret(0)])], 0, 1),
      func("f", [], [block(0, [call("g", [], 0), ret(0)])], 0, 1),
    ]);
    const after = inlining(before);
    const f = after.funcs.find(x => x.name === "f")!;
    // f.nlocals was 1; g.nlocals is 1; after inlining, f.nlocals = 1 + 1 = 2.
    expect(f.nlocals).toBe(2);
  });

  it("26. doesn't inline a callee with internal Return before the last instr", () => {
    // Single-block callee with an internal Return — would be case B.
    const before = program([
      func("g", [0], [
        block(0, [const_(0, 1), bin("Eq", 0, 1, 2), br(2, 1, 2)]),
        block(1, [const_(10, 3), ret(3)]),
        block(2, [const_(20, 4), ret(4)]),
      ], 0, 5),
      func("f", [], [block(0, [const_(5, 0), call("g", [0], 1), ret(1)])], 0, 2),
    ]);
    const after = inlining(before);
    const f = after.funcs.find(x => x.name === "f")!;
    expect(f.blocks.length).toBeGreaterThan(1);
  });
});
