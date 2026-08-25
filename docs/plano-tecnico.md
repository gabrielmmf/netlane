# Plano técnico — NetLane

Status: **aguardando aprovação**
Base: `baseline-ambiente.md` (local, gerado) · Decisões: [decisoes.md](decisoes.md) · Design: [design.md](design.md)

---

## 0. Princípio que governa tudo

> **O NetLane é genérico. Esta máquina é o ambiente de teste, não o alvo do design.**

Consequências não-negociáveis no código:

| Nunca | Sempre |
|---|---|
| `ifIndex` literal | resolvido em runtime a partir de identidade estável |
| IP, gateway ou sub-rede literal | descoberto da tabela de interfaces |
| Lista fixa de jogos | heurística + regras do usuário, em JSON |
| "dois links" | `N` links, incluindo 0 e 1 |
| Assumir que existe gateway | link sem gateway é estado de primeira classe |
| Assumir IPv4 | dual-family em toda a pilha |

O único lugar onde este PC aparece é em `docs/baseline-ambiente.md` e nos testes de campo.

---

## 1. Recomendação de stack (e o que eu mudaria)

**Concordo com WPF (.NET 8) + WPF-UI.** Não é concordância por conveniência — verifiquei:

- `WPF-UI 4.3.0` restaura e compila em `net8.0-windows10.0.19041.0`: **build com êxito, 0 erros**.
- Mica exige Win11 22000+; o alvo aqui é 26100.

**Rejeito WebView2 + front-end web**, apesar de ser tentador para o Pulse. Motivo objetivo: o requisito não-funcional diz que *"a UI aberta não pode ser a razão de o consumo subir"*. Um WebView2 custa 80–150 MB de RSS parado. Séries temporais em tempo real em WPF se resolvem com `DrawingVisual` + `WriteableBitmap` desenhando o traçado direto — milhares de pontos a 60 fps, sem árvore visual por ponto. É mais trabalho de implementação e muito menos custo em runtime.

**Rejeito WinUI 3**: empacotamento MSIX complica a convivência com um serviço Windows e com instalação sem loja. **Rejeito Avalonia**: paga o preço de multiplataforma que está explicitamente fora de escopo, e perde Mica/tema nativo.

**Uma mudança em relação ao sugerido:** tray com `System.Windows.Forms.NotifyIcon` (`UseWindowsForms` + `UseWPF` no mesmo projeto), **não** `H.NotifyIcon.Wpf`. Motivo medido: o pacote resolve para assets `.NETFramework` no nosso TFM e emite `NU1701` — dependência de terceiros com fallback de compatibilidade, para uma funcionalidade que o runtime já entrega. O menu de contexto é um `Popup` WPF nosso, então o visual continua sob controle do design.

### Framework

`net8.0-windows10.0.19041.0`, x64. O SDK 8 **não** está instalado nesta máquina, mas o SDK 10.0.201 compila `net8.0` sem nada a instalar — verificado com projeto WPF de teste. Fica em .NET 8 como especificado.

---

## 2. Estrutura de pastas

```
netlane/
├─ NetLane.sln
├─ Directory.Build.props              TFM, nullable, TreatWarningsAsErrors, versão
├─ Directory.Packages.props           versões pinadas (central package management)
├─ docs/
│  ├─ baseline-ambiente.md            estado de referência (gerado, não versionado)
│  ├─ plano-tecnico.md                este arquivo
│  ├─ design.md                       plano de design aprovado
│  ├─ decisoes.md                     ADRs: o quê e por quê
│  └─ alteracoes-sistema.md           toda mudança de sistema + comando de reversão
├─ scripts/
│  ├─ capture-baseline.ps1            já existe
│  ├─ route-diff.ps1                  snapshot/diff da tabela de rotas
│  └─ field-tests/                    F1..F5 (seção 6)
├─ src/
│  ├─ NetLane.Abstractions/           contratos puros. Zero P/Invoke, zero Windows.
│  ├─ NetLane.Core/                   lógica pura e testável
│  ├─ NetLane.Windows/                TODO o P/Invoke vive aqui e só aqui
│  ├─ NetLane.Modules.Lanes/          primeiro módulo
│  ├─ NetLane.Ipc/                    named pipe + JSON-RPC (cliente e servidor)
│  ├─ NetLane.Service/               serviço Windows, elevado
│  ├─ NetLane.App/                    UI WPF, sem elevação
│  └─ NetLane.Cli/                    netlane.exe
└─ tests/
   ├─ NetLane.Core.Tests/             unitários, sem tocar no SO
   ├─ NetLane.Modules.Lanes.Tests/    decisão de rota, reconciliação, herança
   └─ NetLane.Windows.IntegrationTests/  tocam o SO de verdade; [Trait("Field")]
```

