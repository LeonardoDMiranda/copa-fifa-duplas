// Ficha do jogador: janela lateral (<dialog> modal) aberta ao clicar num nome (Util.botaoJogador).
// Mostra os números ao vivo, a situação para o top 8, os jogos da classificação e os da fase final.
// Esc, o "Fechar" ou um clique fora fecham; o foco volta ao nome clicado. Os nomes do parceiro e dos
// adversários trocam a ficha para eles, sem fechar.

(function () {
  "use strict";

  const { el, formatarSaldo } = Util;
  const ROTULOS = Util.ROTULOS_MATA_MATA;

  // Como o jogo da classificação ficou para quem estava no `lado` (1 ou 2).
  function resultadoParaLado(jogo, lado, cfg) {
    const r = jogo.resultado;
    const ef = Regras.efeitosDoResultado(r, cfg);
    if (!ef) return { texto: "pendente", classe: "pendente" };
    if (r.tipo === "anulado") return { texto: "anulado", classe: "anulada" };
    const e = ef[lado];
    const placar = `${e.gp}×${e.gc}${r.tipo === "wo" ? " (W.O.)" : ""}`;
    if (e.v) return { texto: `vitória ${placar}`, classe: "vencedora" };
    if (e.d) return { texto: `derrota ${placar}`, classe: "perdedora" };
    return { texto: `empate ${placar}`, classe: "empate" };
  }

  // Como um confronto do mata-mata (Regras.resolverMataMata) ficou para quem estava no `lado`.
  function resultadoNoConfronto(c, lado) {
    const s = c.serie;
    if (!c.pronto) return { texto: "aguardando a outra dupla", classe: "pendente" };
    if (!s.vencedor) {
      if (!c.partidas.length) return { texto: "a jogar", classe: "pendente" };
      return { texto: c.melhorDe > 1 ? `em andamento, série ${s.vitorias[lado - 1]}×${s.vitorias[2 - lado]}` : "em andamento", classe: "pendente" };
    }
    const venceu = s.vencedor === lado;
    let detalhe;
    if (c.melhorDe > 1) {
      detalhe = `série ${s.vitorias[lado - 1]}×${s.vitorias[2 - lado]}`;
    } else {
      const p = c.partidas[0];
      const quando = { prorrogacao: " na prorrogação", penaltis: " nos pênaltis" }[s.analises[0].decididoEm] || "";
      detalhe = `${p[`gols${lado}`]}×${p[`gols${3 - lado}`]}${quando}`;
    }
    return venceu ? { texto: `vitória ${detalhe}`, classe: "vencedora" } : { texto: `derrota ${detalhe}`, classe: "perdedora" };
  }

  function criar(app, raiz) {
    const { nomePorId, numerosNaSemana } = app;

    const titulo = el("h2", { id: "ficha-titulo", tabindex: "-1" });
    const corpo = el("div", { id: "ficha-corpo" });
    const dialogo = el("dialog", { id: "ficha-jogador", class: "ficha", "aria-labelledby": "ficha-titulo" },
      el("div", { class: "ficha-conteudo" },
        el("div", { class: "ficha-topo" },
          titulo,
          Util.botaoIcone({ icone: "fechar", rotulo: "Fechar a ficha", id: "ficha-fechar", onclick: () => dialogo.close() })),
        corpo));
    raiz.append(dialogo);

    let jogadorId = null; // jogador da ficha aberta
    let origem = null; // nome clicado para abrir a ficha: o foco volta para ele ao fechar

    // O "close" chega depois do fechamento: se a ficha já foi reaberta (outro nome), não mexe nela.
    dialogo.addEventListener("close", () => {
      if (dialogo.open) return;
      jogadorId = null;
      corpo.replaceChildren();
      // O nome pode ter sido redesenhado enquanto a ficha estava aberta (ex.: placar lançado em outra janela).
      const alvo = origem && (origem.isConnected ? origem : document.getElementById(origem.id));
      origem = null;
      if (alvo) alvo.focus();
    });
    // O conteúdo ocupa a janela inteira: um clique no próprio <dialog> só pode ser no fundo escurecido.
    dialogo.addEventListener("click", (ev) => { if (ev.target === dialogo) dialogo.close(); });

    // `elementoOrigem`: o nome clicado. Com a ficha já aberta (clique no parceiro), só troca o jogador.
    function abrir(id, elementoOrigem = null) {
      if (!nomePorId.has(id)) return;
      if (!dialogo.open) origem = elementoOrigem;
      jogadorId = id;
      desenhar(app.estado.atual(), app.tabelaAtual());
      if (!dialogo.open) dialogo.showModal();
      titulo.focus();
      dialogo.scrollTop = 0;
    }

    function fechar() {
      if (dialogo.open) dialogo.close();
    }

    // Leva para a semana do jogo, na aba Rodadas.
    function verSemana(n) {
      fechar();
      app.verSemana(n);
    }

    // ---------- partes da ficha ----------

    function numeros(linha, jogosNoCalendario) {
      const item = (rotulo, id, valor) => el("div", {}, el("dt", {}, rotulo), el("dd", { id }, valor));
      return el("dl", { class: "ficha-numeros" },
        item("Posição", "ficha-posicao", `${linha.posicao}º`),
        item("Pontos", "ficha-pontos", String(linha.pontos)),
        item("Saldo", "ficha-saldo", formatarSaldo(linha.sg)),
        item("V / E / D", "ficha-ved", `${linha.v} / ${linha.e} / ${linha.d}`),
        item("Jogos", "ficha-jogos", `${linha.jogos} de ${jogosNoCalendario}`));
    }

    function subtitulo(linha) {
      const empate = linha.empateTecnico;
      const outros = empate && empate.grupo.filter((id) => id !== linha.id).map((id) => nomePorId.get(id));
      return el("p", { class: "legenda", id: "ficha-subtitulo" },
        `Classificação ao vivo: ${linha.posicao <= Regras.VAGAS_FASE_FINAL ? "dentro" : "fora"} do top 8.`,
        empate && ` Empate técnico com ${outros.join(", ")}.`);
    }

    function situacao(atual) {
      const situacoes = atual.jogos.length ? Util.situacoes(app.base(), atual) : null;
      const s = situacoes && situacoes.find((x) => x.id === jogadorId);
      let conteudo;
      if (s) {
        conteudo = el("div", { id: "ficha-situacao", class: `ficha-situacao ${s.situacao}` }, Util.marcaSituacao(s, atual.jogos));
      } else {
        const pendentes = atual.jogos.filter((j) => !j.resultado).length;
        conteudo = el("p", { id: "ficha-situacao", class: "legenda" },
          `Disponível quando faltarem até ${Regras.limitePendentesSituacoes(atual.campeonato.config)} jogos (faltam ${pendentes}).`);
      }
      return el("section", { class: "ficha-secao" }, el("h3", {}, "Situação para o top 8"), conteudo);
    }

    // "com Parceiro × Adversário + Adversário", com os nomes que trocam a ficha. `outra` pode faltar
    // (mata-mata com a outra dupla ainda indefinida). `local` deixa os ids únicos.
    function duplas(minha, outra, local) {
      const nome = (id) => app.botaoJogador(id, `ficha-ver-${local}-${id}`);
      return el("div", { class: "ficha-jogo-duplas" },
        "com ", nome(minha.find((id) => id !== jogadorId)),
        outra && [" × ", outra.map((id, i) => [i ? " + " : null, nome(id)])]);
    }

    function jogos(jogosDele, atual) {
      const cfg = atual.campeonato.config;
      const numerosJogos = numerosNaSemana(atual.jogos);
      return el("section", { class: "ficha-secao" },
        el("h3", {}, "Jogos"),
        el("ol", { class: "ficha-jogos", id: "ficha-lista-jogos" }, jogosDele.map((j) => {
          const lado = j.dupla1.includes(jogadorId) ? 1 : 2;
          const r = resultadoParaLado(j, lado, cfg);
          const semana = Regras.semanaDoJogo(j);
          return el("li", {},
            el("div", { class: "ficha-jogo-topo" },
              el("button", {
                type: "button", id: `ficha-semana-${j.id}`, class: "nome-slot", title: `Ver a semana ${semana} nas Rodadas`,
                onclick: () => verSemana(semana),
              }, Util.rotuloDoJogo(j, numerosJogos)),
              Regras.jogoRemarcado(j) && el("span", { class: "marca-remarcado" }, `Remarcado da semana ${j.semanaOriginal}`),
              el("span", { class: `resultado-jogo ${r.classe}` }, r.texto)),
            duplas(lado === 1 ? j.dupla1 : j.dupla2, lado === 1 ? j.dupla2 : j.dupla1, j.id));
        })));
    }

    // Só para quem está em algum confronto do chaveamento gerado.
    function faseFinal(atual, tabela) {
      if (!atual.mataMata) return null;
      const mm = Regras.resolverMataMata(atual.mataMata, tabela, atual.campeonato.config);
      const confrontos = ["semi1", "semi2", "final", "terceiro"].map((chave) => mm[chave])
        .filter((c) => (c.dupla1 || []).includes(jogadorId) || (c.dupla2 || []).includes(jogadorId));
      if (!confrontos.length) return null;
      const p = mm.podio;
      const tem = (dupla) => Boolean(dupla && dupla.includes(jogadorId));
      const conquista = tem(p.campeoes) ? ["trofeu", "Campeão"] : tem(p.vice) ? ["medalha", "Vice-campeão"]
        : tem(p.terceiro) ? ["medalha", "3º lugar"] : null;
      return el("section", { class: "ficha-secao" },
        el("h3", {}, "Fase final"),
        conquista && el("p", { class: "ficha-conquista", id: "ficha-conquista" }, Icones.svg(conquista[0]), conquista[1]),
        el("ul", { class: "ficha-jogos", id: "ficha-fase-final" }, confrontos.map((c) => {
          const lado = (c.dupla1 || []).includes(jogadorId) ? 1 : 2;
          const minha = lado === 1 ? c.dupla1 : c.dupla2;
          const outra = lado === 1 ? c.dupla2 : c.dupla1;
          const r = resultadoNoConfronto(c, lado);
          return el("li", {},
            el("div", { class: "ficha-jogo-topo" },
              el("strong", {}, ROTULOS[c.chave]),
              el("span", { class: `resultado-jogo ${r.classe}` }, r.texto)),
            duplas(minha, outra, c.chave));
        })));
    }

    function desenhar(atual, tabela) {
      const linha = tabela.find((l) => l.id === jogadorId);
      const jogosDele = atual.jogos.filter((j) => j.dupla1.includes(jogadorId) || j.dupla2.includes(jogadorId));
      titulo.textContent = linha.nome;
      // replaceChildren escreveria "null" como texto: a fase final, quando não há, sai da lista.
      corpo.replaceChildren(...[
        subtitulo(linha),
        numeros(linha, jogosDele.length),
        situacao(atual),
        faseFinal(atual, tabela),
        jogos(jogosDele, atual),
      ].filter(Boolean));
    }

    return {
      abrir,
      // Com a ficha aberta, acompanha o estado (ex.: placar lançado no telão ou em outra janela).
      renderizar(atual, tabela) {
        if (!dialogo.open) return;
        if (!nomePorId.has(jogadorId)) fechar();
        else desenhar(atual, tabela);
      },
      reiniciarVisao: fechar,
    };
  }

  globalThis.Telas = { ...globalThis.Telas, ficha: { criar } };
})();
