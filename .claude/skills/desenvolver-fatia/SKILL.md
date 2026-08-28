---
name: desenvolver-fatia
description: O laço principal de desenvolvimento do NetLane — escopo, branch, código no projeto certo, teste, verify, commit, PR. Use quando o usuário disser "implementa", "adiciona", "faz a fatia", "muda o comportamento de", ou ao começar qualquer item da ordem de execução de docs/plano-tecnico.md §7.
---

# Desenvolver uma fatia

O trabalho aqui é organizado nas fatias de `docs/plano-tecnico.md` §7 (0, a…k). Cada fatia
vira um branch e um PR. Uma fatia termina quando a prova da coluna "Prova" existe — não
quando o código compila.

## 1. Antes de escrever código

- Leia a linha da fatia em §7: o que ela entrega e **o que a prova**.
- Se a mudança toca `src/NetLane.Windows/**`, `scripts/field-tests/**`,
  `.github/workflows/**` ou `docs/constituicao.md`, é **tier 3**: precisa de `/spec` e
  `/plan` aprovados pelo usuário antes de qualquer linha.
- Se depende de uma premissa não medida, ela vira F-teste primeiro (Artigo 5). Não construa
  em cima de "deve funcionar".

```bash
git checkout main && git pull
git checkout -b feat/a-interop-de-rotas    # feat/<letra-da-fatia>-<assunto>
```

## 2. Onde o código vai

A regra de dependência é `Abstractions ← Core ← Módulos`, e ela é o que torna a decisão de
rota testável sem placa de rede.

| O que você está escrevendo | Onde |
| --- | --- |
| Um contrato, um enum de domínio, um value object | `src/NetLane.Abstractions/` |
| Decisão: qual link, qual rota, o que reconciliar | `src/NetLane.Core/` |
| Qualquer `[DllImport]`, struct de interop, handle | `src/NetLane.Windows/` |
| Tela, ViewModel, conversor, estilo | `src/NetLane.App/` |

**Erros que o build reprova**, e o motivo:

- `[DllImport]` fora de `NetLane.Windows` — o núcleo deixa de ser puro e o teste de decisão
  de rota passa a exigir a máquina real.
- IP ou `ifIndex` literal em `src/` — funciona hoje, quebra no próximo reconectar do
  tethering (D-003).
- `WriteProcessMemory` e parentes — Artigo 1, ban de anticheat.
- `netsh` ou `route.exe` — Artigo 3 / D-004.

## 3. Teste junto, não depois

- Decisão de rota, reconciliação, herança seletiva → `NetLane.Core.Tests`, sem tocar no SO.
- Interop de verdade → `NetLane.Windows.IntegrationTests`, marcado `[Trait("Field", "true")]`
  para não rodar no CI, que não tem placa de rede nem elevação.
- Um artigo da constituição que dê para provar lendo o código → um `[Fact]` em
  `NetLane.Architecture.Tests`.

Todo critério de aceitação precisa de um teste que **cite o id dele** — o gate de
rastreabilidade reprova o PR sem isso.

## 4. Verifique

```powershell
pwsh -File scripts/verify.ps1
```

É o mesmo arquivo que o CI roda. Se passa aqui e reprova lá, o bug é do script.

**Não reporte trabalho como pronto sem ter rodado isto e visto passar.** "Deve estar
funcionando" não é um estado.

## 5. Commit e PR

Uma fatia, um commit — o merge é squash, então o histórico de `main` fica com uma linha por
fatia e o revert é trivial.

Assunto em português, sem prefixo de conventional commit. O corpo diz **por que**, não o
quê: o diff já mostra o quê.

```
Interop de rotas pela IP Helper API

route.exe responderia em pt-BR nesta máquina e custaria ~20 ms de criação de
processo por rota — uma sessão de jogo cria dezenas. CreateIpForwardEntry2 dá
erro estruturado e deixa marcar Protocol como sinal de propriedade da rota.

F5 continua pendente: se um /32 não vencer uma default de métrica menor, D-002
cai junto e este motor volta para a prancheta.
```

Depois: skill [`abrir-pull-request`](../abrir-pull-request/SKILL.md).

## Quando parar e perguntar

- A fatia exigiria alteração permanente de sistema → skill
  [`alteracao-de-sistema`](../alteracao-de-sistema/SKILL.md).
- O resultado de um F-teste contradiz uma ADR aceita → pare, não conserte a ADR sozinho.
- O pedido exigiria tocar num processo para funcionar → pare. Não existe versão aceitável
  disso; traga o conflito com o Artigo 1.
