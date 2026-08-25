# Decisões — NetLane

Registro de decisões de arquitetura e de design, com o motivo de cada uma.
Ordem cronológica. Uma decisão revogada não é apagada: é marcada como **Revogada** com a que a substituiu.

---

## D-001 · O NetLane é genérico; esta máquina é ambiente de teste
**Data:** 2026-08-24 · **Status:** Aceita

Nenhum valor deste PC entra no código. Sem `ifIndex`, IP, gateway, sub-rede ou lista de jogos literais. Tudo por descoberta em runtime. `N` links, incluindo 0 e 1. Dual-family em toda a pilha.

**Por quê:** decisão do usuário, e é a que separa um utilitário de um script de configuração pessoal. O único lugar onde este ambiente aparece é `baseline-ambiente.md` e os testes de campo.

---

## D-002 · Rotas host `/32` e `/128`, não manipulação de métrica
**Data:** 2026-08-24 · **Status:** Aceita, pendente de confirmação empírica (F5)

A seleção de rota no Windows ordena por (1) *longest prefix match*, (2) métrica de rota, (3) métrica de interface. Um `/32` vence um `/0` **independentemente de métrica**.

**Por quê:** torna o redirecionamento imune a mudanças de métrica de default gateway — inclusive a um adaptador de VPN subindo com métrica menor que todas as outras. Nesta máquina isso não é hipotético: o Tailscale está em métrica 5, a menor da máquina. Manipular métrica seria alteração permanente de sistema e frágil a qualquer VPN.

---

## D-003 · Identidade de link por `InterfaceGuid`, nunca `ifIndex` nem MAC
**Data:** 2026-08-24 · **Status:** Aceita

`ifIndex` e LUID são resolvidos a cada operação e nunca cacheados entre sessões.

**Por quê:** medido no ambiente. `ifIndex` é volátil — um adaptador USB/tethering desaparece ao desconectar e volta com outro índice. MAC também não serve: dois adaptadores desta máquina têm o bit *locally administered* setado (`EE-…` e `22-…`; o bit está no primeiro octeto, o resto do endereço não acrescenta nada ao argumento e sai daqui porque o repositório é público), ou seja, randomizados pelo driver. `InterfaceGuid` persiste.

---

## D-004 · IP Helper API, nunca `route.exe`
**Data:** 2026-08-24 · **Status:** Aceita

`CreateIpForwardEntry2` / `DeleteIpForwardEntry2` / `GetExtendedTcpTable` via P/Invoke.

**Por quê:** erro estruturado em vez de parse de texto localizado (esta máquina está em pt-BR — `route.exe` responderia em português); controle sobre `Origin`/`Protocol`, que usamos como marcador de propriedade da rota; e ~20 ms de criação de processo evitados por rota, o que importa quando uma sessão gera dezenas.

---

## D-005 · Dual-family desde o dia 1
**Data:** 2026-08-24 · **Status:** Aceita — decisão do usuário

**Por quê:** medido no baseline: só o link do tethering tem IPv6 global, e **8 conexões já saem por IPv6** (Chrome, VS Code, Claude, inclusive via NAT64 `64:ff9b::`). Como IPv6 é preferido sobre IPv4 (RFC 6724), um motor só-IPv4 deixaria vazar todo destino com registro AAAA. `MIB_IPFORWARD_ROW2` carrega `SOCKADDR_INET`, então uma implementação serve as duas famílias.

**Pegadinha registrada:** gateway IPv6 costuma ser link-local (`fe80::/10`) e exige `ScopeId` = índice da interface, senão a chamada falha com `ERROR_INVALID_PARAMETER`.

---

## D-006 · Herança para filhos é opt-in, e a regra casa o jogo — não o launcher
**Data:** 2026-08-24 · **Status:** Aceita

A árvore de processos serve para **descobrir** o jogo nascido sob um launcher. Não para redirecionar o launcher. `inheritToChildren` é opt-in por regra.

**Por quê:** redirecionar `steam` inteiro mandaria updates de dezenas de GB pelo link de jogos. Neste ambiente, esse link é uma franquia móvel. O requisito pede herança para pegar o jogo iniciado como filho — o que ele não pede é que o launcher em si mude de link.

---

## D-007 · Reconciliação por ledger write-ahead
**Data:** 2026-08-24 · **Status:** Aceita

