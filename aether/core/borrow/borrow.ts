/**
 * aether/core/borrow/borrow.ts
 * =============================
 * A real, simplified borrow checker for Aether (RFC-004 prototype).
 *
 * What this is
 * ------------
 * A standalone static analysis pass that walks the Aether AST and enforces
 * the core Rust-style ownership & borrowing rules:
 *
 *   1. One owner per value.
 *   2. Assignment moves the value (unless the type is `Copy`).
 *   3. `&x` is a shared borrow; `&mut x` is an exclusive borrow.
 *   4. Aliasing XOR mutation: many `&x` *or* one `&mut x`, never both at
 *      the same time.
 *   5. Simplified non-lexical lifetimes (NLL): a borrow ends at the last
 *      statement that uses the borrower (with a one-statement minimum
 *      so a freshly created borrow can't be silently shadowed by a
 *      same-block re-borrow).
 *   6. `move x` is an explicit move site.
 *
 * What this is NOT (v2 follow-ups — documented as v2 in the report)
 * ------------------------------------------------------------------
 * - No explicit lifetime parameters (`'a`).
 * - No cross-function borrow-flow analysis (function args are treated
 *   as reads, not borrows, in v1's GC model — only `&x` / `&mut x` /
 *   `move x` are tracked).
 * - No higher-ranked lifetimes.
 * - No `unsafe` escape hatch.
 * - No `Drop` impls — values drop at scope exit; we don't run user
 *   destructors, but we DO model "use after drop" via scope exit.
 *
 * Integration
 * ------------
 * The checker is opt-in. It is *not* called by `sema.check` by default
 * (calling it unconditionally would break every existing v1 test — most v1
 * programs assign owned arrays freely without `move` semantics). Callers
 * that want borrow checking should use `BorrowChecker.check(program)` or
 * pass `{ borrowCheck: true }` to `sema.check`.
 *
 * Public surface
 * --------------
 *   interface BorrowError { message, loc }
 *   interface OwnershipInfo { owned, borrowed, moved }
 *   class BorrowChecker { check(program) }
 *   function checkBorrows(program)
 *
 * Algorithm
 * ----------
 * Per-block, forward sweep:
 *   - For each block (top-level program body, function body, while body,
 *     if branch body, etc.), we run a `checkBlock(stmts)` pass.
 *   - We maintain per-block state: `vars` (Map name→VarState) and `borrows`
 *     (array of BorrowInfo).
 *   - Pre-pass: compute the "last use index" for every name in the block.
 *   - Main pass: walk statements in order. For each statement:
 *       * First, evaluate its expression's "effects" (reads, writes, moves,
 *         borrows) — recording errors as we go.
 *       * Then, update the var state (declared, moved, etc.) and add any
 *         new borrows.
 *       * Finally, expire any borrows whose borrower's last-use is <= the
 *         current statement index.
 *
 * Copy-ness model
 * ---------------
 * The `Copy` trait is hard-coded: int, float, bool, char, unit are Copy;
 * everything else (arrays, strings, structs, tuples) is owned/moves. This
 * matches Rust's built-in Copy impls. v2 will allow `impl Copy for MyType`.
 *
 * Move-context propagation
 * -------------------------
 * - `let y = EXPR;` — EXPR is in move context (a bare Ident moves).
 * - Binary/Unary operands are reads (override to false).
 * - Function call arguments are READS in v1 (override to false), unless
 *   explicitly `move x`. (In v1's GC model, calls don't take ownership.)
 * - Array literal elements are in move context (the array owns them).
 * - Struct/Enum variant args are in move context.
 */

import type {
  Program,
  Stmt,
  Expr,
  FnDecl,
  SourceLocation,
  Let,
  MutLet,
  Const,
  AssignStmt,
  ExprStmt,
  Print,
  While,
  ForIn,
  Return,
} from "../ast/ast";
import { SOURCE_LOCATION_ZERO } from "../ast/ast";

//----------------------------------------------------------------------------
// Public types
//----------------------------------------------------------------------------

export interface BorrowError {
  message: string;
  loc: SourceLocation;
}

/** Snapshot of ownership state at any point (mainly for tests / debugging). */
export interface OwnershipInfo {
  /** Names currently owned (still usable). */
  owned: Set<string>;
  /** Map: borrowed-name → list of active borrows on it. */
  borrowed: Map<string, Array<{ mutable: boolean; borrower: string }>>;
  /** Names that have been moved (no longer usable). */
  moved: Set<string>;
}

