# Plano de design — NetLane

Status: **aguardando aprovação**
Toda cor, tamanho e espaçamento do código deriva deste documento. Se algo no XAML não estiver aqui, está errado.

---

## 1. O problema de design, em uma frase

A pergunta que o usuário faz à interface não é *"quanto?"* — é **"por onde?"**.

Isso descarta a forma padrão de dashboard. Um card comunica **valor**; aqui o dado central é **direção**. Se o usuário precisa ler texto para saber por qual link o jogo está saindo, a interface falhou. Ele tem que saber pela **posição**.

---

## 2. Conceito

> **A janela é a bancada de saída: colunas verticais paralelas, uma por link, e cada processo é uma ficha que ocupa fisicamente a coluna por onde seu tráfego sai.**

O módulo se chama *Lanes*. A interface é literalmente raias. Redirecionar um processo é vê-lo **mudar de coluna**.

### Wireframe — Início (tela que abre)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  NetLane        Início · Lanes · Adaptadores · Atividade              ⚙       │ 48
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ ┃                                    │ ┃                                     │
│ ┃  PADRÃO                            │ ┃  JOGOS                              │
│ ┃  Wi-Fi de casa                     │ ┃  Celular                            │
│ ┃                                    │ ┃                                     │
│ ┃   13 ms          2,9 jitter        │ ┃   26 ms          7,2 jitter         │ 34
│ ┃                                    │ ┃                                     │
│ ┃  ────────────────────────────      │ ┃  ─────────────────────────────      │
│ ┃                                    │ ┃                                     │
│ ┃   chrome                    41     │ ┃   VALORANT        12 rotas   4 min  │
│ ┃   steam                      6     │ ┃   Riot Client      3 rotas   4 min  │
│ ┃   Code                       4     │ ┃                                     │
│ ┃                                    │ ┃                                     │
│ ┃                                    │ ┃                                     │
│ ┃                                    │ ┃                                     │
└──────────────────────────────────────────────────────────────────────────────┘
    ▲                                     ▲
    └── raia, 3px, cor do link            └── raia, 3px, cor do link
```

Sem gateway o cabeçalho da coluna troca a métrica por uma instrução (seção 7), e a raia fica **tracejada** em vez de sólida — a diferença é legível em preto e branco.

`N` colunas, não duas. Uma coluna → ocupa a largura toda. Três ou mais → rolagem horizontal com largura mínima de 320. Links marcados *local-only* (sem internet, como um cabo direto para outra máquina) **não** viram coluna; aparecem só em Adaptadores.

---

## 3. Elemento-assinatura: a raia

Um filete vertical de **3 px** na cor do link, percorrendo a coluna inteira do topo ao rodapé.

É o **único elemento saturado da interface**. Todo o resto — fundo, superfície, texto, bordas — é neutro. Isso faz a cor carregar exatamente um significado: *identidade de link*. Sem accent de marca competindo, sem botão colorido, sem ícone colorido.

A raia se repete em toda a superfície do produto e é o que amarra o sistema:

| Onde | Forma |
|---|---|
| Início | filete vertical de 3 px, altura da coluna |
| Ficha de processo | quadrado de 8 px antes do nome |
| Atividade | trilho vertical contínuo à esquerda da timeline |
| Adaptadores | filete de 3 px na borda esquerda da linha |
| Tray | ponto na cor do link com mais processos ativos |

**A transição orquestrada — e é a única do produto.** Quando um processo entra em redirecionamento, a ficha **atravessa** da coluna de origem para a de destino: 320 ms, `CubicEase/EaseInOut`, deslocamento horizontal + a marca de cor fazendo *cross-fade* da cor de origem para a de destino no meio do trajeto. As fichas abaixo fecham o espaço em 160 ms.

Nada mais no app anima além de: foco, hover (120 ms) e esta transição. Com "reduzir movimento" ativo, a ficha troca de coluna sem interpolação e recebe um realce de 600 ms no lugar.

---

## 4. Paleta

Seis nomes. Tema escuro é o canônico (o sistema aqui está em escuro); o claro é o espelho, definido no mesmo dicionário.

| Nome | Escuro | Claro | Papel |
|---|---|---|---|
| **Breu** | `#0F1115` | `#F7F8FA` | fundo da janela |
| **Bancada** | `#171A21` | `#FFFFFF` | superfície da coluna, fichas, painéis |
| **Filete** | `#252A34` | `#E2E5EB` | divisores, bordas, contorno de foco inativo |
| **Cal** | `#E6E9EF` | `#12151A` | texto primário, números |
| **Fumo** | `#858D9E` | `#5C6474` | texto secundário, rótulos, unidades |
| **Alarme** | `#E5484D` | `#C6262B` | **exclusivamente** erro e o botão de pânico |

