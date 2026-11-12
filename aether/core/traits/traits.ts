/**
 * aether/core/traits/traits.ts
 * =============================
 * The Aether trait system — Rust-style traits with coherence, associated
 * types, default methods, super-traits, trait bounds, generic impls, and
 * `dyn Trait` trait objects.
 *
 * Architecture (v3, v1 of the trait system)
 * ------------------------------------------
 * `TraitRegistry` is the compile-time authority on traits. The parser
 * produces `TraitDecl`/`ImplBlock` AST nodes; the sema layer walks the
 * program and feeds them to the registry via `declareTrait`/`declareImpl`.
 * Resolution happens entirely at compile time: when the sema sees
 * `x.method(args)` it asks the registry which impl provides `method` for
 * the receiver's type, then writes the (traitName, implTypeName, methodName)
 * triple onto the `MethodCall` AST node as `__traitImpl`. The evaluator and
 * the VM read that triple and dispatch to a top-level closure registered
 * under the mangled name `__impl_<Trait>_<Type>_<method>`.
 *
 * `dyn Trait` is a fat pointer `{ __dyn: TraitName, vtable, data }`. The
 * vtable is a `Map<methodName, closure>` built at construction time. Method
 * calls on a dyn value look up the closure in the vtable and invoke it with
 * `[data, ...args]`.
 *
 * Coherence
 * ---------
 * For each (trait, concrete impl type) there is at most ONE impl in the
 * whole program (orphan-rule approximation: the impl must be defined in the
 * same compilation unit as either the trait or the type — for v1 we just
 * enforce "globally unique"). Duplicate impls are reported as type errors.
 *
 * Object safety
 * -------------
 * A trait is object-safe (eligible for `dyn Trait`) iff it has no
 * associated types and no `Self` in any method's *parameter* position
 * (returning `Self` is fine). `dyn NotObjectSafe` is rejected by sema.
 *
 * Bounds
 * ------
 * A `fn sort<T: Ord>(xs: [T])` records the bound `T: Ord`. At a call site
 * `sort([1, 2, 3])` the sema resolves T=int and verifies the registry has
 * an impl of Ord for int (or a generic impl that matches). Otherwise the
 * call is rejected with a "trait bound not satisfied" error.
 *
 * v1 simplifications (documented)
 * ------------------------------
 *  - **No specialisation.** The first impl that matches a (trait, type) is
 *    used; later, more-specific impls are not preferred. Coherence still
 *    forbids two impls for the same (trait, type) — there is no `where`
 *    clause mechanism to express specialisation.
 *  - **No HKT (higher-kinded types).** Associated types are first-class
 *    but they cannot themselves be parameterised by other types.
 *  - **No GATs (generic associated types).** `type Item<T>` is not
 *    supported; only `type Item;`.
 *  - **Orphan rule.** v1 enforces "globally unique impl per (trait,
 *    concrete type)" instead of the proper Rust orphan rule. Crates
 *    (modules) are not modelled.
 *  - **Trait method dispatch is statically resolved.** Every `x.m(args)`
 *    that goes through a trait is rewritten at sema time to a direct call
 *    to a mangled top-level function. There is no runtime method-table
 *    lookup for statically-typed receivers — only `dyn Trait` uses a
 *    vtable.
 *  - **Generic impls** (`impl<T: Ord> Ord for [T]`) work by registering a
 *    "template" impl keyed by the impl *shape* (`[T]`); at a call site the
 *    registry matches against the receiver's concrete type and returns
 *    the (possibly substituted) impl. The receiver's actual element type
 *    must satisfy the bound (T: Ord).
 */
import type {
  Type,
  TFunc,
  TStruct,
  TEnum,
  TNamed,
  TArray,
  TTuple,
  TMap,
  TOption,
  TResult,
  TTypeVar,
} from "../types/types";
import { typeEq, typeToString, applySubst, unify } from "../types/types";

//----------------------------------------------------------------------------
// Public data structures (semantic representations)
//----------------------------------------------------------------------------

