// Abas do app: quais existem em cada fase, qual vale para um endereço (#rodadas...) e qual
// interessa na etapa atual. Funções puras (sem DOM), usadas pelo ui.js e testadas em
// testes-telas.html.
//
// Duas fases. Preparação (calendário ainda não confirmado): os 3 passos Configuração, Jogadores e
// Sorteio. Temporada (calendário confirmado): Rodadas, Classificação, Mata-mata e Ajustes, que mostra
// os 3 passos da preparação (já em modo só leitura) mais a zona de perigo. A de campeonatos fica
// fora das fases e se abre pelo cabeçalho. Alt+1... seguem as abas visíveis.
// `telas`: o que é redesenhado na aba; `secoes`: as <section> (index.html) que ficam à mostra.

(function () {
  "use strict";

  const ABAS = [
    { id: "configuracao", fase: "preparacao", telas: ["configuracao"], secoes: ["configuracao"] },
    { id: "jogadores", fase: "preparacao", telas: ["jogadores"], secoes: ["jogadores"] },
    { id: "sorteio", fase: "preparacao", telas: ["sorteio"], secoes: ["sorteio"] },
    { id: "rodadas", fase: "temporada", telas: ["rodadas"], secoes: ["rodadas"] },
    { id: "classificacao", fase: "temporada", telas: ["classificacao"], secoes: ["classificacao"] },
    { id: "mata-mata", fase: "temporada", telas: ["mataMata"], secoes: ["mata-mata"] },
    {
      id: "campeonato", fase: "temporada", telas: ["configuracao", "jogadores", "sorteio", "campeonato"],
      secoes: ["configuracao", "jogadores", "sorteio", "campeonato"],
    },
    { id: "campeonatos", fase: null, telas: ["campeonatos"], secoes: ["campeonatos"] },
  ];
  const POR_ID = new Map(ABAS.map((a) => [a.id, a]));
  const TODAS_AS_SECOES = [...new Set(ABAS.flatMap((a) => a.secoes))];
  const ENDERECOS_ANTIGOS = { calendario: "sorteio" }; // #calendario (antes da Fase 20) vale #sorteio

  // `atual`: estado v2 da edição ({ campeonato, jogos, mataMata }).
  function faseDe(atual) {
    return Regras.cadastroTravado(atual.campeonato, atual.jogos) ? "temporada" : "preparacao";
  }

  // As abas com botão na fase atual, na ordem em que aparecem (e dos atalhos Alt+1...).
  function abasDaFase(atual) {
    const fase = faseDe(atual);
    return ABAS.filter((a) => a.fase === fase);
  }

  // Id da aba para o endereço (sem o #), ou null se não vale. Um passo da preparação com o calendário
  // já confirmado cai em Ajustes; uma aba da temporada antes disso não vale.
  function abaDoEndereco(endereco, atual) {
    let bruto;
    try { bruto = decodeURIComponent(endereco); } catch (_) { return null; }
    const id = ENDERECOS_ANTIGOS[bruto] || bruto;
    const aba = POR_ID.get(id);
    if (!aba) return null;
    if (aba.fase === null || aba.fase === faseDe(atual)) return id;
    return aba.fase === "preparacao" ? "campeonato" : null;
  }

  // Aba que interessa na etapa atual do campeonato.
  function abaDaEtapa(atual) {
    if (atual.mataMata) return "mata-mata";
    if (atual.jogos.length) return "rodadas";
    const camp = atual.campeonato;
    if (camp.sorteio || Regras.diagnosticarCampeonato(camp.jogadores, camp.config).pronto) return "sorteio";
    return camp.jogadores.length ? "jogadores" : "configuracao";
  }

  globalThis.Abas = { ABAS, POR_ID, TODAS_AS_SECOES, faseDe, abasDaFase, abaDoEndereco, abaDaEtapa };
})();
