/**
 * aether/tools/cli/cli.test.ts
 * =============================
 * 30 test cases for the standalone Aether CLI.
 *
 * Coverage:
 *   - parseArgs (arg parsing, flags, positionals)
 *   - main dispatch (help, unknown command, missing args)
 *   - cmdRun (single-file via compileAndRun, multi-file via runModule)
 *   - cmdRunVm (bytecode VM path)
 *   - cmdCheck (clean, type error, parse error)
 *   - cmdTest (pass/fail discovery, summary)
 *   - cmdFmt (re-indents, --check mode)
 *   - cmdRepl (piped stdin)
 *   - cmdNew (scaffolds files, exits 2 if dir exists)
 *   - cmdBuild (writes bytecode binary, magic bytes)
 *   - formatSource (the inline formatter)
 *
 * Tests use a mix of direct function calls (import + invoke) and
 * child_process.execSync to verify the CLI runs as a real subprocess.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  main,
  cmdRun,
  cmdRunVm,
  cmdCheck,
  cmdTest,
  cmdFmt,
  cmdNew,
  cmdBuild,
  formatSource,
  parseArgs,
} from "./cli";

const CLI_PATH = path.resolve(__dirname, "cli.ts");
const PROJECT_ROOT = path.resolve(__dirname, "../../..");

/** Helper: run the CLI as a subprocess, return stdout (combined with stderr). */
function runCli(args: string[]): { stdout: string; stderr: string; code: number } {
  try {
    const stdout = execSync(`bun ${CLI_PATH} ${args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(" ")}`, {
      encoding: "utf8",
      timeout: 30000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { stdout, stderr: "", code: 0 };
  } catch (e: any) {
    return {
      stdout: e.stdout?.toString() ?? "",
      stderr: e.stderr?.toString() ?? "",
      code: e.status ?? 1,
    };
  }
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aether-cli-test-"));
});

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

/** Write a file under tmpDir. Returns the absolute path. */
function writeFile(name: string, content: string): string {
  const p = path.join(tmpDir, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf8");
  return p;
}

//----------------------------------------------------------------------------
// parseArgs
//----------------------------------------------------------------------------

describe("parseArgs", () => {
  it("parses a command + positional", () => {
    const a = parseArgs(["run", "hello.ae"]);
    expect(a.command).toBe("run");
    expect(a.positional).toEqual(["hello.ae"]);
  });

  it("parses long flags with values", () => {
    const a = parseArgs(["build", "hello.ae", "--out", "hello.aec"]);
    expect(a.command).toBe("build");
    expect(a.positional).toEqual(["hello.ae"]);
    expect(a.flags["out"]).toBe("hello.aec");
  });

  it("parses short flags with values", () => {
    const a = parseArgs(["build", "hello.ae", "-o", "hello.aec"]);
    expect(a.flags["o"]).toBe("hello.aec");
  });

  it("parses boolean flags (no value)", () => {
    const a = parseArgs(["fmt", "hello.ae", "--check"]);
    expect(a.flags["check"]).toBe(true);
  });

  it("defaults command to 'help' for empty argv", () => {
    const a = parseArgs([]);
    expect(a.command).toBe("help");
    expect(a.positional).toEqual([]);
  });
});

//----------------------------------------------------------------------------
// main dispatch
//----------------------------------------------------------------------------

describe("main — dispatch", () => {
  it("help prints usage and exits 0", () => {
    // Capture stdout for the in-process call.
    const original = process.stdout.write.bind(process.stdout);
    let captured = "";
    process.stdout.write = ((s: string) => { captured += s; return true; }) as typeof process.stdout.write;
    try {
      const code = main(["help"]);
      expect(code).toBe(0);
      expect(captured).toContain("aether");
      expect(captured).toContain("run");
    } finally {
      process.stdout.write = original;
    }
  });

  it("no args is equivalent to help", () => {
    const original = process.stdout.write.bind(process.stdout);
    let captured = "";
    process.stdout.write = ((s: string) => { captured += s; return true; }) as typeof process.stdout.write;
    try {
      const code = main([]);
      expect(code).toBe(0);
      expect(captured).toContain("aether");
    } finally {
      process.stdout.write = original;
    }
  });

  it("unknown command exits 2 and prints to stderr", () => {
    const originalErr = process.stderr.write.bind(process.stderr);
    let captured = "";
    process.stderr.write = ((s: string) => { captured += s; return true; }) as typeof process.stderr.write;
    try {
      const code = main(["bogus"]);
      expect(code).toBe(2);
      expect(captured).toContain("unknown command");
    } finally {
      process.stderr.write = originalErr;
    }
  });

  it("missing positional exits 2 (run without file)", () => {
    const originalErr = process.stderr.write.bind(process.stderr);
    let captured = "";
    process.stderr.write = ((s: string) => { captured += s; return true; }) as typeof process.stderr.write;
    try {
      const code = main(["run"]);
      expect(code).toBe(2);
      expect(captured).toContain("missing");
    } finally {
      process.stderr.write = originalErr;
    }
  });
});

//----------------------------------------------------------------------------
// cmdRun — single-file
//----------------------------------------------------------------------------

describe("cmdRun — single-file", () => {
  it("runs a simple Aether program and prints output", () => {
    const f = writeFile("hello.ae", 'print("hello world");\n');
    const original = process.stdout.write.bind(process.stdout);
    let captured = "";
    process.stdout.write = ((s: string) => { captured += s; return true; }) as typeof process.stdout.write;
    let code: number;
    try {
      code = cmdRun(f);
    } finally {
      process.stdout.write = original;
    }
    expect(code).toBe(0);
    expect(captured).toContain("hello world");
  });

  it("computes fib(10) = 55", () => {
    const f = writeFile("fib.ae", "fn fib(n: int) -> int { if n < 2 { n } else { fib(n-1) + fib(n-2) } } print(fib(10));\n");
    const original = process.stdout.write.bind(process.stdout);
    let captured = "";
    process.stdout.write = ((s: string) => { captured += s; return true; }) as typeof process.stdout.write;
    let code: number;
    try {
      code = cmdRun(f);
    } finally {
      process.stdout.write = original;
    }
    expect(code).toBe(0);
    expect(captured.trim()).toBe("55");
  });

  it("exits 1 on runtime error (panic)", () => {
    const f = writeFile("panic.ae", 'panic("kaboom");\n');
    const originalOut = process.stdout.write.bind(process.stdout);
    const originalErr = process.stderr.write.bind(process.stderr);
    let errCaptured = "";
    process.stdout.write = ((s: string) => { return true; }) as typeof process.stdout.write;
    process.stderr.write = ((s: string) => { errCaptured += s; return true; }) as typeof process.stderr.write;
    let code: number;
    try {
      code = cmdRun(f);
    } finally {
      process.stdout.write = originalOut;
      process.stderr.write = originalErr;
    }
    expect(code).toBe(1);
    expect(errCaptured).toContain("kaboom");
  });

  it("exits 2 on file not found", () => {
    const originalErr = process.stderr.write.bind(process.stderr);
    let captured = "";
    process.stderr.write = ((s: string) => { captured += s; return true; }) as typeof process.stderr.write;
    let code: number;
    try {
      // readSource calls process.exit(2), so we wrap in try/finally.
      expect(() => cmdRun("/nonexistent.ae")).toThrow();
    } finally {
      process.stderr.write = originalErr;
    }
    expect(captured).toContain("cannot read");
  });
});

//----------------------------------------------------------------------------
// cmdRun — multi-file (via runModule)
//----------------------------------------------------------------------------

describe("cmdRun — multi-file", () => {
  it("runs a multi-file program (import from utils.ae)", () => {
    writeFile("utils.ae", 'pub fn greet(name: string) -> string { "Hello, " + name + "!" }\n');
    const mainPath = writeFile("main.ae", 'import { greet } from "./utils.ae";\nprint(greet("Aether"));\n');
    const original = process.stdout.write.bind(process.stdout);
    let captured = "";
    process.stdout.write = ((s: string) => { captured += s; return true; }) as typeof process.stdout.write;
    let code: number;
    try {
      code = cmdRun(mainPath);
    } finally {
      process.stdout.write = original;
    }
    expect(code).toBe(0);
    expect(captured.trim()).toBe("Hello, Aether!");
  });
});

//----------------------------------------------------------------------------
// cmdRunVm
//----------------------------------------------------------------------------

describe("cmdRunVm", () => {
  it("runs on the bytecode VM and prints output", () => {
    const f = writeFile("fib.ae", "fn fib(n: int) -> int { if n < 2 { n } else { fib(n-1) + fib(n-2) } } print(fib(10));\n");
    const original = process.stdout.write.bind(process.stdout);
    let captured = "";
    process.stdout.write = ((s: string) => { captured += s; return true; }) as typeof process.stdout.write;
    let code: number;
    try {
      code = cmdRunVm(f);
    } finally {
      process.stdout.write = original;
    }
    expect(code).toBe(0);
    expect(captured.trim()).toBe("55");
  });

  it("exits 1 on runtime error", () => {
    const f = writeFile("panic.ae", 'panic("vm-kaboom");\n');
    const originalOut = process.stdout.write.bind(process.stdout);
    const originalErr = process.stderr.write.bind(process.stderr);
    let captured = "";
    process.stdout.write = ((s: string) => { return true; }) as typeof process.stdout.write;
    process.stderr.write = ((s: string) => { captured += s; return true; }) as typeof process.stderr.write;
    let code: number;
    try {
      code = cmdRunVm(f);
    } finally {
      process.stdout.write = originalOut;
      process.stderr.write = originalErr;
    }
    expect(code).toBe(1);
    expect(captured).toContain("vm-kaboom");
  });
});

//----------------------------------------------------------------------------
// cmdCheck
//----------------------------------------------------------------------------

describe("cmdCheck", () => {
  it("prints 'OK' on a clean program", () => {
    const f = writeFile("clean.ae", "print(1 + 1);\n");
    const original = process.stdout.write.bind(process.stdout);
    let captured = "";
    process.stdout.write = ((s: string) => { captured += s; return true; }) as typeof process.stdout.write;
    let code: number;
    try {
      code = cmdCheck(f);
    } finally {
      process.stdout.write = original;
    }
    expect(code).toBe(0);
    expect(captured).toContain("OK");
  });

  it("exits 1 on a type error", () => {
    const f = writeFile("typerr.ae", 'let x: int = "hello";\nprint(x);\n');
    const originalErr = process.stderr.write.bind(process.stderr);
    let captured = "";
    process.stderr.write = ((s: string) => { captured += s; return true; }) as typeof process.stderr.write;
    let code: number;
    try {
      code = cmdCheck(f);
    } finally {
      process.stderr.write = originalErr;
    }
    expect(code).toBe(1);
    expect(captured).toContain("type");
  });

  it("exits 1 on a parse error", () => {
    const f = writeFile("parseerr.ae", "let x = ;\n");
    const originalErr = process.stderr.write.bind(process.stderr);
    let captured = "";
    process.stderr.write = ((s: string) => { captured += s; return true; }) as typeof process.stderr.write;
    let code: number;
    try {
      code = cmdCheck(f);
    } finally {
      process.stderr.write = originalErr;
    }
    expect(code).toBe(1);
    expect(captured).toContain("parse");
  });
});

//----------------------------------------------------------------------------
// cmdTest
//----------------------------------------------------------------------------

describe("cmdTest", () => {
  it("discovers and runs *.test.ae files", () => {
    writeFile("t1.test.ae", 'assert_eq(1+1, 2);\nprint("t1");\n');
    writeFile("t2.test.ae", 'assert_eq(2+2, 4);\nprint("t2");\n');
    const original = process.stdout.write.bind(process.stdout);
    let captured = "";
    process.stdout.write = ((s: string) => { captured += s; return true; }) as typeof process.stdout.write;
    let code: number;
    try {
      code = cmdTest(tmpDir);
    } finally {
      process.stdout.write = original;
    }
    expect(code).toBe(0);
    expect(captured).toContain("PASS");
    expect(captured).toContain("2 passed");
  });

  it("reports FAIL on a failing test and exits 1", () => {
    writeFile("ok.test.ae", 'assert_eq(1+1, 2);\n');
    writeFile("bad.test.ae", 'assert_eq(1, 2);\n');
    const original = process.stdout.write.bind(process.stdout);
    let captured = "";
    process.stdout.write = ((s: string) => { captured += s; return true; }) as typeof process.stdout.write;
    let code: number;
    try {
      code = cmdTest(tmpDir);
    } finally {
      process.stdout.write = original;
    }
    expect(code).toBe(1);
    expect(captured).toContain("FAIL");
    expect(captured).toContain("1 passed, 1 failed");
  });

  it("exits 2 on missing directory", () => {
    const originalErr = process.stderr.write.bind(process.stderr);
    let captured = "";
    process.stderr.write = ((s: string) => { captured += s; return true; }) as typeof process.stderr.write;
    let code: number;
    try {
      code = cmdTest(path.join(tmpDir, "nonexistent"));
    } finally {
      process.stderr.write = originalErr;
    }
    expect(code).toBe(2);
    expect(captured).toContain("directory not found");
  });

  it("discovers *.ae files with `assert` even without .test.ae suffix", () => {
    writeFile("plain.ae", 'assert_eq(1+1, 2);\nprint("plain");\n');
    const original = process.stdout.write.bind(process.stdout);
    let captured = "";
    process.stdout.write = ((s: string) => { captured += s; return true; }) as typeof process.stdout.write;
    let code: number;
    try {
      code = cmdTest(tmpDir);
    } finally {
      process.stdout.write = original;
    }
    expect(code).toBe(0);
    expect(captured).toContain("PASS");
  });

  it("prints 'no test files' when directory is empty", () => {
    const sub = path.join(tmpDir, "empty");
    fs.mkdirSync(sub);
    const original = process.stdout.write.bind(process.stdout);
    let captured = "";
    process.stdout.write = ((s: string) => { captured += s; return true; }) as typeof process.stdout.write;
    let code: number;
    try {
      code = cmdTest(sub);
    } finally {
      process.stdout.write = original;
    }
    expect(code).toBe(0);
    expect(captured).toContain("no test files");
  });
});

//----------------------------------------------------------------------------
// cmdFmt + formatSource
//----------------------------------------------------------------------------

describe("formatSource", () => {
  it("re-indents based on brace depth", () => {
    const src = "fn foo() {\nlet x = 5;\nif x > 0 {\nprint(\"x\");\n};\n}\n";
    const out = formatSource(src);
    expect(out).toContain("fn foo() {\n");
    expect(out).toContain("  let x = 5;\n");
    expect(out).toContain("  if x > 0 {\n");
    expect(out).toContain("    print(\"x\");\n");
    expect(out).toContain("  };\n");
    expect(out).toContain("}\n");
  });

  it("strips trailing whitespace", () => {
    const src = "print(1);   \nprint(2);   \n";
    const out = formatSource(src);
    expect(out).not.toContain("   \n");
    expect(out).toContain("print(1);\n");
  });

  it("preserves string literals with braces inside them", () => {
    const src = 'print("hello { world }");\n';
    const out = formatSource(src);
    // The braces inside the string should NOT change the indent.
    expect(out).toBe('print("hello { world }");\n');
  });

  it("handles comments containing braces", () => {
    const src = "// comment with { brace\nprint(1);\n";
    const out = formatSource(src);
    expect(out).toContain("// comment with { brace");
    expect(out).toContain("print(1);");
  });

  it("does not add a trailing newline if the source has none", () => {
    const src = "print(1);";
    const out = formatSource(src);
    expect(out).toBe("print(1);");
  });

  it("preserves a trailing newline if the source has one", () => {
    const src = "print(1);\n";
    const out = formatSource(src);
    expect(out).toBe("print(1);\n");
  });

  it("handles already-formatted files (idempotent)", () => {
    const src = "fn foo() {\n  let x = 5;\n}\n";
    const out = formatSource(src);
    expect(out).toBe(src);
  });
});

describe("cmdFmt", () => {
  it("formats a file in place", () => {
    const f = writeFile("unfmt.ae", "fn foo() {\nlet x = 5;\n}\n");
    const original = process.stdout.write.bind(process.stdout);
    let captured = "";
    process.stdout.write = ((s: string) => { captured += s; return true; }) as typeof process.stdout.write;
    let code: number;
    try {
      code = cmdFmt(f);
    } finally {
      process.stdout.write = original;
    }
    expect(code).toBe(0);
    const after = fs.readFileSync(f, "utf8");
    expect(after).toContain("  let x = 5;\n");
  });

  it("--check returns 1 if the file would change", () => {
    const f = writeFile("unfmt.ae", "fn foo() {\nlet x = 5;\n}\n");
    const original = process.stdout.write.bind(process.stdout);
    let captured = "";
    process.stdout.write = ((s: string) => { captured += s; return true; }) as typeof process.stdout.write;
    let code: number;
    try {
      code = cmdFmt(f, true);
    } finally {
      process.stdout.write = original;
    }
    expect(code).toBe(1);
    expect(captured).toContain("would change");
    // File unchanged.
    const after = fs.readFileSync(f, "utf8");
    expect(after).toBe("fn foo() {\nlet x = 5;\n}\n");
  });

  it("--check returns 0 if the file is already formatted", () => {
    const f = writeFile("fmt.ae", "fn foo() {\n  let x = 5;\n}\n");
    const original = process.stdout.write.bind(process.stdout);
    let captured = "";
    process.stdout.write = ((s: string) => { captured += s; return true; }) as typeof process.stdout.write;
    let code: number;
    try {
      code = cmdFmt(f, true);
    } finally {
      process.stdout.write = original;
    }
    expect(code).toBe(0);
  });
});

//----------------------------------------------------------------------------
// cmdNew
//----------------------------------------------------------------------------

describe("cmdNew", () => {
  it("scaffolds main.ae + README.md + aether.toml", () => {
    const name = "myproject";
    const dir = path.join(tmpDir, name);
    const original = process.stdout.write.bind(process.stdout);
    let captured = "";
    process.stdout.write = ((s: string) => { captured += s; return true; }) as typeof process.stdout.write;
    let code: number;
    try {
      code = cmdNew(dir);
    } finally {
      process.stdout.write = original;
    }
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(dir, "main.ae"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "README.md"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "aether.toml"))).toBe(true);
    expect(captured).toContain("created");
    const toml = fs.readFileSync(path.join(dir, "aether.toml"), "utf8");
    expect(toml).toContain(`name = "${name}"`);
    expect(toml).toContain('edition = "v2"');
  });

  it("the scaffolded main.ae runs", () => {
    const dir = path.join(tmpDir, "scaffold");
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((s: string) => { return true; }) as typeof process.stdout.write;
    try {
      cmdNew(dir);
    } finally {
      process.stdout.write = original;
    }
    // The scaffolded main.ae should compile + run.
    const r = runCli(["run", path.join(dir, "main.ae")]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Hello, Aether!");
  });

  it("exits 2 if the directory already exists", () => {
    const dir = path.join(tmpDir, "existing");
    fs.mkdirSync(dir);
    const originalErr = process.stderr.write.bind(process.stderr);
    let captured = "";
    process.stderr.write = ((s: string) => { captured += s; return true; }) as typeof process.stderr.write;
    let code: number;
    try {
      code = cmdNew(dir);
    } finally {
      process.stderr.write = originalErr;
    }
    expect(code).toBe(2);
    expect(captured).toContain("already exists");
  });
});

//----------------------------------------------------------------------------
// cmdBuild
//----------------------------------------------------------------------------

describe("cmdBuild", () => {
  it("compiles to bytecode and writes the assembled binary", () => {
    const src = writeFile("hello.ae", 'print("hello");\n');
    const out = path.join(tmpDir, "hello.aec");
    const original = process.stdout.write.bind(process.stdout);
    let captured = "";
    process.stdout.write = ((s: string) => { captured += s; return true; }) as typeof process.stdout.write;
    let code: number;
    try {
      code = cmdBuild(src, out);
    } finally {
      process.stdout.write = original;
    }
    expect(code).toBe(0);
    expect(fs.existsSync(out)).toBe(true);
    const bytes = fs.readFileSync(out);
    // Magic bytes are "AETH".
    expect(bytes.length).toBeGreaterThan(4);
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("AETH");
    expect(captured).toContain("wrote");
  });

  it("exits 2 without -o", () => {
    const src = writeFile("hello.ae", 'print("hello");\n');
    const originalErr = process.stderr.write.bind(process.stderr);
    let captured = "";
    process.stderr.write = ((s: string) => { captured += s; return true; }) as typeof process.stderr.write;
    let code: number;
    try {
      code = cmdBuild(src, undefined);
    } finally {
      process.stderr.write = originalErr;
    }
    expect(code).toBe(2);
    expect(captured).toContain("-o");
  });

  it("exits 1 on parse error", () => {
    const src = writeFile("bad.ae", "let x = ;\n");
    const out = path.join(tmpDir, "bad.aec");
    const originalErr = process.stderr.write.bind(process.stderr);
    let captured = "";
    process.stderr.write = ((s: string) => { captured += s; return true; }) as typeof process.stderr.write;
    let code: number;
    try {
      code = cmdBuild(src, out);
    } finally {
      process.stderr.write = originalErr;
    }
    expect(code).toBe(1);
    expect(captured).toContain("parse error");
    expect(fs.existsSync(out)).toBe(false);
  });
});

//----------------------------------------------------------------------------
// Subprocess integration
//----------------------------------------------------------------------------

describe("subprocess integration (bun cli.ts ...)", () => {
  it("bun cli.ts run prints 55 for fib(10)", () => {
    const f = writeFile("fib.ae", "fn fib(n: int) -> int { if n < 2 { n } else { fib(n-1) + fib(n-2) } } print(fib(10));\n");
    const r = runCli(["run", f]);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("55");
  });

  it("bun cli.ts run:vm prints 55", () => {
    const f = writeFile("fib.ae", "fn fib(n: int) -> int { if n < 2 { n } else { fib(n-1) + fib(n-2) } } print(fib(10));\n");
    const r = runCli(["run:vm", f]);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("55");
  });

  it("bun cli.ts new scaffolds a project", () => {
    const dir = path.join(tmpDir, "scaffold-subproc");
    const r = runCli(["new", dir]);
    expect(r.code).toBe(0);
    expect(fs.existsSync(path.join(dir, "main.ae"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "README.md"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "aether.toml"))).toBe(true);
  });

  it("bun cli.ts help prints usage", () => {
    const r = runCli(["help"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("aether");
    expect(r.stdout).toContain("run");
  });

  it("bun cli.ts repl reads from piped stdin", () => {
    const r = execSync(`echo 'print("hello from repl");' | bun ${CLI_PATH} repl`, {
      encoding: "utf8",
      timeout: 10000,
      cwd: PROJECT_ROOT,
    });
    expect(r).toContain("hello from repl");
  });
});