/** A method signature stored inside a `TraitDecl`. */
export interface TraitMethod {
  name: string;
  /** Parameter types — `self` is the first param (named "self"). */
  params: { name: string; type: Type }[];
  retType: Type;
  hasDefault: boolean;
  /** Default body as raw source text (parsed lazily by the sema/eval). */
  defaultBody?: string;
  /** True iff `Self` appears in any parameter type. */
  selfInArgs: boolean;
  /** True iff `Self` appears in the return type. */
  selfInRet: boolean;
}

/** A trait declaration as stored in the registry. */
export interface TraitDecl {
  name: string;
  typeParams: string[];
  superTraits: string[];
  methods: TraitMethod[];
  assocTypes: { name: string; bound?: string }[];
  /** Original AST node — set by the sema for back-reference. */
  ast?: unknown;
}

/** A method definition stored inside an `ImplBlock`. */
export interface ImplMethod {
  name: string;
  /** Parameter types — `self` is the first param. */
  params: { name: string; type: Type }[];
  retType: Type;
  /** Body AST (Stmt[]) — the evaluator uses this. */
  body: unknown;
  /** Parameter AST (Param[]) — the evaluator uses this. */
  paramAST?: unknown;
  /** Optional return-type AST node. */
  retAST?: unknown;
}

/** An `impl Trait for Type { ... }` block as stored in the registry. */
export interface ImplBlock {
  traitName: string;
  implType: Type;
  typeParams: string[];
  /** Trait-bound constraints on each type param (parallel to typeParams). */
  typeParamBounds: (string | undefined)[];
  methods: ImplMethod[];
  assocTypes: { name: string; type: Type }[];
  /** The receiver type rendered as a string (the impl key component). */
  implTypeName: string;
  /** Original AST node — set by the sema for back-reference. */
  ast?: unknown;
  /** Whether this impl was synthesised by `#[derive(...)]`. */
  synthesized?: boolean;
}

//----------------------------------------------------------------------------
// Helpers
//----------------------------------------------------------------------------

/** Compute a stable string key for a `Type`, used in impl-table lookups. */
export function typeKey(t: Type): string {
  switch (t.kind) {
    case "Int": return "int";
    case "Float": return "float";
    case "Bool": return "bool";
    case "String": return "string";
    case "Char": return "char";
    case "Unit": return "unit";
    case "Never": return "never";
    case "Func":
      return `fn(${t.params.map(typeKey).join(",")}) -> ${typeKey(t.ret)}`;
    case "Tuple":
      return `(${t.items.map(typeKey).join(",")})`;
    case "Array":
      return `[${typeKey(t.elem)}]`;
    case "Map":
      return `map[${typeKey(t.key)}]${typeKey(t.value)}`;
    case "Option":
      return `option<${typeKey(t.inner)}>`;
    case "Result":
      return `result<${typeKey(t.ok)},${typeKey(t.err)}>`;
    case "Named":
      return t.args.length ? `${t.name}<${t.args.map(typeKey).join(",")}>` : t.name;
    case "Generic": return t.name;
    case "TypeVar": return `?${t.name}`;
    case "Struct": return t.name;
    case "Enum": return t.name;
  }
}

/** Render a type as a valid Aether mangled-name fragment (no `<`/`>`/`,`/`(`). */
export function mangleType(t: Type): string {
  switch (t.kind) {
    case "Int": return "int";
    case "Float": return "float";
    case "Bool": return "bool";
    case "String": return "string";
    case "Char": return "char";
    case "Unit": return "unit";
    case "Never": return "never";
    case "Func":
      return `fn_${t.params.map(mangleType).join("_")}_ret_${mangleType(t.ret)}`;
    case "Tuple":
      return `tup_${t.items.map(mangleType).join("_")}`;
    case "Array":
      return `arr_${mangleType(t.elem)}`;
    case "Map":
      return `map_${mangleType(t.key)}_${mangleType(t.value)}`;
    case "Option":
      return `opt_${mangleType(t.inner)}`;
    case "Result":
      return `res_${mangleType(t.ok)}_${mangleType(t.err)}`;
    case "Named":
      return t.args.length
        ? `${t.name}__${t.args.map(mangleType).join("_")}`
        : t.name;
    case "Generic": return t.name;
    case "TypeVar": return `tv_${t.name}`;
    case "Struct": return t.name;
    case "Enum": return t.name;
  }
}

