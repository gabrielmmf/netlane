<#
.SYNOPSIS
    F1 -- a premissa central da arquitetura do NetLane.

.DESCRIPTION
    PERGUNTA: com dois gateways default, criar uma rota host /32 para um destino
    via o gateway do link B faz o Windows escolher o endereco de origem de B?

    POR QUE E BLOQUEANTE: o NetLane inteiro assume que sim. Se a resposta for
    nao, redirecionar por rota host nao funciona, D-002 cai, e o motor precisa
    voltar para a prancheta antes de ser escrito -- nao depois.

    COMO MEDE: conecta sem bind e le o LocalEndPoint. Sem bind de proposito: e
    exatamente o que um jogo faz, e o que se quer saber e o que o Windows
    escolhe sozinho.

    CONTENCAO: fotografa a tabela, cria a rota, mede, remove no finally, e prova
    que a tabela voltou. Se a prova falhar, o script grita -- nao sai em silencio.

.PARAMETER Destino
    IPv4 de destino do teste. Precisa ser alcancavel pelos dois links e ter a
    porta aberta. Default 1.1.1.1:443, o mesmo alvo que capture-baseline.ps1 usa.

.PARAMETER LinkAlvo
    InterfaceAlias do link B (o que NAO e o default atual). Se omitido, o script
    lista os candidatos e pede para voce escolher -- nao adivinha.

.PARAMETER Porta
    Porta TCP. Default 443.

.EXAMPLE
    # Numa janela do PowerShell ELEVADA:
    pwsh -File scripts/field-tests/F1-origem-por-rota-host.ps1
    pwsh -File scripts/field-tests/F1-origem-por-rota-host.ps1 -LinkAlvo 'Ethernet 2'
