# Changelog

Escrito para quem **usa** o NetLane, não para quem escreveu o código.
"Agora dá para escolher o link por processo" serve; "refatora RouteEngine" não.

A versão vem da tag do git, via MinVer. Marcar `v0.1.0` e empurrar a tag é o que
dispara o release — não existe arquivo de versão para alguém esquecer de atualizar.
Um binário que não veio de uma tag diz isso no próprio número
(`0.2.0-alpha.0.6+9c7b34a`), então "qual versão é essa?" nunca depende de investigação.

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
Versionamento: [SemVer](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Adicionado
- Constituição do projeto, com os seis artigos não-negociáveis e o registro de emendas.
- Base de build: solução, SDK fixado, central package management, e `scripts/verify.ps1`
  como régua única — o mesmo arquivo que o CI roda.
- Testes de arquitetura que provam os artigos 1, 3 e 4 lendo `src/` como texto.
- Loop de especificação com tiering, e os critérios de aceitação AC-001…AC-008
  reconstruídos a partir das citações do plano técnico.
- `scripts/route-diff.ps1`: fotografa a tabela de rotas e prova que ela voltou.
- `scripts/field-tests/F1-origem-por-rota-host.ps1`: a medição bloqueante da arquitetura.
- CI em `windows-latest` chamando a mesma régua no PR e no release.

### Corrigido
- O procedimento de reversão total em `alteracoes-sistema.md` citava
  `scripts/route-diff.ps1`, que não existia. Agora existe, e um gate impede que
  qualquer documento volte a citar script inexistente.

### Segurança
- `docs/baseline-ambiente.md` saiu do controle de versão e do histórico. Continha o IP
  público de cada link, MAC, DNS e a tabela de sockets desta máquina, e o repositório é
  público. É regenerado localmente por `scripts/capture-baseline.ps1`.
