<!--
As caixas aqui são os modos de falha reais deste repositório. Uma checklist que
ninguém consegue reprovar ensina a marcar caixa sem ler.
-->

Spec: <!-- docs/specs/NNN-assunto, ou "tier 0/1 — sem spec" -->
Fatia de §7: <!-- 0, a..k, ou "fora das fatias" -->

## O que muda

<!-- Uma ou duas frases, do ponto de vista de quem usa. -->

## Critérios de aceitação

<!-- Apague em tier 0 e 1. Uma linha por critério, com o teste que o prova.
     Linha sem teste o CI acusa — preencha aqui, enquanto ainda é barato notar. -->

| Critério | Provado por |
| --- | --- |
| AC-00N | `tests/.../Arquivo.cs::AC_00N_...` |

## Fora de escopo

<!-- O que um revisor esperaria e não vai encontrar. -->

## Como validar

<!-- Passos na máquina, ou "coberto pelos testes X e Y". -->

## Alteração de sistema

<!-- Escolha uma. Artigo 2 da constituição. -->

- [ ] **Nenhuma.** Este PR não muda configuração permanente do Windows.
- [ ] Muda, e está registrada em `docs/alteracoes-sistema.md` com o comando exato de
      reversão, aprovada por: <!-- onde -->

<!--
Rota persistente (`-p`, `PersistentStore`) não passa, nem com aprovação: o reboot
é a última rede de segurança do usuário. Desligar anticheat também não.
-->

## Testes de campo

- [ ] Este PR não depende de nenhum F-teste pendente.
- [ ] Depende de: <!-- F1..F5 --> — e o resultado está em `docs/decisoes.md`.
- [ ] Mexi na tabela de rotas real durante o desenvolvimento, e provei que ela voltou
      (`pwsh -File scripts/route-diff.ps1 -Contra antes`).

<!-- F1 pendente com um motor de rotas no PR é informação que o revisor precisa
     ver ANTES de ler o código: se F1 der não, D-002 cai e o motor volta à prancheta. -->

## Checklist

- [ ] `pwsh -File scripts/verify.ps1` passa localmente
- [ ] Comportamento novo ou mudado tem teste; bug corrigido tem teste de regressão
- [ ] Nenhum valor desta máquina entrou no diff — IP, `ifIndex`, nome de adaptador,
      SSID, caminho com meu usuário (inclusive em comentário e nome de teste)
- [ ] `docs/baseline-ambiente.md` não aparece no diff
- [ ] Nenhum `[DllImport]` fora de `src/NetLane.Windows/`
- [ ] Se contrariei um artigo da constituição, a exceção está registrada no plano
- [ ] Se produzi uma decisão nova, ela virou ADR em `docs/decisoes.md`
