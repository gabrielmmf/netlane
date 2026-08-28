---
name: abrir-pull-request
description: Checagens antes de submeter, corpo do PR e acompanhamento do CI até fechar verde. Use quando o usuário disser "abre o PR", "manda", "sobe isso", "pronto para revisar", ou ao terminar uma fatia.
---

# Abrir um pull request

O agente abre o PR. **O merge é do humano** — em `main` não se commita direto.

## 1. Antes de abrir

```powershell
pwsh -File scripts/verify.ps1
```

Tem que passar inteiro. Abrir PR com verify vermelho gasta uma rodada de CI para descobrir
o que já dava para saber em 15 segundos.

Confira também:

- `git diff main --stat` — o diff é só a fatia? Arquivo que entrou "de passagem" sai daqui.
- Nenhum valor desta máquina no diff. O teste de arquitetura pega IP e `ifIndex` literal;
  ele não pega um nome de adaptador em comentário ou um caminho com seu usuário.
- `docs/baseline-ambiente.md` não pode aparecer no diff. Ele é ignorado; se apareceu,
  alguém forçou o `git add` e o repositório é público.
- Se a fatia mexeu na tabela de rotas real durante o desenvolvimento, a máquina voltou:
  `pwsh -File scripts/route-diff.ps1 -Contra antes`.

## 2. O corpo do PR

O template já pede o essencial. O que costuma sair errado:

- **O que isto prova** — a coluna "Prova" da fatia em §7. Não "implementei X", e sim qual
  critério de aceitação ficou demonstrado e por qual teste.
- **Alteração de sistema** — marque a caixa com honestidade. Se marcou sim, o link para a
  entrada em `docs/alteracoes-sistema.md` é obrigatório.
- **F-teste afetado** — se o PR muda o que um F-teste mediria, ou se depende de um resultado
  ainda pendente, diga qual. F1 pendente com um motor de rotas no PR é informação que o
  revisor precisa ver antes de ler o código.

```bash
gh pr create --base main --fill
```

## 3. Acompanhe até verde

```bash
gh pr checks --watch
```

Não largue o PR vermelho. Se o CI reprovar e o verify local passar, o bug é ambiental e vale
mais que a fatia — o pipeline existe para ser confiável, e um pipeline em que ninguém confia
vira um pipeline que todo mundo contorna.

Se reprovar por algo que o verify local não pega, **acrescente a checagem ao verify** junto
com a correção. Senão o próximo PR repete.

## 4. Depois do merge

O humano faz o merge, em squash. Depois:

```bash
git checkout main && git pull && git branch -d feat/...
```

Se a fatia fecha um item de §7, marque na tabela. Se produziu uma decisão nova, ela vira uma
ADR em `docs/decisoes.md` — decisão que só existe na descrição do PR está perdida no dia em
que alguém perguntar "por que assim?".
