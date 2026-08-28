// TEMPLATE — no adaptation needed.
//
// Stop. The verification gate: the turn does not end on unverified work.
//
// Reporting a task done when it was never verified is the single worst outcome
// available to an agent. It is worse than not finishing, because it transfers a
// false belief to the human, who then builds on it. Every other guard here
// prevents a bad action; this one prevents a bad REPORT.
//
// Two design constraints, both learned the hard way:
//
//  1. It must be BOUNDED. A Stop hook that can block forever turns a broken
//     verify command into a session nobody can end. This one blocks at most
//     twice, then lets the turn finish with a visible warning. A guard that can
//     trap you is a guard that gets disabled globally, taking the useful ones
//     with it.
//
//  2. It must not run the slow thing. The fast, deterministic gates run here;
//     the full build does not. Instead the hook checks whether verification has
//     happened SINCE the last edit, which track-work.mjs records.
//
// Escape hatch: ARCHITECT_SKIP_STOP=1.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { readInput, config, projectDir } from "./_lib.mjs";

if (process.env.ARCHITECT_SKIP_STOP === "1") process.exit(0);

await readInput(); // drain stdin so the caller is not left waiting

const settings = config();
if (!settings) process.exit(0);

const STATE = join(projectDir, ".claude", ".architect-state.json");
const state = existsSync(STATE)
  ? (() => {
      try {
        return JSON.parse(readFileSync(STATE, "utf8"));
      } catch {
        return {};
      }
    })()
  : {};

const edited = state.lastEditAt ?? 0;
const verified = state.lastVerifyAt ?? 0;
if (edited === 0 || verified >= edited) process.exit(0);

const attempts = state.stopBlocks ?? 0;
if (attempts >= 2) {
  console.error(
    `architect: still no record of \`${settings.commands?.verify}\` passing since ` +
      `${state.lastEditFile} changed. Letting the turn end — do not report this ` +
      `work as done.`,
  );
  process.exit(0); // bounded: never block a third time
}

const problems = [];

// The cheap gates run here because they are sub-second and catch the mistakes
// a human reviewer will not: an unproven criterion, a spec left behind.
for (const script of ["scripts/trace-check.mjs", "scripts/spec-freshness.mjs"]) {
  if (!existsSync(join(projectDir, script))) continue;
  try {
    execFileSync(process.execPath, [script], {
      cwd: projectDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    // Exit 2 means the gate itself is broken — that is not the agent's fault
    // and must not be reported as a domain failure.
    if (error.status === 2) {
      const first = (error.stderr ?? "").trim().split("\n")[0];
      console.error(`architect: ${script} could not run — ${first}`);
    } else {
      problems.push((error.stderr || error.stdout || "").trim());
    }
  }
}

mkdirSync(dirname(STATE), { recursive: true });
writeFileSync(STATE, JSON.stringify({ ...state, stopBlocks: attempts + 1 }, null, 2));

const reason = [
  `\`${state.lastEditFile}\` changed and \`${settings.commands?.verify}\` has not passed since.`,
  problems.length > 0 ? `\n${problems.join("\n")}` : "",
  `\nRun \`${settings.commands?.verify}\`, fix what it reports, then finish.`,
  `If it genuinely does not apply to this change, say so explicitly rather than`,
  `reporting the work as verified.`,
].join(" ");

process.stdout.write(JSON.stringify({ decision: "block", reason }));
