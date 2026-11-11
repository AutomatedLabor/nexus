/**
 * aether/vm/interpreter/vm.ts
 * ===========================
 * The Aether register-based bytecode VM. Executes a `BytecodeModule`
 * and produces output identical to the v1 tree-walking evaluator.
 *
 * Architecture
 * ------------
 * Each call frame holds:
 *   - `func`: the BytecodeFunc being executed
 *   - `ip`: instruction pointer (index into `func.code`)
 *   - `regs`: a Value[] of size `func.nlocals` (the register file)
 *   - `upvalues`: an array of Box objects (for closures) — each Box is
 *     a one-cell mutable container `{ __box: true, value: Value }` so
 *     captured variables are shared by reference
 *
 * The main dispatch loop is a switch over `Op` in a tight while-loop.
 * Each opcode handler reads operands, performs the operation, and
 * advances `ip`. Control flow ops set `ip` directly. `Return` pops the
 * frame and returns a value to the caller.
 *
 * Closures
 * --------
 * A closure is a JS object `{ __closure: true, func: number, upvalues: Box[] }`.
 * `MakeClosure` packs upvalue boxes from the calling frame's registers:
 *   - For each capture register, if the value is already a Box, use it
 *   - Else allocate a fresh Box wrapping the value
 * The new closure also gets its `selfReg` set: when invoked, the VM
 * pre-populates the new frame's `selfReg` slot with the closure value
 * (so recursive references resolve).
 *
 * CallClosure: pushes a new frame, copies args into the new frame's first
 * nparams registers, sets selfReg to the closure value, runs to Return,
 * returns the value.
 *
 * Pattern matching
 * ----------------
 * The `Match` op uses a per-function `matchTables[idx]`. For each entry
 * in the table, the VM tries to match the scrutinee value against the
 * entry's pattern. On a match, the VM binds sub-pattern variables to
 * registers in the current frame (via the pattern's binding names —
 * the VM looks up the register index from a per-frame name→reg map
 * populated from the IR's pattern-binding allocations) and jumps to
 * the entry's target. On no match for any entry, the VM panics (the
 * else arm is a wildcard that always matches, ensuring we always
 * find a match unless the IR emitted no else arm, which it does).
 *
 * Builtins
 * --------
 * The VM uses the same inline builtins as the tree-walker (print, len,
 * range, etc.). For higher-order builtins (map, filter, reduce), the VM
 * passes a "callback adapter" that invokes an Aether closure (or native)
 * via the VM's own call mechanism. This guarantees parity with the
 * tree-walker's behavior.
 *
 * Public surface
 * --------------
 *   type VmOptions, VmResult
 *   function runBytecode(module, entryName, args, opts?): VmResult
 */
import type { BytecodeModule, BytecodeFunc, Instr, MatchTableEntry } from "../bytecode/bytecode";
import { Op } from "../bytecode/bytecode";
import type { Value } from "../../core/eval/eval";
import { display, valueEq } from "../../core/eval/eval";
import type { Heap } from "../gc/gc";

//----------------------------------------------------------------------------
// Public types
//----------------------------------------------------------------------------

export interface VmOptions {
  stdout?: (s: string) => void;
  maxSteps?: number;
  builtins?: Record<string, (...args: Value[]) => Value>;
  /** Optional heap for telemetry / GC integration. */
  heap?: Heap;
}

export interface VmResult {
  value: Value;
  output: string[];
  error?: { message: string };
  steps: number;
}

//----------------------------------------------------------------------------
// Runtime value shapes (mirroring the tree-walker's)
//----------------------------------------------------------------------------

interface Box { __box: true; value: Value; }
interface Closure { __closure: true; func: number; upvalues: Box[]; }
interface Native { __native: string; fn: (...args: Value[]) => Value; }
interface Range { __range: string; start: number; end: number; step: number; }
interface StructValue { __struct: string; fields: Record<string, Value>; }
interface VariantValue { __variant: string; variant: string; data: Value[]; }

function isBox(v: Value): v is Box {
  return v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Map) && (v as any).__box === true;
}
function isClosure(v: Value): v is Closure {
  return v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Map) && (v as any).__closure === true;
}
function isNative(v: Value): v is Native {
  return v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Map) && (v as any).__native !== undefined;
}
function isRange(v: Value): v is Range {
  return v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Map) && (v as any).__range !== undefined;
}
function isStruct(v: Value): v is StructValue {
  return v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Map) && (v as any).__struct !== undefined;
}
function isVariant(v: Value): v is VariantValue {
  return v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Map) && (v as any).__variant !== undefined;
}

//----------------------------------------------------------------------------
// Call frame
//----------------------------------------------------------------------------

