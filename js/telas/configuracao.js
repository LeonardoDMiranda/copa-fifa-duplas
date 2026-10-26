// Tela "Configuração" (passo 1 da preparação): nome do campeonato, jogos por jogador, semanas
// e aparência (cor e logo).

(function () {
  "use strict";

  const { el, buscar, plural } = Util;
  const COR_PADRAO = "#0d3b66"; // azul do cabeçalho (--topo)

  const comMaiuscula = (texto) => texto[0].toUpperCase() + texto.slice(1);

  // "8" ou "7 e 8" (os tamanhos dos grupos, do diagnóstico).
  function tamanhosDosGrupos(grupos) {
    const tamanhos = [...new Set(grupos.map((g) => g.jogadores))].sort((a, b) => a - b);
    return tamanhos.length === 1 ? String(tamanhos[0]) : `${tamanhos.slice(0, -1).join(", ")} e ${tamanhos[tamanhos.length - 1]}`;
  }

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

    // ---------- fase final ----------
    // Não mexem no sorteio (só no mata-mata) e valem até o chaveamento ser gerado: depois disso ele
    // guarda o próprio formato, e mudar aqui não o alteraria.

    const OPCOES_JOGOS = [[1, "Jogo único"], [3, "Melhor de 3"], [5, "Melhor de 5"]];

    function mudarFaseFinal(descricao, alterar) {
      if (estado.atual().mataMata) return;
      const nova = alterar({ ...app.config() });
      if (!estado.modificar(descricao, (s) => { s.campeonato.config = nova; })) renderizar();
    }

    function mudarVagas(texto) {
      const t = texto.trim();
      const vagas = /^\d+$/.test(t) ? Number(t) : NaN;
      const nova = { ...app.config(), vagasFaseFinal: vagas };
      const erro = Regras.validarConfig(nova);
      if (erro) {
        marcarErro("config-vagas", comMaiuscula(erro), texto);
        return;
      }
      errosCampo.delete("config-vagas");
      mudarFaseFinal(`classificados para a fase final: ${vagas}`, (c) => ({ ...c, vagasFaseFinal: vagas }));
    }

    // Com grupos, o total de classificados é grupos × classificados por grupo. O número por grupo não
    // pode passar do menor grupo já formado.
    function mudarClassificadosPorGrupo(texto) {
      const id = "config-classificados-grupo";
      const t = texto.trim();
      const k = /^\d+$/.test(t) ? Number(t) : NaN;
      const cfg = app.config();
      const nova = { ...cfg, grupos: { ...cfg.grupos, classificados: k }, vagasFaseFinal: cfg.grupos.quantidade * k };
      const jogadores = estado.atual().campeonato.jogadores;
      const tamanhos = Regras.jogadoresPorGrupo(jogadores, cfg.grupos.quantidade).map((g) => g.ids.length).filter(Boolean);
      const menor = jogadores.length && jogadores.every((j) => j.grupo) && tamanhos.length ? Math.min(...tamanhos) : Infinity;
      const erro = !(k >= 1) ? "use um número de 1 a 99."
        : k > menor ? `o menor grupo tem ${plural(menor, "jogador", "jogadores")}: no máximo ${menor} por grupo.`
        : Regras.validarConfig(nova);
      if (erro) {
        marcarErro(id, comMaiuscula(erro), texto);
        return;
      }
      errosCampo.delete(id);
      mudarFaseFinal(`classificados por grupo: ${k}`, () => nova);
    }

    // ---------- formato (liga única ou fase de grupos) ----------
    // Muda o sorteio: só antes de confirmar o calendário. Trocar o formato ou o número de grupos
    // desfaz os grupos formados e o calendário sorteado.

    function mudarFormato(comGrupos) {
      if (cadastroTravado()) return;
      const cfg = app.config();
      if (comGrupos === Regras.usaGrupos(cfg)) return;
      let nova;
      if (comGrupos) {
        const classificados = Math.max(2, Math.floor(cfg.vagasFaseFinal / 2));
        nova = { ...cfg, grupos: { quantidade: 2, classificados }, vagasFaseFinal: 2 * classificados };
      } else {
        nova = { ...cfg, grupos: null };
      }
      const erro = Regras.validarConfig(nova);
      if (erro) { marcarErro("config-formato", comMaiuscula(erro)); return; }
      errosCampo.delete("config-formato");
      estado.modificar(comGrupos ? "formato: fase de grupos" : "formato: liga única", (s) => {
        s.campeonato.config = nova;
        s.campeonato.jogadores = s.campeonato.jogadores.map(({ grupo, ...j }) => j);
        s.campeonato.sorteio = null;
      });
    }

    function mudarQuantidadeDeGrupos(quantidade) {
      if (cadastroTravado()) return;
      const cfg = app.config();
      const nova = { ...cfg, grupos: { ...cfg.grupos, quantidade }, vagasFaseFinal: quantidade * cfg.grupos.classificados };
      const erro = Regras.validarConfig(nova);
      if (erro) { marcarErro("config-grupos", comMaiuscula(erro)); return; }
      errosCampo.delete("config-grupos");
      if (!estado.modificar(`número de grupos: ${quantidade}`, (s) => {
        s.campeonato.config = nova;
        s.campeonato.jogadores = s.campeonato.jogadores.map(({ grupo, ...j }) => j);
        s.campeonato.sorteio = null;
      })) {
        renderizar();
      }
    }

    function blocoFormato(atual) {
      const cfg = atual.campeonato.config;
      const travado = Regras.cadastroTravado(atual.campeonato, atual.jogos);
      const grupos = cfg.grupos;
      const quantidades = Array.from({ length: Regras.MAX_GRUPOS - Regras.MIN_GRUPOS + 1 }, (_, i) => Regras.MIN_GRUPOS + i);
      return el("div", { class: "formato", id: "formato" },
        el("span", { class: "rotulo-aparencia" }, "Formato"),
        el("div", { class: "config-campeonato" },
          campoConfig("formato-tipo", "Temporada", el("select", {
            id: "config-formato", disabled: travado, ...atributosDeErro("config-formato"),
            onchange: (ev) => mudarFormato(ev.target.value === "grupos"),
          }, el("option", { value: "liga", selected: !grupos }, "Liga única"), el("option", { value: "grupos", selected: Boolean(grupos) }, "Fase de grupos"))),
          grupos && campoConfig("numero", "Grupos", el("select", {
            id: "config-grupos", disabled: travado, ...atributosDeErro("config-grupos"),
            onchange: (ev) => mudarQuantidadeDeGrupos(Number(ev.target.value)),
          }, quantidades.map((n) => el("option", { value: String(n), selected: n === grupos.quantidade }, String(n)))))),
        el("span", { class: "legenda" }, grupos
          ? `Cada grupo tem o seu sorteio, com parceiros e adversários só do próprio grupo; os ${grupos.classificados} primeiros de cada grupo vão para a fase final. `
            + (travado ? "" : "Mudar o formato ou o número de grupos desfaz os grupos formados e o calendário sorteado.")
          : "Todos jogam contra todos numa classificação única."));
    }

    function mudarJogosDaRodada(id, nome, jogos) {
      mudarFaseFinal(`${nome}: ${OPCOES_JOGOS.find(([n]) => n === jogos)[1].toLowerCase()}`, (c) => {
        const melhorDe = { ...c.melhorDe, [id]: jogos };
        if (jogos === (id === "final" ? 3 : 1)) delete melhorDe[id]; // o padrão não precisa ficar guardado
        return { ...c, melhorDe };
      });
    }

    function blocoFaseFinal(atual) {
      const cfg = atual.campeonato.config;
      const gerado = Boolean(atual.mataMata);
      const formato = Regras.formatoDaConfig(cfg);
      const estrutura = Regras.estruturaDoMataMata(formato);
      const temSemifinais = Regras.estruturaDoMataMata({ ...formato, terceiroLugar: true }).terceiro !== null;
      const jogosDe = (id, padrao) => cfg.melhorDe[id] || padrao;
      const seletor = (id, nome, padrao) => campoConfig("fase-final-jogos", `Jogos: ${nome}`, el("select", {
        id: `config-jogos-${id}`, disabled: gerado,
        onchange: (ev) => mudarJogosDaRodada(id, `jogos (${nome})`, Number(ev.target.value)),
      }, OPCOES_JOGOS.map(([n, rotulo]) => el("option", { value: String(n), selected: n === jogosDe(id, padrao) }, rotulo))));

      const campoNumerico = (id, valor, onchange) => el("input", {
        id, type: "text", inputmode: "numeric", maxlength: "2", autocomplete: "off",
        value: valorDo(id, String(valor)), disabled: gerado, ...atributosDeErro(id),
        onchange: (ev) => onchange(ev.target.value),
        onkeydown: (ev) => { if (ev.key === "Enter") { ev.preventDefault(); ev.target.blur(); } },
        onfocus: (ev) => ev.target.select(),
      });

      return el("div", { class: "fase-final", id: "fase-final" },
        el("span", { class: "rotulo-aparencia" }, "Fase final"),
        el("div", { class: "config-campeonato" },
          cfg.grupos
            ? campoConfig("numero", "Classificados por grupo", campoNumerico("config-classificados-grupo", cfg.grupos.classificados, mudarClassificadosPorGrupo))
            : campoConfig("numero", "Classificados", campoNumerico("config-vagas", cfg.vagasFaseFinal, mudarVagas)),
          el("label", { class: "campo-aparencia", title: temSemifinais ? null : "A disputa de 3º lugar precisa de duas semifinais" },
            el("input", {
              id: "config-terceiro", type: "checkbox", checked: cfg.terceiroLugar && temSemifinais, disabled: gerado || !temSemifinais,
              onchange: (ev) => mudarFaseFinal(`disputa de 3º lugar: ${ev.target.checked ? "sim" : "não"}`, (c) => ({ ...c, terceiroLugar: ev.target.checked })),
            }), "Disputa de 3º lugar"),
          estrutura.rodadas.map((r) => seletor(r.id, r.nome, r.id === "final" ? 3 : 1)),
          estrutura.terceiro ? seletor("terceiro", "3º lugar", 1) : null),
        el("span", { class: "legenda" }, gerado
          ? "Chaveamento já gerado: para mudar a fase final, apague o chaveamento na aba Mata-mata."
          : (cfg.grupos ? `${cfg.grupos.quantidade} grupos × ${cfg.grupos.classificados} = ${plural(cfg.vagasFaseFinal, "classificado", "classificados")}, semeados pela campanha; ` : "")
            + `${plural(Math.ceil(cfg.vagasFaseFinal / 2), "dupla", "duplas")} no mata-mata`
            + (cfg.vagasFaseFinal % 2 ? "; com número ímpar, um jogador fica sem dupla e você escolhe o parceiro dele." : ".")));
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
        blocoFormato(atual),
        blocoFaseFinal(atual),
        el("p", { class: "diagnostico", id: "diagnostico" },
          `${plural(diag.jogadores, "jogador", "jogadores")} × ${plural(camp.config.jogosPorJogador, "jogo", "jogos")} ÷ 4 = ${plural(diag.totalJogos, "jogo", "jogos")} · ${porSemana} por semana em ${plural(camp.config.semanas, "semana", "semanas")}`
          + (diag.grupos ? ` · ${diag.grupos.length} grupos de ${tamanhosDosGrupos(diag.grupos)}` : "")),
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