A spec da rota é gravada em `%ProgramData%\NetLane\ledger.jsonl` **antes** de a rota ser criada; a remoção grava o fecho. Na inicialização, entradas abertas cuja rota ainda existe e cujo processo dono não está vivo são órfãs → removidas.

**Por quê:** um crash entre "criar rota" e "registrar rota" deixaria uma rota órfã invisível. Escrevendo antes, o pior caso é uma entrada no ledger sem rota correspondente — inofensivo e detectável. Duas camadas de identificação (ledger + marcador de `Protocol` na rota) para não depender de uma só.

---

## D-008 · WPF + WPF-UI, tray com `NotifyIcon` do WinForms
**Data:** 2026-08-24 · **Status:** Aceita

`net8.0-windows10.0.19041.0`, x64. WPF-UI 4.3.0. Tray via `System.Windows.Forms.NotifyIcon` (`UseWindowsForms` + `UseWPF`), com menu em `Popup` WPF próprio.

**Por quê:** WebView2 foi rejeitado apesar de ser melhor para os gráficos densos do Pulse — custa 80–150 MB de RSS parado e o requisito diz que a UI aberta não pode elevar o consumo. Séries temporais em WPF se resolvem com `DrawingVisual`/`WriteableBitmap`. WinUI 3 traz MSIX, que atrapalha conviver com um serviço; Avalonia paga multiplataforma que está fora de escopo.

`H.NotifyIcon.Wpf 2.4.1` foi testado e **descartado**: resolve para assets `.NETFramework` no nosso TFM e emite `NU1701`. Dependência de terceiros com fallback de compatibilidade, para algo que o runtime já entrega.

**Verificado:** SDK 10.0.201 compila `net8.0-windows` WPF sem SDK 8 instalado; WPF-UI + o TFM alvo compilam com 0 erros.

---

## D-009 · Consolas como face de dados
**Data:** 2026-08-24 · **Status:** Aceita

**Por quê:** o registro de fontes desta máquina mostra **Cascadia Mono ausente** — ela só chega junto com Windows Terminal/VS e não é garantida em Windows limpo. Consolas existe em toda instalação desde o Vista. Uma face de dados que às vezes não existe é uma face que às vezes vira serifada num campo de endereço IP. Decisão de genericidade (D-001), não de gosto.

---

## D-010 · Colunas-raia em vez de cards; rampa de cor em vez de accent
**Data:** 2026-08-24 · **Status:** Aceita

Ver [design.md](design.md) §9 para a autocrítica completa.

**Por quê:** a pergunta que o usuário faz à interface é *"por onde?"*, não *"quanto?"*. Card comunica valor; coluna comunica direção. E a cor no NetLane não é marca — é o identificador do link, então um accent global competiria com o único significado que a cor pode ter. Vermelho ficou fora da rampa para que vermelho na tela signifique sempre e só *problema*.

---

## D-011 · Adaptador sem gateway ou local-only nunca recebe rota
**Data:** 2026-08-24 · **Status:** Aceita

`LinkState` distingue `Ready`, `NoGateway`, `Down` e `LocalOnly`. Só `Ready` é alvo válido de rota, e apenas `Ready`/`NoGateway` viram coluna no Início.

**Por quê:** neste ambiente há um Ethernet a 1 Gbps com cabo conectado, sem DHCP (APIPA `169.254.x`) e com métrica fixada em 9000 manualmente — é um link ponto-a-ponto para streaming Sunshine de um notebook. Mandar tráfego de internet por ele quebraria as duas coisas. Genericamente: link sem saída é estado de primeira classe, não erro.

---

## Testes de campo — resultados

Preenchido conforme cada um roda. Ver [plano-tecnico.md](plano-tecnico.md) §6.

| id | Pergunta | Resultado |
|---|---|---|
| F1 | Rota `/32` via gateway B faz o Windows escolher o endereço de origem de B? | *pendente — bloqueante* |
| F2 | Dead gateway detection desfaz o redirecionamento? | *pendente* |
| F3 | Latência de detecção de processo: WMI vs ETW | *pendente* |
| F4 | O link de jogos é melhor sob carga? | *pendente* |
| F5 | `/32` vence default de métrica menor? | *pendente* |