interface Frame {
  func: BytecodeFunc;
  ip: number;
  regs: Value[];
  upvalues: Box[];
  /** Map from variable name → register index, populated for arm bodies
   * so the Match handler can write pattern bindings into the right
   * registers. */
  nameToReg: Map<string, number>;
}

//----------------------------------------------------------------------------
// Control-flow signals (mirroring the tree-walker)
//----------------------------------------------------------------------------

class BreakSignal { readonly __signal = "break"; }
class ContinueSignal { readonly __signal = "continue"; }
class ReturnSignal { constructor(public value: Value) {} }
class PanicSignal { constructor(public message: string) {} }

//----------------------------------------------------------------------------
// VM
//----------------------------------------------------------------------------

export function runBytecode(
  module: BytecodeModule,
  entryName: string,
  args: Value[],
  opts: VmOptions = {},
): VmResult {
  const vm = new VM(module, opts);
  return vm.run(entryName, args);
}

class VM {
  module: BytecodeModule;
  output: string[] = [];
  stdout: (s: string) => void;
  maxSteps: number;
  steps = 0;
  builtins: Map<string, (...args: Value[]) => Value>;
  heap?: Heap;
  /** Alloc counter for GC trigger. */
  allocs = 0;
  /** Alloc threshold (every N allocs, run GC). */
  gcThreshold = 4096;

  constructor(module: BytecodeModule, opts: VmOptions) {
    this.module = module;
    this.maxSteps = opts.maxSteps ?? 5_000_000;
    this.stdout = opts.stdout ?? ((s: string) => { this.output.push(s); });
    this.heap = opts.heap;
    this.builtins = new Map();
    this.installInlineBuiltins();
    if (opts.builtins) {
      for (const [name, fn] of Object.entries(opts.builtins)) {
        this.builtins.set(name, fn);
      }
    }
  }

  run(entryName: string, args: Value[]): VmResult {
    // Find the entry function: by name first (matching <main>), else index.
    let entryFn: BytecodeFunc | null = null;
    for (const fn of this.module.funcs) {
      if (fn.name === entryName) { entryFn = fn; break; }
    }
    if (!entryFn) entryFn = this.module.funcs[this.module.entry];
    if (!entryFn) {
      return { value: null, output: this.output, error: { message: `entry function '${entryName}' not found` }, steps: 0 };
    }
    try {
      const value = this.callFunc(entryFn, args, []);
      return { value, output: this.output, steps: this.steps };
    } catch (e) {
      if (e instanceof PanicSignal) {
        return { value: null, output: this.output, error: { message: e.message }, steps: this.steps };
      }
      const msg = e instanceof Error ? e.message : String(e);
      return { value: null, output: this.output, error: { message: msg }, steps: this.steps };
    }
  }

  tick(): void {
    this.steps++;
    if (this.steps > this.maxSteps) {
      throw new PanicSignal(`execution step limit exceeded (${this.maxSteps})`);
    }
  }

  maybeGc(roots: Value[]): void {
    if (!this.heap) return;
    this.allocs++;
    if (this.allocs >= this.gcThreshold) {
      this.heap.collect(roots);
      this.allocs = 0;
    }
  }

  /** Call a BytecodeFunc with `args` (positional). Returns the function's
   * return value. */
  callFunc(func: BytecodeFunc, args: Value[], upvalues: Box[]): Value {
    const regs: Value[] = new Array(func.nlocals).fill(null);
    for (let i = 0; i < Math.min(args.length, func.nparams); i++) {
      regs[i] = args[i];
    }
    const frame: Frame = { func, ip: 0, regs, upvalues, nameToReg: new Map() };
    return this.execFrame(frame);
  }

  /** Call a closure value with `args`. */
  callClosure(c: Closure, args: Value[]): Value {
    const func = this.module.funcs[c.func];
    const regs: Value[] = new Array(func.nlocals).fill(null);
    for (let i = 0; i < Math.min(args.length, func.nparams); i++) {
      regs[i] = args[i];
    }
    if (func.selfReg >= 0) regs[func.selfReg] = c;
    return this.execFrame({ func, ip: 0, regs, upvalues: c.upvalues, nameToReg: new Map() });
  }

