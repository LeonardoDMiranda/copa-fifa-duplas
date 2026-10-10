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
- Exportar/importar ficam no menu "💾 Backup" e os PNGs e o Resetar no menu "⋯": abrir o menu
  (`#menu-backup > summary`, `#menu-mais > summary`) antes de clicar no item. Para importar, dá para
  mandar o arquivo direto em `#arquivo-importar` (`setInputFiles`); depois escolher na janela
  `#importar-novo` ou `#importar-substituir`.
- O seletor de campeonatos é o título do cabeçalho (`#menu-campeonatos > summary`); a tela de
  Campeonatos fica em `index.html#campeonatos`.
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
| 1b.1 | Abrir sem `#` no endereço, em cada etapa. | Abre na aba da etapa e o endereço passa a ter o `#` dela: sem cadastro pronto → Jogadores; cadastro pronto ou sorteio em rascunho → Calendário; calendário confirmado → Rodadas; chaveamento gerado → Mata-mata. |
| 1b.2 | Na aba Jogadores, cadastrar o 8º jogador (a etapa muda). | Continua na aba Jogadores: a aba só muda por escolha. |
| 1b.3 | Confirmar o calendário. | Vai sozinho para a aba Rodadas. |
| 1b.4 | Clicar nas abas; usar ← → com o foco numa aba; teclas 1 a 5 fora de campos de texto. | Troca a aba e o endereço (`#jogadores`, `#calendario`, `#rodadas`, `#classificacao`, `#mata-mata`). Digitando num campo, 1–5 não trocam de aba. Com o telão aberto também não. |
| 1b.5 | Voltar e avançar do navegador; F5. | Volta/avança entre as abas visitadas; F5 mantém a aba. |
| 1b.6 | Indicadores das abas. | Jogadores: nº de jogadores. Calendário: "rascunho" ou ✔. Rodadas: "lançados/total". Classificação: ⚖️ com empate técnico sem ordem no top 8. Mata-mata: 🏆 com campeões. |
| 1b.7 | Rodadas em tela larga (≥ 1100 px). | Jogos da semana em duas colunas e, ao lado, "Top 8 ao vivo" (até o 10º, com a linha de corte no 8º) atualizando a cada placar. "Ver classificação completa" abre a aba Classificação. |
| 1b.8 | Menus "💾 Backup" e "⋯". | Abrem por cima do conteúdo; abrir um fecha o outro; fecham ao escolher um item, ao clicar fora e com Esc (o foco volta para o botão do menu). Em ~400 px a lista ocupa a largura do cabeçalho, sem sair da tela. |
| 1b.9 | Resetar ou importar um backup. | Vai para a aba da etapa do campeonato resultante. |
| 1b.10 | "PNG da classificação" com "após a semana N" escolhido. | Na aba Classificação, exporta a semana N (`...-classificacao-semana-N-...png`); em outra aba, exporta ao vivo. |

## 2. Campeonato e jogadores

| # | Passos | Esperado |
|---|---|---|
| 2.1 | Colar 32 nomes no campo (um por linha) e clicar em "Adicionar". | Aviso "32 jogador(es) adicionado(s).", lista com 32, diagnóstico "✔ Combinação válida para sortear o calendário." |
| 2.2 | Digitar nomes e apertar Ctrl+Enter. | Adiciona igual ao botão. |
| 2.3 | Clicar em "Adicionar" com o campo vazio. | Erro "Digite ao menos um nome (um por linha)." |
| 2.4 | Adicionar um nome que já existe (inclusive com maiúsculas/minúsculas diferentes). | Erro "... não foi adicionado: Já existe um jogador chamado ..."; o nome com problema fica no campo; os outros da lista entram. |
| 2.5 | Adicionar um nome com mais de 30 caracteres. | Erro "Nome muito longo (máximo 30 caracteres)." |
| 2.6 | Renomear um jogador e salvar. | Nome muda na lista, nos jogos, na classificação e na agenda. |
| 2.7 | Renomear para um nome vazio ou repetido. | Erro e o campo continua em edição com o texto digitado. |
| 2.8 | Remover um jogador antes do sorteio. | Some da lista; o sorteio em rascunho (se houver) é descartado. |
| 2.9 | Mudar o nome do campeonato. Depois tentar deixar vazio. | O título muda. Vazio: erro "O nome do campeonato não pode ficar vazio." e volta o nome anterior. |
| 2.10 | Com 7 jogadores. | Diagnóstico "Cadastre pelo menos 8 jogadores (hoje: 7)." e "Sortear" desabilitado. |
| 2.11 | Com 31 jogadores e 6 jogos. | Diagnóstico "31 jogadores × 6 jogos = 186 vagas, e cada jogo ocupa 4: não fecha. ..." |
| 2.12 | Jogos por jogador = 9 com 8 semanas. | Diagnóstico "... 9 jogos pedem pelo menos 9 semanas (há 8)." |
| 2.13 | 8 jogadores e 8 jogos por jogador (com 8+ semanas). | Diagnóstico "Sem repetir parceiro, 8 jogadores permitem no máximo 7 jogos por jogador." |
| 2.14 | Digitar 0 ou "ab" em jogos por jogador ou semanas. | Erro "...: use um número de 1 a 99" e o valor anterior volta. O campo aceita no máximo 2 dígitos. |
| 2.15 **(R)** | Digitar no campo de nomes e apertar Ctrl+Z dentro dele. | Desfaz só o texto digitado. A lista de jogadores não muda e não aparece "Desfeito: ...". |

