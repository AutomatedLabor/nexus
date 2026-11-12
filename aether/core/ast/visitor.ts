/**
 * aether/core/ast/visitor.ts
 * =========================
 * Generic AST traversal: `walk` (read-only), `transform` (immutable rewrite),
 * and `printAst` (reconstruct near-source Aether code from the AST).
 *
 * `children(node)` enumerates every AST node reachable from a given node in
 * source order. Each entry is a tuple `[value, key]` so transformers can
 * identify the field being visited.
 */
import type {
  Node, Program, Expr, Stmt, Pattern, TypeNode, MatchArm, MapEntry,
  StructExprField, Param, TypeParam, StructField, EnumVariantDecl,
  StringSegment, Locatable, NodeByKind,
} from "./ast";

export interface ChildRef {
  key: string;
  value: Node | Node[] | null | undefined;
}

/**
 * Return the child nodes of a node in source order.
 * Arrays are flattened (each element returned individually).
 * `null`/`undefined` fields are skipped.
 */
export function children(node: Node): ChildRef[] {
  const out: ChildRef[] = [];
  if (!node || typeof node !== "object" || !("kind" in node)) return out;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === "kind" || key === "loc") continue;
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        if (v && typeof v === "object" && "kind" in v) {
          out.push({ key, value: v as Node });
        }
      }
    } else if (typeof value === "object" && "kind" in (value as object)) {
      out.push({ key, value: value as Node });
    }
  }
  return out;
}

export interface Visitor {
  enter?: (node: Node, parent: Node | null) => void;
  leave?: (node: Node, parent: Node | null) => void;
}

/** Walk an AST, calling `enter` on the way down and `leave` on the way up. */
export function walk(root: Node, visitor: Visitor): void {
  const stack: Array<{ node: Node; parent: Node | null; entered: boolean }> = [
    { node: root, parent: null, entered: false },
  ];
  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    if (!top.entered) {
      top.entered = true;
      visitor.enter?.(top.node, top.parent);
      // Push children in reverse order so they pop in source order.
      const kids = children(top.node);
      for (let i = kids.length - 1; i >= 0; i--) {
        stack.push({ node: kids[i].value as Node, parent: top.node, entered: false });
      }
    } else {
      stack.pop();
      visitor.leave?.(top.node, top.parent);
    }
  }
}

export interface Transformer {
  enter?: (node: Node, parent: Node | null) => Node;
  leave?: (node: Node, parent: Node | null) => Node;
}

/**
 * Immutably transform an AST. The transformer may return a replacement node
 * from `enter` (descend into the new node) or `leave` (replace on the way up).
 */
export function transform(root: Node, transformer: Transformer): Node {
  return transformNode(root, null, transformer);
}

function transformNode(node: Node, parent: Node | null, t: Transformer): Node {
  let current = node;
  if (t.enter) {
    const replacement = t.enter(current, parent);
    if (replacement && replacement !== current) {
      current = replacement;
    }
  }
  // Recurse into children, rebuilding the node if any child changes.
  let changed = false;
  const out: Record<string, unknown> = { kind: current.kind, loc: (current as Locatable).loc };
  for (const [k, v] of Object.entries(current as Record<string, unknown>)) {
    if (k === "kind" || k === "loc") continue;
    if (Array.isArray(v)) {
      const newArr: unknown[] = [];
      let arrChanged = false;
      for (const item of v) {
        if (item && typeof item === "object" && "kind" in (item as object)) {
          const before = item as Node;
          const after = transformNode(before, current, t);
          newArr.push(after);
          if (after !== before) arrChanged = true;
        } else {
          newArr.push(item);
        }
      }
      if (arrChanged) changed = true;
      out[k] = newArr;
    } else if (v && typeof v === "object" && "kind" in (v as object)) {
      const before = v as Node;
      const after = transformNode(before, current, t);
      out[k] = after;
      if (after !== before) changed = true;
    } else {
      out[k] = v;
    }
  }
  const rebuilt = changed ? (out as unknown as Node) : current;
  if (t.leave) {
    const replaced = t.leave(rebuilt, parent);
    if (replaced && replaced !== rebuilt) return replaced;
  }
  return rebuilt;
}

