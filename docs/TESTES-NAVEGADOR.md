# Testes no navegador – Copa FIFA em Duplas

Roteiro de testes da interface (`index.html`), feitos no navegador de ponta a ponta. Completa o
`testes.html`, que testa só as regras (`js/regras.js` e `js/estado.js`) sem a tela.

Cada caso diz o que fazer e o que tem que acontecer. Os marcados com **(R)** são regressões de
correções já feitas: se voltarem a falhar, o bug voltou.

## Como rodar

**À mão:** abrir o `index.html` com duplo clique (Chrome ou Edge) e seguir os casos.

**Com o Playwright (pelo Claude Code):** o Playwright bloqueia `file://`, então a pasta precisa ser
servida localmente:

```
python -m http.server 8765 --bind 127.0.0.1
```

e abrir `http://127.0.0.1:8765/index.html`. Dicas:

- Começar cada bloco com `localStorage.clear()` e recarregar, para partir do app vazio.
- As confirmações são uma janela do próprio app (`<dialog>`), não o `confirm()` do navegador: ler o
  título em `dialog[open] h2` e clicar em `#dialogo-ok` ou `#dialogo-cancelar` (Esc também cancela).
  Um `confirm()` nativo aparecendo é falha.
- Para chegar rápido a um estado (ex.: 7 semanas lançadas), dá para escrever o estado direto na chave
  da edição ativa (`copa-fifa-duplas-campeonato-<id>`, com o `<id>` em `ativo` da chave
  `copa-fifa-duplas-indice`) e recarregar. Com o `localStorage` vazio, gravar na chave antiga
  `copa-fifa-duplas-campeonato` também serve: na abertura ela vira a primeira edição. O que está sendo
  testado deve ser feito pela tela.
- O app redesenha a tela de forma assíncrona (`setTimeout`): esperar ~150 ms depois de cada ação
  antes de ler a tela.
- Downloads reais derrubam o navegador do Playwright MCP. Interceptar no `addInitScript`:
  guardar o blob em `URL.createObjectURL` e, em `HTMLAnchorElement.prototype.click`, registrar
  nome e conteúdo de links com `download` sem baixar. O PNG demora mais de 600 ms (`toBlob`):
  esperar com `waitForFunction`.
- Avisos que o app mostra ao carregar (ex.: 1.4) saem antes do `DOMContentLoaded`: ler `#avisos`
  direto, não por um observador instalado depois.
- Cada tela fica numa aba: abrir a aba certa antes de usar a tela (`#aba-btn-rodadas` etc. ou
  navegar para `index.html#rodadas`). Só a aba visível é redesenhada.
- Exportar/importar e "Gerenciar campeonatos" ficam no menu "Campeonato" do cabeçalho: abrir o menu
  (`#menu-campeonato > summary`) antes de clicar no item. Para importar, dá para mandar o arquivo
  direto em `#arquivo-importar` (`setInputFiles`); depois escolher na janela `#importar-novo` ou
  `#importar-substituir`.
- **PNGs:** desde a Fase 21, ficam no botão "Baixar imagem" da Classificação (`#btn-png-classificacao`) e do
  Mata-mata (`#btn-png-mata-mata`, só com o chaveamento gerado). O Resetar é o "Reiniciar campeonato" da zona
  de perigo da aba Ajustes (`#btn-reiniciar`).
- **Fase 22:** o nome de cada jogador (Rodadas, top 8, Classificação e Mata-mata) é um botão
  `.nome-jogador-btn` que abre a ficha (`#ficha-jogador`, um `<dialog>` modal). Ids dos nomes: `#ver-linha-<id>`
  (Classificação), `#ver-top-<id>` (top 8), `#ver-<id do jogo>-<id>` (cartão), `#ver-descansa-<id>`,
  `#ver-<semi1|semi2|final|terceiro>-<lado>-<id>`, `#ver-previa-...` e `#ver-podio-<ouro|prata|bronze>-<id>`.
  Na ficha: `#ficha-titulo`, `#ficha-posicao`, `#ficha-pontos`, `#ficha-saldo`, `#ficha-ved`, `#ficha-jogos`,
  `#ficha-situacao`, `#ficha-lista-jogos` (botões `#ficha-semana-<id do jogo>`), `#ficha-fase-final`,
  `#ficha-conquista` e `#ficha-fechar`.
- **Fase 21:** as semanas das Rodadas são botões `#chip-semana-N` (a escolhida tem `aria-current="true"`),
  com `#semana-anterior`, `#semana-proxima` e `#semana-atual`; não há mais `<select>` de semana. A coluna
  Situação da Classificação é `td.col-situacao` (classe `garantido`, `disputa` ou `eliminado`), em linhas
  `#linha-<id do jogador>`; o resumo dela fica em `#resumo-situacao`.
- **Fase 20:** antes de confirmar o calendário as abas são os 3 passos Configuração (`#configuracao`),
  Jogadores (`#jogadores`) e Sorteio (`#sorteio`); depois, Rodadas, Classificação, Mata-mata e Ajustes
  (`#campeonato`), que mostra Configuração, Jogadores, Sorteio e a zona de perigo juntos, em modo só
  leitura. Ids dos botões das abas: `#aba-btn-<id>`. O endereço antigo `#calendario` vale `#sorteio`.
- O seletor de campeonatos é o botão "Trocar" ao lado do título (`#menu-campeonatos > summary`); a
  tela de Campeonatos fica em `index.html#campeonatos`. Em cada cartão, o menu ⋯
  (`#campeonato-menu-<id> > summary`) guarda Duplicar, Exportar backup, Exportar modelo, Arquivar e
  Excluir; "Abrir" (ou "Desarquivar") fica à vista.
- O servidor do Python manda o CSS com cache: depois de mudar o `style.css`, recarregar ignorando o
  cache (CDP `Page.reload` com `ignoreCache: true`).
- Usar só nomes fictícios ("Jogador 01" a "Jogador 32"). O repositório é público.
- Os downloads e logs ficam em `.playwright-mcp/`, fora do git.

**Sempre também à mão, uma vez por versão:** o caso 1.1, porque o Playwright não abre `file://`.

### Massa de dados padrão

32 jogadores ("Jogador 01" a "Jogador 32"), configuração padrão (6 jogos por jogador, 8 semanas):
48 jogos, 6 por semana, 8 jogadores descansando por semana.

---

## 1. Abertura e persistência

| # | Passos | Esperado |
|---|---|---|
| 1.1 | Abrir `index.html` com duplo clique (`file://`) no Chrome e no Edge. | App carrega, sem erro no console (F12). Nenhum pedido de rede além dos arquivos locais. |
| 1.2 | Abrir com o `localStorage` vazio. | Cadastro vazio, nome "Copa FIFA em Duplas", sem calendário, sem jogos, sem lembrete de backup. |
| 1.3 | Cadastrar jogadores, lançar um placar e recarregar a página (F5). | Tudo continua igual; o status de salvamento indica que salvou. |
| 1.4 | Gravar texto inválido na chave da edição ativa (`copa-fifa-duplas-campeonato-<id>`) e recarregar. | Aviso "Os dados salvos estavam inválidos (...) e foram guardados à parte. O app recomeçou da base." Existe uma chave `copa-fifa-duplas-campeonato-<id>-corrompido-<data>` com o conteúdo antigo. |
| 1.5 | Rodar sem internet (modo avião). | Tudo funciona: o app não usa CDN nem servidor. |

## 1b. Abas e cabeçalho

