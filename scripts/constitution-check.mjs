// TEMPLATE — no adaptation needed.
//
// Confirms every constitution article got a row in a plan's gate table.
//
// The gate table is filled in by an agent reasoning about its own plan, which
// is exactly the class of self-check the plugin distrusts everywhere else — a
// table that always shows every article compliant is not proof of anything.
// This script cannot verify the REASONING behind a verdict (that is what
// spec-reviewer and the human are for), but it can prove the mechanical half:
// that no article was silently skipped. A plan missing a row for article 4
// never actually considered article 4.
//
// Deliberately NOT wired into quality.yml: CI has no reliable way to know
// which of possibly several in-progress specs a given push belongs to (see
// spec-driven.md's "several agents at once"), and guessing wrong would flag
// the wrong plan. This runs on demand — from plan-implementation while writing
// the gate table, and from spec-reviewer while checking it — where the caller
// already knows exactly which spec is in play.
//
// Usage:  node scripts/constitution-check.mjs [path/to/spec/dir]
//         with no argument, uses the most-recently-modified spec with
//         status in-progress|ready that has a plan.md
// Exit:   0 every article has a row   1 a real gap   2 could not run

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { recordGateFail } from "./_ledger.mjs";

const CONFIG = ".architect.json";

function cannotRun(message) {
  console.error(`::error::constitution-check could not run: ${message}`);
  process.exit(2);
}

if (!existsSync(CONFIG)) cannotRun(`${CONFIG} not found. Run /organize.`);

let config;
try {
  config = JSON.parse(readFileSync(CONFIG, "utf8"));
} catch (error) {
  cannotRun(`${CONFIG} is not valid JSON: ${error.message}`);
}

const constitutionFile = config.constitution ?? "docs/constitution.md";
if (!existsSync(constitutionFile)) {
  cannotRun(`${constitutionFile} not found — nothing to check the plan against.`);
}

// ---------------------------------------------------------------- find the plan

let planFile = process.argv[2];

if (planFile) {
  if (existsSync(join(planFile, "plan.md"))) planFile = join(planFile, "plan.md");
  if (!existsSync(planFile)) cannotRun(`${planFile} does not exist.`);
} else {
  const specsDir = config.specs?.dir ?? "docs/specs";
  const archiveDir = config.specs?.archive ?? join(specsDir, "archive");
  if (!existsSync(specsDir)) cannotRun(`no plan given and ${specsDir} does not exist.`);

  const candidates = [];
  for (const entry of readdirSync(specsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(specsDir, entry.name);
    if (dir === archiveDir) continue;
    const specFile = join(dir, "spec.md");
    const plan = join(dir, "plan.md");
    if (!existsSync(specFile) || !existsSync(plan)) continue;
    const status = readFileSync(specFile, "utf8").match(/^status:\s*(\S+)/m)?.[1];
    if (status === "in-progress" || status === "ready") {
      candidates.push({ plan, mtime: statSync(plan).mtimeMs });
    }
  }

  if (candidates.length === 0) {
    cannotRun(`no plan.md found under an in-progress or ready spec. Pass the ` +
      `spec directory explicitly if more than one is live.`);
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  planFile = candidates[0].plan;
}

// ---------------------------------------------------------------- count both sides

const constitution = readFileSync(constitutionFile, "utf8");
const articlesSection = constitution.match(/^## (?:Articles|Artigos)\b([\s\S]*?)(?=\n## |(?![\s\S]))/m)?.[1];
if (!articlesSection) {
  cannotRun(`${constitutionFile} has no "## Artigos" section — is this the ` +
    `real constitution or still the template?`);
}

const articleNumbers = [...articlesSection.matchAll(/^(\d+)\.\s+\S/gm)].map((m) => Number(m[1]));
if (articleNumbers.length === 0) {
  cannotRun(`no numbered articles found under "## Artigos" in ${constitutionFile}.`);
}

const plan = readFileSync(planFile, "utf8");
const gateSection = plan.match(/^## (?:Constitution gate|Aferição da constituição)\b([\s\S]*?)(?=\n## |(?![\s\S]))/m)?.[1];
if (!gateSection) {
  console.error(
    `::error file=${planFile}::no "## Aferição da constituição" section. Every plan at ` +
      `tier >= 2 needs one row per article — see plan-implementation's templates/plan.md.`,
  );
  process.exit(1);
}

// Row article cells look like "1. …" or "1 …" or just "1" — accept the leading
// number, whatever text follows it in the same cell.
const rowNumbers = [...gateSection.matchAll(/^\|\s*(\d+)[.\s]/gm)].map((m) => Number(m[1]));

const missing = articleNumbers.filter((n) => !rowNumbers.includes(n));
const extra = rowNumbers.filter((n) => !articleNumbers.includes(n));

if (missing.length > 0) {
  console.error(
    `::error file=${planFile}::the Constitution gate table has no row for ` +
      `article(s) ${missing.join(", ")} (${constitutionFile} defines ` +
      `${articleNumbers.length} article(s): ${articleNumbers.join(", ")}). A missing ` +
      `row means that article was never actually considered.`,
  );
}
if (extra.length > 0) {
  console.error(
    `::warning file=${planFile}::the gate table has row(s) for article(s) ` +
      `${extra.join(", ")}, which ${constitutionFile} does not define — a stale ` +
      `row from a renumbered or removed article.`,
  );
}

if (missing.length > 0) {
  recordGateFail("constitution-check", { missing: missing.length, plan: planFile });
  process.exit(1);
}

console.log(
  `constitution-check: all ${articleNumbers.length} article(s) have a row in ` +
    `${planFile}.`,
);
