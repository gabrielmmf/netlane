<#
.SYNOPSIS
    Captura o estado de referencia da maquina para o NetLane.

.DESCRIPTION
    Gera docs/baseline-ambiente.md com saida bruta, sem edicao.
    Este arquivo e o alvo de rollback e a base dos testes de aceitacao:
    depois de fechar um jogo, a tabela de rotas tem que voltar a ser esta.

    Somente leitura. Nao modifica nada no sistema.
    As sondas ativas (-IncludeProbes) fazem ICMP e um GET HTTP por link para
    descobrir o IP publico de cada saida; sao as unicas chamadas externas.

.PARAMETER OutFile
    Caminho do markdown gerado. Default: <repo>/docs/baseline-ambiente.md

.PARAMETER IncludeProbes
    Executa as medicoes ativas de latencia/jitter/perda e IP publico por link.

.EXAMPLE
    pwsh -File scripts/capture-baseline.ps1 -IncludeProbes
#>
[CmdletBinding()]
param(
    [string] $OutFile,
    [switch] $IncludeProbes
)

$ErrorActionPreference = 'Continue'

if (-not $OutFile) {
    $repoRoot = Split-Path -Parent $PSScriptRoot
    $OutFile  = Join-Path $repoRoot 'docs/baseline-ambiente.md'
}
New-Item -ItemType Directory -Force (Split-Path -Parent $OutFile) | Out-Null

$out = [System.Text.StringBuilder]::new()

function Add-Text { param([string] $Text) [void]$out.AppendLine($Text) }

function Add-Section {
    param([string] $Title)
    [void]$out.AppendLine('')
    [void]$out.AppendLine("## $Title")
    [void]$out.AppendLine('')
}

function Add-Capture {
    param([string] $Command)
    [void]$out.AppendLine('```powershell')
    [void]$out.AppendLine($Command)
    [void]$out.AppendLine('```')
    [void]$out.AppendLine('```text')
    $result = try   { Invoke-Expression $Command | Out-String -Width 240 }
              catch { "ERRO: $($_.Exception.Message)" }
    [void]$out.AppendLine($result.TrimEnd())
    [void]$out.AppendLine('```')
}

# Latencia/jitter/perda a partir de um endereco de origem especifico.
# ping.exe -S e o unico caminho confiavel: Test-Connection do PS7 nao expoe -Source.
# O regex cobre pt-BR ("tempo=") e en-US ("time=").
function Measure-Link {
    param([string] $SourceIP, [string] $Target, [int] $Count = 40)

    $raw     = ping -n $Count -w 1500 -S $SourceIP $Target 2>&1
    $samples = [regex]::Matches(($raw -join "`n"), '(?:tempo|time)[=<](\d+)\s*ms') |
               ForEach-Object { [int]$_.Groups[1].Value }
    $lossPct = [math]::Round(100 * ($Count - $samples.Count) / $Count, 1)

    if ($samples.Count -lt 2) {
        return [pscustomobject]@{
            Origem = $SourceIP; Destino = $Target; Enviados = $Count
            Recebidos = $samples.Count; PerdaPct = $lossPct
            MediaMs = $null; MinMs = $null; MaxMs = $null; JitterMs = $null
        }
    }

    # Jitter = media da variacao absoluta entre amostras consecutivas (IPDV, RFC 3393).
    $deltas = for ($i = 1; $i -lt $samples.Count; $i++) {
        [math]::Abs($samples[$i] - $samples[$i - 1])
    }

    [pscustomobject]@{
        Origem    = $SourceIP
        Destino   = $Target
        Enviados  = $Count
        Recebidos = $samples.Count
        PerdaPct  = $lossPct
        MediaMs   = [math]::Round(($samples | Measure-Object -Average).Average, 1)
        MinMs     = ($samples | Measure-Object -Minimum).Minimum
        MaxMs     = ($samples | Measure-Object -Maximum).Maximum
        JitterMs  = [math]::Round(($deltas  | Measure-Object -Average).Average, 2)
    }
}

