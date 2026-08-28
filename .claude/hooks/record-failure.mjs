// TEMPLATE — no adaptation needed.
//
// PostToolUseFailure. Appends a normalized signature to the event ledger.
//
// `record-learning` has a good four-rung ladder and one weakness: it depends on
// somebody NOTICING that the same thing went wrong twice. That is exactly the
// observation nobody makes — the second occurrence feels like bad luck, the
// third like the codebase being annoying, and the tenth is normal.
//
// This hook makes the noticing mechanical. It costs nothing at runtime: no
// model call, no analysis, one appended line. `repeat-failures.mjs` does the
// grouping later, and only when asked.
//
// The payload shape for this event is not fully documented, so every field is
// read defensively. Getting the signature slightly wrong costs a missed
// grouping; throwing here would break the tool result the agent is waiting for.

import { readInput, recordEvent, config } from "./_lib.mjs";

const input = await readInput();
if (!config()) process.exit(0);

const message = String(
  input.error ?? input.tool_result ?? input.result ?? input.message ?? "",
).slice(0, 2000);

if (!message.trim()) process.exit(0);

/** Strip everything that varies between occurrences of the SAME failure, so
 *  two runs of one broken thing collapse into one signature. Without this,
 *  every failure is unique and nothing ever repeats. */
function signature(text) {
  return text
    .split("\n")
    .slice(0, 6) // the tail of a stack trace varies; the head identifies it
    .join(" ")
    .replace(/[A-Za-z]:[\\/][^\s:]+|\/[\w.\-/]+/g, "<path>")
    .replace(/\b[0-9a-f]{7,40}\b/gi, "<hash>")
    .replace(/\b\d{4}-\d{2}-\d{2}[T ][\d:.]+Z?/g, "<time>")
    .replace(/\b\d+(\.\d+)?(ms|s|kb|mb)?\b/gi, "<n>")
    .replace(/0x[0-9a-f]+/gi, "<addr>")
    .replace(/["'`][^"'`]{24,}["'`]/g, "<literal>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

recordEvent("tool-failure", signature(message), {
  tool: input.tool_name ?? "unknown",
  // The first line is what a human reads in the report; the signature is only
  // for grouping and is unreadable by design.
  headline: message.split("\n").find((l) => l.trim())?.trim().slice(0, 200) ?? "",
  exitCode: input.exit_code ?? null,
});
