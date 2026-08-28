// TEMPLATE — no adaptation needed.
//
// Measures the harness itself. Everything else here measures the code.
//
// The question nobody asks: is any of this working? A repository can be covered
// in gates that have never once refused anything, and it looks identical to a
// repository where they are load-bearing. The difference only shows up in
// counts.
//
// The most useful line in the output is the LAST one — guards that have never
// fired. Each is either unnecessary or broken, and there is no way to tell which
// from reading it. Deleting the unnecessary ones is how the harness stays cheap
// enough that people keep it.
//
// Usage:  node scripts/harness-report.mjs [--days 90]
// Exit:   always 0 — this informs, it does not gate.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const daysIndex = args.indexOf("--days");
const days = daysIndex === -1 ? 90 : Number(args[daysIndex + 1]);
const since = `${days} days ago`;

const config = existsSync(".architect.json")
  ? JSON.parse(readFileSync(".architect.json", "utf8"))
  : {};
const specsDir = config.specs?.dir ?? "docs/specs";
const archiveDir = config.specs?.archive ?? join(specsDir, "archive");
const productionBranch = config.productionBranch ?? "main";

function git(...a) {
  try {
    return execFileSync("git", a, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

const out = [`# Harness report — last ${days} days\n`];

// ---------------------------------------------------------- change size

// Small changes get reviewed; large ones get approved. The trend matters more
// than the number: a harness that is working pushes this down over time.
const sizes = git("log", `--since=${since}`, "--format=%H", "--no-merges")
  .split("\n")
  .filter(Boolean)
  .map((sha) => {
    const stat = git("show", "--shortstat", "--format=", sha);
    const ins = Number(stat.match(/(\d+) insertion/)?.[1] ?? 0);
    const del = Number(stat.match(/(\d+) deletion/)?.[1] ?? 0);
    return ins + del;
  })
  .filter((n) => n > 0)
  .sort((a, b) => a - b);

if (sizes.length > 0) {
  const median = sizes[Math.floor(sizes.length / 2)];
  const p90 = sizes[Math.floor(sizes.length * 0.9)];
  out.push(
    `## Change size\n${sizes.length} commits · median ${median} lines · p90 ${p90} lines\n`,
  );
  if (median > 400) {
    out.push(
      `> Median change is large. Big diffs get approved rather than reviewed —\n` +
        `> consider whether tier 2 is being skipped, or whether tasks are being\n` +
        `> batched instead of landed one at a time.\n`,
    );
  }
}

// ---------------------------------------------------------- direct pushes

const direct = git(
  "log", `--since=${since}`, "--first-parent", "--no-merges", "--format=%h %s", productionBranch,
).split("\n").filter(Boolean);

out.push(
  `## Commits reaching ${productionBranch} outside a merge\n` +
    (direct.length === 0
      ? "None. Everything went through a pull request.\n"
      : `${direct.length} — the branching model is advisory here, not enforced.\n`),
);

// ---------------------------------------------------------- spec freshness

function specDirs(dir, found = []) {
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = join(dir, entry.name);
    if (relative(".", full).split(sep).join("/") === relative(".", archiveDir).split(sep).join("/")) continue;
    if (existsSync(join(full, "spec.md"))) found.push(full);
    else specDirs(full, found);
  }
  return found;
}

const specs = specDirs(specsDir);
let stale = 0;
const staleNames = [];

for (const dir of specs) {
  const text = readFileSync(join(dir, "spec.md"), "utf8");
  const block = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
  if (block.match(/^status:\s*(\S+)/m)?.[1] !== "shipped") continue;
  const owns = [...(block.match(/^owns:\s*\[(.*?)\]/ms)?.[1] ?? "").matchAll(/["']([^"']+)["']/g)]
    .map((m) => m[1].replace(/\*+$/, ""));
  if (owns.length === 0) continue;

  // Count commits touching the owned paths since the spec was last edited.
  // Comparing dates instead looks equivalent and is not: %ct has one-second
  // resolution, so a spec and the code changed in the same second compare as
  // "not stale" — which is precisely the case where someone edited the code and
  // meant to update the spec.
  const specCommit = git("log", "-1", "--format=%H", "--", dir);
  if (!specCommit) continue;
  const moved = Number(git("rev-list", "--count", `${specCommit}..HEAD`, "--", ...owns));
  if (moved > 0) {
    stale++;
    staleNames.push(`${relative(".", dir).split(sep).join("/")} (${moved} commit(s) since)`);
  }
}

out.push(
  `## Specs\n${specs.length} live · ${stale} describing code that has moved since\n` +
    (stale > 0
      ? staleNames.map((n) => `  - ${n}`).join("\n") +
        `\n\n> This number IS the drift. It only goes down by editing the specs or\n` +
        `> narrowing their "owns" globs.\n`
      : ""),
);

// ---------------------------------------------------------- the ledger

const LEDGER = ".claude/.architect-events.jsonl";
const events = existsSync(LEDGER)
  ? readFileSync(LEDGER, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter((e) => e && Date.parse(e.ts) > Date.now() - days * 86_400_000)
  : [];

const denials = new Map();
const gateFails = new Map();
for (const event of events) {
  if (event.kind === "guard-deny") {
    denials.set(event.signature, (denials.get(event.signature) ?? 0) + 1);
  } else if (event.kind === "gate-fail") {
    gateFails.set(event.signature, (gateFails.get(event.signature) ?? 0) + 1);
  }
}

const failures = events.filter((e) => e.kind === "tool-failure").length;

out.push(
  `## Activity\n${events.length} events · ${failures} tool failures · ` +
    `${[...denials.values()].reduce((a, b) => a + b, 0)} guard denials · ` +
    `${[...gateFails.values()].reduce((a, b) => a + b, 0)} gate failures\n`,
);

if (denials.size > 0) {
  out.push(
    "### Guards that fired\n" +
      [...denials.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id, n]) => `  ${String(n).padStart(4)}x  ${id}`)
        .join("\n") +
      "\n",
  );
}

if (gateFails.size > 0) {
  out.push(
    "### Gate checks that caught something\n" +
      [...gateFails.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id, n]) => `  ${String(n).padStart(4)}x  ${id}`)
        .join("\n") +
      "\n\n> Which rule is actually load-bearing. One that fires constantly is\n" +
      "> either catching real problems or is miscalibrated — read a few of its\n" +
      "> failures to tell which.\n",
  );
}