//----------------------------------------------------------------------------
// printAst — reconstruct Aether source from the AST
//----------------------------------------------------------------------------
export function printAst(root: Node): string {
  const ctx: Ctx = { indent: 0, out: [] };
  printNode(root, ctx);
  return ctx.out.join("");
}

interface Ctx {
  indent: number;
  out: string[];
}

function push(ctx: Ctx, s: string): void { ctx.out.push(s); }
function newline(ctx: Ctx): void {
  ctx.out.push("\n" + "  ".repeat(ctx.indent));
}
function withIndent<T>(ctx: Ctx, fn: (c: Ctx) => T): T {
  ctx.indent++;
  const r = fn(ctx);
  ctx.indent--;
  return r;
}

function printNode(node: Node | null | undefined, ctx: Ctx): void {
  if (!node) return;
  switch (node.kind) {
    case "Program":
      for (let i = 0; i < node.body.length; i++) {
        printNode(node.body[i], ctx);
        if (i < node.body.length - 1) newline(ctx);
      }
      return;

    // -- Expressions --
    case "IntLit": push(ctx, String(node.value)); return;
    case "FloatLit": push(ctx, String(node.value)); return;
    case "BoolLit": push(ctx, node.value ? "true" : "false"); return;
    case "CharLit": push(ctx, `'${escapeChar(node.value)}'`); return;
    case "UnitLit": push(ctx, "()"); return;
    case "Ident": push(ctx, node.name); return;
    case "StringLit": printStringLit(node.segments, ctx); return;

    case "Binary":
      printNode(node.left, ctx);
      push(ctx, ` ${node.op} `);
      printNode(node.right, ctx);
      return;
    case "Unary":
      push(ctx, node.op);
      printNode(node.operand, ctx);
      return;
    case "Assign":
      printNode(node.target, ctx);
      push(ctx, " = ");
      printNode(node.value, ctx);
      return;
    case "CompoundAssign":
      printNode(node.target, ctx);
      push(ctx, ` ${node.op}= `);
      printNode(node.value, ctx);
      return;
    case "Call":
      printNode(node.callee, ctx);
      if (node.typeArgs && node.typeArgs.length > 0) {
        push(ctx, "<");
        for (let i = 0; i < node.typeArgs.length; i++) {
          if (i) push(ctx, ", ");
          printNode(node.typeArgs[i], ctx);
        }
        push(ctx, ">");
      }
      push(ctx, "(");
      for (let i = 0; i < node.args.length; i++) {
        if (i) push(ctx, ", ");
        printNode(node.args[i], ctx);
      }
      push(ctx, ")");
      return;
    case "MethodCall":
      printNode(node.object, ctx);
      push(ctx, ".");
      push(ctx, node.name);
      push(ctx, "(");
      for (let i = 0; i < node.args.length; i++) {
        if (i) push(ctx, ", ");
        printNode(node.args[i], ctx);
      }
      push(ctx, ")");
      return;
    case "Index":
      printNode(node.object, ctx);
      push(ctx, "[");
      printNode(node.index, ctx);
      push(ctx, "]");
      return;
    case "Field":
      printNode(node.object, ctx);
      push(ctx, ".");
      push(ctx, node.name);
      return;
    case "TupleField":
      printNode(node.object, ctx);
      push(ctx, ".");
      push(ctx, String(node.index));
      return;
    case "TupleExpr":
      push(ctx, "(");
      for (let i = 0; i < node.elements.length; i++) {
        if (i) push(ctx, ", ");
        printNode(node.elements[i], ctx);
      }
      if (node.elements.length === 1) push(ctx, ",");
      push(ctx, ")");
      return;
    case "ArrayExpr":
      push(ctx, "[");
      for (let i = 0; i < node.elements.length; i++) {
        if (i) push(ctx, ", ");
        printNode(node.elements[i], ctx);
      }
      push(ctx, "]");
      return;
    case "MapExpr":
      push(ctx, "{");
      for (let i = 0; i < node.entries.length; i++) {
        if (i) push(ctx, ", ");
        printNode(node.entries[i].key, ctx);
        push(ctx, ": ");
        printNode(node.entries[i].value, ctx);
      }
      push(ctx, "}");
      return;
    case "StructExpr":
      push(ctx, node.name);
      push(ctx, " { ");
      for (let i = 0; i < node.fields.length; i++) {
        if (i) push(ctx, ", ");
        push(ctx, node.fields[i].name + ": ");
        printNode(node.fields[i].value, ctx);
      }
      if (node.spread) { if (node.fields.length) push(ctx, ", "); push(ctx, ".."); printNode(node.spread, ctx); }
      push(ctx, " }");
      return;
    case "EnumVariant":
      push(ctx, `${node.enumName}::${node.variant}`);
      if (node.args.length > 0) {
        push(ctx, "(");
        for (let i = 0; i < node.args.length; i++) {
          if (i) push(ctx, ", ");
          printNode(node.args[i], ctx);
        }
        push(ctx, ")");
      }
      return;
    case "Lambda":
      push(ctx, "fn(");
      for (let i = 0; i < node.params.length; i++) {
        if (i) push(ctx, ", ");
        printParam(node.params[i], ctx);
      }
      push(ctx, ")");
      if (node.ret) { push(ctx, " -> "); printNode(node.ret, ctx); }
      push(ctx, " ");
      printNode(node.body, ctx);
      return;
    case "If":
      push(ctx, "if ");
      printNode(node.cond, ctx);
      push(ctx, " ");
      printNode(node.then, ctx);
      if (node.else) {
        push(ctx, " else ");
        printNode(node.else, ctx);
      }
      return;
    case "Match":
      push(ctx, "match ");
      printNode(node.scrutinee, ctx);
      push(ctx, " {");
      withIndent(ctx, (c) => {
        for (const arm of node.arms) {
          newline(c);
          printNode(arm.pattern, c);
          if (arm.guard) { push(c, " if "); printNode(arm.guard, c); }
          push(c, " => ");
          printNode(arm.body, c);
          push(c, ",");
        }
      });
      newline(ctx);
      push(ctx, "}");
      return;
    case "Block":
      push(ctx, "{");
      withIndent(ctx, (c) => {
        for (const s of node.stmts) {
          newline(c);
          printNode(s, c);
        }
        if (node.expr) {
          newline(c);
          printNode(node.expr, c);
        }
      });
      newline(ctx);
      push(ctx, "}");
      return;
    case "Paren":
      push(ctx, "(");
      printNode(node.expr, ctx);
      push(ctx, ")");
      return;
    case "Cast":
    case "As":
      printNode(node.expr, ctx);
      push(ctx, " as ");
      printNode(node.type, ctx);
      return;
    case "Range":
      printNode(node.start, ctx);
      push(ctx, node.inclusive ? "..=" : "..");
      printNode(node.end, ctx);
      return;
    case "ErrorProp":
      printNode(node.expr, ctx);
      push(ctx, "?");
      return;
    case "SelfExpr":
      push(ctx, "self");
      return;
    case "Spread":
      push(ctx, "...");
      printNode(node.expr, ctx);
      return;
    case "Borrow":
      push(ctx, "&");
      if (node.mutable) push(ctx, "mut ");
      printNode(node.operand, ctx);
      return;
    case "Deref":
      push(ctx, "*");
      printNode(node.operand, ctx);
      return;
    case "Move":
      push(ctx, "move ");
      printNode(node.operand, ctx);
      return;

    // -- Statements --
    case "Let":
      push(ctx, `let ${node.name}`);
      if (node.type) { push(ctx, ": "); printNode(node.type, ctx); }
      push(ctx, " = ");
      printNode(node.init, ctx);
      push(ctx, ";");
      return;
    case "MutLet":
      push(ctx, `let mut ${node.name}`);
      if (node.type) { push(ctx, ": "); printNode(node.type, ctx); }
      push(ctx, " = ");
      printNode(node.init, ctx);
      push(ctx, ";");
      return;
    case "Const":
      push(ctx, `const ${node.name}`);
      if (node.type) { push(ctx, ": "); printNode(node.type, ctx); }
      push(ctx, " = ");
      printNode(node.init, ctx);
      push(ctx, ";");
      return;
    case "ExprStmt":
      printNode(node.expr, ctx);
      push(ctx, ";");
      return;
    case "FnDecl":
      if (node.exported) push(ctx, "pub ");
      push(ctx, `fn ${node.name}`);
      printTypeParams(node.generics, ctx);
      push(ctx, "(");
      for (let i = 0; i < node.params.length; i++) {
        if (i) push(ctx, ", ");
        printParam(node.params[i], ctx);
      }
      push(ctx, ")");
      if (node.ret) { push(ctx, " -> "); printNode(node.ret, ctx); }
      push(ctx, " ");
      printNode(node.body, ctx);
      return;
    case "EnumDecl":
      if (node.derive && node.derive.length) {
        push(ctx, `#[derive(${node.derive.join(", ")})]`);
        newline(ctx);
      }
      push(ctx, `enum ${node.name}`);
      printTypeParams(node.generics, ctx);
      push(ctx, " {");
      withIndent(ctx, (c) => {
        for (const v of node.variants) {
          newline(c);
          push(c, v.name);
          if (v.kind === "tuple") {
            push(c, "(");
            for (let i = 0; i < (v.types || []).length; i++) {
              if (i) push(c, ", ");
              printNode((v.types as TypeNode[])[i], c);
            }
            push(c, ")");
          } else if (v.kind === "struct") {
            push(c, " { ");
            for (let i = 0; i < (v.fields || []).length; i++) {
              if (i) push(c, ", ");
              push(c, `${(v.fields as StructField[])[i].name}: `);
              printNode((v.fields as StructField[])[i].type, c);
            }
            push(c, " }");
          }
          push(c, ",");
        }
      });
      newline(ctx);
      push(ctx, "}");
      return;
    case "StructDecl":
      if (node.derive && node.derive.length) {
        push(ctx, `#[derive(${node.derive.join(", ")})]`);
        newline(ctx);
      }
      push(ctx, `struct ${node.name}`);
      printTypeParams(node.generics, ctx);
      push(ctx, " { ");
      for (let i = 0; i < node.fields.length; i++) {
        if (i) push(ctx, ", ");
        push(ctx, `${node.fields[i].name}: `);
        printNode(node.fields[i].type, ctx);
      }
      push(ctx, " }");
      return;
    case "TypeAlias":
      push(ctx, `type ${node.name}`);
      printTypeParams(node.generics, ctx);
      push(ctx, " = ");
      printNode(node.type, ctx);
      push(ctx, ";");
      return;
    case "Return":
      push(ctx, "return");
      if (node.expr) { push(ctx, " "); printNode(node.expr, ctx); }
      push(ctx, ";");
      return;
    case "Break": push(ctx, "break;"); return;
    case "Continue": push(ctx, "continue;"); return;
    case "While":
      push(ctx, "while ");
      printNode(node.cond, ctx);
      push(ctx, " ");
      printNode(node.body, ctx);
      return;
    case "ForIn":
      push(ctx, `for ${node.varName} in `);
      printNode(node.iterable, ctx);
      push(ctx, " ");
      printNode(node.body, ctx);
      return;
    case "Import":
      push(ctx, `import "${node.path}"`);
      if (node.names.length) push(ctx, ` { ${node.names.join(", ")} }`);
      push(ctx, ";");
      return;
    case "Print":
      push(ctx, "print(");
      printNode(node.expr, ctx);
      push(ctx, ");");
      return;
    case "AssignStmt":
      printNode(node.target, ctx);
      push(ctx, " = ");
      printNode(node.value, ctx);
      push(ctx, ";");
      return;
    case "BlockStmt":
      push(ctx, "{");
      withIndent(ctx, (c) => {
        for (const s of node.body) { newline(c); printNode(s, c); }
      });
      newline(ctx);
      push(ctx, "}");
      return;

    // -- Patterns --
    case "WildcardPat": push(ctx, "_"); return;
    case "BindPat":
      if (node.mut) push(ctx, "mut ");
      push(ctx, node.name);
      if (node.type) { push(ctx, ": "); printNode(node.type, ctx); }
      return;
    case "LitPat": printNode(node.value, ctx); return;
    case "TuplePat":
      push(ctx, "(");
      for (let i = 0; i < node.elements.length; i++) {
        if (i) push(ctx, ", ");
        printNode(node.elements[i], ctx);
      }
      if (node.elements.length === 1) push(ctx, ",");
      push(ctx, ")");
      return;
    case "ArrayPat":
      push(ctx, "[");
      for (let i = 0; i < node.elements.length; i++) {
        if (i) push(ctx, ", ");
        printNode(node.elements[i], ctx);
      }
      push(ctx, "]");
      return;
    case "StructPat":
      push(ctx, `${node.name} { `);
      for (let i = 0; i < node.fields.length; i++) {
        if (i) push(ctx, ", ");
        push(ctx, `${node.fields[i].name}: `);
        printNode(node.fields[i].pattern, ctx);
      }
      if (node.rest) { if (node.fields.length) push(ctx, ", "); push(ctx, ".."); }
      push(ctx, " }");
      return;
    case "EnumPat":
      push(ctx, `${node.enumName}::${node.variant}`);
      if (node.subpatterns.length) {
        push(ctx, "(");
        for (let i = 0; i < node.subpatterns.length; i++) {
          if (i) push(ctx, ", ");
          printNode(node.subpatterns[i], ctx);
        }
        push(ctx, ")");
      }
      return;
    case "OrPat":
      for (let i = 0; i < node.patterns.length; i++) {
        if (i) push(ctx, " | ");
        printNode(node.patterns[i], ctx);
      }
      return;
    case "RestPat": push(ctx, ".."); return;

    // -- Types --
    case "NamedType": push(ctx, node.name); return;
    case "PrimitiveType": push(ctx, node.name); return;
    case "UnitType": push(ctx, "()"); return;
    case "GenericType":
      push(ctx, node.name);
      push(ctx, "<");
      for (let i = 0; i < node.args.length; i++) {
        if (i) push(ctx, ", ");
        printNode(node.args[i], ctx);
      }
      push(ctx, ">");
      return;
    case "FuncType":
      push(ctx, "fn(");
      for (let i = 0; i < node.params.length; i++) {
        if (i) push(ctx, ", ");
        printNode(node.params[i], ctx);
      }
      push(ctx, ") -> ");
      printNode(node.ret, ctx);
      return;
    case "TupleType":
      push(ctx, "(");
      for (let i = 0; i < node.types.length; i++) {
        if (i) push(ctx, ", ");
        printNode(node.types[i], ctx);
      }
      if (node.types.length === 1) push(ctx, ",");
      push(ctx, ")");
      return;
    case "ArrayType":
      push(ctx, "[");
      printNode(node.elem, ctx);
      push(ctx, "]");
      return;
    case "MapType":
      push(ctx, "map[");
      printNode(node.key, ctx);
      push(ctx, "] ");
      printNode(node.value, ctx);
      return;
    case "OptionType":
      push(ctx, "option<");
      printNode(node.inner, ctx);
      push(ctx, ">");
      return;
    case "ResultType":
      push(ctx, "result<");
      printNode(node.ok, ctx);
      push(ctx, ", ");
      printNode(node.err, ctx);
      push(ctx, ">");
      return;
    case "DynType":
      push(ctx, `dyn ${node.traitName}`);
      return;
    case "TraitDecl":
      push(ctx, `trait ${node.name}`);
      printTypeParams(node.typeParams, ctx);
      if (node.superTraits.length) push(ctx, `: ${node.superTraits.join(" + ")}`);
      push(ctx, " {");
      withIndent(ctx, (c) => {
        for (const m of node.methods) {
          newline(c);
          push(c, "fn ");
          push(c, m.name);
          push(c, "(");
          for (let i = 0; i < m.params.length; i++) {
            if (i) push(c, ", ");
            printParam(m.params[i], c);
          }
          push(c, ")");
          if (m.ret) { push(c, " -> "); printNode(m.ret, c); }
          if (m.hasDefault && m.body) { push(c, " "); printNode(m.body, c); }
          else push(c, ";");
        }
        for (const at of node.assocTypes) {
          newline(c);
          push(c, `type ${at.name}`);
          if (at.bound) push(c, `: ${at.bound}`);
          push(c, ";");
        }
      });
      newline(ctx);
      push(ctx, "}");
      return;
    case "ImplBlock": {
      push(ctx, "impl");
      printTypeParams(node.typeParams, ctx);
      push(ctx, " ");
      push(ctx, node.traitName);
      push(ctx, " for ");
      printNode(node.implType, ctx);
      push(ctx, " {");
      withIndent(ctx, (c) => {
        for (const m of node.methods) {
          newline(c);
          push(c, "fn ");
          push(c, m.name);
          push(c, "(");
          for (let i = 0; i < m.params.length; i++) {
            if (i) push(c, ", ");
            printParam(m.params[i], c);
          }
          push(c, ")");
          if (m.ret) { push(c, " -> "); printNode(m.ret, c); }
          push(c, " ");
          printNode(m.body, c);
        }
        for (const at of node.assocTypes) {
          newline(c);
          push(c, `type ${at.name} = `);
          printNode(at.type, c);
          push(c, ";");
        }
      });
      newline(ctx);
      push(ctx, "}");
      return;
    }
    case "TraitMethodDecl":
    case "ImplMethodDecl":
    case "TraitAssocTypeDecl":
    case "ImplAssocTypeDecl":
      // Standalone print of these is unusual; skip.
      return;
    default: {
      // Exhaustive guard
      const _exhaustive: never = node as never;
      void _exhaustive;
      return;
    }
  }
}

