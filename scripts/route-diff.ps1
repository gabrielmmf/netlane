<#
.SYNOPSIS
    Fotografa a tabela de rotas e prova que ela voltou ao que era.

.DESCRIPTION
    Este script existe porque docs/alteracoes-sistema.md ja o citava no
    procedimento de reversao total, e ele nao existia. Um caminho de volta que
    nao roda e pior que nenhum: alguem conta com ele.

    E a contencao dos testes de campo. Nao ha tier de staging para uma tabela de
    rotas -- a unica maquina que existe e a de producao. Entao o isolamento e
    temporal: fotografa antes, roda, restaura, e PROVA que restaurou.

    Somente leitura. Nunca cria nem remove rota.

    Snapshots vao para .netlane/rotas/, que e ignorado pelo git: sao estado
    desta maquina, como o baseline.

.PARAMETER Salvar
    Nome do snapshot a gravar. Ex.: -Salvar antes

.PARAMETER Contra
    Nome do snapshot a comparar com a tabela atual. Sai com 1 se houver
    diferenca. Ex.: -Contra antes

.PARAMETER Listar
    Lista os snapshots existentes.

.EXAMPLE
    pwsh -File scripts/route-diff.ps1 -Salvar antes
    pwsh -File scripts/field-tests/F1-origem-por-rota-host.ps1
    pwsh -File scripts/route-diff.ps1 -Contra antes
#>
[CmdletBinding(DefaultParameterSetName = 'Listar')]
param(
    [Parameter(ParameterSetName = 'Salvar', Mandatory)] [string] $Salvar,
    [Parameter(ParameterSetName = 'Contra', Mandatory)] [string] $Contra,
    [Parameter(ParameterSetName = 'Listar')] [switch] $Listar
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$raiz = Split-Path -Parent $PSScriptRoot
$pasta = Join-Path $raiz '.netlane/rotas'
New-Item -ItemType Directory -Force $pasta | Out-Null

function Get-TabelaAtual {
    # Campos escolhidos para o diff ser estavel entre execucoes e ainda assim
    # pegar o que importa. InterfaceIndex entra junto com InterfaceAlias porque
    # o indice sozinho e volatil (D-003) e o alias sozinho nao e unico.
    Get-NetRoute -ErrorAction Stop |
        Select-Object @{ n = 'Familia'; e = { $_.AddressFamily.ToString() } },
                      DestinationPrefix,
                      NextHop,
                      InterfaceIndex,
                      InterfaceAlias,
                      RouteMetric,
                      @{ n = 'Protocolo'; e = { $_.Protocol.ToString() } },
                      @{ n = 'Store'; e = { $_.Store.ToString() } } |
        Sort-Object Familia, DestinationPrefix, NextHop, InterfaceIndex
}

function ConvertTo-Chave {
    param($Rota)
    '{0} {1} via {2} if{3} ({4}) metrica {5} {6}/{7}' -f
        $Rota.Familia, $Rota.DestinationPrefix, $Rota.NextHop,
        $Rota.InterfaceIndex, $Rota.InterfaceAlias, $Rota.RouteMetric,
        $Rota.Protocolo, $Rota.Store
}

function Get-CaminhoSnapshot {
    param([string] $Nome)
    if ($Nome -notmatch '^[A-Za-z0-9._-]+$') {
        throw "Nome de snapshot invalido: '$Nome'. Use letras, numeros, ponto, hifen ou sublinhado."
    }
    Join-Path $pasta "$Nome.json"
}

switch ($PSCmdlet.ParameterSetName) {

    'Salvar' {
        $caminho = Get-CaminhoSnapshot $Salvar
        $tabela = Get-TabelaAtual
        $tabela | ConvertTo-Json -Depth 4 | Set-Content -Path $caminho -Encoding utf8
        Write-Host "Snapshot '$Salvar' gravado: $($tabela.Count) rotas." -ForegroundColor Green
        Write-Host "  $caminho" -ForegroundColor DarkGray
        exit 0
    }

    'Contra' {
        $caminho = Get-CaminhoSnapshot $Contra
        if (-not (Test-Path $caminho)) {
            Write-Host "Snapshot '$Contra' nao existe em $pasta." -ForegroundColor Red
            Write-Host "Grave um antes de comparar: pwsh -File scripts/route-diff.ps1 -Salvar $Contra" -ForegroundColor DarkGray
            # Saida 2: a checagem nao pode rodar. Diferente de 1, que e "a
            # tabela divergiu". Confundir as duas manda alguem consertar um
            # problema que ele nao tem.
            exit 2
        }

        $antes = @(Get-Content $caminho -Raw | ConvertFrom-Json | ForEach-Object { ConvertTo-Chave $_ })
        $agora = @(Get-TabelaAtual | ForEach-Object { ConvertTo-Chave $_ })

        # @() obrigatorio: com Set-StrictMode, Where-Object que devolve zero ou
        # um item nao expoe .Count, e a checagem morreria com erro de propriedade
        # em vez de reportar o resultado.
        $sobrando = @($agora | Where-Object { $_ -notin $antes })
        $faltando = @($antes | Where-Object { $_ -notin $agora })

        if ($sobrando.Count -eq 0 -and $faltando.Count -eq 0) {
            Write-Host "A tabela de rotas voltou ao snapshot '$Contra'. $($agora.Count) rotas, identicas." -ForegroundColor Green
            exit 0
        }

        Write-Host ''
        Write-Host "A TABELA DE ROTAS NAO VOLTOU AO SNAPSHOT '$Contra'." -ForegroundColor Red

        if ($sobrando.Count -gt 0) {
            Write-Host ''
            Write-Host "  SOBROU (existe agora, nao existia antes) -- provavel rota orfa:" -ForegroundColor Red
            $sobrando | ForEach-Object { Write-Host "    + $_" -ForegroundColor Red }
        }

        if ($faltando.Count -gt 0) {
            Write-Host ''
            Write-Host "  SUMIU (existia antes, nao existe agora):" -ForegroundColor Yellow
            $faltando | ForEach-Object { Write-Host "    - $_" -ForegroundColor Yellow }
        }

        Write-Host ''
        Write-Host 'Limpe antes de fazer qualquer outra coisa, inclusive antes de reportar o resultado do teste.' -ForegroundColor Yellow
        Write-Host 'Rota orfa e invisivel: o usuario vai depurar por horas achando que e o provedor.' -ForegroundColor DarkGray
        Write-Host 'Se nada mais funcionar: reiniciar resolve. Toda rota do NetLane vive em ActiveStore (Artigo 3).' -ForegroundColor DarkGray
        exit 1
    }

    default {
        $existentes = Get-ChildItem $pasta -Filter '*.json' -ErrorAction SilentlyContinue
        if (-not $existentes) {
            Write-Host "Nenhum snapshot em $pasta."
            Write-Host 'Grave um com: pwsh -File scripts/route-diff.ps1 -Salvar antes' -ForegroundColor DarkGray
            exit 0
        }
        Write-Host "Snapshots em $pasta :"
        foreach ($f in $existentes) {
            $n = (Get-Content $f.FullName -Raw | ConvertFrom-Json).Count
            Write-Host ("  {0,-24} {1,4} rotas   {2}" -f $f.BaseName, $n, $f.LastWriteTime)
        }
        exit 0
    }
}