### Rampa de raia — identidade de link

Não é uma cor de accent: é um **conjunto atribuível**. Cada link recebe uma cor no momento em que é configurado, e a mantém para sempre.

| # | Hex | Nome |
|---|---|---|
| 1 | `#3FC7DB` | ciano |
| 2 | `#E8A23C` | âmbar |
| 3 | `#A07CF0` | violeta |
| 4 | `#4CB782` | verde |
| 5 | `#5B8DEF` | azul |
| 6 | `#E86FA9` | rosa |

Atribuída na ordem em que os links são configurados, editável pelo usuário, persistida por `LinkId`. Acima de seis links a rampa recicla.

**Não há vermelho na rampa, de propósito.** Se coral pudesse ser a cor de um link, vermelho na tela seria ambíguo. Com a rampa livre de vermelho, `Alarme` significa sempre e só *problema*. Foi a correção mais útil do sistema de cor.

Contraste: `Cal`/`Breu` ≈ 15:1, `Fumo`/`Breu` ≈ 7:1, cada cor de raia sobre `Bancada` ≥ 4.5:1. AA em texto e em componente. **A cor nunca é o único portador de informação** — a raia sólida vs. tracejada e o rótulo textual carregam o mesmo estado.

---

## 5. Tipografia

| Papel | Face | Fallback |
|---|---|---|
| Display — números de métrica, nomes de link | **Segoe UI Variable Display** | Segoe UI |
| Corpo — todo o resto | **Segoe UI Variable Text** | Segoe UI |
| Dados — IP, porta, PID, prefixo, timestamp | **Consolas** | Lucida Console, Courier New |

**Consolas e não Cascadia Mono**, e é decisão de genericidade, não de gosto: verifiquei o registro de fontes desta máquina e **Cascadia não está instalada**. Ela só chega junto com Windows Terminal/VS. Consolas existe em toda instalação Windows desde o Vista. Uma face de dados que às vezes não existe é uma face que às vezes vira Times New Roman num campo de endereço IP.

### Escala (DIP, base 14)

| px | Uso |
|---|---|
| 11 | unidade, timestamp, rótulo de eixo |
| 12 | mono pequeno — porta, PID |
| 13 | **mono padrão** — IP, prefixo |
| 14 | corpo |
| 17 | nome de processo, título de seção |
| 22 | nome do link |
| 34 | métrica de latência no cabeçalho da raia |

Mono roda **um passo abaixo** do proporcional que acompanha (13 ao lado de 14): a altura-x maior da Consolas faz 13 alinhar opticamente com 14 de Segoe. Sem isso, cada IP na tela parece estar gritando.

Espaçamento em grade de **4**. Gutter entre colunas 20. Respiro interno da coluna 16. Altura da ficha 40.

---

## 6. Navegação

Fita horizontal no topo, 48 px. **Sem sidebar.**

Dois motivos: a sidebar rouba 220–280 px da largura, que é exatamente o recurso de que as raias precisam; e a navegação **não é fixa** — ela é gerada da resposta de `core.listModules`. Quando Pulse, Profiles e Doctor existirem, entram na fita sem uma linha de XAML alterada. A fita *é* a arquitetura de módulos aparecendo na superfície.

`Início` é a raiz, fora dos módulos. `Lanes`, `Adaptadores` e `Atividade` são telas do módulo Lanes. `⚙` fica na ponta direita, separado.

