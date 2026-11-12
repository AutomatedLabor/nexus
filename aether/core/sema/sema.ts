/**
 * aether/core/sema/sema.ts
 * ======================
 * Name resolution + bidirectional type inference/checking for Aether.
 *
 * `check(program)` returns `{ errors: TypeError[], types: Map<nodeId, Type>,
 * warnings }`. Errors are accumulated (we don't abort on first error) so the
 * playground can show the user *all* type problems at once.
 *
 * Simplified in v1 (documented limitations)
 * -----------------------------------------
 * - No trait resolution; trait constraints are recorded but not enforced.
 * - No lifetime inference; references are not modelled in v1.
 * - Generic instantiation uses Algorithm W (Hindley–Milner-ish) with a fresh
 *   TypeVar per generic parameter per call site. We don't generalize let-
 *   bound lambdas (no let-polymorphism); a `let f = id` is monomorphic.
 * - Match arm body types unify pairwise to find the common type.
 * - Function return-type inference only inspects the body's trailing
 *   expression (and any `return` expressions). Full-blown flow analysis is
 *   out of scope for v1.
 * - `or`/`||` and similar short-circuit ops: right side may be a diverging
 *   `return`, which unifies with anything (Never).
 */
import {
  type Program,
  type Stmt,
  type Expr,
  type Pattern,
  type TypeNode,
  type FnDecl,
  type EnumDecl,
  type StructDecl,
  type TypeAlias,
  type Param,
  type TypeParam,
  type EnumVariantDecl,
  type StructField,
  type Block,
  type MatchArm,
  type StringSegment,
  type SourceLocation,
  type TraitDecl as TraitDeclAst,
  type ImplBlock as ImplBlockAst,
  SOURCE_LOCATION_ZERO,
} from "../ast/ast";
import {
  type Type,
  T_INT, T_FLOAT, T_BOOL, T_STRING, T_CHAR, T_UNIT, T_NEVER,
  type TFunc, type TArray, type TTuple, type TMap, type TOption, type TResult,
  type TNamed, type TStruct, type TEnum,
  typeEq, typeToString, isSubtype, unify, applySubst, freshTypeVar,
  optionOf, resultOf, arrayOf, funcType, tupleOf, resetTypeVarCounter,
  type Subst, UnifyError,
} from "../types/types";
import {
  TraitRegistry,
  type TraitDecl as TraitDeclSema,
  type ImplBlock as ImplBlockSema,
  type TraitMethod,
  type ImplMethod,
  typeKey,
  typeMentionsSelf,
  mangledImplFn,
  matchImplType,
} from "../traits/traits";

export interface TypeError {
  message: string;
  loc: SourceLocation;
}

export interface SemaWarning {
  message: string;
  loc: SourceLocation;
}

export interface CheckResult {
  errors: TypeError[];
  warnings: SemaWarning[];
  types: Map<Expr, Type>;
}

//----------------------------------------------------------------------------
// Scope
//----------------------------------------------------------------------------
interface VarInfo {
  type: Type;
  mutable: boolean;
  loc: SourceLocation;
  kind: "let" | "mut" | "const" | "param";
}

interface Scope {
  vars: Map<string, VarInfo>;
}

//----------------------------------------------------------------------------
// Type declarations
//----------------------------------------------------------------------------
interface TypeDeclInfo {
  kind: "struct" | "enum" | "alias";
  name: string;
  generics: TypeParam[];
  decl: StructDecl | EnumDecl | TypeAlias;
  struct?: TStruct;
  enumT?: TEnum;
}

//----------------------------------------------------------------------------
// Checker
//----------------------------------------------------------------------------
export class Checker {
  errors: TypeError[] = [];
  warnings: SemaWarning[] = [];
  scopes: Scope[] = [];
  typeDecls: Map<string, TypeDeclInfo> = [];
  nodeTypes: Map<Expr, Type> = new Map();
  // The expected return type of the function currently being checked.
  currentRetType: Type | null = null;
  // Currently in a loop?
  inLoop = false;
  // v3: trait registry — populated during predeclare/check from TraitDecl/
  // ImplBlock AST nodes. Used to resolve trait method calls, check
  // coherence, verify trait bounds, and validate `dyn Trait` object safety.
  traits: TraitRegistry = new TraitRegistry();
  // v3: synthesized impl blocks from `#[derive(...)]` — appended to the
  // program body after predeclare so they're processed like user-written
  // impls. The eval/VM reads them too (via the same registry-driven
  // mechanism for trait method dispatch).
  synthesizedImpls: ImplBlockAst[] = [];

  check(program: Program): CheckResult {
    resetTypeVarCounter();
    // First pass: collect type declarations and function signatures
    this.predeclare(program.body);
    // v3: register traits + impls before type-checking bodies so method
    // calls can resolve.
    this.registerTraits(program.body);
    this.registerImpls(program.body);
    // Append synthesized impl blocks (from #[derive(...)]) and register them.
    for (const syn of this.synthesizedImpls) {
      this.registerOneImpl(syn);
    }
    // v3: now that the trait registry is fully populated, register the
    // mangled method names as global fns so direct calls resolve.
    this.registerMangledImplFns();
    // Surface coherence errors as type errors.
    for (const e of this.traits.coherenceErrors) {
      this.err(e.message, SOURCE_LOCATION_ZERO);
    }
    // Second pass: check function bodies and statements
    this.pushScope();
    for (const s of program.body) {
      this.checkStmt(s);
    }
    // Check synthesized impl method bodies too.
    for (const syn of this.synthesizedImpls) {
      this.checkImplBlock(syn);
    }
    this.popScope();
    // v3: attach synthesized impls to the program AST so the eval/VM can
    // pick them up when they run (they read trait/impl blocks from the
    // program body + `(program as any).__synthImpls`).
    (program as any).__synthImpls = this.synthesizedImpls;
    return { errors: this.errors, warnings: this.warnings, types: this.nodeTypes };
  }

  // ------------------------------------------------------------------------
  // Predeclaration: register all types and functions so they can be used
  // before their definition in the source.
  // ------------------------------------------------------------------------
  predeclare(body: Stmt[]): void {
    // Built-in functions are registered first so that user code can shadow
    // them by declaring a function with the same name (the user's FnDecl is
    // also added by `addGlobalVar` below, which is a no-op if the name is
    // already present, and then `checkFnDecl` re-adds the user's signature
    // to the inner scope where it shadows the builtin at lookup time).
    this.predeclareBuiltins();
    for (const s of body) {
      if (s.kind === "StructDecl") this.registerStruct(s);
      else if (s.kind === "EnumDecl") this.registerEnum(s);
      else if (s.kind === "TypeAlias") this.registerAlias(s);
    }
    // v3: synthesize `#[derive(...)]` impls now — after types are registered
    // (so the synthesized bodies can refer to them) but before trait/impl
    // registration.
    for (const s of body) {
      if (s.kind === "StructDecl" || s.kind === "EnumDecl") {
        const d: any = s;
        if (d.derive && d.derive.length > 0) {
          this.synthesizeDerive(d);
        }
      }
    }
    for (const s of body) {
      if (s.kind === "FnDecl") {
        const fnType = this.makeFnType(s);
        this.addGlobalVar(s.name, fnType, false, s.loc);
        (s as any).__fnType = fnType;
        // v3: side table mapping fn name → FnDecl AST node, used by
        // `inferCall` to look up generic trait-bounds (`<T: Ord>`).
        if (!(this as any).__fnDecls) (this as any).__fnDecls = new Map<string, FnDecl>();
        (this as any).__fnDecls.set(s.name, s);
      }
    }
  }

  /**
   * v3: For every impl block (user-written + synthesized), register the
   * mangled method name (`__impl_<Trait>_<Type>_<method>`) as a global
   * function with the appropriate method signature. The signature uses
   * `Self` as the receiver type for non-generic impls, which the type-
   * checker treats as the concrete impl type.
   */
  private registerMangledImplFns(): void {
    for (const impl of this.traits.getAllTraitImpls()) {
      for (const m of impl.methods) {
        const mangled = mangledImplFn(impl.traitName, impl.implType, m.name);
        const fnType: TFunc = {
          kind: "Func",
          params: m.params.map(p => p.type),
          ret: m.retType,
        };
        this.addGlobalVar(mangled, fnType, false, SOURCE_LOCATION_ZERO);
      }
    }
  }