## 3. Sorteio e calendário

| # | Passos | Esperado |
|---|---|---|
| 3.1 | Com 32 jogadores, clicar em "🎲 Sortear calendário". | Rascunho com 8 semanas e 6 jogos por semana; botões "Sortear de novo", "Confirmar calendário" e "Descartar". |
| 3.2 | Conferir o rascunho. | Cada jogador em 6 jogos, no máximo 1 por semana, nenhum parceiro repetido. 8 jogadores descansando por semana. |
| 3.3 | "Sortear de novo". | Janela "Sortear de novo?"; aceitando, gera outro calendário; cancelando, nada muda. |
| 3.4 | Trocar um jogador num jogo do rascunho pelo seletor. | As opções dizem "(atual)", "— joga no jogo N (trocam de lugar)" ou "— descansa nesta semana". Escolhendo, o rascunho muda na hora. |
| 3.5 | Trocar um jogador por alguém que descansa na semana. | O painel mostra "⚠️ ... tem 5 jogo(s) (o esperado é 6).", "⚠️ ... tem 7 jogo(s) ..." e, se for o caso, "... são parceiros 2 vezes.". "Confirmar" abre "Confirmar o calendário?" começando com "Atenção, o calendário não respeita o regulamento: ..." e o botão de ação em vermelho. |
| 3.6 | "Descartar". | Volta para antes do sorteio. |
| 3.7 | "Confirmar calendário". | Janela "Confirmar o calendário?"; aceitando, cria os 48 jogos (`s1-j1` ...), o cadastro trava (só renomear), aparece "Reiniciar campeonato" e o app vai para a aba Rodadas. |
| 3.8 | Depois de confirmado, tentar adicionar ou remover jogador. | Campo de nomes e botões de remover não aparecem; só "Renomear". |
| 3.9 | Exportar o backup, resetar, importar e comparar o calendário. | Mesmo calendário (a semente vai no backup). |

## 4. Rodadas e lançamento de placares

| # | Passos | Esperado |
|---|---|---|
| 4.1 | Abrir a tela de jogos depois de confirmar. | Mostra a semana em andamento, contador "0/48 lançados", chips S1 a S8 e "Descansam na semana 1 (8): ...". |
| 4.2 | Navegar com ◀ ▶, pelos chips e pelo seletor de semana. | Mostra os jogos da semana escolhida. ◀ desabilitado na semana 1, ▶ na 8. |
| 4.3 **(R)** | Escolher uma semana no seletor com o mouse. | A lista muda logo após escolher, sem precisar clicar em outro lugar. |
| 4.4 | Digitar o placar: 1º campo, Enter, 2º campo, Enter. | Enter no 1º pula para o 2º; Enter no 2º lança. Cartão vira "lançado", contador "1/48 lançados". |
| 4.5 | Lançar usando Tab entre os campos. | Lança ao sair do 2º campo; o foco segue para o botão "W.O." do mesmo jogo, sem se perder no redesenho. |
| 4.6 | Digitar um placar e clicar direto num botão de outro jogo (ex.: "W.O."). | O clique funciona na primeira tentativa (o redesenho espera soltar o mouse). |
| 4.7 | Digitar "abc", "-1" ou "100". | Erro "Placar inválido no jogo ...: use números de 0 a 99." e o campo fica marcado. |
| 4.8 | Apagar um lado de um placar já lançado. | O jogo volta a ficar pendente. |
| 4.9 | W.O. → "Dupla 1". | Resultado W.O.: dupla 1 com 3×0, 3 pontos e +3 de saldo; dupla 2 com −3. "Cancelar" fecha a escolha sem lançar. |
| 4.10 | "Anular". | Jogo resolvido, mas ninguém ganha ponto, V/E/D, gol nem jogo disputado. |
| 4.11 | "Limpar" num jogo lançado. | Volta a ficar pendente. |
| 4.12 | Lançar 0×0 e 1×1. | 0×0: E+1 e 0 ponto para os 4. 1×1: E+1 e 1 ponto. |
| 4.13 | Completar uma semana. | O chip dela fica "completa"; "Ir para a semana em andamento (N)" aparece quando se olha outra semana. |
| 4.14 **(R)** | Agenda do jogador: escolher um jogador no seletor. | Aparece na hora o resumo (posição, pontos, V/E/D, SG) e os 6 jogos dele. A posição bate com a tabela de classificação. |

