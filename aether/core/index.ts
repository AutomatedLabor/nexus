/**
 * aether/core/index.ts
 * =====================
 * Public API for the Aether compiler + runtime.
 *
 * Pipeline:
 *   source → lex → parse → check → run
 *
 * `compile(source, opts)` runs all four stages and returns a `CompileResult`
 * with the tokens, AST, type errors, and (if no parse/lex errors) the runtime
 * result. `compileAndRun` is an alias kept for documentation parity.
 *
 * Stage failures are non-fatal: if the lexer/parser/sema produces errors, the
 * downstream stages are still attempted (with whatever partial AST/program is
 * available) so the playground can show all errors at once. Runtime errors are
 * captured in `runtime.error` and don't propagate as exceptions.
 */
import type { Program, Node } from "./ast/ast";
import { lex, lexWithErrors, type Token, type LexError } from "./lexer/lexer";
import { parse, type ParseError } from "./parser/parser";
import { check, type TypeError, type CheckResult } from "./sema/sema";
import { run, type RunOptions, type RunResult, type Value } from "./eval/eval";

export * from "./ast/ast";
export { lex, lexWithErrors } from "./lexer/lexer";
export type { Token, LexError } from "./lexer/lexer";
export { parse, parseSource } from "./parser/parser";
export type { ParseError, ParseResult } from "./parser/parser";
export { check } from "./sema/sema";
export type { TypeError, CheckResult, SemaWarning } from "./sema/sema";
export { run } from "./eval/eval";
export type { RunOptions, RunResult, Value, Env } from "./eval/eval";
export { display as displayValue, valueEq } from "./eval/eval";

// --- v2: Bytecode VM pipeline ---
export { lowerToIr, checkIrWellFormed } from "./ir/ir";
export type { IrProgram, IrFunc, IrBlock, IrOp, BinKind, UnKind, IrWellFormedIssue } from "./ir/ir";
export { compileToBytecode } from "../vm/codegen/codegen";
export type { BytecodeModule } from "../vm/bytecode/bytecode";
export { runBytecode } from "../vm/interpreter/vm";
export type { VmOptions, VmResult } from "../vm/interpreter/vm";
export { Op } from "../vm/bytecode/bytecode";
export { assemble, disassemble, verifyBytecode } from "../vm/bytecode/bytecode";
export type { Instr, BytecodeFunc, Constant } from "../vm/bytecode/bytecode";

// --- v3: WebAssembly backend ---
export { compileIrToWasm, emitWasmText, emitWasmBinary, compileAndRunWasm, createHost, createWasmImports } from "../vm/wasm/wasm";
export type { WasmModule, WasmFunc, WasmInstr, WasmValType, WasmHost, WasmRunResult } from "../vm/wasm/wasm";

// --- v3: x86-64 native backend ---
export { compileIrToX86, emitAsm, emitElfStub, compileAndRunNative } from "../vm/x86/x86";
export type { X86Module, X86Func, X86Instr, X86Operand, CondCode, X86RunResult } from "../vm/x86/x86";

// --- v3: JIT compiler (tier-2, profile-guided) ---
export { JitCompiler, compileAndRunJit } from "../vm/jit/jit";
export type { JitOptions, JitStats, JitRunResult } from "../vm/jit/jit";

export interface CompileResult {
  /** Lexed tokens (empty if lexer hit a fatal error). */
  tokens: Token[];
  /** Parse errors (empty on clean parse). */
  parseErrors: ParseError[];
  /** Parsed program (always present even on parse errors — partial). */
  ast: Program;
  /** Type-checker errors (empty on clean check). */
  typeErrors: TypeError[];
  /** Runtime result, or null if parsing failed entirely. */
  runtime: RunResult | null;
  /** True iff lex/parse/typecheck/runtime all succeeded without errors. */
  ok: boolean;
  /** Convenience: any errors (lex/parse/type/runtime) flattened + tagged. */
  errors: Array<{ stage: "lex" | "parse" | "type" | "runtime"; message: string }>;
}

/**
 * Compile and (attempt to) run an Aether source string.
 *
 * The runtime is only invoked if the parser produced a non-empty program
 * AND no lexer errors occurred; type errors do not block execution (Aether
 * scripts with type warnings still run, like a lenient playground).
 */