/** Build the mangled top-level function name for an impl method. */
export function mangledImplFn(
  traitName: string,
  implType: Type,
  methodName: string,
): string {
  return `__impl_${traitName}_${mangleType(implType)}_${methodName}`;
}

/** Detect whether a `Type` mentions a given type-parameter name. */
export function typeMentions(t: Type, name: string): boolean {
  switch (t.kind) {
    case "Int": case "Float": case "Bool": case "String": case "Char":
    case "Unit": case "Never":
      return false;
    case "Func":
      return t.params.some(p => typeMentions(p, name)) || typeMentions(t.ret, name);
    case "Tuple":
      return t.items.some(i => typeMentions(i, name));
    case "Array":
      return typeMentions(t.elem, name);
    case "Map":
      return typeMentions(t.key, name) || typeMentions(t.value, name);
    case "Option":
      return typeMentions(t.inner, name);
    case "Result":
      return typeMentions(t.ok, name) || typeMentions(t.err, name);
    case "Named":
      return t.args.some(a => typeMentions(a, name));
    case "Generic":
      return t.name === name;
    case "TypeVar":
      return t.name === name;
    case "Struct":
      return t.fields.some(f => typeMentions(f.type, name));
    case "Enum":
      return t.variants.some(v =>
        (v.types ?? []).some(ty => typeMentions(ty, name)) ||
        (v.fields ?? []).some(f => typeMentions(f.type, name)),
      );
  }
}

/** Whether a Type contains `Self` (encoded as the named-type "Self"). */
export function typeMentionsSelf(t: Type): boolean {
  return typeMentions(t, "Self");
}

//----------------------------------------------------------------------------
// TraitRegistry
//----------------------------------------------------------------------------

/**
 * The compile-time authority on traits and impls. The sema layer creates one
 * `TraitRegistry` per `check()` invocation and walks the AST to populate it.
 */
export class TraitRegistry {
  /** trait name → TraitDecl */
  private traits = new Map<string, TraitDecl>();
  /** All impls, in declaration order. */
  private impls: ImplBlock[] = [];
  /**
   * Coherence table: keyed by `${traitName}::${typeKey(implType)}` (no type
   * params substituted) — used to reject duplicate impls of the *same*
   * concrete (trait, type).
   */
  private concreteImpls = new Map<string, ImplBlock>();
  /** Coherence errors collected during declaration. */
  coherenceErrors: { message: string }[] = [];

  /** Register a trait declaration. Re-declaration is ignored (last wins). */
  declareTrait(t: TraitDecl): void {
    this.traits.set(t.name, t);
  }

  /**
   * Register an impl block.
   *
   * Coherence: a concrete (non-generic) impl must be globally unique per
   * (trait, impl type). Generic impls (`impl<T: ...> Ord for [T]`) don't
   * conflict with each other in v1 — we match them at call sites.
   */
  declareImpl(i: ImplBlock): void {
    this.impls.push(i);
    if (i.typeParams.length === 0) {
      const key = `${i.traitName}::${typeKey(i.implType)}`;
      const existing = this.concreteImpls.get(key);
      if (existing) {
        this.coherenceErrors.push({
          message:
            `conflicting impls of trait '${i.traitName}' for type ` +
            `${typeToString(i.implType)}: duplicate impl (coherence violation)`,
        });
      } else {
        this.concreteImpls.set(key, i);
      }
    }
  }

  /** Look up a trait declaration by name. */
  getTrait(name: string): TraitDecl | null {
    return this.traits.get(name) ?? null;
  }

  /** All declared traits. */
  getAllTraits(): TraitDecl[] {
    return Array.from(this.traits.values());
  }

  /** All registered impls (concrete + generic). */
  getAllTraitImpls(): ImplBlock[] {
    return this.impls.slice();
  }