## 5. Classificação

| # | Passos | Esperado |
|---|---|---|
| 5.1 | Sem jogos lançados. | Todos com 0 ponto, em ordem alfabética (com acentos no lugar certo: "Érica" depois de "Davi"), sem ⚖️ porque ninguém jogou. |
| 5.2 | Lançar um jogo e conferir as linhas dos 4 jogadores. | Pontos, V/E/D, GP, GC e SG conforme a tabela de `docs/ESCOPO.md` (2.1). |
| 5.3 | Montar empates em pontos e conferir a ordem. | Pontos → vitórias → saldo → gols pró. |
| 5.4 | Top 8. | Os 8 primeiros destacados em verde. |
| 5.5 | Escolher "após a semana N" no seletor. | Mostra a tabela só com os jogos até a semana N, com o rótulo "após a semana N", sem as setas de desempate (só leitura) e ▲▼ em relação à semana anterior. Na semana 1 não há ▲▼ (não existe semana anterior). |
| 5.6 | Empate técnico (iguais em pontos, V, SG e GP) começando no top 8. | ⚖️ no grupo, setas ↑↓ e ✔ no primeiro do grupo para confirmar a ordem atual. |
| 5.7 | Usar ↑↓ no grupo empatado. | A ordem muda e fica guardada; recarregar mantém. |
| 5.8 | Lançar algo que desfaz o empate do grupo. | A ordem manual daquele grupo é descartada. |

## 6. O que está em jogo

| # | Passos | Esperado |
|---|---|---|
| 6.1 | Sem jogos. | "Ainda não há jogos." |
| 6.2 | Com mais de 8 jogos pendentes. | "Disponível quando faltarem até 8 jogos (faltam N)." |
| 6.3 **(R)** | Com 5 jogos pendentes. | "5 jogo(s) pendente(s) · 1.024 cenários" (4⁵: o anulado conta junto do 0×0). |
| 6.4 | Conferir as colunas. | Garantidos + Em disputa + Eliminados = 32. Cada jogador em uma só coluna. |
| 6.5 | Jogador garantido. | Em nenhum cenário fica fora do top 8 (conferir um caso à mão). |
| 6.6 | Jogador em disputa que depende do saldo. | Mostra "depende do saldo". |
| 6.7 | Todos os jogos lançados. | "todos os jogos lançados"; só garantidos e eliminados (ou "depende do desempate" para empate técnico sem ordem manual). |
| 6.8 | Medir o tempo com 8 pendentes. | A tela responde em menos de 1 s. |

## 7. Mata-mata

