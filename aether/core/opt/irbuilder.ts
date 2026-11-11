/**
 * aether/core/opt/irbuilder.ts
 * ============================
 * Compact constructors for building IR programs in tests. Each helper
 * returns a fresh `IrOp` (no aliasing), so tests can compose programs
 * without surprises. The builder is also used by `bench.ts`.
 *
 * The builder is intentionally terse — test authors should be able to write
 * a one-liner per instruction. We prefer positional `r<n>` register
 * notation in tests (`r(0)`, `r(1)`, ...) so register numbers stand out
 * visually from constants.
 */
import type {
  IrOp,
  IrProgram,
  IrFunc,
  IrBlock,
  BinKind,
  UnKind,
  IrValue,
} from "./types";

/** No-op identity for a register number — exists purely for test readability. */
export function r(n: number): number {
  return n;
}

export function const_(value: IrValue, dest: number): IrOp {
  return { op: "Const", value, dest };
}

export function move(src: number, dest: number): IrOp {
  return { op: "Move", src, dest };
}

export function bin(kind: BinKind, src1: number, src2: number, dest: number): IrOp {
  return { op: "Bin", kind, src1, src2, dest };
}

export function un(kind: UnKind, src: number, dest: number): IrOp {
  return { op: "Un", kind, src, dest };
}

export function call(fn: string, args: number[], dest: number): IrOp {
  return { op: "Call", fn, args, dest };
}

export function callBuiltin(fn: string, args: number[], dest: number): IrOp {
  return { op: "CallBuiltin", fn, args, dest };
}

export function br(cond: number | null, thenBlk: number, elseBlk: number | null): IrOp {
  return { op: "Br", cond, then: thenBlk, else: elseBlk };
}

export function ret(src: number | null): IrOp {
  return { op: "Return", src };
}

export function tailCall(fn: string, args: number[]): IrOp {
  return { op: "TailCall", fn, args };
}

export function loadField(src: number, field: string, dest: number): IrOp {
  return { op: "LoadField", src, field, dest };
}

export function storeField(destStruct: number, field: string, src: number): IrOp {
  return { op: "StoreField", dest: destStruct, field, src };
}

export function allocStruct(structName: string, fields: Record<string, number>, dest: number): IrOp {
  return { op: "AllocStruct", structName, fields, dest };
}

export function allocVariant(enumName: string, variant: string, args: number[], dest: number): IrOp {
  return { op: "AllocVariant", enumName, variant, args, dest };
}

export function allocArray(args: number[], dest: number): IrOp {
  return { op: "AllocArray", args, dest };
}

export function allocMap(pairs: Array<[number, number]>, dest: number): IrOp {
  return { op: "AllocMap", pairs, dest };
}

export function indexGet(src: number, index: number, dest: number): IrOp {
  return { op: "IndexGet", src, index, dest };
}

export function indexSet(src: number, index: number, value: number): IrOp {
  return { op: "IndexSet", src, index, value };
}

export function matchOp(src: number, targets: Array<{ test: number; target: number }>, def: number): IrOp {
  return { op: "Match", src, targets, default: def };
}

export function len(src: number, dest: number): IrOp {
  return { op: "Len", src, dest };
}

export function phi(incomings: Array<{ from: number; src: number }>, dest: number): IrOp {
  return { op: "Phi", incomings, dest };
}

export function block(id: number, instrs: IrOp[]): IrBlock {
  return { id, instrs };
}

export function func(name: string, params: number[], blocks: IrBlock[], entry: number, nlocals: number): IrFunc {
  return { name, params, blocks, entry, nlocals };
}

export function program(funcs: IrFunc[], globals: [string, number][] = []): IrProgram {
  return { funcs, globals: new Map(globals) };
}

//----------------------------------------------------------------------------
// Snapshots / comparison helpers used by tests
//----------------------------------------------------------------------------

/**
 * Serialize a program to a stable string suitable for snapshot testing.
 * Each instruction is on its own line; blocks and functions are labeled.
 */
