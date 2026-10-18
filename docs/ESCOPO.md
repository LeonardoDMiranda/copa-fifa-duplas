# Escopo – Copa FIFA em Duplas

## 1. Objetivo

Aplicação local (HTML + CSS + JavaScript puro) para o organizador conduzir um campeonato de FIFA em duplas do começo ao fim:

1. Cadastrar os jogadores e configurar o campeonato (pontos, jogos por jogador, semanas).
2. Sortear o calendário inteiro de uma vez, ajustar à mão se precisar e confirmar.
3. Lançar os placares (ou W.O., ou anular) semana a semana.
4. Ver a classificação individual ao vivo ou ao fim de cada semana, e **o que está em jogo** (coluna "Situação": garantidos, em disputa, eliminados).
5. Gerar e conduzir o mata-mata com o número de classificados escolhido (padrão 8: semifinais, 3º lugar e final MD3).
6. Exportar imagens (PNG) para mandar no grupo e exibir tudo num **modo telão**.

Várias edições (campeonatos) ficam guardadas no app; só uma está aberta por vez.

**Fora do escopo:** login, servidor, multiusuário e sincronização online. Os dados ficam no navegador de quem usa, com backup em JSON.

## 2. Regras de negócio

Fonte única: `docs/REGULAMENTO.md`. Os valores abaixo são o padrão (`Regras.REGRAS_PADRAO`); pontos, jogos por jogador e semanas podem mudar por campeonato em `campeonato.config`.

### 2.1 Aplicar um jogo de classificação a cada jogador

Para cada jogador da dupla, somar à linha dele:

| Situação | Pontos | V/E/D | GP / GC |
|---|---|---|---|
| Dupla venceu | +3 | V+1 | + gols feitos / + gols sofridos |
| Empate com gols (≥1×1) | +1 | E+1 | idem |
| Empate 0×0 | **+0** | E+1 | +0 / +0 |
| Dupla perdeu | +0 | D+1 | idem |
| W.O. a favor | +3 | V+1 | +3 / +0 |
| W.O. contra | +0 | D+1 | +0 / +3 |
| Jogo **anulado** (ex.: W.O. das duas duplas) | +0 | nenhum | +0 / +0 |

Saldo = GP − GC. Jogo sem placar lançado não conta. Jogo anulado conta como resolvido (não fica pendente), mas não vale ponto, V/E/D, gol nem jogo disputado para ninguém.

### 2.2 Ordenação

1. Pontos (desc)
2. Vitórias (desc)
3. Saldo de gols (desc)
4. Gols pró (desc)
5. Confronto direto → 6. Sorteio

**Os critérios 5 e 6 são decididos pelo organizador**, porque o regulamento não define como aplicar confronto direto entre jogadores num campeonato em duplas:

- Jogadores empatados em todos os critérios 1 a 4 formam um **grupo de empate técnico**, marcado com ⚖️ quando começa no top 8 e alguém do grupo já jogou.
- O organizador define a ordem com as setas ↑↓. Essa ordem fica em `desempatesManuais` e só vale enquanto o grupo continuar com exatamente os mesmos jogadores.
- Sem ordem manual, vale a ordem alfabética como padrão provisório e o ⚖️ continua visível.

### 2.3 Mata-mata

