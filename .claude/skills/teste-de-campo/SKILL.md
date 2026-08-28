---
name: teste-de-campo
description: Roda um dos testes de campo F1..F5 do NetLane com contenção — snapshot da tabela de rotas, execução, restauração e diff obrigatório contra o baseline. Use quando o usuário disser "roda o F1", "testa a rota", "mede a latência do watcher", "confirma se o /32 vence", ou quando uma decisão de arquitetura depender de uma premissa ainda não medida.
---

# Rodar um teste de campo

Os F-testes são as únicas coisas neste repositório que **alteram a tabela de rotas real**,
com elevação, na única máquina que existe. Não há tier de staging para uma tabela de rotas.
Tudo aqui existe para que a máquina volte ao estado anterior mesmo se o teste morrer no meio.

`docs/plano-tecnico.md` §6 tem a pergunta de cada F-teste. Este arquivo tem o procedimento.

## Antes de qualquer coisa

1. **F1 é bloqueante.** Se ele ainda estiver *pendente* em `docs/decisoes.md`, nenhum
   F-teste que dependa de rota host tem resultado interpretável, e nenhum motor deve ser
   escrito. Rode F1 primeiro.
2. **Confirme que o baseline é atual.** Se a máquina mudou de link, de VPN ou de adaptador
   desde a última captura, o diff no fim vai acusar diferenças que não são do teste:
   ```powershell
   pwsh -File scripts/capture-baseline.ps1 -IncludeProbes
   ```
3. **Confirme elevação.** Criar rota exige administrador. Um agente sem elevação **não deve
   tentar e falhar** — deve parar e pedir ao usuário que rode o comando numa janela elevada.
   Falhar no meio é o que deixa rota órfã.

## O procedimento

```powershell
# 1. Fotografa a tabela ANTES. Sem isto não existe com o que comparar.
pwsh -File scripts/route-diff.ps1 -Salvar antes

# 2. Roda o teste. Sempre o script, nunca comandos soltos no terminal:
#    o script sabe desfazer o que criou; você, no meio de um erro, não.
pwsh -File scripts/field-tests/F1-origem-por-rota-host.ps1

# 3. Prova que a máquina voltou. Este passo NÃO é opcional e não passa por vista de olhos.
pwsh -File scripts/route-diff.ps1 -Contra antes
```

O passo 3 sai com código 1 se sobrou qualquer rota. **Se ele reprovar, pare tudo e limpe
antes de fazer qualquer outra coisa** — inclusive antes de reportar o resultado do teste.
Uma rota órfã é invisível: o usuário vai depurar por horas achando que é o provedor.

## Se algo der errado no meio

Nesta ordem:

1. `pwsh -File scripts/route-diff.ps1 -Contra antes` para ver exatamente o que sobrou.
2. Remova o que sobrou pelo próprio script, não à mão.
3. Se nem isso funcionar: **reiniciar a máquina resolve.** Toda rota do NetLane vive em
   `ActiveStore` (Artigo 3), então um reboot devolve a tabela ao estado do boot. É a última
   rede de segurança e ela existe de propósito — use sem constrangimento.

## Registrar o resultado

Um F-teste rodado e não registrado é um F-teste que vai ser rodado de novo. Ao terminar:

1. Preencha a linha do F-teste na tabela **Testes de campo — resultados** no fim de
   `docs/decisoes.md`, com o resultado real medido, não com a conclusão esperada.
2. Se o resultado **contraria** uma decisão aceita, não conserte a decisão em silêncio:
   marque a ADR como **Revogada**, escreva a que a substitui, e traga isso ao usuário. D-002
   inteira depende de F5; a arquitetura de rotas host inteira depende de F1.
3. Se o resultado for inconclusivo, escreva *inconclusivo* e o porquê. Um "provavelmente
   sim" registrado como "sim" é pior que um pendente.

## Quando parar e perguntar

- O teste exige alteração permanente de sistema → pare, use a skill
  [`alteracao-de-sistema`](../alteracao-de-sistema/SKILL.md). Nenhum F-teste tem licença
  para mudar configuração da máquina sem passar por lá.
- O teste exigiria desligar anticheat, firewall ou VPN → pare e pergunte. Nunca faça.
- F4 precisa que o link padrão esteja saturado → isso depende do usuário iniciar um
  download. Peça; não tente saturar a rede por conta própria.
