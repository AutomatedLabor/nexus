/**
 * aether/core/opt/cse.test.ts
 * ===========================
 * 25+ before/after pairs for common-subexpression elimination (block-local).
 *
 * The pass:
 *  - rewrites duplicate `Bin` to a `Move` (same op kind, same operands)
 *  - normalizes operand order for commutative ops
 *  - also folds `Un`, `LoadField`, `Len`, `IndexGet`, `AllocArray` dups
 *  - leaves non-CSE-able ops alone (Call, AllocStruct, etc.)
 */
import { describe, it, expect } from "vitest";
import { cse } from "./cse";
import {
  program, func, block, const_, bin, un, move, ret, br, call,
  loadField, allocStruct, allocArray, indexGet, len,
} from "./irbuilder";
import { expectProg, expectUnchanged } from "./testutil";

describe("cse", () => {
  it("1. dedups Add(0,1) -> Move(r2, r3)", () => {
    const before = program([
      func("f", [], [
        block(0, [
          const_(2, 0),
          const_(3, 1),
          bin("Add", 0, 1, 2),
          bin("Add", 0, 1, 3),  // dup of the previous
          ret(3),
        ]),
      ], 0, 4),
    ]);
    const after = cse(before);
    const expected = program([
      func("f", [], [
        block(0, [
          const_(2, 0),
          const_(3, 1),
          bin("Add", 0, 1, 2),
          move(2, 3),
          ret(3),
        ]),
      ], 0, 4),
    ]);
    expectProg(after, expected);
  });

  it("2. doesn't dedup when operands differ", () => {
    const before = program([
      func("f", [], [
        block(0, [
          const_(2, 0), const_(3, 1), const_(4, 2),
          bin("Add", 0, 1, 3),
          bin("Add", 0, 2, 4),  // different operand
          ret(4),
        ]),
      ], 0, 5),
    ]);
    expectUnchanged(before, cse);
  });

  it("3. dedups across non-CSE-able instrs in same block", () => {
    const before = program([
      func("f", [], [
        block(0, [
          const_(2, 0), const_(3, 1),
          bin("Add", 0, 1, 2),
          const_(99, 3),  // an intervening Const doesn't clear the seen table
          bin("Add", 0, 1, 4),
          ret(4),
        ]),
      ], 0, 5),
    ]);
    const after = cse(before);
    const expected = program([
      func("f", [], [
        block(0, [
          const_(2, 0), const_(3, 1),
          bin("Add", 0, 1, 2),
          const_(99, 3),
          move(2, 4),
          ret(4),
        ]),
      ], 0, 5),
    ]);
    expectProg(after, expected);
  });

  it("4. dedups Mul (commutative) regardless of operand order", () => {
    const before = program([
      func("f", [], [
        block(0, [
          const_(2, 0), const_(3, 1),
          bin("Mul", 0, 1, 2),
          bin("Mul", 1, 0, 3),  // operands swapped; commutative => dup
          ret(3),
        ]),
      ], 0, 4),
    ]);
    const after = cse(before);
    const expected = program([
      func("f", [], [
        block(0, [
          const_(2, 0), const_(3, 1),
          bin("Mul", 0, 1, 2),
          move(2, 3),
          ret(3),
        ]),
      ], 0, 4),
    ]);
    expectProg(after, expected);
  });

  it("5. doesn't dedup Sub (non-commutative) when operands swapped", () => {
    const before = program([
      func("f", [], [
        block(0, [
          const_(10, 0), const_(3, 1),
          bin("Sub", 0, 1, 2),
          bin("Sub", 1, 0, 3),  // different op (10-3 vs 3-10)
          ret(3),
        ]),
      ], 0, 4),
    ]);
    expectUnchanged(before, cse);
  });

  it("6. dedups Eq (commutative)", () => {
    const before = program([
      func("f", [], [
        block(0, [
          const_(2, 0), const_(3, 1),
          bin("Eq", 0, 1, 2),
          bin("Eq", 1, 0, 3),
          ret(3),
        ]),
      ], 0, 4),
    ]);
    const after = cse(before);
    const expected = program([
      func("f", [], [
        block(0, [
          const_(2, 0), const_(3, 1),
          bin("Eq", 0, 1, 2),
          move(2, 3),
          ret(3),
        ]),
      ], 0, 4),
    ]);
    expectProg(after, expected);
  });

  it("7. dedups BitAnd (commutative)", () => {
    const before = program([
      func("f", [], [
        block(0, [
          const_(6, 0), const_(3, 1),
          bin("BitAnd", 0, 1, 2),
          bin("BitAnd", 1, 0, 3),
          ret(3),
        ]),
      ], 0, 4),
    ]);
    const after = cse(before);
    const expected = program([
      func("f", [], [
        block(0, [
          const_(6, 0), const_(3, 1),
          bin("BitAnd", 0, 1, 2),
          move(2, 3),
          ret(3),
        ]),
      ], 0, 4),
    ]);
    expectProg(after, expected);
  });

  it("8. dedups BitOr (commutative)", () => {
    const before = program([
      func("f", [], [
        block(0, [
          const_(1, 0), const_(2, 1),
          bin("BitOr", 0, 1, 2),
          bin("BitOr", 0, 1, 3),
          ret(3),
        ]),
      ], 0, 4),
    ]);
    const after = cse(before);
    const expected = program([
      func("f", [], [
        block(0, [
          const_(1, 0), const_(2, 1),
          bin("BitOr", 0, 1, 2),
          move(2, 3),
          ret(3),
        ]),
      ], 0, 4),
    ]);
    expectProg(after, expected);
  });

  it("9. dedups BitXor (commutative)", () => {
    const before = program([
      func("f", [], [
        block(0, [
          const_(5, 0), const_(3, 1),
          bin("BitXor", 0, 1, 2),
          bin("BitXor", 1, 0, 3),
          ret(3),
        ]),
      ], 0, 4),
    ]);
    const after = cse(before);
    const expected = program([
      func("f", [], [
        block(0, [
          const_(5, 0), const_(3, 1),
          bin("BitXor", 0, 1, 2),
          move(2, 3),
          ret(3),
        ]),
      ], 0, 4),
    ]);
    expectProg(after, expected);
  });

  it("10. dedups And (commutative boolean)", () => {
    const before = program([
      func("f", [], [
        block(0, [
          const_(true, 0), const_(false, 1),
          bin("And", 0, 1, 2),
          bin("And", 1, 0, 3),
          ret(3),
        ]),
      ], 0, 4),
    ]);
    const after = cse(before);
    const expected = program([
      func("f", [], [
        block(0, [
          const_(true, 0), const_(false, 1),
          bin("And", 0, 1, 2),
          move(2, 3),
          ret(3),
        ]),
      ], 0, 4),
    ]);
    expectProg(after, expected);
  });

  it("11. dedups Or (commutative boolean)", () => {
    const before = program([
      func("f", [], [
        block(0, [
          const_(true, 0), const_(false, 1),
          bin("Or", 0, 1, 2),
          bin("Or", 1, 0, 3),
          ret(3),
        ]),
      ], 0, 4),
    ]);
    const after = cse(before);
    const expected = program([
      func("f", [], [
        block(0, [
          const_(true, 0), const_(false, 1),
          bin("Or", 0, 1, 2),
          move(2, 3),
          ret(3),
        ]),
      ], 0, 4),
    ]);
    expectProg(after, expected);
  });

  it("12. doesn't dedup Shl (non-commutative) when operands swapped", () => {
    const before = program([
      func("f", [], [
        block(0, [
          const_(1, 0), const_(3, 1),
          bin("Shl", 0, 1, 2),
          bin("Shl", 1, 0, 3),
          ret(3),
        ]),
      ], 0, 4),
    ]);
    expectUnchanged(before, cse);
  });

  it("13. dedups Un (same op, same src)", () => {
    const before = program([
      func("f", [], [
        block(0, [
          const_(5, 0),
          un("Neg", 0, 1),
          un("Neg", 0, 2),
          ret(2),
        ]),
      ], 0, 3),
    ]);
    const after = cse(before);
    const expected = program([
      func("f", [], [
        block(0, [
          const_(5, 0),
          un("Neg", 0, 1),
          move(1, 2),
          ret(2),
        ]),
      ], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("14. doesn't dedup Un with different op", () => {
    const before = program([
      func("f", [], [
        block(0, [
          const_(5, 0),
          un("Neg", 0, 1),
          un("BitNot", 0, 2),
          ret(2),
        ]),
      ], 0, 3),
    ]);
    expectUnchanged(before, cse);
  });

  it("15. dedups LoadField (same obj, same field)", () => {
    const before = program([
      func("f", [], [
        block(0, [
          allocStruct("P", { x: 0 }, 0),
          loadField(0, "x", 1),
          loadField(0, "x", 2),
          ret(2),
        ]),
      ], 0, 3),
    ]);
    const after = cse(before);
    const expected = program([
      func("f", [], [
        block(0, [
          allocStruct("P", { x: 0 }, 0),
          loadField(0, "x", 1),
          move(1, 2),
          ret(2),
        ]),
      ], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("16. doesn't dedup LoadField with different field", () => {
    const before = program([
      func("f", [], [
        block(0, [
          allocStruct("P", { x: 0, y: 1 }, 0),
          loadField(0, "x", 2),
          loadField(0, "y", 3),
          ret(3),
        ]),
      ], 0, 4),
    ]);
    expectUnchanged(before, cse);
  });

  it("17. dedups Len (same src)", () => {
    const before = program([
      func("f", [], [
        block(0, [
          allocArray([0, 0], 0),
          len(0, 1),
          len(0, 2),
          ret(2),
        ]),
      ], 0, 3),
    ]);
    const after = cse(before);
    const expected = program([
      func("f", [], [
        block(0, [
          allocArray([0, 0], 0),
          len(0, 1),
          move(1, 2),
          ret(2),
        ]),
      ], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("18. dedups IndexGet (same src, same idx)", () => {
    const before = program([
      func("f", [], [
        block(0, [
          allocArray([0, 0], 0),
          const_(0, 1),
          indexGet(0, 1, 2),
          indexGet(0, 1, 3),
          ret(3),
        ]),
      ], 0, 4),
    ]);
    const after = cse(before);
    const expected = program([
      func("f", [], [
        block(0, [
          allocArray([0, 0], 0),
          const_(0, 1),
          indexGet(0, 1, 2),
          move(2, 3),
          ret(3),
        ]),
      ], 0, 4),
    ]);
    expectProg(after, expected);
  });

  it("19. doesn't dedup IndexGet with different idx", () => {
    const before = program([
      func("f", [], [
        block(0, [
          allocArray([0, 0], 0),
          const_(0, 1), const_(1, 2),
          indexGet(0, 1, 3),
          indexGet(0, 2, 4),
          ret(4),
        ]),
      ], 0, 5),
    ]);
    expectUnchanged(before, cse);
  });

  it("20. dedups AllocArray (same args) — fresh alloc removed", () => {
    const before = program([
      func("f", [], [
        block(0, [
          const_(1, 0), const_(2, 1),
          allocArray([0, 1], 2),
          allocArray([0, 1], 3),
          ret(3),
        ]),
      ], 0, 4),
    ]);
    const after = cse(before);
    const expected = program([
      func("f", [], [
        block(0, [
          const_(1, 0), const_(2, 1),
          allocArray([0, 1], 2),
          move(2, 3),
          ret(3),
        ]),
      ], 0, 4),
    ]);
    expectProg(after, expected);
  });

  it("21. doesn't dedup Call (side-effectful)", () => {
    const before = program([
      func("f", [], [
        block(0, [
          const_(1, 0),
          call("g", [0], 1),
          call("g", [0], 2),
          ret(2),
        ]),
      ], 0, 3),
    ]);
    expectUnchanged(before, cse);
  });

  it("22. doesn't dedup AllocStruct (must produce fresh object)", () => {
    const before = program([
      func("f", [], [
        block(0, [
          const_(0, 0), const_(0, 1),
          allocStruct("P", { x: 0, y: 1 }, 2),
          allocStruct("P", { x: 0, y: 1 }, 3),
          ret(3),
        ]),
      ], 0, 4),
    ]);
    expectUnchanged(before, cse);
  });

  it("23. CSE is block-local — duplicates in different blocks aren't dedup'd", () => {
    const before = program([
      func("f", [0], [
        block(0, [
          const_(2, 1), const_(3, 2),
          bin("Add", 1, 2, 3),
          br(0, 1, 1),
        ]),
        block(1, [
          bin("Add", 1, 2, 4),  // not dedup'd — block-local only
          ret(4),
        ]),
      ], 0, 5),
    ]);
    expectUnchanged(before, cse);
  });

  it("24. dedups three identical Adds in the same block", () => {
    const before = program([
      func("f", [], [
        block(0, [
          const_(2, 0), const_(3, 1),
          bin("Add", 0, 1, 2),
          bin("Add", 0, 1, 3),
          bin("Add", 0, 1, 4),
          ret(4),
        ]),
      ], 0, 5),
    ]);
    const after = cse(before);
    const expected = program([
      func("f", [], [
        block(0, [
          const_(2, 0), const_(3, 1),
          bin("Add", 0, 1, 2),
          move(2, 3),
          move(2, 4),
          ret(4),
        ]),
      ], 0, 5),
    ]);
    expectProg(after, expected);
  });

  it("25. dedups when first operand is the same register", () => {
    const before = program([
      func("f", [], [
        block(0, [
          const_(5, 0), const_(1, 1), const_(2, 2),
          bin("Add", 0, 1, 3),
          bin("Add", 0, 2, 4),  // different operands
          ret(4),
        ]),
      ], 0, 5),
    ]);
    expectUnchanged(before, cse);
  });

  it("26. doesn't dedup Div (non-commutative) when swapped", () => {
    const before = program([
      func("f", [], [
        block(0, [
          const_(10, 0), const_(2, 1),
          bin("Div", 0, 1, 2),
          bin("Div", 1, 0, 3),
          ret(3),
        ]),
      ], 0, 4),
    ]);
    expectUnchanged(before, cse);
  });
});