  /**
   * v3: synthesize impl blocks for `#[derive(Show, Eq, Default)]` on the
   * given struct/enum. The synthesized impls delegate to `display`/`valueEq`
   * at runtime via small Aether source snippets compiled by the eval.
   *
   * The synthesized impls are stored in `synthesizedImpls` and registered
   * into the trait registry like user-written ones. The eval reads them
   * from the AST (via `program.body` augmented with these) — actually,
   * to keep the eval simple, the eval looks up trait method closures by
   * walking `program.body` and any `synthesizedImpls` attached to the
   * Checker. We attach them to the program via `(program as any).__synthImpls`.
   */
  private synthesizeDerive(decl: StructDecl | EnumDecl): void {
    for (const traitName of decl.derive ?? []) {
      const implType: TypeNode = { kind: "NamedType", loc: decl.loc, name: decl.name };
      let methods: any[] = [];
      let assocTypes: any[] = [];
      if (traitName === "Show") {
        // `fn show(self) -> string { str(self) }`
        methods = [{
          kind: "ImplMethodDecl",
          loc: decl.loc,
          name: "show",
          params: [{ name: "self", loc: decl.loc }],
          ret: { kind: "PrimitiveType", loc: decl.loc, name: "string" },
          body: {
            kind: "Block",
            loc: decl.loc,
            stmts: [],
            expr: { kind: "Call", loc: decl.loc, callee: { kind: "Ident", loc: decl.loc, name: "str" }, args: [{ kind: "SelfExpr", loc: decl.loc }] },
          },
        }];
      } else if (traitName === "Eq") {
        // `fn eq(self, other: Self) -> bool { self == other }`
        methods = [{
          kind: "ImplMethodDecl",
          loc: decl.loc,
          name: "eq",
          params: [
            { name: "self", loc: decl.loc },
            { name: "other", type: { kind: "NamedType", loc: decl.loc, name: decl.name }, loc: decl.loc },
          ],
          ret: { kind: "PrimitiveType", loc: decl.loc, name: "bool" },
          body: {
            kind: "Block",
            loc: decl.loc,
            stmts: [],
            expr: {
              kind: "Binary",
              loc: decl.loc,
              op: "==",
              left: { kind: "SelfExpr", loc: decl.loc },
              right: { kind: "Ident", loc: decl.loc, name: "other" },
            },
          },
        }];
      } else if (traitName === "Default") {
        // `fn default() -> Self { <Name> {} }` — for structs, all fields default to 0/""/[]; for enums, first unit variant.
        const body: any = decl.kind === "StructDecl"
          ? { kind: "StructExpr", loc: decl.loc, name: decl.name, fields: [], spread: null }
          : { kind: "EnumVariant", loc: decl.loc, enumName: decl.name, variant: (decl as EnumDecl).variants[0]?.name ?? "_", args: [] };
        methods = [{
          kind: "ImplMethodDecl",
          loc: decl.loc,
          name: "default",
          params: [],
          ret: { kind: "NamedType", loc: decl.loc, name: decl.name },
          body: { kind: "Block", loc: decl.loc, stmts: [], expr: body },
        }];
      } else {
        // Unsupported derive — record a warning, don't synthesize.
        this.warn(`#[derive(${traitName})] is not supported in v1 (skipped)`, decl.loc);
        continue;
      }
      const impl: ImplBlockAst = {
        kind: "ImplBlock",
        loc: decl.loc,
        traitName,
        implType,
        typeParams: [],
        methods,
        assocTypes,
        synthesized: true,
      };
      this.synthesizedImpls.push(impl);
    }
  }

  /**
   * v3: register all `trait` declarations in the trait registry.
   */
  private registerTraits(body: Stmt[]): void {
    for (const s of body) {
      if (s.kind === "TraitDecl") this.registerOneTrait(s);
    }
  }

  private registerOneTrait(s: TraitDeclAst): void {
    const traitDecl: TraitDeclSema = {
      name: s.name,
      typeParams: s.typeParams.map(tp => tp.name),
      superTraits: s.superTraits,
      methods: s.methods.map(m => this.canonicalizeTraitMethod(m)),
      assocTypes: s.assocTypes.map(at => ({ name: at.name, bound: at.bound })),
      ast: s,
    };
    this.traits.declareTrait(traitDecl);
  }

  /**
   * Convert a `TraitMethodDecl` AST node into a `TraitMethod` sema record.
   * Computes `selfInArgs`/`selfInRet` for the object-safety check.
   */
  private canonicalizeTraitMethod(m: any): TraitMethod {
    const generics: Record<string, Type> = {};
    for (const g of m.params) {
      if (g.type && g.type.kind === "NamedType" && g.type.name === "Self") {
        // Self type — keep as Named "Self".
      }
    }
    const params = m.params.map((p: Param) => ({
      name: p.name,
      type: p.type ? this.resolveTypeWith(p.type, generics) : T_UNIT,
    }));
    const retType = m.ret ? this.resolveTypeWith(m.ret, generics) : T_UNIT;
    return {
      name: m.name,
      params,
      retType,
      hasDefault: m.hasDefault,
      defaultBody: m.hasDefault && m.body ? "[default]" : undefined,
      selfInArgs: params.some(p => typeMentionsSelf(p.type)),
      selfInRet: typeMentionsSelf(retType),
    };
  }

  /**
   * v3: register all `impl` blocks (user-written) into the trait registry.
   */
  private registerImpls(body: Stmt[]): void {
    for (const s of body) {
      if (s.kind === "ImplBlock") this.registerOneImpl(s);
    }
  }

  private registerOneImpl(s: ImplBlockAst): void {
    const generics: Record<string, Type> = {};
    for (const g of s.typeParams) generics[g.name] = { kind: "Generic", name: g.name, constraint: g.constraint };
    const implType = this.resolveTypeWith(s.implType, generics);
    const methods: ImplMethod[] = s.methods.map(m => ({
      name: m.name,
      params: m.params.map(p => ({
        name: p.name,
        type: this.resolveImplParamType(p, implType, generics),
      })),
      retType: m.ret ? this.resolveTypeWith(m.ret, generics) : T_UNIT,
      body: m.body,
      paramAST: m.params,
      retAST: m.ret,
    }));
    // v3: synthesize impl methods for default trait methods the impl doesn't
    // override. The synthesized method uses the trait's default body, with
    // Self substituted to the impl type (so inner trait method calls get
    // resolved against this impl). The AST node is appended to `s.methods`
    // so the eval sees it when registering impl closures.
    const trait = this.traits.getTrait(s.traitName);
    if (trait && trait.ast) {
      const traitAST = trait.ast as any;
      const traitMethodsAST: any[] = traitAST.methods ?? [];
      for (const tm of trait.methods) {
        if (!tm.hasDefault) continue;
        if (methods.find(m => m.name === tm.name)) continue;
        const mDecl = traitMethodsAST.find((m: any) => m.name === tm.name);
        if (!mDecl || !mDecl.body) continue;
        // Synthesize an ImplMethodDecl AST node using the default body.
        const synMethod: any = {
          kind: "ImplMethodDecl",
          loc: mDecl.loc ?? s.loc,
          name: mDecl.name,
          params: mDecl.params ?? [],
          ret: mDecl.ret,
          body: mDecl.body,
          __synthesizedFromDefault: true,
        };
        s.methods.push(synMethod);
        methods.push({
          name: mDecl.name,
          params: (mDecl.params ?? []).map((p: any) => ({
            name: p.name,
            type: this.resolveImplParamType(p, implType, generics),
          })),
          retType: mDecl.ret ? this.resolveTypeWith(mDecl.ret, generics) : T_UNIT,
          body: mDecl.body,
          paramAST: mDecl.params ?? [],
          retAST: mDecl.ret,
        });
      }
    }
    const implBlock: ImplBlockSema = {
      traitName: s.traitName,
      implType,
      typeParams: s.typeParams.map(tp => tp.name),
      typeParamBounds: s.typeParams.map(tp => tp.constraint),
      methods,
      assocTypes: s.assocTypes.map(at => ({ name: at.name, type: this.resolveTypeWith(at.type, generics) })),
      implTypeName: typeKey(implType),
      ast: s,
      synthesized: s.synthesized,
    };
    this.traits.declareImpl(implBlock);
  }

  /**
   * v3: resolve an impl method's parameter type. If the parameter is
   * `self` and has no annotation, default its type to the impl's `implType`.
   * If the annotation uses `Self`, substitute the impl type.
   */
  private resolveImplParamType(p: Param, implType: Type, generics: Record<string, Type>): Type {
    if (!p.type) {
      // `self` with no annotation → impl type.
      if (p.name === "self") return implType;
      return T_UNIT;
    }
    if (p.type.kind === "NamedType" && p.type.name === "Self") {
      return implType;
    }
    const resolved = this.resolveTypeWith(p.type, generics);
    // Replace any `Self` inside the resolved type with `implType`.
    return substituteSelf(resolved, implType);
  }

  /** v3: type-check an impl block's method bodies. */
  private checkImplBlock(s: ImplBlockAst): void {
    const generics: Record<string, Type> = {};
    for (const g of s.typeParams) generics[g.name] = { kind: "Generic", name: g.name, constraint: g.constraint };
    const implType = this.resolveTypeWith(s.implType, generics);
    for (const m of s.methods) {
      const paramTypes = m.params.map(p => this.resolveImplParamType(p, implType, generics));
      const retType = m.ret ? this.resolveTypeWith(m.ret, generics) : T_UNIT;
      this.pushScope();
      const prevRet = this.currentRetType;
      this.currentRetType = retType;
      for (let i = 0; i < m.params.length; i++) {
        const p = m.params[i];
        this.addVar(p.name, paramTypes[i], false, p.loc, "param");
      }
      this.checkBlockExprType(m.body, retType);
      this.currentRetType = prevRet;
      this.popScope();
    }
  }