- **Quantos classificados** (`config.vagasFaseFinal`): de 4 a 99, padrão 8. As duplas se formam pela classificação final: 1º + último, 2º + penúltimo... No padrão, **Semi 1 = 1º+8º × 2º+7º**, **Semi 2 = 3º+6º × 4º+5º**. Regras completas (ímpar, folgas, rodadas, 3º lugar) em `docs/REGULAMENTO.md`, "Fase final com outro número de classificados".
- **Estrutura** (`Regras.estruturaDoMataMata(formato)`): o número de duplas é `⌈vagas ÷ 2⌉`. As duplas vizinhas se enfrentam e os vencedores avançam; se o número de duplas não é potência de 2, as melhores pulam a 1ª rodada (folgas). Cada confronto tem uma chave (`semi1`, `quartas3`, `oitavas2`, `r1-4`, `final`, `terceiro`) e duas **fontes**: `{ dupla: i }` (classificação), `{ vencedor: chave }` ou `{ perdedor: chave }`. O nome da rodada vem da posição contando a partir da final (Final, Semifinais, Quartas, Oitavas, "Rodada N").
- **Número ímpar de classificados**: o jogador do meio vira uma dupla incompleta (`[id, null]`, "sem dupla"); o confronto dele não abre para placar até o organizador completar a dupla pela troca de dupla.
- **3º lugar** (`config.terceiroLugar`): perdedores das duas semifinais; só existe quando há duas semifinais. **Jogos por rodada** (`config.melhorDe`): jogo único por padrão e MD3 na final; cada rodada e o 3º lugar podem ser jogo único, melhor de 3 ou melhor de 5.
- **Formato guardado**: ao gerar o chaveamento, o formato (`vagas`, `terceiroLugar`, `melhorDe`) é copiado para `mataMata.formato`, e mudar a configuração depois não mexe nele. Com 8 vagas e a configuração padrão o `formato` é omitido: é exatamente o estado de antes da Fase 24 (`semi1`, `semi2`, `terceiro`, `final`), então backups antigos continuam valendo sem migração.
- Sem empate: cada jogo tem placar normal e, se empatar, **prorrogação** e, se ainda empatar, **pênaltis**.
- Melhor de N: termina quando uma dupla chega à maioria das vitórias (na MD3, o 3º jogo só aparece com 1×1).
- **Duplas editáveis**: qualquer dupla do mata-mata pode ser trocada à mão (a "surpresa antes da final") e voltar à dupla automática depois.
- **Duplas guardadas**: as que vêm da classificação (1ª rodada e duplas que folgam) ficam fixas desde a geração do chaveamento; as que vêm de resultados (vencedores e perdedores) ficam fixas a partir do primeiro placar lançado no confronto. Se a classificação ou o resultado de um confronto mudar depois, o app avisa e oferece trocar pelas duplas novas (os placares lançados continuam e passam a valer para elas).
- Resultados do mata-mata **não** alteram a classificação.
- Resultado final: 🥇 campeões (2 jogadores), 🥈 vice, 🥉 3º lugar.

### 2.4 O que está em jogo

Para os jogos ainda sem resultado, o app enumera todos os desfechos possíveis por jogo (vitória da dupla 1, empate com gols, 0×0, jogo anulado, vitória da dupla 2; o W.O. vale o mesmo que a vitória) e compara **pontos e vitórias** em cada cenário. Desfechos que dão os mesmos pontos e V contam uma vez só (com a pontuação padrão, o anulado é igual ao 0×0, e sobram 4). Só calcula até 65.536 cenários: com a pontuação padrão, até 8 jogos pendentes.

- **Garantido**: em todos os cenários, (jogadores à frente + empatados em pontos e V) ≤ 7.
- **Eliminado**: em todos os cenários, jogadores estritamente à frente ≥ 8.
- **Em disputa**: o resto. Se a vaga depender de saldo ou gols pró, mostra "depende do saldo".
- Se dois jogadores empatam em pontos e V e **nenhum dos dois joga mais**, o saldo e os gols pró deles já são definitivos e decidem o empate (depois, a ordem manual). Empatados em tudo e sem ordem manual: "depende do desempate".
- A ordem manual entre esses dois só vale no cenário em que ninguém que ainda joga empata com eles em pontos e V. Se alguém empata, o grupo pode mudar e a ordem manual ser descartada: "depende do saldo".
- Aparece na aba Classificação como a coluna **Situação**, só na classificação ao vivo. Quem está em disputa mostra também o próximo jogo ("Próximo: Semana 8 · Jogo 3", com "+N" se ainda joga mais) ou "Não joga mais, só pode cair".

### 2.5 Sorteio do calendário

Regras em `docs/REGULAMENTO.md` ("Sorteio do calendário"). Resumo:

