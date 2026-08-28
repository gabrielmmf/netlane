// TEMPLATE — no adaptation needed. Shared by every gate script in this
// directory. Deliberately NOT the hooks' `_lib.mjs`: that module reads hook
// stdin payloads and makes permission decisions, neither of which a script
// invoked directly from `npm run verify` or a CI job has any use for. This
// file is the one thing both sides actually share — appending one line to the
// ledger — kept small enough that duplicating it would cost more than the
// import.
//
// Recording is fire-and-forget. A gate that could fail because its own
// bookkeeping failed would be worse than a gate with no bookkeeping at all.

import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/** A gate failing IS the finding — this only records that it fired, so
 *  `harness-report.mjs` can say which rule is actually load-bearing versus
 *  which one has never once caught anything. Never called on exit 2: a gate
 *  that could not run did not learn anything about the repository. */
export function recordGateFail(script, detail = {}) {
  try {
    const dir = ".claude";
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      kind: "gate-fail",
      signature: script,
      ...detail,
    });
    appendFileSync(join(dir, ".architect-events.jsonl"), `${line}\n`);
  } catch {
    // CI runners are ephemeral and sometimes read-only outside the workspace.
    // The gate's own exit code is what matters; this is a nice-to-have.
  }
}
