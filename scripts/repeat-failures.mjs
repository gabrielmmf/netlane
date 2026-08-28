// TEMPLATE — no adaptation needed.
//
// Groups the event ledger and surfaces what keeps happening.
//
// The point is not the report. The point is that a repeated failure becomes an
// EVENT — something that shows up and asks to be fixed — instead of a feeling
// that the codebase is a bit annoying today. A thing that happens three times
// has a mechanism, and a mechanism can be turned into a check.
//
// Read by session-start (silently, cheap) and by /architect report.
//
// Usage:  node scripts/repeat-failures.mjs [--threshold 3] [--days 14] [--json]
// Exit:   always 0 — this reports, it does not gate. Failing a PR because a
//         command failed twice last week would be punishing the wrong person
//         at the wrong moment.

import { readFileSync, existsSync } from "node:fs";

const LEDGER = ".claude/.architect-events.jsonl";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(args[i + 1]);
};
const threshold = flag("threshold", 3);
const days = flag("days", 14);
const asJson = args.includes("--json");

if (!existsSync(LEDGER)) {
  if (asJson) console.log("[]");
  process.exit(0);
}

const since = Date.now() - days * 86_400_000;
const groups = new Map();

for (const line of readFileSync(LEDGER, "utf8").split("\n")) {
  if (!line.trim()) continue;
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    continue; // a torn line from a concurrent append is not worth failing over
  }
  if (event.kind !== "tool-failure") continue;
  const at = Date.parse(event.ts);
  if (!Number.isFinite(at) || at < since) continue;

  const group = groups.get(event.signature) ?? {
    count: 0,
    headline: event.headline ?? "",
    tool: event.tool,
    first: at,
    last: at,
  };
  group.count++;
  group.first = Math.min(group.first, at);
  group.last = Math.max(group.last, at);
  groups.set(event.signature, group);
}

const repeats = [...groups.values()]
  .filter((g) => g.count >= threshold)
  .sort((a, b) => b.count - a.count);

if (asJson) {
  console.log(JSON.stringify(repeats));
  process.exit(0);
}

if (repeats.length === 0) {
  console.log(`No failure repeated ${threshold}+ times in the last ${days} days.`);
  process.exit(0);
}

console.log(`Repeated failures (last ${days} days):\n`);
for (const group of repeats) {
  const spanDays = Math.max(1, Math.round((group.last - group.first) / 86_400_000));
  console.log(`  ${group.count}x over ${spanDays}d  [${group.tool}]  ${group.headline}`);
}
console.log(
  `\nEach of these has a mechanism. Use the record-learning skill: state the` +
    `\nfailure precisely, then place it at the HIGHEST rung that applies —` +
    `\nusually rung 3, an automated check, because a thing that already happened` +
    `\n${repeats[0].count} times will happen again.`,
);
