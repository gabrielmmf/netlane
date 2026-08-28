// TEMPLATE — works as-is once .architect.json names the specs directory and the
// production branch.
//
// Catches the other direction of spec drift: code changing behind a shipped
// spec's back.
//
// trace-check proves every criterion has a test. It cannot notice that someone
// changed the upload handler's behaviour and left spec 007 describing the old
// one. Nothing notices that — which is why every practitioner report names it as
// the reason spec-driven development degrades after a few months.
//
// Each spec declares the paths it owns:
//
//   owns: ["src/upload/**", "src/api/upload/**"]
//
// If this diff touches owned paths and does not touch the spec, the spec is now
// a description of a system that no longer exists.
//
//   tier 3 spec  -> fail. Schema, auth, money and contracts are where a stale
//                   description gets someone hurt.
//   tier < 3     -> warn. Failing here would make the gate fire on refactors and
//                   it would be disabled within a week.
//
// Usage:  node scripts/spec-freshness.mjs [baseRef]
// Env:    BASE_REF   overrides the base branch (CI sets this to the PR base)
// Exit:   0 fresh (or warnings only)   1 a tier-3 spec went stale   2 cannot run

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative, sep } from "node:path";
import { recordGateFail } from "./_ledger.mjs";

const CONFIG = ".architect.json";

function cannotRun(message) {
  console.error(`::error::spec-freshness could not run: ${message}`);
  process.exit(2);
}

if (!existsSync(CONFIG)) cannotRun(`${CONFIG} not found. Run /organize.`);

let config;
try {
  config = JSON.parse(readFileSync(CONFIG, "utf8"));
} catch (error) {
  cannotRun(`${CONFIG} is not valid JSON: ${error.message}`);
}

const specsDir = config.specs?.dir ?? "docs/specs";
const archiveDir = config.specs?.archive ?? join(specsDir, "archive");
const productionBranch = config.productionBranch ?? "main";
const baseRef = process.argv[2] ?? process.env.BASE_REF ?? `origin/${productionBranch}`;

if (!existsSync(specsDir)) {
  console.log(`spec-freshness: ${specsDir} does not exist yet — nothing to check.`);
  process.exit(0);
}

// ---------------------------------------------------------------- the diff

function git(...args) {
  // stderr is captured rather than inherited, so git's own advice does not print
  // ahead of this script's explanation of what to do about it.
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function resolves(ref) {
  try {
    git("rev-parse", "--verify", "--quiet", `${ref}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

// Locally the remote-tracking ref is often not fetched, while the branch itself
// is right there. Falling back keeps this runnable from a developer machine
// instead of only in CI — a gate you can only run in CI is a gate you meet for
// the first time when it fails your PR.
const base = resolves(baseRef)
  ? baseRef
  : resolves(productionBranch)
    ? productionBranch
    : null;

if (!base) {
  cannotRun(
    `neither "${baseRef}" nor "${productionBranch}" resolves to a commit. ` +
      `In CI, check out with fetch-depth: 0 and fetch the base branch; locally, ` +
      `run \`git fetch origin ${productionBranch}\`.`,
  );
}

let changed;
try {
  // Three-dot: what this branch changed since it diverged, not what the base
  // has done in the meantime. Two dots would flag every spec the base touched.
  changed = git("diff", "--name-only", `${base}...HEAD`)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
} catch (error) {
  // First line only: Node appends the captured stderr to error.message, and
  // git's own advice printed underneath this script's explanation reads as two
  // unrelated failures.
  cannotRun(`git diff against ${base} failed — ${error.message.split("\n")[0]}`);
}

if (changed.length === 0) {
  console.log("spec-freshness: no changes against the base.");
  process.exit(0);
}

// ---------------------------------------------------------------- specs

function globToRegExp(glob) {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === "*" && glob[i + 1] === "*") {
      i++;
      if (glob[i + 1] === "/") {
        i++;
        source += "(?:[^/]*/)*";
      } else {
        source += ".*";
      }
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

const posix = (p) => relative(".", p).split(sep).join("/");

function specFiles(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) specFiles(full, found);
    else if (entry.name === "spec.md") found.push(full);
  }
  return found;
}

const stale = [];

for (const file of specFiles(specsDir)) {
  const path = posix(file);
  if (path.startsWith(posix(archiveDir))) continue;

  const text = readFileSync(file, "utf8");
  const block = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
  if (!block) continue;

  if (block.match(/^status:\s*(\S+)/m)?.[1] !== "shipped") continue;

  const ownsRaw = block.match(/^owns:\s*\[(.*?)\]/ms)?.[1] ?? "";
  const owns = [...ownsRaw.matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
  if (owns.length === 0) continue;

  const matchers = owns.map(globToRegExp);
  const touched = changed.filter((f) => matchers.some((re) => re.test(f)));
  if (touched.length === 0) continue;

  // The spec itself being edited in this PR is the whole point — that is a
  // change that kept its description current.
  const specDir = path.slice(0, path.lastIndexOf("/"));
  if (changed.some((f) => f.startsWith(`${specDir}/`))) continue;

  const tier = Number(block.match(/^tier:\s*(\d)/m)?.[1] ?? 2);
  stale.push({ path, tier, touched, id: block.match(/^id:\s*(\S+)/m)?.[1] ?? "?" });
}

// ---------------------------------------------------------------- report

let failed = false;

for (const spec of stale) {
  const level = spec.tier >= 3 ? "error" : "warning";
  if (spec.tier >= 3) failed = true;
  console.error(
    `::${level} file=${spec.path}::Spec ${spec.id} is shipped and owns files this ` +
      `PR changes (${spec.touched.slice(0, 4).join(", ")}` +
      `${spec.touched.length > 4 ? ", …" : ""}) but the spec was not updated. ` +
      `Update its acceptance criteria, or narrow its "owns" globs if it no longer ` +
      `describes these files.`,
  );
}

if (failed) {
  console.error("\nspec-freshness failed: a tier-3 spec now describes code that moved.");
  recordGateFail("spec-freshness", { staleSpecs: stale.filter((s) => s.tier >= 3).length });
  process.exit(1);
}

console.log(
  stale.length === 0
    ? "spec-freshness: no shipped spec was left behind by this change."
    : `spec-freshness: ${stale.length} warning(s), none tier 3.`,
);