  /** The main dispatch loop. */
  execFrame(frame: Frame): Value {
    const { func, regs, upvalues } = frame;
    const code = func.code;
    let ip = 0;
    // For break/continue handling: when a BreakSignal/ContinueSignal is
    // thrown from inside this frame (e.g., from a `break` op), we catch
    // it at the nearest enclosing loop. Since loops are compiled as
    // Br loops (not nested frames), we need to track loop nesting in
    // the frame. We use a stack of (continueIp, breakIp) pairs.
    const loopStack: Array<{ continueIp: number; breakIp: number }> = [];

    // Helper: register name (for pattern binding lookups)
    // Since we don't track names in the frame directly (the codegen didn't
    // emit name tables), we use a runtime name→reg map that's populated
    // lazily by the Match handler when it processes a pattern. For v1, we
    // store the binding names directly in the MatchTableEntry and use them
    // to allocate registers on demand at match time. This means each arm
    // may use a different register for the same name; the arm body uses
    // the registers that the IR allocated during lowering (which are
    // deterministic per arm). The codegen, however, doesn't know which
    // register corresponds to which name — we need a way to communicate
    // that. For v1, we use a separate side table per function that
    // maps (matchTableIdx, armIdx, bindingName) → register. This is
    // attached to the function as `__matchBindings` by the codegen.
    const matchBindings = (func as BytecodeFunc & { __matchBindings?: Map<string, number> }).__matchBindings ?? new Map<string, number>();
    (func as BytecodeFunc & { __matchBindings?: Map<string, number> }).__matchBindings = matchBindings;

    try {
      while (true) {
        this.tick();
        const instr = code[ip];
        ip++;
        switch (instr.op) {
          // ---- Constants ----
          case Op.LoadInt: { regs[instr.a!] = instr.imm; break; }
          case Op.LoadFloat: { regs[instr.a!] = func.constants[instr.imm!]; break; }
          case Op.LoadString: {
            // Strings are stored in the per-function strings table OR the
            // constants table. We check both.
            const s = func.strings[instr.imm!] ?? func.constants[instr.imm!];
            regs[instr.a!] = s;
            break;
          }
          case Op.LoadBool: { regs[instr.a!] = instr.imm ? true : false; break; }
          case Op.LoadUnit: case Op.LoadNull: { regs[instr.a!] = null; break; }

          // ---- Arithmetic binary ----
          case Op.Add: {
            const l = regs[instr.b!]; const r = regs[instr.c!];
            if (typeof l === "string" || typeof r === "string") {
              regs[instr.a!] = display(l) + display(r);
            } else if (Array.isArray(l) && Array.isArray(r)) {
              regs[instr.a!] = [...l, ...r];
            } else {
              regs[instr.a!] = (l as number) + (r as number);
            }
            break;
          }
          case Op.Sub: { regs[instr.a!] = (regs[instr.b!] as number) - (regs[instr.c!] as number); break; }
          case Op.Mul: { regs[instr.a!] = (regs[instr.b!] as number) * (regs[instr.c!] as number); break; }
          case Op.Div: {
            const r = regs[instr.c!] as number;
            if (r === 0) throw new PanicSignal("division by zero");
            regs[instr.a!] = (regs[instr.b!] as number) / r;
            break;
          }
          case Op.IDiv: {
            const r = regs[instr.c!] as number;
            if (r === 0) throw new PanicSignal("division by zero");
            regs[instr.a!] = Math.trunc((regs[instr.b!] as number) / r);
            break;
          }
          case Op.Mod: {
            const b = (regs[instr.c!] as number) | 0;
            if (b === 0) throw new PanicSignal("modulo by zero");
            const a = Math.trunc(regs[instr.b!] as number);
            regs[instr.a!] = ((a % b) + b) % b;
            break;
          }
          case Op.Neg: { regs[instr.a!] = -(regs[instr.b!] as number); break; }
          case Op.Not: { regs[instr.a!] = !truthy(regs[instr.b!]); break; }
          case Op.BitAnd: { regs[instr.a!] = (Math.trunc(regs[instr.b!] as number) & Math.trunc(regs[instr.c!] as number)) | 0; break; }
          case Op.BitOr: { regs[instr.a!] = (Math.trunc(regs[instr.b!] as number) | Math.trunc(regs[instr.c!] as number)) | 0; break; }
          case Op.BitXor: { regs[instr.a!] = (Math.trunc(regs[instr.b!] as number) ^ Math.trunc(regs[instr.c!] as number)) | 0; break; }
          case Op.BitNot: { regs[instr.a!] = ~Math.trunc(regs[instr.b!] as number); break; }
          case Op.Shl: { regs[instr.a!] = (Math.trunc(regs[instr.b!] as number) << Math.trunc(regs[instr.c!] as number)) | 0; break; }
          case Op.Shr: { regs[instr.a!] = (Math.trunc(regs[instr.b!] as number) >> Math.trunc(regs[instr.c!] as number)) | 0; break; }

          // ---- Comparison ----
          case Op.Eq: { regs[instr.a!] = valueEq(regs[instr.b!], regs[instr.c!]); break; }
          case Op.Neq: { regs[instr.a!] = !valueEq(regs[instr.b!], regs[instr.c!]); break; }
          case Op.Lt: { regs[instr.a!] = (regs[instr.b!] as number) < (regs[instr.c!] as number); break; }
          case Op.Le: { regs[instr.a!] = (regs[instr.b!] as number) <= (regs[instr.c!] as number); break; }
          case Op.Gt: { regs[instr.a!] = (regs[instr.b!] as number) > (regs[instr.c!] as number); break; }
          case Op.Ge: { regs[instr.a!] = (regs[instr.b!] as number) >= (regs[instr.c!] as number); break; }

          // ---- Control flow ----
          case Op.Jmp: { ip = instr.imm!; break; }
          case Op.JmpIf: { if (truthy(regs[instr.a!])) ip = instr.imm!; break; }
          case Op.JmpIfNot: { if (!truthy(regs[instr.a!])) ip = instr.imm!; break; }
          case Op.Return: { return regs[instr.a!]; }
          case Op.ReturnUnit: { return null; }
          case Op.Br: {
            // cond in a; imm = then; b = else. cond=-1 (encoded as 0) means
            // unconditional (we use the IR convention: cond=null → emitted
            // as Jmp by codegen, so this op is rare). We treat instr.a as
            // the cond register; if it's >= 0 we evaluate truthy.
            if (instr.a !== undefined && instr.a >= 0 && truthy(regs[instr.a!])) {
              ip = instr.imm!;
            } else {
              ip = instr.b!;
            }
            break;
          }
          case Op.Pop: { /* discard — no-op */ break; }
          case Op.Dup: { regs[instr.b!] = regs[instr.a!]; break; }

          // ---- Break / Continue ----
          case Op.Break: {
            if (loopStack.length === 0) throw new PanicSignal("break outside loop");
            ip = loopStack[loopStack.length - 1].breakIp;
            loopStack.pop();
            break;
          }
          case Op.Continue: {
            if (loopStack.length === 0) throw new PanicSignal("continue outside loop");
            ip = loopStack[loopStack.length - 1].continueIp;
            loopStack.pop();
            break;
          }

          // ---- Calls ----
          case Op.Call: {
            const fnVal = regs[instr.b!];
            const args = func.regLists[instr.regs!].map((r) => regs[r]);
            regs[instr.a!] = this.callValue(fnVal, args);
            break;
          }
          case Op.CallBuiltin: {
            const name = func.strings[instr.imm!];
            const args = func.regLists[instr.regs!].map((r) => regs[r]);
            const fn = this.builtins.get(name);
            if (!fn) throw new PanicSignal(`unknown builtin '${name}'`);
            regs[instr.a!] = fn(...args);
            break;
          }
          case Op.CallClosure: {
            const c = regs[instr.b!] as Closure;
            const args = func.regLists[instr.regs!].map((r) => regs[r]);
            regs[instr.a!] = this.callClosure(c, args);
            break;
          }
          case Op.CallNamed: {
            const name = func.strings[instr.imm!];
            const args = func.regLists[instr.regs!].map((r) => regs[r]);
            // Look up the name as a top-level binding in the main function
            // via the module's `funcs[entry].regs`. We pre-execute the
            // main function once at startup to populate its globals
            // (see `globals` field on the VM).
            const g = this.globals.get(name);
            if (g !== undefined) {
              regs[instr.a!] = this.callValue(g, args);
            } else {
              const fn = this.builtins.get(name);
              if (!fn) throw new PanicSignal(`unknown named function '${name}'`);
              regs[instr.a!] = fn(...args);
            }
            break;
          }
          case Op.TailCall: {
            const fnVal = regs[instr.b!];
            const args = func.regLists[instr.regs!].map((r) => regs[r]);
            // v1: no tail-call optimization — just call and return.
            regs[instr.a!] = this.callValue(fnVal, args);
            break;
          }

          // ---- Memory / data ----
          case Op.AllocStruct: {
            const name = func.strings[instr.imm!];
            const fl = func.fieldLists[instr.fields!];
            const fields: Record<string, Value> = {};
            for (const f of fl) fields[f.name] = regs[f.reg];
            const v: StructValue = { __struct: name, fields };
            regs[instr.a!] = v;
            this.maybeGc([v]);
            break;
          }
          case Op.AllocVariant: {
            const tag = func.strings[instr.imm!];
            const [enumName, variant] = tag.split("::");
            const data = func.regLists[instr.regs!].map((r) => regs[r]);
            const v: VariantValue = { __variant: enumName, variant, data };
            regs[instr.a!] = v;
            this.maybeGc([v]);
            break;
          }
          case Op.AllocArray: {
            const elems = func.regLists[instr.regs!].map((r) => regs[r]);
            const arr: Value[] = elems;
            regs[instr.a!] = arr;
            this.maybeGc(arr);
            break;
          }
          case Op.AllocTuple: {
            const elems = func.regLists[instr.regs!].map((r) => regs[r]);
            const arr: Value[] = elems;
            regs[instr.a!] = arr;
            this.maybeGc(arr);
            break;
          }
          case Op.AllocMap: {
            const flat = func.regLists[instr.regs!];
            const m = new Map<Value, Value>();
            for (let i = 0; i < flat.length; i += 2) {
              m.set(regs[flat[i]], regs[flat[i + 1]]);
            }
            regs[instr.a!] = m;
            this.maybeGc([m as unknown as Value]);
            break;
          }
          case Op.AllocRange: {
            const start = regs[instr.b!] as number;
            const end = regs[instr.c!] as number;
            const adjEnd = instr.imm ? end + 1 : end;
            const r: Range = { __range: "range", start, end: adjEnd, step: 1 };
            regs[instr.a!] = r;
            break;
          }
          case Op.LoadField: {
            const obj = regs[instr.b!];
            if (!isStruct(obj)) throw new PanicSignal(`cannot access field '${func.strings[instr.imm!]}' on ${typeof obj}`);
            const name = func.strings[instr.imm!];
            if (!(name in obj.fields)) throw new PanicSignal(`struct ${obj.__struct} has no field '${name}'`);
            regs[instr.a!] = obj.fields[name];
            break;
          }
          case Op.StoreField: {
            const obj = regs[instr.a!];
            const name = func.strings[instr.imm!];
            if (!isStruct(obj)) throw new PanicSignal(`cannot assign field '${name}' on non-struct`);
            obj.fields[name] = regs[instr.b!];
            break;
          }
          case Op.IndexGet: {
            const obj = regs[instr.b!];
            const idx = regs[instr.c!];
            if (Array.isArray(obj)) {
              const i = idx as number;
              if (i < 0 || i >= obj.length) throw new PanicSignal(`array index out of bounds: ${i}`);
              regs[instr.a!] = obj[i];
            } else if (typeof obj === "string") {
              const i = idx as number;
              if (i < 0 || i >= obj.length) throw new PanicSignal(`string index out of bounds: ${i}`);
              regs[instr.a!] = obj[i];
            } else if (obj instanceof Map) {
              if (!obj.has(idx)) throw new PanicSignal(`map key not found: ${display(idx)}`);
              regs[instr.a!] = obj.get(idx) as Value;
            } else {
              throw new PanicSignal(`cannot index into ${typeof obj}`);
            }
            break;
          }
          case Op.IndexSet: {
            const obj = regs[instr.a!];
            const idx = regs[instr.b!];
            const val = regs[instr.c!];
            if (Array.isArray(obj)) {
              const i = idx as number;
              if (i < 0 || i >= obj.length) throw new PanicSignal(`array index out of bounds: ${i}`);
              obj[i] = val;
            } else if (obj instanceof Map) {
              obj.set(idx, val);
            } else {
              throw new PanicSignal("cannot index-assign into non-array/map");
            }
            break;
          }
          case Op.TupleGet: {
            const obj = regs[instr.b!];
            if (!Array.isArray(obj)) throw new PanicSignal(`cannot apply tuple field .${instr.imm} to non-tuple`);
            const i = instr.imm!;
            if (i < 0 || i >= obj.length) throw new PanicSignal(`tuple index out of bounds: ${i}`);
            regs[instr.a!] = obj[i];
            break;
          }
          case Op.Len: {
            const v = regs[instr.b!];
            if (typeof v === "string" || Array.isArray(v)) regs[instr.a!] = v.length;
            else if (v instanceof Map) regs[instr.a!] = v.size;
            else if (isStruct(v)) regs[instr.a!] = Object.keys(v.fields).length;
            else throw new PanicSignal(`len: unsupported value ${typeof v}`);
            break;
          }
          case Op.Push: {
            const arr = regs[instr.a!];
            if (!Array.isArray(arr)) throw new PanicSignal("push: expected array");
            arr.push(regs[instr.b!]);
            break;
          }
          case Op.PopArr: {
            const arr = regs[instr.b!];
            if (!Array.isArray(arr)) throw new PanicSignal("pop: expected array");
            regs[instr.a!] = arr.pop() ?? null;
            break;
          }

          // ---- Closures / boxes ----
          case Op.MakeClosure: {
            const funcIdx = instr.imm!;
            const capRegs = func.regLists[instr.regs!];
            const upvalues: Box[] = [];
            for (const r of capRegs) {
              const val = regs[r];
              if (isBox(val)) upvalues.push(val);
              else {
                const box: Box = { __box: true, value: val };
                upvalues.push(box);
              }
            }
            const c: Closure = { __closure: true, func: funcIdx, upvalues };
            regs[instr.a!] = c;
            // The enclosing frame's variable for the fn name also needs to
            // be set to this closure value (for recursive references from
            // sibling code in the enclosing function). The codegen emits
            // a `Move` instruction immediately after MakeClosure to copy
            // `c` into the variable's register; we don't need to do
            // anything special here.
            // Set the new function's selfReg in its own frame: this is done
            // when the closure is invoked (see callClosure).
            this.maybeGc([c as unknown as Value]);
            break;
          }
          case Op.GetUpvalue: {
            // Return the Box itself (caller will Unbox or SetBox as needed).
            // We store the Box object as a Value (it's a runtime Value with
            // __box=true).
            const box = upvalues[instr.imm!];
            regs[instr.a!] = box as unknown as Value;
            break;
          }
          case Op.SetUpvalue: {
            const box = upvalues[instr.imm!];
            box.value = regs[instr.b!];
            break;
          }
          case Op.MakeBox: {
            const box: Box = { __box: true, value: regs[instr.b!] };
            regs[instr.a!] = box;
            break;
          }
          case Op.Unbox: {
            const v = regs[instr.b!];
            if (!isBox(v)) {
              // Some captures aren't boxed (immutable captures). Treat as
              // identity.
              regs[instr.a!] = v;
            } else {
              regs[instr.a!] = v.value;
            }
            break;
          }
          case Op.SetBox: {
            const box = regs[instr.a!];
            if (isBox(box)) box.value = regs[instr.b!];
            break;
          }

          // ---- Pattern matching ----
          case Op.Match: {
            const scrutinee = regs[instr.a!];
            const table = func.matchTables[instr.imm!];
            let matched = false;
            for (const entry of table) {
              // Save the regs state so we can roll back on a failed match
              // (the pattern may have written some bindings before failing).
              const savedRegs = regs.slice();
              if (this.tryMatch(entry, scrutinee, frame, func, instr.imm!)) {
                ip = entry.target;
                matched = true;
                break;
              }
              // Restore regs.
              for (let i = 0; i < savedRegs.length; i++) regs[i] = savedRegs[i];
            }
            if (!matched) {
              throw new PanicSignal("no match arm matched");
            }
            break;
          }

          // ---- Print / cast / panic ----
          case Op.Print: {
            this.stdout(display(regs[instr.a!]));
            break;
          }
          case Op.CastInt: { regs[instr.a!] = Math.trunc(regs[instr.b!] as number); break; }
          case Op.CastFloat: { regs[instr.a!] = regs[instr.b!] as number; break; }
          case Op.CastBool: { regs[instr.a!] = truthy(regs[instr.b!]); break; }
          case Op.CastString: { regs[instr.a!] = display(regs[instr.b!]); break; }
          case Op.Panic: { throw new PanicSignal(display(regs[instr.a!])); }
          case Op.UnwrapOrProp: {
            const v = regs[instr.b!];
            if (isVariant(v) && (v.variant === "Ok" || v.variant === "Some")) {
              regs[instr.a!] = v.data.length > 0 ? v.data[0] : null;
            } else if (isVariant(v) && (v.variant === "Err" || v.variant === "None")) {
              throw new ReturnSignal(v);
            } else {
              throw new PanicSignal(`? operator applied to non-Result/Option: ${display(v)}`);
            }
            break;
          }
          case Op.SelfRef: {
            // SelfRef: write the current closure value into a register.
            // The current closure is in selfReg of the current frame.
            // But we don't have access to it here — the VM sets selfReg
            // before invoking the body. We just write from selfReg into
            // the dest. Actually, the codegen doesn't emit SelfRef in
            // v1 (MakeClosure handles self-reference). This is a no-op.
            break;
          }
          case Op.LoadGlobal: {
            const name = func.strings[instr.imm!];
            const g = this.globals.get(name);
            if (g === undefined) throw new PanicSignal(`undefined global '${name}'`);
            regs[instr.a!] = g;
            break;
          }

          case Op.Nop: break;
          case Op.Trace: break;
          case Op.Breakpoint: break;
          default:
            throw new PanicSignal(`unhandled opcode ${Op[instr.op]} (op=${instr.op})`);
        }
      }
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      throw e;
    }
  }

