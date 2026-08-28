// TEMPLATE — no adaptation needed.
//
// Moves shipped specs out of the live directory.
//
// This is the single mechanism that decides whether the spec system is still
// worth having in year two. Without it the specs directory becomes forty
// historical documents that the next agent reads as a description of the current
// system — confidently, and wrongly. At that point the whole stage is negative:
// worse than never having written any.
//
// It is automated rather than asked for because "remember to archive it" is a
// discipline, and disciplines lose to deadlines every time.
//
// Run from the release path, after a merge to the production branch.
//
// Usage:  node scripts/archive-specs.mjs [--dry-run]
// Exit:   0 done (or nothing to do)   2 the script could not run

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { join, relative, sep } from "node:path";

const dryRun = process.argv.includes("--dry-run");

function cannotRun(message) {
  console.error(`::error::archive-specs could not run: ${message}`);
  process.exit(2);
}

if (!existsSync(".architect.json")) cannotRun(".architect.json not found.");

let config;
try {
  config = JSON.parse(readFileSync(".architect.json", "utf8"));
} catch (error) {
  cannotRun(`.architect.json is not valid JSON: ${error.message}`);
}

const specsDir = config.specs?.dir ?? "docs/specs";
const archiveDir = config.specs?.archive ?? join(specsDir, "archive");

if (!existsSync(specsDir)) {
  console.log(`archive-specs: ${specsDir} does not exist — nothing to do.`);
  process.exit(0);
}

const posix = (p) => relative(".", p).split(sep).join("/");
const archivePosix = posix(archiveDir);

const moved = [];

for (const entry of readdirSync(specsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const dir = join(specsDir, entry.name);
  if (posix(dir) === archivePosix) continue;

  const specFile = join(dir, "spec.md");
  if (!existsSync(specFile)) continue;

  const text = readFileSync(specFile, "utf8");
  const block = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
  if (block.match(/^status:\s*(\S+)/m)?.[1] !== "shipped") continue;

  const target = join(archiveDir, entry.name);
  if (existsSync(target)) {
    cannotRun(`${posix(target)} already exists — refusing to overwrite an archived spec.`);
  }

  moved.push({ from: posix(dir), to: posix(target), dir, target, specFile, text });
}

if (moved.length === 0) {
  console.log("archive-specs: no shipped specs to archive.");
  process.exit(0);
}

for (const item of moved) {
  console.log(`  ${item.from} -> ${item.to}`);
  if (dryRun) continue;

  mkdirSync(archiveDir, { recursive: true });

  // Stamp the archive date before moving. An archived spec with no date is
  // indistinguishable from a live one to anyone reading it out of context —
  // and reading them out of context is exactly what happens.
  const stamped = item.text.replace(
    /^(status:\s*shipped\s*)$/m,
    `$1\narchived: ${new Date().toISOString().slice(0, 10)}`,
  );
  writeFileSync(item.specFile, stamped);
  renameSync(item.dir, item.target);
}

console.log(
  dryRun
    ? `\narchive-specs: ${moved.length} spec(s) would move. Re-run without --dry-run.`
    : `\narchive-specs: ${moved.length} spec(s) archived. Commit the move, and fold ` +
        `anything still true about the CURRENT system into the product documentation — ` +
        `the archive is history, not reference.`,
);