- Entradas: jogadores, jogos por jogador (padrão 6) e semanas (padrão 8). Jogadores × jogos por jogador precisa ser divisível por 4.
- Obrigatório: todos com o mesmo número de jogos, no máximo 1 jogo por jogador por semana e nenhum parceiro repetido. Desejável: não repetir adversário.
- **Nível (estrelas):** cada jogador tem de 1 a 5 estrelas; o sorteio só libera com todos definidos. Desejável, além de não repetir adversário:
  - **jogo equilibrado:** diferença posição a posição, |forte − forte| + |fraco − fraco|. **Aceitável: até 1 estrela** (`Regras.DIFERENCA_ACEITAVEL`). Ex.: 5+4 × 5+4 = 0 e 5+5 × 5+4 = 1 são aceitáveis; 5+5 × 4+4 = 2 e 5+1 × 3+3 = 4 ficam fora;
  - duplas fortes (5+5) ou fracas (2+1) são normais, desde que o jogo seja parelho;
  - **saldo de estrelas** de cada jogador na temporada perto de zero.
- O sorteio minimiza um custo único (`Regras.custoDoCalendario`):
  - 1 estrela de diferença num jogo = 8;
  - jogo fora do aceitável = 8 × d² + 100;
  - adversário repetido = 12;
  - saldo = 1 por unidade ao quadrado.

  Prioridade (regulamento): o equilíbrio vem antes de evitar adversário repetido. Por isso um jogo fora do aceitável (132 com d = 2) custa mais que repetir um adversário, inclusive num 3º encontro (48). Entre um jogo com Δ 1 (8) e um adversário repetido (12), o sorteio fica com o Δ 1.

  Medido em 40 sorteios de 32 jogadores × 6 jogos × 8 semanas (grupo misto e grupo forte):
  - nenhum jogo fora do aceitável;
  - saldo de até ±3;
  - 1 a 10 pares de adversários repetidos;
  - menos de 1 s por sorteio.
- As estrelas aparecem só para o organizador (aba Jogadores e Calendário), nunca no telão, nos PNGs, nas rodadas ou na classificação. O Calendário mostra `★N` em cada nome, "Δ N" nos jogos com diferença e uma linha de equilíbrio. Tudo isso é informativo, nunca violação.
- O sorteio usa uma **semente**: a mesma semente gera o mesmo calendário. O organizador pode sortear de novo e trocar jogadores à mão antes de **confirmar**.
- Depois de confirmado, o calendário vira os jogos (`s<semana>-j<n>`) e o cadastro trava: só dá para renomear jogadores.

### 2.5.1 Remarcação de jogos

- As duplas combinam de adiar ou adiantar um jogo; o organizador muda o jogo de semana (qualquer semana de 1 a N, sem criar semana extra). Só jogo **sem resultado** (para remarcar um lançado, limpe o resultado antes).
- O jogo **mantém o id** (`s2-j3`), que é só chave interna: o número que aparece ("Semana 5 · Jogo 7") vem da posição na lista, e o jogo remarcado entra como **último** da semana de destino.
- `semanaOriginal` guarda a semana do calendário sorteado, só enquanto o jogo estiver fora dela; remarcar de volta apaga a marca. A marca "Remarcado da semana N" aparece no cartão das Rodadas, na ficha do jogador e no calendário de Ajustes.
- O jogo conta na **semana nova** em tudo: progresso por semana, semana em andamento, "Descansam", lembrete de backup e classificação "após a semana N".
- Se algum dos 4 jogadores já joga na semana de destino, o app **avisa** e deixa remarcar (a regra de 1 jogo por semana é do sorteio). A análise de qualidade do calendário em Ajustes continua avaliando o calendário **sorteado** (jogo remarcado conta na semana original).
- Regras puras em `Regras.erroDeRemarcacao`, `remarcarJogo`, `jogadoresOcupadosNaSemana` e `jogoRemarcado`; entra no desfazer como "remarcar (Semana 2 · Jogo 3) para a semana 5".

### 2.6 Backup

- Exportar/importar JSON guarda e restaura o campeonato inteiro (uma edição por arquivo).
- Importar sempre pergunta: **"Importar como novo campeonato"** (principal; entra ao lado dos outros, sem o desfazer do arquivo) ou **"Substituir o ativo"** (dá para desfazer). Arquivo inválido é recusado antes da pergunta.
- O app lembra de exportar quando já há jogos e: nunca houve backup, uma semana nova foi concluída desde o último, ou faz 7 dias ou mais.
- O registro do último backup é do campeonato: resetar apaga o registro, e importar traz o que veio no arquivo. Desfazer o resetar ou o importar devolve o registro anterior; desfazer qualquer outra ação não mexe nele.

