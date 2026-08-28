---
name: alteracao-de-sistema
description: Procedimento obrigatório antes de qualquer mudança permanente na configuração do Windows — política de prefixo, binding de adaptador, métrica, serviço, firewall, registro. Use quando o usuário disser "desabilita o IPv6", "muda a métrica", "ajusta a prioridade", "instala o serviço", ou quando uma solução exigir mexer na máquina em vez de no produto.
---

# Propor uma alteração de sistema

O Artigo 2 da constituição: **toda alteração permanente é escrita antes de ser aplicada,
com o comando exato de reversão, e só sai com aprovação explícita do usuário.**

Sem isso não existe caminho de volta ao baseline, e o NetLane vira um script que mexeu na
máquina de alguém sem dar recibo. Esta skill é o procedimento, e ele não tem atalho.

## Ordem, sem pular passo

### 1. Pergunte se dá para não fazer

A maioria das alterações de sistema propostas existe porque uma solução dentro do produto
pareceu mais difícil. Escreva as duas e compare. O NetLane cria rotas voláteis exatamente
para não precisar mudar a máquina — se a resposta virou "mude a máquina", provavelmente o
problema foi enquadrado errado.

### 2. Meça a situação, não a suponha

A proposta precisa da medição que a justifica. `P-001` em `docs/alteracoes-sistema.md` é o
modelo: ela não diz "IPv6 pode vazar", diz **8 conexões medidas**, de quais processos, por
qual caminho, inclusive via NAT64. Sem número, a proposta não entra.

### 3. Escreva a proposta ANTES de aplicar

Em `docs/alteracoes-sistema.md`, na seção **Alterações propostas, ainda não aplicadas**,
com id `P-00N`:

- **Situação medida** — o número, e como foi medido.
- **Opções**, cada uma com: o quê, o comando de reversão, e o custo. **Sempre inclua a
  opção "não fazer nada" com o custo dela.** Uma tabela de opções sem essa linha é uma
  recomendação disfarçada de análise.
- O que a alteração **não** resolve. P-001 é honesta assim: rotear IPv6 resolve o tráfego
  dos jogos e não resolve o vazamento no sentido inverso.

### 4. Traga ao usuário e espere

Apresente as opções. **Não escolha por ele.** Se ele não responder, a alteração não
acontece — a ausência de resposta é um "não", nunca um "pode".

### 5. Só então aplique, e mova a linha

Aplicada, a entrada sai de *propostas* e entra na tabela **Alterações aplicadas**, com data,
comando aplicado, comando de reversão e onde foi aprovada. As duas colunas de comando são
literais e copiáveis — não descrições do que o comando faz.

### 6. Confirme que a reversão funciona

Rode o comando de reversão, confirme que a máquina voltou, e reaplique. Um comando de
reversão nunca executado é uma hipótese, e você vai precisar dele exatamente no dia em que
não houver tempo para descobrir que estava errado.

## O que nunca entra, nem com aprovação

- Desligar, pausar ou excluir de varredura qualquer anticheat (`vgk`, EasyAntiCheat,
  BattlEye, EA AntiCheat). Não é negociável e não é assunto de proposta.
- Rota persistente (`-p`, `PersistentStore`). Artigo 3 — o reboot é a última rede de
  segurança do usuário.
- Qualquer coisa que exija desabilitar Secure Boot, driver signing ou o firewall inteiro.

## Reversão total

O procedimento que devolve a máquina ao baseline está no fim de
`docs/alteracoes-sistema.md`. Se você adicionar uma alteração, **acrescente a reversão dela
lá também** — a lista é desfeita de baixo para cima, e uma linha faltando quebra a ordem.
