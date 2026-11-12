/**
 * aether/stdlib/traits/index.ts
 * =============================
 * Stdlib trait metadata.
 *
 * Aether's v3 trait system is user-extensible: programs declare their own
 * traits with `trait Name { ... }` and impls with `impl Trait for Type { ... }`.
 * This module is the stdlib's catalogue of *well-known* trait names that
 * the eval, sema, and tooling can refer to. They are NOT auto-imported into
 * every program — programs that want them must declare them:
 *
 *   ```
 *   trait Ord { fn cmp(self, other: int) -> int; }
 *   impl Ord for int { fn cmp(self, other: int) -> int { self - other } }
 *   ```
 *
 * The catalogue is consumed by:
 *  - `#[derive(...)]` (sema uses STDLIB_TRAITS to validate names + synthesize
 *    the Show/Eq/Default impls).
 *  - The LSP / docs generator (for autocompletion of `#[derive(...)]` names).
 *  - The test-runner (to load a base set of impls into the registry for
 *    `assert_eq`/`print` to work uniformly across examples).
 *
 * The full canonical signatures are exported as `STDLIB_TRAITS`. Each entry
 * describes the trait's type params, super-traits, method signatures, and
 * (optionally) associated types. The runtime can also "pre-install" these
 * traits into a fresh `TraitRegistry` via `installStdlibTraits(reg)`, so a
 * program that uses `#[derive(Show)]` doesn't need to also write
 * `trait Show { fn show(self) -> string; }` itself (the derive picks up the
 * trait from the stdlib registry if the user didn't declare it).
 */

export interface StdlibTraitMethod {
  name: string;
  /** Parameter types (in source order, including `self` as the first). */
  params: string[];
  ret: string;
  /** Whether the method has a default body in stdlib. */
  hasDefault?: boolean;
}

export interface StdlibTrait {
  name: string;
  typeParams: string[];
  superTraits: string[];
  methods: StdlibTraitMethod[];
  assocTypes: { name: string; bound?: string }[];
  /**
   * Whether the trait is object-safe (i.e. eligible for `dyn Trait`).
   * Computed from `methods` (no `Self` in arg positions) and `assocTypes`
   * (must be empty).
   */
  objectSafe: boolean;
}

//----------------------------------------------------------------------------
// The stdlib trait catalogue.
//----------------------------------------------------------------------------

