# Especificações

O que uma mudança precisa fazer, acordado **antes** de existir código. Uma pasta por spec,
numerada: `NNN-assunto/`.

| Arquivo | Guarda | Escrito por |
| --- | --- | --- |
| `spec.md` | O QUÊ e POR QUÊ: histórias, critérios de aceitação com id estável, fora de escopo, perguntas em aberto | `/spec` |
| `plan.md` | COMO: abordagem, arquivos tocados, aferição da constituição, riscos, reversão | `/plan` |
| `tasks.md` | tarefas atômicas em ordem, cada uma ligada a um id de critério | `/plan` |
| `notes.md` | diário de decisões, escrito durante a implementação | `/implement` |

## Cerimônia proporcional ao estrago

O tier sai dos **caminhos que a mudança toca**, calculado a partir de `.architect.json` —
nunca da impressão de quem está fazendo. Um agente pode **subir** o próprio tier; nunca baixar.

| Tier | O que é | O que exige |
| --- | --- | --- |
| 0 | typo, comentário, bump de dependência, 1 arquivo, sem mudança de comportamento | nada além do commit |
| 1 | uma mudança de comportamento, fora dos caminhos de tier 3 | plano no corpo do PR, id do critério no nome do teste |
| 2 | capacidade nova, vários arquivos, superfície de teste nova | `spec.md` + `tasks.md` |
| 3 | alto risco (abaixo) | conjunto completo + reversão + **aprovação humana antes de implementar** |

**Tier 3 aqui é**, e o motivo de cada um:

- `src/NetLane.Windows/**` — todo o P/Invoke. Um erro aqui escreve na tabela de rotas do SO.
- `src/NetLane.Service/**` — roda elevado, como SYSTEM.
- `scripts/field-tests/**` — mexem na tabela de rotas real da única máquina que existe.
- `.github/workflows/**` — uma edição de workflow pode exfiltrar segredo.
- `docs/constituicao.md` — mudar o padrão contra o qual tudo é aferido.
- `scripts/verify.ps1` — afrouxar a régua é a forma mais silenciosa de reprovar.

## Ids de critério

`AC-001`, `AC-002`… estáveis para sempre. Um critério aposentado não é renumerado: é
marcado como removido. Renumerar quebra a ligação com todo teste que já citou o id.

O teste que prova um critério **cita o id no nome**:

```csharp
[Fact]
public void AC_003_AoFecharOJogoATabelaDeRotasVoltaAoBaseline() { ... }
```

`scripts/trace-check.mjs` roda nos dois sentidos: critério sem teste é critério não provado;
teste citando id que não existe em spec nenhuma é teste que prova algo que ninguém acordou.

## Status

A palavra-chave em `status:` é em inglês porque os gates casam com ela.

| `status:` | Significa | Os gates olham? |
| --- | --- | --- |
| `draft` | rascunho, ainda não acordado | não |
| `ready` | acordado, ainda não implementado | sim |
| `in-progress` | em implementação | sim |
| `shipped` | entregue | sim |
| arquivada em `arquivo/` | histórica | não |

## Arquivar ao entregar

Spec entregue vai para `docs/specs/arquivo/`, e o que continua verdade é dobrado na
documentação viva. Sem isso a pasta vira quarenta documentos históricos que o próximo agente
lê como descrição do sistema atual — e aí a prática inteira fica negativa.