// The point of the whole ledger.
const installed = existsSync(".claude/hooks")
  ? readdirSync(".claude/hooks").filter((f) => f.startsWith("guard-"))
  : [];
const knownIds = [
  "force-push", "push-to-production", "commit-on-production", "agent-merge",
  "recursive-delete", "read-dotenv", "discard-work", "tier-3-no-plan",
  "unreviewed-pr", "unresolved-review-finding",
];
const silent = knownIds.filter((id) => !denials.has(id));

const gateScripts = [
  "trace-check", "spec-freshness", "env-contract", "context-budget", "constitution-check",
].filter((name) => existsSync(join("scripts", `${name}.mjs`)) && !gateFails.has(name));

if (installed.length > 0 && silent.length > 0) {
  out.push(
    `### Guards that never fired\n` +
      silent.map((id) => `  - ${id}`).join("\n") +
      `\n\n> Each is either unnecessary here or broken, and reading it will not\n` +
      `> tell you which. Feed one the input it should refuse. If it refuses and\n` +
      `> nobody has ever hit it, delete it — an unused guard is context and\n` +
      `> latency on every tool call.\n`,
  );
}

if (gateScripts.length > 0) {
  out.push(
    `### Gate checks that have never caught anything\n` +
      gateScripts.map((name) => `  - ${name}`).join("\n") +
      `\n\n> Less alarming than a silent guard — these often mean the repo is\n` +
      `> genuinely clean. Worth a look only if it surprises you: an env-contract\n` +
      `> that has never fired on a repo with real secrets, or a trace-check that\n` +
      `> has never fired despite specs being edited, is more likely broken than\n` +
      `> lucky.\n`,
  );
}

console.log(out.join("\n"));