| # | Passos | Esperado |
|---|---|---|
| 7.1 | Antes de lançar todos os jogos. | "Prévia pela classificação atual" e avisos do que falta. "Gerar chaveamento" abre "Gerar o chaveamento mesmo assim?" com a lista dos avisos. |
| 7.2 | Com tudo lançado, gerar. | Semi 1 = 1º+8º × 2º+7º; Semi 2 = 3º+6º × 4º+5º. "✔ Todos os jogos lançados e nenhum empate técnico pendente no top 8." antes de gerar. |
| 7.3 | Lançar placar com vencedor numa semi. | "✔ Dupla N vence", status "Decidido". |
| 7.4 | Lançar empate numa semi. | Aparece a prorrogação; empatando nela, aparecem os pênaltis. |
| 7.5 | Pênaltis empatados. | Erro "Pênaltis não podem terminar empatados." |
| 7.6 | Final MD3. | Começa só com o jogo 1; cada jogo aparece depois do resultado do anterior; o 3º só aparece com 1×1 na série; termina com 2 vitórias ("Série: 2 × 1"). |
| 7.7 | Pódio. | 🥇 campeões e 🥈 vice saem da final; 🥉 do 3º lugar. |
| 7.8 | Trocar uma dupla à mão ("✎"), salvar e depois voltar à automática. | A dupla manual aparece; voltar restaura a dupla da classificação/semi. |
| 7.9 | Trocar uma dupla com jogador repetido ou o mesmo jogador nas duas duplas. | Erros "Os dois jogadores da dupla precisam ser diferentes." / "Um jogador não pode estar nas duas duplas do mesmo jogo." |
| 7.10 | Mudar um placar da fase de classificação depois de gerar, alterando o top 8. | Alerta "A classificação mudou depois de gerar o chaveamento ..." com "Usar duplas da classificação atual". As semis continuam com as duplas antigas até clicar. Se as semis já têm placar, abre "Trocar as duplas mesmo assim?"; ao trocar, se final/3º lugar já têm placar, aparece em seguida o alerta do 7.12. |
| 7.11 **(R)** | Final sem placar: trocar o resultado de uma semi. | A final passa a mostrar o novo vencedor sozinha, sem alerta. |
| 7.12 **(R)** | Final e 3º lugar com placar: corrigir o resultado de uma semi. | As duplas que jogaram e os placares continuam. Aparece o alerta "O resultado de uma semifinal mudou depois de lançar placares da final ou do 3º lugar ...". |
| 7.13 **(R)** | No caso 7.12, clicar em "Usar duplas que saem das semis". | Janela "Trocar as duplas mesmo assim?" ("... já tem placar lançado. Os placares continuam e passam a valer para as novas duplas."). Aceitando, troca as duplas e mantém os placares; o alerta some. "Desfazer" volta ao estado anterior. |
| 7.14 | Resultados do mata-mata. | A classificação não muda. |
| 7.15 | "Apagar chaveamento". | Janela "Apagar o chaveamento?"; aceitando, apaga tudo do mata-mata; "Desfazer" traz de volta. |

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
| 9.1 | Com jogos e sem backup. | Lembrete "💾 Você ainda não exportou nenhum backup deste campeonato." com "Exportar backup agora" e "Dispensar". |
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
| 9.14 | "Reiniciar campeonato" (no cadastro travado). | Mesmo comportamento do "Resetar". |

## 10. Imagens (PNG)

| # | Passos | Esperado |
|---|---|---|
| 10.1 | "PNG da classificação". | Baixa a imagem; aviso "Imagem baixada: ...". Imagem legível, top 8 destacado, todos os jogadores. |
| 10.2 | PNG da classificação com 8 e com 40 jogadores. | As linhas cabem; nomes de 30 caracteres não cortam. |
| 10.3 | "PNG do mata-mata" sem chaveamento. | Aviso "Gere o chaveamento antes de exportar o mata-mata." |
| 10.4 | "PNG do mata-mata" com prorrogação, pênaltis e final MD3. | Mostra os placares extras e o pódio. |

## 11. Modo telão

| # | Passos | Esperado |
|---|---|---|
| 11.1 | Clicar em "Modo telão". | Abre em tela cheia com a classificação. |
| 11.2 | Esperar 15 s. | Passa para a próxima tela (só as que têm conteúdo: classificação; jogos depois do calendário; mata-mata depois do chaveamento). A barra de progresso avança. |
| 11.3 | Espaço, → e ←. | Pausa/continua; avança; volta. |
| 11.3b **(R)** | Mexer o mouse e pausar (a barra de controles fica visível), em cada tela. | A barra aparece na faixa do rodapé, abaixo do conteúdo: não cobre a última linha da classificação, os jogos nem o mata-mata. |
| 11.4 | Esc. | Sai do telão. Ctrl+Z não desfaz nada enquanto o telão está aberto. |
| 11.5 | Abrir `index.html#telao` numa segunda janela e lançar placares na primeira. | O telão atualiza sozinho. |
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
| 13.4 | Avisos de erro. | Aparecem com `role="alert"` e somem sozinhos (erros em 8 s, os outros em 3,5 s). |
| 13.5 | Janelas de confirmação (sortear de novo, confirmar calendário, gerar/apagar chaveamento, trocar duplas com placar, resetar). | Título com a pergunta e botão com o nome da ação. Ações perigosas: botão vermelho e foco em "Cancelar" (Enter cancela). Esc cancela. Com a janela aberta, Ctrl+Z e as teclas 1–5 não fazem nada. |
| 13.6 | Tema escuro do sistema (Windows: Configurações → Personalização → Cores → escuro). | O app inteiro fica escuro, legível, sem fundo branco sobrando (campos, menus, janelas). O telão não muda. |
| 13.7 | Telas vazias (app zerado), em cada aba. | Cada uma diz o que falta e tem um botão para a aba onde se resolve ("Ir para Jogadores", "Ir para o Calendário"). Nenhum "null" ou "undefined" na tela. Com o cadastro pronto, Jogadores mostra "Próximo: sortear o calendário →". |