| # | Passos | Esperado |
|---|---|---|
| 1b.1 | Abrir sem `#` no endereço, em cada etapa. | Abre na aba da etapa e o endereço passa a ter o `#` dela: sem jogadores → Configuração; jogadores sem o cadastro pronto → Jogadores; cadastro pronto ou sorteio em rascunho → Sorteio; calendário confirmado → Rodadas; chaveamento gerado → Mata-mata. |
| 1b.2 | Na aba Jogadores, cadastrar o 8º jogador (a etapa muda). | Continua na aba Jogadores: a aba só muda por escolha. |
| 1b.3 | Confirmar o calendário. | As abas passam a ser Rodadas, Classificação, Mata-mata e Ajustes, e o app vai sozinho para Rodadas. |
| 1b.4 | Clicar nas abas; usar ← → com o foco numa aba; Alt+1 a Alt+3 na preparação e Alt+1 a Alt+4 na temporada (também com o foco num campo). | Troca a aba e o endereço (`#configuracao`, `#jogadores`, `#sorteio`; `#rodadas`, `#classificacao`, `#mata-mata`, `#campeonato`). ← → só passam pelas abas visíveis. As teclas 1 a 9 sozinhas não trocam de aba (digitam normalmente). Alt+número sem aba correspondente não faz nada, nem com o telão aberto. |
| 1b.5 | Voltar e avançar do navegador; F5. | Volta/avança entre as abas visitadas; F5 mantém a aba. |
| 1b.6 | Indicadores das abas. | Configuração: ícone de completo (jogos por jogador cabem nas semanas) ou de alerta. Jogadores: ícone de pronto para sortear ou o nº de jogadores enquanto falta acertar o cadastro. Sorteio: "rascunho" ou ícone de confirmado. Rodadas: "lançados/total". Classificação: ícone de balança com empate técnico sem ordem no top 8. Mata-mata: troféu com campeões. O leitor de tela ouve o indicador por extenso (ex.: "Rodadas, 18 de 48 jogos lançados"). |
| 1b.7 | Rodadas em tela larga (≥ 1100 px). | Jogos da semana em duas colunas e, ao lado, "Top 8 ao vivo" (até o 10º, com a linha de corte no 8º) atualizando a cada placar. "Ver classificação completa" abre a aba Classificação. |
| 1b.8 | Menus "Trocar" e "Campeonato" do cabeçalho. | Abrem por cima do conteúdo; abrir um fecha o outro; fecham ao escolher um item, ao clicar fora e com Esc (o foco volta para o botão do menu). Em ~400 px a lista ocupa a largura do cabeçalho, sem sair da tela. "Campeonato" tem Exportar backup, Importar backup e Gerenciar campeonatos. |
| 1b.9 | Resetar ou importar um backup. | Vai para a aba da etapa do campeonato resultante. |
| 1b.11 | Antes de confirmar, abrir `#rodadas`, `#campeonato` e `#calendario` à mão. | `#rodadas` e `#campeonato` não valem: o app mostra a aba da etapa e o endereço é corrigido. `#calendario` vira `#sorteio`. |
| 1b.12 | Depois de confirmar, abrir `#jogadores`, `#sorteio` e `#calendario` à mão. | Os três caem em Ajustes (`#campeonato`). |
| 1b.13 | Aba Ajustes. | Mostra, em ordem, Configuração (jogos e semanas desabilitados; nome e aparência editáveis), Jogadores (só renomear, estrelas fixas, sem "Combinação válida"), "Sorteio do calendário" confirmado com as 8 semanas e "Zona de perigo" com "Reiniciar campeonato". |
| 1b.14 | "Reiniciar campeonato" na zona de perigo. | Janela "Resetar o campeonato?" (botão vermelho, foco em "Cancelar"); aceitando, volta ao cadastro vazio, as abas voltam a ser os 3 passos, no passo Configuração; Desfazer devolve o campeonato e as abas da temporada. |
| 1b.10 | "Baixar imagem" na Classificação, ao vivo e com "após a semana N" escolhido. | Ao vivo: `...-classificacao-<data>.png`. Com a semana N: `...-classificacao-semana-N-...png`. |

## 2. Configuração e jogadores

Os casos de nome, jogos por jogador, semanas e aparência são do passo **Configuração**; os de cadastro, estrelas e diagnóstico do cadastro são do passo **Jogadores** (a linha "N jogadores × J jogos ÷ 4 = ..." fica na Configuração). O botão "Próximo: jogadores" (Configuração) e "Próximo: sortear o calendário" (Jogadores, só com o cadastro pronto) levam ao passo seguinte.

| # | Passos | Esperado |
|---|---|---|
| 2.1 | Colar 32 nomes no campo (um por linha) e clicar em "Adicionar". | Aviso "32 jogadores adicionados.", lista com 32, diagnóstico "Combinação válida para sortear o calendário." |
| 2.2 | Digitar nomes e apertar Ctrl+Enter. | Adiciona igual ao botão. |
| 2.3 | Clicar em "Adicionar" com o campo vazio. | Erro "Digite ao menos um nome (um por linha)." embaixo do campo (ver 13.8). |
| 2.4 | Adicionar um nome que já existe (inclusive com maiúsculas/minúsculas diferentes). | Erro "... não foi adicionado: Já existe um jogador chamado ..."; o nome com problema fica no campo; os outros da lista entram. |
| 2.5 | Adicionar um nome com mais de 30 caracteres. | Erro "Nome muito longo (máximo 30 caracteres)." |
| 2.6 | Renomear um jogador e salvar. | Nome muda na lista, nos jogos, na classificação e na agenda. |
| 2.7 | Renomear para um nome vazio ou repetido. | Erro e o campo continua em edição com o texto digitado. |
| 2.8 | Remover um jogador antes do sorteio. | Some da lista; o sorteio em rascunho (se houver) é descartado. |
| 2.9 | Mudar o nome do campeonato. Depois tentar deixar vazio. | O título muda. Vazio: erro "O nome do campeonato não pode ficar vazio." embaixo do campo, que continua vazio até ser corrigido; o nome guardado (título) não muda. |
| 2.10 | Com 7 jogadores. | Diagnóstico "Cadastre pelo menos 8 jogadores (hoje: 7)." e "Sortear" desabilitado. |
| 2.11 | Com 31 jogadores e 6 jogos. | Diagnóstico "31 jogadores × 6 jogos = 186 vagas, e cada jogo ocupa 4: não fecha. ..." |
| 2.12 | Jogos por jogador = 9 com 8 semanas. | Diagnóstico "... 9 jogos pedem pelo menos 9 semanas (há 8)." |
| 2.13 | 8 jogadores e 8 jogos por jogador (com 8+ semanas). | Diagnóstico "Sem repetir parceiro, 8 jogadores permitem no máximo 7 jogos por jogador." |
| 2.14 | Digitar 0 ou "ab" em jogos por jogador ou semanas. | Erro "Use um número de 1 a 99." embaixo do campo, com o valor digitado; a configuração guardada não muda. O campo aceita no máximo 2 dígitos. |
| 2.15 **(R)** | Digitar no campo de nomes e apertar Ctrl+Z dentro dele. | Desfaz só o texto digitado. A lista de jogadores não muda e não aparece "Desfeito: ...". |

## 3. Sorteio e calendário

Tela do passo **Sorteio** (`#sorteio`); depois da confirmação, o calendário completo fica em Ajustes.

| # | Passos | Esperado |
|---|---|---|
| 3.1 | Com 32 jogadores, clicar em "Sortear calendário". | Rascunho com 8 semanas e 6 jogos por semana; botões "Sortear de novo", "Confirmar calendário" e "Descartar". |
| 3.2 | Conferir o rascunho. | Cada jogador em 6 jogos, no máximo 1 por semana, nenhum parceiro repetido. 8 jogadores descansando por semana. |
| 3.3 | "Sortear de novo". | Janela "Sortear de novo?"; aceitando, gera outro calendário; cancelando, nada muda. |
| 3.4 | Trocar um jogador num jogo do rascunho pelo seletor. | As opções dizem "(atual)", "— joga no jogo N (trocam de lugar)" ou "— descansa nesta semana". Escolhendo, o rascunho muda na hora. |
| 3.5 | Trocar um jogador por alguém que descansa na semana. | O painel mostra "... tem 5 jogos (o esperado é 6).", "... tem 7 jogos ..." (cada um com o ícone de alerta) e, se for o caso, "... são parceiros 2 vezes.". "Confirmar" abre "Confirmar o calendário?" começando com "Atenção, o calendário não respeita o regulamento: ..." e o botão de ação em vermelho. |
| 3.6 | "Descartar". | Volta para antes do sorteio. |
| 3.7 | "Confirmar calendário". | Janela "Confirmar o calendário?"; aceitando, cria os 48 jogos (`s1-j1` ...), o cadastro trava (só renomear), o "Reiniciar campeonato" fica em Ajustes e o app vai para a aba Rodadas. |
| 3.8 | Depois de confirmado, tentar adicionar ou remover jogador. | Campo de nomes e botões de remover não aparecem; só "Renomear". |
| 3.9 | Exportar o backup, resetar, importar e comparar o calendário. | Mesmo calendário (a semente vai no backup). |

## 4. Rodadas e lançamento de placares

