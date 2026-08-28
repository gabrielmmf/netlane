// TEMPLATE — works as-is once .architect.json names the specs directory and the
// test globs. Adapt only if this repo's tests live somewhere a glob cannot reach.
//
// Ties every acceptance criterion to a test, in BOTH directions.
//
// Spec drift is the failure mode that kills spec-driven development, and it is
// invisible: no linter flags it, no existing CI job flags it, and the repo ships
// describing a system that no longer exists. A stale spec is worse than no spec
// because agents read it as current truth.
//
// This is the gate that makes the spec code-coupled without making it the source
// of truth. The code is the truth, the test is the enforcer, and this script is
// the rope between them:
//
//   forward   every AC id declared in a live spec must be named by a test
//             -> otherwise the criterion was agreed and never proven
//   backward  every AC id named in a test must exist in some spec
//             -> otherwise the criterion was quietly dropped and the test now
//                proves something nobody agreed to. This is the half everybody
//                skips, and it is the one that catches mid-implementation drift.
//
// Usage:  node scripts/trace-check.mjs
// Exit:   0 traced   1 drift found   2 the check itself could not run
//
// The 1-vs-2 split matters: a check that reports drift because it failed to read
// a file sends the author to fix a problem that does not exist.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { recordGateFail } from "./_ledger.mjs";

const CONFIG = ".architect.json";
const LIVE_STATUSES = new Set(["ready", "in-progress", "shipped"]);
const IGNORED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", "coverage", ".next",
  ".turbo", "vendor", "target", ".venv", "__pycache__", "obj", "bin",
]);

/** Exit 2: the gate is broken, not the repo. */
function cannotRun(message) {
  console.error(`::error::trace-check could not run: ${message}`);
  process.exit(2);
}

// ---------------------------------------------------------------- config

if (!existsSync(CONFIG)) {
  cannotRun(`${CONFIG} not found. Run /organize, or delete this script.`);
}

let config;
try {
  config = JSON.parse(readFileSync(CONFIG, "utf8"));
} catch (error) {
  cannotRun(`${CONFIG} is not valid JSON: ${error.message}`);
}

const specsDir = config.specs?.dir ?? "docs/specs";
const archiveDir = config.specs?.archive ?? join(specsDir, "archive");
const testGlobs = config.tests?.globs ?? [];

if (testGlobs.length === 0) {
  cannotRun(`no tests.globs in ${CONFIG}. Without them nothing can be traced.`);
}

// ---------------------------------------------------------------- helpers

/** Minimal glob -> RegExp. Supports **, *, ? — enough for path patterns. */
function globToRegExp(glob) {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === "*" && glob[i + 1] === "*") {
      i++;
      if (glob[i + 1] === "/") {
        i++;
        source += "(?:[^/]*/)*"; // **/ matches zero or more directories
      } else {
        source += ".*"; // trailing ** matches anything
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

function walk(dir, files = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files; // unreadable directory is not a drift finding
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".github") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) walk(full, files);
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

const posix = (p) => relative(".", p).split(sep).join("/");

/** Frontmatter is not YAML-parsed: only the two keys this script needs. */
function frontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const block = match[1];
  const status = block.match(/^status:\s*([\w-]+)/m)?.[1];
  const id = block.match(/^id:\s*(\S+)/m)?.[1];
  const ownsRaw = block.match(/^owns:\s*\[(.*?)\]/ms)?.[1] ?? "";
  const owns = [...ownsRaw.matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
  return { status, id, owns };
}

// ---------------------------------------------------------------- collect

if (!existsSync(specsDir)) {
  console.log(`trace-check: ${specsDir} does not exist yet — nothing to trace.`);
  process.exit(0);
}

/** AC ids declared in live specs: id -> spec file. */
const declared = new Map();
/** Every AC id that has ever existed, live or archived — for the backward pass. */
const known = new Set();
/** Path globs each live spec claims, for the overlap check. */
const ownership = [];

for (const file of walk(specsDir)) {
  if (!file.endsWith("spec.md")) continue;

  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    cannotRun(`could not read ${posix(file)}: ${error.message}`);
  }

  // A criterion is a line that STARTS with its id — this deliberately ignores
  // ids mentioned in prose, decision logs or open questions.
  const ids = [...text.matchAll(/^\s*(AC-\d+)\b/gm)].map((m) => m[1]);
  for (const id of ids) known.add(id);

  const { status, owns } = frontmatter(text);
  const archived = posix(file).startsWith(posix(archiveDir));
  if (!archived && LIVE_STATUSES.has(status) && owns.length > 0) {
    ownership.push({ file: posix(file), owns });
  }
  if (!archived && LIVE_STATUSES.has(status)) {
    for (const id of ids) {
      if (declared.has(id) && declared.get(id) !== file) {
        cannotRun(
          `${id} is declared in two live specs: ${posix(declared.get(id))} and ` +
            `${posix(file)}. Ids are permanent and unique — renumber one.`,
        );
      }
      declared.set(id, file);
    }
  }
}