### 2.7 Várias edições

- Cada edição é um campeonato completo (estado v2), com o seu desfazer e o seu registro de backup.
- **Novo campeonato**: edição vazia; abre na aba Jogadores com o nome selecionado.
- **Duplicar**: copia o nome com "(2)" (ou "(3)"... se já existir), a configuração, os jogadores e a aparência; sem calendário, jogos, mata-mata, desempates, desfazer nem registro de backup. Abre a cópia.
- **Abrir**: troca a edição ativa. Ela vale para todas as janelas do app no mesmo navegador: o telão acompanha (evento `storage` na chave índice).
- **Arquivar / desarquivar**: arquivada sai do seletor, vai para "Arquivados" e perde o histórico do desfazer (para poupar espaço). Não abre sem desarquivar.
- **Excluir**: janela vermelha com "Exportar backup antes" ao lado. Sem desfazer e sem lixeira.
- Arquivar ou excluir a edição ativa abre a última não arquivada; se não sobrar nenhuma, cria uma vazia.
- A tela de Campeonatos mostra o espaço usado pelo app no navegador (referência de ~5 MB).
- **Modelo**: arquivo `…-modelo-<data>.json` com nome, configuração, jogadores e aparência de uma edição (sem calendário nem jogos), para começar outra edição igual ou passar a outro organizador. **"+ Novo a partir de modelo"** (ou o "Importar backup", que reconhece o tipo do arquivo) cria uma edição nova e a abre na aba Jogadores, com o cadastro livre. Modelo inválido é recusado sem mudar nada.

### 2.8 Aparência

- Cada edição pode ter uma **cor** e um **logo**, usados no cabeçalho, no telão (fundo escurecido a partir da cor) e nos PNGs. Sem eles, vale o azul padrão.
- A cor precisa ter contraste de pelo menos 4,5:1 com o texto branco (WCAG AA); cor clara demais é recusada com aviso.
- O logo (PNG, JPG ou WebP) é reduzido para caber em 256×128 e guardado na edição como data URL (até ~80 mil caracteres). SVG não é aceito.
- Como o registro do backup, a aparência fica **fora do desfazer** (o logo repetido em cada passo do histórico ocuparia espaço demais), mas é do campeonato: vai no backup, resetar volta ao padrão, importar traz a do arquivo, e desfazer o resetar ou o importar devolve a anterior.

## 3. Modelo de dados (estado salvo no `localStorage`)

```js
// copa-fifa-duplas-indice: quais edições existem e qual está aberta
{ ativo: "<id>", campeonatos: [ { id, criadoEm, arquivado } ] }   // na ordem de criação

// copa-fifa-duplas-campeonato-<id>: uma chave por edição
{
  versao: 2,
  campeonato: {
    nome: "Copa FIFA em Duplas",
    config: { pontosVitoria, pontosEmpate, pontosEmpateSemGols, vagasFaseFinal, terceiroLugar, melhorDe: { <rodada>: 1|3|5 }, jogosPorJogador, semanas },
    jogadores: [ { id, nome, estrelas: 1..5 | null } ],   // null = nível ainda não definido
    sorteio: null | { semente, confirmado, rascunho?: [ { semana, dupla1, dupla2 } ] }
  },
  jogos: [ { id, semana, semanaOriginal?, dupla1: [id, id], dupla2: [id, id],   // semanaOriginal: só se remarcado
             resultado: null | { tipo: "placar", gols1, gols2 } | { tipo: "wo", vencedor: 1 | 2 } | { tipo: "anulado" } } ],
  desempatesManuais: [ { jogadores: [id, ...] } ],
  mataMata: null | { formato?, <chave>: confronto, ... },   // chaves: semi1, semi2, terceiro, final (padrão) ou quartas1..., oitavas1..., r1-1... (ver 2.3)
                                                           // formato?: { vagas, terceiroLugar, melhorDe } só quando foge do padrão (8 vagas)
                                                           // confronto: { dupla1, dupla2, duplaManual1?, duplaManual2?, partidas: [Partida] }; dupla pode ser [id, null] (sem parceiro)
  ultimoBackup: null | { em, semanasCompletas },
  aparencia: null | { cor: "#rrggbb" | null, logo: "data:image/...;base64,..." | null },
  historico: [ /* até 30 estados anteriores para o "desfazer" */ ]
}
// Partida = { gols1, gols2, prorrogacao1?, prorrogacao2?, penaltis1?, penaltis2? }
```