| # | Passos | Esperado |
|---|---|---|
| 4.1 | Abrir a tela de jogos depois de confirmar. | Mostra a semana em andamento, contador "0/48 lançados", a navegação ◀ S1 … S8 ▶ e "Semana atual", e "Descansam na semana 1 (8): ...". Não há seletor de semana. |
| 4.2 | Navegar com ◀ ▶ e pelos botões S1…S8. | Mostra os jogos da semana escolhida (botão contornado). ◀ desabilitado na semana 1, ▶ na 8. A semana em andamento tem um ponto embaixo do número. |
| 4.3 | "Semana atual". | Desabilitado na semana em andamento; em outra semana, volta para ela. O leitor de tela ouve cada botão por extenso ("Semana 2, 0 de 6 jogos resolvidos, em andamento"; "Semana 1, completa"). |
| 4.4 | Digitar o placar: 1º campo, Enter, 2º campo, Enter. | Enter no 1º pula para o 2º; Enter no 2º lança. Cartão vira "lançado", contador "1/48 lançados". |
| 4.5 | Lançar usando Tab entre os campos. | Lança ao sair do 2º campo; o foco segue para o botão "W.O." do mesmo jogo, sem se perder no redesenho. |
| 4.6 | Digitar um placar e clicar direto num botão de outro jogo (ex.: "W.O."). | O clique funciona na primeira tentativa (o redesenho espera soltar o mouse). |
| 4.7 | Digitar "abc", "-1" ou "100". | Erro "Placar inválido: use números de 0 a 99." embaixo do placar, no cartão do jogo, e o campo fica marcado. |
| 4.8 | Apagar um lado de um placar já lançado. | O jogo volta a ficar pendente. |
| 4.9 | W.O. → botão com os nomes da dupla 1. | A pergunta "W.O.: qual dupla estava presente?" vem com um botão por dupla, com os nomes ("Jogador 19 + Jogador 10"). Resultado W.O.: dupla 1 com 3×0, 3 pontos e +3 de saldo; dupla 2 com −3. "Cancelar" fecha a escolha sem lançar. |
| 4.10 | "Anular". | Jogo resolvido, mas ninguém ganha ponto, V/E/D, gol nem jogo disputado. |
| 4.11 | "Limpar" num jogo lançado. | Volta a ficar pendente. |
| 4.12 | Lançar 0×0 e 1×1. | 0×0: E+1 e 0 ponto para os 4. 1×1: E+1 e 1 ponto. |
| 4.13 | Completar uma semana. | O botão dela fica verde (completa) e o ponto da semana em andamento passa para a seguinte. |
| 4.14 **(R)** | Clicar no nome de um jogador num cartão de jogo, no top 8 ao vivo e em "Descansam". | Abre a ficha do jogador (seção 17). A antiga "Agenda do jogador" no pé das Rodadas saiu na Fase 22. |
| 4.15 | Leitor de tela nos cartões. | Cada cartão tem um título (`h3`) "Semana N · Jogo M"; na tela aparece só "Jogo M". |

## 5. Classificação

| # | Passos | Esperado |
|---|---|---|
| 5.1 | Sem jogos lançados. | Todos com 0 ponto, em ordem alfabética (com acentos no lugar certo: "Érica" depois de "Davi"), sem a balança de empate técnico porque ninguém jogou. |
| 5.2 | Lançar um jogo e conferir as linhas dos 4 jogadores. | Pontos, V/E/D, GP, GC e SG conforme a tabela de `docs/ESCOPO.md` (2.1). |
| 5.3 | Montar empates em pontos e conferir a ordem. | Pontos → vitórias → saldo → gols pró. |
| 5.4 | Top 8. | Os 8 primeiros destacados em verde. |
| 5.5 | Escolher "após a semana N" no seletor. | Mostra a tabela só com os jogos até a semana N, com o rótulo "após a semana N", sem as setas de desempate (só leitura) e ▲▼ em relação à semana anterior. Na semana 1 não há ▲▼ (não existe semana anterior). |
| 5.6 | Empate técnico (iguais em pontos, V, SG e GP) começando no top 8. | Balança no grupo, botões "Subir"/"Descer" (setas) e "Confirmar a ordem atual" no primeiro do grupo. |
| 5.7 | Usar ↑↓ no grupo empatado. | A ordem muda e fica guardada; recarregar mantém. |
| 5.8 | Lançar algo que desfaz o empate do grupo. | A ordem manual daquele grupo é descartada. |
| 5.9 | Tela inteira. | A tabela ocupa a largura toda (sem painel ao lado). Legenda curta "Top 8 vai para a fase final" e, fechado, "Como ler" com ▲▼, empate técnico e a explicação da Situação. |
| 5.10 | "Baixar imagem". | Igual ao 1b.10 e ao 10.1. |

## 6. Situação (o que está em jogo)

Coluna "Situação" da Classificação, só ao vivo (no lugar do antigo painel "O que está em jogo").

| # | Passos | Esperado |
|---|---|---|
| 6.1 | Sem jogos. | Sem a coluna e sem a linha de resumo. |
| 6.2 | Com mais de 8 jogos pendentes. | Linha "Situação disponível quando faltarem até 8 jogos (faltam N)." e sem a coluna. |
| 6.3 **(R)** | Com 5 jogos pendentes. | Linha "Situação: 5 jogos pendentes, 1.024 cenários." (4⁵: o anulado conta junto do 0×0). |
| 6.4 | Conferir a coluna. | Cada jogador com um só ícone e texto: Garantido, Em disputa ou Eliminado. |
| 6.5 | Jogador garantido. | Em nenhum cenário fica fora do top 8 (conferir um caso à mão). |
| 6.6 | Jogador em disputa. | Embaixo, "Próximo: Semana N · Jogo M" (com "+N" se joga mais depois) ou "Não joga mais, só pode cair", e "depende do saldo" quando for o caso. Cabe numa linha em tela larga. |
| 6.7 | Todos os jogos lançados. | "Situação: todos os jogos lançados."; só garantidos e eliminados (ou "depende do desempate" para empate técnico sem ordem manual). |
| 6.8 | Medir o tempo com 8 pendentes. | A tela responde em menos de 1 s. |
| 6.9 | Escolher "após a semana N". | A coluna e a linha de resumo somem; voltar para "Atual (ao vivo)" traz as duas de volta. |

## 7. Mata-mata

| # | Passos | Esperado |
|---|---|---|
| 7.1 | Antes de lançar todos os jogos. | "Prévia pela classificação atual" e avisos do que falta. "Gerar chaveamento" abre "Gerar o chaveamento mesmo assim?" com a lista dos avisos. |
| 7.2 | Com tudo lançado, gerar. | Semi 1 = 1º+8º × 2º+7º; Semi 2 = 3º+6º × 4º+5º. "Todos os jogos lançados e nenhum empate técnico pendente no top 8." antes de gerar. |
| 7.3 | Lançar placar com vencedor numa semi. | "Dupla N vence", status "Decidido". |
| 7.4 | Lançar empate numa semi. | Aparece a prorrogação; empatando nela, aparecem os pênaltis. |
| 7.5 | Pênaltis empatados. | Erro "Pênaltis não podem terminar empatados." |
| 7.6 | Final MD3. | Começa só com o jogo 1; cada jogo aparece depois do resultado do anterior; o 3º só aparece com 1×1 na série; termina com 2 vitórias ("Série: 2 × 1"). |
| 7.7 | Pódio. | Campeões (troféu) e vice (medalha) saem da final; o 3º lugar (medalha) da disputa de 3º. |
| 7.8 | Trocar uma dupla à mão (botão de lápis "Trocar a dupla N"), salvar e depois voltar à automática. | A dupla manual aparece; voltar restaura a dupla da classificação/semi. |
| 7.9 | Trocar uma dupla com jogador repetido ou o mesmo jogador nas duas duplas. | Erros "Os dois jogadores da dupla precisam ser diferentes." / "Um jogador não pode estar nas duas duplas do mesmo jogo." |
| 7.10 | Mudar um placar da fase de classificação depois de gerar, alterando o top 8. | Alerta "A classificação mudou depois de gerar o chaveamento ..." com "Usar duplas da classificação atual". As semis continuam com as duplas antigas até clicar. Se as semis já têm placar, abre "Trocar as duplas mesmo assim?"; ao trocar, se final/3º lugar já têm placar, aparece em seguida o alerta do 7.12. |
| 7.11 **(R)** | Final sem placar: trocar o resultado de uma semi. | A final passa a mostrar o novo vencedor sozinha, sem alerta. |
| 7.12 **(R)** | Final e 3º lugar com placar: corrigir o resultado de uma semi. | As duplas que jogaram e os placares continuam. Aparece o alerta "O resultado de uma semifinal mudou depois de lançar placares da final ou do 3º lugar ...". |
| 7.13 **(R)** | No caso 7.12, clicar em "Usar duplas que saem das semis". | Janela "Trocar as duplas mesmo assim?" ("... já tem placar lançado. Os placares continuam e passam a valer para as novas duplas."). Aceitando, troca as duplas e mantém os placares; o alerta some. "Desfazer" volta ao estado anterior. |
| 7.14 | Resultados do mata-mata. | A classificação não muda. |
| 7.15 | "Apagar chaveamento". | Janela "Apagar o chaveamento?"; aceitando, apaga tudo do mata-mata; "Desfazer" traz de volta. |
| 7.16 | Com o chaveamento gerado, "Baixar imagem" (à esquerda; "Apagar chaveamento" à direita). Sem chaveamento. | Baixa `...-mata-mata-<data>.png`. Sem chaveamento, o botão não aparece. |
| 7.17 | Leitor de tela no editor de dupla e no pódio. | Os seletores dizem o confronto ("Final, dupla 1, jogador 2"); as medalhas do pódio não são lidas. |
| 7.18 | Antes de gerar, na prévia, escolher um jogador do top 8 em "Marcar ausente". | Aparece "<nome> (ausente)" com "Remover" e "Entram no lugar: 9º <nome>." A prévia não tem o ausente e quem entrou ocupa a mesma posição (os de baixo sobem). Marcar também o 9º: entra o 10º. "Remover" devolve a prévia de antes. O foco volta ao seletor. |
| 7.19 | Com ausentes marcados, "Gerar chaveamento". | O chaveamento sai sem o ausente. Exportar o backup e importar: continua igual (`mataMata.ausentes`). Marcar tantos ausentes que sobrem menos jogadores que as vagas: aviso e sem botão de gerar. |
| 7.20 | Num confronto sem vencedor, "Ausência". | O painel traz o seletor de jogador ausente (só os jogadores do confronto), "Substituir por <próximo da tabela>", "W.O. da dupla N" e "Cancelar". Cancelar fecha sem mudar nada. |
| 7.21 | "Substituir por ...". | Janela "Substituir o jogador ausente?"; aceitando, o ausente sai, o próximo da classificação que não está no chaveamento entra, a dupla fica "alterada manualmente". Substituir de novo (o substituto também falta) traz o seguinte; ninguém volta. "Desfazer" devolve. |
| 7.22 | "W.O. da dupla N". | Janela "Dar W.O. a esta dupla?" (botão vermelho); aceitando, o confronto fica "Decidido por W.O.", a dupla ausente leva a marca "W.O.", a outra "avança" e já aparece na rodada seguinte; os campos de placar, o lápis e o botão de trocar de lugar somem. No 3º lugar entra quem perdeu a semi. |
| 7.23 | "Desfazer W.O.". Depois, W.O. na final (MD3) e no 3º lugar. | O confronto volta a aceitar placar. Com W.O. na final e no 3º lugar, o pódio sai sem placar. Com placar lançado no confronto, "W.O. da dupla N" fica desabilitado e a linha embaixo explica ("já tem placar lançado"); com a série decidida, não há botão "Ausência". |
| 7.24 | W.O. num confronto e depois "Baixar imagem", Modo telão e abrir a ficha de um dos jogadores. | PNG e telão mostram "W.O." no lugar do placar da dupla ausente, "–" na que avança e uma linha "W.O. da dupla N · a dupla M avança sem placar". A ficha diz "derrota por W.O." / "vitória por W.O.". |