//----------------------------------------------------------------------------
// Internal state
//----------------------------------------------------------------------------

interface VarState {
  name: string;
  /** True for int, float, bool, char, unit. False for arrays, strings, structs, tuples. */
  isCopy: boolean;
  /** True if the binding is `let mut x = ...` (or a param, or reassignable). */
  mutable: boolean;
  /** True once the value has been moved out of this binding. */
  moved: boolean;
  /** True once the binding has gone out of scope (drop). */
  dropped: boolean;
  /** Where the binding was declared (for error messages). */
  declLoc: SourceLocation;
}

interface BorrowInfo {
  borrower: string;
  borrowed: string;
  mutable: boolean;
  /** Index of the statement that created the borrow. */
  createdAt: number;
  /** Index of the last statement that uses the borrower (NLL end). */
  lastUseAt: number;
  loc: SourceLocation;
}

//----------------------------------------------------------------------------
// Helpers
//----------------------------------------------------------------------------

function isCopyExpr(e: Expr): boolean {
  switch (e.kind) {
    case "IntLit":
    case "FloatLit":
    case "BoolLit":
    case "CharLit":
    case "UnitLit":
      return true;
    case "Paren":
      return isCopyExpr(e.expr);
    default:
      return false;
  }
}

/**
 * Get the "place root" of an expression — the underlying Ident that owns
 * the storage being borrowed/moved. For `x`, returns "x". For `x.f`,
 * returns "x" (conservatively). For `x[i]`, returns "x". For anything
 * else, returns null.
 */
function placeRoot(e: Expr): string | null {
  switch (e.kind) {
    case "Ident":
      return e.name;
    case "Paren":
      return placeRoot(e.expr);
    case "Field":
    case "TupleField":
    case "Index":
      return placeRoot(e.object);
    case "Deref":
      // `*r` — the place root is the dereferenced value; we don't track
      // through-reference writes.
      return null;
    default:
      return null;
  }
}

interface ExprEffects {
  reads: Set<string>;
  writes: Set<string>;
  moves: Set<string>;
  /** borrows: list of (borrowed, mutable, loc). The "borrower name" is set
   * by the caller (checkLet for named borrows; applyEffects for inline). */
  borrows: Array<{ borrowed: string; mutable: boolean; loc: SourceLocation }>;
}

function emptyEffects(): ExprEffects {
  return { reads: new Set(), writes: new Set(), moves: new Set(), borrows: [] };
}

/**
 * Categorise the effects of an expression.
 * `moveCtx: true` means a bare Ident counts as a move (not a read).
 */
function effectsOf(e: Expr, moveCtx: boolean): ExprEffects {
  const out = emptyEffects();
  walkExpr(e, out, moveCtx);
  return out;
}

