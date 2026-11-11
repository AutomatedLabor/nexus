/**
 * Quick smoke test for the formatter — checks idempotency on all 15 examples.
 * Run with: `bun aether/tools/formatter/smoke.ts`
 */
import { format } from "./formatter";
import * as fs from "fs";
import * as path from "path";

const dir = "/home/z/my-project/examples";
const files = fs.readdirSync(dir).filter(f => f.endsWith(".ae"));
let allOk = true;
for (const f of files) {
  const src = fs.readFileSync(path.join(dir, f), "utf8");
  const once = format(src);
  const twice = format(once);
  const ok = once === twice;
  console.log(f, ok ? "IDEMPOTENT" : "NOT-IDEMPOTENT");
  if (!ok) {
    allOk = false;
    console.log("--- once ---");
    console.log(once.slice(0, 1000));
    console.log("--- twice ---");
    console.log(twice.slice(0, 1000));
    console.log("--- diff (first difference) ---");
    for (let i = 0; i < Math.min(once.length, twice.length); i++) {
      if (once[i] !== twice[i]) {
        console.log(`diff at offset ${i}:`);
        console.log("once:", JSON.stringify(once.slice(Math.max(0, i - 50), i + 200)));
        console.log("twice:", JSON.stringify(twice.slice(Math.max(0, i - 50), i + 200)));
        break;
      }
    }
  }
}
console.log(allOk ? "ALL IDEMPOTENT" : "SOME FAILED");