A regra de dependência: `Abstractions ← Core ← Modules`. `Windows` implementa `Abstractions` e **ninguém depende dele em tempo de compilação** exceto `Service` (composition root). É isso que torna a decisão de rota testável sem Windows.

---

## 3. Contratos

### 3.1 Núcleo agnóstico

```csharp
// Um caminho de saída. Não é "adaptador": um adaptador sem gateway não é um link utilizável.
public interface ILink {
    LinkId              Id          { get; }   // ancorado em InterfaceGuid
    string              DisplayName { get; }   // "Link de jogos" — dado pelo usuário
    string              AdapterName { get; }   // "Ethernet 2" — do sistema
    LinkState           State       { get; }   // Ready | NoGateway | Down | LocalOnly
    IReadOnlyList<GatewayInfo> Gateways { get; }  // por família
    IReadOnlyList<IPAddress>   Addresses { get; }
    string              ColorToken  { get; }   // identidade visual, seção 4 do design
}

public interface IRouteTable {                 // a fronteira mockável
    IReadOnlyList<RouteEntry> Snapshot(AddressFamily family);
    RouteResult Create(RouteSpec spec);
    RouteResult Delete(RouteSpec spec);
}

public interface ISocketTable {
    IReadOnlyList<SocketEntry> ByProcesses(IReadOnlySet<int> pids, AddressFamily family);
}

public interface IProcessWatcher {
    event EventHandler<ProcessStartedEvent> Started;   // pid, ppid, imagem, caminho
    event EventHandler<ProcessStoppedEvent> Stopped;
}
```

`RouteSpec` é um *value object* imutável — destino, prefixo, next hop, LUID de interface, métrica, família. É a unidade que o ledger persiste e que os testes comparam.

### 3.2 Contrato de módulo

É isto que faz Pulse/Profiles/Doctor entrarem sem reescrita, e a UI descobrir em vez de hardcodar:

```csharp
public interface INetLaneModule {
    ModuleDescriptor Descriptor { get; }        // id, nome, ícone, telas, ordem
    Task StartAsync(IModuleContext ctx, CancellationToken ct);
    Task StopAsync(CancellationToken ct);
    Task<object?> HandleAsync(string verb, JsonElement payload, CancellationToken ct);
    IAsyncEnumerable<ModuleEvent> Events { get; }   // push para a UI
}

public interface IModuleContext {               // o que o núcleo empresta ao módulo
    ILinkRegistry  Links   { get; }
    IRouteTable    Routes  { get; }
    ISocketTable   Sockets { get; }
    IProcessWatcher Processes { get; }
    IConfigStore   Config  { get; }
    ILogger        Log     { get; }
}
```

O IPC expõe `core.listModules`; a UI monta a navegação a partir da resposta. Um módulo novo aparece na fita de navegação sem uma linha de XAML alterada.

### 3.3 IPC

JSON-RPC 2.0, framing por linha, sobre named pipe `\\.\pipe\netlane.v1`.

- Método = `"<módulo>.<verbo>"` → despachado para `HandleAsync`. `core.*` é o núcleo.
- Notificações servidor→cliente para eventos (rota criada/removida, processo entrou/saiu, link mudou de estado). É isso que atende o critério de aceitação 8 (< 2 s) — **push, não polling**.
- ACL do pipe: leitura/escrita para `BUILTIN\Users`, criação só para `SYSTEM`. A UI não eleva.

---

## 4. Decisões técnicas que sustentam o módulo Lanes

**Rotas host `/32` e `/128`, e por que são robustas.** A seleção de rota no Windows ordena por (1) *longest prefix match*, (2) métrica de rota, (3) métrica de interface. Um `/32` sempre vence um `/0`, **independentemente de métrica**. É por isso que a abordagem sobrevive a um adaptador de VPN subindo com métrica menor que todas as outras — situação que existe nesta máquina, com o Tailscale em métrica 5. É a razão técnica de preferir rotas host a mexer em métrica. *A confirmar empiricamente — teste F5.*

