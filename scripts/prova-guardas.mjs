// Prova a guarda nos dois sentidos, a partir de um arquivo — porque escrever
// estes casos direto na linha de comando faria a própria guarda bloquear o teste.
import { spawnSync } from "node:child_process";

const casos = [
  // [rótulo, comando, deve negar?]
  ["force push", "git push --force origin main", true],
  ["push +main", "git push origin +main", true],
  ["gh pr merge", "gh pr merge 1 --squash", true],
  ["cria rota ad-hoc", "New-NetRoute -DestinationPrefix 1.1.1.1/32 -InterfaceIndex 5", true],
  ["remove rota ad-hoc", "Remove-NetRoute -DestinationPrefix 1.1.1.1/32", true],
  ["rota persistente", "route add 1.1.1.1 mask 255.255.255.255 10.0.0.1 -p", true],
  ["netsh", "netsh interface ipv6 reset prefixpolicy", true],
  ["binding", "Disable-NetAdapterBinding -Name Wi-Fi -ComponentID ms_tcpip6", true],
  ["para o vgk", "Stop-Service vgk -Force", true],
  ["rota depois de pipe", "echo x | New-NetRoute -DestinationPrefix 1.1.1.1/32", true],

  // Os que NÃO podem ser negados. Falso positivo é como guarda vira guarda
  // desinstalada — e aí as verdadeiras vão junto.
  ["grep procurando o nome", 'grep -rn "New-NetRoute" src/', false],
  ["rg procurando netsh", 'rg "netsh|route.exe" src/', false],
  ["git grep", 'git grep -n "Set-NetAdapterBinding"', false],
  ["cat de um script", "cat scripts/field-tests/F1-origem-por-rota-host.ps1", false],
  ["Get-NetRoute", "Get-NetRoute -AddressFamily IPv4", false],
  ["route-diff", "pwsh -File scripts/route-diff.ps1 -Salvar antes", false],
  ["field-test pelo script", "pwsh -File scripts/field-tests/F1-origem-por-rota-host.ps1", false],
  ["dotnet test", "dotnet test NetLane.sln -c Release", false],
  ["verify", "pwsh -File scripts/verify.ps1", false],
  ["push de branch", "git push -u origin HEAD", false],
  ["para o serviço do NetLane", "Stop-Service NetLane", false],
];

let falhas = 0;

for (const [rotulo, comando, deveNegar] of casos) {
  const r = spawnSync(process.execPath, [".claude/hooks/guard-bash.mjs"], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command: comando } }),
    encoding: "utf8",
  });

  const negou = (r.stdout ?? "").includes('"deny"');
  const ok = negou === deveNegar;
  if (!ok) falhas++;

  const esperado = deveNegar ? "negar" : "deixar passar";
  const obtido = negou ? "negou" : "passou";
  console.log(`${ok ? "ok  " : "FALHA"}  ${rotulo.padEnd(28)} (esperado ${esperado}, ${obtido})`);
}

console.log(falhas === 0
  ? `\n${casos.length} casos, todos como esperado.`
  : `\n${falhas} de ${casos.length} FORA do esperado.`);

process.exit(falhas === 0 ? 0 : 1);