  /**
   * Register built-in functions (the inline evaluator builtins plus the
   * higher-order array combinators). Each signature uses `Generic`
   * placeholders for type parameters; `instantiate` in `inferCall` replaces
   * these with fresh TypeVars at every call site so each call gets its own
   * inference variables.
   */
  predeclareBuiltins(): void {
    const reg = (name: string, t: TFunc): void => {
      this.addGlobalVar(name, t, false, SOURCE_LOCATION_ZERO);
    };
    const T = (): Type => ({ kind: "Generic", name: "T" });
    const U = (): Type => ({ kind: "Generic", name: "U" });
    const arr = (e: Type): TArray => ({ kind: "Array", elem: e });
    const fn = (params: Type[], ret: Type): TFunc => ({ kind: "Func", params, ret });
    const anyT = (): Type => freshTypeVar("A");

    // Higher-order array combinators — polymorphic over element type.
    reg("map", fn([arr(T()), fn([T()], U())], arr(U())));
    reg("filter", fn([arr(T()), fn([T()], T_BOOL)], arr(T())));
    reg("reduce", fn([arr(T()), fn([U(), T()], U()), U()], U()));
    reg("push", fn([arr(T()), T()], arr(T())));
    reg("pop", fn([arr(T())], T()));

    // Common builtins accepting any value.
    reg("len", fn([anyT()], T_INT));
    reg("println", fn([anyT()], T_UNIT));
    reg("panic", fn([anyT()], T_NEVER));
    reg("str", fn([anyT()], T_STRING));
    reg("int", fn([anyT()], T_INT));
    reg("float", fn([anyT()], T_FLOAT));
    reg("type_of", fn([anyT()], T_STRING));
    reg("assert", fn([T_BOOL], T_UNIT));
    reg("assert_eq", fn([anyT(), anyT()], T_UNIT));

    // Numeric helpers — int overloads; the evaluator widens int->float at
    // runtime when needed. Using `int` here is sufficient for the typical
    // call patterns the type-checker sees.
    reg("min", fn([T_INT, T_INT], T_INT));
    reg("max", fn([T_INT, T_INT], T_INT));
    reg("abs", fn([T_INT], T_INT));
    reg("sqrt", fn([T_FLOAT], T_FLOAT));

    // `range` is variadic in the evaluator (1, 2, or 3 int args). The type
    // checker registers the 3-arg form; calls with fewer args may produce
    // a type error, but the evaluator still runs (lenient mode).
    reg("range", fn([T_INT, T_INT, T_INT], { kind: "Named", name: "Range", args: [] }));

    // String primitive helpers — used by the Aether-in-Aether bootstrap lexer
    // (aether-bootstrap/lexer.ae). These mirror the inline evaluator builtins
    // of the same name (see aether/core/eval/eval.ts `installInlineBuiltins`).
    reg("charCode", fn([T_STRING, T_INT], T_INT));
    reg("fromCharCode", fn([T_INT], T_STRING));
    reg("strSlice", fn([T_STRING, T_INT, T_INT], T_STRING));
  }

  registerStruct(d: StructDecl): void {
    const generics: Record<string, Type> = {};
    for (const g of d.generics) generics[g.name] = { kind: "Generic", name: g.name, constraint: g.constraint };
    const fields = d.fields.map(f => ({ name: f.name, type: this.resolveTypeWith(f.type, generics) }));
    const structT: TStruct = { kind: "Struct", name: d.name, fields };
    this.typeDecls.push({ kind: "struct", name: d.name, generics: d.generics, decl: d, struct: structT });
  }

  registerEnum(d: EnumDecl): void {
    const generics: Record<string, Type> = {};
    for (const g of d.generics) generics[g.name] = { kind: "Generic", name: g.name, constraint: g.constraint };
    const variants = d.variants.map(v => ({
      name: v.name,
      kind: v.kind,
      types: v.types?.map(t => this.resolveTypeWith(t, generics)),
      fields: v.fields?.map(f => ({ name: f.name, type: this.resolveTypeWith(f.type, generics) })),
    }));
    const enumT: TEnum = { kind: "Enum", name: d.name, generics: d.generics.map(g => g.name), variants };
    this.typeDecls.push({ kind: "enum", name: d.name, generics: d.generics, decl: d, enumT });
  }

  registerAlias(d: TypeAlias): void {
    this.typeDecls.push({ kind: "alias", name: d.name, generics: d.generics, decl: d });
  }

  findTypeDecl(name: string): TypeDeclInfo | undefined {
    return this.typeDecls.find(t => t.name === name);
  }

  makeFnType(d: FnDecl): TFunc {
    const generics: Record<string, Type> = {};
    for (const g of d.generics) generics[g.name] = { kind: "Generic", name: g.name, constraint: g.constraint };
    const params = d.params.map(p => p.type ? this.resolveTypeWith(p.type, generics) : { kind: "Generic", name: "P" });
    const ret = d.ret ? this.resolveTypeWith(d.ret, generics) : { kind: "Generic", name: "R" };
    return { kind: "Func", params, ret };
  }

  // ------------------------------------------------------------------------
  // Scope management
  // ------------------------------------------------------------------------
  pushScope(): void { this.scopes.push({ vars: new Map() }); }
  popScope(): void { this.scopes.pop(); }

  addVar(name: string, type: Type, mutable: boolean, loc: SourceLocation, kind: VarInfo["kind"]): void {
    // Check for redeclaration in the current scope
    const current = this.scopes[this.scopes.length - 1];
    if (current.vars.has(name)) {
      this.warn(`shadowing of '${name}'`, loc);
    }
    current.vars.set(name, { type, mutable, loc, kind });
  }
  addGlobalVar(name: string, type: Type, mutable: boolean, loc: SourceLocation): void {
    if (this.scopes.length === 0) this.pushScope();
    const scope = this.scopes[0];
    if (!scope.vars.has(name)) {
      scope.vars.set(name, { type, mutable, loc, kind: "let" });
    }
  }

