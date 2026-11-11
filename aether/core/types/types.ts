/**
 * aether/core/types/types.ts
 * =========================
 * Semantic type representation for Aether.
 *
 * The AST carries *syntactic* type nodes (NamedType, FuncType, etc.) that
 * mirror source code. The type checker works with this *semantic* `Type`
 * representation: simplified, resolved, with type variables for inference.
 *
 * Type kinds
 * ----------
 *   Int, Float, Bool, String, Char, Unit
 *   Func     { params: Type[], ret: Type }
 *   Tuple    { items: Type[] }
 *   Array    { elem: Type }
 *   Map      { key, value }
 *   Option   { inner }
 *   Result   { ok, err }
 *   Named    { name, args }  (user types: struct/enum/alias)
 *   Generic  { name, constraint? }  (unresolved type parameter)
 *   TypeVar  { name, bound }  (inference variable)
 *   Struct   { name, fields: { name, type }[] }
 *   Enum     { name, variants: { name, kind, types?, fields? }[] }
 *   Never    — diverging (return/break/continue)
 *
 * Helpers
 * -------
 *   typeEq(a, b)         — structural equality
 *   typeToString(t)      — human-readable
 *   isSubtype(a, b)      — true if `a` can be used where `b` is expected
 *                          (handles int->float widening and Never)
 *   unify(a, b)          — returns a binding map on success, throws
 *                          UnifyError on failure
 *   applySubst(t, subst) — substitute TypeVars in a type
 *   freshTypeVar(name?)  — generate a fresh inference variable
 */
export type Type =
  | TInt
  | TFloat
  | TBool
  | TString
  | TChar
  | TUnit
  | TFunc
  | TTuple
  | TArray
  | TMap
  | TOption
  | TResult
  | TNamed
  | TGeneric
  | TTypeVar
  | TStruct
  | TEnum
  | TNever;

export interface TInt { kind: "Int"; }
export interface TFloat { kind: "Float"; }
export interface TBool { kind: "Bool"; }
export interface TString { kind: "String"; }
export interface TChar { kind: "Char"; }
export interface TUnit { kind: "Unit"; }
export interface TNever { kind: "Never"; }

export interface TFunc { kind: "Func"; params: Type[]; ret: Type; }
export interface TTuple { kind: "Tuple"; items: Type[]; }
export interface TArray { kind: "Array"; elem: Type; }
export interface TMap { kind: "Map"; key: Type; value: Type; }
export interface TOption { kind: "Option"; inner: Type; }
export interface TResult { kind: "Result"; ok: Type; err: Type; }
export interface TNamed { kind: "Named"; name: string; args: Type[]; }
export interface TGeneric { kind: "Generic"; name: string; constraint?: string; }
export interface TTypeVar { kind: "TypeVar"; name: string; bound?: string; }
export interface TStruct { kind: "Struct"; name: string; fields: { name: string; type: Type }[]; }
export interface TEnum {
  kind: "Enum";
  name: string;
  generics?: string[];
  variants: { name: string; kind: "unit" | "tuple" | "struct"; types?: Type[]; fields?: { name: string; type: Type }[] }[];
}

export const T_INT: TInt = { kind: "Int" };
export const T_FLOAT: TFloat = { kind: "Float" };
export const T_BOOL: TBool = { kind: "Bool" };
export const T_STRING: TString = { kind: "String" };
export const T_CHAR: TChar = { kind: "Char" };
export const T_UNIT: TUnit = { kind: "Unit" };
export const T_NEVER: TNever = { kind: "Never" };

//----------------------------------------------------------------------------
// Fresh type variables
//----------------------------------------------------------------------------
let typeVarCounter = 0;
export function freshTypeVar(name = "T"): TTypeVar {
  return { kind: "TypeVar", name: `${name}${typeVarCounter++}` };
}
export function resetTypeVarCounter(): void { typeVarCounter = 0; }

