import { NextResponse } from "next/server";
import { z } from "zod";
import ZAI from "z-ai-web-dev-sdk";

/**
 * POST /api/assistant
 *
 * Aether playground AI code assistant.  Takes the user's current Aether
 * source plus a natural-language question, forwards both to the z-ai
 * LLM with an Aether-aware system prompt, and returns `{ answer }`.
 *
 * The z-ai-web-dev-sdk is imported and used HERE (server-side) only — it
 * must never be bundled into the browser.  Next.js route handlers run
 * on the server by default, so this is safe.
 */

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  code: z.string().max(200_000, "code too long (200k chars max)"),
  question: z.string().min(1, "question is required").max(8_000, "question too long"),
});

// A short, accurate Aether cheat-sheet distilled from
// docs/book/ch02-your-first-program.md.  Kept compact so we leave room
// for the user's code + question inside the model's context window.
const AETHER_SYSTEM_PROMPT = `You are the AI code assistant for the Aether language playground.
Aether is a small teaching language. Answer questions about Aether code concisely and accurately.

KEY AETHER FACTS (use these; do not invent features):
- Programs are evaluated top-to-bottom like a script. No main().
- Bindings: \`let x = e;\` (immutable), \`let mut x = e;\` (mutable), \`const NAME = e;\` (compile-time constant).
- Primitive types: int, float, bool, string, char, unit (), tuple, array (homogeneous), map (built via mapNew()).
- int widens to float automatically; the reverse needs \`as int\` (truncates) or \`as float\`.
- \`int / int\` is FLOAT division; use \`int(a / b)\` for integer truncation.
- f-strings: \`f"x = {x}"\`. printf-style: \`string_format("%d", n)\` (stdlib).
- Functions: \`fn add(a: int, b: int) -> int { a + b }\` — last expression in a block is the return value; prefer bare-expression returns over early \`return X;\` after a block.
- Closures: \`fn(x: int) -> int { x + base }\` capture outer bindings.
- Control flow: \`if\`/\`else if\`/\`else\` are expressions. \`while cond { ... }\`, \`for x in xs { ... }\`, \`match v { Variant => ... } \` with deep matching. \`break\`/\`continue\` work in loops.
- IMPORTANT QUIRKS to keep in mind when explaining/fixing Aether code:
  - For-loop variable scope can be buggy; prefer \`while\` or \`map\`/\`filter\`/\`reduce\` or recursion over C-style \`for i = 0; i < n; i = i + 1\` when iterating.
  - \`return X;\` immediately after a closing \`}\` can fail to compile; use a bare-expression return (the last expression in the block).
  - \`/\` is always float division; for integer division write \`int(a / b)\`.
- Builtins available everywhere: print, println, range, len, type_of, assert, assert_eq, panic, str, int, float, min, max, abs, sqrt, push, pop, map, filter, reduce, charCode, fromCharCode, strSlice.
- Stdlib modules registered as bare names: string (split, join, replace, reverse, len, format, ...), math (floor, ceil, pow, log, ...), collections (mapNew, mapGet, mapSet, mapKeys, mapValues, ...), list, set, functional, statistics, bits, tree, graph, heap, sort, matrix, parser, random, bloom, lru_cache, trie, state_machine, skip_list, interval, disjoint_set, bimap, symtab, sparse, memoize, cidr, pqueue, queue, stack, deque, rbtree, and more. Each function is a top-level name (no module prefix) once registered.
- Result/Option: \`Result::Ok(x)\`, \`Result::Err("msg")\`, \`Option::Some(x)\`, \`Option::None\`. The \`?\` postfix operator propagates Err out of the current function.
- Enums and structs: \`enum Color { Red, Green, Blue }\` then \`Color::Red\`. Structs: \`struct P { x: int, y: int }\` with \`P { x: 1, y: 2 }\`.
- The playground is lenient: type errors do NOT block execution, so a program can produce both a type error and runtime output.
- Errors are reported by stage: lex, parse, type, runtime.

WHEN ANSWERING:
- Be concrete and short. Show Aether code when relevant.
- If the user's code has a bug, point at the exact line and suggest a fix that respects Aether's quirks (avoid C-style for loops, prefer bare-expression returns, remember \`/\` is float division).
- If asked to generate code, produce idiomatic Aether (use the builtins above; use \`while\` or \`map\`/\`filter\`/\`reduce\`, recursion; avoid early \`return X;\`).
- Do not invent Aether features that don't exist (no async/await syntax, no classes, no traits in surface syntax, no exceptions — panics only).`;

export async function POST(req: Request): Promise<Response> {
  let parsedBody: z.infer<typeof BodySchema>;
  try {
    const json = await req.json();
    parsedBody = BodySchema.parse(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "invalid request body";
    return NextResponse.json({ error: "bad request: " + msg }, { status: 400 });
  }

  const { code, question } = parsedBody;

  try {
    const zai = await ZAI.create();

    const userContent =
      `Here is the user's Aether code:\n\n\`\`\`aether\n${code}\n\`\`\`\n\nQuestion: ${question}\n\nAnswer concisely in Markdown.`;

    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: AETHER_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      thinking: { type: "disabled" },
    });

    const answer: string | undefined =
      completion?.choices?.[0]?.message?.content ?? undefined;

    if (!answer || answer.trim().length === 0) {
      return NextResponse.json(
        { error: "The model returned an empty answer. Please try a different question." },
        { status: 502 },
      );
    }

    return NextResponse.json({ answer });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "POST /api/assistant",
    body: "{ code: string, question: string }",
    returns: "{ answer: string }",
  });
}