  lookupVar(name: string): VarInfo | undefined {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const v = this.scopes[i].vars.get(name);
      if (v) return v;
    }
    return undefined;
  }

  // ------------------------------------------------------------------------
  // Errors
  // ------------------------------------------------------------------------
  err(message: string, loc: SourceLocation): void {
    this.errors.push({ message, loc });
  }
  warn(message: string, loc: SourceLocation): void {
    this.warnings.push({ message, loc });
  }
  setType(e: Expr, t: Type): void {
    this.nodeTypes.set(e, t);
  }
  getType(e: Expr): Type | undefined {
    return this.nodeTypes.get(e);
  }

  // ------------------------------------------------------------------------
  // Type resolution (AST type → semantic type)
  // ------------------------------------------------------------------------
  resolveType(t: TypeNode): Type {
    return this.resolveTypeWith(t, {});
  }

  resolveTypeWith(t: TypeNode, generics: Record<string, Type>): Type {
    switch (t.kind) {
      case "PrimitiveType":
        switch (t.name) {
          case "int": return T_INT;
          case "float": return T_FLOAT;
          case "bool": return T_BOOL;
          case "string": return T_STRING;
          case "char": return T_CHAR;
          default: this.err(`unknown primitive type '${t.name}'`, t.loc); return T_UNIT;
        }
      case "UnitType": return T_UNIT;
      case "NamedType": {
        if (generics[t.name]) return generics[t.name];
        const decl = this.findTypeDecl(t.name);
        if (decl) {
          if (decl.kind === "struct" && decl.struct) return { kind: "Named", name: t.name, args: [] };
          if (decl.kind === "enum") return { kind: "Named", name: t.name, args: [] };
          if (decl.kind === "alias") return this.resolveTypeWith((decl.decl as TypeAlias).type, generics);
        }
        // Unknown name: treat as opaque named type
        return { kind: "Named", name: t.name, args: [] };
      }
      case "GenericType": {
        if (generics[t.name]) return generics[t.name];
        const decl = this.findTypeDecl(t.name);
        // Recognize `Option<T>` and `Result<T, E>` sugar by name
        if (t.name === "Option" || t.name === "option") {
          return optionOf(this.resolveTypeWith(t.args[0], generics));
        }
        if (t.name === "Result" || t.name === "result") {
          return resultOf(this.resolveTypeWith(t.args[0], generics), this.resolveTypeWith(t.args[1], generics));
        }
        if (decl) {
          return { kind: "Named", name: t.name, args: t.args.map(a => this.resolveTypeWith(a, generics)) };
        }
        return { kind: "Named", name: t.name, args: t.args.map(a => this.resolveTypeWith(a, generics)) };
      }
      case "FuncType":
        return { kind: "Func", params: t.params.map(p => this.resolveTypeWith(p, generics)), ret: this.resolveTypeWith(t.ret, generics) };
      case "TupleType":
        return { kind: "Tuple", items: t.types.map(p => this.resolveTypeWith(p, generics)) };
      case "ArrayType":
        return { kind: "Array", elem: this.resolveTypeWith(t.elem, generics) };
      case "MapType":
        return { kind: "Map", key: this.resolveTypeWith(t.key, generics), value: this.resolveTypeWith(t.value, generics) };
      case "OptionType":
        return { kind: "Option", inner: this.resolveTypeWith(t.inner, generics) };
      case "ResultType":
        return { kind: "Result", ok: this.resolveTypeWith(t.ok, generics), err: this.resolveTypeWith(t.err, generics) };
      case "DynType": {
        // `dyn TraitName` — modelled as a Named type carrying the trait
        // name in `args`. The eval reads the `__dyn` marker from the value.
        // Object-safety is verified in `checkLet` / annotation contexts.
        if (!this.traits.isTraitObjectSafe(t.traitName)) {
          this.err(`trait '${t.traitName}' is not object-safe (cannot form dyn ${t.traitName})`, t.loc);
        }
        return { kind: "Named", name: `dyn ${t.traitName}`, args: [] };
      }
    }
  }

  // ------------------------------------------------------------------------
  // Statements
  // ------------------------------------------------------------------------
  checkStmt(s: Stmt): void {
    switch (s.kind) {
      case "Let":
      case "MutLet":
      case "Const": this.checkLet(s); return;
      case "FnDecl": this.checkFnDecl(s); return;
      case "EnumDecl":
      case "StructDecl":
      case "TypeAlias":
      case "Import":
      case "TraitDecl": return; // already predeclared / registered
      case "ImplBlock": this.checkImplBlock(s as ImplBlockAst); return; // check method bodies
      case "Return": this.checkReturn(s); return;
      case "Break":
      case "Continue":
        if (!this.inLoop) this.err(`'${s.kind.toLowerCase()}' outside of a loop`, s.loc);
        return;
      case "While": this.checkWhile(s); return;
      case "ForIn": this.checkForIn(s); return;
      case "Print": { this.infer(s.expr); return; }
      case "AssignStmt": this.checkAssignStmt(s); return;
      case "ExprStmt": this.infer(s.expr); return;
      case "BlockStmt": {
        this.pushScope();
        for (const st of s.body) this.checkStmt(st);
        this.popScope();
        return;
      }
    }
  }

  checkLet(s: Let | any): void {
    const mut = s.kind === "MutLet";
    const initType = this.infer(s.init);
    let type: Type;
    if (s.type) {
      const expected = this.resolveType(s.type);
      // Numeric widening: int literal coerces to float context.
      if (!this.checkAssignable(initType, expected)) {
        this.err(`expected ${typeToString(expected)}, found ${typeToString(initType)}`, s.init.loc);
      }
      type = expected;
    } else {
      type = initType;
    }
    this.addVar(s.name, type, mut, s.loc, mut ? "mut" : (s.kind === "Const" ? "const" : "let"));
  }

  checkFnDecl(s: FnDecl): void {
    const generics: Record<string, Type> = {};
    for (const g of s.generics) generics[g.name] = { kind: "Generic", name: g.name, constraint: g.constraint };
    // add to current scope so the function can refer to itself (recursion)
    const params = s.params.map(p => p.type ? this.resolveTypeWith(p.type, generics) : freshTypeVar("P"));
    const ret = s.ret ? this.resolveTypeWith(s.ret, generics) : freshTypeVar("R");
    const fnType: TFunc = { kind: "Func", params, ret };
    this.addVar(s.name, fnType, false, s.loc, "let");

    this.pushScope();
    const prevRet = this.currentRetType;
    this.currentRetType = ret;
    for (let i = 0; i < s.params.length; i++) {
      const p = s.params[i];
      this.addVar(p.name, params[i], p.name === "self" ? false : false, p.loc, "param");
    }
    // check body
    this.checkBlockExprType(s.body, ret);
    this.currentRetType = prevRet;
    this.popScope();
  }

  checkReturn(s: { kind: "Return"; expr?: Expr | null; loc: SourceLocation }): void {
    if (this.currentRetType === null) {
      this.err("'return' outside of a function", s.loc);
      return;
    }
    if (s.expr) {
      const t = this.infer(s.expr);
      if (!this.checkAssignable(t, this.currentRetType)) {
        this.err(`expected return type ${typeToString(this.currentRetType)}, found ${typeToString(t)}`, s.loc);
      }
    } else {
      if (!this.checkAssignable(T_UNIT, this.currentRetType)) {
        this.err(`expected return type ${typeToString(this.currentRetType)}, found ()`, s.loc);
      }
    }
  }

  checkWhile(s: { kind: "While"; cond: Expr; body: Block; loc: SourceLocation }): void {
    const ct = this.infer(s.cond);
    if (!this.checkAssignable(ct, T_BOOL)) {
      this.err(`while condition must be bool, found ${typeToString(ct)}`, s.cond.loc);
    }
    this.pushScope();
    const wasInLoop = this.inLoop;
    this.inLoop = true;
    for (const st of s.body.stmts) this.checkStmt(st);
    if (s.body.expr) this.infer(s.body.expr);
    this.inLoop = wasInLoop;
    this.popScope();
  }

  checkForIn(s: { kind: "ForIn"; varName: string; iterable: Expr; body: Block; loc: SourceLocation }): void {
    const it = this.infer(s.iterable);
    let elem: Type;
    if (it.kind === "Array") elem = it.elem;
    else if (it.kind === "Tuple") elem = it.items[0] ?? T_UNIT;
    else if (it.kind === "Named" && it.name === "Range") elem = T_INT;
    else if (typeEq(it, T_STRING)) elem = T_CHAR;
    else if (it.kind === "Map") elem = { kind: "Tuple", items: [it.key, it.value] };
    else {
      this.err(`cannot iterate over ${typeToString(it)}`, s.iterable.loc);
      elem = T_UNIT;
    }
    this.pushScope();
    const wasInLoop = this.inLoop;
    this.inLoop = true;
    this.addVar(s.varName, elem, true, s.loc, "let");
    for (const st of s.body.stmts) this.checkStmt(st);
    if (s.body.expr) this.infer(s.body.expr);
    this.inLoop = wasInLoop;
    this.popScope();
  }

  checkAssignStmt(s: { kind: "AssignStmt"; target: Expr; value: Expr; loc: SourceLocation }): void {
    // target must be mutable (or be a field/index of a mutable)
    const target = s.target;
    let base: Expr | null = target;
    while (base && (base.kind === "Field" || base.kind === "Index" || base.kind === "TupleField")) {
      base = (base as any).object;
    }
    if (base && base.kind === "Ident") {
      const info = this.lookupVar(base.name);
      if (!info) {
        this.err(`undefined name '${base.name}'`, base.loc);
      } else if (!info.mutable && info.kind !== "param") {
        // params can't be reassigned either, but the test only checks let
        if (info.kind !== "param") this.err(`cannot assign to immutable variable '${base.name}'`, s.loc);
      }
    }
    const tt = this.infer(target);
    const vt = this.infer(s.value);
    if (!this.checkAssignable(vt, tt)) {
      this.err(`cannot assign ${typeToString(vt)} to ${typeToString(tt)}`, s.loc);
    }
  }

  checkBlockExprType(b: Block, expected: Type): void {
    this.pushScope();
    for (const s of b.stmts) this.checkStmt(s);
    if (b.expr) {
      const t = this.infer(b.expr);
      // Direction: unify the body type `t` with the declared `expected`.
      // The widening rule in `unify` allows int -> float but not float -> int,
      // so this direction correctly rejects e.g. `fn f() -> int { 1.0 }`
      // (float doesn't fit into an int slot) while accepting `fn f() -> float { 1 }`
      // (int widens to float). TypeVars in `t` (e.g. a fresh `E` from a
      // `Result::Ok(42)` variant whose error type wasn't yet determined) get
      // bound to the corresponding position in `expected` here.
      const subst = new Map<string, Type>();
      try {
        unify(t, expected, subst);
      } catch (e) {
        if (e instanceof UnifyError) {
          this.err(`expected ${typeToString(expected)}, found ${typeToString(t)}`, b.expr.loc);
        }
      }
    } else {
      // block has no trailing expr — return type should be unit (or any)
      if (!this.checkAssignable(T_UNIT, expected) && expected.kind !== "TypeVar") {
        // Warn (not error) for v1: many fns legitimately return unit
        // this.err(`function body should return ${typeToString(expected)}, found ()`, b.loc);
      }
    }
    this.popScope();
  }

  // ------------------------------------------------------------------------
  // Expression inference
  // ------------------------------------------------------------------------
  infer(e: Expr): Type {
    switch (e.kind) {
      case "IntLit": { this.setType(e, T_INT); return T_INT; }
      case "FloatLit": { this.setType(e, T_FLOAT); return T_FLOAT; }
      case "BoolLit": { this.setType(e, T_BOOL); return T_BOOL; }
      case "StringLit": { this.setType(e, T_STRING); return T_STRING; }
      case "CharLit": { this.setType(e, T_CHAR); return T_CHAR; }
      case "UnitLit": { this.setType(e, T_UNIT); return T_UNIT; }
      case "SelfExpr": {
        const info = this.lookupVar("self");
        if (info) { this.setType(e, info.type); return info.type; }
        this.err(`'self' used outside of method`, e.loc);
        this.setType(e, T_UNIT); return T_UNIT;
      }
      case "Ident": {
        const info = this.lookupVar(e.name);
        if (!info) {
          this.err(`undefined name '${e.name}'`, e.loc);
          this.setType(e, T_UNIT);
          return T_UNIT;
        }
        this.setType(e, info.type);
        return info.type;
      }
      case "Paren": {
        const t = this.infer(e.expr);
        this.setType(e, t);
        return t;
      }
      case "Binary": return this.inferBinary(e);
      case "Unary": return this.inferUnary(e);
      case "Assign":
      case "CompoundAssign": {
        // assignment expressions
        this.checkAssignStmt({ kind: "AssignStmt", target: (e as any).target, value: (e as any).value, loc: e.loc });
        this.setType(e, T_UNIT);
        return T_UNIT;
      }
      case "Call": return this.inferCall(e);
      case "MethodCall": return this.inferMethodCall(e);
      case "Index": return this.inferIndex(e);
      case "Field": return this.inferField(e);
      case "TupleField": return this.inferTupleField(e);
      case "TupleExpr": {
        const items = e.elements.map(el => this.infer(el));
        const t = tupleOf(items);
        this.setType(e, t);
        return t;
      }
      case "ArrayExpr": {
        if (e.elements.length === 0) {
          const t = arrayOf(freshTypeVar("E"));
          this.setType(e, t);
          return t;
        }
        let elem = this.infer(e.elements[0]);
        for (let i = 1; i < e.elements.length; i++) {
          const t = this.infer(e.elements[i]);
          elem = this.commonType(elem, t) ?? elem;
        }
        const t = arrayOf(elem);
        this.setType(e, t);
        return t;
      }
      case "MapExpr": {
        if (e.entries.length === 0) {
          const t: TMap = { kind: "Map", key: freshTypeVar("K"), value: freshTypeVar("V") };
          this.setType(e, t);
          return t;
        }
        let k = this.infer(e.entries[0].key);
        let v = this.infer(e.entries[0].value);
        for (let i = 1; i < e.entries.length; i++) {
          k = this.commonType(k, this.infer(e.entries[i].key)) ?? k;
          v = this.commonType(v, this.infer(e.entries[i].value)) ?? v;
        }
        const t: TMap = { kind: "Map", key: k, value: v };
        this.setType(e, t);
        return t;
      }
      case "StructExpr": return this.inferStructExpr(e);
      case "EnumVariant": return this.inferEnumVariant(e);
      case "Lambda": return this.inferLambda(e);
      case "If": return this.inferIf(e);
      case "Match": return this.inferMatch(e);
      case "Block": return this.inferBlock(e);
      case "As": return this.inferAs(e);
      case "Cast": return this.inferAs(e);
      case "Range": {
        // For v1: ranges are typed as Array<int>. The eval treats them
        // specially for for-in loops.
        const start = this.infer(e.start);
        const end = this.infer(e.end);
        if (!this.checkAssignable(start, T_INT) && !this.checkAssignable(start, T_FLOAT)) {
          this.err(`range bounds must be numeric, found ${typeToString(start)}`, e.start.loc);
        }
        void end;
        const t: TNamed = { kind: "Named", name: "Range", args: [start] };
        this.setType(e, t);
        return t;
      }
      case "ErrorProp": {
        const t = this.infer(e.expr);
        if (t.kind === "Result") {
          this.setType(e, t.ok);
          return t.ok;
        }
        if (t.kind === "Option") {
          this.setType(e, t.inner);
          return t.inner;
        }
        this.err(`? operator can only be applied to Result or Option, found ${typeToString(t)}`, e.loc);
        this.setType(e, T_UNIT);
        return T_UNIT;
      }
      case "Return": {
        if (e.expr) this.infer(e.expr);
        this.setType(e, T_NEVER);
        return T_NEVER;
      }
      case "Spread": {
        const t = this.infer(e.expr);
        this.setType(e, t);
        return t;
      }
      // v3-borrow (RFC-004): references and move are static-analysis-only.
      // Sema infers the operand's type and reports it as the expression's
      // type; the actual borrow rules are enforced by the standalone borrow
      // checker (`aether/core/borrow/borrow.ts`), which is opt-in.
      case "Borrow":
      case "Deref":
      case "Move": {
        const t = this.infer(e.operand);
        this.setType(e, t);
        return t;
      }
    }
  }

  inferBinary(e: Extract<Expr, { kind: "Binary" }>): Type {
    const lt = this.infer(e.left);
    const rt = this.infer(e.right);
    const op = e.op;
    if (op === "or") {
      // Python-style short-circuit: returns the value of the LHS if truthy,
      // else the RHS. The RHS may be a diverging `return` (type Never).
      // Result type is the common type of the two sides.
      const common = this.commonType(lt, rt) ?? lt;
      this.setType(e, common);
      return common;
    }
    if (op === "||" || op === "&&") {
      // Boolean ops. Right side may be Never (a `return`), so allow it.
      if (!this.checkAssignable(lt, T_BOOL) && lt.kind !== "Never") {
        this.err(`left of '${op}' must be bool, found ${typeToString(lt)}`, e.left.loc);
      }
      if (!this.checkAssignable(rt, T_BOOL) && rt.kind !== "Never") {
        this.err(`right of '${op}' must be bool, found ${typeToString(rt)}`, e.right.loc);
      }
      this.setType(e, T_BOOL);
      return T_BOOL;
    }
    if (op === "==" || op === "!=" || op === "<" || op === "<=" || op === ">" || op === ">=") {
      // Comparison: both sides same type, result bool
      if (!this.checkAssignable(rt, lt) && !this.checkAssignable(lt, rt)) {
        this.err(`cannot compare ${typeToString(lt)} with ${typeToString(rt)}`, e.loc);
      }
      this.setType(e, T_BOOL);
      return T_BOOL;
    }
    // Arithmetic and bitwise
    if (op === "+" || op === "-" || op === "*" || op === "/" || op === "%") {
      const result = this.arithResultType(lt, rt);
      if (!result) {
        this.err(`operator '${op}' not defined for ${typeToString(lt)} and ${typeToString(rt)}`, e.loc);
        this.setType(e, T_INT);
        return T_INT;
      }
      this.setType(e, result);
      return result;
    }
    if (op === "&" || op === "|" || op === "^" || op === "<<" || op === ">>") {
      if (!this.checkAssignable(lt, T_INT) || !this.checkAssignable(rt, T_INT)) {
        this.err(`bitwise '${op}' requires int operands, found ${typeToString(lt)} and ${typeToString(rt)}`, e.loc);
      }
      this.setType(e, T_INT);
      return T_INT;
    }
    this.err(`unknown binary operator '${op}'`, e.loc);
    this.setType(e, T_UNIT);
    return T_UNIT;
  }

  arithResultType(a: Type, b: Type): Type | null {
    // Both int → int
    if (a.kind === "Int" && b.kind === "Int") return T_INT;
    // Either float → float
    if (a.kind === "Float" && (b.kind === "Float" || b.kind === "Int")) return T_FLOAT;
    if (b.kind === "Float" && (a.kind === "Float" || a.kind === "Int")) return T_FLOAT;
    // String concat
    if (a.kind === "String" && b.kind === "String") return T_STRING;
    // TypeVar: return TypeVar (will be resolved later)
    if (a.kind === "TypeVar" || b.kind === "TypeVar") return a.kind === "TypeVar" ? b : a;
    return null;
  }

  inferUnary(e: Extract<Expr, { kind: "Unary" }>): Type {
    const t = this.infer(e.operand);
    const op = e.op;
    if (op === "!") {
      if (!this.checkAssignable(t, T_BOOL)) {
        this.err(`'!' requires bool, found ${typeToString(t)}`, e.loc);
      }
      this.setType(e, T_BOOL);
      return T_BOOL;
    }
    if (op === "-") {
      if (!this.checkAssignable(t, T_INT) && !this.checkAssignable(t, T_FLOAT)) {
        this.err(`unary '-' requires int or float, found ${typeToString(t)}`, e.loc);
      }
      this.setType(e, t);
      return t;
    }
    if (op === "~") {
      if (!this.checkAssignable(t, T_INT)) {
        this.err(`'~' requires int, found ${typeToString(t)}`, e.loc);
      }
      this.setType(e, T_INT);
      return T_INT;
    }
    this.err(`unknown unary operator '${op}'`, e.loc);
    this.setType(e, T_UNIT);
    return T_UNIT;
  }

  inferCall(e: Extract<Expr, { kind: "Call" }>): Type {
    // v3: `dyn TraitName(value)` is parsed as a Call to a synthetic
    // `__dyn_<TraitName>` Ident. Handle this specially: check the trait
    // exists and is object-safe, return a `dyn TraitName` type.
    if (e.callee.kind === "Ident" && e.callee.name.startsWith("__dyn_")) {
      const traitName = e.callee.name.slice("__dyn_".length);
      const trait = this.traits.getTrait(traitName);
      if (!trait) {
        this.err(`unknown trait '${traitName}' in dyn constructor`, e.callee.loc);
        this.setType(e, T_UNIT);
        return T_UNIT;
      }
      if (!this.traits.isTraitObjectSafe(traitName)) {
        this.err(
          `trait '${traitName}' is not object-safe (cannot form dyn ${traitName})`,
          e.loc,
        );
      }
      // Evaluate the wrapped argument (required).
      if (e.args.length < 1) {
        this.err(`dyn ${traitName} constructor requires 1 argument`, e.loc);
      } else {
        this.infer(e.args[0]);
      }
      const t: TNamed = { kind: "Named", name: `dyn ${traitName}`, args: [] };
      this.setType(e, t);
      return t;
    }
    const calleeT = this.infer(e.callee);
    if (calleeT.kind !== "Func") {
      this.err(`cannot call non-function of type ${typeToString(calleeT)}`, e.callee.loc);
      this.setType(e, T_UNIT);
      return T_UNIT;
    }
    // Instantiate the fn type: replace Generic placeholders with fresh
    // TypeVars so each call site gets its own inference variables.
    const { type: freshFn, genericMap } = instantiate(calleeT);
    const fn = freshFn as TFunc;

    // Bind explicit type args (e.g. id<int>(42)) to the corresponding fresh
    // TypeVars by position.
    const typeArgSubst = new Map<string, Type>();
    if (e.typeArgs && e.typeArgs.length > 0) {
      const genericNames = Array.from(genericMap.keys());
      for (let i = 0; i < Math.min(e.typeArgs.length, genericNames.length); i++) {
        const expected = this.resolveType(e.typeArgs[i]);
        const freshName = genericMap.get(genericNames[i]);
        if (freshName) typeArgSubst.set(freshName, expected);
      }
    }
    const boundFn = typeArgSubst.size > 0 ? (applySubst(fn, typeArgSubst) as TFunc) : fn;

    if (e.args.length !== boundFn.params.length) {
      this.err(`expected ${boundFn.params.length} arguments, found ${e.args.length}`, e.loc);
    }
    const subst = new Map<string, Type>();
    for (let i = 0; i < Math.min(e.args.length, boundFn.params.length); i++) {
      const argT = this.infer(e.args[i]);
      try {
        unify(boundFn.params[i], argT, subst);
      } catch (err) {
        if (err instanceof UnifyError) {
          this.err(`argument ${i + 1}: expected ${typeToString(applySubst(boundFn.params[i], subst))}, found ${typeToString(argT)}`, e.args[i].loc);
        }
      }
    }

    // v3: trait bound check. If the callee is a FnDecl with generic
    // parameters carrying trait constraints (`<T: Ord>`), verify that the
    // actual type substituted for each constrained T implements the
    // constraint trait in the registry.
    const callee = e.callee;
    if (callee.kind === "Ident") {
      const fnDecl = this.findFnDeclByName(callee.name);
      if (fnDecl && fnDecl.generics.length > 0) {
        // For each constrained generic, find the substituted concrete type
        // from `subst` (the fresh TypeVar name → concrete type binding from
        // argument inference).
        for (const tp of fnDecl.generics) {
          if (!tp.constraint) continue;
          // Find the fresh TypeVar name for this generic.
          const freshName = genericMap.get(tp.name);
          if (!freshName) continue;
          const concrete = subst.get(freshName) ?? typeArgSubst.get(freshName);
          if (!concrete) continue;
          // If the concrete type is itself a TypeVar (unresolved), skip
          // bound checking — likely the call's argument types were
          // inference variables that didn't get bound.
          if (concrete.kind === "TypeVar" || concrete.kind === "Generic") continue;
          if (!this.traits.typeImplementsTrait(concrete, tp.constraint)) {
            this.err(
              `trait bound not satisfied: ${tp.name}: ${tp.constraint} is required, ` +
              `but ${typeToString(concrete)} does not implement ${tp.constraint}`,
              e.loc,
            );
          }
        }
      }
    }

    const ret = applySubst(boundFn.ret, subst);
    this.setType(e, ret);
    return ret;
  }

  /** v3: find a top-level FnDecl by name (for trait bound checking). */
  private findFnDeclByName(name: string): FnDecl | null {
    // Search all enclosing scopes — top-level fns live in scope 0.
    for (const scope of this.scopes) {
      // We don't store the FnDecl in VarInfo, so we can't recover it
      // directly. Instead we keep a side map populated in `predeclare`.
    }
    return (this as any).__fnDecls?.get(name) ?? null;
  }

  inferMethodCall(e: Extract<Expr, { kind: "MethodCall" }>): Type {
    const objT = this.infer(e.object);
    // v3: try trait dispatch. If the receiver's type has a trait method
    // named `e.name` in the trait registry, resolve to the impl and
    // annotate the AST node with the (traitName, implTypeName, methodName)
    // triple for the evaluator.
    const recvType = this.resolveReceiverType(objT);
    if (recvType) {
      // Check if receiver is a dyn value (a Named type with `dyn ` prefix).
      if (recvType.kind === "Named" && recvType.name.startsWith("dyn ")) {
        const traitName = recvType.name.slice(4);
        const trait = this.traits.getTrait(traitName);
        if (trait) {
          const tm = trait.methods.find(m => m.name === e.name);
          if (tm) {
            // dyn dispatch — mark for the eval; check arg types.
            (e as any).__dynDispatch = true;
            const argTypes = e.args.map(a => this.infer(a));
            // Self in arg positions is forbidden for dyn; the args are
            // typed against the trait method's signature with Self as
            // the dyn type itself (erased to the dyn).
            void argTypes;
            const ret = tm.selfInRet ? recvType : tm.retType;
            this.setType(e, ret);
            return ret;
          }
          this.err(`trait '${traitName}' has no method '${e.name}'`, e.loc);
          const t = freshTypeVar("M");
          this.setType(e, t);
          return t;
        }
      } else {
        const found = this.traits.findTraitMethodForType(recvType, e.name);
        if (found) {
          (e as any).__traitImpl = {
            traitName: found.traitName,
            implTypeName: typeKey(found.impl.implType),
            methodName: e.name,
          };
          // v3: for generic impls, matchImplType returns a substitution
          // binding each impl type-param to a concrete part of the receiver
          // type. Apply this substitution to the impl method's signature
          // so we type-check the call against the instantiated types
          // (e.g. `impl<T: Ord> Ord for [T]::cmp(other: [T])` becomes
          // `cmp(other: [int])` when the receiver is `[int]`).
          const matchSubst = matchImplType(found.impl, recvType) ?? new Map<string, Type>();
          // Type-check the call against the impl method's signature. The
          // impl method's parameter types were resolved in `registerOneImpl`
          // with `Self` substituted to the impl type. (If we used the trait
          // method's signature, `Self` would still be a placeholder and
          // would unify with the receiver's type via `subst`.)
          const methodSig = found.method ?? found.traitMethod;
          if (methodSig) {
            const sigParams = "params" in methodSig ? methodSig.params : null;
            const sigRet = "retType" in methodSig ? methodSig.retType : T_UNIT;
            if (sigParams) {
              if (e.args.length !== sigParams.length - 1) {
                // The first param is `self`; the user-passed args are the rest.
                const expected = sigParams.length - 1;
                this.err(
                  `method '${e.name}' expects ${expected} argument(s), found ${e.args.length}`,
                  e.loc,
                );
              }
              const subst = new Map<string, Type>();
              for (let i = 1; i < sigParams.length; i++) {
                const argT = this.infer(e.args[i - 1]);
                // Apply the impl's matchSubst to the param type so generic
                // impl params (T) become the concrete receiver element type.
                const sigParamT = applySubst(sigParams[i].type, matchSubst);
                try {
                  unify(sigParamT, argT, subst);
                } catch (err) {
                  if (err instanceof UnifyError) {
                    this.err(
                      `argument ${i}: expected ${typeToString(applySubst(sigParamT, subst))}, ` +
                      `found ${typeToString(argT)}`,
                      e.args[i - 1].loc,
                    );
                  }
                }
              }
              const ret = applySubst(applySubst(sigRet, matchSubst), subst);
              this.setType(e, ret);
              return ret;
            }
          }
        }
      }
    }
    // Fall back to free-function dispatch (legacy v1 behaviour).
    void objT;
    const t = freshTypeVar("M");
    this.setType(e, t);
    return t;
  }

  /**
   * v3: Resolve a receiver expression's type to a concrete type that can be
   * looked up in the trait registry. For `dyn Trait` (Named "dyn Trait"),
   * returns it as-is. For struct/enum/primitive types, returns the
   * concrete type. For arrays/tuples, returns the structural type so
   * generic impls (e.g. `impl<T: Ord> Ord for [T]`) can match.
   */
  private resolveReceiverType(t: Type): Type | null {
    if (t.kind === "Named" || t.kind === "Struct" || t.kind === "Enum") return t;
    if (t.kind === "Int" || t.kind === "Float" || t.kind === "Bool" ||
        t.kind === "String" || t.kind === "Char") return t;
    if (t.kind === "Array") return t;
    if (t.kind === "Tuple") return t;
    if (t.kind === "Option" || t.kind === "Result") return t;
    return null;
  }

  inferIndex(e: Extract<Expr, { kind: "Index" }>): Type {
    const objT = this.infer(e.object);
    const idxT = this.infer(e.index);
    if (objT.kind === "Array") {
      if (!this.checkAssignable(idxT, T_INT)) this.err(`array index must be int, found ${typeToString(idxT)}`, e.index.loc);
      this.setType(e, objT.elem);
      return objT.elem;
    }
    if (objT.kind === "Map") {
      if (!this.checkAssignable(idxT, objT.key)) this.err(`map key must be ${typeToString(objT.key)}, found ${typeToString(idxT)}`, e.index.loc);
      this.setType(e, objT.value);
      return objT.value;
    }
    if (objT.kind === "Tuple") {
      if (e.index.kind === "IntLit") {
        const i = (e.index as any).value;
        if (i < 0 || i >= objT.items.length) {
          this.err(`tuple index ${i} out of bounds (length ${objT.items.length})`, e.index.loc);
          this.setType(e, T_UNIT);
          return T_UNIT;
        }
        this.setType(e, objT.items[i]);
        return objT.items[i];
      }
      this.err(`tuple index must be an integer literal`, e.index.loc);
      this.setType(e, T_UNIT);
      return T_UNIT;
    }
    if (objT.kind === "String") {
      if (!this.checkAssignable(idxT, T_INT)) this.err(`string index must be int`, e.index.loc);
      this.setType(e, T_CHAR);
      return T_CHAR;
    }
    if (objT.kind === "TypeVar" || objT.kind === "Named") {
      const t = freshTypeVar("I");
      this.setType(e, t);
      return t;
    }
    this.err(`cannot index ${typeToString(objT)}`, e.object.loc);
    this.setType(e, T_UNIT);
    return T_UNIT;
  }

  inferField(e: Extract<Expr, { kind: "Field" }>): Type {
    const objT = this.infer(e.object);
    if (objT.kind === "Struct") {
      const f = objT.fields.find(f => f.name === e.name);
      if (!f) {
        this.err(`struct ${objT.name} has no field '${e.name}'`, e.loc);
        this.setType(e, T_UNIT);
        return T_UNIT;
      }
      this.setType(e, f.type);
      return f.type;
    }
    if (objT.kind === "Named") {
      const decl = this.findTypeDecl(objT.name);
      if (decl?.struct) {
        const f = decl.struct.fields.find(f => f.name === e.name);
        if (!f) {
          this.err(`struct ${objT.name} has no field '${e.name}'`, e.loc);
          this.setType(e, T_UNIT);
          return T_UNIT;
        }
        this.setType(e, f.type);
        return f.type;
      }
    }
    // Unknown — return a fresh var to allow continued checking
    const t = freshTypeVar("F");
    this.setType(e, t);
    return t;
  }

  inferTupleField(e: Extract<Expr, { kind: "TupleField" }>): Type {
    const objT = this.infer(e.object);
    if (objT.kind === "Tuple") {
      if (e.index < 0 || e.index >= objT.items.length) {
        this.err(`tuple field .${e.index} out of bounds (length ${objT.items.length})`, e.loc);
        this.setType(e, T_UNIT);
        return T_UNIT;
      }
      const t = objT.items[e.index];
      this.setType(e, t);
      return t;
    }
    this.err(`cannot access tuple field on ${typeToString(objT)}`, e.object.loc);
    this.setType(e, T_UNIT);
    return T_UNIT;
  }

  inferStructExpr(e: Extract<Expr, { kind: "StructExpr" }>): Type {
    const decl = this.findTypeDecl(e.name);
    if (!decl || decl.kind !== "struct") {
      this.err(`unknown struct '${e.name}'`, e.loc);
      const t = { kind: "Named", name: e.name, args: [] } as TNamed;
      this.setType(e, t);
      return t;
    }
    const structT = decl.struct!;
    for (const f of e.fields) {
      const declF = structT.fields.find(s => s.name === f.name);
      if (!declF) {
        this.err(`struct ${e.name} has no field '${f.name}'`, f.loc);
        continue;
      }
      const ft = this.infer(f.value);
      if (!this.checkAssignable(ft, declF.type)) {
        this.err(`field '${f.name}': expected ${typeToString(declF.type)}, found ${typeToString(ft)}`, f.loc);
      }
    }
    // Check for missing fields
    for (const declF of structT.fields) {
      if (!e.fields.find(f => f.name === declF.name)) {
        this.err(`missing field '${declF.name}' in struct ${e.name}`, e.loc);
      }
    }
    const t = { kind: "Named", name: e.name, args: [] } as TNamed;
    this.setType(e, t);
    return t;
  }

  inferEnumVariant(e: Extract<Expr, { kind: "EnumVariant" }>): Type {
    const decl = this.findTypeDecl(e.enumName);
    if (!decl || decl.kind !== "enum") {
      this.err(`unknown enum '${e.enumName}'`, e.loc);
      const t = { kind: "Named", name: e.enumName, args: [] } as TNamed;
      this.setType(e, t);
      return t;
    }
    const enumT = decl.enumT!;
    const variant = enumT.variants.find(v => v.name === e.variant);
    if (!variant) {
      this.err(`enum ${e.enumName} has no variant '${e.variant}'`, e.loc);
      const t = { kind: "Named", name: e.enumName, args: [] } as TNamed;
      this.setType(e, t);
      return t;
    }
    // Determine the generic substitution from the variant's tuple-arg types
    // vs the actual argument types. Generic names come from the enum decl
    // (e.g. `enum Result<T, E>` → ["T", "E"]). We start by giving each
    // generic a fresh TypeVar so unused parameters remain unconstrained.
    const genericNames = enumT.generics ?? [];
    const subst = new Map<string, Type>();
    for (const g of genericNames) subst.set(g, freshTypeVar(g));

    if (variant.kind === "tuple" && variant.types) {
      if (e.args.length !== variant.types.length) {
        this.err(`variant ${e.enumName}::${e.variant} expects ${variant.types.length} args, found ${e.args.length}`, e.loc);
      }
      for (let i = 0; i < Math.min(e.args.length, variant.types.length); i++) {
        const argT = this.infer(e.args[i]);
        const expected = applySubst(variant.types[i], subst);
        try {
          unify(expected, argT, subst);
        } catch (err) {
          if (err instanceof UnifyError) {
            this.err(`variant arg ${i + 1}: expected ${typeToString(expected)}, found ${typeToString(argT)}`, e.args[i].loc);
          }
        }
      }
    } else if (e.args.length > 0) {
      this.err(`unit variant ${e.enumName}::${e.variant} takes no arguments`, e.loc);
    }

    // Build the result type. For the sugar names `Option` and `Result` we
    // return the corresponding `TOption` / `TResult` representations so the
    // rest of the type-checker (notably `?` propagation and the int->float
    // widening in `unify`) sees the inner types structurally. For other
    // enums we return a `Named` type carrying the instantiated generic
    // arguments so a declared `enum List<T> { Cons(T), Nil }` round-trips
    // as `List<int>` when constructed with `List::Cons(42)`.
    let t: Type;
    if ((e.enumName === "Option" || e.enumName === "option") && genericNames.length === 1) {
      t = optionOf(subst.get(genericNames[0]) ?? freshTypeVar("T"));
    } else if ((e.enumName === "Result" || e.enumName === "result") && genericNames.length === 2) {
      t = resultOf(
        subst.get(genericNames[0]) ?? freshTypeVar("T"),
        subst.get(genericNames[1]) ?? freshTypeVar("E"),
      );
    } else {
      t = { kind: "Named", name: e.enumName, args: genericNames.map(g => subst.get(g) ?? freshTypeVar(g)) };
    }
    this.setType(e, t);
    return t;
  }

  inferLambda(e: Extract<Expr, { kind: "Lambda" }>): Type {
    const paramTypes: Type[] = [];
    this.pushScope();
    for (const p of e.params) {
      const pt = p.type ? this.resolveType(p.type) : freshTypeVar("P");
      paramTypes.push(pt);
      this.addVar(p.name, pt, false, p.loc, "param");
    }
    let ret: Type;
    if (e.ret) {
      ret = this.resolveType(e.ret);
    } else {
      ret = freshTypeVar("R");
    }
    const prevRet = this.currentRetType;
    this.currentRetType = ret;
    const bodyT = this.infer(e.body);
    if (!e.ret) {
      // infer ret from body
      ret = bodyT;
    } else {
      if (!this.checkAssignable(bodyT, ret)) {
        this.err(`lambda body: expected ${typeToString(ret)}, found ${typeToString(bodyT)}`, e.body.loc);
      }
    }
    this.currentRetType = prevRet;
    this.popScope();
    const t = funcType(paramTypes, ret);
    this.setType(e, t);
    return t;
  }

  inferIf(e: Extract<Expr, { kind: "If" }>): Type {
    const ct = this.infer(e.cond);
    if (!this.checkAssignable(ct, T_BOOL)) {
      this.err(`if condition must be bool, found ${typeToString(ct)}`, e.cond.loc);
    }
    const thenT = this.infer(e.then);
    let elseT: Type = T_UNIT;
    if (e.else) elseT = this.infer(e.else);
    const common = this.commonType(thenT, elseT) ?? thenT;
    this.setType(e, common);
    return common;
  }

  inferMatch(e: Extract<Expr, { kind: "Match" }>): Type {
    const scrutT = this.infer(e.scrutinee);
    let common: Type | null = null;
    for (const arm of e.arms) {
      this.pushScope();
      this.checkPattern(arm.pattern, scrutT);
      if (arm.guard) {
        const gt = this.infer(arm.guard);
        if (!this.checkAssignable(gt, T_BOOL)) {
          this.err(`match guard must be bool, found ${typeToString(gt)}`, arm.guard.loc);
        }
      }
      const bt = this.infer(arm.body);
      if (common === null) common = bt;
      else common = this.commonType(common, bt) ?? common;
      this.popScope();
    }
    const result = common ?? T_UNIT;
    this.setType(e, result);
    return result;
  }

  inferBlock(e: Extract<Expr, { kind: "Block" }>): Type {
    this.pushScope();
    for (const s of e.stmts) this.checkStmt(s);
    let t: Type = T_UNIT;
    if (e.expr) t = this.infer(e.expr);
    this.popScope();
    this.setType(e, t);
    return t;
  }

  inferAs(e: Extract<Expr, { kind: "As" | "Cast" }>): Type {
    const srcT = this.infer(e.expr);
    const targetT = this.resolveType(e.type);
    // Allow int->float, float->int, int->char, char->int, etc.
    const okCast =
      (srcT.kind === "Int" && targetT.kind === "Float") ||
      (srcT.kind === "Float" && targetT.kind === "Int") ||
      (srcT.kind === "Int" && targetT.kind === "Char") ||
      (srcT.kind === "Char" && targetT.kind === "Int") ||
      typeEq(srcT, targetT) ||
      (srcT.kind === "TypeVar" || targetT.kind === "TypeVar");
    if (!okCast) {
      this.err(`cannot cast ${typeToString(srcT)} as ${typeToString(targetT)}`, e.loc);
    }
    this.setType(e, targetT);
    return targetT;
  }

  // ------------------------------------------------------------------------
  // Patterns
  // ------------------------------------------------------------------------
  checkPattern(p: Pattern, scrutT: Type): void {
    switch (p.kind) {
      case "WildcardPat": return;
      case "BindPat": {
        let bindType = scrutT;
        if (p.type) {
          const t = this.resolveType(p.type);
          if (!this.checkAssignable(scrutT, t)) {
            this.err(`pattern expects ${typeToString(t)}, scrutinee is ${typeToString(scrutT)}`, p.loc);
          }
          bindType = t;
        }
        this.addVar(p.name, bindType, !!p.mut, p.loc, p.mut ? "mut" : "let");
        return;
      }
      case "LitPat": {
        const lt = this.infer(p.value);
        if (!this.checkAssignable(scrutT, lt) && !this.checkAssignable(lt, scrutT)) {
          this.err(`literal pattern ${typeToString(lt)} does not match scrutinee ${typeToString(scrutT)}`, p.loc);
        }
        return;
      }
      case "TuplePat": {
        if (scrutT.kind !== "Tuple") {
          this.err(`tuple pattern cannot match ${typeToString(scrutT)}`, p.loc);
          return;
        }
        if (p.elements.length !== scrutT.items.length) {
          this.err(`tuple pattern arity ${p.elements.length} does not match ${scrutT.items.length}`, p.loc);
          return;
        }
        for (let i = 0; i < p.elements.length; i++) this.checkPattern(p.elements[i], scrutT.items[i]);
        return;
      }
      case "ArrayPat": {
        if (scrutT.kind !== "Array") {
          this.err(`array pattern cannot match ${typeToString(scrutT)}`, p.loc);
          return;
        }
        for (const el of p.elements) this.checkPattern(el, scrutT.elem);
        return;
      }
      case "StructPat": {
        const decl = this.findTypeDecl(p.name);
        if (!decl || decl.kind !== "struct" || !decl.struct) {
          this.err(`unknown struct '${p.name}' in pattern`, p.loc);
          return;
        }
        for (const f of p.fields) {
          const declF = decl.struct.fields.find(s => s.name === f.name);
          if (!declF) {
            this.err(`struct ${p.name} has no field '${f.name}'`, f.loc);
            continue;
          }
          this.checkPattern(f.pattern, declF.type);
        }
        return;
      }
      case "EnumPat": {
        const decl = this.findTypeDecl(p.enumName);
        if (!decl || decl.kind !== "enum") {
          this.err(`unknown enum '${p.enumName}' in pattern`, p.loc);
          return;
        }
        const variant = decl.enumT!.variants.find(v => v.name === p.variant);
        if (!variant) {
          this.err(`enum ${p.enumName} has no variant '${p.variant}'`, p.loc);
          return;
        }
        // Determine the generic substitution from the scrutinee type.
        const subst = new Map<string, Type>();
        const genericNames = decl.enumT!.generics ?? [];
        if (scrutT.kind === "Option" && genericNames.length === 1) {
          subst.set(genericNames[0], scrutT.inner);
        } else if (scrutT.kind === "Result" && genericNames.length === 2) {
          subst.set(genericNames[0], scrutT.ok);
          subst.set(genericNames[1], scrutT.err);
        } else if (scrutT.kind === "Named" && scrutT.name === p.enumName) {
          for (let i = 0; i < Math.min(genericNames.length, scrutT.args.length); i++) {
            subst.set(genericNames[i], scrutT.args[i]);
          }
        }
        if (variant.kind === "tuple" && variant.types) {
          if (p.subpatterns.length !== variant.types.length) {
            this.err(`variant ${p.enumName}::${p.variant} expects ${variant.types.length} subpatterns, found ${p.subpatterns.length}`, p.loc);
            return;
          }
          for (let i = 0; i < variant.types.length; i++) {
            const t = applySubst(variant.types[i], subst);
            this.checkPattern(p.subpatterns[i], t);
          }
        } else if (variant.kind === "struct" && variant.fields) {
          // struct variant: subpatterns bind to fields by position is not supported;
          // require { field: pattern } syntax via StructPat instead.
          this.err(`struct variants must be matched with { field: pattern } syntax`, p.loc);
        } else {
          if (p.subpatterns.length > 0) {
            this.err(`unit variant ${p.enumName}::${p.variant} takes no subpatterns`, p.loc);
          }
        }
        return;
      }
      case "OrPat": {
        for (const sub of p.patterns) this.checkPattern(sub, scrutT);
        return;
      }
      case "RestPat": return;
    }
  }

  // ------------------------------------------------------------------------
  // Assignability
  // ------------------------------------------------------------------------
  checkAssignable(src: Type, dst: Type): boolean {
    if (dst.kind === "TypeVar" || dst.kind === "Generic") return true;
    if (src.kind === "TypeVar" || src.kind === "Generic") return true;
    if (typeEq(src, dst)) return true;
    if (src.kind === "Never") return true;
    if (isSubtype(src, dst)) return true;
    return false;
  }

  commonType(a: Type, b: Type): Type | null {
    if (typeEq(a, b)) return a;
    if (a.kind === "Never") return b;
    if (b.kind === "Never") return a;
    // int -> float widening
    if (a.kind === "Int" && b.kind === "Float") return T_FLOAT;
    if (b.kind === "Int" && a.kind === "Float") return T_FLOAT;
    // TypeVar fallback
    if (a.kind === "TypeVar") return b;
    if (b.kind === "TypeVar") return a;
    return null;
  }
}