//----------------------------------------------------------------------------
// Structural equality
//----------------------------------------------------------------------------
export function typeEq(a: Type, b: Type): boolean {
  if (a === b) return true;
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "Int": case "Float": case "Bool": case "String": case "Char":
    case "Unit": case "Never":
      return true;
    case "Func": {
      const bb = b as TFunc;
      if (a.params.length !== bb.params.length) return false;
      for (let i = 0; i < a.params.length; i++) if (!typeEq(a.params[i], bb.params[i])) return false;
      return typeEq(a.ret, bb.ret);
    }
    case "Tuple": {
      const bb = b as TTuple;
      if (a.items.length !== bb.items.length) return false;
      for (let i = 0; i < a.items.length; i++) if (!typeEq(a.items[i], bb.items[i])) return false;
      return true;
    }
    case "Array": return typeEq(a.elem, (b as TArray).elem);
    case "Map": return typeEq(a.key, (b as TMap).key) && typeEq(a.value, (b as TMap).value);
    case "Option": return typeEq(a.inner, (b as TOption).inner);
    case "Result": return typeEq(a.ok, (b as TResult).ok) && typeEq(a.err, (b as TResult).err);
    case "Named": {
      const bb = b as TNamed;
      if (a.name !== bb.name) return false;
      if (a.args.length !== bb.args.length) return false;
      for (let i = 0; i < a.args.length; i++) if (!typeEq(a.args[i], bb.args[i])) return false;
      return true;
    }
    case "Generic": return a.name === (b as TGeneric).name;
    case "TypeVar": return a.name === (b as TTypeVar).name;
    case "Struct": {
      const bb = b as TStruct;
      if (a.name !== bb.name) return false;
      if (a.fields.length !== bb.fields.length) return false;
      for (let i = 0; i < a.fields.length; i++) {
        if (a.fields[i].name !== bb.fields[i].name) return false;
        if (!typeEq(a.fields[i].type, bb.fields[i].type)) return false;
      }
      return true;
    }
    case "Enum": {
      const bb = b as TEnum;
      if (a.name !== bb.name) return false;
      if (a.variants.length !== bb.variants.length) return false;
      return true; // shallow compare on variants (sufficient for v1)
    }
  }
}

//----------------------------------------------------------------------------
// Subtype (numeric widening: int -> float; Never is bottom)
//----------------------------------------------------------------------------
export function isSubtype(a: Type, b: Type): boolean {
  if (typeEq(a, b)) return true;
  if (a.kind === "Never") return true;
  if (a.kind === "Int" && b.kind === "Float") return true;
  if (a.kind === "Array" && b.kind === "Array") return isSubtype(a.elem, (b as TArray).elem);
  if (a.kind === "Option" && b.kind === "Option") return isSubtype(a.inner, (b as TOption).inner);
  if (a.kind === "Tuple" && b.kind === "Tuple") {
    const bb = b as TTuple;
    if (a.items.length !== bb.items.length) return false;
    for (let i = 0; i < a.items.length; i++) if (!isSubtype(a.items[i], bb.items[i])) return false;
    return true;
  }
  return false;
}

//----------------------------------------------------------------------------
// String representation
//----------------------------------------------------------------------------
export function typeToString(t: Type): string {
  switch (t.kind) {
    case "Int": return "int";
    case "Float": return "float";
    case "Bool": return "bool";
    case "String": return "string";
    case "Char": return "char";
    case "Unit": return "()";
    case "Never": return "never";
    case "Func":
      return `fn(${t.params.map(typeToString).join(", ")}) -> ${typeToString(t.ret)}`;
    case "Tuple":
      return `(${t.items.map(typeToString).join(", ")})`;
    case "Array":
      return `[${typeToString(t.elem)}]`;
    case "Map":
      return `map[${typeToString(t.key)}]${typeToString(t.value)}`;
    case "Option":
      return `option<${typeToString(t.inner)}>`;
    case "Result":
      return `result<${typeToString(t.ok)}, ${typeToString(t.err)}>`;
    case "Named":
      return t.args.length ? `${t.name}<${t.args.map(typeToString).join(", ")}>` : t.name;
    case "Generic":
      return t.constraint ? `${t.name}: ${t.constraint}` : t.name;
    case "TypeVar":
      return t.name;
    case "Struct":
      return `struct ${t.name}`;
    case "Enum":
      return `enum ${t.name}`;
  }
}

//----------------------------------------------------------------------------
// Substitution and unification
//----------------------------------------------------------------------------
export type Subst = Map<string, Type>;

export function applySubst(t: Type, subst: Subst): Type {
  switch (t.kind) {
    case "Int": case "Float": case "Bool": case "String": case "Char":
    case "Unit": case "Never":
      return t;
    case "Generic": {
      // Generic placeholders can be substituted (used during instantiation).
      const found = subst.get(t.name);
      if (found) return applySubst(found, subst);
      return t;
    }
    case "TypeVar": {
      const found = subst.get(t.name);
      if (found) return applySubst(found, subst);
      return t;
    }
    case "Func":
      return { kind: "Func", params: t.params.map(p => applySubst(p, subst)), ret: applySubst(t.ret, subst) };
    case "Tuple":
      return { kind: "Tuple", items: t.items.map(i => applySubst(i, subst)) };
    case "Array":
      return { kind: "Array", elem: applySubst(t.elem, subst) };
    case "Map":
      return { kind: "Map", key: applySubst(t.key, subst), value: applySubst(t.value, subst) };
    case "Option":
      return { kind: "Option", inner: applySubst(t.inner, subst) };
    case "Result":
      return { kind: "Result", ok: applySubst(t.ok, subst), err: applySubst(t.err, subst) };
    case "Named":
      return { kind: "Named", name: t.name, args: t.args.map(a => applySubst(a, subst)) };
    case "Struct":
      return { kind: "Struct", name: t.name, fields: t.fields.map(f => ({ name: f.name, type: applySubst(f.type, subst) })) };
    case "Enum":
      return t;
  }
}

