---
name: corrigir-bug
description: Reproduzir, escrever o teste de regressão que falha, corrigir, verificar. Use quando o usuário disser "está quebrado", "não funciona", "deu erro", "a rota não subiu", "voltou pelo link errado", ou relatar qualquer comportamento diferente do esperado.
---

# Corrigir um bug

A ordem importa. Corrigir antes de reproduzir produz uma correção que talvez conserte outra
coisa, e ninguém descobre até o bug voltar.

## 1. Reproduza antes de tocar no código

Escreva os passos exatos e o que você observou — não o que você concluiu. "A rota não é
criada" é uma conclusão; "`CreateIpForwardEntry2` devolveu `ERROR_INVALID_PARAMETER` com
gateway `fe80::…`" é uma observação, e ela já contém a resposta (falta `ScopeId`, D-005).

Se o bug envolve a tabela de rotas real, capture o estado antes de mexer:

```powershell
pwsh -File scripts/route-diff.ps1 -Salvar antes-do-bug
```

## 2. Escreva o teste que falha

Antes da correção. O teste tem que reprovar pelo motivo certo — rode e leia a mensagem. Um
teste que passa antes da correção não estava testando o bug.

Onde ele vai:

- Decisão errada (link errado, regra que não casou, órfã não reconciliada) →
  `NetLane.Core.Tests`. Se o bug é de decisão, ele **tem** que ser reproduzível sem o SO;
  se você não conseguir, a lógica vazou para `NetLane.Windows` e isso é o bug de verdade.
- Interop → `NetLane.Windows.IntegrationTests`, com `[Trait("Field", "true")]`.
- Violação de artigo que passou batido → `NetLane.Architecture.Tests`, e aí o gate estava
  fraco: aperte o padrão junto com a correção.

## 3. Corrija a causa

Se a correção for um `if` que trata o sintoma, você achou o sintoma. Casos frequentes neste
projeto, com a causa real:

- Rota some sozinha → provavelmente *dead gateway detection* (F2), não bug de código.
- Funciona em IPv4 e falha em IPv6 → quase sempre `ScopeId` faltando no gateway link-local.
- Funciona e para de funcionar após reconectar o adaptador → `ifIndex` cacheado. D-003 diz
  para resolver a cada operação; alguém guardou.
- Rota criada e tráfego continua saindo pelo link errado → a premissa do F1 pode estar
  errada. Isso não é bug, é a arquitetura. Escale.

## 4. Verifique

```powershell
pwsh -File scripts/verify.ps1
```

E, se mexeu na tabela real:

```powershell
pwsh -File scripts/route-diff.ps1 -Contra antes-do-bug
```

## 5. Se custou tempo, deixe a trave

Um bug que consumiu horas e volta em três meses custa as horas de novo. Use a skill
`record-learning` (`/learn`) para transformar o aprendizado no degrau certo — de nota até
checagem automática. Se dava para o CI ter pego, o degrau certo é uma checagem, não um
parágrafo.