export function dumpProg(prog: IrProgram): string {
  const lines: string[] = [];
  for (const f of prog.funcs) {
    lines.push(`fn ${f.name}(${f.params.join(", ")}) [entry=${f.entry}, nlocals=${f.nlocals}]`);
    for (const b of f.blocks) {
      lines.push(`  block ${b.id}:`);
      for (const i of b.instrs) {
        lines.push(`    ${dumpInstr(i)}`);
      }
    }
  }
  return lines.join("\n");
}

export function dumpInstr(i: IrOp): string {
  const op = (i as { op?: string }).op;
  switch (op) {
    case "Const":
      return `Const(${JSON.stringify((i as { value: IrValue }).value)}, r${(i as { dest: number }).dest})`;
    case "Move":
      return `Move(r${(i as { src: number }).src}, r${(i as { dest: number }).dest})`;
    case "Bin":
      return `Bin(${(i as { kind: string }).kind}, r${(i as { src1: number }).src1}, r${(i as { src2: number }).src2}, r${(i as { dest: number }).dest})`;
    case "Un": {
      const u = i as { kind: string; src: number; dest: number };
      return `Un(${u.kind}, r${u.src}, r${u.dest})`;
    }
    case "Call":
      return `Call(${(i as { fn: string }).fn}, [${(i as { args: number[] }).args.map(a => "r" + a).join(", ")}], r${(i as { dest: number }).dest})`;
    case "CallBuiltin":
      return `CallBuiltin(${(i as { fn: string }).fn}, [${(i as { args: number[] }).args.map(a => "r" + a).join(", ")}], r${(i as { dest: number }).dest})`;
    case "Br": {
      const b = i as { cond: number | null; then: number; else: number | null };
      return `Br(${b.cond === null ? "null" : "r" + b.cond}, blk${b.then}, ${b.else === null ? "null" : "blk" + b.else})`;
    }
    case "Return":
      return `Return(${(i as { src: number | null }).src === null ? "null" : "r" + (i as { src: number }).src})`;
    case "TailCall":
      return `TailCall(${(i as { fn: string }).fn}, [${(i as { args: number[] }).args.map(a => "r" + a).join(", ")}])`;
    case "LoadField":
      return `LoadField(r${(i as { src: number }).src}, ${(i as { field: string }).field}, r${(i as { dest: number }).dest})`;
    case "StoreField":
      return `StoreField(r${(i as { dest: number }).dest}, ${(i as { field: string }).field}, r${(i as { src: number }).src})`;
    case "AllocStruct": {
      const a = i as { structName: string; fields: Record<string, number>; dest: number };
      return `AllocStruct(${a.structName}, {${Object.entries(a.fields).map(([k, v]) => `${k}: r${v}`).join(", ")}}, r${a.dest})`;
    }
    case "AllocVariant": {
      const a = i as { enumName: string; variant: string; args: number[]; dest: number };
      return `AllocVariant(${a.enumName}::${a.variant}, [${a.args.map(x => "r" + x).join(", ")}], r${a.dest})`;
    }
    case "AllocArray":
      return `AllocArray([${(i as { args: number[] }).args.map(a => "r" + a).join(", ")}], r${(i as { dest: number }).dest})`;
    case "AllocMap": {
      const a = i as { pairs: Array<[number, number]>; dest: number };
      return `AllocMap([${a.pairs.map(([k, v]) => `r${k}: r${v}`).join(", ")}], r${a.dest})`;
    }
    case "IndexGet":
      return `IndexGet(r${(i as { src: number }).src}, r${(i as { index: number }).index}, r${(i as { dest: number }).dest})`;
    case "IndexSet":
      return `IndexSet(r${(i as { src: number }).src}, r${(i as { index: number }).index}, r${(i as { value: number }).value})`;
    case "Match": {
      const m = i as { src: number; targets: Array<{ test: number; target: number }>; default: number };
      return `Match(r${m.src}, [${m.targets.map(t => `r${t.test}=>blk${t.target}`).join(", ")}], def=blk${m.default})`;
    }
    case "Len":
      return `Len(r${(i as { src: number }).src}, r${(i as { dest: number }).dest})`;
    case "Phi": {
      const p = i as { incomings: Array<{ from: number; src: number }>; dest: number };
      return `Phi([${p.incomings.map(x => `blk${x.from}: r${x.src}`).join(", ")}], r${p.dest})`;
    }
    default:
      return `Unknown(${JSON.stringify(i)})`;
  }
}