//----------------------------------------------------------------------------
// Public entry point
//----------------------------------------------------------------------------

/**
 * Optional flags for `check()`.
 *
 * `borrowCheck: true` enables the RFC-004 borrow checker pass
 * (`aether/core/borrow/borrow.ts`). The pass runs after the standard type
 * check and appends any borrow errors to `CheckResult.errors`. Defaults to
 * `false` so existing v1 (GC) programs are unaffected — the borrow checker
 * is opt-in (RFC-004 § Opt-in semantics).
 */
export interface CheckOptions {
  borrowCheck?: boolean;
}

export function check(program: Program, opts?: CheckOptions): CheckResult {
  const c = new Checker();
  const r = c.check(program);
  // v3-borrow (RFC-004): opt-in borrow checker. Only run when the caller
  // explicitly asks for it; otherwise existing v1 tests stay unaffected.
  if (opts?.borrowCheck) {
    // Lazy-import to avoid a circular dep at module-load time.
    const { BorrowChecker } = require("../borrow/borrow");
    const borrowErrors = new BorrowChecker().check(program);
    for (const e of borrowErrors) {
      r.errors.push({ message: e.message, loc: e.loc });
    }
  }
  return r;
}

//----------------------------------------------------------------------------
// Instantiate a type: replace every Generic placeholder with a fresh TypeVar.
// Returns the new type plus a map from generic name to fresh TypeVar name.
//----------------------------------------------------------------------------
function instantiate(t: Type): { type: Type; genericMap: Map<string, string> } {
  const genericMap = new Map<string, string>();
  function go(t: Type): Type {
    switch (t.kind) {
      case "Generic": {
        if (genericMap.has(t.name)) return { kind: "TypeVar", name: genericMap.get(t.name)! };
        const fresh = freshTypeVar(t.name);
        genericMap.set(t.name, fresh.name);
        return fresh;
      }
      case "Func": return { kind: "Func", params: t.params.map(go), ret: go(t.ret) };
      case "Tuple": return { kind: "Tuple", items: t.items.map(go) };
      case "Array": return { kind: "Array", elem: go(t.elem) };
      case "Map": return { kind: "Map", key: go(t.key), value: go(t.value) };
      case "Option": return { kind: "Option", inner: go(t.inner) };
      case "Result": return { kind: "Result", ok: go(t.ok), err: go(t.err) };
      case "Named": return { kind: "Named", name: t.name, args: t.args.map(go) };
      default: return t;
    }
  }
  return { type: go(t), genericMap };
}

