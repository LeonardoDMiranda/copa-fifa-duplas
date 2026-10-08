# Copa FIFA em Duplas

## Repositório PÚBLICO

Este repositório é público no GitHub: tudo que entra em um commit fica visível para qualquer pessoa, inclusive no histórico.

- Nunca use nomes reais de pessoas em código, testes, documentação, exemplos ou placeholders. Use nomes fictícios ("Jogador 01", "Ana Exemplo").
- Nunca adicione senhas, tokens, chaves de API, arquivos .env, e-mails, telefones, CPF ou endereços.
- Nada que identifique a empresa ou o local de trabalho do autor.
- Backups (.json) e imagens exportadas pelo app ficam fora do git (ver .gitignore).
- Dados reais de campeonatos ficam fora deste repositório (no repositório privado do autor ou fora da pasta do projeto).
- Antes de sugerir um commit, confira o diff contra esta lista e avise o Leonardo se encontrar algo.

## O que é

Aplicação local para conduzir um campeonato de FIFA em duplas do começo ao fim: cadastro de jogadores,
sorteio do calendário, lançamento dos jogos semana a semana, classificação individual e mata-mata
(semis, 3º lugar e final MD3).

Só o organizador usa. Não tem servidor, login nem compartilhamento online.

## Documentos

- `docs/REGULAMENTO.md`: regras oficiais. **É a única fonte de regras.** Não invente regra que não esteja lá.
- `docs/ESCOPO.md`: funcionalidades, regras, modelo de dados, histórico das fases e testes.
- `README.md`: apresentação do projeto para o GitHub (inglês, com a versão em português dentro de `<details>`). Print em `docs/print.png`, só com nomes fictícios.
- `testes/dados-exemplo.js`: dados de exemplo com nomes fictícios (classificação base de 32 jogadores e os 7 jogos da última rodada). Só serve de fixture para `testes.html`; não altere sem pedir. O app em si começa vazio: jogadores, calendário e jogos vêm do estado (ver `docs/ESCOPO.md`).

## Stack e restrições

- HTML + CSS + JavaScript puro (ES2020+). **Sem build, sem npm, sem frameworks, sem CDN.**
- A aplicação abre com duplo clique no `index.html` (protocolo `file://`). Por isso:
  - não use `fetch()` para carregar arquivos locais; os dados iniciais ficam em `.js` (variável global);
  - não use ES modules (`type="module"` falha em `file://` no Chrome/Edge); use scripts clássicos com ordem de carregamento no `index.html`.
- Persistência em `localStorage`, com exportar/importar JSON como backup.
- Precisa funcionar offline no Chrome ou Edge atuais.

## Estrutura

```
index.html          # app
testes.html         # testes das regras (abrir no navegador; mostra passou/falhou)
css/style.css
testes/dados-exemplo.js  # fixture de teste: dados fictícios (não é carregado pelo app)
js/regras.js        # FUNÇÕES PURAS: pontuação, classificação, desempate, mata-mata, "o que está em jogo"
js/estado.js        # estado v2 (campeonato, jogadores, jogos): carregar/salvar localStorage, desfazer, exportar/importar JSON
js/util.js          # helpers de apresentação compartilhados (el, formatarSaldo, carimbo, classeDoLado)
js/ui.js            # renderização e eventos
js/exportar.js      # geração de PNG via Canvas API
js/telao.js         # modo telão (tela cheia, alterna telas); também abre sozinho em index.html#telao
```

## Convenções

- Interface, textos e nomes de variáveis de domínio em **português** (`jogador`, `dupla`, `gols1`, `classificacao`).
- `regras.js` não acessa DOM nem `localStorage`. Toda regra de negócio fica nele e é testada em `testes.html`.
- Sempre que mudar uma regra, adicione ou ajuste um caso em `testes.html` e confira que todos passam.
- A classificação é **sempre calculada** (base zerada dos jogadores + jogos lançados, via `Regras.baseDosJogadores`). Nunca guarde a tabela calculada no estado.
- Tudo que pode mudar de um campeonato para outro (pontos, nº de jogos e de semanas) vive em `campeonato.config` (`Regras.REGRAS_PADRAO`); as funções de `regras.js` recebem `config` como parâmetro opcional. Vagas na fase final: só 8 é suportado.
- Mudanças pequenas e incrementais: o organizador constrói fase por fase (ver `docs/ESCOPO.md`).
