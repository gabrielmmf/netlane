// TEMPLATE — shared helpers for the hook scripts. No adaptation needed.
//
// Node rather than bash + jq on purpose: these run on every developer machine,
// and jq is not present on a default Windows install. A guard that silently
// fails to run on half the team is worse than no guard, because everyone
// believes it is protecting them.

import { readFileSync, existsSync, readdirSync, appendFileSync, mkdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

export async function readInput() {
  let raw = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) raw += chunk;
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

/** Missing or broken config must never block work — a guard that cannot read
 *  its own rules has no basis for denying anything. Fail open, loudly. */
export function config() {
  const path = join(projectDir, ".architect.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    console.error("architect: .architect.json is not valid JSON — guards are off.");
    return null;
  }
}

/** The verify command, whatever the ecosystem calls it. One accessor so a
 *  rename in .architect.json does not have to be chased through five files. */
export function verifyCommand() {
  return config()?.commands?.verify ?? null;
}

/** Append to the event ledger. Guard denials, gate failures and tool failures
 *  all land here: repeat detection and the report both read one file, and a
 *  second ledger would answer the same question differently within a month. */
export function recordEvent(kind, signature, detail = {}) {
  try {
    mkdirSync(join(projectDir, ".claude"), { recursive: true });
    const line = JSON.stringify({ ts: new Date().toISOString(), kind, signature, ...detail });
    appendFileSync(join(projectDir, ".claude", ".architect-events.jsonl"), `${line}\n`);
  } catch {
    // Never let bookkeeping break a tool call.
  }
}

export function globToRegExp(glob) {
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

/** Absolute or relative path -> repo-relative posix, for glob matching. */
export function repoPath(file) {
  return relative(projectDir, file).split(sep).join("/");
}

/** Deny a tool call. The reason is what the model reads, so it must say what to
 *  do next. Every denial is recorded: a guard that has never fired in three
 *  months is either unnecessary or broken, and `/architect report` cannot tell
 *  you which unless the firings are counted. */
export function deny(reason, signature = "guard") {
  recordEvent("guard-deny", signature, { reason: reason.split("\n")[0] });
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

export function allow() {
  process.exit(0);
}

/** Every live spec directory, newest id first. */
export function specs() {
  const dir = join(projectDir, config()?.specs?.dir ?? "docs/specs");
  const archive = config()?.specs?.archive ?? "docs/specs/archive";
  if (!existsSync(dir)) return [];
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (join(dir, entry.name) === join(projectDir, archive)) continue;
    const specFile = join(dir, entry.name, "spec.md");
    if (!existsSync(specFile)) continue;
    const text = readFileSync(specFile, "utf8");
    const block = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
    found.push({
      dir: join(dir, entry.name),
      name: entry.name,
      text,
      id: block.match(/^id:\s*(\S+)/m)?.[1] ?? entry.name,
      title: block.match(/^title:\s*(.+)$/m)?.[1]?.trim() ?? "",
      status: block.match(/^status:\s*(\S+)/m)?.[1] ?? "draft",
      tier: Number(block.match(/^tier:\s*(\d)/m)?.[1] ?? 2),
      planFile: join(dir, entry.name, "plan.md"),
      notesFile: join(dir, entry.name, "notes.md"),
    });
  }
  return found.sort((a, b) => String(b.id).localeCompare(String(a.id)));
}