A classificação **nunca** é salva: é sempre calculada a partir dos jogadores (base zerada) + jogos com resultado.

Nome e situação de cada edição ("cadastro", "semana 5 de 8", "fase final", "🏆 campeões") são lidos da própria edição (`Regras.situacaoDoCampeonato`), não do índice.

**Migração:** na primeira abertura sem índice, o campeonato da chave de antes (`copa-fifa-duplas-campeonato`) vira a primeira edição; a chave antiga fica intacta. Índice corrompido é guardado à parte (`copa-fifa-duplas-indice-corrompido-<data>`) e refeito a partir das chaves das edições.

## 4. Telas

Uma aba por etapa (Alt+1, Alt+2...; a aba ativa fica no endereço, ex.: `index.html#rodadas`). Sem `#`, abre na aba da etapa do campeonato; depois a aba só muda por escolha do organizador (e ao confirmar o calendário, que leva a Rodadas). As abas dependem da fase (`js/abas.js`):

**Preparação** (calendário ainda não confirmado), em 3 passos numerados, cada um com o seu indicador de completo:

1. **Configuração** (`#configuracao`): nome, jogos por jogador, semanas, aparência (cor e logo), **fase final** (classificados, disputa de 3º lugar e jogos de cada rodada; editável até o chaveamento ser gerado, sem refazer o sorteio) e a conta "N jogadores × J jogos ÷ 4 = ...".
2. **Jogadores** (`#jogadores`): diagnóstico do cadastro e cadastro (um nome por linha; renomear, remover e nível de 1 a 5 estrelas).
3. **Sorteio** (`#sorteio`): sortear, conferir as restrições e o equilíbrio por nível, trocar jogadores à mão e confirmar.

**Temporada** (calendário confirmado):

4. **Rodadas**: navegação por semana (◀ S1…Sn ▶, com o progresso na cor de cada botão, e "Semana atual"), cartões dos jogos com placar, "W.O." (escolhendo a dupla presente pelos nomes), "Anular", "Remarcar" (escolhe a semana no próprio cartão, com aviso se alguém já joga nela; ver 2.5.1) e "Limpar"; quem descansa na semana; top 8 ao vivo ao lado.
5. **Classificação**: ao vivo ou ao fim de uma semana, na largura toda; top 8 em verde, ▲▼ em relação à semana anterior, empate técnico com controle de ordem manual; explicação em "Como ler". Ao vivo, com até 8 jogos pendentes (pontuação padrão), a coluna **Situação** (ver 2.4); antes disso, uma linha diz quando ela aparece. "Baixar imagem" gera o PNG da classificação vista (ao vivo ou da semana escolhida).
6. **Mata-mata**: prévia (1ª rodada e quem folga) e, depois de gerado, uma coluna por rodada (a final leva o 3º lugar embaixo) e o pódio; placares com prorrogação e pênaltis, troca de duplas e aviso de jogador sem dupla. Com o chaveamento gerado, "Baixar imagem" gera o PNG do mata-mata.
7. **Ajustes** (`#campeonato`): Configuração, Jogadores e o calendário completo, só para ver (o nome, a aparência e o renomear continuam editáveis), e a **zona de perigo** com "Reiniciar campeonato". Os endereços dos passos da preparação (e o antigo `#calendario`) levam para cá depois da confirmação.

**Ficha do jogador** (`js/telas/ficha.js`): o nome de cada jogador nas Rodadas (cartões, "Descansam" e top 8), na Classificação e no Mata-mata (prévia, confrontos e pódio) abre uma janela lateral. Ela mostra os números ao vivo (posição, pontos, saldo, V/E/D e jogos disputados), a situação para o top 8 (como na coluna, ou quando ela fica disponível), a fase final de quem entrou no chaveamento (conquista e resultado de cada confronto) e todos os jogos do calendário, com parceiro, adversários e resultado. O nome do parceiro ou de um adversário troca a ficha; "Semana N · Jogo M" leva àquela semana nas Rodadas. Esc, o X ou um clique fora fecham, e o foco volta ao nome clicado. Os números são sempre os ao vivo, mesmo com a Classificação "após a semana N". O telão e os PNGs não mudam.