  /**
   * Find a trait method by name across all traits that `type` implements.
   * Returns the trait name and the method declaration.
   *
   * Used for `x.m(args)` where x has a known concrete type: the registry
   * walks impls in declaration order and returns the first match.
   *
   * If no impl provides the method but a trait declares it as a default
   * method (hasDefault), the trait method is returned with `impl` set to
   * the matching impl (for vtable construction) and `method` set to null
   * (the eval will synthesize a closure from the default body).
   */
  findTraitMethodForType(
    type: Type,
    methodName: string,
  ): { traitName: string; impl: ImplBlock; method: ImplMethod | null; traitMethod: TraitMethod | null } | null {
    for (const impl of this.impls) {
      // Try the impl's own methods first.
      const method = impl.methods.find(m => m.name === methodName);
      if (!method) {
        // The impl doesn't override this method. Check if the trait
        // declares it as a default method.
        const trait = this.traits.get(impl.traitName);
        const traitMethod = trait?.methods.find(m => m.name === methodName) ?? null;
        if (traitMethod && traitMethod.hasDefault) {
          // The impl matches the type, and the trait provides a default.
          const subst = matchImplType(impl, type);
          if (subst === null) continue;
          return { traitName: impl.traitName, impl, method: null, traitMethod };
        }
        continue;
      }
      // Try to unify the impl's receiver type with the call-site type.
      const subst = matchImplType(impl, type);
      if (subst === null) continue;
      // Found a matching impl. Resolve the trait method declaration.
      const trait = this.traits.get(impl.traitName);
      const traitMethod = trait?.methods.find(m => m.name === methodName) ?? null;
      return { traitName: impl.traitName, impl, method, traitMethod };
    }
    return null;
  }

  /**
   * Resolve a trait method call. Returns the impl and method name to use.
   * Returns `{ error }` if no impl matches.
   */
  resolveTraitMethod(
    traitName: string,
    type: Type,
    methodName: string,
  ): { impl: ImplBlock; method: string; traitMethod: TraitMethod | null } | { error: string } {
    const trait = this.traits.get(traitName);
    if (!trait) return { error: `unknown trait '${traitName}'` };
    // Walk all impls of this trait; prefer a concrete match, else a generic match.
    for (const impl of this.impls) {
      if (impl.traitName !== traitName) continue;
      const method = impl.methods.find(m => m.name === methodName);
      if (!method) continue;
      const subst = matchImplType(impl, type);
      if (subst === null) continue;
      const traitMethod = trait.methods.find(m => m.name === methodName) ?? null;
      return { impl, method: methodName, traitMethod };
    }
    return {
      error:
        `no impl of trait '${traitName}' for type ${typeToString(type)} ` +
        `provides method '${methodName}'`,
    };
  }

  /**
   * Check that `type` implements the named trait (e.g. for `T: Ord` bound).
   * Returns true iff there is an impl (concrete or generic that matches).
   */
  typeImplementsTrait(type: Type, traitName: string): boolean {
    for (const impl of this.impls) {
      if (impl.traitName !== traitName) continue;
      if (matchImplType(impl, type) !== null) return true;
    }
    // Also consider super-traits: if `traitName` is a super-trait of any
    // trait that `type` implements, the type implements `traitName` too.
    for (const impl of this.impls) {
      if (matchImplType(impl, type) === null) continue;
      const trait = this.traits.get(impl.traitName);
      if (!trait) continue;
      if (this.superTraitsInclude(trait, traitName)) return true;
    }
    return false;
  }

  /** Walk super-trait chain to see if `trait` (transitively) extends `name`. */
  private superTraitsInclude(trait: TraitDecl, name: string): boolean {
    for (const sup of trait.superTraits) {
      if (sup === name) return true;
      const supTrait = this.traits.get(sup);
      if (supTrait && this.superTraitsInclude(supTrait, name)) return true;
    }
    return false;
  }

  /**
   * Object-safety check. A trait is object-safe iff:
   *   - it has no associated types,
   *   - no method has `Self` in any parameter position.
   */
  isTraitObjectSafe(traitName: string): boolean {
    const trait = this.traits.get(traitName);
    if (!trait) return false;
    if (trait.assocTypes.length > 0) return false;
    for (const m of trait.methods) {
      if (m.selfInArgs) return false;
    }
    return true;
  }

  /**
   * Find all impls of a trait that match `type` — used to build a dyn
   * vtable at construction time.
   */
  findImplsForType(type: Type, traitName: string): ImplBlock[] {
    const out: ImplBlock[] = [];
    for (const impl of this.impls) {
      if (impl.traitName !== traitName) continue;
      if (matchImplType(impl, type) !== null) out.push(impl);
    }
    return out;
  }