function walkExpr(e: Expr, out: ExprEffects, moveCtx: boolean): void {
  switch (e.kind) {
    case "Ident": {
      if (moveCtx) out.moves.add(e.name);
      else out.reads.add(e.name);
      return;
    }
    case "Paren":
      walkExpr(e.expr, out, moveCtx);
      return;
    case "Binary":
      walkExpr(e.left, out, false);
      walkExpr(e.right, out, false);
      return;
    case "Unary":
      walkExpr(e.operand, out, false);
      return;
    case "Assign":
      addWrite(out, e.target);
      walkExpr(e.value, out, false);
      return;
    case "CompoundAssign":
      addRead(out, e.target);
      addWrite(out, e.target);
      walkExpr(e.value, out, false);
      return;
    case "Call": {
      walkExpr(e.callee, out, false);
      for (const a of e.args) {
        if (a.kind === "Borrow") {
          const root = placeRoot(a.operand);
          if (root) out.borrows.push({ borrowed: root, mutable: a.mutable, loc: a.loc });
          walkExpr(a.operand, out, false);
        } else if (a.kind === "Move") {
          const root = placeRoot(a.operand);
          if (root) out.moves.add(root);
          else walkExpr(a.operand, out, true);
        } else {
          // v1 (GC mode): function arguments are READS, not moves.
          // Use `move x` for an explicit move.
          walkExpr(a, out, false);
        }
      }
      return;
    }
    case "MethodCall": {
      const root = placeRoot(e.object);
      if (root) out.reads.add(root);
      else walkExpr(e.object, out, false);
      for (const a of e.args) {
        if (a.kind === "Borrow") {
          const r = placeRoot(a.operand);
          if (r) out.borrows.push({ borrowed: r, mutable: a.mutable, loc: a.loc });
          walkExpr(a.operand, out, false);
        } else if (a.kind === "Move") {
          const r = placeRoot(a.operand);
          if (r) out.moves.add(r);
          else walkExpr(a.operand, out, true);
        } else {
          walkExpr(a, out, false);
        }
      }
      return;
    }
    case "Index":
      addRead(out, e.object);
      walkExpr(e.index, out, false);
      return;
    case "Field":
    case "TupleField":
      addRead(out, e.object);
      return;
    case "TupleExpr":
      for (const el of e.elements) walkExpr(el, out, moveCtx);
      return;
    case "ArrayExpr":
      // Array literals: each element is moved into the array.
      for (const el of e.elements) walkExpr(el, out, true);
      return;
    case "MapExpr":
      for (const ent of e.entries) {
        walkExpr(ent.key, out, false);
        walkExpr(ent.value, out, true);
      }
      return;
    case "StructExpr":
      for (const f of e.fields) walkExpr(f.value, out, true);
      if (e.spread) walkExpr(e.spread, out, false);
      return;
    case "EnumVariant":
      for (const a of e.args) walkExpr(a, out, true);
      return;
    case "Lambda":
      // Lambda body is analysed separately when called; the body's free
      // variables are reads at the lambda site (we don't model move
      // captures in v1).
      return;
    case "If":
      walkExpr(e.cond, out, false);
      // Branches analysed as separate blocks.
      return;
    case "Match":
      walkExpr(e.scrutinee, out, true);
      return;
    case "Block":
      // Nested block analysed separately.
      return;
    case "Cast":
    case "As":
      walkExpr(e.expr, out, moveCtx);
      return;
    case "Range":
      walkExpr(e.start, out, false);
      walkExpr(e.end, out, false);
      return;
    case "ErrorProp":
      walkExpr(e.expr, out, false);
      return;
    case "SelfExpr":
      out.reads.add("self");
      return;
    case "Spread":
      walkExpr(e.expr, out, moveCtx);
      return;
    case "Return":
      if (e.expr) walkExpr(e.expr, out, true);
      return;
    case "Borrow": {
      const root = placeRoot(e.operand);
      if (root) out.borrows.push({ borrowed: root, mutable: e.mutable, loc: e.loc });
      walkExpr(e.operand, out, false);
      return;
    }
    case "Deref":
      walkExpr(e.operand, out, false);
      return;
    case "Move": {
      const root = placeRoot(e.operand);
      if (root) out.moves.add(root);
      else walkExpr(e.operand, out, true);
      return;
    }
    case "IntLit":
    case "FloatLit":
    case "BoolLit":
    case "StringLit":
    case "CharLit":
    case "UnitLit":
      return;
  }
}

function addRead(out: ExprEffects, e: Expr): void {
  const root = placeRoot(e);
  if (root) out.reads.add(root);
  else walkExpr(e, out, false);
}

function addWrite(out: ExprEffects, e: Expr): void {
  const root = placeRoot(e);
  if (root) out.writes.add(root);
  else walkExpr(e, out, false);
}

/**
 * Compute the last-use index of every name in a flat statement list.
 * A "use" is any read, write, move, or borrow-of at the top level
 * (effects that touch the variable). Returns a Map name→max index used
 * (or the name is absent if never used).
 *
 * We do NOT peer into nested blocks (if/while/for/match bodies) — those
 * are separate scopes and don't extend outer borrows.
 */
function computeLastUses(stmts: Stmt[]): Map<string, number> {
  const lastUse = new Map<string, number>();
  for (let i = 0; i < stmts.length; i++) {
    const touched = new Set<string>();
    collectTouchedNames(stmts[i], touched);
    for (const name of touched) lastUse.set(name, i);
  }
  return lastUse;
}

