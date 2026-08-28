<#
.SYNOPSIS
    A regua unica do NetLane. O CI roda exatamente este arquivo.

.DESCRIPTION
    Existe um comando so, e ele e o mesmo aqui e no CI, de proposito: no momento
    em que o pipeline roda uma lista de passos diferente da sua, "passa na minha
    maquina" vira uma frase verdadeira e inutil.

    Rode antes de considerar qualquer trabalho terminado.

.PARAMETER Rapido
    Pula restore e format. Para o laco apertado de edicao; nao substitui a
    execucao completa antes de abrir PR.

.EXAMPLE
    pwsh -File scripts/verify.ps1
    pwsh -File scripts/verify.ps1 -Rapido
#>
[CmdletBinding()]
param(
    [switch] $Rapido
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$raiz = Split-Path -Parent $PSScriptRoot
Push-Location $raiz

$passos = [System.Collections.Generic.List[object]]::new()
$falhou = $false

function Invoke-Passo {
    param(
        [Parameter(Mandatory)] [string] $Nome,
        [Parameter(Mandatory)] [scriptblock] $Acao,
        [string] $Porque
    )

    Write-Host ''
    Write-Host "==> $Nome" -ForegroundColor Cyan
    if ($Porque) { Write-Host "    $Porque" -ForegroundColor DarkGray }

    $inicio = Get-Date
    & $Acao
    $codigo = $LASTEXITCODE
    $duracao = [int]((Get-Date) - $inicio).TotalSeconds

    if ($codigo -ne 0) {
        $script:falhou = $true
        Write-Host "    REPROVADO (saida $codigo, ${duracao}s)" -ForegroundColor Red
    }
    else {
        Write-Host "    ok (${duracao}s)" -ForegroundColor Green
    }

    $script:passos.Add([pscustomobject]@{ Nome = $Nome; Codigo = $codigo; Segundos = $duracao })
}

try {
    if (-not $Rapido) {
        Invoke-Passo 'restore' { dotnet restore NetLane.sln } `
            'Central package management: uma versao por pacote, declarada em Directory.Packages.props.'

        Invoke-Passo 'format' { dotnet format NetLane.sln --verify-no-changes } `
            'Formatacao divergente polui todo diff de PR e esconde a mudanca real.'
    }

    Invoke-Passo 'build' { dotnet build NetLane.sln -c Release --no-restore } `
        'TreatWarningsAsErrors: num projeto com P/Invoke, os avisos que importam sao os que se ignora.'

    Invoke-Passo 'testes' { dotnet test NetLane.sln -c Release --no-build --nologo } `
        'Inclui os testes de arquitetura, que provam os artigos da constituicao lendo src/.'

    if (Get-Command node -ErrorAction SilentlyContinue) {
        Invoke-Passo 'orcamento de contexto' { node scripts/context-budget.mjs } `
            'AGENTS.md so cresce. Passado o teto, as tres regras que importam ficam soterradas.'

        if (Test-Path 'scripts/trace-check.mjs') {
            Invoke-Passo 'rastreabilidade' { node scripts/trace-check.mjs } `
                'Todo criterio de aceitacao precisa de um teste que cite o id dele.'
        }

        if (Test-Path 'scripts/spec-freshness.mjs') {
            Invoke-Passo 'frescor das specs' { node scripts/spec-freshness.mjs } `
                'Spec cujo codigo andou sem ela e lida pelo proximo agente como verdade atual.'
        }
    }
    else {
        Write-Host ''
        Write-Host '==> node ausente: checagens de rastreabilidade e contexto puladas' -ForegroundColor Yellow
        Write-Host '    O CI tem node e roda todas. Aqui elas falham abertas, e isso e proposital:' -ForegroundColor DarkGray
        Write-Host '    a copia no CI e o que torna a regra real.' -ForegroundColor DarkGray
    }

    if (Test-Path 'scripts/referencias-docs.ps1') {
        Invoke-Passo 'referencias dos docs' { pwsh -NoProfile -File scripts/referencias-docs.ps1 } `
            'Um procedimento de reversao que cita script inexistente e pior que nenhum.'
    }
}
finally {
    Pop-Location
}

Write-Host ''
Write-Host '--------------------------------------------------' -ForegroundColor DarkGray
$passos | Format-Table -AutoSize | Out-String | Write-Host

if ($falhou) {
    Write-Host 'verify REPROVADO' -ForegroundColor Red
    exit 1
}

Write-Host 'verify aprovado' -ForegroundColor Green
exit 0