## 8. Desfazer

| # | Passos | Esperado |
|---|---|---|
| 8.1 | Fazer uma ação e clicar em "Desfazer". | Volta ao estado anterior e avisa "Desfeito: <descrição>". |
| 8.2 | Ctrl+Z fora de campos de texto. | Igual ao botão. |
| 8.3 **(R)** | Ctrl+Z dentro de um campo de placar, de nome ou de texto. | Desfaz só o texto do campo, não a ação do app. |
| 8.4 | Fazer 31 ações e desfazer tudo. | Só 30 voltam (limite do histórico). |
| 8.5 | Exportar um backup e depois desfazer. | O registro do backup não é desfeito (não "desexporta"). |

## 9. Backup, importar e resetar

| # | Passos | Esperado |
|---|---|---|
| 9.1 | Com jogos e sem backup. | Lembrete "Você ainda não exportou nenhum backup deste campeonato." com "Exportar backup agora" e "Dispensar". |
| 9.2 | Exportar. | Baixa `<nome-do-campeonato>-backup-<data-hora>.json`; o lembrete some; o arquivo tem `ultimoBackup` com a data e as semanas completas. |
| 9.3 | Concluir mais uma semana depois do backup. | Lembrete "... semanas já foram concluídas, mais do que no último backup." |
| 9.4 | Backup com 7 dias ou mais (ajustar a data de `ultimoBackup` no `localStorage`). | Lembrete "Faz N dias desde o último backup." |
| 9.5 | "Dispensar". | O lembrete some até a mensagem mudar ou a página ser recarregada. |
| 9.6 **(R)** | Resetar (menu ⋯ → "Resetar campeonato"). | Janela "Resetar o campeonato?"; aceitando, volta ao cadastro vazio, avisa "Campeonato reiniciado: tudo vazio." e `ultimoBackup` fica `null`. |
| 9.7 **(R)** | Exportar, resetar e desfazer. | O campeonato e o registro do backup voltam: o lembrete não reaparece. |
| 9.8 **(R)** | Importar um backup exportado, escolhendo "Substituir o ativo". | "Backup importado: <arquivo>"; campeonato igual ao exportado; `ultimoBackup` igual ao do arquivo; sem lembrete. |
| 9.9 **(R)** | Importar um backup sem `ultimoBackup`. | O registro fica `null` e o lembrete aparece. |
| 9.10 **(R)** | Importar um backup com um jogo na semana 9 (campeonato de 8 semanas). | "Não foi possível importar: semana inválida no jogo ... (o campeonato tem 8 semanas)." O estado atual não muda. |
| 9.11 | Importar um arquivo que não é JSON. | "Não foi possível importar: o arquivo não é um JSON válido." |
| 9.12 | Importar um backup da versão 1. | "Não foi possível importar: este backup é do formato antigo (versão 1, ...)". |
| 9.13 **(R)** | Importar ("Substituir o ativo") e depois desfazer. | Volta o campeonato de antes da importação, com o registro de backup dele. |
| 9.14 | "Reiniciar campeonato" (zona de perigo, na aba Ajustes). | Mesmo comportamento do "Resetar". |

## 10. Imagens (PNG)

Os PNGs saem pelo botão "Baixar imagem" da Classificação e do Mata-mata.

| # | Passos | Esperado |
|---|---|---|
| 10.1 | "Baixar imagem" na Classificação. | Baixa a imagem; aviso "Imagem baixada: ...". Imagem legível, top 8 destacado, todos os jogadores (sem a coluna Situação). |
| 10.2 | Imagem da classificação com 8 e com 40 jogadores. | As linhas cabem; nomes de 30 caracteres não cortam. |
| 10.3 | Mata-mata sem chaveamento. | Não há "Baixar imagem" (ver 7.16). |
| 10.4 | "Baixar imagem" no Mata-mata com prorrogação, pênaltis e final MD3. | Mostra os placares extras e o pódio. |

## 11. Modo telão

| # | Passos | Esperado |
|---|---|---|
| 11.1 | Clicar em "Modo telão". | Abre a janela "Modo telão" (foco em "Abrir telão") com as caixas Classificação, Jogos da semana e Mata-mata e o tempo em cada tela (15 s). Na primeira vez, as telas que existem vêm marcadas; as que não existem ficam desabilitadas e dizem quando passam a existir. "Abrir telão" abre em tela cheia com a primeira tela marcada. |
| 11.1b | Na janela, desmarcar todas as telas; depois marcar só uma e escolher 30 s. Cancelar e Esc. | Sem nenhuma marcada, "Abrir telão" e "Abrir em nova janela" ficam desabilitados e aparece "Marque ao menos uma tela." Cancelar e Esc fecham sem abrir nada e sem mudar a escolha guardada. |
| 11.1c | Abrir com só "Jogos da semana"; sair; clicar de novo em "Modo telão". Depois Shift+clique no botão. | A janela volta com a mesma escolha e o mesmo tempo. O Shift+clique abre o telão direto, sem janela, só com as telas escolhidas. Recarregar a página mantém a escolha. |
| 11.1d | "Abrir em nova janela". | Abre uma janela separada (`index.html#telao`) só com as telas escolhidas e o tempo escolhido; o telão não abre nesta janela. Se o navegador bloquear, aparece o aviso e o telão abre nesta. |
| 11.2 | Esperar o tempo escolhido (15 s por padrão). | Passa para a próxima tela escolhida (só as que têm conteúdo: classificação; jogos depois do calendário; mata-mata depois do chaveamento). Com uma tela só, não troca. A barra de progresso avança. |
| 11.3 | Espaço, → e ←. | Pausa/continua; avança; volta. |
| 11.3b **(R)** | Mexer o mouse e pausar (a barra de controles fica visível), em cada tela. | A barra aparece na faixa do rodapé, abaixo do conteúdo: não cobre a última linha da classificação, os jogos nem o mata-mata. |
| 11.4 | Esc. | Sai do telão. Ctrl+Z não desfaz nada enquanto o telão está aberto. |
| 11.5 | Abrir `index.html#telao` numa segunda janela e lançar placares na primeira. | O telão atualiza sozinho, com as telas e o tempo da última escolha (sem escolha guardada, com todas as que existem). Escolher outras telas na primeira janela atualiza o telão que já está aberto na segunda. |
| 11.6 **(R)** | Telão com 8, 32, 40 e 60 jogadores (nomes de 30 caracteres), em 1920×1080 e 1280×720. | Tudo cabe na tela, nada passa da borda. Com 8, as linhas ficam no tamanho normal no topo (não esticam); com 32, ocupam a tela; com mais, encolhem. |