export const STDLIB_TRAITS: StdlibTrait[] = [
  {
    name: "Eq",
    typeParams: [],
    superTraits: [],
    methods: [
      { name: "eq", params: ["Self", "Self"], ret: "bool" },
    ],
    assocTypes: [],
    objectSafe: true,
  },
  {
    name: "PartialEq",
    typeParams: [],
    superTraits: ["Eq"],
    methods: [
      { name: "eq", params: ["Self", "Self"], ret: "bool" },
      { name: "ne", params: ["Self", "Self"], ret: "bool", hasDefault: true },
    ],
    assocTypes: [],
    objectSafe: true,
  },
  {
    name: "Ord",
    typeParams: [],
    superTraits: ["Eq"],
    methods: [
      { name: "cmp", params: ["Self", "Self"], ret: "int" },
      { name: "lt", params: ["Self", "Self"], ret: "bool", hasDefault: true },
      { name: "le", params: ["Self", "Self"], ret: "bool", hasDefault: true },
      { name: "gt", params: ["Self", "Self"], ret: "bool", hasDefault: true },
      { name: "ge", params: ["Self", "Self"], ret: "bool", hasDefault: true },
    ],
    assocTypes: [],
    objectSafe: true,
  },
  {
    name: "Show",
    typeParams: [],
    superTraits: [],
    methods: [
      { name: "show", params: ["Self"], ret: "string" },
    ],
    assocTypes: [],
    objectSafe: true,
  },
  {
    name: "Debug",
    typeParams: [],
    superTraits: ["Show"],
    methods: [
      { name: "debug", params: ["Self"], ret: "string" },
    ],
    assocTypes: [],
    objectSafe: true,
  },
  {
    name: "Default",
    typeParams: [],
    superTraits: [],
    methods: [
      // `default` has no `self` — it's a static method (constructor).
      { name: "default", params: [], ret: "Self" },
    ],
    assocTypes: [],
    objectSafe: false, // Self in return only — actually object-safe. Mark false because Default is not commonly used via dyn.
  },
  {
    name: "Clone",
    typeParams: [],
    superTraits: [],
    methods: [
      { name: "clone", params: ["Self"], ret: "Self" },
    ],
    assocTypes: [],
    objectSafe: false, // Self in return only — strictly object-safe, but we conservatively mark false.
  },
  {
    name: "Hash",
    typeParams: [],
    superTraits: [],
    methods: [
      { name: "hash", params: ["Self"], ret: "int" },
    ],
    assocTypes: [],
    objectSafe: true,
  },
  {
    name: "Iterator",
    typeParams: [],
    superTraits: [],
    methods: [
      { name: "next", params: ["Self"], ret: "option<Self::Item>" },
    ],
    assocTypes: [{ name: "Item" }],
    objectSafe: false, // has associated type
  },
  {
    name: "IntoIterator",
    typeParams: [],
    superTraits: [],
    methods: [
      { name: "into_iter", params: ["Self"], ret: "Self::Iter" },
    ],
    assocTypes: [
      { name: "Item" },
      { name: "Iter", bound: "Iterator" },
    ],
    objectSafe: false,
  },
  {
    name: "FromStr",
    typeParams: [],
    superTraits: [],
    methods: [
      { name: "from_str", params: ["string"], ret: "result<Self, string>" },
    ],
    assocTypes: [{ name: "Err" }],
    objectSafe: false,
  },
  {
    name: "Add",
    typeParams: [],
    superTraits: [],
    methods: [
      { name: "add", params: ["Self", "Self"], ret: "Self" },
    ],
    assocTypes: [],
    objectSafe: false, // Self in return
  },
  {
    name: "Sub",
    typeParams: [],
    superTraits: [],
    methods: [
      { name: "sub", params: ["Self", "Self"], ret: "Self" },
    ],
    assocTypes: [],
    objectSafe: false,
  },
  {
    name: "Mul",
    typeParams: [],
    superTraits: [],
    methods: [
      { name: "mul", params: ["Self", "Self"], ret: "Self" },
    ],
    assocTypes: [],
    objectSafe: false,
  },
  {
    name: "Div",
    typeParams: [],
    superTraits: [],
    methods: [
      { name: "div", params: ["Self", "Self"], ret: "Self" },
    ],
    assocTypes: [],
    objectSafe: false,
  },
];

//----------------------------------------------------------------------------
// Manifest (for the docs generator and LSP autocomplete).
//----------------------------------------------------------------------------

export const STDLIB_TRAITS_MANIFEST = {
  module: "traits",
  traits: STDLIB_TRAITS.map((t) => ({
    name: t.name,
    methods: t.methods.map((m) => m.name),
    superTraits: t.superTraits,
    assocTypes: t.assocTypes.map((a) => a.name),
    objectSafe: t.objectSafe,
  })),
};

/** Look up a stdlib trait by name. */
export function findStdlibTrait(name: string): StdlibTrait | undefined {
  return STDLIB_TRAITS.find((t) => t.name === name);
}

/** Check if a name is a known stdlib trait. */
export function isStdlibTrait(name: string): boolean {
  return STDLIB_TRAITS.some((t) => t.name === name);
}

//----------------------------------------------------------------------------
// Trait registration helper. Programs may use this to install the stdlib
// trait declarations into their own `TraitRegistry` so that derived impls
// don't require the user to redeclare the trait.
//
// In v1, this is informational only — the eval/VM treats user-declared
// traits with the same name as the stdlib ones (no merging is performed).
//----------------------------------------------------------------------------

import { TraitRegistry, type TraitDecl } from "../../core/traits/traits";

/**
 * Install the stdlib trait *declarations* (no impls) into the given
 * registry. Useful for tooling that wants to validate `#[derive(...)]`
 * attributes without the user redeclaring the trait.
 */
export function installStdlibTraits(reg: TraitRegistry): void {
  for (const t of STDLIB_TRAITS) {
    const decl: TraitDecl = {
      name: t.name,
      typeParams: t.typeParams,
      superTraits: t.superTraits,
      methods: t.methods.map((m) => ({
        name: m.name,
        params: m.params.map((p, i) => ({
          name: i === 0 ? "self" : `arg${i}`,
          type: { kind: "Named", name: p, args: [] } as any,
        })),
        retType: { kind: "Named", name: m.ret, args: [] } as any,
        hasDefault: !!m.hasDefault,
        selfInArgs: m.params.some((p, i) => i > 0 && p === "Self"),
        selfInRet: m.ret === "Self",
      })),
      assocTypes: t.assocTypes,
    };
    reg.declareTrait(decl);
  }
}
