# Alterações de sistema — NetLane

Toda alteração permanente de configuração do Windows feita por este projeto é registrada aqui,
**antes** de ser aplicada, com o comando exato de reversão.

Nada nesta lista é aplicado sem aprovação explícita do usuário.

---

## Estado atual

**Nenhuma alteração de sistema foi feita.**

O levantamento de ambiente (`scripts/capture-baseline.ps1`) é somente leitura. As sondas ativas
fazem ICMP e um `GET` HTTP por link para descobrir o IP público de cada saída — não alteram nada.

---

## Alterações aplicadas

| Data | O que | Comando aplicado | Comando de reversão | Aprovada em |
|---|---|---|---|---|
| — | — | — | — | — |

---

## Alterações propostas, ainda não aplicadas

### P-001 · Vazamento de IPv6 no tráfego que deveria usar o link padrão

**Situação medida.** Neste ambiente apenas um dos links tem IPv6 global; o outro reporta
`IPv6Connectivity: NoTraffic`. Como IPv6 é preferido sobre IPv4 (RFC 6724), **todo destino com
registro AAAA sai pelo link que tem IPv6**, independentemente de qual seja o link padrão. Não é
previsão: o baseline registra 8 conexões nessa condição, de Chrome, VS Code e Claude, algumas via
NAT64 (`64:ff9b::`).

Rotear IPv6 (D-005) resolve o tráfego **dos jogos**. Não resolve este vazamento no sentido inverso,
porque não há IPv6 no link padrão para onde mandá-lo.

**Opções, nenhuma aplicada:**

| # | O quê | Reversão | Custo |
|---|---|---|---|
| a | Despriorizar IPv6 globalmente via política de prefixo | `netsh interface ipv6 reset prefixpolicy` | afeta a máquina inteira, inclusive o que deveria usar IPv6 |
| b | Desabilitar IPv6 apenas no adaptador com IPv6 global | `Enable-NetAdapterBinding -Name <n> -ComponentID ms_tcpip6` | perde IPv6 nesse link, inclusive para jogos que o usem |
| c | Não fazer nada | — | o vazamento continua |

Decisão pendente. Será trazida na fatia (d), com a medição de quanto tráfego isso representa.

---

## Reversão total

Para devolver a máquina ao estado de `baseline-ambiente.md`:

```powershell
# 1. Parar o NetLane e remover todas as rotas da sessão
netlane flush
Stop-Service NetLane

# 2. Conferir que a tabela de rotas voltou ao baseline
pwsh -File scripts/route-diff.ps1 -Against docs/baseline-ambiente.md

# 3. Desfazer as alterações da tabela acima, de baixo para cima
```

As rotas criadas pelo NetLane são **voláteis** (`ActiveStore`): um reboot já as elimina, mesmo que
o serviço não tenha rodado a limpeza. Nenhuma rota persistente (`-p`) é criada.
