// TEMPLATE — no adaptation needed.
//
// PreToolUse(Bash), matched on `gh pr create`. Makes `spec-reviewer` mechanical
// instead of a step the implementing agent can skip under time pressure.
//
// implement-spec has always said "run spec-reviewer before opening the PR" —
// and that sentence was the only thing enforcing it. The agent grading its own
// work is exactly the failure mode this whole harness exists to prevent, and
// leaving its one check to memory made it the single piece of the harness that
// depended on discipline while everything else became a gate.
//
// The tell for which spec a PR belongs to is the branch name: implement-spec
// has always named branches `<type>/<id>-<slug>` (e.g. `feat/007-upload-limits`)
// specifically so a spec id can be recovered from `git branch --show-current`.
// Without that convention this guard would have no way to avoid blocking a PR
// in one worktree over an unrelated unreviewed spec in another.
//
// Escape hatch: ARCHITECT_ALLOW_UNREVIEWED_PR=1.

import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { readInput, config, projectDir, specs, deny, allow } from "./_lib.mjs";

if (process.env.ARCHITECT_ALLOW_UNREVIEWED_PR === "1") allow();

const input = await readInput();
const command = input.tool_input?.command ?? "";
if (!/^gh\s+pr\s+create\b/.test(command.trim())) allow();

const settings = config();
if (!settings) allow();

let branch;
try {
  branch = execFileSync("git", ["branch", "--show-current"], {
    cwd: projectDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
} catch {
  allow(); // cannot tell => do not block
}

const match = branch.match(/^[a-z]+\/(\d+)-/);
if (!match) allow(); // does not follow the spec-branch convention — nothing to key off

const specId = match[1];
const spec = specs().find((s) => String(s.id) === specId || String(s.id).padStart(3, "0") === specId);
if (!spec) allow(); // branch looks numbered but no matching spec exists — not this guard's problem
if (spec.tier < 2) allow(); // tier 0/1 never required a spec-reviewer pass

const notes = existsSync(spec.notesFile) ? readFileSync(spec.notesFile, "utf8") : "";
// The lookahead's second branch is a true end-of-string test, not `$` — with the
// `m` flag active for the heading anchors, `$` matches end-of-LINE, which would
// stop the lazy match immediately after "## Review" itself.
const reviewMatch = notes.match(/^## Review\b[\s\S]*?(?=\n## |(?![\s\S]))/m);

if (!reviewMatch) {
  deny(
    `No "## Review" section in ${spec.notesFile.split(/[\\/]/).slice(-3).join("/")} for ` +
      `spec ${spec.id} (tier ${spec.tier}). Run the spec-reviewer subagent — fresh context, ` +
      `read-only, holding the spec — and append its findings under a "## Review" ` +
      `heading in notes.md before opening the PR.\n\n` +
      `The agent that wrote the code does not grade it; that is the entire point ` +
      `of this check.`,
    "unreviewed-pr",
  );
}

if (/❌/.test(reviewMatch[0])) {
  deny(
    `notes.md's "## Review" section for spec ${spec.id} still has an unresolved ` +
      `❌ finding. Fix it, or record why it will not be fixed, then update the ` +
      `review section before opening the PR.`,
    "unresolved-review-finding",
  );
}

allow();
