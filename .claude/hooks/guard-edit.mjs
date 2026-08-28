// TEMPLATE — reads the tier-3 path list from .architect.json. No adaptation
// needed; calibrate the paths there, not here.
//
// PreToolUse(Edit|Write|NotebookEdit). The tier guard.
//
// Tier 3 is whatever, in this repo, is expensive to unwind: the schema, the
// migration history, authentication, the money path, published contracts, the
// workflows that hold secrets. Everywhere else an agent can be wrong and the
// cost is a revert.
//
// The rule this enforces is the one thing an agent under context pressure will
// otherwise talk itself out of: touching those paths requires a plan a human
// approved, not a plan the agent wrote for itself thirty seconds earlier.
//
// Escape hatch: ARCHITECT_ALLOW_TIER3=1. Deliberately an environment variable
// and not a phrase in the conversation, so it cannot be reached by anything the
// model reads.

import { existsSync, readFileSync } from "node:fs";
import { readInput, config, globToRegExp, repoPath, deny, allow, specs } from "./_lib.mjs";

if (process.env.ARCHITECT_ALLOW_TIER3 === "1") allow();

const input = await readInput();
const file = input.tool_input?.file_path;
if (!file) allow();

const settings = config();
if (!settings) allow(); // no config, no basis to deny

const tier3 = settings.tiers?.["3"]?.paths ?? [];
if (tier3.length === 0) allow();

const path = repoPath(file);
const matched = tier3.find((glob) => globToRegExp(glob).test(path));
if (!matched) allow();

// An approved plan is one whose spec is being worked on now and whose Approval
// section has been filled in with something other than the template's own text.
const approved = specs().find((spec) => {
  if (spec.status !== "in-progress" && spec.status !== "ready") return false;
  if (!existsSync(spec.planFile)) return false;
  const plan = readFileSync(spec.planFile, "utf8");
  const line = plan.match(/^\s*-?\s*Approved by:\s*(.+)$/m)?.[1]?.trim();
  return Boolean(line) && !line.includes("{{") && !/^not required/i.test(line);
});

if (approved) allow();

deny(
  `${path} is a tier-3 path in this repository (matched "${matched}").\n\n` +
    `Tier 3 means a mistake here is expensive to unwind, so it needs an agreed ` +
    `spec and a plan a human approved — not a decision made mid-task.\n\n` +
    `What to do:\n` +
    `  1. /spec     — write down what this change must do, and get the open ` +
    `questions answered\n` +
    `  2. /plan     — approach, constitution gate, rollback\n` +
    `  3. ask the human to approve the plan (fill "Approved by:" in plan.md)\n` +
    `  4. then this edit goes through\n\n` +
    `If this genuinely is not a tier-3 change, the path list in ` +
    `.architect.json is wrong — say so rather than working around the guard.`,
  "tier-3-no-plan",
);