# Descobre o IP publico de UM link especifico.
# Socket cru com Bind() na origem: HttpClient so permite escolher o endereco local
# via ConnectCallback, e ConnectCallback em PowerShell quebra por falta de runspace
# na thread do socket. HTTP simples (porta 80) evita o custo de TLS.
function Get-PublicIPFrom {
    param([string] $SourceIP, [string] $HostName = 'api.ipify.org', [string] $Path = '/')

    try {
        $addr = [System.Net.Dns]::GetHostAddresses($HostName) |
                Where-Object AddressFamily -eq 'InterNetwork' |
                Select-Object -First 1
        if (-not $addr) { return 'FALHOU: sem registro A' }

        $sock = [System.Net.Sockets.Socket]::new('InterNetwork', 'Stream', 'Tcp')
        try {
            $sock.Bind([System.Net.IPEndPoint]::new([System.Net.IPAddress]::Parse($SourceIP), 0))
            $sock.ReceiveTimeout = 10000
            $sock.SendTimeout    = 10000
            $sock.Connect($addr, 80)

            $req = "GET $Path HTTP/1.1`r`nHost: $HostName`r`nUser-Agent: netlane-baseline`r`nConnection: close`r`n`r`n"
            [void]$sock.Send([Text.Encoding]::ASCII.GetBytes($req))

            $buf = [byte[]]::new(8192)
            $sb  = [Text.StringBuilder]::new()
            while (($n = $sock.Receive($buf)) -gt 0) {
                [void]$sb.Append([Text.Encoding]::ASCII.GetString($buf, 0, $n))
            }
            return (($sb.ToString() -split "`r`n`r`n", 2)[1]).Trim()
        }
        finally { $sock.Dispose() }
    }
    catch { return "FALHOU: $($_.Exception.Message)" }
}

# ASN de um IP via Team Cymru (consulta DNS TXT, sem HTTP).
function Get-AsnFor {
    param([string] $IPv4)
    try {
        $rev = ($IPv4 -split '\.')[3..0] -join '.'
        $txt = (Resolve-DnsName -Type TXT -Name "$rev.origin.asn.cymru.com" -ErrorAction Stop |
                Where-Object Strings).Strings -join ' '
        $asn = ($txt -split '\|')[0].Trim()
        $nm  = (Resolve-DnsName -Type TXT -Name "AS$asn.asn.cymru.com" -ErrorAction SilentlyContinue |
                Where-Object Strings).Strings -join ' '
        return "AS$asn | $(($nm -split '\|')[-1].Trim()) | prefixo $(($txt -split '\|')[1].Trim())"
    }
    catch { return "lookup falhou: $($_.Exception.Message)" }
}

# ------------------------------------------------------------------ cabecalho

