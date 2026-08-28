---
id: 000
status: draft
owns: []
---

# Critérios de aceitação do NetLane

> **Status `draft` de propósito, e isso é o achado que este documento existe para consertar.**
>
> `docs/plano-tecnico.md` cita "critério de aceitação 1", "critério 5", "critério 6",
> "critério 7" e "critério 8" em seis lugares — a coluna **Prova** da tabela de execução
> §7 é inteiramente construída sobre eles. **Eles não existiam em lugar nenhum do
> repositório.** Viviam numa conversa.
>
> Um plano cuja definição de pronto está fora do repositório não tem definição de pronto:
> no dia em que aquela conversa sumir, "atende o critério 8 (< 2 s)" vira uma frase
> infalsificável.
>
> O que está abaixo é **reconstruído a partir das citações**, não copiado do original.
> Cada linha diz de onde veio e o quanto disso é dedução. Enquanto o status for `draft`,
> `trace-check` ignora estes ids — nenhum gate cobra teste para um critério que ainda não
> foi confirmado.
>
> **Confirme ou corrija, e mude o status para `ready`.** A partir daí cada id passa a
> exigir um teste que o cite pelo nome, e a coluna Prova de §7 volta a significar algo.

## Critérios

### AC-001 · O tráfego do processo alvo sai pelo link escolhido

Dado um processo casado por uma regra, quando ele abrir uma conexão, o pacote deve sair
pelo link que a regra escolheu — verificável pelo endereço de origem da conexão.

*Procedência:* deduzido. `plano-tecnico.md:192` diz que a *dead gateway detection* "vai
poluir os critérios de aceitação 1 e 2", num parágrafo sobre o redirecionamento se desfazer.
Isso posiciona 1 e 2 como os critérios do redirecionamento em si, mas o texto exato é
suposição. **Confirmar.**

### AC-002 · O redirecionamento se mantém enquanto o processo viver

O tráfego não volta ao link padrão sozinho durante a vida do processo. Se voltar por causa
do sistema (F2), isso é resultado de medição e precisa estar registrado — não é um critério
silenciosamente afrouxado.

*Procedência:* deduzido, mesma fonte que AC-001. **Confirmar.**

### AC-003 · Ao encerrar, a tabela de rotas volta ao baseline

Fechado o processo alvo, toda rota criada para ele é removida, e a tabela volta a ser
exatamente a de `docs/baseline-ambiente.md`.

*Procedência:* citado literalmente em `plano-tecnico.md:225` — "critério 3 (volta ao
baseline)". Alta confiança.

### AC-004 · *(ausente)*

Nenhuma citação de "critério 4" existe no repositório. Não há do que deduzir, e inventar um
critério seria pior que deixar o buraco visível. **Preencher.**

### AC-005 · Rota órfã de um encerramento anormal é detectada e removida

Se o processo dono morrer entre criar a rota e registrá-la, ou se o serviço cair, a
inicialização seguinte encontra a rota órfã e a remove. Duas camadas de identificação:
o ledger write-ahead e o marcador de `Protocol` na própria rota.

*Procedência:* citado em `plano-tecnico.md:169` — "Atende o critério 5", no parágrafo da
reconciliação por ledger. Alta confiança. Ver D-007.

### AC-006 · Jogo iniciado por um launcher é pego

Um jogo que nasce como processo filho do Steam (ou equivalente) é detectado e redirecionado.
O launcher **não** é redirecionado: a árvore de processos serve para descobrir o filho, e
`inheritToChildren` é opt-in por regra (D-006).

*Procedência:* citado em `plano-tecnico.md:223` — "critério 6 (jogo via Steam)". Alta
confiança.

### AC-007 · O instalador instala e desinstala limpo

Depois de desinstalar, não sobra serviço, rota, arquivo em `%ProgramData%` nem entrada de
registro. A máquina volta ao estado anterior à instalação.

*Procedência:* citado em `plano-tecnico.md:227` — "critério 7", na fatia do instalador. Alta
confiança.

### AC-008 · A interface reflete o estado em menos de 2 s

Uma mudança de estado (rota criada ou removida, processo entrou ou saiu, link mudou de
estado) aparece na interface em menos de 2 s. Por push via JSON-RPC, não por polling.

*Procedência:* citado duas vezes com o número — `plano-tecnico.md:146` e `:222`, "critério 8
(< 2 s)". Alta confiança.

## Fora de escopo

Isto é a lista de critérios do produto, não de uma mudança. Ela não descreve *como* nada é
feito — isso é `plano-tecnico.md` — nem *por que* as decisões técnicas são as que são —
isso é `decisoes.md`.

## Perguntas em aberto

1. **AC-001 e AC-002 estão com o texto certo?** A dedução veio de uma única frase.
2. **O que era o critério 4?** Não há citação nenhuma dele.
3. **AC-002 tem tolerância?** Se a *dead gateway detection* do Windows desfizer o
   redirecionamento (F2), o critério é "nunca volta" ou "volta e o NetLane restabelece em
   N segundos"? A resposta muda a arquitetura, não só o teste.
4. **AC-008 mede da mudança até o pixel, ou até a notificação chegar ao cliente?** Muda o
   que o teste instrumenta.