function printParam(p: Param, ctx: Ctx): void {
  push(ctx, p.name);
  if (p.type) { push(ctx, ": "); printNode(p.type, ctx); }
}

function printTypeParams(ps: TypeParam[], ctx: Ctx): void {
  if (!ps.length) return;
  push(ctx, "<");
  for (let i = 0; i < ps.length; i++) {
    if (i) push(ctx, ", ");
    push(ctx, ps[i].name);
    if (ps[i].constraint) push(ctx, `: ${ps[i].constraint}`);
  }
  push(ctx, ">");
}

function printStringLit(segments: StringSegment[], ctx: Ctx): void {
  let isF = segments.some(s => s.kind === "interp");
  push(ctx, isF ? 'f"' : '"');
  for (const seg of segments) {
    if (seg.kind === "text") {
      push(ctx, escapeString(seg.value));
    } else {
      push(ctx, "{");
      push(ctx, seg.value); // raw inner source
      push(ctx, "}");
    }
  }
  push(ctx, '"');
}

function escapeString(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}
function escapeChar(s: string): string {
  if (s === "\n") return "\\n";
  if (s === "\t") return "\\t";
  if (s === "\r") return "\\r";
  if (s === "\\") return "\\\\";
  if (s === "'") return "\\'";
  return s;
}

//----------------------------------------------------------------------------
// Convenience: collect all nodes of a specific kind reachable from root.
//----------------------------------------------------------------------------
export function collectByKind<K extends Node["kind"]>(root: Node, kind: K): NodeByKind<K>[] {
  const out: NodeByKind<K>[] = [];
  walk(root, {
    enter(node) {
      if (node.kind === kind) out.push(node as NodeByKind<K>);
    },
  });
  return out;
}
