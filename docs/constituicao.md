# Constituição — NetLane

O que este projeto é, e o que ele não faz nem que seja conveniente.
Muda raramente. Toda mudança é uma emenda datada no fim do arquivo.

Decisões técnicas ficam em [decisoes.md](decisoes.md). Isto aqui é o padrão contra
o qual uma decisão nova é pesada.

## Intenção

O NetLane escolhe por qual link de rede cada processo sai, **sem tocar no processo**.
Existe para quem tem mais de um caminho para a internet e precisa que o jogo use um
e o resto use outro — sem virar administrador de rede para isso.

## Sucesso e fracasso

- **Funcionando bem é:** um jogo iniciado por um launcher passa a sair pelo link
  escolhido em menos de 2 s, e ao fechar o jogo a tabela de rotas volta a ser
  exatamente a do baseline.
- **O pior resultado é:** o NetLane sair de cena deixando a máquina alterada sem
  que ninguém perceba — uma rota órfã que o usuário vai depurar por horas achando
  que é o provedor, ou tráfego caro saindo em silêncio pelo link com franquia.
  **Errado e silencioso é pior que quebrado e visível.** Um ban de anticheat é o
  único dano sem volta, e é por isso que o Artigo 1 é o primeiro.
- **Raio de alcance de uma versão ruim:** a configuração de rede da máquina do
  usuário, com elevação. Não há dados de terceiros em jogo; há o acesso à internet
  dele, a franquia dele e, no limite, a conta de jogo dele.

## Artigos

Não-negociáveis. Uma exceção exige registro no log de exceções do plano; uma
mudança permanente exige emenda abaixo.

1. **Nunca tocar no processo.** Zero injeção de DLL, zero hook de Winsock, zero
   leitura ou escrita de memória de outro processo — sem exceção, nem para
   diagnóstico. Violar isto não dá erro de compilação: dá ban de conta em
   EasyAntiCheat, BattlEye, Vanguard ou EA AntiCheat, e ban não tem reversão.
   Rotas de host resolvem o problema sem chegar perto do processo.
2. **Toda alteração de sistema é escrita antes de ser aplicada, com o comando
   exato de reversão**, em [alteracoes-sistema.md](alteracoes-sistema.md), e só
   com aprovação explícita do usuário. Sem isso não existe caminho de volta ao
   baseline, e o produto vira um script que mexeu na máquina sem dar recibo.
3. **Nada do que o NetLane cria sobrevive a um reboot.** Rotas em `ActiveStore`,
   nunca `-p`. Nenhuma mudança de métrica, de binding de adaptador ou de política
   de prefixo escapa do Artigo 2. O reboot é a última rede de segurança do
   usuário; se algo persistir, ela deixa de existir.
4. **Nenhum valor desta máquina entra no código.** Sem `ifIndex`, IP, gateway,
   sub-rede ou nome de jogo literal — tudo por descoberta em runtime, `N` links
   incluindo 0 e 1, dual-family em toda a pilha. É o que separa um produto de um
   script de configuração pessoal, e um `ifIndex` literal funciona hoje e quebra
   no próximo reconectar do tethering.
5. **Incerteza vira teste de campo, não suposição.** Premissa não medida não
   entra em decisão de arquitetura: vira um F-teste em `scripts/field-tests/`
   com resultado anexado a [decisoes.md](decisoes.md). Construir sobre uma
   premissa não verificada custa a reescrita inteira quando ela cai — e F1, a
   premissa central das rotas de host, ainda está aberta.
6. **Simplicidade.** Nenhuma dependência de terceiros para o que o runtime já
   entrega, nenhuma camada de abstração nova sem justificativa escrita no plano.
   `H.NotifyIcon.Wpf` já foi testado e descartado exatamente por isso. Um
   mantenedor, sem orçamento de manutenção: cada dependência é uma dívida que
   alguém paga sozinho.

## Restrições permanentes

- Alvo: Windows 11 x64, `net8.0-windows10.0.19041.0`. Multiplataforma está fora
  de escopo e não é um objetivo adiado.
- Zero telemetria e zero chamada externa. A única saída de rede do produto é o
  teste de conectividade que o usuário dispara.
- Língua do projeto: português. Código, identificadores e mensagens de commit
  seguem o que já existe no repositório.
- `docs/baseline-ambiente.md` é estado desta máquina, não do produto: gerado
  localmente, nunca versionado.

## Emendas

| Data | Artigo | Mudança | Quem |
| ---- | ------ | ------- | ---- |
| 2026-08-27 | — | Ratificada | gabrielmmf |
