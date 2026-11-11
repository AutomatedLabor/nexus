/**
 * aether/core/ast/serialize.ts
 * ===========================
 * JSON round-trip for the Aether AST, plus structural equality.
 *
 * `astToJson` produces stable, human-readable JSON: the `kind` discriminator
 * comes first, followed by all properties in declaration order, with `loc`
 * last. `jsonToAst` validates the `kind` and returns a typed node. `astEqual`
 * compares two nodes structurally, ignoring source locations.
 *
 * These primitives are used by the playground to ship AST state between the
 * browser (which can request a parse) and the devtools panel, and to diff
 * two ASTs cheaply on incremental edits.
 */
import type { Node } from "./ast";
import { SOURCE_LOCATION_ZERO } from "./ast";
import { children } from "./visitor";

const VALID_KINDS = new Set<string>([
  "Program",
  // expressions
  "IntLit", "FloatLit", "BoolLit", "StringLit", "CharLit", "UnitLit", "Ident",
  "Binary", "Unary", "Assign", "CompoundAssign", "Call", "Index", "Field",
  "MethodCall", "TupleExpr", "ArrayExpr", "MapExpr", "StructExpr", "EnumVariant",
  "Lambda", "If", "Match", "Block", "Paren", "Cast", "Range", "As", "ErrorProp",
  "TupleField", "SelfExpr", "Spread",
  // statements
  "Let", "MutLet", "Const", "ExprStmt", "FnDecl", "EnumDecl", "StructDecl",
  "TypeAlias", "Return", "Break", "Continue", "While", "ForIn", "Import",
  "Print", "AssignStmt", "BlockStmt",
  // patterns
  "WildcardPat", "BindPat", "LitPat", "TuplePat", "ArrayPat", "StructPat",
  "EnumPat", "OrPat", "RestPat",
  // types
  "NamedType", "GenericType", "FuncType", "TupleType", "ArrayType", "MapType",
  "OptionType", "ResultType", "PrimitiveType", "UnitType",
]);

/**
 * Serialize an AST node to JSON. Field order: `kind`, then declared props,
 * then `loc`. Use `replacer` to omit fields like `loc` if desired.
 */
export function astToJson(node: Node, indent: number | string | undefined = undefined): string {
  return JSON.stringify(node, replacer, indent);
}

function replacer(_key: string, value: unknown): unknown {
  // JSON.stringify already handles nested objects; we only override the
  // top-level field ordering here (kind first, loc last).
  if (value && typeof value === "object" && !Array.isArray(value) && "kind" in (value as object)) {
    const v = value as Record<string, unknown>;
    const out: Record<string, unknown> = { kind: v.kind };
    for (const [k, val] of Object.entries(v)) {
      if (k === "kind" || k === "loc") continue;
      out[k] = val;
    }
    if ("loc" in v) out.loc = v.loc;
    return out;
  }
  return value;
}

/** Parse JSON back into a typed AST node. Throws on invalid kind. */
export function jsonToAst(json: string | Record<string, unknown>): Node {
  const obj: Record<string, unknown> = typeof json === "string" ? JSON.parse(json) : json;
  return reviveNode(obj) as Node;
}

function reviveNode(obj: Record<string, unknown>): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(reviveNode);
  if (!("kind" in obj)) return obj;
  const kind = String(obj.kind);
  if (!VALID_KINDS.has(kind)) {
    throw new Error(`jsonToAst: unknown node kind '${kind}'`);
  }
  const out: Record<string, unknown> = { kind };
  for (const [k, v] of Object.entries(obj)) {
    if (k === "kind") continue;
    out[k] = reviveNode(v as Record<string, unknown>);
  }
  if (!("loc" in out)) out.loc = SOURCE_LOCATION_ZERO;
  return out;
}

/**
 * Structural equality of two AST nodes. Ignores `loc` (source positions).
 * Arrays compared element-wise; primitives by `===`.
 */
export function astEqual(a: Node | null | undefined, b: Node | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (typeof a !== "object" || typeof b !== "object") return a === b;
  if (a.kind !== b.kind) return false;
  const aKeys = new Set(Object.keys(a).filter(k => k !== "loc"));
  const bKeys = new Set(Object.keys(b).filter(k => k !== "loc"));
  if (aKeys.size !== bKeys.size) return false;
  for (const key of aKeys) {
    if (!bKeys.has(key)) return false;
    const av = (a as Record<string, unknown>)[key];
    const bv = (b as Record<string, unknown>)[key];
    if (!deepEqual(av, bv)) return false;
  }
  return true;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a as Record<string, unknown>).filter(k => k !== "loc");
  const bk = Object.keys(b as Record<string, unknown>).filter(k => k !== "loc");
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!(k in (b as Record<string, unknown>))) return false;
    if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  }
  return true;
}

/** Clone a node deeply, preserving structure (loc preserved by copy). */
export function cloneAst<T extends Node>(node: T): T {
  return JSON.parse(JSON.stringify(node)) as T;
}

/** Count child nodes (one level deep) — useful for diagnostics. */
export function childCount(node: Node): number {
  return children(node).length;
}
