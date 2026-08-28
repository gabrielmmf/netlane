// TEMPLATE — set the ceiling in .architect.json `context.budgetTokens`.
//
// Measures what is loaded into EVERY session before the agent has read a single
// line of code, and fails when it crosses the ceiling.
//
// Model performance degrades as context fills, and instruction files only ever
// grow: every incident adds a paragraph, nothing removes one. The result is an
// AGENTS.md nobody reads, where the three rules that matter are buried among
// forty that do not. Without a number, "keep it short" loses every argument
// against "but this one is important".
//
// The number also settles those arguments honestly: at the ceiling, adding a
// rule means removing one, or promoting it to a check (`record-learning`
// rung 3) so it can leave the text entirely.
//
// Usage:  node scripts/context-budget.mjs [--verbose]
// Exit:   0 within budget   1 over   2 the check could not run

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { recordGateFail } from "./_ledger.mjs";

const CONFIG = ".architect.json";
const DEFAULT_BUDGET = 12_000;

// The architect plugin's own skill, agent and command descriptions load in
// every session the moment the plugin is installed via the marketplace — they
// are not files in THIS repository, so nothing above would otherwise count
// them, and a repo sitting exactly at budget would in fact already be over it.
// Measured directly against this plugin's own frontmatter (CHANGELOG 0.8.0);
// override via context.pluginOverheadTokens if a future plugin version drifts
// from this figure before the template catches up.
const PLUGIN_OVERHEAD_TOKENS = 1180;

function cannotRun(message) {
  console.error(`::error::context-budget could not run: ${message}`);
  process.exit(2);
}

if (!existsSync(CONFIG)) cannotRun(`${CONFIG} not found. Run /organize.`);

let config;
try {
  config = JSON.parse(readFileSync(CONFIG, "utf8"));
} catch (error) {
  cannotRun(`${CONFIG} is not valid JSON: ${error.message}`);
}

const budget = config.context?.budgetTokens ?? DEFAULT_BUDGET;
const verbose = process.argv.includes("--verbose");

// ~4 characters per token holds well enough for English prose and markdown to
// make a budget meaningful. This is a ratio, not a tokenizer: being 10% off
// does not change whether a 900-line AGENTS.md is a problem.
const tokens = (text) => Math.ceil(text.length / 4);

const entries = [];

function add(label, path, weight = 1) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  entries.push({ label, path, tokens: Math.ceil(tokens(text) * weight) });
}

// 1. Always loaded, in full.
add("agent instructions", "AGENTS.md");
add("agent instructions", "CLAUDE.md");
add("constitution", config.constitution ?? "docs/constitution.md");

// 2. Skill frontmatter. Bodies load on demand; the DESCRIPTIONS are resident for
//    every skill, all session, because that is what routing matches against.
const skillsDir = ".claude/skills";
if (existsSync(skillsDir)) {
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(skillsDir, entry.name, "SKILL.md");
    if (!existsSync(file)) continue;
    const front = readFileSync(file, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
    entries.push({ label: `skill: ${entry.name} (description)`, path: file, tokens: tokens(front) });
  }
}

// 3. Whatever SessionStart prints is prepended to every session too.
const sessionHook = ".claude/hooks/session-start.mjs";
if (existsSync(sessionHook)) {
  entries.push({
    label: "SessionStart output (estimated)",
    path: sessionHook,
    tokens: 120, // it is capped at a handful of short lines by design
  });
}

// 4. The architect plugin itself, if this repository has it installed.
if (existsSync(".architect.json")) {
  entries.push({
    label: "architect plugin (skill/agent/command descriptions)",
    path: ".architect.json",
    tokens: config.context?.pluginOverheadTokens ?? PLUGIN_OVERHEAD_TOKENS,
  });
}

if (entries.length === 0) {
  cannotRun("found nothing that loads by default — is this the repository root?");
}

const total = entries.reduce((sum, e) => sum + e.tokens, 0);
entries.sort((a, b) => b.tokens - a.tokens);

if (verbose || total > budget) {
  for (const entry of entries) {
    const bar = "█".repeat(Math.max(1, Math.round((entry.tokens / total) * 40)));
    console.log(`  ${String(entry.tokens).padStart(6)}  ${bar} ${entry.label}`);
  }
  console.log("");
}

if (total > budget) {
  const worst = entries[0];
  console.error(
    `::error::Every session starts with ~${total} tokens of instructions, over the ` +
      `${budget} budget. Largest: ${worst.path} (~${worst.tokens}).\n` +
      `  Cut in this order:\n` +
      `    1. anything a CI check already enforces — say it once, in the check\n` +
      `    2. anything an agent learns by reading the code in ten seconds\n` +
      `    3. rules with no reason attached — they get ignored anyway\n` +
      `  Raise context.budgetTokens only if you can say what the extra buys.`,
  );
  recordGateFail("context-budget", { total, budget, worst: worst.label });
  process.exit(1);
}

console.log(
  `context-budget: ~${total} tokens load every session, within the ${budget} budget ` +
    `(${Math.round((total / budget) * 100)}%).`,
);
