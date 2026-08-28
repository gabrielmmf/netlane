# Testes de campo

As perguntas de `docs/plano-tecnico.md` §6, viradas medição. O Artigo 5 da constituição:
premissa não medida não entra em decisão de arquitetura.

**Leia [`.claude/skills/teste-de-campo`](../../.claude/skills/teste-de-campo/SKILL.md) antes
de rodar qualquer um.** Estes scripts alteram a tabela de rotas real, com elevação, na única
máquina que existe.

## Contenção

Não há tier de staging para uma tabela de rotas. O isolamento aqui é temporal, não espacial:

```
fotografa  →  roda  →  restaura  →  PROVA que restaurou
```

Cada script faz isso por dentro (`route-diff.ps1 -Salvar` no começo, `-Contra` no fim) e
grita se a prova falhar. A rede de segurança final é o reboot: toda rota criada vive em
`ActiveStore` (Artigo 3), então reiniciar devolve a tabela ao estado do boot.

Rodar sem elevação sai com código **2** — "não pôde rodar", que é diferente de um resultado.
Falhar no meio da criação da rota é o cenário que deixa órfã; por isso a checagem vem antes
de tudo.

## Estado

| id | Pergunta | Script | Estado |
| --- | --- | --- | --- |
| **F1** | Rota `/32` via gateway B faz o Windows escolher o endereço de origem de B? | `F1-origem-por-rota-host.ps1` | **pronto, aguardando execução elevada** |
| F2 | *Dead gateway detection* desfaz o redirecionamento? | — | não escrito |
| F3 | Latência de detecção de processo: WMI vs ETW | — | não escrito |
| F4 | O link de jogos é melhor **sob carga**? | — | não escrito |
| F5 | `/32` vence uma default de métrica menor? | — | não escrito |

**F1 é bloqueante.** Enquanto ele não tiver resposta, nenhum motor de rotas deve ser escrito:
se a resposta for *não*, D-002 cai e a arquitetura inteira volta para a prancheta. Rodar:

```powershell
# numa janela do PowerShell ELEVADA
pwsh -File scripts/field-tests/F1-origem-por-rota-host.ps1 -LinkAlvo 'Ethernet 2'
```

O script não escolhe o link B por você. Qual link é o de jogos é uma decisão, não uma dedução.

## O que falta escrever, e o que cada um precisa

- **F2** — precisa induzir falha no gateway com uma conexão viva pela rota `/32`. O jeito
  não-destrutivo é derrubar o link B (desconectar o tethering) e observar a migração. Cuidado:
  isso muda a tabela por causas externas ao script, então a prova de reversão vai acusar — o
  snapshot precisa ser tirado *depois* de o link voltar.
- **F3** — não precisa de elevação nem mexe em rota. É o mais barato dos cinco e pode ser
  escrito a qualquer momento: cronometrar `Win32_ProcessStartTrace` e o ETW
  `Microsoft-Windows-Kernel-Process` contra o mesmo processo-alvo, e contar sockets abertos
  na janela cega.
- **F4** — depende de você iniciar um download que sature o link padrão. Não sature a rede
  por conta própria.
- **F5** — sobe uma default concorrente de métrica baixa e verifica quem vence. É o mais
  arriscado: uma default extra mal removida derruba a saída da máquina. Só depois de F1, e
  só com o reboot como plano B aceito de antemão.

## Registrar

Resultado medido vai para a tabela **Testes de campo — resultados** no fim de
`docs/decisoes.md`. O script imprime a linha pronta para colar.

Resultado que contradiz uma ADR aceita **não** se conserta em silêncio: a ADR é marcada como
**Revogada**, a substituta é escrita, e isso vai ao usuário.
