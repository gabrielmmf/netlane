// TEMPLATE — reads the production branch from .architect.json. No adaptation
// needed unless this repo has extra commands that must never run unattended.
//
// PreToolUse(Bash). Parses the actual command instead of pattern-matching the
// string the way a permissions deny-list does.
//
// The deny-list in settings.json is a useful first line, but it matches on shape:
// `Bash(git push origin main:*)` does not catch `git push origin HEAD:main`,
// `cd sub && git push`, or `git push -f`. A hook receives the command and can
// look at what it actually does. It also runs outside the model's context, so
// nothing in a file or a web page can talk it out of a denial.
//
// Everything blocked here is ALSO blocked somewhere the platform enforces it
// (branch protection, or the CI job that fails on a direct push). This layer
// exists to fail fast and explain, not to be the only wall.

import { execFileSync } from "node:child_process";
import { readInput, config, deny, allow, projectDir } from "./_lib.mjs";

const input = await readInput();
const command = input.tool_input?.command ?? "";
if (!command.trim()) allow();

const branch = config()?.productionBranch ?? "main";

/** Split on shell separators so `cd x && git push` is inspected, not skipped. */
const segments = command.split(/(?:&&|\|\||;|\n)/).map((s) => s.trim());

const rules = [
  {
    id: "force-push",
    test: (c) => /^git\s+push\b/.test(c) && /\s(-f|--force|--force-with-lease)\b/.test(c),
    reason:
      "Force push blocked. It rewrites history other people and the CI have " +
      "already fetched. If a commit must be undone, use `git revert`.",
  },
  {
    id: "push-to-production",
    test: (c) =>
      /^git\s+push\b/.test(c) &&
      new RegExp(`(^|\\s)(${branch}|HEAD:${branch}|[^\\s:]+:${branch})(\\s|$)`).test(c),
    reason:
      `Pushing to ${branch} blocked. Work goes through a pull request so the ` +
      `gates run before users see it. Push your branch and open a PR instead.`,
  },
  {
    id: "commit-on-production",
    test: (c) => /^git\s+(commit|cherry-pick|rebase|merge)\b/.test(c) && onProductionBranch(),
    reason:
      `You are on ${branch}. Committing here bypasses every check. ` +
      `Run \`git checkout -b <type>/<slug>\` first — the work is not lost.`,
  },
  {
    id: "agent-merge",
    test: (c) => /^gh\s+pr\s+merge\b/.test(c),
    reason:
      "Merging is the human's decision, not the agent's. Open the PR, report " +
      "its check status, and let them merge.",
  },
  {
    id: "recursive-delete",
    test: (c) => /\brm\s+(-[a-zA-Z]*[rR][a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*[rR])\b/.test(c),
    reason:
      "Recursive force delete blocked. Delete specific paths, or use " +
      "`git clean -nd` to see what would go first.",
  },
  {
    id: "read-dotenv",
    test: (c) => /\b(cat|less|more|head|tail|type|Get-Content)\b[^|]*\.env\b/.test(c),
    reason:
      "Reading .env blocked. Secrets do not belong in the transcript. The " +
      "variable NAMES are documented in AGENTS.md; if you need to know whether " +
      "one is set, check for the key without printing the value.",
  },
  {
    id: "discard-work",
    test: (c) => /^git\s+checkout\s+--\s+\./.test(c) || /^git\s+reset\s+--hard\b/.test(c),
    reason:
      "This discards uncommitted work irreversibly. If the intent is to undo " +
      "your own edits, say which files and let the human confirm.",
  },

  // ------------------------------------------------------------ NetLane
  //
  // As tres regras abaixo sao os artigos 1, 2 e 3 da constituicao na forma em
  // que um agente os encontra antes de errar: um comando solto no terminal.
  //
  // A contraparte em CI existe para o CODIGO -- tests/NetLane.Architecture.Tests
  // varre src/ e reprova o build. Para o comando ad-hoc nao existe contraparte,
  // e nao da para haver: o runner do CI nao tem tabela de rotas nem anticheat.
  // Esta assimetria e real e esta declarada, em vez de fingida.
  {
    id: "rota-persistente",
    test: (c) =>
      /\broute(\.exe)?\s+(add|change)\b/i.test(c) && /\s-p\b/i.test(c) ||
      /\bNew-NetRoute\b/i.test(c) && /-PolicyStore\s+PersistentStore/i.test(c),
    reason:
      "Rota persistente bloqueada (Artigo 3 da constituicao). O reboot e a " +
      "ultima rede de seguranca do usuario: se uma rota do NetLane sobreviver " +
      "a ele, essa rede deixa de existir. Toda rota vai para ActiveStore.",
  },
  {
    id: "rota-ad-hoc",
    test: (c) =>
      /\b(New-NetRoute|Remove-NetRoute|Set-NetRoute)\b/i.test(c) ||
      /\broute(\.exe)?\s+(add|delete|change)\b/i.test(c),
    reason:
      "Mexer na tabela de rotas por comando solto esta bloqueado. Nao e o " +
      "comando que e proibido -- e faze-lo sem contencao. Um erro no meio " +
      "deixa rota orfa, e rota orfa e invisivel: o usuario depura por horas " +
      "achando que e o provedor.\n" +
      "  O caminho e um script em scripts/field-tests/, que fotografa a tabela " +
      "antes, restaura no finally e PROVA que restaurou. Leia a skill " +
      "teste-de-campo.\n" +
      "  Para so olhar, Get-NetRoute e route-diff.ps1 estao liberados.",
  },
  {
    id: "alteracao-de-rede-permanente",
    test: (c) =>
      /\bnetsh\b/i.test(c) ||
      /\b(Set|Enable|Disable)-NetAdapterBinding\b/i.test(c) ||
      /\bSet-NetIPInterface\b/i.test(c),
    reason:
      "Alteracao permanente de configuracao de rede bloqueada (Artigo 2). " +
      "Toda mudanca de sistema e ESCRITA antes de ser aplicada, com o comando " +
      "exato de reversao, em docs/alteracoes-sistema.md, e so sai com " +
      "aprovacao explicita do usuario.\n" +
      "  Sem isso nao existe caminho de volta ao baseline. Use a skill " +
      "alteracao-de-sistema.",
  },
  {
    id: "anticheat",
    test: (c) =>
      /\b(Stop-Service|Set-Service|sc(\.exe)?\s+(stop|delete|config)|taskkill|Stop-Process)\b/i.test(c) &&
      /\b(vgk|vgc|Vanguard|EasyAntiCheat|EasyAntiCheat_EOS|BEService|BattlEye|EAAntiCheat|EABackgroundService)\b/i.test(c),
    reason:
      "Bloqueado: isto mexe num anticheat. Nao ha versao aceitavel disso, nem " +
      "com aprovacao, nem para diagnostico (Artigo 1).\n" +
      "  Um ban de conta nao tem reversao, e e o unico dano deste projeto que " +
      "nao se desfaz. O NetLane funciona justamente por nunca chegar perto " +
      "desses processos: rota de host nao toca em processo nenhum.",
  },
];

function onProductionBranch() {
  try {
    return (
      // cwd is explicit: the hook process's own cwd is not guaranteed to be
      // the project root (subagents, worktrees), which is exactly why _lib.mjs
      // resolves CLAUDE_PROJECT_DIR in the first place.
      execFileSync("git", ["branch", "--show-current"], {
        cwd: projectDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() === branch
    );
  } catch {
    return false; // cannot tell => do not block
  }
}

for (const segment of segments) {
  for (const rule of rules) {
    if (rule.test(segment)) deny(rule.reason, rule.id);
  }
}

allow();
