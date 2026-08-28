<#
.SYNOPSIS
    Checagens de higiene do repositorio que nem o compilador nem os testes pegam.

.DESCRIPTION
    Roda no verify local e no CI, o mesmo arquivo. Duas checagens, as duas
    saidas diretas da auditoria:

    1. docs/baseline-ambiente.md nao pode estar versionado. Ele e o estado desta
       maquina -- IP publico de cada link, MAC, DNS, tabela de sockets -- e o
       repositorio e publico. Esta no .gitignore, mas .gitignore nao impede um
       `git add -f`, e depois de um push o estrago nao se desfaz com um commit
       de remocao.

    2. Todo script citado em docs/, .claude/ ou num .md da raiz precisa existir.
       O procedimento de reversao total apontava para scripts/route-diff.ps1,
       que nunca existiu. Um caminho de volta que nao roda e pior que nenhum,
       porque alguem conta com ele exatamente no dia em que nao ha tempo de
       descobrir que ele nao existe.

.EXAMPLE
    pwsh -File scripts/higiene-repo.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$raiz = Split-Path -Parent $PSScriptRoot
Push-Location $raiz

$problemas = 0

try {
    # ------------------------------------------------- 1. baseline nao versionado
    $baseline = 'docs/baseline-ambiente.md'
    git ls-files --error-unmatch $baseline *> $null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "::error file=$baseline::Estado desta maquina versionado num repositorio publico." -ForegroundColor Red
        Write-Host "  Contem IP publico de cada link, MAC, DNS e a tabela de sockets." -ForegroundColor Red
        Write-Host "  Remova do indice:  git rm --cached $baseline" -ForegroundColor DarkGray
        Write-Host "  Regenere quando precisar:  pwsh -File scripts/capture-baseline.ps1 -IncludeProbes" -ForegroundColor DarkGray
        $problemas++
    }
    else {
        Write-Host 'baseline-ambiente.md nao esta versionado. ok' -ForegroundColor Green
    }

    # ------------------------------------------- 2. referencias a scripts existem
    $alvos = @('docs', '.claude') | Where-Object { Test-Path $_ }
    $arquivos = @()
    foreach ($a in $alvos) {
        $arquivos += Get-ChildItem $a -Recurse -File -Include '*.md' -ErrorAction SilentlyContinue
    }
    $arquivos += Get-ChildItem -File -Filter '*.md' -ErrorAction SilentlyContinue

    $citados = [System.Collections.Generic.HashSet[string]]::new()
    foreach ($arq in $arquivos) {
        foreach ($m in [regex]::Matches((Get-Content $arq.FullName -Raw), 'scripts/[A-Za-z0-9._/-]+\.(?:ps1|mjs)')) {
            [void]$citados.Add($m.Value)
        }
    }

    $faltando = @($citados | Where-Object { -not (Test-Path $_) } | Sort-Object)
    if ($faltando.Count -gt 0) {
        foreach ($f in $faltando) {
            Write-Host "::error::A documentacao cita $f, que nao existe." -ForegroundColor Red
        }
        Write-Host '  Crie o script, ou corrija a referencia.' -ForegroundColor DarkGray
        $problemas++
    }
    else {
        Write-Host "$($citados.Count) referencias a scripts, todas resolvem. ok" -ForegroundColor Green
    }
}
finally {
    Pop-Location
}

if ($problemas -gt 0) { exit 1 }
exit 0