## 12. Várias janelas e robustez

| # | Passos | Esperado |
|---|---|---|
| 12.1 | Duas abas do app; lançar um placar numa. | A outra atualiza sozinha (evento `storage`). |
| 12.2 | Digitar um placar pela metade numa aba enquanto a outra salva. | A aba recarrega o estado; o rascunho é descartado sem erro. |
| 12.3 | Ver o console durante todo o roteiro. | Nenhum erro de JavaScript. |

## 13. Visual e acessibilidade

| # | Passos | Esperado |
|---|---|---|
| 13.1 | Janela estreita (~400 px) e larga (1920 px). | Sem rolagem horizontal; nada sobreposto. |
| 13.2 | Navegar só com o teclado (Tab, Enter, Espaço). | Todos os botões e campos alcançáveis, com foco visível. |
| 13.3 | Campos de placar. | Têm `aria-label` dizendo o jogo e a dupla. |
| 13.4 | Avisos no canto (ex.: exportar o backup; importar um arquivo que não é JSON). | Ficam na área `#avisos` (`aria-live="polite"`, sem `role` em cada aviso), com o botão "Fechar aviso". O de sucesso some em 5 s; o de erro fica até ser fechado. O mesmo aviso repetido não empilha. A linha "Salvo no navegador às..." não é anunciada. |
| 13.5 | Janelas de confirmação (sortear de novo, confirmar calendário, gerar/apagar chaveamento, trocar duplas com placar, resetar). | Título com a pergunta e botão com o nome da ação. Ações perigosas: botão vermelho e foco em "Cancelar" (Enter cancela). Esc cancela. Com a janela aberta, Ctrl+Z e Alt+1…5 não fazem nada. |
| 13.6 | Tema escuro do sistema (Windows: Configurações → Personalização → Cores → escuro). | O app inteiro fica escuro, legível, sem fundo branco sobrando (campos, menus, janelas). O telão não muda. |
| 13.7 | Telas vazias (app zerado), em cada aba. | Cada uma diz o que falta e tem um botão para a aba onde se resolve ("Ir para Jogadores", "Ir para o Calendário"). Nenhum "null" ou "undefined" na tela. Com o cadastro pronto, Jogadores mostra "Próximo: sortear o calendário →". |
| 13.8 | Erro junto do campo: placar "x" (Rodadas e Mata-mata), nome do campeonato vazio, jogos por jogador = 0, cor branca, renomear para um nome que já existe, "Adicionar" sem nomes, trocar uma dupla do mata-mata pelo mesmo jogador duas vezes. | A mensagem aparece logo abaixo do campo, em vermelho com ícone de alerta; o campo fica com borda vermelha e `aria-invalid="true"`, ligado à mensagem por `aria-describedby`. Nenhum aviso no canto. O texto recusado continua no campo; ao corrigir, a mensagem some. Sair do campo com Tab não puxa o foco de volta. |
| 13.9 | Primeiro Tab ao abrir o app; Enter. | Aparece "Pular para o conteúdo"; o Enter leva o foco para o conteúdo da aba sem mudar o endereço (`#aba` continua). |
| 13.10 | Botões e ícones em todas as abas. | Nenhum emoji na interface (o telão e os PNGs continuam como estão). Botões só com ícone (lápis, lixeira, setas, fechar) dizem o que fazem na dica e para o leitor de tela. Botões pequenos com pelo menos 28 px. Plurais certos ("1 jogador", "2 jogadores"); nenhum "(es)". Mensagens e "Desfazer" falam "Semana 3 · Jogo 2", nunca "s3-j2". |
| 13.11 | Lighthouse (acessibilidade), modo snapshot, em cada aba e na tela de Campeonatos, nos temas claro e escuro. | Nota ≥ 95, sem falhas de contraste nem de nome acessível. |

## 14. Várias edições

| # | Passos | Esperado |
|---|---|---|
| 14.1 | `localStorage` só com a chave antiga `copa-fifa-duplas-campeonato` (um campeonato com jogos) e abrir o app. | Abre esse campeonato, na aba da etapa. Existem `copa-fifa-duplas-indice` e `copa-fifa-duplas-campeonato-<id>`; a chave antiga continua igual. Recarregar não cria outra edição. |
| 14.2 | Clicar em "Trocar" ao lado do título. | Abre a lista "Campeonatos" com as edições não arquivadas (a aberta com o ícone de confirmado e a situação embaixo de cada nome), "Novo campeonato" e "Gerenciar campeonatos". Fecha ao escolher, ao clicar fora e com Esc. Nome longo quebra linha, sem empurrar os botões do cabeçalho. |
| 14.3 | "+ Novo campeonato". | Vai para o passo Configuração com o nome "Copa FIFA em Duplas" selecionado: digitar substitui. Desfazer fica desabilitado (edição nova). |
| 14.4 | Escolher outra edição no seletor. | Carrega a edição, vai para a aba da etapa dela, aviso "Campeonato aberto: ...". O desfazer é o daquela edição. O lembrete de backup é o dela. |
| 14.5 | Telão em outra janela (`index.html#telao`) e trocar de edição na primeira. | O telão passa a mostrar a nova edição sozinho (nome no topo e rodízio de telas). |
| 14.6 | "Gerenciar campeonatos" (pelo "Trocar" ou pelo menu "Campeonato"). | `#campeonatos`, nenhuma aba de etapa selecionada. Edições em cartões, em uso (a aberta destacada, com a etiqueta "aberto" e sem botão Abrir) e "Arquivados"; cada cartão com situação, nº de jogadores, data de criação, "Abrir" à vista e o menu ⋯. Espaço usado no rodapé, como barra de progresso com o texto. |
| 14.7 | Duplicar uma edição com jogos. | Nova edição "Nome (2)" aberta no passo Configuração, com os mesmos jogadores e configuração, sem calendário nem jogos, cadastro livre. Duplicar de novo: "(3)". |
| 14.8 | Arquivar uma edição pelo menu ⋯ (e depois a aberta). | Sai do seletor e vai para "Arquivados", sem botão Abrir e com "Desarquivar" à vista (o menu ⋯ dela não tem "Arquivar"). Arquivar a aberta abre a última não arquivada. Desarquivar devolve ao seletor. |
| 14.9 | Excluir uma edição. | Janela "Excluir o campeonato?" com botão vermelho e foco em "Cancelar". "⬇ Exportar backup antes" baixa o JSON dela e a janela continua aberta. "Excluir" apaga a chave dela; sem desfazer. Excluir a última cria uma edição vazia. |
| 14.10 | Exportar uma edição que não está aberta (tela de Campeonatos). | Baixa o JSON daquela edição; o registro de backup é gravado nela; a aberta não muda. |
| 14.11 | Importar um backup válido. | Janela "Importar backup" com o nome do campeonato do arquivo, "Cancelar", "Substituir o ativo" e "Importar como novo campeonato" (com o foco). "Novo": edição nova aberta na aba da etapa, sem desfazer; a anterior continua na lista. Esc ou "Cancelar": nada muda. |
| 14.12 | Importar um arquivo inválido. | Erro na hora, sem a janela de escolha; nenhuma edição criada. |
| 14.13 | Gravar texto inválido em `copa-fifa-duplas-indice` e recarregar. | Aviso "A lista de campeonatos estava inválida (...)"; as edições continuam todas no seletor; existe `copa-fifa-duplas-indice-corrompido-<data>`. |
| 14.14 | Seletor e tela de Campeonatos em ~400 px e no tema escuro. | Sem rolagem horizontal; a lista do seletor ocupa a largura do cabeçalho; cartões em uma coluna; legível no escuro. |
| 14.15 | Menu ⋯ de um cartão: abrir, abrir o de outro cartão, escolher um item, clicar fora, Esc. | Só um menu fica aberto; fecha ao escolher um item, ao clicar fora e com Esc (o foco volta ao ⋯). O leitor de tela ouve "Mais ações de <nome>". |

## 15. Aparência (cor e logo) e modelo de campeonato

