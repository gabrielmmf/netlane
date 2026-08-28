// TEMPLATE — no adaptation needed.
//
// SessionStart. Stdout on exit 0 becomes context the agent can see.
//
// Why this exists: a new session knows the repository but not the situation.
// Which change is in flight, what tier it is, whether anything is still waiting
// on an answer, whether the tree is clean. Without it every session re-derives
// that from scratch — badly, and sometimes wrongly, which is how an agent
// cheerfully starts a second parallel change on top of a half-finished one.
//
// Keep the output SHORT. It is prepended to every session, so it competes for
// the same attention as AGENTS.md. Facts only, no advice.

import { execFileSync } from "node:child_process";
import { config, specs, projectDir } from "./_lib.mjs";

const settings = config();
if (!settings) {
  console.log(
    "architect: no .architect.json in this repo. Run /organize to set up the " +
      "branching, gates and spec loop, or work without them.",
  );
  process.exit(0);
}

function git(...args) {
  try {
    return execFileSync("git", args, {
      cwd: projectDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

const lines = [];

const branch = git("branch", "--show-current");
const production = settings.productionBranch ?? "main";
lines.push(
  branch === production
    ? `Branch: ${branch} — this is the production branch. Branch before editing.`
    : `Branch: ${branch}`,
);

const dirty = git("status", "--porcelain");
if (dirty) {
  const count = dirty.split("\n").length;
  lines.push(`Uncommitted: ${count} file(s) — finish or stash before starting something new.`);
}

const live = specs().filter((s) => s.status === "in-progress" || s.status === "ready");
if (live.length === 0) {
  lines.push("No spec in progress.");
} else {
  for (const spec of live.slice(0, 3)) {
    const open = (spec.text.match(/\[NEEDS CLARIFICATION/g) ?? []).length;
    lines.push(
      `Spec ${spec.id} ${spec.title} — tier ${spec.tier}, ${spec.status}` +
        (open > 0 ? `, ${open} question(s) still unanswered` : ""),
    );
    if (open > 0) {
      lines.push(
        `  Answer them before planning: ${spec.dir.split(/[\\/]/).slice(-2).join("/")}/spec.md`,
      );
    }
  }
}

const verify = settings.commands?.verify;
if (verify) lines.push(`Verify with: ${verify}`);

// One line, never more. This output is prepended to every session and competes
// for the same attention as AGENTS.md — the detail belongs in the script, which
// the agent runs only if the line makes it worth running.
try {
  const repeats = JSON.parse(
    // cwd is explicit: without it the child inherits whatever directory
    // Claude Code happened to spawn this hook from, and the relative script
    // path silently 404s the moment that differs from the project root — the
    // whole block just goes quiet, caught below, with no visible symptom.
    execFileSync(process.execPath, ["scripts/repeat-failures.mjs", "--json"], {
      cwd: projectDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
  if (repeats.length > 0) {
    lines.push(
      `${repeats.length} failure(s) keep recurring (worst: ${repeats[0].count}x ` +
        `"${repeats[0].headline.slice(0, 60)}") — \`node scripts/repeat-failures.mjs\`, ` +
        `then record-learning.`,
    );
  }
} catch {
  // No ledger yet, or no script. Not worth a word.
}

console.log(lines.join("\n"));
