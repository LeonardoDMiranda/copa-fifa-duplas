# Escopo – Copa FIFA em Duplas

## 1. Objetivo

Aplicação local (HTML + CSS + JavaScript puro) para o organizador conduzir um campeonato de FIFA em duplas do começo ao fim:

1. Cadastrar os jogadores e configurar o campeonato (pontos, jogos por jogador, semanas).
2. Sortear o calendário inteiro de uma vez, ajustar à mão se precisar e confirmar.
3. Lançar os placares (ou W.O., ou anular) semana a semana.
4. Ver a classificação individual ao vivo ou ao fim de cada semana, e **o que está em jogo** (garantidos, em disputa, eliminados).
5. Gerar e conduzir o mata-mata: semifinais, 3º lugar e final MD3.
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

- As duplas se formam pela classificação final: **Semi 1 = 1º+8º × 2º+7º**, **Semi 2 = 3º+6º × 4º+5º**. Só 8 vagas na fase final são suportadas.
- 3º lugar = perdedores das semis. Final = vencedores das semis, em **MD3**.
- Sem empate: cada jogo tem placar normal e, se empatar, **prorrogação** e, se ainda empatar, **pênaltis**.
- Final MD3: termina quando uma dupla chega a 2 vitórias (o 3º jogo só aparece com 1×1).
- **Duplas editáveis**: qualquer dupla do mata-mata pode ser trocada à mão (a "surpresa antes da final") e voltar à dupla automática depois.
- **Duplas guardadas**: as das semis ficam fixas desde a geração do chaveamento; as do 3º lugar e da final ficam fixas a partir do primeiro placar lançado. Se a classificação ou o resultado de uma semi mudar depois, o app avisa e oferece trocar pelas duplas novas (os placares lançados continuam e passam a valer para elas).
- Resultados do mata-mata **não** alteram a classificação.
- Resultado final: 🥇 campeões (2 jogadores), 🥈 vice, 🥉 3º lugar.

### 2.4 O que está em jogo

Para os jogos ainda sem resultado, o app enumera todos os desfechos possíveis por jogo (vitória da dupla 1, empate com gols, 0×0, jogo anulado, vitória da dupla 2; o W.O. vale o mesmo que a vitória) e compara **pontos e vitórias** em cada cenário. Desfechos que dão os mesmos pontos e V contam uma vez só (com a pontuação padrão, o anulado é igual ao 0×0, e sobram 4). Só calcula até 65.536 cenários: com a pontuação padrão, até 8 jogos pendentes.

- **Garantido**: em todos os cenários, (jogadores à frente + empatados em pontos e V) ≤ 7.
- **Eliminado**: em todos os cenários, jogadores estritamente à frente ≥ 8.
- **Em disputa**: o resto. Se a vaga depender de saldo ou gols pró, mostra "depende do saldo".
- Se dois jogadores empatam em pontos e V e **nenhum dos dois joga mais**, o saldo e os gols pró deles já são definitivos e decidem o empate (depois, a ordem manual). Empatados em tudo e sem ordem manual: "depende do desempate".
- A ordem manual entre esses dois só vale no cenário em que ninguém que ainda joga empata com eles em pontos e V. Se alguém empata, o grupo pode mudar e a ordem manual ser descartada: "depende do saldo".

### 2.5 Sorteio do calendário

Regras em `docs/REGULAMENTO.md` ("Sorteio do calendário"). Resumo:

- Entradas: jogadores, jogos por jogador (padrão 6) e semanas (padrão 8). Jogadores × jogos por jogador precisa ser divisível por 4.
- Obrigatório: todos com o mesmo número de jogos, no máximo 1 jogo por jogador por semana e nenhum parceiro repetido. Desejável: não repetir adversário.
- O sorteio usa uma **semente**: a mesma semente gera o mesmo calendário. O organizador pode sortear de novo e trocar jogadores à mão antes de **confirmar**.
- Depois de confirmado, o calendário vira os jogos (`s<semana>-j<n>`) e o cadastro trava: só dá para renomear jogadores.

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
    config: { pontosVitoria, pontosEmpate, pontosEmpateSemGols, vagasFaseFinal, jogosPorJogador, semanas },
    jogadores: [ { id, nome } ],
    sorteio: null | { semente, confirmado, rascunho?: [ { semana, dupla1, dupla2 } ] }
  },
  jogos: [ { id, semana, dupla1: [id, id], dupla2: [id, id],
             resultado: null | { tipo: "placar", gols1, gols2 } | { tipo: "wo", vencedor: 1 | 2 } | { tipo: "anulado" } } ],
  desempatesManuais: [ { jogadores: [id, ...] } ],
  mataMata: null | { semi1, semi2, terceiro, final },  // cada um: { dupla1, dupla2, duplaManual1?, duplaManual2?, partidas: [Partida] }
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

Uma aba por etapa (teclas 1 a 5; a aba ativa fica no endereço, ex.: `index.html#rodadas`). Sem `#`, abre na aba da etapa do campeonato; depois a aba só muda por escolha do organizador (e ao confirmar o calendário, que leva a Rodadas).

1. **Jogadores**: nome, jogos por jogador, semanas, aparência (cor e logo), diagnóstico da combinação e cadastro (um nome por linha; renomear e remover).
2. **Calendário**: sortear, conferir as restrições, trocar jogadores à mão e confirmar.
3. **Rodadas**: navegação por semana, cartões dos jogos com placar, "W.O.", "Anular" e "Limpar"; quem descansa na semana; agenda do jogador; top 8 ao vivo ao lado.
4. **Classificação**: ao vivo ou ao fim de uma semana; top 8 em verde, ▲▼ em relação à semana anterior, ⚖️ com controle de ordem manual. Ao lado, **o que está em jogo**: Garantidos / Em disputa / Eliminados.
5. **Mata-mata**: chaveamento, placares com prorrogação e pênaltis, troca de duplas e pódio.

**Campeonatos** (`index.html#campeonatos`, fora das abas de etapa): edições em uso e arquivadas, com Abrir, Duplicar, Exportar, Modelo, Arquivar/Desarquivar e Excluir; "Novo campeonato" e "Novo a partir de modelo"; espaço usado.

**Cabeçalho**: na cor do campeonato, com o logo ao lado do título. O título é o seletor de campeonatos (edições não arquivadas, "+ Novo campeonato" e "Gerenciar campeonatos"). Desfazer, menu Backup (exportar/importar JSON), Modo telão e menu ⋯ (PNG da classificação e do mata-mata, Resetar). Lembrete de backup quando for a hora.

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
| T | PNG e telão com qualquer número de jogadores |
| B | Lembrete e registro de backup |
| E | Várias edições: migração, índice corrompido, criar/duplicar/arquivar/excluir, trocar a ativa, importar como novo ou substituindo |
| A | Aparência (contraste, validação, fora do desfazer, backup/reset/importar), modelo de campeonato, duplicar com aparência, cor no PNG e no telão |

## 7. Pendências

- Revisar a regra do sorteio quando o regulamento do próximo campeonato sair.
- A fase final só aceita 8 classificados (o chaveamento 1º+8º × 2º+7º é fixo).
- Confronto direto entre jogadores num campeonato em duplas continua sendo decisão manual do organizador.