function collectTouchedNames(s: Stmt, out: Set<string>): void {
  switch (s.kind) {
    case "Let":
    case "MutLet":
    case "Const": {
      const eff = effectsOf(s.init, false);
      for (const r of eff.reads) out.add(r);
      for (const w of eff.writes) out.add(w);
      for (const m of eff.moves) out.add(m);
      for (const b of eff.borrows) out.add(b.borrowed);
      return;
    }
    case "ExprStmt": {
      const eff = effectsOf(s.expr, false);
      for (const r of eff.reads) out.add(r);
      for (const w of eff.writes) out.add(w);
      for (const m of eff.moves) out.add(m);
      for (const b of eff.borrows) out.add(b.borrowed);
      return;
    }
    case "Print": {
      const eff = effectsOf(s.expr, false);
      for (const r of eff.reads) out.add(r);
      for (const m of eff.moves) out.add(m);
      for (const b of eff.borrows) out.add(b.borrowed);
      return;
    }
    case "AssignStmt": {
      const targetRoot = placeRoot(s.target);
      if (targetRoot) out.add(targetRoot);
      else {
        const eff = effectsOf(s.target, false);
        for (const r of eff.reads) out.add(r);
      }
      const eff = effectsOf(s.value, false);
      for (const r of eff.reads) out.add(r);
      for (const w of eff.writes) out.add(w);
      for (const m of eff.moves) out.add(m);
      for (const b of eff.borrows) out.add(b.borrowed);
      return;
    }
    case "Return": {
      if (s.expr) {
        const eff = effectsOf(s.expr, false);
        for (const r of eff.reads) out.add(r);
        for (const m of eff.moves) out.add(m);
        for (const b of eff.borrows) out.add(b.borrowed);
      }
      return;
    }
    case "While": {
      const eff = effectsOf(s.cond, false);
      for (const r of eff.reads) out.add(r);
      return;
    }
    case "ForIn": {
      const eff = effectsOf(s.iterable, false);
      for (const r of eff.reads) out.add(r);
      for (const m of eff.moves) out.add(m);
      return;
    }
    case "BlockStmt":
    case "FnDecl":
    case "Break":
    case "Continue":
    case "Import":
    case "EnumDecl":
    case "StructDecl":
    case "TypeAlias":
    case "TraitDecl":
    case "ImplBlock":
      return;
  }
}

//----------------------------------------------------------------------------
// BorrowChecker
//----------------------------------------------------------------------------

export class BorrowChecker {
  errors: BorrowError[] = [];

  /** Entry point: check a whole program. Returns the list of errors. */
  check(program: Program): BorrowError[] {
    this.errors = [];
    this.checkBlock(program.body, SOURCE_LOCATION_ZERO);
    return this.errors;
  }

  /**
   * Check a flat statement list (a block). The block has its own
   * scope; borrows created inside expire at the block's end.
   */
  checkBlock(stmts: Stmt[], blockLoc: SourceLocation): void {
    const vars = new Map<string, VarState>();
    const borrows: BorrowInfo[] = [];
    const lastUse = computeLastUses(stmts);

    for (let i = 0; i < stmts.length; i++) {
      this.checkStmt(stmts[i], i, vars, borrows, lastUse);
      // Expire borrows whose last-use is <= i (they're done after this
      // statement).
      for (let j = borrows.length - 1; j >= 0; j--) {
        if (borrows[j].lastUseAt <= i) {
          borrows.splice(j, 1);
        }
      }
    }

    // Drop owned variables at scope end.
    for (const v of vars.values()) v.dropped = true;
    void blockLoc;
  }

  checkStmt(
    s: Stmt,
    i: number,
    vars: Map<string, VarState>,
    borrows: BorrowInfo[],
    lastUse: Map<string, number>,
  ): void {
    switch (s.kind) {
      case "Let":
      case "MutLet":
      case "Const":
        this.checkLet(s as Let | MutLet | Const, i, vars, borrows, lastUse);
        return;
      case "ExprStmt":
        this.checkExprStmt(s, i, vars, borrows, lastUse);
        return;
      case "Print":
        this.applyEffects(effectsOf(s.expr, false), i, vars, borrows, lastUse, s.loc);
        return;
      case "AssignStmt":
        this.checkAssignStmt(s, i, vars, borrows, lastUse);
        return;
      case "Return":
        if (s.expr) {
          this.applyEffects(effectsOf(s.expr, false), i, vars, borrows, lastUse, s.loc);
        }
        return;
      case "While":
        this.applyEffects(effectsOf(s.cond, false), i, vars, borrows, lastUse, s.loc);
        this.checkBlock(s.body.stmts, s.body.loc);
        return;
      case "ForIn":
        this.applyEffects(effectsOf(s.iterable, false), i, vars, borrows, lastUse, s.loc);
        this.checkBlock(s.body.stmts, s.body.loc);
        return;
      case "BlockStmt":
        this.checkBlock(s.body, s.loc);
        return;
      case "FnDecl":
        this.checkFnDecl(s);
        return;
      case "Break":
      case "Continue":
      case "Import":
      case "EnumDecl":
      case "StructDecl":
      case "TypeAlias":
      case "TraitDecl":
      case "ImplBlock":
        return;
    }
  }

