// TEMPLATE — no adaptation needed.
//
// PostToolUse(Edit|Write|NotebookEdit|Bash). Keeps the two timestamps the Stop
// gate compares: when code was last changed, and when verification last passed.
//
// PostToolUse fires only when a tool SUCCEEDS (failures go to PostToolUseFailure),
// so a verify command reaching this hook is a verify command that exited zero.
// The Stop gate is bounded anyway, so if that assumption is ever wrong on some
// tool the worst case is one redundant nudge, not a stuck session.
//
// Documentation edits do not set the flag. Requiring a full build because a
// paragraph in a spec changed is exactly the kind of friction that gets a guard
// switched off within a week.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { readInput, config, projectDir, repoPath } from "./_lib.mjs";

const STATE = join(projectDir, ".claude", ".architect-state.json");

function read() {
  if (!existsSync(STATE)) return {};
  try {
    return JSON.parse(readFileSync(STATE, "utf8"));
  } catch {
    return {};
  }
}

function write(state) {
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, JSON.stringify(state, null, 2));
}

const input = await readInput();
const settings = config();
if (!settings) process.exit(0);

const state = read();
const now = Date.now();

if (input.tool_name === "Bash") {
  const command = input.tool_input?.command ?? "";
  const verify = settings.commands?.verify ?? "";
  // Match on the verify command's own text so `npm run verify` counts however
  // it was wrapped — `cd . && npm run verify`, `time npm run verify`.
  if (verify && command.includes(verify)) {
    state.lastVerifyAt = now;
    state.stopBlocks = 0;
    write(state);
  }
  process.exit(0);
}

const file = input.tool_input?.file_path;
if (!file) process.exit(0);

const path = repoPath(file);
const specsDir = settings.specs?.dir ?? "docs/specs";
const isDocumentation = path.endsWith(".md") || path.startsWith(`${specsDir}/`);
if (isDocumentation) process.exit(0);

state.lastEditAt = now;
state.lastEditFile = path;
state.stopBlocks = 0;
write(state);
