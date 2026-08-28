# NetLane

Utilitário de Windows que decide **por qual link de rede cada processo sai**, criando
rotas de host (`/32`, `/128`) pela IP Helper API — sem nunca tocar no processo. Roda na
máquina do usuário final, com elevação, e mexe na tabela de rotas dele. Quebrar isso não
mostra um erro na tela: tira o acesso à internet dele, ou queima franquia móvel em
silêncio.

**O que o projeto é e seus não-negociáveis: [`docs/constituicao.md`](docs/constituicao.md).**
Leia antes de propor qualquer coisa estrutural — é o padrão contra o qual um pedido é pesado.

**Por que cada decisão técnica é como é: [`docs/decisoes.md`](docs/decisoes.md)** (D-001…D-011).
Não reproponha nada que já esteja lá sem ler o motivo primeiro.

## Decisões deliberadas

Escolhas que parecem descuido e não são. Cada uma já foi discutida e medida.

- **Rotas de host `/32`/`/128`, não manipulação de métrica** (D-002) — um `/32` vence um
  `/0` por *longest prefix match*, independentemente de métrica. Isso sobrevive a uma VPN
  subindo com métrica menor que todas (o Tailscale aqui está em métrica 5). **Não trocar
  por mexer em métrica.**
- **`InterfaceGuid` como identidade de link, nunca `ifIndex` nem MAC** (D-003) — `ifIndex`
  muda quando o adaptador USB reconecta; dois adaptadores desta máquina têm MAC
  randomizado pelo driver. `ifIndex`/LUID são resolvidos a cada operação, nunca cacheados.
- **IP Helper API, nunca `route.exe`** (D-004) — erro estruturado em vez de parse de texto
  em pt-BR, controle sobre `Origin`/`Protocol` como marcador de propriedade da rota, e
  ~20 ms de criação de processo evitados por rota.
- **Dual-family desde o dia 1** (D-005) — IPv6 é preferido sobre IPv4 (RFC 6724). Um motor
  só-IPv4 deixaria vazar todo destino com registro AAAA. **Nunca escreva um caminho que
  assuma IPv4.**
- **A regra casa o jogo, não o launcher** (D-006) — a árvore de processos serve para
  *descobrir* o jogo nascido sob o Steam, não para redirecionar o Steam. `inheritToChildren`
  é opt-in por regra. Redirecionar o launcher manda dezenas de GB de update pelo link errado.
- **WPF + WPF-UI, tray com `NotifyIcon` do WinForms** (D-008) — WebView2 custa 80–150 MB de
  RSS parado e o requisito diz que a UI aberta não pode ser a razão do consumo subir.
  `H.NotifyIcon.Wpf` já foi testado e descartado (resolve para assets `.NETFramework`, `NU1701`).
- **Consolas como face de dados** (D-009) — Cascadia Mono não está instalada nesta máquina
  e não vem em Windows limpo. Uma face que às vezes não existe vira serifa num campo de IP.
- **Link sem gateway nunca recebe rota** (D-011) — `LinkState` distingue `Ready`,
  `NoGateway`, `Down`, `LocalOnly`. Link sem saída é estado de primeira classe, não erro.

## Diga antes de obedecer

Levante *antes* de fazer o trabalho quando qualquer uma for verdade:

1. Contraria um artigo da constituição.
2. Contraria uma decisão deliberada acima, ou uma ADR de `decisoes.md`.
3. Muda comportamento do motor de rotas sem spec.
4. **A premissa parece falsa** — o código não faz o que o pedido assume. Nomeie o arquivo
   que mostra isso.
5. Existe caminho materialmente mais barato para o mesmo resultado declarado.
6. Excede o escopo da spec ativa, ou contraria o *Fora de escopo* dela.
7. É alteração permanente de sistema, P/Invoke novo, ou mexe em elevação — e não há
   reversão escrita.

Três frases, e então obedeça:

```
1. O conflito, nomeando com o que ele conflita.
2. A alternativa, e o que ela custa.
3. "Confirma e eu faço do seu jeito."
```

Confirmado, **faça inteiro** — e registre a exceção no log de decisões da spec, ou como
emenda à constituição se for permanente. Registrar é o que impede a mesma discussão de
acontecer todo mês.

## Stack

| Camada | Escolha |
| --- | --- |
| Runtime | .NET 8 (`net8.0-windows10.0.19041.0`), x64. SDK fixado em `global.json` |
| UI | WPF + WPF-UI. Tray por `System.Windows.Forms.NotifyIcon` |
| Interop | P/Invoke para `iphlpapi.dll`, **só** em `src/NetLane.Windows/` |
| Testes | xUnit |
| Scripts | PowerShell 7 (`pwsh`) para o que toca o SO; Node para os gates do harness |

## Comandos