$isAdmin = ([Security.Principal.WindowsPrincipal] `
            [Security.Principal.WindowsIdentity]::GetCurrent()
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

Add-Text '# Baseline do ambiente - NetLane'
Add-Text ''
Add-Text "Capturado em: **$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')**  "
Add-Text "Maquina: **$env:COMPUTERNAME** | Usuario: **$env:USERNAME** | Sessao elevada: **$isAdmin**"
Add-Text ''
Add-Text '> Estado de referencia para rollback e para os testes de aceitacao.'
Add-Text '> Saida bruta, sem edicao. Nao editar a mao: regerar com'
Add-Text '> `pwsh -File scripts/capture-baseline.ps1 -IncludeProbes`.'

Add-Section 'Sistema operacional'
Add-Capture 'Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber,OSArchitecture,InstallDate,LastBootUpTime | Format-List'
Add-Capture "Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' | Select-Object ProductName,DisplayVersion,CurrentBuild,UBR | Format-List"

Add-Section 'Hardware'
Add-Capture 'Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer,Model,TotalPhysicalMemory,NumberOfLogicalProcessors | Format-List'
Add-Capture 'Get-CimInstance Win32_BaseBoard | Select-Object Manufacturer,Product | Format-List'
Add-Capture 'Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,MaxClockSpeed | Format-List'
Add-Capture 'Get-CimInstance Win32_VideoController | Select-Object Name,CurrentHorizontalResolution,CurrentVerticalResolution,CurrentRefreshRate,DriverVersion | Format-Table -AutoSize'

Add-Section 'Toolchain'
Add-Capture '$PSVersionTable.PSVersion | Format-List'
Add-Capture 'dotnet --list-sdks'
Add-Capture 'dotnet --list-runtimes'
Add-Capture 'git --version'

Add-Section 'Adaptadores de rede'
Add-Capture 'Get-NetAdapter | Select-Object Name,InterfaceDescription,InterfaceIndex,Status,LinkSpeed,MacAddress,MediaType | Format-Table -AutoSize'
Add-Capture 'Get-NetAdapter | Select-Object Name,DriverProvider,DriverVersion,DriverDate,DriverFileName | Format-Table -AutoSize'

Add-Section 'Configuracao IP detalhada'
Add-Capture 'Get-NetIPConfiguration -Detailed'

Add-Section 'Interfaces IPv4'
Add-Capture 'Get-NetIPInterface -AddressFamily IPv4 | Select-Object ifIndex,InterfaceAlias,InterfaceMetric,Dhcp,ConnectionState,NlMtu | Sort-Object InterfaceMetric | Format-Table -AutoSize'

Add-Section 'Interfaces IPv6'
Add-Capture 'Get-NetIPInterface -AddressFamily IPv6 | Select-Object ifIndex,InterfaceAlias,InterfaceMetric,Dhcp,ConnectionState,NlMtu | Sort-Object InterfaceMetric | Format-Table -AutoSize'

Add-Section 'Enderecos IP'
Add-Capture 'Get-NetIPAddress -AddressFamily IPv4 | Select-Object ifIndex,InterfaceAlias,IPAddress,PrefixLength,PrefixOrigin,SuffixOrigin,AddressState | Sort-Object ifIndex | Format-Table -AutoSize'
Add-Capture 'Get-NetIPAddress -AddressFamily IPv6 | Select-Object ifIndex,InterfaceAlias,IPAddress,PrefixLength,PrefixOrigin,SuffixOrigin,AddressState | Sort-Object ifIndex | Format-Table -AutoSize'

Add-Section 'Tabela de rotas IPv4 - ESTADO DE REFERENCIA'
Add-Capture 'Get-NetRoute -AddressFamily IPv4 | Sort-Object RouteMetric,DestinationPrefix | Select-Object ifIndex,InterfaceAlias,DestinationPrefix,NextHop,RouteMetric,InterfaceMetric,Protocol,Store | Format-Table -AutoSize'

Add-Section 'Tabela de rotas IPv6 - ESTADO DE REFERENCIA'
Add-Capture 'Get-NetRoute -AddressFamily IPv6 | Sort-Object RouteMetric,DestinationPrefix | Select-Object ifIndex,InterfaceAlias,DestinationPrefix,NextHop,RouteMetric,InterfaceMetric,Protocol,Store | Format-Table -AutoSize'

Add-Section 'DNS'
Add-Capture 'Get-DnsClientServerAddress -AddressFamily IPv4 | Select-Object InterfaceIndex,InterfaceAlias,ServerAddresses | Format-Table -AutoSize'
Add-Capture 'Get-DnsClientServerAddress -AddressFamily IPv6 | Select-Object InterfaceIndex,InterfaceAlias,ServerAddresses | Format-Table -AutoSize'

Add-Section 'Bindings de protocolo (deteccao de filtros e drivers exoticos)'
Add-Capture 'Get-NetAdapterBinding | Where-Object Enabled | Select-Object Name,DisplayName,ComponentID | Sort-Object Name,ComponentID | Format-Table -AutoSize'

Add-Section 'Firewall'
Add-Capture 'Get-NetFirewallProfile | Select-Object Name,Enabled,DefaultInboundAction,DefaultOutboundAction | Format-Table -AutoSize'

Add-Section 'Virtualizacao e VPN'
Add-Capture 'Get-CimInstance Win32_OptionalFeature | Where-Object Name -in @(''Microsoft-Hyper-V-All'',''VirtualMachinePlatform'',''Microsoft-Windows-Subsystem-Linux'') | Select-Object Name,InstallState | Format-Table -AutoSize'
Add-Capture 'Get-Service -Name Tailscale*,vmms,LxssManager -ErrorAction SilentlyContinue | Select-Object Name,Status,StartType | Format-Table -AutoSize'

Add-Section 'Anticheat instalado (NUNCA injetar nestes processos)'
Add-Capture 'Get-Service -Name EasyAntiCheat*,BEService*,vgc,vgk -ErrorAction SilentlyContinue | Select-Object Name,Status,StartType | Format-Table -AutoSize'

Add-Section 'Sockets no momento da captura'
Add-Capture 'Get-NetTCPConnection -State Established | Select-Object LocalAddress,LocalPort,RemoteAddress,RemotePort,OwningProcess,@{n=''Proc'';e={(Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName}} | Sort-Object Proc,LocalAddress | Format-Table -AutoSize'
Add-Capture 'Get-NetTCPConnection -State Established | Group-Object LocalAddress | Select-Object Count,Name | Sort-Object Count -Descending | Format-Table -AutoSize'

Add-Section 'Ambiente grafico'
Add-Capture "Get-ItemProperty 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize' | Select-Object AppsUseLightTheme,SystemUsesLightTheme | Format-List"
Add-Capture "Get-ItemProperty 'HKCU:\SOFTWARE\Microsoft\Windows\DWM' | Select-Object AccentColor,ColorizationColor,ColorPrevalence,EnableTransparency | Format-List"
Add-Capture "Get-ItemProperty 'HKCU:\Control Panel\Desktop\WindowMetrics' -Name MinAnimate | Select-Object MinAnimate | Format-List"

# --------------------------------------------------------------- sondas ativas

if ($IncludeProbes) {
    Add-Section 'Sondas ativas por link'
    Add-Text 'Origens medidas: um endereco IPv4 por link que tenha gateway default.'
    Add-Text ''

    $sources = Get-NetIPConfiguration |
               Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address } |
               ForEach-Object {
                   [pscustomobject]@{
                       Alias   = $_.InterfaceAlias
                       IfIndex = $_.InterfaceIndex
                       IP      = ($_.IPv4Address        | Select-Object -First 1).IPAddress
                       Gateway = ($_.IPv4DefaultGateway | Select-Object -First 1).NextHop
                   }
               }

    Add-Text '### Latencia, jitter e perda (40 pacotes ICMP para 1.1.1.1)'
    Add-Text ''
    Add-Text '```text'
    $rows = foreach ($s in $sources) {
        Measure-Link -SourceIP $s.IP -Target '1.1.1.1' -Count 40 |
            Add-Member -NotePropertyName Link -NotePropertyValue $s.Alias -PassThru
    }
    Add-Text (($rows |
               Select-Object Link,Origem,Enviados,Recebidos,PerdaPct,MediaMs,MinMs,MaxMs,JitterMs |
               Format-Table -AutoSize | Out-String -Width 240).TrimEnd())
    Add-Text '```'
    Add-Text ''

    Add-Text '### Identidade publica de cada link'
    Add-Text ''
    Add-Text '```text'
    foreach ($s in $sources) {
        $pub = Get-PublicIPFrom -SourceIP $s.IP
        $asn = if ($pub -notmatch '^FALHOU') { Get-AsnFor $pub } else { 'n/a' }
        Add-Text ('{0,-14} origem {1,-16} gw {2,-16} -> publico {3,-16} {4}' -f `
                  $s.Alias, $s.IP, $s.Gateway, $pub, $asn)
    }
    Add-Text '```'
}

Set-Content -Path $OutFile -Value $out.ToString() -Encoding utf8
Write-Host "Gravado: $OutFile ($([math]::Round((Get-Item $OutFile).Length / 1KB, 1)) KB)"