export class UnifyError extends Error {
  a: Type;
  b: Type;
  constructor(a: Type, b: Type, msg?: string) {
    super(msg ?? `cannot unify ${typeToString(a)} with ${typeToString(b)}`);
    this.name = "UnifyError";
    this.a = a;
    this.b = b;
  }
}

/** Unify two types, returning a binding map. Throws UnifyError on mismatch. */
export function unify(a: Type, b: Type, subst: Subst = new Map()): Subst {
  const aR = applySubst(a, subst);
  const bR = applySubst(b, subst);
  if (typeEq(aR, bR)) return subst;
  // int widens to float
  if (aR.kind === "Int" && bR.kind === "Float") return subst;
  // Never unifies with anything
  if (aR.kind === "Never") return subst;
  if (bR.kind === "Never") return subst;
  // TypeVar binding
  if (aR.kind === "TypeVar") return bindVar(aR.name, bR, subst);
  if (bR.kind === "TypeVar") return bindVar(bR.name, aR, subst);
  if (aR.kind === "Generic" && bR.kind === "Generic" && aR.name === bR.name) return subst;

  if (aR.kind !== bR.kind) throw new UnifyError(aR, bR);

  switch (aR.kind) {
    case "Func": {
      const bb = bR as TFunc;
      if (aR.params.length !== bb.params.length) throw new UnifyError(aR, bb);
      for (let i = 0; i < aR.params.length; i++) unify(aR.params[i], bb.params[i], subst);
      unify(aR.ret, bb.ret, subst);
      return subst;
    }
    case "Tuple": {
      const bb = bR as TTuple;
      if (aR.items.length !== bb.items.length) throw new UnifyError(aR, bb);
      for (let i = 0; i < aR.items.length; i++) unify(aR.items[i], bb.items[i], subst);
      return subst;
    }
    case "Array": return unify(aR.elem, (bR as TArray).elem, subst);
    case "Map":
      unify(aR.key, (bR as TMap).key, subst);
      unify(aR.value, (bR as TMap).value, subst);
      return subst;
    case "Option": return unify(aR.inner, (bR as TOption).inner, subst);
    case "Result":
      unify(aR.ok, (bR as TResult).ok, subst);
      unify(aR.err, (bR as TResult).err, subst);
      return subst;
    case "Named": {
      const bb = bR as TNamed;
      if (aR.name !== bb.name) throw new UnifyError(aR, bb);
      if (aR.args.length !== bb.args.length) throw new UnifyError(aR, bb);
      for (let i = 0; i < aR.args.length; i++) unify(aR.args[i], bb.args[i], subst);
      return subst;
    }
    case "Struct": {
      const bb = bR as TStruct;
      if (aR.name !== bb.name) throw new UnifyError(aR, bb);
      return subst;
    }
    case "Enum": {
      const bb = bR as TEnum;
      if (aR.name !== bb.name) throw new UnifyError(aR, bb);
      return subst;
    }
    default:
      throw new UnifyError(aR, bR);
  }
}

function bindVar(name: string, t: Type, subst: Subst): Subst {
  // occurs check (shallow)
  if (t.kind === "TypeVar" && t.name === name) return subst;
  if (occursIn(name, t)) throw new UnifyError({ kind: "TypeVar", name }, t, "recursive unification");
  subst.set(name, t);
  return subst;
}

function occursIn(name: string, t: Type): boolean {
  switch (t.kind) {
    case "TypeVar": return t.name === name;
    case "Func": return t.params.some(p => occursIn(name, p)) || occursIn(name, t.ret);
    case "Tuple": return t.items.some(i => occursIn(name, i));
    case "Array": return occursIn(name, t.elem);
    case "Map": return occursIn(name, t.key) || occursIn(name, t.value);
    case "Option": return occursIn(name, t.inner);
    case "Result": return occursIn(name, t.ok) || occursIn(name, t.err);
    case "Named": return t.args.some(a => occursIn(name, a));
    case "Struct": return t.fields.some(f => occursIn(name, f.type));
    default: return false;
  }
}

//----------------------------------------------------------------------------
// Helpers for building common types
//----------------------------------------------------------------------------
export function optionOf(inner: Type): TOption { return { kind: "Option", inner }; }
export function resultOf(ok: Type, err: Type): TResult { return { kind: "Result", ok, err }; }
export function arrayOf(elem: Type): TArray { return { kind: "Array", elem }; }
export function funcType(params: Type[], ret: Type): TFunc { return { kind: "Func", params, ret }; }
export function tupleOf(items: Type[]): TTuple { return { kind: "Tuple", items }; }