**Dual-family desde o dia 1.** `MIB_IPFORWARD_ROW2` carrega `SOCKADDR_INET`, então `CreateIpForwardEntry2` / `DeleteIpForwardEntry2` são agnósticos de família: uma implementação serve IPv4 e IPv6. Pegadinha a tratar: gateway IPv6 costuma ser link-local (`fe80::/10`) e exige `ScopeId` = índice da interface, senão a chamada falha com `ERROR_INVALID_PARAMETER`.

**Identidade de link por `InterfaceGuid`, nunca `ifIndex` nem MAC.** `ifIndex` é volátil — um adaptador USB/tethering desaparece e volta com outro índice. MAC também não serve: nesta máquina dois adaptadores têm o bit *locally administered* setado (`EE-04-…`, `22-17-…`), ou seja, randomizados. `InterfaceGuid` persiste. O `ifIndex`/LUID é resolvido a cada operação, nunca cacheado entre sessões.

**`CreateIpForwardEntry2`, nunca `route.exe`.** A API dá erro estruturado, permite fixar `Origin`/`Protocol` (que usamos como marcador de propriedade) e evita ~20 ms de criação de processo por rota — relevante quando uma sessão de jogo gera dezenas de rotas.

**Detecção de processo: WMI primeiro, ETW se necessário.** `Win32_ProcessStartTrace` é simples e suficiente se a latência for baixa; ETW `Microsoft-Windows-Kernel-Process` tem latência menor e não perde eventos sob carga, ao custo de bem mais código. Ambos atrás de `IProcessWatcher`. **Não vou assumir qual serve — teste F3 mede a latência real e o número de conexões abertas na janela cega.** O passo 2 do algoritmo (pré-aplicar IPs já conhecidos do perfil) existe justamente para tornar essa janela inofensiva.

**Herança seletiva — e isto é uma correção de rumo importante.** O requisito diz que launchers iniciam o jogo como filho, e que a regra precisa herdar para filhos. Correto. Mas herdar **para** o filho não pode significar redirecionar **o launcher**: mandar o processo `steam` inteiro pelo link de jogos joga updates de dezenas de GB nele — que, no caso desta máquina, é uma franquia móvel. Então:

- a regra casa o **executável do jogo**;
- a árvore de processos serve para **descobrir** o jogo nascido sob um launcher;
- `inheritToChildren` é **opt-in por regra**, não o padrão.

**Reconciliação por ledger write-ahead.** Antes de criar a rota, a spec é gravada num log append-only (`%ProgramData%\NetLane\ledger.jsonl`); só depois a rota é criada; a remoção grava o fecho. Na inicialização: tudo que está aberto no ledger e ainda existe na tabela, sem processo dono vivo, é órfão → remove. Duas camadas de identificação (ledger + marcador de `Protocol` na rota) para não depender de uma só. Atende o critério 5.

**Polling adaptativo.** Sem regra ativa, o serviço não varre nada — só o watcher de processos, que é event-driven e custa zero. Com regra ativa: `GetExtendedTcpTable`/`UdpTable` a 250 ms, recuando progressivamente até 2 s após N ciclos sem IP novo, e voltando a 250 ms ao ver um. A UI aberta **não** altera a cadência do serviço: ela recebe push.

---

## 5. O que eu preciso te contar antes de você aprovar

**5.1 — O link que você escolheu para jogos tem números piores em repouso.**

```
Wi-Fi (padrão)       13,7 ms   jitter 2,90 ms   perda 0%
Ethernet 2 (jogos)   26,6 ms   jitter 7,15 ms   perda 0%
```

Sua escolha continua defensável, e por dois motivos que os números em repouso não mostram: o Wi-Fi é um **hotspot aberto de terceiros** (compartilhado, fora do seu controle, e já mediu 12% de perda e troca de operadora numa janela de 10 min), enquanto o celular é link exclusivo seu; e o ganho real do NetLane aqui não é latência menor, é **isolar o jogo do congestionamento** que o próprio tráfego pesado causa. Mas isso é hipótese até medir — é o teste F4. Se o Wi-Fi sob carga ficar pior que o celular, a escolha está provada. Se não ficar, você vai querer saber.

**5.2 — Hoje, sem NetLane, seu Chrome já queima franquia móvel.**

Só o Ethernet 2 tem IPv6 global; o Wi-Fi tem `IPv6Connectivity: NoTraffic`. Como IPv6 é preferido sobre IPv4 (RFC 6724), **todo destino com registro AAAA já sai pelo celular**. Não é previsão: o baseline mostra 8 conexões assim, de Chrome, VS Code e Claude, inclusive via NAT64.