| # | Passos | Esperado |
|---|---|---|
| 15.1 | Aba Jogadores → "Aparência" → escolher uma cor escura (ex.: `#8b0000`). | O cabeçalho muda na hora, aviso "Cor do campeonato atualizada.", aparece o botão "Padrão". O Desfazer continua como estava (a cor não entra no desfazer). |
| 15.2 | Escolher uma cor clara (ex.: `#ffff00`). | Erro "Cor clara demais... (contraste 1,1:1; o mínimo é 4,5:1)" embaixo da aparência. O cabeçalho não muda; o seletor mostra a cor recusada até escolher outra. |
| 15.3 | "Escolher imagem" com um PNG grande (ex.: 600×300); depois um arquivo que não é imagem. | O logo aparece ao lado do título e na prévia, reduzido para caber em 256×128. Arquivo que não é imagem: erro "use uma imagem PNG, JPG ou WebP." e nada muda. |
| 15.4 | "Remover" o logo e "Padrão" na cor. | Volta ao cabeçalho azul sem logo, com aviso a cada ação. |
| 15.5 | Com cor e logo numa edição, trocar para outra sem aparência pelo seletor, e voltar. | Cada edição mostra a sua: a outra fica com o azul padrão e sem logo. |
| 15.6 | PNG da classificação e do mata-mata, com cor e logo. | Faixa do topo na cor do campeonato, logo no canto superior direito, título sem passar por cima do logo. |
| 15.7 | Modo telão com cor e logo; depois tirar a aparência com o telão aberto. | Fundo do telão escurecido a partir da cor e logo à esquerda do nome. Sem aparência: fundo e topo padrão, sem recarregar. |
| 15.8 | Exportar backup, Resetar e Desfazer. | O JSON tem `aparencia`. Resetar volta ao padrão; Desfazer devolve a cor e o logo. |
| 15.9 | Tela de Campeonatos → "⬇ Modelo" numa edição com jogos. | Baixa `<nome>-modelo-<data>.json` com `tipo: "modelo-copa-fifa-duplas"`, `versao`, `campeonato` (nome, config, jogadores) e `aparencia`; sem jogos, calendário nem desfazer. |
| 15.10 | "Novo a partir de modelo" e escolher o modelo. Repetir pelo "Campeonato → Importar backup". | Abre o seletor de arquivo. Sem a janela de escolha: edição nova aberta no passo Configuração, com os jogadores, a configuração, a cor e o logo do modelo, cadastro livre e aviso "Campeonato criado a partir do modelo: ...". O importar reconhece o modelo do mesmo jeito. |
| 15.11 | Modelo com `versao: 99` (ou um JSON qualquer com `tipo` de modelo e sem `campeonato`). | Erro "Não foi possível usar o modelo: ..."; nenhuma edição criada, a aberta não muda. |
| 15.12 | Duplicar uma edição com cor e logo. | A cópia tem a mesma cor e o mesmo logo. |
| 15.13 | Aba Jogadores e cabeçalho com logo em ~400 px e no tema escuro. | O bloco "Aparência" quebra a linha sem rolagem horizontal; o logo não empurra os botões do cabeçalho para fora; legível no escuro. |

## 16. Nível dos jogadores (estrelas) e sorteio equilibrado

| # | Passos | Esperado |
|---|---|---|
| 16.1 | Adicionar 32 jogadores. | Cada um aparece com 5 estrelas vazias e o nome destacado em âmbar; o resumo diz "32 sem estrelas"; a legenda explica que as estrelas só servem ao sorteio e só o organizador vê. |
| 16.2 | Com estrelas faltando, ver o diagnóstico (passo Jogadores) e o passo Sorteio. | Aviso "Defina as estrelas ... de N jogadores: ..." (até 5 nomes); sem "Combinação válida"; botão "Sortear calendário" desabilitado. |
| 16.3 | Clicar na 4ª estrela de um jogador; depois Desfazer. | 4 estrelas cheias, a 4ª com `aria-pressed="true"`; Desfazer volta ao estado anterior ("estrelas de X: 4"). |
| 16.4 | Só com o teclado: Tab até as estrelas, Enter/Espaço. | Foco visível em cada estrela; Enter define o nível e o foco continua na estrela. |
| 16.5 | Definir as estrelas de todos e sortear. | O botão mostra "Sorteando…" e sai do ar enquanto calcula (~1 s). Nomes com `★N` no calendário; jogos com diferença mostram "Δ N" (destaque a partir de 2, fora do aceitável). Linha "Equilíbrio por nível: X de Y jogo(s) aceitáveis (diferença de até 1 estrela; Z sem diferença)... Maior saldo de estrelas...". Regulamento respeitado. |
| 16.5b | Trocar jogadores à mão até um jogo ficar com diferença 2 ou mais. | Δ desse jogo destacado; a linha de equilíbrio fica em alerta e passa a dizer "N fora do aceitável (maior diferença: ...)". |
| 16.6 | Trocar um jogador à mão por outro de nível bem diferente. | O seletor mostra `★N` ao lado de cada nome. Depois da troca, o Δ do jogo e a linha de equilíbrio mudam na hora. |
| 16.7 | Com o rascunho aberto, mudar as estrelas de alguém na aba Jogadores e voltar. | O rascunho continua (não é descartado); Δ e equilíbrio refletem o novo nível. |
| 16.8 | Confirmar o calendário. | Em Ajustes, nos Jogadores as estrelas ficam só para ver (sem botões); no Sorteio do calendário, `★N` e Δ continuam. |
| 16.9 | Telão (todas as telas), PNG da classificação e do mata-mata, aba Rodadas e Classificação. | Nenhuma estrela nem Δ em lugar nenhum. |
| 16.10 | Importar um backup de antes das estrelas (jogadores sem `estrelas`), com o calendário confirmado. | Abre normalmente; na aba Jogadores, estrelas vazias (só para ver) e nomes em âmbar. No Calendário, sem `★N` nem Δ, e a linha "Equilíbrio por nível: não avaliado (o calendário foi confirmado sem as estrelas...)". Sem calendário confirmado, o resumo diz "N sem estrelas" e o sorteio pede para defini-las. |
| 16.11 | Aba Jogadores e Calendário em ~400 px e no tema escuro. | Estrelas legíveis (cheias em âmbar, vazias em cinza) e sem rolagem horizontal. |

## 17. Ficha do jogador

| # | Passos | Esperado |
|---|---|---|
| 17.1 | Com 7 semanas lançadas, clicar no nome de um jogador "Em disputa" na Classificação. | Abre uma janela à direita, com o fundo escurecido. Título com o nome e foco nele. "Classificação ao vivo: dentro/fora do top 8." Posição, pontos, saldo, V / E / D e "Jogos: N de 6" iguais aos da linha da tabela. |
| 17.2 | Na mesma ficha, ver "Situação para o top 8" e "Jogos". | A situação é igual à da coluna (ícone, "Próximo: Semana 8 · Jogo N", "depende do saldo/desempate"). Um jogo por linha do calendário, na ordem: "Semana 3 · Jogo 1", resultado ("vitória 2×1", "derrota 1×3", "empate", "anulado", "pendente", "(W.O.)") e "com Parceiro × Adversário + Adversário". |
| 17.3 | Fechar com Esc; abrir de novo e fechar com o X; abrir de novo e clicar no fundo escurecido. | Fecha nas três formas; o foco volta ao nome clicado. |
| 17.4 | Na ficha, clicar no nome do parceiro; depois fechar. | A ficha passa a ser a do parceiro, sem fechar; ao fechar, o foco volta ao nome clicado primeiro. |
| 17.5 | Na ficha, clicar em "Semana 4 · Jogo N". | A ficha fecha, abre a aba Rodadas na semana 4 e o foco fica no botão "S4". |
| 17.6 | Com até a semana 1 lançada, abrir uma ficha. | Situação: "Disponível quando faltarem até 8 jogos (faltam 42)." |
| 17.7 | Com a ficha aberta, lançar um placar dela em outra janela (ou no telão). | A ficha aberta mostra os números novos sem fechar. |
| 17.8 | Mata-mata decidido: abrir a ficha pelo pódio (campeão e vice) e pela prévia/confrontos. | Seção "Fase final" com a conquista ("Campeão", "Vice-campeão", "3º lugar") e um item por confronto: "Semifinal 1: vitória 1×1 nos pênaltis", "Final: vitória série 2×1". Quem ficou fora do top 8 não tem a seção. |
| 17.9 | Telão e PNGs. | Nenhum nome vira botão; nada muda. |
| 17.10 | Ficha em ~400 px e no tema escuro; só com o teclado (Tab até um nome, Enter, Tab pela ficha, Esc). | A ficha ocupa a largura toda, sem rolagem lateral, legível no escuro; o foco não sai da ficha enquanto ela está aberta e volta ao nome no Esc. |

---

## Última execução

**Fase 27 (janela de escolha das telas do telão), 2026-10-19**, Playwright (Chromium) por um servidor local
temporário, antes do commit da fase. Massa: 16 jogadores fictícios, 15 de 24 jogos lançados, semana 6.

- `testes.html`: 124 passaram, 0 falharam (F6.3 e F6.4 novos). `testes-telas.html`: 71 passaram, 0 falharam (V14.1 e V14.2 novos).
- **Conferido no app real:**
  - 11.1: a janela abre com foco em "Abrir telão", Classificação e Jogos marcados, Mata-mata desabilitado com o motivo e 15 s.
  - 11.1c: com só "Jogos da semana" e 30 s, o telão abre só nela; Esc fecha; a janela volta com a mesma escolha; Shift+clique abre direto sem janela; `index.html#telao` lê a escolha guardada.
  - 11.1d: "Abrir em nova janela" chama `window.open("index.html#telao", ...)` e não abre o telão na janela atual (com `window.open` interceptado).