  /** Globals populated from the main function. */
  globals: Map<string, Value> = new Map();

  /** Call any callable Value (closure or native). */
  callValue(fnVal: Value, args: Value[]): Value {
    if (isClosure(fnVal)) return this.callClosure(fnVal, args);
    if (isNative(fnVal)) return fnVal.fn(...args);
    throw new PanicSignal(`cannot call non-function value`);
  }

  /** Try to match a pattern against `value`. On success, writes bindings
   * into the frame's registers (via the frame's nameToReg map populated
   * by the codegen's matchBindings side table) and returns true. On
   * failure, returns false (the caller rolls back any partial writes). */
  tryMatch(
    entry: MatchTableEntry,
    value: Value,
    frame: Frame,
    func: BytecodeFunc,
    tableIdx: number,
  ): boolean {
    switch (entry.patternKind) {
      case "Wildcard":
        return true;
      case "Bind": {
        if (entry.bindName === undefined) return false;
        const reg = this.resolveBindingReg(func, tableIdx, entry.bindName);
        if (reg >= 0) frame.regs[reg] = value;
        return true;
      }
      case "Lit":
        return valueEq(value, entry.litValue ?? null);
      case "Tuple": {
        if (!Array.isArray(value)) return false;
        if (!entry.subregs || entry.subregs.length !== value.length) return false;
        for (let i = 0; i < entry.subregs.length; i++) {
          if (!this.tryMatch(entry.subregs[i].pattern, value[i], frame, func, tableIdx)) return false;
        }
        return true;
      }
      case "Array": {
        if (!Array.isArray(value)) return false;
        if (!entry.subregs) return false;
        if (entry.rest) {
          if (entry.subregs.length > value.length) return false;
        } else {
          if (entry.subregs.length !== value.length) return false;
        }
        for (let i = 0; i < entry.subregs.length; i++) {
          if (!this.tryMatch(entry.subregs[i].pattern, value[i], frame, func, tableIdx)) return false;
        }
        return true;
      }
      case "Struct": {
        if (!isStruct(value)) return false;
        if (entry.structName && value.__struct !== entry.structName) return false;
        if (!entry.fieldBindings) return true;
        for (const fb of entry.fieldBindings) {
          if (!(fb.name in value.fields)) return false;
          if (!this.tryMatch(fb.pattern, value.fields[fb.name], frame, func, tableIdx)) return false;
        }
        return true;
      }
      case "Enum": {
        if (!isVariant(value)) return false;
        if (entry.enumName && value.__variant !== entry.enumName) return false;
        if (entry.variant && value.variant !== entry.variant) return false;
        if (!entry.subregs) return true;
        if (entry.subregs.length !== value.data.length) {
          // Allow unit variant (0 subpatterns, 0 data).
          if (entry.subregs.length === 0 && value.data.length === 0) return true;
          return false;
        }
        for (let i = 0; i < entry.subregs.length; i++) {
          if (!this.tryMatch(entry.subregs[i].pattern, value.data[i], frame, func, tableIdx)) return false;
        }
        return true;
      }
      case "Or": {
        if (!entry.orPatterns) return false;
        for (const sub of entry.orPatterns) {
          const savedRegs = frame.regs.slice();
          if (this.tryMatch(sub.pattern, value, frame, func, tableIdx)) return true;
          for (let i = 0; i < savedRegs.length; i++) frame.regs[i] = savedRegs[i];
        }
        return false;
      }
    }
  }