Rotear IPv6 (o que você aprovou) resolve o tráfego *dos jogos*. Não resolve esse vazamento no sentido inverso, porque não há IPv6 no link padrão para onde mandá-lo. As saídas são todas alteração de sistema e **nenhuma será feita sem seu ok explícito, registrada em `alteracoes-sistema.md` com o comando de reversão**. Trago as opções quando chegarmos na fatia (d).

**5.3 — O Windows já está trocando de link sozinho.** O baseline mostra o mesmo processo com conexões nos dois links simultaneamente. Provável *dead gateway detection*. Isso pode desfazer o redirecionamento e vai poluir os critérios de aceitação 1 e 2 — teste F2.

---

## 6. Incertezas que viram teste, não suposição

| id | Pergunta | Como meço | Depende de |
|---|---|---|---|
| **F1** | Com dois gateways default, criar rota `/32` via o gateway B faz o Windows escolher o endereço de origem de B? | Rota `/32` para IP de teste, conectar sem bind, ler `LocalAddress`. É a premissa central de toda a arquitetura. | elevação |
| **F2** | Dead gateway detection desfaz o redirecionamento? | Segurar conexão pela rota `/32`, induzir falha no gateway, observar migração. | elevação |
| **F3** | Latência entre `CreateProcess` e o evento — WMI vs ETW? Quantas conexões escapam na janela cega? | Cronometrar os dois watchers no mesmo processo-alvo; contar sockets abertos no intervalo. | — |
| **F4** | O link de jogos é melhor **sob carga**, que é o caso de uso real? | Medir jitter dos dois links com o link padrão saturado. | você iniciar um download |
| **F5** | `/32` realmente vence uma default de métrica menor (ex.: VPN)? | Subir rota concorrente de métrica baixa; verificar qual vence. | elevação |

Cada um vira script em `scripts/field-tests/` com saída anexada a `docs/decisoes.md`. **F1 é bloqueante**: se a resposta for não, a arquitetura de rotas host não funciona e eu volto com alternativas antes de escrever o motor.

---

## 7. Ordem de execução

Sigo a ordem que você definiu. Antes de (a), o protótipo visual navegável com dados falsos.

| # | Fatia | Entrega | Prova |
|---|---|---|---|
| 0 | Esqueleto + protótipo visual | solução, projetos, UI navegável com dados falsos | screenshot + sua reação |
| a | Interop de rotas | `Win32RouteTable`, ledger, F1/F5 | testes unitários + diff de rotas real |
| b | Tabela de sockets por PID | `Win32SocketTable` dual-family | conta sockets de um processo real |
| c | Processos e árvore de filhos | `IProcessWatcher` ×2, F3 | latência medida dos dois |
| d | Motor de regras + JSON | hot-reload, herança seletiva, sugestões | unitários de decisão e reconciliação |
| e | Serviço + IPC | serviço elevado, pipe, JSON-RPC | serviço sobrevive a fechar a UI |
| f | UI ligada ao serviço | Dashboard real | critério 8 (< 2 s) |
| g | Lanes e sugestões | CRUD de regras, fila de sugestões | critério 6 (jogo via Steam) |
| h | Tray e notificações | ícone por estado, botão de pânico | — |
| i | Atividade | timeline filtrável | critério 3 (volta ao baseline) |
| j | CLI | `status`, `add-rule`, `remove-rule`, `flush`, `test` | — |
| k | Instalador | instala/desinstala limpo | critério 7 |

Ao fim de cada fatia: build, testes, validação do que der por comando, resultado real reportado, commit atômico.

---

## 8. Segurança e limites — reafirmados

- **Nunca** injetar DLL, hookar Winsock ou tocar memória de processo. Esta máquina tem EasyAntiCheat, BattlEye, Vanguard (`vgk`, driver em `StartType: System`) e EA AntiCheat. Rotas host não tocam no processo — é o que torna a abordagem compatível com anticheat.
- Rotas **voláteis** (`ActiveStore`). Nada persistido na tabela do Windows. Nada de `-p`.
- Toda alteração de sistema aceita vai para `docs/alteracoes-sistema.md` com o comando exato de reversão.
- O serviço declara elevação no manifesto e falha com mensagem clara se não estiver elevado. A UI nunca eleva.
- Zero telemetria, zero chamada externa. A única saída de rede do produto é o teste de conectividade que **você** dispara.
- Adaptador sem gateway ou marcado local-only **nunca** recebe rota. Nesta máquina isso protege o link Sunshine do notebook.