## 14. Várias edições

| # | Passos | Esperado |
|---|---|---|
| 14.1 | `localStorage` só com a chave antiga `copa-fifa-duplas-campeonato` (um campeonato com jogos) e abrir o app. | Abre esse campeonato, na aba da etapa. Existem `copa-fifa-duplas-indice` e `copa-fifa-duplas-campeonato-<id>`; a chave antiga continua igual. Recarregar não cria outra edição. |
| 14.2 | Clicar no título do cabeçalho. | Abre a lista "Campeonatos" com as edições não arquivadas (a aberta com ✔ e a situação embaixo de cada nome), "+ Novo campeonato" e "⚙ Gerenciar campeonatos". Fecha ao escolher, ao clicar fora e com Esc. Nome longo não empurra os botões do cabeçalho. |
| 14.3 | "+ Novo campeonato". | Vai para a aba Jogadores com o nome "Copa FIFA em Duplas" selecionado: digitar substitui. Desfazer fica desabilitado (edição nova). |
| 14.4 | Escolher outra edição no seletor. | Carrega a edição, vai para a aba da etapa dela, aviso "Campeonato aberto: ...". O desfazer é o daquela edição. O lembrete de backup é o dela. |
| 14.5 | Telão em outra janela (`index.html#telao`) e trocar de edição na primeira. | O telão passa a mostrar a nova edição sozinho (nome no topo e rodízio de telas). |
| 14.6 | "Gerenciar campeonatos". | `#campeonatos`, nenhuma aba de etapa selecionada. Edições em uso (a aberta com a etiqueta "aberto" e sem botão Abrir) e "Arquivados"; cada uma com situação, nº de jogadores e data de criação; espaço usado no rodapé. |
| 14.7 | Duplicar uma edição com jogos. | Nova edição "Nome (2)" aberta na aba Jogadores, com os mesmos jogadores e configuração, sem calendário nem jogos, cadastro livre. Duplicar de novo: "(3)". |
| 14.8 | Arquivar uma edição (e depois a aberta). | Sai do seletor e vai para "Arquivados", sem botão Abrir. Arquivar a aberta abre a última não arquivada. Desarquivar devolve ao seletor. |
| 14.9 | Excluir uma edição. | Janela "Excluir o campeonato?" com botão vermelho e foco em "Cancelar". "⬇ Exportar backup antes" baixa o JSON dela e a janela continua aberta. "Excluir" apaga a chave dela; sem desfazer. Excluir a última cria uma edição vazia. |
| 14.10 | Exportar uma edição que não está aberta (tela de Campeonatos). | Baixa o JSON daquela edição; o registro de backup é gravado nela; a aberta não muda. |
| 14.11 | Importar um backup válido. | Janela "Importar backup" com o nome do campeonato do arquivo, "Cancelar", "Substituir o ativo" e "Importar como novo campeonato" (com o foco). "Novo": edição nova aberta na aba da etapa, sem desfazer; a anterior continua na lista. Esc ou "Cancelar": nada muda. |
| 14.12 | Importar um arquivo inválido. | Erro na hora, sem a janela de escolha; nenhuma edição criada. |
| 14.13 | Gravar texto inválido em `copa-fifa-duplas-indice` e recarregar. | Aviso "A lista de campeonatos estava inválida (...)"; as edições continuam todas no seletor; existe `copa-fifa-duplas-indice-corrompido-<data>`. |
| 14.14 | Seletor e tela de Campeonatos em ~400 px e no tema escuro. | Sem rolagem horizontal; a lista do seletor ocupa a largura do cabeçalho; legível no escuro. |

---

## Última execução

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
