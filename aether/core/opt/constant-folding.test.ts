/**
 * aether/core/opt/constant-folding.test.ts
 * ========================================
 * 25 before/after pairs exercising every binary and unary operator and a
 * few cascades that prove the pass iterates to fixpoint.
 */
import { describe, it, expect } from "vitest";
import { constantFolding } from "./constant-folding";
import {
  program, func, block, const_, bin, un, ret, move, br, call,
} from "./irbuilder";
import { expectProg, expectUnchanged } from "./testutil";

describe("constant-folding", () => {
  it("1. folds Add(2,3) -> 5", () => {
    const before = program([
      func("f", [], [block(0, [const_(2, 0), const_(3, 1), bin("Add", 0, 1, 2), ret(2)])], 0, 3),
    ]);
    const after = constantFolding(before);
    const expected = program([
      func("f", [], [block(0, [const_(2, 0), const_(3, 1), const_(5, 2), ret(2)])], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("2. folds Sub(10,4) -> 6", () => {
    const before = program([
      func("f", [], [block(0, [const_(10, 0), const_(4, 1), bin("Sub", 0, 1, 2), ret(2)])], 0, 3),
    ]);
    const after = constantFolding(before);
    const expected = program([
      func("f", [], [block(0, [const_(10, 0), const_(4, 1), const_(6, 2), ret(2)])], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("3. folds Mul(3,4) -> 12", () => {
    const before = program([
      func("f", [], [block(0, [const_(3, 0), const_(4, 1), bin("Mul", 0, 1, 2), ret(2)])], 0, 3),
    ]);
    const after = constantFolding(before);
    const expected = program([
      func("f", [], [block(0, [const_(3, 0), const_(4, 1), const_(12, 2), ret(2)])], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("4. folds Div(7,2) -> 3.5 (float)", () => {
    const before = program([
      func("f", [], [block(0, [const_(7, 0), const_(2, 1), bin("Div", 0, 1, 2), ret(2)])], 0, 3),
    ]);
    const after = constantFolding(before);
    const expected = program([
      func("f", [], [block(0, [const_(7, 0), const_(2, 1), const_(3.5, 2), ret(2)])], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("5. folds Div by zero — leaves the Bin intact (avoid hiding runtime error)", () => {
    const before = program([
      func("f", [], [block(0, [const_(1, 0), const_(0, 1), bin("Div", 0, 1, 2), ret(2)])], 0, 3),
    ]);
    expectUnchanged(before, constantFolding);
  });

  it("6. folds Mod(7,3) -> 1", () => {
    const before = program([
      func("f", [], [block(0, [const_(7, 0), const_(3, 1), bin("Mod", 0, 1, 2), ret(2)])], 0, 3),
    ]);
    const after = constantFolding(before);
    const expected = program([
      func("f", [], [block(0, [const_(7, 0), const_(3, 1), const_(1, 2), ret(2)])], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("7. folds Mod(-7,3) -> 2 (Python positive-mod semantics)", () => {
    const before = program([
      func("f", [], [block(0, [const_(-7, 0), const_(3, 1), bin("Mod", 0, 1, 2), ret(2)])], 0, 3),
    ]);
    const after = constantFolding(before);
    const expected = program([
      func("f", [], [block(0, [const_(-7, 0), const_(3, 1), const_(2, 2), ret(2)])], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("8. folds Eq(2,2) -> true", () => {
    const before = program([
      func("f", [], [block(0, [const_(2, 0), const_(2, 1), bin("Eq", 0, 1, 2), ret(2)])], 0, 3),
    ]);
    const after = constantFolding(before);
    const expected = program([
      func("f", [], [block(0, [const_(2, 0), const_(2, 1), const_(true, 2), ret(2)])], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("9. folds Neq(2,3) -> true", () => {
    const before = program([
      func("f", [], [block(0, [const_(2, 0), const_(3, 1), bin("Neq", 0, 1, 2), ret(2)])], 0, 3),
    ]);
    const after = constantFolding(before);
    const expected = program([
      func("f", [], [block(0, [const_(2, 0), const_(3, 1), const_(true, 2), ret(2)])], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("10. folds Lt(2,3) -> true", () => {
    const before = program([
      func("f", [], [block(0, [const_(2, 0), const_(3, 1), bin("Lt", 0, 1, 2), ret(2)])], 0, 3),
    ]);
    const after = constantFolding(before);
    const expected = program([
      func("f", [], [block(0, [const_(2, 0), const_(3, 1), const_(true, 2), ret(2)])], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("11. folds Le(3,3) -> true", () => {
    const before = program([
      func("f", [], [block(0, [const_(3, 0), const_(3, 1), bin("Le", 0, 1, 2), ret(2)])], 0, 3),
    ]);
    const after = constantFolding(before);
    const expected = program([
      func("f", [], [block(0, [const_(3, 0), const_(3, 1), const_(true, 2), ret(2)])], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("12. folds Gt(5,2) -> true", () => {
    const before = program([
      func("f", [], [block(0, [const_(5, 0), const_(2, 1), bin("Gt", 0, 1, 2), ret(2)])], 0, 3),
    ]);
    const after = constantFolding(before);
    const expected = program([
      func("f", [], [block(0, [const_(5, 0), const_(2, 1), const_(true, 2), ret(2)])], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("13. folds Ge(4,4) -> true", () => {
    const before = program([
      func("f", [], [block(0, [const_(4, 0), const_(4, 1), bin("Ge", 0, 1, 2), ret(2)])], 0, 3),
    ]);
    const after = constantFolding(before);
    const expected = program([
      func("f", [], [block(0, [const_(4, 0), const_(4, 1), const_(true, 2), ret(2)])], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("14. folds And(true,false) -> false", () => {
    const before = program([
      func("f", [], [block(0, [const_(true, 0), const_(false, 1), bin("And", 0, 1, 2), ret(2)])], 0, 3),
    ]);
    const after = constantFolding(before);
    const expected = program([
      func("f", [], [block(0, [const_(true, 0), const_(false, 1), const_(false, 2), ret(2)])], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("15. folds Or(false,true) -> true", () => {
    const before = program([
      func("f", [], [block(0, [const_(false, 0), const_(true, 1), bin("Or", 0, 1, 2), ret(2)])], 0, 3),
    ]);
    const after = constantFolding(before);
    const expected = program([
      func("f", [], [block(0, [const_(false, 0), const_(true, 1), const_(true, 2), ret(2)])], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("16. folds BitAnd(6,3) -> 2", () => {
    const before = program([
      func("f", [], [block(0, [const_(6, 0), const_(3, 1), bin("BitAnd", 0, 1, 2), ret(2)])], 0, 3),
    ]);
    const after = constantFolding(before);
    const expected = program([
      func("f", [], [block(0, [const_(6, 0), const_(3, 1), const_(2, 2), ret(2)])], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("17. folds BitOr(5,2) -> 7", () => {
    const before = program([
      func("f", [], [block(0, [const_(5, 0), const_(2, 1), bin("BitOr", 0, 1, 2), ret(2)])], 0, 3),
    ]);
    const after = constantFolding(before);
    const expected = program([
      func("f", [], [block(0, [const_(5, 0), const_(2, 1), const_(7, 2), ret(2)])], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("18. folds BitXor(5,3) -> 6", () => {
    const before = program([
      func("f", [], [block(0, [const_(5, 0), const_(3, 1), bin("BitXor", 0, 1, 2), ret(2)])], 0, 3),
    ]);
    const after = constantFolding(before);
    const expected = program([
      func("f", [], [block(0, [const_(5, 0), const_(3, 1), const_(6, 2), ret(2)])], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("19. folds Shl(1,3) -> 8", () => {
    const before = program([
      func("f", [], [block(0, [const_(1, 0), const_(3, 1), bin("Shl", 0, 1, 2), ret(2)])], 0, 3),
    ]);
    const after = constantFolding(before);
    const expected = program([
      func("f", [], [block(0, [const_(1, 0), const_(3, 1), const_(8, 2), ret(2)])], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("20. folds Shr(8,2) -> 2", () => {
    const before = program([
      func("f", [], [block(0, [const_(8, 0), const_(2, 1), bin("Shr", 0, 1, 2), ret(2)])], 0, 3),
    ]);
    const after = constantFolding(before);
    const expected = program([
      func("f", [], [block(0, [const_(8, 0), const_(2, 1), const_(2, 2), ret(2)])], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("21. folds Neg(5) -> -5", () => {
    const before = program([
      func("f", [], [block(0, [const_(5, 0), un("Neg", 0, 1), ret(1)])], 0, 2),
    ]);
    const after = constantFolding(before);
    const expected = program([
      func("f", [], [block(0, [const_(5, 0), const_(-5, 1), ret(1)])], 0, 2),
    ]);
    expectProg(after, expected);
  });

  it("22. folds Not(true) -> false", () => {
    const before = program([
      func("f", [], [block(0, [const_(true, 0), un("Not", 0, 1), ret(1)])], 0, 2),
    ]);
    const after = constantFolding(before);
    const expected = program([
      func("f", [], [block(0, [const_(true, 0), const_(false, 1), ret(1)])], 0, 2),
    ]);
    expectProg(after, expected);
  });

  it("23. folds Not(false) -> true", () => {
    const before = program([
      func("f", [], [block(0, [const_(false, 0), un("Not", 0, 1), ret(1)])], 0, 2),
    ]);
    const after = constantFolding(before);
    const expected = program([
      func("f", [], [block(0, [const_(false, 0), const_(true, 1), ret(1)])], 0, 2),
    ]);
    expectProg(after, expected);
  });

  it("24. folds BitNot(0) -> -1", () => {
    const before = program([
      func("f", [], [block(0, [const_(0, 0), un("BitNot", 0, 1), ret(1)])], 0, 2),
    ]);
    const after = constantFolding(before);
    const expected = program([
      func("f", [], [block(0, [const_(0, 0), const_(-1, 1), ret(1)])], 0, 2),
    ]);
    expectProg(after, expected);
  });

  it("25. cascades ((2+3)*4) -> 20 across fixpoint iterations", () => {
    const before = program([
      func("f", [], [
        block(0, [
          const_(2, 0),
          const_(3, 1),
          bin("Add", 0, 1, 2),  // r2 = 5
          const_(4, 3),
          bin("Mul", 2, 3, 4),  // r4 = 20
          ret(4),
        ]),
      ], 0, 5),
    ]);
    const after = constantFolding(before);
    const expected = program([
      func("f", [], [
        block(0, [
          const_(2, 0),
          const_(3, 1),
          const_(5, 2),
          const_(4, 3),
          const_(20, 4),
          ret(4),
        ]),
      ], 0, 5),
    ]);
    expectProg(after, expected);
  });

  it("26. folds string concatenation 'foo'+'bar' -> 'foobar'", () => {
    const before = program([
      func("f", [], [block(0, [const_("foo", 0), const_("bar", 1), bin("Add", 0, 1, 2), ret(2)])], 0, 3),
    ]);
    const after = constantFolding(before);
    const expected = program([
      func("f", [], [block(0, [const_("foo", 0), const_("bar", 1), const_("foobar", 2), ret(2)])], 0, 3),
    ]);
    expectProg(after, expected);
  });

  it("27. leaves a non-constant operand Bin untouched", () => {
    const before = program([
      func("f", [0], [
        block(0, [const_(2, 1), bin("Add", 0, 1, 2), ret(2)]),
      ], 0, 3),
    ]);
    expectUnchanged(before, constantFolding);
  });

  it("28. folds across blocks (function-level SSA const map)", () => {
    const before = program([
      func("f", [], [
        block(0, [const_(2, 0), const_(3, 1), bin("Lt", 0, 1, 2), br(2, 1, 2)]),
        block(1, [const_(10, 3), ret(3)]),
        block(2, [const_(20, 4), ret(4)]),
      ], 0, 5),
    ]);
    const after = constantFolding(before);
    const expected = program([
      func("f", [], [
        block(0, [const_(2, 0), const_(3, 1), const_(true, 2), br(2, 1, 2)]),
        block(1, [const_(10, 3), ret(3)]),
        block(2, [const_(20, 4), ret(4)]),
      ], 0, 5),
    ]);
    expectProg(after, expected);
  });
});