- **Cobertos só pelos testes automáticos:** 11.1b (nenhuma tela marcada, Cancelar e Esc) e a tela indisponível ignorada.
- **Ainda não conferidos à mão:** tela cheia pelo clique de verdade (o Playwright usa cliques sintéticos, e o navegador recusa `requestFullscreen`; o código já trata isso), a nova janela de verdade (e o aviso de janela bloqueada), a atualização de um telão já aberto em outra janela quando a escolha muda (11.5), e Lighthouse.

---

**Conferência da Fase 26 e ajuste do W.O. no PNG, 2026-10-19**, Playwright (Chromium) por um servidor local
temporário. Massa: 32 jogadores fictícios com os 48 jogos lançados e o chaveamento gerado pela tela.

- `testes.html`: 122 passaram, 0 falharam. `testes-telas.html`: 69 passaram, 0 falharam.
- **Passaram, com a janela de confirmação de verdade:**
  - 7.20: "Cancelar" no painel e na janela não muda o estado.
  - 7.21: substituir (o ausente sai, o próximo da tabela entra, dupla "alterada manualmente").
  - 7.22: "Dar W.O. a esta dupla?" com o botão vermelho; "Decidido por W.O.", marca "W.O.", "avança", campos de placar somem.
  - 7.23: "Desfazer W.O." devolve os campos; W.O. na final (MD3) e no 3º lugar, pódio sem placar; com placar na final, "W.O. da dupla N" fica desabilitado com "Final já tem placar lançado"; com a série decidida, não há "Ausência".
  - 7.24: ficha com "derrota por W.O." e "vitória por W.O."; PNG baixado (interceptado) com "W.O." e "–" e a linha "a dupla 2 avança sem placar".
- **Defeito achado e corrigido:** no PNG do mata-mata o "W.O." passava da faixa do vencedor e encostava na borda do cartão (centro em `x + w − 40` com fonte 36). Agora valores de texto usam fonte 26 e centro em `x + w − 48`. Novo trecho no caso MM15 de `testes.html`: com o código antigo falhava ("termina a 0 px da borda"); com o novo passa ("19 px", mínimo 14).
- **Ainda não conferidos à mão:** backup exportado e importado em 7.19 e Lighthouse. Cobertos só pelos testes automáticos.
- `docs/print.png` refeito com a interface atual (16 jogadores fictícios, 15 de 24 jogos, semana 6).
- Dica: o Playwright guarda `testes.html` e os `.js` em cache; abrir com `?v=N` e, se preciso, `fetch(arquivo, { cache: "reload" })` antes, senão o teste novo ou o código novo não aparece.

---

**Fase 26 (ausência no mata-mata), 2026-10-18**, Edge sem cabeça (`testes.html` e `testes-telas.html`) e
Playwright (Chromium) por um servidor local temporário, antes do commit da fase.

- `testes.html`: 122 passaram, 0 falharam (MM11 a MM15 novos). `testes-telas.html`: 69 passaram, 0 falharam
  (V13.1 a V13.5 novos; neles a janela de confirmação é respondida pelo teste).
- **Conferido no navegador com a janela de confirmação de verdade:** 7.18 (marcar ausente, "Entram no lugar",
  foco no seletor), 7.19 (gerar com ausente, sem ele em nenhum confronto), 7.21 (substituir), 7.22 (W.O. com a
  marca, "avança", campos de placar sumindo e a final com a dupla que avançou) e o telão com "W.O." (7.24, só o telão).
- **Ainda não conferidos à mão:** 7.20 (cancelar), 7.23 (desfazer W.O. na tela e W.O. na final/3º lugar), PNG baixado e
  ficha em 7.24, backup exportado/importado em 7.19 e Lighthouse. Cobertos só pelos testes automáticos.

---

**Fase 22 (ficha do jogador), 2026-10-13**, Playwright (Chromium 155) e Lighthouse (Chrome DevTools) via
servidor local, antes do commit da fase. Massa: 32 jogadores fictícios com calendário confirmado e 7 semanas
lançadas; depois, todos os jogos lançados e o mata-mata decidido (semi 1 nos pênaltis, final 2×1).

- `testes.html`: 101 passaram, 0 falharam. `testes-telas.html`: 52 passaram, 0 falharam (V9.1 a V9.7 novos;
  a verificação de "null" no texto ficou mais rígida e o executor aceita casos assíncronos).
- **Lighthouse (acessibilidade, modo snapshot):** 100 em Rodadas, Classificação, Mata-mata (prévia e
  decidido) e com a ficha aberta (fase de grupos e fase final), nos temas claro e escuro.
- **Passaram:** 17.1, 17.2, 17.3 (Esc com tecla de verdade), 17.5 (foco em "S4"), 17.8 e 17.10 (400 px no
  escuro, 1920 px sem rolagem lateral).
- **Ajustado antes do commit:** a ficha sem fase final mostrava um "null" solto; o quadro "Jogos" ficava
  sozinho numa segunda linha; o botão "Semana N · Jogo M" da ficha e os nomes empilhados nos cartões tinham
  menos de 24 px de altura (alvo de clique).
- **Visto uma vez, sem reproduzir:** numa sequência Esc → Enter → tema escuro → 400 px, a ficha apareceu
  fechada na semana 2 das Rodadas, como se "Semana 2 · Jogo 6" tivesse sido clicado. Refeito três vezes
  (inclusive desde o carregamento), não se repetiu.
- **Falta:** o caso 1.1 (duplo clique, `file://`), 17.7 com duas janelas, o passeio completo só com o teclado e
  o roteiro completo.

**Fase 21 (Rodadas, Classificação e Mata-mata enxutas), 2026-10-13**, Playwright (Chromium) e Lighthouse
(Chrome DevTools) via servidor local, antes do commit da fase. Massa: 32 jogadores fictícios com calendário
confirmado e 7 semanas lançadas (6 pendentes).

- `testes.html`: 101 passaram, 0 falharam. `testes-telas.html`: 45 passaram, 0 falharam (V8.1 a V8.7 novos;
  V1.5, V2.5 e V4.4 passaram a olhar a coluna Situação).
- **Lighthouse (acessibilidade, modo snapshot):** 100 em Rodadas, Classificação (com a coluna Situação) e
  Mata-mata (chaveamento gerado), nos temas claro e escuro.
