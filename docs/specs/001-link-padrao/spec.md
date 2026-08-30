---
id: 001
status: draft
tier: 3
owns:
  - "src/NetLane.Windows/Routing/**"
  - "src/NetLane.Windows/Interop/**"
  - "src/NetLane.Core/RuleEngine.cs"
  - "src/NetLane.Abstractions/Link.cs"
  - "src/NetLane.Abstractions/ProcessRule.cs"
---

# Link padrão do NetLane

**Tier 3** — toca `src/NetLane.Windows/Routing/**` e `Interop/**`. O plano precisa de
aprovação humana explícita antes de qualquer implementação.

> **`status: draft` aqui não significa "não acordada".** As cinco perguntas foram feitas e
> respondidas (ver *Decisões*); o conteúdo está fechado. Ela fica em `draft` porque
> `ready` faz o `trace-check` cobrar um teste por critério **imediatamente**, e a
> implementação está travada em F1 e F5. Passa para `in-progress` no mesmo PR em que os
> primeiros testes entrarem. Ver `docs/specs/README.md`.

## O problema

Hoje o NetLane só sabe fazer **exceção**. A regra casa um executável e manda ele por um
link; tudo o mais sai por onde o Windows decidir, e o NetLane não tem opinião sobre isso
(`RuleEngine.cs:56` devolve `NoRule`, e `:127` diz literalmente "Sem regra: o Windows
escolhe").

Isso deixa metade do problema real sem resposta, e a metade que sobrou é a cara. Medido
nesta máquina em 2026-08-30, durante a execução do F1: uma conexão para `1.1.1.1`
**sem nenhuma rota do NetLane** saiu por `10.181.91.64` — o link do celular — com o Wi-Fi
presente e com métrica de interface menor (10 contra 25). É o §5.2 do plano técnico
acontecendo: tráfego comum queimando franquia móvel, em silêncio.

O usuário quer o inverso do que existe: **dizer por onde sai o que não tem regra**, e usar
as regras por processo como exceções por cima disso.

## História

> Como quem tem um link caro e um barato, quero declarar que **todo tráfego sai pelo
> barato por padrão**, e que só os programas que eu escolher saem pelo caro — para não
> depender de o Windows adivinhar certo, e não descobrir a escolha dele na fatura.

## Premissas sobre o sistema hoje

Verificadas lendo o código, não supostas:

- Não existe motor de rotas. Nenhum `IRouteTable`, `RouteSpec` ou `CreateIpForwardEntry`
  em `src/` — `grep` não retorna nada. Nenhuma rota é criada por este produto hoje. ✓
- "Sem regra" resolve para "o Windows escolhe" (`src/NetLane.Core/RuleEngine.cs:56,127`). ✓
- A regra é `executável → LinkId`, sem conceito de padrão
  (`src/NetLane.Abstractions/ProcessRule.cs`). ✓
- O arquivo de regras é `{ "regras": [ { executavel, link, herdarParaFilhos, ativa } ] }`
  (`src/NetLane.Core/JsonRuleStore.cs:117-134`). Não há campo para um padrão. ✓
- A interface só oferece links `Ready` (`src/NetLane.App/MainViewModel.cs:231`), conforme
  D-011. ✓
- **F1 continua sem resposta.** A execução de 2026-08-30 foi invalidada por dois defeitos
  no script de medição, não pelo comportamento do Windows. Ver *Dependências*.

## Mecanismo proposto

Rotas `0.0.0.0/1` + `128.0.0.0/1` (e `::/1` + `8000::/1`) apontando para o link padrão
escolhido. Juntas cobrem o espaço de endereços inteiro e vencem o `0.0.0.0/0` do Windows
por *longest prefix match* — o mesmo mecanismo que o D-002 já escolheu, sem tocar em
métrica e sem tocar na rota padrão do sistema.

Por que não as alternativas:

| Alternativa | Por que não |
| --- | --- |
| Mudar métrica de interface | D-002 rejeitou explicitamente; e é alteração permanente de sistema, Artigo 2 |
| Reescrever a rota `0.0.0.0/0` do Windows | Destrói o estado que o usuário tinha; sem caminho de volta se o NetLane morrer |
| Política de prefixo (`netsh`) | Alteração permanente, Artigo 2, e afeta a máquina inteira |

As rotas `/1` são voláteis (`ActiveStore`), então um reboot as elimina — Artigo 3 preservado.

**Como as exceções continuam funcionando:** com um padrão do NetLane no lugar, uma regra
por processo aponta para outro link com um `/32`, que vence o `/1` por prefixo mais longo.
Mandar um processo de volta ao caminho original do Windows **não** é oferecido — ver
decisão 2 — e é o que impede esta spec de arrastar a tabela de sockets junto.

## Critérios de aceitação

Continuam a numeração de `000-criterios-de-aceitacao` (AC-001…AC-008 já usados).

```
AC-009  WHEN o usuário escolhe um link como padrão THE SYSTEM SHALL fazer todo tráfego
        sem regra sair por esse link, verificável pelo endereço de origem de uma
        conexão nova.

AC-010  WHERE existe um link padrão definido THE SYSTEM SHALL manter as regras por
        processo vencendo sobre ele, sem que a ordem de criação importe.

AC-011  WHEN o link padrão é removido ou o NetLane encerra THE SYSTEM SHALL devolver a
        tabela de rotas ao estado anterior, byte a byte, e o encerramento anormal cai
        na reconciliação do AC-005.

AC-012  IF o link escolhido como padrão deixa de estar Ready THE SYSTEM SHALL remover as
        rotas de padrão e voltar ao caminho do Windows, em vez de manter tráfego
        apontado para um link sem saída.

AC-013  WHILE um link padrão está ativo THE SYSTEM SHALL declará-lo na interface de forma
        que o usuário saiba, sem procurar, que o Windows não está mais decidendo.

AC-014  WHEN o usuário não definiu nenhum link padrão THE SYSTEM SHALL não criar rota
        nenhuma de padrão — o comportamento de hoje continua sendo o default do produto.
```

`AC-014` existe porque a ausência de configuração precisa ser um estado explícito e inerte.
Um produto que passa a mexer na tabela de rotas sem ninguém ter pedido é o oposto do
Artigo 3.

## Fora de escopo

- **Padrão por família.** Um link padrão para IPv4 e outro para IPv6 não entra nesta spec.
  As rotas `/1` são criadas nas duas famílias para o **mesmo** link.
- **Perfis.** Trocar o conjunto padrão + regras por contexto ("em casa", "viajando") é o
  módulo Profiles, não isto.
- **Resolver o vazamento de IPv6 do P-001.** Rotear IPv6 para o link padrão ajuda, mas o
  P-001 continua sendo uma decisão de alteração de sistema em aberto, com o próprio
  processo.
- **Medir consumo por link.** É o módulo Pulse.
- **Preencher o AC-004 que falta.** Ver decisão 5: fica um buraco declarado.
- **Padrão por processo do sistema.** Decisão 1 fechou: o padrão pega a máquina inteira.

## Dependências

**Bloqueado por F1 e F5**, e mais do que a fatia anterior estava:

- **F1** — se uma rota mais específica não muda o endereço de origem escolhido, nem o
  padrão nem as exceções funcionam. O script está com dois defeitos conhecidos e precisa
  ser corrigido antes de rodar de novo (é tier 3).
- **F5** — "um `/1` realmente vence um `/0` de métrica menor?" é agora uma pergunta de
  primeira linha, não uma confirmação tardia do D-002. Se um `/1` não vencer, o mecanismo
  proposto cai inteiro.

Nenhuma linha de implementação deve ser escrita antes de F1 e F5 responderem.

## Decisões

Perguntadas e respondidas em 2026-08-30, não inferidas.

**1 · O padrão vale para a máquina inteira.** Windows Update, NTP e telemetria também
saem pelo link escolhido. É o que "padrão" significa, e é como uma VPN se comporta. O
mecanismo `/1` fica como proposto: duas rotas por família e mais nada.

**2 · Não existe "voltar ao caminho do Windows" como opção de regra.** Toda regra nomeia
um link explicitamente. Com um padrão declarado, o caminho do Windows deixou de ser uma
escolha significativa. **Consequência boa e deliberada:** a tabela de sockets continua
sendo uma fatia independente, e não vira dependência dura desta.

**3 · Convive com VPN, e avisa em vez de disputar em silêncio.** Split-tunnel usa prefixos
mais específicos que `/1` — o Tailscale desta máquina roteia `100.64.0.0/10`, que vence um
`/1` por *longest prefix match*, então não há nada a fazer no caso normal. Se uma VPN subir
como *exit node* (anunciando `/0` ou `/1`), o NetLane detecta o empate e avisa. Tirar
tráfego de dentro de um túnel sem o usuário perceber é literalmente o "errado e silencioso"
que a constituição chama de pior resultado.

**4 · O padrão é lembrado e reaplicado quando o serviço sobe.** Isso muda a natureza do
produto: o NetLane passa a criar rotas no boot, antes de o usuário abrir qualquer coisa. É
o AC-013 que impede isso de ser invisível — o ícone da bandeja tem que declarar que o
Windows não está mais decidindo. As rotas continuam voláteis (Artigo 3).

**5 · O AC-004 continua um buraco declarado, e não é preenchido por dedução.** Os
AC-009…AC-014 são critérios **novos**; afirmar que eles são o que o critério 4 dizia seria
inventar história que ninguém pode conferir. Ele fica aberto em
`000-criterios-de-aceitacao` até o usuário lembrar ou decidir descartá-lo.