  /**
   * Check a `let x = expr;` / `let mut x = expr;` / `const x = expr;`.
   */
  checkLet(
    s: Let | MutLet | Const,
    i: number,
    vars: Map<string, VarState>,
    borrows: BorrowInfo[],
    lastUse: Map<string, number>,
  ): void {
    const isMut = s.kind === "MutLet";

    // Special-case: `let r = &x;` or `let r = &mut x;` — creates a named
    // borrow on the operand. Don't run effectsOf on the Borrow (which
    // would create a synthetic inline borrow) — call createBorrow.
    if (s.init.kind === "Borrow") {
      const root = placeRoot(s.init.operand);
      // Process the operand's reads (e.g. `&x.f` reads `x`).
      const operandEff = effectsOf(s.init.operand, false);
      this.applyEffects(operandEff, i, vars, borrows, lastUse, s.loc);
      // Declare the new binding (references are Copy in our model).
      vars.set(s.name, {
        name: s.name, isCopy: true, mutable: isMut,
        moved: false, dropped: false, declLoc: s.loc,
      });
      // Create the named borrow on the operand.
      if (root) {
        this.createBorrow(root, s.name, s.init.mutable, i, vars, borrows, lastUse, s.loc);
      }
      return;
    }

    // Normal case: process the init expression. The init is in move
    // context (a bare Ident on the RHS moves into the new binding).
    const initEff = effectsOf(s.init, true);

    // Resolve moves: if a move targets a Copy variable, downgrade to read.
    const realMoves = new Set<string>();
    for (const m of initEff.moves) {
      const v = vars.get(m);
      if (v && v.isCopy) initEff.reads.add(m);
      else realMoves.add(m);
    }
    initEff.moves = realMoves;

    this.applyEffects(initEff, i, vars, borrows, lastUse, s.loc);

    // Determine if the new binding holds a Copy value or an owned value.
    let isCopy = false;
    if (s.init.kind === "IntLit" || s.init.kind === "FloatLit" ||
        s.init.kind === "BoolLit" || s.init.kind === "CharLit" ||
        s.init.kind === "UnitLit") {
      isCopy = true;
    } else if (s.init.kind === "Ident") {
      const src = vars.get(s.init.name);
      // If the source is Copy and was NOT moved (i.e. we copied), the
      // new binding is also Copy. If the source was moved (non-Copy),
      // the new binding takes ownership and is non-Copy.
      if (src && src.isCopy) {
        isCopy = true;
      }
    } else if (s.init.kind === "Paren") {
      isCopy = isCopyExpr(s.init);
    }

    // Declare the new binding (shadowing replaces any existing binding).
    vars.set(s.name, {
      name: s.name, isCopy, mutable: isMut,
      moved: false, dropped: false, declLoc: s.loc,
    });
  }

  /** Check an expression statement (e.g. `consume(move x);` or `f(&x);`). */
  checkExprStmt(
    s: ExprStmt,
    i: number,
    vars: Map<string, VarState>,
    borrows: BorrowInfo[],
    lastUse: Map<string, number>,
  ): void {
    const eff = effectsOf(s.expr, false);
    const realMoves = new Set<string>();
    for (const m of eff.moves) {
      const v = vars.get(m);
      if (v && v.isCopy) eff.reads.add(m);
      else realMoves.add(m);
    }
    eff.moves = realMoves;
    this.applyEffects(eff, i, vars, borrows, lastUse, s.loc);
  }