const testMatchers = testGlobs.map(globToRegExp);
/** AC ids referenced by tests: id -> Set of test files. */
const referenced = new Map();
let testFilesScanned = 0;

for (const file of walk(".")) {
  const path = posix(file);
  if (path.startsWith(posix(specsDir))) continue;
  if (!testMatchers.some((re) => re.test(path))) continue;

  testFilesScanned++;
  const text = readFileSync(file, "utf8");
  for (const [id] of text.matchAll(/\bAC-\d+\b/g)) {
    if (!referenced.has(id)) referenced.set(id, new Set());
    referenced.get(id).add(path);
  }
}

if (testFilesScanned === 0) {
  cannotRun(
    `tests.globs matched no files (${testGlobs.join(", ")}). The globs are ` +
      `wrong, or the tests moved — either way this gate is not checking anything.`,
  );
}

// ---------------------------------------------------------------- report

const unproven = [...declared.entries()].filter(([id]) => !referenced.has(id));
const orphans = [...referenced.entries()].filter(([id]) => !known.has(id));

// Two live specs claiming the same paths means two agreements about the same
// behaviour, and spec-freshness cannot say which one a change belongs to. It
// happens when two agents work in parallel, which is exactly when nobody is
// watching for it.
const overlaps = [];
for (let i = 0; i < ownership.length; i++) {
  for (let j = i + 1; j < ownership.length; j++) {
    const shared = ownership[i].owns.filter((glob) => ownership[j].owns.includes(glob));
    if (shared.length > 0) {
      overlaps.push({ a: ownership[i].file, b: ownership[j].file, shared });
    }
  }
}

for (const { a, b, shared } of overlaps) {
  console.error(
    `::error file=${a}::claims the same path(s) as ${b}: ${shared.join(", ")}. ` +
      `Two live specs owning one path means two agreements about the same ` +
      `behaviour — split the ownership, or merge the specs.`,
  );
}

for (const [id, specFile] of unproven) {
  console.error(
    `::error file=${posix(specFile)}::${id} has no test. Name it in a test:\n` +
      `    it('${id}: <the behaviour>', ...)\n` +
      `  or delete the criterion from the spec if it is no longer agreed.`,
  );
}

for (const [id, files] of orphans) {
  console.error(
    `::error file=${[...files][0]}::${id} is referenced by a test but exists in ` +
      `no spec (${[...files].join(", ")}). Either the criterion was dropped from ` +
      `the spec without dropping the test, or the id is a typo.`,
  );
}

if (unproven.length > 0 || orphans.length > 0 || overlaps.length > 0) {
  console.error(
    `\ntrace-check failed: ${unproven.length} unproven criteria, ` +
      `${orphans.length} orphan references, ${overlaps.length} ownership overlaps.`,
  );
  recordGateFail("trace-check", {
    unproven: unproven.length,
    orphans: orphans.length,
    overlaps: overlaps.length,
  });
  process.exit(1);
}

console.log(
  `trace-check: ${declared.size} criteria across ${new Set([...declared.values()]).size} ` +
    `live specs, all traced to tests in ${testFilesScanned} files.`,
);