```powershell
pwsh -File scripts/verify.ps1            # restore + format + build + testes + gates. A régua.
pwsh -File scripts/verify.ps1 -Rapido    # pula restore/format, para o laço de edição
dotnet test NetLane.sln -c Release       # só os testes
pwsh -File scripts/capture-baseline.ps1 -IncludeProbes   # regenera docs/baseline-ambiente.md
```

`verify.ps1` é o mesmo arquivo que o CI roda. Se passa aqui e reprova lá, é bug do script,
não do ambiente.

## Estrutura

Guia de onde as coisas vão — não um despejo da árvore.

```
src/NetLane.Abstractions/   contratos puros. Zero P/Invoke, zero referência a Windows.
src/NetLane.Core/           lógica de decisão. Testável sem o SO. Nada de I/O de sistema.
src/NetLane.Windows/        TODO o P/Invoke, e só aqui. Um [DllImport] fora daqui reprova o build.
src/NetLane.App/            UI WPF. Sem regra de negócio: chama o Core.
tests/NetLane.Architecture.Tests/   lê src/ como texto e prova os artigos da constituição.
docs/                       constituição, ADRs, plano, design, alterações de sistema.
scripts/                    ferramentas de operação e os gates do harness.
scripts/field-tests/        F1..F5. Tocam a tabela de rotas de verdade — leia a skill antes.
```

A regra de dependência é `Abstractions ← Core ← Módulos`. `Windows` implementa
`Abstractions` e ninguém depende dele em tempo de compilação exceto a composition root.
É isso que torna a decisão de rota testável num runner de CI sem placa de rede.

## Convenções que o CI reprova

- **Nenhum `[DllImport]`/`[LibraryImport]` fora de `src/NetLane.Windows/`** — senão o núcleo
  deixa de ser puro e o teste de decisão de rota passa a exigir a máquina real.
- **Nenhum endereço IP ou `ifIndex` literal em `src/`** — tudo vem da tabela de interfaces
  em runtime. Literal legítimo entra na lista de permitidos do teste, com o motivo.
- **Nenhuma API de injeção/leitura de processo** — `WriteProcessMemory`, `CreateRemoteThread`
  e companhia reprovam o build. Ban de anticheat não tem reversão.
- **Nenhum `netsh` nem `route.exe`** — alteração de sistema passa pela API e pelo registro
  do Artigo 2.
- **Língua**: português no código, nos identificadores de domínio, nos comentários, nas
  mensagens de commit e no texto de interface. Nomes de API do Windows ficam como são.
- **Mensagem de commit**: linha de assunto em português, imperativo ou substantivo, sem
  prefixo de conventional commit. A versão vem da tag, não da mensagem.

## Fluxo

```
tier 0  →  faça
tier 1  →  branch → implementa → verify → commit → PR
tier 2  →  /spec → /plan → branch → /implement → verify → commit → PR
tier 3  →  /spec → /plan → HUMANO APROVA → /implement → … → PR → o humano faz o merge
```

O tier sai dos caminhos que a mudança toca, em `.architect.json`. Um agente pode **subir**
o próprio tier; nunca baixar. Tier 3 aqui é: `src/NetLane.Windows/**` (P/Invoke),
`scripts/field-tests/**`, `.github/workflows/**` e `docs/constituicao.md`.

1. **Toda mudança de comportamento precisa de teste.** Bug corrigido sem teste de regressão
   volta.
2. **`verify.ps1` tem que passar** antes de a tarefa ser considerada pronta.
3. **Toda alteração permanente de sistema é escrita antes**, com o comando de reversão, em
   [`docs/alteracoes-sistema.md`](docs/alteracoes-sistema.md), e só sai com aprovação
   explícita do usuário.
4. **O agente commita e abre o PR; o humano faz o merge.** Nunca commitar direto em `main`.

## O que não carregar em contexto

`docs/baseline-ambiente.md` tem ~40 KB de saída bruta de comando e **não é versionado** —
é o estado desta máquina, não do produto. Regenere com `capture-baseline.ps1` e consulte
com `grep`, nunca lendo inteiro.

## Skills

| Skill | Use quando |
| --- | --- |
| `write-spec` (`/spec`) | acordar o que uma mudança de tier ≥ 2 precisa fazer |
| `plan-implementation` (`/plan`) | virar spec acordada em abordagem e tarefas |
| `implement-spec` (`/implement`) | executar um plano aprovado |
| [`desenvolver-fatia`](.claude/skills/desenvolver-fatia/SKILL.md) | implementar uma fatia do plano §7 |
| [`corrigir-bug`](.claude/skills/corrigir-bug/SKILL.md) | algo está quebrado |
| [`teste-de-campo`](.claude/skills/teste-de-campo/SKILL.md) | rodar F1..F5 — mexe na tabela de rotas real |
| [`alteracao-de-sistema`](.claude/skills/alteracao-de-sistema/SKILL.md) | propor mudança permanente no Windows |
| [`abrir-pull-request`](.claude/skills/abrir-pull-request/SKILL.md) | pronto para submeter |