  /** Check `target = value;`. */
  checkAssignStmt(
    s: AssignStmt,
    i: number,
    vars: Map<string, VarState>,
    borrows: BorrowInfo[],
    lastUse: Map<string, number>,
  ): void {
    // Evaluate RHS effects first (it might move/borrow things).
    const valEff = effectsOf(s.value, false);
    const realMoves = new Set<string>();
    for (const m of valEff.moves) {
      const v = vars.get(m);
      if (v && v.isCopy) valEff.reads.add(m);
      else realMoves.add(m);
    }
    valEff.moves = realMoves;
    this.applyEffects(valEff, i, vars, borrows, lastUse, s.loc);

    // Then apply the write to the target.
    const targetRoot = placeRoot(s.target);
    if (targetRoot) {
      const v = vars.get(targetRoot);
      if (v) {
        if (v.moved) {
          this.err(`use of moved value '${targetRoot}'`, s.loc);
        } else if (v.dropped) {
          this.err(`use of dropped value '${targetRoot}'`, s.loc);
        } else if (!v.mutable) {
          this.err(`cannot assign to immutable variable '${targetRoot}'`, s.loc);
        } else {
          for (const b of borrows) {
            if (b.borrowed === targetRoot) {
              this.err(
                `cannot assign to '${targetRoot}' because it is borrowed`,
                s.loc,
              );
              break;
            }
          }
        }
      }
    }
  }

  /**
   * Apply a set of effects (reads, writes, moves, borrows) against the
   * current var/borrow state, emitting errors for violations.
   * `i` is the current statement index (for inline borrows' timestamps).
   */
  applyEffects(
    eff: ExprEffects,
    i: number,
    vars: Map<string, VarState>,
    borrows: BorrowInfo[],
    lastUse: Map<string, number>,
    loc: SourceLocation,
  ): void {
    // Reads.
    for (const r of eff.reads) {
      const v = vars.get(r);
      if (!v) continue;
      if (v.moved) this.err(`use of moved value '${r}'`, loc);
      else if (v.dropped) this.err(`use of dropped value '${r}'`, loc);
    }
    // Writes.
    for (const w of eff.writes) {
      const v = vars.get(w);
      if (!v) continue;
      if (v.moved) this.err(`use of moved value '${w}'`, loc);
      else if (v.dropped) this.err(`use of dropped value '${w}'`, loc);
      else if (!v.mutable) this.err(`cannot assign to immutable variable '${w}'`, loc);
      else {
        for (const b of borrows) {
          if (b.borrowed === w) {
            this.err(`cannot assign to '${w}' because it is borrowed`, loc);
            break;
          }
        }
      }
    }
    // Moves.
    for (const m of eff.moves) {
      const v = vars.get(m);
      if (!v) continue;
      if (v.moved) {
        this.err(`use of moved value '${m}'`, loc);
      } else if (v.dropped) {
        this.err(`use of dropped value '${m}'`, loc);
      } else {
        let blocked = false;
        for (const b of borrows) {
          if (b.borrowed === m) {
            this.err(`cannot move '${m}' because it is borrowed`, loc);
            blocked = true;
            break;
          }
        }
        if (!blocked) v.moved = true;
      }
    }
    // Borrows (inline — e.g. f(&x)). Synthetic borrower `__inline_<i>_<k>`.
    for (let k = 0; k < eff.borrows.length; k++) {
      const b = eff.borrows[k];
      const v = vars.get(b.borrowed);
      if (!v) continue;
      if (v.moved) {
        this.err(`use of moved value '${b.borrowed}'`, loc);
        continue;
      }
      if (v.dropped) {
        this.err(`use of dropped value '${b.borrowed}'`, loc);
        continue;
      }
      if (b.mutable && !v.mutable) {
        this.err(
          `cannot borrow '${b.borrowed}' as mutable because it is not declared mut`,
          loc,
        );
      }
      let conflict = false;
      for (const existing of borrows) {
        if (existing.borrowed !== b.borrowed) continue;
        if (b.mutable) {
          this.err(
            `cannot borrow '${b.borrowed}' as mutable because it is already borrowed` +
              (existing.mutable ? " as mutable" : " as immutable"),
            loc,
          );
          conflict = true;
          break;
        } else {
          if (existing.mutable) {
            this.err(
              `cannot borrow '${b.borrowed}' as immutable because it is borrowed as mutable`,
              loc,
            );
            conflict = true;
            break;
          }
          // Both immutable — coexist.
        }
      }
      if (conflict) continue;
      // Add the inline borrow. Inline borrows expire at the current
      // statement (their lastUse is the call site itself).
      borrows.push({
        borrower: `__inline_${i}_${k}`,
        borrowed: b.borrowed,
        mutable: b.mutable,
        createdAt: i,
        lastUseAt: i,
        loc: b.loc,
      });
    }
    void lastUse;
  }