**Campeonatos** (`index.html#campeonatos`, fora das abas de etapa): edições em uso e arquivadas, em cartões com Abrir (ou Desarquivar) à vista e um menu ⋯ com Duplicar, Exportar backup, Exportar modelo, Arquivar e Excluir; a aberta fica destacada; "Novo campeonato" e "Novo a partir de modelo"; espaço usado, em barra.

**Cabeçalho**: na cor do campeonato, com o logo ao lado do título. O botão "Trocar" abre o seletor de campeonatos (edições não arquivadas, "+ Novo campeonato" e "Gerenciar campeonatos"). Desfazer, Modo telão e o menu "Campeonato" (exportar e importar o backup em JSON, Gerenciar campeonatos). Lembrete de backup quando for a hora. Os PNGs saíram do cabeçalho na Fase 19 e ficam, desde a Fase 21, no botão "Baixar imagem" da Classificação e do Mata-mata. O Reiniciar campeonato está na zona de perigo da aba Ajustes (Fase 20).

## 5. Como o projeto foi construído

O app foi feito em fases pequenas, cada uma com testes em `testes.html`:

| Fase | O que entrou |
|---|---|
| 1 a 4 | Classificação, lançamento de jogos com desfazer e backup, mata-mata e "o que está em jogo" |
| 5 e 6 | Exportar PNG e modo telão |
| 7 | Jogo anulado e núcleo configurável (pontos, jogos por jogador, semanas) |
| 8 | Cadastro de jogadores, sorteio do calendário, rodadas por semana, classificação por semana e lembrete de backup |
| 9 | Código da interface dividido em um arquivo por tela (`js/telas/`), sem mudança para o usuário |
| 10 | Navegação por abas, top 8 ao vivo nas rodadas e cabeçalho com menus |
| 11 | Janelas de confirmação próprias, tema escuro (segue o sistema), telas vazias com o próximo passo e foco visível |
| 12 | Várias edições: seletor no cabeçalho, tela de Campeonatos (novo, duplicar, arquivar, excluir), importar como novo e migração automática |
| 15 (parte 1) | Aparência por edição (cor e logo no cabeçalho, telão e PNGs) e modelo de campeonato (exportar e criar edição a partir dele) |
| 16 | Nível dos jogadores (1 a 5 estrelas) e sorteio equilibrado por nível |
| 17 | Cada tela monta o próprio conteúdo (sem mudança visível) e testes das telas (`testes-telas.html`) |
| 18 | Base visual e acessível: ícones SVG no lugar dos emojis, tokens de espaçamento e fonte, botões de 28 px, contraste do tema escuro, avisos que se fecham, erro junto do campo, plurais, "Semana 3 · Jogo 2" no lugar do id e atalhos Alt+1…5 |
| 19 | Cabeçalho novo (título simples, botão "Trocar", menu "Campeonato") e tela de Campeonatos com cartões e menu ⋯ por edição |
| 20 | Preparação em 3 passos (Configuração, Jogadores e Sorteio) e, depois de confirmar o calendário, abas Rodadas, Classificação, Mata-mata e Ajustes (os 3 passos só para ver, mais a zona de perigo com o Reiniciar). Lógica das abas em `js/abas.js` |
| 21 | Rodadas com a navegação ◀ S1…Sn ▶ e "Semana atual" (sai o seletor de semana), W.O. com os nomes das duplas e título em cada cartão; Classificação na largura toda, com a coluna "Situação" no lugar do painel "O que está em jogo" e "Como ler"; "Baixar imagem" na Classificação e no Mata-mata |
| 22 | Ficha do jogador: janela lateral aberta pelo nome (Rodadas, top 8, Classificação e Mata-mata), com números ao vivo, situação, fase final e todos os jogos. Sai a "Agenda do jogador" das Rodadas |
| 23 | Remarcação de jogos: botão "Remarcar" no cartão (semana de 1 a N, aviso de conflito), marca "Remarcado da semana N" nas Rodadas, na ficha e nos Ajustes; `semanaOriginal` no jogo e regras em `Regras.remarcarJogo` |
| 24 | Mata-mata com qualquer número de classificados (4 a 99): estrutura por rodadas com folgas, jogador sem dupla com número ímpar, 3º lugar e jogos por rodada configuráveis, formato guardado no chaveamento; "Top N" nos textos, PNG e telão acompanham as vagas |

