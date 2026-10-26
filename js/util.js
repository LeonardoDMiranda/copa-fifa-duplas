// Utilitários de apresentação compartilhados por ui.js, js/telas/*.js, telao.js e exportar.js.
// Regras de negócio NÃO ficam aqui: elas ficam em regras.js.

(function () {
  "use strict";

  // Cria um elemento: props = atributos, "class", "dataset", propriedades (disabled, selected...)
  // e "onxxx" (eventos). Filhos nulos/false são ignorados e arrays são achatados.
  function el(tag, props = {}, ...filhos) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "dataset") Object.assign(e.dataset, v);
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (k in e && typeof v !== "string") e[k] = v;
      else e.setAttribute(k, v === true ? "" : v);
    }
    e.append(...filhos.flat(Infinity).filter((f) => f !== null && f !== undefined && f !== false));
    return e;
  }

  // ---------- textos ----------

  // "1 jogador" / "0 jogadores" / "3 jogadores".
  function plural(n, singular, formaPlural) {
    return `${numero(n)} ${n === 1 ? singular : formaPlural}`;
  }

  // Número no formato brasileiro ("1.234", "4,5"), com `casas` decimais fixas.
  function numero(x, casas = 0) {
    return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(x);
  }

  // "Semana 3 · Jogo 2": como o organizador se refere a um jogo (o id interno nunca aparece).
  function rotuloDoJogo(jogo, numeros) {
    return `Semana ${Regras.semanaDoJogo(jogo)} · Jogo ${numeros.get(jogo.id)}`;
  }

  // ---------- botões e campos ----------

  // Botão só com ícone: o `rotulo` vira o nome acessível (aria-label) e a dica (title).
  // props = as mesmas de el() (id, class, onclick, disabled...).
  function botaoIcone({ icone, rotulo, ...props }) {
    return el("button", { type: "button", ...props, class: `botao-icone ${props.class || ""}`.trim(), "aria-label": rotulo, title: rotulo },
      Icones.svg(icone));
  }

  // Erro de um campo, mostrado logo abaixo dele. O campo aponta para a mensagem com
  // atributosDeErro(idMensagem, mensagem) e a mensagem é desenhada por mensagemDeErro.
  function atributosDeErro(idMensagem, mensagem) {
    return mensagem ? { "aria-invalid": "true", "aria-describedby": idMensagem } : {};
  }

  function mensagemDeErro(idMensagem, mensagem) {
    if (!mensagem) return null;
    return el("p", { class: "erro-campo", id: idMensagem }, Icones.svg("alerta"), el("span", {}, mensagem));
  }

  // Texto de uma mensagem em blocos: parágrafos separados por linha em branco; um bloco em que
  // todas as linhas começam com "- " vira lista.
  function blocosDeTexto(texto) {
    return String(texto).split(/\n\s*\n/).map((bloco) => {
      const linhas = bloco.split("\n").filter((l) => l.trim());
      if (linhas.length && linhas.every((l) => l.startsWith("- "))) {
        return el("ul", {}, linhas.map((l) => el("li", {}, l.slice(2))));
      }
      return el("p", {}, linhas.join(" "));
    });
  }

  // Janela com várias opções. Devolve uma Promise com o `valor` da opção escolhida, ou null
  // (Esc ou "Cancelar"). opcoes = [{ valor, rotulo, id?, classe? }], da esquerda para a direita;
  // `foco` = valor da opção que começa com o foco (padrão: a última). extras = [{ rotulo, id?,
  // aoClicar }]: botões à esquerda que fazem algo sem fechar a janela (ex.: exportar antes).
  // corpo = elemento opcional entre o texto e os botões (campos, caixas de seleção); quem o cria
  // guarda as referências e lê os valores depois do await, pois os nós continuam existindo.
  function escolher(mensagem, { titulo, opcoes, foco = null, extras = [], corpo = null }) {
    return new Promise((resolver) => {
      const dialogo = el("dialog", { class: "dialogo", "aria-labelledby": "dialogo-titulo" },
        el("form", { method: "dialog" },
          el("h2", { id: "dialogo-titulo" }, titulo),
          mensagem && el("div", { class: "dialogo-texto" }, blocosDeTexto(mensagem)),
          corpo,
          el("div", { class: "dialogo-acoes" },
            extras.map((x) => el("button", { type: "button", id: x.id, class: "dialogo-extra", onclick: x.aoClicar }, x.rotulo)),
            el("button", { type: "submit", id: "dialogo-cancelar", value: "" }, "Cancelar"),
            opcoes.map((o) => el("button", { type: "submit", id: o.id, value: o.valor, class: o.classe || null }, o.rotulo)))));
      dialogo.addEventListener("close", () => {
        dialogo.remove();
        resolver(opcoes.some((o) => o.valor === dialogo.returnValue) ? dialogo.returnValue : null);
      });
      document.body.appendChild(dialogo);
      dialogo.showModal();
      const inicial = foco === "" ? "" : foco ?? opcoes[opcoes.length - 1].valor;
      dialogo.querySelector(`button[type="submit"][value="${inicial}"]`).focus();
    });
  }

  // Janela de confirmação no lugar do confirm() do navegador. Devolve uma Promise<boolean>.
  // Esc ou "Cancelar" = false. Em ações perigosas o botão de ação fica vermelho e o foco
  // começa em "Cancelar", para Enter não confirmar sem querer.
  async function confirmar(mensagem, { titulo = "Confirmar?", acao = "Confirmar", perigo = false, extras = [] } = {}) {
    const escolha = await escolher(mensagem, {
      titulo,
      opcoes: [{ valor: "ok", id: "dialogo-ok", rotulo: acao, classe: perigo ? "perigo-forte" : "primario" }],
      foco: perigo ? "" : "ok",
      extras,
    });
    return escolha === "ok";
  }

  const MAX_GOLS = 99;

  // Texto digitado num campo de placar: { vazio } | { invalido } | { valor }.
  function lerGols(texto) {
    const t = texto.trim();
    if (t === "") return { vazio: true };
    if (!/^\d+$/.test(t) || Number(t) > MAX_GOLS) return { invalido: true };
    return { valor: Number(t) };
  }

  function formatarSaldo(sg) {
    return sg > 0 ? `+${sg}` : String(sg);
  }

  function dois(n) {
    return String(n).padStart(2, "0");
  }

  // "Copa FIFA 2027 – Duplas" -> "copa-fifa-2027-duplas": para nomes de arquivo.
  function slug(texto) {
    return String(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "campeonato";
  }

  // "2026-10-02-153045": usado nos nomes dos arquivos baixados.
  function carimbo(data) {
    return `${data.getFullYear()}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}`
      + `-${dois(data.getHours())}${dois(data.getMinutes())}${dois(data.getSeconds())}`;
  }

  // ---------- cor e logo do campeonato ----------

  // Contraste entre duas cores "#rrggbb", pela fórmula do WCAG (1 a 21).
  function contraste(cor1, cor2) {
    const luminancia = (hex) => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [clara, escura] = [luminancia(cor1), luminancia(cor2)].sort((a, b) => b - a);
    return (clara + 0.05) / (escura + 0.05);
  }

  const CONTRASTE_MINIMO = 4.5; // texto normal (WCAG AA)

  // O cabeçalho, o telão e os PNGs escrevem em branco sobre a cor do campeonato.
  function corLegivelComBranco(cor) {
    return /^#[0-9a-fA-F]{6}$/.test(cor) && contraste(cor, "#ffffff") >= CONTRASTE_MINIMO;
  }

  function carregarImagem(src) {
    return new Promise((resolver, rejeitar) => {
      const img = new Image();
      img.onload = () => resolver(img);
      img.onerror = () => rejeitar(new Error("não foi possível ler a imagem."));
      img.src = src;
    });
  }

  const LOGO_LARGURA = 256;
  const LOGO_ALTURA = 128;

  // Reduz a imagem escolhida para caber em 256×128 (sem aumentar) e devolve uma data URL (PNG ou,
  // se ficar grande, WebP), que fica guardada nos dados do campeonato. Lança Error se não der.
  async function prepararLogo(arquivo) {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(arquivo.type)) throw new Error("use uma imagem PNG, JPG ou WebP.");
    const url = URL.createObjectURL(arquivo);
    try {
      const img = await carregarImagem(url);
      const escala = Math.min(1, LOGO_LARGURA / img.naturalWidth, LOGO_ALTURA / img.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const [tipo, qualidade] of [["image/png"], ["image/webp", 0.9], ["image/webp", 0.7]]) {
        const dados = canvas.toDataURL(tipo, qualidade);
        if (dados.startsWith(`data:${tipo};`) && dados.length <= Estado.MAX_CARACTERES_LOGO) return dados;
      }
      throw new Error("a imagem ficou grande demais mesmo reduzida; tente uma mais simples.");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // ---------- telas ----------

  // Elemento de id `id` dentro da raiz de uma tela (ids de jogadores importados podem ter qualquer caractere).
  function buscar(raiz, id) {
    return raiz.querySelector(`#${CSS.escape(id)}`);
  }

  // Tela vazia ou etapa pendente: diz o que falta e, com `aba`, leva até a aba onde se resolve.
  function proximoPasso(texto, aba, rotulo, irParaAba) {
    return el("div", { class: "vazio" },
      el("p", {}, texto),
      aba && el("button", { type: "button", class: "primario", dataset: { ir: aba }, onclick: () => irParaAba(aba) }, rotulo));
  }

  // id do jogo -> número do jogo dentro da sua semana (Regras.numerosNaSemana), guardado enquanto
  // a lista não muda.
  let cacheNumeros = { jogos: null, mapa: null };
  function numerosNaSemana(jogos) {
    if (cacheNumeros.jogos !== jogos) cacheNumeros = { jogos, mapa: Regras.numerosNaSemana(jogos) };
    return cacheNumeros.mapa;
  }

  // Classe CSS (com espaço na frente) do lado de um jogo de classificação, conforme o resultado.
  function classeDoLado(resultado, lado) {
    if (resultado && resultado.tipo === "anulado") return " anulada";
    const ef = Regras.efeitosDoResultado(resultado);
    if (!ef) return "";
    if (ef[lado].v) return " vencedora";
    if (ef[lado].d) return " perdedora";
    return " empate";
  }

  // Nome de cada confronto do mata-mata (tela do Mata-mata e ficha do jogador).
  // Nome do confronto na tela, para qualquer chave do chaveamento ("semi1", "quartas3", "final"...).
  const ROTULOS_MATA_MATA = new Proxy({}, { get: (_, chave) => (typeof chave === "string" ? Regras.rotuloDoConfronto(chave) : undefined) });

  // Nome de um jogador que abre a ficha dele (js/telas/ficha.js). `idDom` precisa ser único na tela:
  // o mesmo jogador pode aparecer em vários lugares (top 8, cartão do jogo...).
  function botaoJogador(id, nome, idDom, abrirFicha) {
    return el("button", {
      type: "button", id: idDom, class: "nome-jogador-btn", "aria-haspopup": "dialog", title: `Ver a ficha de ${nome}`,
      onclick: (ev) => abrirFicha(id, ev.currentTarget),
    }, nome);
  }

  // ---------- situação para o top 8 (coluna da Classificação e ficha do jogador) ----------

  // Situação (Regras.calcularSituacoes) de cada jogador ao vivo, ou null com pendentes demais
  // (ver Regras.limitePendentesSituacoes). O cálculo enumera até Regras.MAX_CENARIOS_SITUACOES
  // cenários: só refaz quando jogos, desempates ou jogadores mudam.
  // Com fase de grupos, as situações dos grupos em que o cálculo cabe, juntas (null se não cabe em nenhum).
  let cacheSituacoes = { chave: null, valor: null };
  function situacoes(base, atual) {
    if (Regras.usaGrupos(atual.campeonato.config)) {
      const disponiveis = situacoesDosGrupos(base, atual).filter((g) => g.situacoes);
      return disponiveis.length ? disponiveis.flatMap((g) => g.situacoes) : null;
    }
    const chave = JSON.stringify([atual.jogos.map((j) => j.resultado), atual.desempatesManuais, atual.campeonato]);
    if (cacheSituacoes.chave !== chave) {
      cacheSituacoes = { chave, valor: Regras.calcularSituacoes(base, atual.jogos, atual.desempatesManuais, atual.campeonato.config) };
    }
    return cacheSituacoes.valor;
  }

  // Situação grupo a grupo (Regras.situacoesDosGrupos), com o mesmo cache: [{ grupo, pendentes, situacoes }].
  let cacheSituacoesDosGrupos = { chave: null, valor: null };
  function situacoesDosGrupos(base, atual) {
    const chave = JSON.stringify([atual.jogos.map((j) => j.resultado), atual.desempatesManuais, atual.campeonato]);
    if (cacheSituacoesDosGrupos.chave !== chave) {
      cacheSituacoesDosGrupos = { chave, valor: Regras.situacoesDosGrupos(base, atual.jogos, atual.desempatesManuais, atual.campeonato.config) };
    }
    return cacheSituacoesDosGrupos.valor;
  }

  // Ícone e texto de cada situação.
  const SITUACOES = {
    garantido: { icone: "ok", texto: "Garantido" },
    disputa: { icone: "disputa", texto: "Em disputa" },
    eliminado: { icone: "eliminado", texto: "Eliminado" },
  };

  // "Próximo: Semana 8 · Jogo 3" (+N se ainda joga mais depois), ou "não joga mais", e as marcas
  // de quem depende do saldo ou do desempate. Só para quem está em disputa.
  function detalhesDaDisputa(s, jogos) {
    const detalhes = [];
    if (s.jogosPendentes.length) {
      const proximo = jogos.find((j) => j.id === s.jogosPendentes[0]);
      const mais = s.jogosPendentes.length - 1;
      detalhes.push(el("div", { class: "proximo-jogo" },
        `Próximo: ${rotuloDoJogo(proximo, numerosNaSemana(jogos))}`,
        mais > 0 && el("span", { class: "tag-repete", title: `Joga mais ${mais} depois deste` },
          el("span", { "aria-hidden": "true" }, `+${mais}`),
          el("span", { class: "so-leitor" }, `, joga mais ${mais} depois deste`))));
    } else {
      detalhes.push(el("div", { class: "nao-joga" }, "Não joga mais, só pode cair"));
    }
    const marcas = [];
    if (s.dependeDoSaldo) marcas.push(el("span", { class: "tag-saldo" }, "depende do saldo"));
    if (s.dependeDoDesempate) marcas.push(el("span", { class: "tag-saldo" }, Icones.svg("empate"), "depende do desempate"));
    if (marcas.length) detalhes.push(el("div", { class: "marcas" }, marcas));
    return detalhes;
  }

  // A situação com ícone e, para quem está em disputa, os detalhes.
  function marcaSituacao(s, jogos) {
    const { icone, texto } = SITUACOES[s.situacao];
    return [
      el("span", { class: "marca-situacao" }, Icones.svg(icone), texto),
      s.situacao === "disputa" && detalhesDaDisputa(s, jogos),
    ];
  }

  globalThis.Util = {
    el, escolher, confirmar, MAX_GOLS, lerGols, formatarSaldo, dois, carimbo, slug, classeDoLado,
    contraste, CONTRASTE_MINIMO, corLegivelComBranco, carregarImagem, prepararLogo,
    buscar, proximoPasso, numerosNaSemana,
    plural, numero, rotuloDoJogo, botaoIcone, atributosDeErro, mensagemDeErro,
    botaoJogador, situacoes, situacoesDosGrupos, marcaSituacao, ROTULOS_MATA_MATA,
  };
})();