  /** Resolve a binding name to a register index. We use the codegen's
   * `__matchBindings` side table, keyed by `${tableIdx}:${name}`. */
  resolveBindingReg(func: BytecodeFunc, tableIdx: number, name: string): number {
    const map = (func as BytecodeFunc & { __matchBindings?: Map<string, number> }).__matchBindings;
    if (!map) return -1;
    return map.get(`${tableIdx}:${name}`) ?? -1;
  }

  /** Set up a binding (called by external code, e.g., the codegen's
   * matchBindings setup). */
  setBinding(func: BytecodeFunc, tableIdx: number, name: string, reg: number): void {
    const map = (func as BytecodeFunc & { __matchBindings?: Map<string, number> }).__matchBindings ?? new Map<string, number>();
    (func as BytecodeFunc & { __matchBindings?: Map<string, number> }).__matchBindings = map;
    map.set(`${tableIdx}:${name}`, reg);
  }

  //--------------------------------------------------------------------------
  // Inline builtins (same set as the tree-walker)
  //--------------------------------------------------------------------------

  installInlineBuiltins(): void {
    this.builtins.set("print", (s) => { this.stdout(display(s)); return null; });
    this.builtins.set("println", (s) => { this.stdout(display(s)); return null; });
    this.builtins.set("range", (...args) => {
      let start = 0, end = 0, step = 1;
      if (args.length === 1) end = args[0] as number;
      else if (args.length === 2) { start = args[0] as number; end = args[1] as number; }
      else if (args.length >= 3) { start = args[0] as number; end = args[1] as number; step = args[2] as number; }
      return { __range: "range", start, end, step } as Value;
    });
    this.builtins.set("len", (v) => {
      if (typeof v === "string" || Array.isArray(v)) return v.length;
      if (v instanceof Map) return v.size;
      if (isStruct(v)) return Object.keys(v.fields).length;
      throw new PanicSignal(`len: unsupported value ${typeof v}`);
    });
    this.builtins.set("type_of", (v) => {
      if (v === null) return "unit";
      if (typeof v === "number") return Number.isInteger(v) ? "int" : "float";
      if (typeof v === "string") return "string";
      if (typeof v === "boolean") return "bool";
      if (Array.isArray(v)) return "array";
      if (v instanceof Map) return "map";
      if (isStruct(v)) return v.__struct;
      if (isVariant(v)) return v.__variant;
      if (isClosure(v)) return "fn";
      if (isNative(v)) return "fn";
      if (isRange(v)) return "range";
      return typeof v;
    });
    this.builtins.set("assert", (cond, msg) => {
      if (!truthy(cond)) throw new PanicSignal(`assertion failed${msg ? ": " + display(msg) : ""}`);
      return null;
    });
    this.builtins.set("assert_eq", (a, b) => {
      if (!valueEq(a, b)) throw new PanicSignal(`assertion failed: ${display(a)} != ${display(b)}`);
      return null;
    });
    this.builtins.set("panic", (msg) => { throw new PanicSignal(display(msg)); });
    this.builtins.set("str", (v) => display(v));
    this.builtins.set("int", (v) => {
      if (typeof v === "string") {
        const n = parseInt(v, 10);
        if (Number.isNaN(n)) throw new PanicSignal(`int: cannot parse '${v}'`);
        return n;
      }
      return Math.trunc(v as number);
    });
    this.builtins.set("float", (v) => {
      if (typeof v === "string") {
        const n = parseFloat(v);
        if (Number.isNaN(n)) throw new PanicSignal(`float: cannot parse '${v}'`);
        return n;
      }
      return v as number;
    });
    this.builtins.set("min", (...args) => {
      if (args.length === 0) return 0;
      if (args.length === 1 && Array.isArray(args[0])) return Math.min(...(args[0] as number[]));
      return Math.min(...(args as number[]));
    });
    this.builtins.set("max", (...args) => {
      if (args.length === 0) return 0;
      if (args.length === 1 && Array.isArray(args[0])) return Math.max(...(args[0] as number[]));
      return Math.max(...(args as number[]));
    });
    this.builtins.set("abs", (n) => Math.abs(n as number));
    this.builtins.set("sqrt", (n) => Math.sqrt(n as number));
    this.builtins.set("push", (arr, v) => {
      if (!Array.isArray(arr)) throw new PanicSignal("push: expected array");
      arr.push(v);
      return arr;
    });
    this.builtins.set("pop", (arr) => {
      if (!Array.isArray(arr)) throw new PanicSignal("pop: expected array");
      return arr.pop() ?? null;
    });
    // iter_to_items: convert a Value into a flat list of items. Used by
    // the lowered for-in loop.
    this.builtins.set("iter_to_items", (v) => {
      if (Array.isArray(v)) return v;
      if (isRange(v)) {
        const out: Value[] = [];
        if (v.step > 0) { for (let i = v.start; i < v.end; i += v.step) out.push(i); }
        else if (v.step < 0) { for (let i = v.start; i > v.end; i += v.step) out.push(i); }
        return out;
      }
      if (typeof v === "string") return Array.from(v) as Value[];
      if (v instanceof Map) return Array.from(v.keys());
      throw new PanicSignal(`cannot iterate over ${typeof v}`);
    });
    // Higher-order builtins — invoke Aether closures via this.callValue.
    this.builtins.set("map", (arr, fn) => {
      if (!Array.isArray(arr)) throw new PanicSignal("map: expected array");
      const out: Value[] = [];
      for (let i = 0; i < arr.length; i++) out.push(this.callValue(fn, [arr[i], i]));
      return out;
    });
    this.builtins.set("filter", (arr, fn) => {
      if (!Array.isArray(arr)) throw new PanicSignal("filter: expected array");
      const out: Value[] = [];
      for (let i = 0; i < arr.length; i++) {
        if (truthy(this.callValue(fn, [arr[i], i]))) out.push(arr[i]);
      }
      return out;
    });
    this.builtins.set("reduce", (arr, fn, init) => {
      if (!Array.isArray(arr)) throw new PanicSignal("reduce: expected array");
      let acc = init;
      for (let i = 0; i < arr.length; i++) acc = this.callValue(fn, [acc, arr[i], i]);
      return acc;
    });
  }
}

//----------------------------------------------------------------------------
// Truthiness (matching the tree-walker's semantics)
//----------------------------------------------------------------------------

function truthy(v: Value): boolean {
  if (typeof v === "boolean") return v;
  if (v === null) return false;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof Map) return v.size > 0;
  return true;
}