- **Passaram:** 1b.10 (ao vivo e "após a semana 3", com `-semana-3` no nome), 4.1 a 4.3 e 4.9 (W.O. com os
  nomes; status "W.O. – dupla 1 presente (3×0)"), 6.4, 6.6 e 6.9 (com 6 pendentes: "Situação: 6 jogos
  pendentes, 4.096 cenários.", 3 garantidos, 16 em disputa e 13 eliminados, igual a `Regras.calcularSituacoes`),
  7.16 (chaveamento ainda sem placares) e 7.17, 10.1 (download interceptado), 13.1 (sem
  rolagem horizontal em 400 e 1920 px nas três abas). Console sem erros do app (só o `favicon.ico` que o
  servidor do Python não tem).
- **Ajustado antes do commit:** o ponto da semana em andamento encostava no "S1"; na coluna Situação, o
  próximo jogo e "depende do saldo" ficavam em três linhas e passaram a dividir uma linha.
- **Falta:** o caso 1.1 (duplo clique, `file://`), o passeio só com o teclado (13.2) e o roteiro completo.

**Fase 18 (base visual e acessível), 2026-10-13**, Playwright (Chromium) e Lighthouse (Chrome DevTools)
via servidor local, antes do commit da fase. Massa: 32 jogadores fictícios com calendário confirmado e 3 (ou 7)
semanas lançadas.

- `testes.html`: 101 passaram, 0 falharam (casos U1 a U6 novos). `testes-telas.html`: 26 passaram, 0 falharam
  (V3.3, V4.1 a V4.4 e V5.1 a V5.5 novos).
- **Lighthouse (acessibilidade, modo snapshot):** 100 nas abas Jogadores, Calendário, Rodadas, Classificação
  (com "O que está em jogo"), Mata-mata (prévia) e na tela de Campeonatos, nos temas claro e escuro. A
  primeira passada deu 97 em Jogadores: o verde `--sobe` do tema claro tinha contraste 4,41 com o branco; foi
  escurecido para `#187a33` (5,4).
- **Passaram:** 1b.4 (Alt+4 troca de aba; a tecla 1 sozinha não troca mais), 4.7 e 13.8 (placar "x": mensagem
  embaixo do placar, nenhum aviso), 13.1 (sem rolagem horizontal em 400 e 1920 px em todas as abas), 13.4
  (sucesso some em 5 s; erro de importação continua depois de 6 s, não empilha e fecha no botão), 13.6 (tema
  escuro), 13.9 (primeiro Tab = "Pular para o conteúdo"; Enter foca o conteúdo e o endereço continua `#jogadores`),
  telão sem mudança.
- **Problema achado e corrigido:** em 400 px todas as abas rolavam ~158 px para o lado. O texto escondido para
  o leitor de tela (`.so-leitor`, `position: absolute`) dos indicadores das abas escapava da lista rolável;
  o botão da aba e a tabela rolável passaram a ser `position: relative`.
- **Falta à mão:** o caso 1.1 (duplo clique, `file://`) e um passeio só com o teclado pelas telas (13.2).

**Fase 17 (telas testáveis, sem mudança visível), 2026-10-13**, Playwright (Chromium) via servidor local, antes
do commit da fase.

- `testes.html`: 95 passaram, 0 falharam. `testes-telas.html` (novo): 16 passaram, 0 falharam (V1 a V3).
- **Comparação com a versão anterior:** a mesma sequência de 102 passos rodou na versão do último commit
  (servida em outra porta) e na nova, com `Math.random` e a data fixos. Os passos foram: app vazio em
  cada aba, cadastro, renomear, estrelas, cor e logo, sorteio, troca e confirmação, placar com Enter e com
  Tab, inválido, W.O., anular, limpar, semanas, agenda, teclas 3/4 e Ctrl+Z, os 48 jogos (com a classificação
  em 5 pendentes), semana e desempate na classificação, mata-mata completo com prorrogação, pênaltis e final
  MD3, telão, backup, resetar e desfazer, seletor e tela de Campeonatos, e as abas em 400 e 1920 px. As 102
  telas saíram idênticas: HTML do conteúdo, abas, cabeçalho, avisos, janelas, telão, foco e downloads. O
  foco depois de cada Enter (placar, mata-mata, renomear) foi o mesmo, e não houve rolagem horizontal.
- **Observação:** um único `ERR_CONNECTION_REFUSED` no console da versão nova, que não se repetiu em mais
  três aberturas. Todos os arquivos do app voltaram com 200, e o pedido do `favicon.ico` não chegou ao
  servidor. Provavelmente o servidor do Python recusou o pedido do ícone por receber muitos pedidos ao mesmo tempo.

**Fase 16 (nível dos jogadores), 2026-10-10**, Playwright (Chromium) via servidor local, antes do commit da
fase. Partindo do app vazio, com 32 jogadores fictícios (6×1, 6×2, 8×3, 6×4, 6×5 estrelas).

- `testes.html`: 95 passaram, 0 falharam (inclui L1 a L5; S2 agora aceita até 10 pares de adversários
  repetidos, o preço dos jogos equilibrados).
- **Passaram:** 16.1 a 16.11 (16.4 com a tecla Enter de verdade; 16.11 em 400 px e no tema escuro). Sorteio
  em ~1 s, com 28 jogos sem diferença e 20 com Δ 1. Nenhuma estrela ou Δ no telão, nas rodadas, na
  classificação nem nos 335 textos desenhados no PNG. Sem erros de JavaScript (só o 404 do `favicon.ico`).
- **Falharam e foram corrigidos na hora:**
  - Aviso de estrelas faltando terminava em "....": agora "... e mais N."
  - Backup antigo com calendário confirmado mostrava "★?" em todos os nomes e mandava definir estrelas que já
    estavam travadas. Agora não mostra marca e diz "não avaliado".
  - Em 400 px, os cartões das semanas do Calendário passavam ~7 px da borda (problema antigo: a grade exigia
    340 px). Agora a coluna mínima respeita a largura disponível.
- **Regra ajustada no mesmo dia (decisão do organizador):** saiu "sem duplas extremas"; vale "jogo aceitável =
  diferença de até 1 estrela" (5+5 × 5+4 e 2+2 × 2+1 são aceitáveis; 5+5 × 4+4 não). Refeitos 16.5 e o novo
  16.5b: sorteio com 48 de 48 jogos aceitáveis (34 sem diferença); uma troca à mão que deixou um jogo com
  Δ 2 destacou o jogo e pôs a linha de equilíbrio em alerta ("1 fora do aceitável"). Análise de 40 sorteios
  (grupo misto e grupo forte): nenhum jogo fora do aceitável em 1.920.
- **Observação:** depois de mudar os `.js`, o cache do servidor do Python serviu o `regras.js` antigo com o
  `jogadores.js` novo (erro "jogadoresSemEstrelas is not a function"). Antes de testar, rebuscar os arquivos
  com `fetch(arquivo, { cache: "reload" })` e recarregar.

**Fase 15 (parte 1: cor/logo e modelo), 2026-10-10**, Playwright (Chromium) via servidor local, depois do commit
`f1e504e`. Partindo do app vazio, com 32 jogadores fictícios, calendário sorteado e confirmado pela tela.

- `testes.html`: 90 passaram, 0 falharam (inclui os casos A1 a A5).
- **Passaram:** 15.1 a 15.13 (15.13 em 400 px e no tema escuro). Logo de 600×300 reduzido para 256×128;
  PNGs com a faixa na cor e o logo no canto; telão volta ao fundo padrão sem recarregar. Nenhum erro de
  JavaScript no console (só o aviso de tela cheia, porque o telão foi aberto por script, sem gesto do usuário).
- **Falhou e foi corrigido na hora:** em 400 px, o campo "Nome do campeonato" passava ~19 px da borda do
  cartão (problema antigo, de antes desta fase: o rótulo ficava com a largura de 22em do campo). Agora o
  rótulo respeita a largura disponível.
- **Não executados nesta rodada:** o restante do roteiro, que não mudou.

**Fase 12, 2026-10-09**, Playwright (Chromium) via servidor local, antes do commit da fase.

- `testes.html`: 85 passaram, 0 falharam (inclui os casos E1 a E10).
- **Passaram:** 14.1 a 14.14 (14.14 em 390 px e no tema escuro), 9.6 (resetar continua igual, foco em
  "Cancelar"). Nenhum erro de JavaScript no console (só o 404 do `favicon.ico`, que o servidor do Python pede).
- **Falharam e foram corrigidos na hora:**
  - Seletor mostrava "[object HTMLButtonElement]" no lugar das edições (`replaceChildren` não achata
    listas) e o título cortava com "…" sem precisar (margem negativa no `summary`).
  - "Novo campeonato" focava o nome, mas o segundo redesenho (troca de aba) recriava o campo sem a
    seleção. Agora o redesenho devolve a seleção do campo que estava com o foco.
- **Não executados nesta rodada:** em 14.4, o lembrete de backup de cada edição (todas as edições do teste
  já tinham backup; o registro por edição é coberto pelos casos E4 e E8), e o restante do roteiro, que não mudou.

**2026-10-09**, Playwright (Chromium) via servidor local, commit `90eefdc`.

**2026-10-09**, Playwright (Chromium) via servidor local, commit `90eefdc`.

- **Passaram:** todos os casos, exceto os listados abaixo. Nenhum erro de JavaScript no console.
  "O que está em jogo" com 8 pendentes (65.536 cenários): cálculo em ~90 ms.
- **Falharam e foram corrigidos no mesmo dia** (11.6 refeito com 32, 40 e 60 jogadores de nome com
  30 caracteres, em 1920×1080 e 1280×720: tudo cabe, nada passa da borda):
  - Classificação do telão com 40 jogadores: as 2 últimas linhas de cada coluna ficavam fora da tela
    (altura de linha fixa em 4.85vh). Agora a linha encolhe conforme `--linhas` (linhas por coluna);
    até 32 jogadores nada muda.
  - Mata-mata do telão com nomes longos: as colunas passavam da borda direita (grade sem
    `minmax(0, …)`) e, ao corrigir, o pódio quebrava os nomes em várias linhas e saía por baixo.
    Agora os nomes viram "…" e o pódio mostra um jogador por linha.
  - Confirmação de troca de duplas: "Semifinal 1 e Semifinal 2 já têm placar" (antes "tem").
- **Não executados:** 1.1 (abrir por `file://`, só à mão) e 1.5 (modo avião, só à mão). Pelo Playwright,
  o carregamento fez 8 pedidos, todos locais.
- **Observações (não são falhas):**
  - Telão com 8 jogadores: as linhas esticavam para ocupar a tela inteira (~19% da altura cada).
    Corrigido depois: a tabela não estica mais, e a linha vai até 5.4vh.
  - Telão: a barra de controles cobria a última linha por 3 s depois de mexer o mouse (e o tempo
    todo com o telão pausado). Corrigido depois: os controles têm uma faixa reservada no rodapé.
  - 9.7: resetar e desfazer devolvia o campeonato, mas não o registro do backup (o lembrete
    reaparecia). Corrigido depois: desfazer o resetar ou o importar devolve o registro.
