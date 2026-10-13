// Tela "Configuração" (passo 1 da preparação): nome do campeonato, jogos por jogador, semanas
// e aparência (cor e logo).

(function () {
  "use strict";

  const { el, buscar, plural } = Util;
  const COR_PADRAO = "#0d3b66"; // azul do cabeçalho (--topo)

  const comMaiuscula = (texto) => texto[0].toUpperCase() + texto.slice(1);

  function criar(app, raiz) {
    const { estado, avisar, renderizar, cadastroTravado } = app;

    const conteudo = el("div", { id: "conteudo-configuracao" });
    raiz.append(el("section", { id: "tela-configuracao", class: "tela" },
      el("div", { class: "tela-cabecalho" }, el("h2", {}, "Configuração")),
      conteudo));

    // Erros mostrados embaixo do campo: id do campo -> { mensagem, valor? } (valor = o texto
    // recusado, que continua no campo para corrigir). Some quando o campo recebe um valor válido.
    const errosCampo = new Map();

    // Campos que validam ao sair (change) não puxam o foco de volta: o Tab segue normalmente.
    function marcarErro(id, mensagem, valor, { focar = false } = {}) {
      errosCampo.set(id, { mensagem, valor });
      if (focar) app.focarDepois(id);
      renderizar();
    }
    const idErro = (id) => `${id}-erro`;
    const mensagemDe = (id) => (errosCampo.get(id) || {}).mensagem;
    const atributosDeErro = (id) => Util.atributosDeErro(idErro(id), mensagemDe(id));
    const mensagemDeErro = (id) => Util.mensagemDeErro(idErro(id), mensagemDe(id));
    // Valor do campo: o recusado (se houver erro) ou o guardado.
    const valorDo = (id, guardado) => (errosCampo.has(id) && errosCampo.get(id).valor !== undefined ? errosCampo.get(id).valor : guardado);

    function mudarNomeDoCampeonato(ev) {
      const nome = Regras.normalizarNome(ev.target.value);
      if (!nome) {
        marcarErro("nome-campeonato", "O nome do campeonato não pode ficar vazio.", ev.target.value);
        return;
      }
      errosCampo.delete("nome-campeonato");
      if (!estado.modificar("nome do campeonato", (s) => { s.campeonato.nome = nome; })) renderizar();
    }

    function mudarConfigInteira(id, campo, rotulo, texto) {
      if (cadastroTravado()) return;
      const t = texto.trim();
      const nova = { ...app.config(), [campo]: /^\d+$/.test(t) ? Number(t) : NaN };
      const erro = !(nova[campo] >= 1 && nova[campo] <= 99) ? "use um número de 1 a 99." : Regras.validarConfig(nova);
      if (erro) {
        marcarErro(id, comMaiuscula(erro), texto);
        return;
      }
      errosCampo.delete(id);
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
        const c = Util.numero(Util.contraste(cor, "#ffffff"), 1);
        marcarErro("aparencia-cor",
          `Cor clara demais: o texto branco do cabeçalho ficaria ilegível (contraste ${c}:1; o mínimo é ${Util.numero(Util.CONTRASTE_MINIMO, 1)}:1). Escolha uma mais escura.`,
          cor);
        return;
      }
      errosCampo.delete("aparencia-cor");
      definirAparencia({ cor }, "Cor do campeonato atualizada.");
    }

    async function escolherLogo(ev) {
      const arquivo = ev.target.files[0];
      ev.target.value = "";
      if (!arquivo) return;
      try {
        const logo = await Util.prepararLogo(arquivo);
        errosCampo.delete("aparencia-logo-escolher");
        definirAparencia({ logo }, "Logo do campeonato atualizado.");
      } catch (erro) {
        marcarErro("aparencia-logo-escolher", `Não foi possível usar a imagem: ${erro.message}`);
      }
    }

    function blocoAparencia() {
      const ap = estado.aparencia() || {};
      return el("div", { class: "aparencia", id: "aparencia" },
        el("span", { class: "rotulo-aparencia" }, "Aparência"),
        el("label", { class: "campo-aparencia" }, "Cor",
          el("input", {
            id: "aparencia-cor", type: "color", value: valorDo("aparencia-cor", ap.cor || COR_PADRAO), onchange: mudarCor,
            ...atributosDeErro("aparencia-cor"),
          })),
        ap.cor && el("button", {
          type: "button", id: "aparencia-cor-padrao", class: "discreto mini", title: "Voltar ao azul padrão",
          onclick: () => { errosCampo.delete("aparencia-cor"); definirAparencia({ cor: null }, "Cor padrão restaurada."); },
        }, "Padrão"),
        el("span", { class: "campo-aparencia" }, "Logo",
          ap.logo ? el("img", { class: "previa-logo", id: "previa-logo", src: ap.logo, alt: "Logo do campeonato" }) : el("span", { class: "sem-logo" }, "nenhum"),
          el("button", {
            type: "button", id: "aparencia-logo-escolher", class: "mini", title: "Imagem PNG, JPG ou WebP; é reduzida para caber em 256×128",
            onclick: () => buscar(raiz, "aparencia-logo-arquivo").click(),
            ...atributosDeErro("aparencia-logo-escolher"),
          }, ap.logo ? "Trocar" : "Escolher imagem"),
          ap.logo && el("button", {
            type: "button", id: "aparencia-logo-remover", class: "discreto mini perigo",
            onclick: () => definirAparencia({ logo: null }, "Logo removido."),
          }, "Remover"),
          el("input", { id: "aparencia-logo-arquivo", type: "file", accept: "image/png,image/jpeg,image/webp", hidden: true, onchange: escolherLogo })),
        mensagemDeErro("aparencia-cor"),
        mensagemDeErro("aparencia-logo-escolher"),
        el("span", { class: "legenda" }, "No cabeçalho, no telão e nos PNGs. Não entra no \"Desfazer\"."));
    }

    // Rótulo em cima, campo e, se houver, o erro embaixo.
    function campoConfig(classe, rotulo, entrada) {
      return el("div", { class: `campo-config ${classe}` },
        el("label", { for: entrada.id }, rotulo), entrada, mensagemDeErro(entrada.id));
    }

    function renderizarConfiguracao(atual) {
      const camp = atual.campeonato;
      const travado = Regras.cadastroTravado(camp, atual.jogos);
      const diag = Regras.diagnosticarCampeonato(camp.jogadores, camp.config);

      const porSemana = diag.jogosPorSemanaMin === diag.jogosPorSemanaMax
        ? `${diag.jogosPorSemanaMax}` : `${diag.jogosPorSemanaMin} a ${diag.jogosPorSemanaMax}`;
      const numero = (id, campo, rotulo) => el("input", {
        id, type: "text", inputmode: "numeric", maxlength: "2", autocomplete: "off",
        value: valorDo(id, String(camp.config[campo])), disabled: travado, ...atributosDeErro(id),
        onchange: (ev) => mudarConfigInteira(id, campo, rotulo, ev.target.value),
        onkeydown: (ev) => { if (ev.key === "Enter") { ev.preventDefault(); ev.target.blur(); } },
        onfocus: (ev) => ev.target.select(),
      });

      // replaceChildren não descarta os false (como el() faz): filtra antes.
      conteudo.replaceChildren(...[
        el("div", { class: "config-campeonato" },
          campoConfig("nome", "Nome do campeonato", el("input", {
            id: "nome-campeonato", type: "text", maxlength: "60", autocomplete: "off", value: valorDo("nome-campeonato", camp.nome),
            ...atributosDeErro("nome-campeonato"),
            onchange: mudarNomeDoCampeonato,
            onkeydown: (ev) => { if (ev.key === "Enter") { ev.preventDefault(); ev.target.blur(); } },
          })),
          campoConfig("numero", "Jogos por jogador", numero("config-jogos", "jogosPorJogador", "Jogos por jogador")),
          campoConfig("numero", "Semanas", numero("config-semanas", "semanas", "Semanas"))),
        blocoAparencia(),
        el("p", { class: "diagnostico", id: "diagnostico" },
          `${plural(diag.jogadores, "jogador", "jogadores")} × ${plural(camp.config.jogosPorJogador, "jogo", "jogos")} ÷ 4 = ${plural(diag.totalJogos, "jogo", "jogos")} · ${porSemana} por semana em ${plural(camp.config.semanas, "semana", "semanas")}`),
        travado
          ? el("p", { class: "legenda" }, "Calendário confirmado: jogos e semanas não mudam mais. O nome e a aparência continuam editáveis.")
          : el("p", { class: "acoes-passo" },
              el("button", {
                type: "button", id: "btn-proximo-jogadores", class: "primario mini", dataset: { ir: "jogadores" }, onclick: () => app.irParaAba("jogadores"),
              }, "Próximo: jogadores", Icones.svg("seguir"))),
      ].filter(Boolean));
    }

    return {
      renderizar: renderizarConfiguracao,
      limparRascunhos() { errosCampo.clear(); },
    };
  }

  globalThis.Telas = { ...globalThis.Telas, configuracao: { criar } };
})();