export function compile(source: string, opts: RunOptions = {}): CompileResult {
  const errors: CompileResult["errors"] = [];

  // --- Lex ---
  const { tokens, errors: lexErrs } = lexWithErrors(source, "<aether>");
  for (const e of lexErrs) errors.push({ stage: "lex", message: e.message });

  // --- Parse ---
  const { program, errors: parseErrs } = parse(tokens, "<aether>");
  for (const e of parseErrs) errors.push({ stage: "parse", message: e.message });

  // --- Type-check ---
  let typeErrors: TypeError[] = [];
  try {
    const r = check(program);
    typeErrors = r.errors;
    for (const e of typeErrors) errors.push({ stage: "type", message: e.message });
  } catch (e) {
    // Sema threw (shouldn't happen — it accumulates). Surface as a type error.
    typeErrors = [{ message: (e as Error).message, loc: program.loc }];
    errors.push({ stage: "type", message: (e as Error).message });
  }

  // --- Run ---
  let runtime: RunResult | null = null;
  // Run unless lex or parse hard-failed (no body at all). Type errors are
  // reported but do not block execution (lenient playground semantics).
  if (program.body.length > 0 && lexErrs.length === 0) {
    try {
      runtime = run(program, opts);
      if (runtime.error) errors.push({ stage: "runtime", message: runtime.error.message });
    } catch (e) {
      runtime = {
        value: null,
        output: [],
        steps: 0,
        error: { message: (e as Error).message },
      };
      errors.push({ stage: "runtime", message: (e as Error).message });
    }
  }

  const ok = errors.length === 0;
  return { tokens, parseErrors: parseErrs, ast: program, typeErrors, runtime, ok, errors };
}

/** Alias of {@link compile}. */
export function compileAndRun(source: string, opts: RunOptions = {}): CompileResult {
  return compile(source, opts);
}

// --- v2: Bytecode VM pipeline public API ---
import { lowerToIr, type IrProgram } from "./ir/ir";
import { compileToBytecode, type BytecodeModule } from "../vm/codegen/codegen";
import { runBytecode, type VmOptions, type VmResult } from "../vm/interpreter/vm";

export interface CompileVmResult {
  /** Lexed tokens. */
  tokens: Token[];
  /** Parsed program. */
  ast: Program;
  /** Type-checker errors (non-blocking). */
  typeErrors: TypeError[];
  /** Lowered IR. */
  ir: IrProgram;
  /** Compiled bytecode module. */
  bytecode: BytecodeModule;
  /** VM runtime result (null if lowering/codegen threw). */
  runtime: VmResult | null;
  /** True iff every stage succeeded cleanly. */
  ok: boolean;
}

/**
 * Compile and run Aether source on the v2 bytecode VM (AST → IR → bytecode → interpreter).
 *
 * The bytecode VM is faster than the tree-walking evaluator and is the production
 * runtime target for v2. The tree-walker remains the default for the REPL/LSP
 * where latency dominates; this function is for batch execution.
 */
export function compileToVm(source: string, opts: VmOptions = {}): CompileVmResult {
  const errors: CompileResult["errors"] = [];
  const { tokens, errors: lexErrs } = lexWithErrors(source, "<aether>");
  for (const e of lexErrs) errors.push({ stage: "lex", message: e.message });
  const { program, errors: parseErrs } = parse(tokens, "<aether>");
  for (const e of parseErrs) errors.push({ stage: "parse", message: e.message });
  let typeErrors: TypeError[] = [];
  try {
    typeErrors = check(program).errors;
    for (const e of typeErrors) errors.push({ stage: "type", message: e.message });
  } catch (e) {
    typeErrors = [{ message: (e as Error).message, loc: program.loc }];
  }
  let ir: IrProgram | null = null;
  let bytecode: BytecodeModule | null = null;
  let runtime: VmResult | null = null;
  if (program.body.length > 0 && lexErrs.length === 0) {
    try {
      ir = lowerToIr(program);
      bytecode = compileToBytecode(ir);
      runtime = runBytecode(bytecode, "<main>", [], opts);
      if (runtime.error) errors.push({ stage: "runtime", message: runtime.error.message });
    } catch (e) {
      runtime = runtime ?? { value: null, output: [], steps: 0, error: { message: (e as Error).message } };
      errors.push({ stage: "runtime", message: (e as Error).message });
    }
  }
  const ok = errors.length === 0;
  return {
    tokens,
    ast: program,
    typeErrors,
    ir: ir ?? lowerToIr(program),
    bytecode: bytecode ?? compileToBytecode(lowerToIr(program)),
    runtime,
    ok,
  };
}

/** Walk an AST node — re-export the visitor helpers. */
export * from "./ast/visitor";

/** Convenience: print an AST back to source-ish Aether text. */
export { printAst } from "./ast/visitor";

/** Serialize/deserialize AST nodes to JSON-safe shapes. */
export { astToJson, jsonToAst, astEqual, cloneAst } from "./ast/serialize";

/** Type-tag for any AST node (re-exported for convenience). */
export type { Node };