#>
[CmdletBinding()]
param(
    [string] $Destino = '1.1.1.1',
    [string] $LinkAlvo,
    [int]    $Porta = 443
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$routeDiff = Join-Path $raiz 'scripts/route-diff.ps1'
$snapshot = 'f1-antes'

function Get-OrigemDaConexao {
    <#
        Abre uma conexao TCP SEM bind e devolve o endereco local que o Windows
        escolheu. Sem bind e o ponto: um jogo tambem nao faz bind, e a pergunta
        do F1 e o que a pilha escolhe sozinha.
    #>
    param(
        [Parameter(Mandatory)] [string] $Destino,
        [Parameter(Mandatory)] [int]    $Porta
    )

    $cliente = [System.Net.Sockets.TcpClient]::new()
    try {
        $tarefa = $cliente.ConnectAsync($Destino, $Porta)
        if (-not $tarefa.Wait(5000)) {
            throw "conexao para $Destino`:$Porta nao completou em 5 s."
        }
        return ([System.Net.IPEndPoint] $cliente.Client.LocalEndPoint).Address.ToString()
    }
    finally {
        $cliente.Dispose()
    }
}

function Sair-NaoPodeRodar {
    param([string] $Motivo)
    Write-Host ''
    Write-Host "F1 NAO PODE RODAR: $Motivo" -ForegroundColor Yellow
    Write-Host 'Isto nao e um resultado. Nao registre nada em decisoes.md.' -ForegroundColor DarkGray
    exit 2
}

# ---------------------------------------------------------------- pre-condicoes

# Elevacao antes de qualquer coisa. Um script que falha no MEIO da criacao da
# rota e o cenario que deixa rota orfa; falhar antes de comecar nao deixa nada.
$identidade = [Security.Principal.WindowsPrincipal]::new(
    [Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $identidade.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Sair-NaoPodeRodar 'criar rota exige elevacao. Abra o PowerShell como administrador e rode de novo.'
}

$candidatos = @(
    Get-NetIPConfiguration |
        Where-Object { $null -ne $_.IPv4DefaultGateway } |
        ForEach-Object {
            [pscustomobject]@{
                Alias   = $_.InterfaceAlias
                IfIndex = $_.InterfaceIndex
                Gateway = $_.IPv4DefaultGateway.NextHop
                Origem  = ($_.IPv4Address | Select-Object -First 1).IPAddress
                Metrica = (Get-NetIPInterface -InterfaceIndex $_.InterfaceIndex `
                            -AddressFamily IPv4).InterfaceMetric
            }
        }
)

if ($candidatos.Count -lt 2) {
    Sair-NaoPodeRodar "F1 precisa de pelo menos dois links com gateway default. Achei $($candidatos.Count)."
}

Write-Host ''
Write-Host 'Links com gateway default:' -ForegroundColor Cyan
$candidatos | Format-Table -AutoSize | Out-String | Write-Host

if (-not $LinkAlvo) {
    Sair-NaoPodeRodar ('escolha o link B com -LinkAlvo. Candidatos: ' +
        (($candidatos.Alias | ForEach-Object { "'$_'" }) -join ', ') +
        '. O script nao escolhe por voce: qual e o link B e uma decisao sua.')
}

$linkB = $candidatos | Where-Object Alias -eq $LinkAlvo
if (-not $linkB) {
    Sair-NaoPodeRodar "nao achei link com gateway default e alias '$LinkAlvo'."
}

$prefixo = "$Destino/32"

# ---------------------------------------------------------------- medicao

Write-Host "Fotografando a tabela de rotas..." -ForegroundColor Cyan
& $routeDiff -Salvar $snapshot | Out-Null

$rotaCriada = $false
$origemAntes = $null
$origemDepois = $null

try {
    Write-Host "Medindo a origem SEM rota host (o que o Windows escolhe sozinho)..." -ForegroundColor Cyan
    $origemAntes = Get-OrigemDaConexao -Destino $Destino -Porta $Porta

    Write-Host "Criando rota host $prefixo via $($linkB.Gateway) em '$($linkB.Alias)' (ActiveStore)..." -ForegroundColor Cyan
    New-NetRoute -DestinationPrefix $prefixo `
                 -InterfaceIndex $linkB.IfIndex `
                 -NextHop $linkB.Gateway `
                 -RouteMetric 1 `
                 -PolicyStore ActiveStore `
                 -Confirm:$false | Out-Null
    $rotaCriada = $true

    Write-Host "Medindo a origem COM a rota host..." -ForegroundColor Cyan
    $origemDepois = Get-OrigemDaConexao -Destino $Destino -Porta $Porta
}
finally {
    if ($rotaCriada) {
        Write-Host 'Removendo a rota host...' -ForegroundColor Cyan
        Remove-NetRoute -DestinationPrefix $prefixo `
                        -InterfaceIndex $linkB.IfIndex `
                        -PolicyStore ActiveStore `
                        -Confirm:$false -ErrorAction Continue
    }
}

# ---------------------------------------------------------------- prova de reversao

Write-Host ''
Write-Host 'Provando que a tabela voltou...' -ForegroundColor Cyan
& $routeDiff -Contra $snapshot
$reverteu = ($LASTEXITCODE -eq 0)

# ---------------------------------------------------------------- resultado

Write-Host ''
Write-Host '================ F1 ================' -ForegroundColor Cyan
Write-Host "  destino          $Destino`:$Porta"
Write-Host "  link B           $($linkB.Alias)  (origem $($linkB.Origem), gw $($linkB.Gateway), metrica $($linkB.Metrica))"
Write-Host "  origem SEM rota  $origemAntes"
Write-Host "  origem COM rota  $origemDepois"
Write-Host ''

if (-not $reverteu) {
    Write-Host 'A TABELA NAO VOLTOU. Limpe antes de qualquer outra coisa.' -ForegroundColor Red
    exit 1
}

if ($origemDepois -eq $linkB.Origem) {
    Write-Host '  RESPOSTA: SIM. A rota host mudou o endereco de origem escolhido pelo Windows.' -ForegroundColor Green
    Write-Host '  A premissa central da arquitetura se sustenta. D-002 segue de pe.' -ForegroundColor Green
    $veredito = 'SIM'
}
elseif ($origemDepois -eq $origemAntes) {
    Write-Host '  RESPOSTA: NAO. A origem nao mudou com a rota host no lugar.' -ForegroundColor Red
    Write-Host '  BLOQUEANTE: redirecionar por rota host nao funciona como D-002 assume.' -ForegroundColor Red
    Write-Host '  NAO escreva o motor. Traga alternativas ao usuario primeiro.' -ForegroundColor Red
    $veredito = 'NAO'
}
else {
    Write-Host '  RESPOSTA: INCONCLUSIVA. A origem mudou, mas nao para a do link B.' -ForegroundColor Yellow
    Write-Host '  Registre como inconclusiva. Um "provavelmente sim" anotado como "sim" e pior que um pendente.' -ForegroundColor Yellow
    $veredito = 'INCONCLUSIVA'
}

Write-Host ''
Write-Host 'Cole em docs/decisoes.md, tabela "Testes de campo - resultados":' -ForegroundColor DarkGray
Write-Host "| F1 | Rota /32 via gateway B faz o Windows escolher o endereco de origem de B? | $veredito -- origem $origemAntes sem rota, $origemDepois com rota, medido em $(Get-Date -Format 'yyyy-MM-dd') |"
Write-Host ''

exit 0