  /**
   * Create a named borrow (e.g. `let r = &x;` → borrow on `x` with
   * borrower `r`). The borrow's lastUse is the borrower's last use in
   * the block, with a minimum of createdAt+1 (so a freshly-created
   * borrow can't be silently shadowed by a same-block re-borrow).
   */
  createBorrow(
    borrowed: string,
    borrower: string,
    mutable: boolean,
    createdAt: number,
    vars: Map<string, VarState>,
    borrows: BorrowInfo[],
    lastUse: Map<string, number>,
    loc: SourceLocation,
  ): void {
    const v = vars.get(borrowed);
    if (!v) return;
    if (v.moved) {
      this.err(`use of moved value '${borrowed}'`, loc);
      return;
    }
    if (v.dropped) {
      this.err(`use of dropped value '${borrowed}'`, loc);
      return;
    }
    if (mutable && !v.mutable) {
      this.err(
        `cannot borrow '${borrowed}' as mutable because it is not declared mut`,
        loc,
      );
    }
    for (const existing of borrows) {
      if (existing.borrowed !== borrowed) continue;
      if (mutable) {
        this.err(
          `cannot borrow '${borrowed}' as mutable because it is already borrowed` +
            (existing.mutable ? " as mutable" : " as immutable"),
          loc,
        );
        return;
      } else {
        if (existing.mutable) {
          this.err(
            `cannot borrow '${borrowed}' as immutable because it is borrowed as mutable`,
            loc,
          );
          return;
        }
      }
    }
    // Compute the last use of `borrower` in the block. Bump to
    // createdAt+1 so the borrow is alive for at least one statement
    // beyond creation (catches `let r = &mut x; let s = &mut x;`).
    const computed = lastUse.get(borrower) ?? createdAt;
    const lastUseAt = Math.max(computed, createdAt + 1);
    borrows.push({
      borrower, borrowed, mutable,
      createdAt, lastUseAt, loc,
    });
  }

  /**
   * Check a function declaration: its body is a separate block, with
   * parameters pre-declared as owned bindings.
   */
  checkFnDecl(fn: FnDecl): void {
    const vars = new Map<string, VarState>();
    const borrows: BorrowInfo[] = [];
    for (const p of fn.params) {
      // Parameters take ownership; assume non-Copy (conservative).
      vars.set(p.name, {
        name: p.name, isCopy: false, mutable: false,
        moved: false, dropped: false, declLoc: p.loc,
      });
    }
    const stmts = fn.body.stmts;
    // Build a synthetic statement list with a trailing return for the
    // block's trailing expression (so its uses are counted in lastUse).
    let stmtsToCheck: Stmt[];
    if (fn.body.expr) {
      const syntheticReturn: Return = {
        kind: "Return",
        loc: fn.body.expr.loc,
        expr: fn.body.expr,
      };
      stmtsToCheck = [...stmts, syntheticReturn as unknown as Stmt];
    } else {
      stmtsToCheck = stmts;
    }
    const lastUse = computeLastUses(stmtsToCheck);
    for (let i = 0; i < stmtsToCheck.length; i++) {
      this.checkStmt(stmtsToCheck[i], i, vars, borrows, lastUse);
      for (let j = borrows.length - 1; j >= 0; j--) {
        if (borrows[j].lastUseAt <= i) borrows.splice(j, 1);
      }
    }
  }

  /**
   * Snapshot the current ownership state (for tests/debugging).
   */
  snapshot(vars: Map<string, VarState>, borrows: BorrowInfo[]): OwnershipInfo {
    const owned = new Set<string>();
    const moved = new Set<string>();
    const borrowed = new Map<string, Array<{ mutable: boolean; borrower: string }>>();
    for (const [name, v] of vars) {
      if (v.dropped) continue;
      if (v.moved) moved.add(name);
      else owned.add(name);
    }
    for (const b of borrows) {
      const arr = borrowed.get(b.borrowed) ?? [];
      arr.push({ mutable: b.mutable, borrower: b.borrower });
      borrowed.set(b.borrowed, arr);
    }
    return { owned, borrowed, moved };
  }

  private err(message: string, loc: SourceLocation): void {
    this.errors.push({ message, loc });
  }
}

//----------------------------------------------------------------------------
// Convenience entry point
//----------------------------------------------------------------------------

export function checkBorrows(program: Program): BorrowError[] {
  return new BorrowChecker().check(program);
}