  /**
   * For `#[derive(Show)]` and `#[derive(Eq)]`: synthesize an impl block AST
   * for the given struct/enum. The sema/eval reads the synthesized impl and
   * registers it like a user-written impl.
   *
   * For v1 we emit Show/Eq impls that delegate to `display`/`valueEq` — the
   * synthesized method bodies are tiny Aether source snippets compiled at
   * eval time. This keeps `#[derive]` entirely a compile-time concern that
   * lowers to standard impl blocks.
   */
  synthesizeDeriveImpls(
    decl: { name: string; kind: "struct" | "enum" },
    deriveList: string[],
  ): { traitName: string; body: string }[] {
    const out: { traitName: string; body: string }[] = [];
    for (const traitName of deriveList) {
      if (traitName === "Show") {
        out.push({
          traitName: "Show",
          body:
            `impl Show for ${decl.name} {\n` +
            `  fn show(self) -> string {\n` +
            `    str(self)\n` +
            `  }\n` +
            `}\n`,
        });
      } else if (traitName === "Eq") {
        out.push({
          traitName: "Eq",
          body:
            `impl Eq for ${decl.name} {\n` +
            `  fn eq(self, other: ${decl.name}) -> bool {\n` +
            `    self == other\n` +
            `  }\n` +
            `}\n`,
        });
      } else if (traitName === "Default") {
        out.push({
          traitName: "Default",
          body:
            `impl Default for ${decl.name} {\n` +
            `  fn default() -> ${decl.name} {\n` +
            `    ${decl.name} {}\n` +
            `  }\n` +
            `}\n`,
        });
      }
    }
    return out;
  }
}

//----------------------------------------------------------------------------
// Impl matching — unify impl's (possibly generic) implType against a call-site type
//----------------------------------------------------------------------------

/**
 * Try to match an impl's (possibly generic) impl type against a concrete
 * call-site receiver type. Returns a substitution mapping impl type params
 * to concrete types (empty for non-generic impls), or `null` if no match.
 *
 * For non-generic impls: structural equality (via `typeEq`).
 * For generic impls: unification with the impl's type parameters as
 * inference variables. Bound checking is the caller's responsibility.
 */
export function matchImplType(impl: ImplBlock, callType: Type): Map<string, Type> | null {
  if (impl.typeParams.length === 0) {
    // Concrete impl — direct structural equality.
    return typeEq(impl.implType, callType) ? new Map() : null;
  }
  // Generic impl — unify the impl's template implType (with typeParams as
  // free Generic vars) against the call-site type, treating only the
  // impl's own typeParams as bindable.
  const subst = new Map<string, Type>();
  try {
    unifyImplType(impl.implType, callType, impl.typeParams, subst);
    return subst;
  } catch {
    return null;
  }
}

/**
 * One-sided unification: bind impl type-params (the names in `typeParams`)
 * to corresponding parts of the call-site type. Doesn't bind call-site
 * TypeVars.
 */