---

## 7. Voz

Vocabulário estável, definido uma vez e usado do começo ao fim:

**link** (nunca "adaptador" ou "interface" na superfície) · **regra** · **sugestão** · **redirecionado** · **rota**

O detalhe técnico existe, mas em segundo nível: `InterfaceIndex`, LUID, prefixo e gateway aparecem no painel de detalhes do link, em Consolas, nunca na tela principal.

**Estado vazio é instrução:**
> **Nenhuma regra ainda.**
> Abra um jogo e o NetLane sugere a primeira.

**Erro diz o que houve e o que fazer, sem pedir desculpas:**
> **Link de jogos sem gateway.**
> Verifique o cabo ou reconecte o adaptador.

> **Serviço NetLane não está rodando.**
> Abra o Gerenciador de Serviços e inicie "NetLane". As rotas ativas continuam valendo.

Botões dizem o que acontece — `Criar regra`, `Remover rota`, `Parar tudo` — e o rótulo é o mesmo do início ao fim do fluxo. O botão que abre o diálogo e o que confirma têm o mesmo nome.

---

## 8. Piso de qualidade

Implementado, nunca anunciado na interface: foco de teclado visível (contorno de 2 px em `Cal`, offset 2 px, em todo controle interativo); contraste AA; `AppsUseLightTheme` respeitado e trocado em runtime; `SystemParameters.ClientAreaAnimation` respeitado como "reduzir movimento"; janela utilizável em **1280 px** de largura, com layout alvo em 1920×1032 (área útil real medida nesta máquina) sem rolagem vertical.

---

## 9. Autocrítica — o que isto seria se eu não tivesse pensado

O default genérico é conhecido: **sidebar escura à esquerda, grid de cards arredondados, dois cards grandes com números grandes, tabela embaixo, accent azul `#3B82F6`, gráfico de linha com preenchimento em gradiente.** É o dashboard que sai por padrão de qualquer pedido de dashboard.

Seis mudanças deliberadas, e o motivo de cada uma:

| # | Default | Aqui | Por quê |
|---|---|---|---|
| 1 | cards em grid | **colunas-raia verticais** | card comunica valor; a pergunta do produto é direção. Posição responde antes da leitura. |
| 2 | sidebar de navegação | **fita superior** | a sidebar come a largura que as raias usam, e a navegação é gerada de módulos, não fixa |
| 3 | um accent de marca | **rampa de identidade** | aqui cor não é marca, é o identificador do link. Um accent global competiria com o único significado que a cor pode ter. |
| 4 | vermelho na paleta decorativa | **vermelho só em `Alarme`** | se vermelho pudesse ser a cor de um link, vermelho na tela ficaria ambíguo |
| 5 | Cascadia/JetBrains Mono | **Consolas** | verificado: Cascadia não está instalada nesta máquina e não é garantida em Windows limpo |
| 6 | gráfico de linha com gradiente | **nenhum gráfico na v1** | latência é um número. Área com gradiente é o tique visual mais datado de dashboard gerado. Série temporal chega com o Pulse, e como traçado de 1 px. |

A mudança que mais importa é a 1. As outras cinco são higiene; a primeira é a que faz a interface responder à pergunta certa.

---

## 10. Tray

| Estado | Ícone |
|---|---|
| serviço ativo, nada redirecionado | contorno em `Fumo` |
| redirecionando | contorno + ponto na cor do link com mais processos |
| erro | contorno + ponto em `Alarme` |
| serviço parado | contorno vazado em `Filete` |

Menu: estado atual (não clicável) · Abrir NetLane · Pausar redirecionamento · **Parar tudo** em `Alarme` · Sair.

"Parar tudo" é o botão de pânico: remove toda rota da sessão e devolve a tabela ao baseline. Confirma antes, e o botão de confirmação também se chama `Parar tudo`.

Notificação discreta quando um processo entra ou sai de redirecionamento, com o nome do processo e o do link — nunca com número de rotas. Iniciar minimizado é opção, desligada por padrão.