A numeração segue o plano de melhorias do organizador, não a ordem de entrega: por isso a 15 vem antes da 13 e da 14.

Novas fases seguem o mesmo jeito: uma mudança pequena por vez, com caso de teste novo ou ajustado.

## 6. Testes (`testes.html`)

Abrir no navegador: a página roda todos os casos e mostra quantos passaram. Os casos usam a fixture `testes/dados-exemplo.js` (32 jogadores fictícios e 7 jogos) e cobrem:

| Prefixo | Assunto |
|---|---|
| 1 a 10 | Pontuação, desempates, empate técnico, mata-mata e "o que está em jogo" |
| F2 a F7 | Persistência, desfazer, importação, mata-mata, PNG, telão e jogo anulado |
| N | Configuração do campeonato e estado inicial vazio |
| C | Cadastro de jogadores |
| S | Sorteio e confirmação do calendário |
| R | Rodadas e classificação por semana |
| MM | Mata-mata com N classificados: estrutura (rodadas, chaves, fontes), folgas, duplas com número ímpar, jogos por rodada e 3º lugar, duplas guardadas, salvar/importar (inclusive o formato de antes), PNG e telão |
| M | Remarcação: ordem e número do jogo, semana original, recusas, aviso de conflito, efeito nas semanas e na classificação, salvar/desfazer/importar |
| T | PNG e telão com qualquer número de jogadores |
| B | Lembrete e registro de backup |
| E | Várias edições: migração, índice corrompido, criar/duplicar/arquivar/excluir, trocar a ativa, importar como novo ou substituindo |
| A | Aparência (contraste, validação, fora do desfazer, backup/reset/importar), modelo de campeonato, duplicar com aparência, cor no PNG e no telão |
| L | Nível: validação das estrelas, sorteio bloqueado sem elas, diferença posição a posição e limite do aceitável, qualidade e tempo do sorteio equilibrado, estrelas no estado/duplicar/modelo |
| U | Base da interface: `plural`, `numero` (formato brasileiro), `rotuloDoJogo`, `botaoIcone` (nome acessível), ícones decorativos e atributos do erro junto do campo |

`testes-telas.html` desenha cada tela sozinha, com um app falso: V1 (app vazio), V2 (fixture), V3 (lançar pela tela e descrição do desfazer), V4 (acessibilidade de todas as telas: nome dos botões, rótulo dos campos, sem emoji, sem "(es)", sem id de jogo), V5 (erro junto do campo) V6 (tela de Campeonatos com cartões: destaque da aberta, ações do menu ⋯ e fechamento do menu), V7 (abas por fase, endereços antigos e Ajustes) e V8 (navegação por semana, W.O. com nomes, título dos cartões, coluna Situação igual às regras, "Baixar imagem" e rótulos do mata-mata), V9 (ficha do jogador: números iguais aos da tabela, um jogo por linha do calendário, Esc/X/clique fora com o foco de volta ao nome, troca para o parceiro, fase final do campeão, ir para a semana e ficha aberta atualizando), V10 (remarcação: botão só em jogo sem resultado, semana atual desabilitada, remarcar e desfazer, aviso de conflito, marca nos Ajustes e na ficha com o calendário sorteado ainda avaliado como respeitado) e V11 (fase final: campos da Configuração e trava com o chaveamento gerado, mata-mata com 12, 17 classificados, sem 3º lugar e com jogos por rodada).

## 7. Pendências

- Revisar a regra do sorteio quando o regulamento do próximo campeonato sair.
- Emparelhamento com folgas (número de duplas que não é potência de 2): as duplas que folgam entram na rodada seguinte na frente dos vencedores e as vizinhas se enfrentam; isso foi decidido na Fase 24 sem regra do regulamento original. Revisar se o organizador preferir que as duplas que folgam enfrentem os vencedores (e não se enfrentem entre si).
- Confronto direto entre jogadores num campeonato em duplas continua sendo decisão manual do organizador.