//----------------------------------------------------------------------------
// v3: Self-substitution helper. Used by `resolveImplParamType` to replace
// `Self` (Named "Self") inside an impl method's parameter type with the
// impl's concrete impl type.
//----------------------------------------------------------------------------
function substituteSelf(t: Type, impl: Type): Type {
  switch (t.kind) {
    case "Named":
      if (t.name === "Self") return impl;
      return { kind: "Named", name: t.name, args: t.args.map(a => substituteSelf(a, impl)) };
    case "Func":
      return { kind: "Func", params: t.params.map(p => substituteSelf(p, impl)), ret: substituteSelf(t.ret, impl) };
    case "Tuple":
      return { kind: "Tuple", items: t.items.map(i => substituteSelf(i, impl)) };
    case "Array":
      return { kind: "Array", elem: substituteSelf(t.elem, impl) };
    case "Map":
      return { kind: "Map", key: substituteSelf(t.key, impl), value: substituteSelf(t.value, impl) };
    case "Option":
      return { kind: "Option", inner: substituteSelf(t.inner, impl) };
    case "Result":
      return { kind: "Result", ok: substituteSelf(t.ok, impl), err: substituteSelf(t.err, impl) };
    case "Struct":
      return { kind: "Struct", name: t.name, fields: t.fields.map(f => ({ name: f.name, type: substituteSelf(f.type, impl) })) };
    default:
      return t;
  }
}