function unifyImplType(
  implT: Type,
  callT: Type,
  typeParams: string[],
  subst: Map<string, Type>,
): void {
  // Resolve implT via current subst first.
  if (implT.kind === "Generic" && typeParams.includes(implT.name)) {
    const existing = subst.get(implT.name);
    if (existing) {
      if (!typeEq(existing, callT)) throw new Error("impl-type mismatch");
      return;
    }
    subst.set(implT.name, callT);
    return;
  }
  if (implT.kind === callT.kind) {
    switch (implT.kind) {
      case "Int": case "Float": case "Bool": case "String": case "Char":
      case "Unit": case "Never":
        return;
      case "Func": {
        const c = callT as TFunc;
        if (implT.params.length !== c.params.length) throw new Error("arity");
        for (let i = 0; i < implT.params.length; i++) {
          unifyImplType(implT.params[i], c.params[i], typeParams, subst);
        }
        unifyImplType(implT.ret, c.ret, typeParams, subst);
        return;
      }
      case "Tuple": {
        const c = callT as TTuple;
        if (implT.items.length !== c.items.length) throw new Error("arity");
        for (let i = 0; i < implT.items.length; i++) {
          unifyImplType(implT.items[i], c.items[i], typeParams, subst);
        }
        return;
      }
      case "Array":
        unifyImplType(implT.elem, (callT as TArray).elem, typeParams, subst);
        return;
      case "Map":
        unifyImplType(implT.key, (callT as TMap).key, typeParams, subst);
        unifyImplType(implT.value, (callT as TMap).value, typeParams, subst);
        return;
      case "Option":
        unifyImplType(implT.inner, (callT as TOption).inner, typeParams, subst);
        return;
      case "Result":
        unifyImplType(implT.ok, (callT as TResult).ok, typeParams, subst);
        unifyImplType(implT.err, (callT as TResult).err, typeParams, subst);
        return;
      case "Named": {
        const c = callT as TNamed;
        if (implT.name !== c.name) throw new Error("name mismatch");
        if (implT.args.length !== c.args.length) throw new Error("arity");
        for (let i = 0; i < implT.args.length; i++) {
          unifyImplType(implT.args[i], c.args[i], typeParams, subst);
        }
        return;
      }
      case "Struct": {
        const c = callT as TStruct;
        if (implT.name !== c.name) throw new Error("struct mismatch");
        return;
      }
      case "Enum": {
        const c = callT as TEnum;
        if (implT.name !== c.name) throw new Error("enum mismatch");
        return;
      }
      case "Generic":
        // Non-typeparam Generic — must match identically.
        if (implT.name !== (callT as TNamed).name) throw new Error("generic mismatch");
        return;
      case "TypeVar":
        // Treat impl's TypeVar as opaque — only unify if same name.
        if (implT.name !== (callT as TTypeVar).name) throw new Error("tv mismatch");
        return;
    }
  }
  throw new Error("kind mismatch");
}

//----------------------------------------------------------------------------
// Public resolution helper used by sema + eval
//----------------------------------------------------------------------------

/**
 * Resolve a static trait method call: given the registry, the trait name,
 * the receiver's concrete type, the method name, and the argument types,
 * return either the resolved impl/method, or an error message.
 */
export function resolveTraitCall(
  reg: TraitRegistry,
  traitName: string,
  recvType: Type,
  methodName: string,
  argTypes: Type[],
): { impl: ImplBlock; method: string } | { error: string } {
  const trait = reg.getTrait(traitName);
  if (!trait) return { error: `unknown trait '${traitName}'` };
  const r = reg.resolveTraitMethod(traitName, recvType, methodName);
  if ("error" in r) return { error: r.error };
  void argTypes;
  return { impl: r.impl, method: r.method };
}

//----------------------------------------------------------------------------
// Dyn value (runtime representation)
//----------------------------------------------------------------------------
//
// The dyn value is a fat pointer `{ __dyn, vtable, data }`. The vtable is a
// `Map<methodName, closure>` carrying one closure per method of the trait
// (using the impl that matches the data's runtime type).
//
// At eval time, constructing a dyn value requires:
//   1. The trait name (carried by the AST `dyn TraitName(...)` node).
//   2. The data value (the wrapped value).
//   3. Knowledge of which impl of `TraitName` applies to the data's
//      runtime type. The eval figures this out by inspecting the value's
//      tag (`__struct`/`__variant`/`typeof`) and walking the registry.
//
// The vtable is built lazily at construction time and stored on the dyn
// value; subsequent method calls are direct map lookups.

export interface DynValue {
  __dyn: string;
  /** methodName → closure (a Value). */
  vtable: Map<string, unknown>;
  /** The wrapped value. */
  data: unknown;
  /** The concrete type name of `data` (for debugging). */
  dataTypeName: string;
}

/** Detect a dyn value. */
export function isDynValue(v: unknown): v is DynValue {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    && !(v instanceof Map)
    && (v as { __dyn?: unknown }).__dyn !== undefined;
}

//----------------------------------------------------------------------------
// Self type placeholder
//----------------------------------------------------------------------------

/** The "Self" pseudo-type — modelled as a Named type with name "Self". */
export const SELF_TYPE: TNamed = { kind: "Named", name: "Self", args: [] };
