// Tela "Campeonato e jogadores": nome, configuração, aparência (cor e logo) e cadastro
// (adicionar, renomear, remover).

(function () {
  "use strict";

  const { el } = Util;
  const COR_PADRAO = "#0d3b66"; // azul do cabeçalho (--topo)

  function criar(app) {
    const { estado, nomePorId, avisar, renderizar, cadastroTravado } = app;

    let rascunhoNomes = ""; // nomes digitados/colados e ainda não adicionados
    let renomeando = null; // { id, valor } do jogador em edição

    function adicionarNomes() {
      if (cadastroTravado()) return;
      const campo = document.getElementById("novos-nomes");
      const nomes = Regras.interpretarListaNomes(campo ? campo.value : rascunhoNomes);
      if (!nomes.length) {
        avisar("Digite ao menos um nome (um por linha).", "erro");
        return;
      }
      const r = Regras.adicionarJogadores(estado.atual().campeonato.jogadores, nomes);
      for (const ignorado of r.ignorados) avisar(`"${ignorado.nome}" não foi adicionado: ${ignorado.motivo}`, "erro");
      rascunhoNomes = r.ignorados.map((i) => i.nome).join("\n"); // o que falhou fica no campo para corrigir
      app.focarDepois("novos-nomes");
      if (!r.adicionados.length) {
        renderizar();
        return;
      }
      estado.modificar(`adicionar jogadores: ${r.adicionados.join(", ")}`, (s) => {
        s.campeonato.jogadores = r.jogadores;
        s.campeonato.sorteio = null;
      });
      avisar(`${r.adicionados.length} jogador(es) adicionado(s).`);
    }

    function removerDoCadastro(id) {
      if (cadastroTravado()) return;
      const nome = nomePorId.get(id);
      estado.modificar(`remover jogador ${nome}`, (s) => {
        s.campeonato.jogadores = Regras.removerJogador(s.campeonato.jogadores, id);
        s.campeonato.sorteio = null;
      });
    }

    function salvarRenomeacao() {
      if (!renomeando) return;
      const { id } = renomeando;
      const campo = document.getElementById(`nome-${id}`);
      const valor = campo ? campo.value : renomeando.valor;
      const r = Regras.renomearJogador(estado.atual().campeonato.jogadores, id, valor);
      if (r.erro) {
        renomeando.valor = valor;
        app.focarDepois(`nome-${id}`);
        avisar(r.erro, "erro");
        renderizar();
        return;
      }
      const antigo = nomePorId.get(id);
      renomeando = null;
      if (!estado.modificar(`renomear ${antigo} para ${r.jogadores.find((j) => j.id === id).nome}`, (s) => {
        s.campeonato.jogadores = r.jogadores;
      })) {
        renderizar();
      }
    }

    function mudarNomeDoCampeonato(ev) {
      const nome = Regras.normalizarNome(ev.target.value);
      if (!nome) {
        avisar("O nome do campeonato não pode ficar vazio.", "erro");
        renderizar();
        return;
      }
      if (!estado.modificar("nome do campeonato", (s) => { s.campeonato.nome = nome; })) renderizar();
    }

    function mudarConfigInteira(campo, rotulo, texto) {
      if (cadastroTravado()) return;
      const t = texto.trim();
      const nova = { ...app.config(), [campo]: /^\d+$/.test(t) ? Number(t) : NaN };
      const erro = !(nova[campo] >= 1 && nova[campo] <= 99) ? "use um número de 1 a 99" : Regras.validarConfig(nova);
      if (erro) {
        avisar(`${rotulo}: ${erro}`, "erro");
        renderizar();
        return;
      }
      if (!estado.modificar(`${rotulo}: ${nova[campo]}`, (s) => {
        s.campeonato.config = nova;
        s.campeonato.sorteio = null;
      })) {
        renderizar();
      }
    }

    // Cor e logo valem na hora e ficam fora do desfazer (ver Estado.definirAparencia).
    function definirAparencia(parcial, mensagem) {
      if (estado.definirAparencia({ ...(estado.aparencia() || {}), ...parcial })) avisar(mensagem);
    }

    function mudarCor(ev) {
      const cor = ev.target.value.toLowerCase();
      if (!Util.corLegivelComBranco(cor)) {
        const c = Util.contraste(cor, "#ffffff").toFixed(1).replace(".", ",");
        avisar(`Cor clara demais: o texto branco do cabeçalho ficaria ilegível (contraste ${c}:1; o mínimo é 4,5:1). Escolha uma mais escura.`, "erro");
        renderizar();
        return;
      }
      definirAparencia({ cor }, "Cor do campeonato atualizada.");
    }

    async function escolherLogo(ev) {
      const arquivo = ev.target.files[0];
      ev.target.value = "";
      if (!arquivo) return;
      try {
        definirAparencia({ logo: await Util.prepararLogo(arquivo) }, "Logo do campeonato atualizado.");
      } catch (erro) {
        avisar(`Não foi possível usar a imagem: ${erro.message}`, "erro");
      }
    }

    function blocoAparencia() {
      const ap = estado.aparencia() || {};
      return el("div", { class: "aparencia", id: "aparencia" },
        el("span", { class: "rotulo-aparencia" }, "Aparência"),
        el("label", { class: "campo-aparencia" }, "Cor",
          el("input", { id: "aparencia-cor", type: "color", value: ap.cor || COR_PADRAO, onchange: mudarCor })),
        ap.cor && el("button", {
          type: "button", id: "aparencia-cor-padrao", class: "discreto mini", title: "Voltar ao azul padrão",
          onclick: () => definirAparencia({ cor: null }, "Cor padrão restaurada."),
        }, "Padrão"),
        el("span", { class: "campo-aparencia" }, "Logo",
          ap.logo ? el("img", { class: "previa-logo", id: "previa-logo", src: ap.logo, alt: "Logo do campeonato" }) : el("span", { class: "sem-logo" }, "nenhum"),
          el("button", {
            type: "button", id: "aparencia-logo-escolher", class: "mini", title: "Imagem PNG, JPG ou WebP; é reduzida para caber em 256×128",
            onclick: () => document.getElementById("aparencia-logo-arquivo").click(),
          }, ap.logo ? "Trocar" : "Escolher imagem"),
          ap.logo && el("button", {
            type: "button", id: "aparencia-logo-remover", class: "discreto mini perigo",
            onclick: () => definirAparencia({ logo: null }, "Logo removido."),
          }, "Remover"),
          el("input", { id: "aparencia-logo-arquivo", type: "file", accept: "image/png,image/jpeg,image/webp", hidden: true, onchange: escolherLogo })),
        el("span", { class: "legenda" }, "No cabeçalho, no telão e nos PNGs. Não entra no \"Desfazer\"."));
    }

    function campoConfig(classe, rotulo, entrada) {
      return el("label", { class: `campo-config ${classe}` }, rotulo, entrada);
    }

    function itemJogador(jogador, travado) {
      if (renomeando && renomeando.id === jogador.id) {
        return el("li", { class: "jogador editando" },
          el("input", {
            id: `nome-${jogador.id}`, type: "text", maxlength: String(Regras.MAX_CARACTERES_NOME), autocomplete: "off",
            value: renomeando.valor, "aria-label": `Novo nome de ${jogador.nome}`,
            oninput: (ev) => { renomeando.valor = ev.target.value; },
            onkeydown: (ev) => {
              if (ev.key === "Enter") { ev.preventDefault(); salvarRenomeacao(); }
              else if (ev.key === "Escape") { renomeando = null; renderizar(); }
            },
            onfocus: (ev) => ev.target.select(),
          }),
          el("button", { type: "button", id: `salvar-nome-${jogador.id}`, class: "primario mini", onclick: salvarRenomeacao }, "Salvar"),
          el("button", { type: "button", class: "discreto mini", onclick: () => { renomeando = null; renderizar(); } }, "Cancelar"));
      }
      return el("li", { class: "jogador", id: `jogador-${jogador.id}` },
        el("span", { class: "nome-jogador" }, jogador.nome),
        el("button", {
          type: "button", id: `renomear-${jogador.id}`, class: "discreto mini", title: `Renomear ${jogador.nome}`,
          onclick: () => { renomeando = { id: jogador.id, valor: jogador.nome }; app.focarDepois(`nome-${jogador.id}`); renderizar(); },
        }, "✎"),
        !travado && el("button", {
          type: "button", id: `remover-${jogador.id}`, class: "discreto mini perigo", title: `Remover ${jogador.nome}`,
          onclick: () => removerDoCadastro(jogador.id),
        }, "✕"));
    }

    function renderizarJogadores(atual) {
      const camp = atual.campeonato;
      const travado = Regras.cadastroTravado(camp, atual.jogos);
      const diag = Regras.diagnosticarCampeonato(camp.jogadores, camp.config);
      if (renomeando && !camp.jogadores.some((j) => j.id === renomeando.id)) renomeando = null;

      document.getElementById("resumo-jogadores").textContent =
        `${diag.jogadores} jogador(es)${travado ? " · calendário confirmado" : ""}`;

      const porSemana = diag.jogosPorSemanaMin === diag.jogosPorSemanaMax
        ? `${diag.jogosPorSemanaMax}` : `${diag.jogosPorSemanaMin} a ${diag.jogosPorSemanaMax}`;
      const numero = (id, campo, rotulo) => el("input", {
        id, type: "text", inputmode: "numeric", maxlength: "2", autocomplete: "off",
        value: String(camp.config[campo]), disabled: travado,
        onchange: (ev) => mudarConfigInteira(campo, rotulo, ev.target.value),
        onkeydown: (ev) => { if (ev.key === "Enter") { ev.preventDefault(); ev.target.blur(); } },
        onfocus: (ev) => ev.target.select(),
      });

      document.getElementById("conteudo-jogadores").replaceChildren(
        el("div", { class: "config-campeonato" },
          campoConfig("nome", "Nome do campeonato", el("input", {
            id: "nome-campeonato", type: "text", maxlength: "60", autocomplete: "off", value: camp.nome,
            onchange: mudarNomeDoCampeonato,
            onkeydown: (ev) => { if (ev.key === "Enter") { ev.preventDefault(); ev.target.blur(); } },
          })),
          campoConfig("numero", "Jogos por jogador", numero("config-jogos", "jogosPorJogador", "Jogos por jogador")),
          campoConfig("numero", "Semanas", numero("config-semanas", "semanas", "Semanas"))),
        blocoAparencia(),
        el("p", { class: "diagnostico", id: "diagnostico" },
          `${diag.jogadores} jogadores × ${camp.config.jogosPorJogador} jogos ÷ 4 = ${diag.totalJogos} jogos · ${porSemana} por semana em ${camp.config.semanas} semanas`),
        diag.pronto
          ? el("p", { class: "tudo-certo" }, "✔ Combinação válida para sortear o calendário.",
              !travado && el("button", {
                type: "button", class: "primario mini", dataset: { ir: "calendario" }, onclick: () => app.irParaAba("calendario"),
              }, "Próximo: sortear o calendário →"))
          : el("ul", { class: "avisos-chave" }, diag.problemas.map((p) => el("li", {}, `⚠️ ${p}`))),
        travado
          ? el("div", { class: "alerta" },
              "Calendário confirmado: só é possível renomear jogadores. Para mudar a lista, reinicie o campeonato (exporte um backup antes).",
              el("button", { type: "button", id: "btn-reiniciar", class: "perigo", onclick: app.resetar }, "Reiniciar campeonato"))
          : el("div", { class: "adicionar-jogadores" },
              el("label", { for: "novos-nomes" }, "Adicionar jogadores (um nome por linha; Ctrl+Enter adiciona)"),
              el("textarea", {
                id: "novos-nomes", rows: "3", placeholder: "Jogador 1\nJogador 2\nJogador 3",
                oninput: (ev) => { rascunhoNomes = ev.target.value; },
                onkeydown: (ev) => { if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); adicionarNomes(); } },
              }, rascunhoNomes),
              el("div", { class: "acoes" },
                el("button", { type: "button", id: "btn-adicionar-nomes", class: "primario", onclick: adicionarNomes }, "Adicionar"))),
        camp.jogadores.length
          ? el("ol", { class: "lista-jogadores", id: "lista-jogadores" }, camp.jogadores.map((j) => itemJogador(j, travado)))
          : app.proximoPasso("Nenhum jogador cadastrado ainda. Cole os nomes no campo acima, um por linha, e clique em \"Adicionar\"."));
    }

    return {
      renderizar: renderizarJogadores,
      limparRascunhos() { renomeando = null; },
    };
  }

  globalThis.Telas = { ...globalThis.Telas, jogadores: { criar } };
})();
