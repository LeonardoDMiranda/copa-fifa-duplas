// Geração de PNG via Canvas API (sem bibliotecas). Recebe dados já calculados por
// regras.js (classificação, mata-mata resolvido) e só desenha.

(function () {
  "use strict";

  const LARGURA = 1080; // legível no celular; o WhatsApp reduz imagens com lado maior > ~1600 px
  const MARGEM = 40;
  const FONTE = '"Segoe UI", system-ui, sans-serif';
  const { formatarSaldo, dois, carimbo } = Util;
  const { VAGAS_FASE_FINAL } = Regras;
  const CORES = {
    fundo: "#eef1f5",
    superficie: "#ffffff",
    texto: "#1b2430",
    suave: "#5b6675",
    borda: "#dde2e9",
    primaria: "#0d3b66",
    classificado: "#e3f5e8",
    classificadoBorda: "#2e9e4a",
    sobe: "#1f8a3d",
    desce: "#c62828",
    pendente: "#c9a227",
    manual: "#4b2a8f",
    ouro: "#fff6d1", ouroBorda: "#e6c34a",
    prata: "#f1f3f6", prataBorda: "#b8c2cf",
    bronze: "#f8eadf", bronzeBorda: "#d4a57c",
  };

  // ---------- utilitários de desenho ----------

  function criarCanvas(altura) {
    const canvas = document.createElement("canvas");
    canvas.width = LARGURA;
    canvas.height = altura;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = CORES.fundo;
    ctx.fillRect(0, 0, LARGURA, altura);
    ctx.textBaseline = "middle";
    return { canvas, ctx };
  }

  function definirFonte(ctx, tamanho, peso, italico) {
    ctx.font = `${italico ? "italic " : ""}${peso} ${tamanho}px ${FONTE}`;
  }

  // Escreve texto; se passar de larguraMax, reduz a fonte até 75% e depois corta com "…".
  // Retorna a largura final desenhada.
  function escrever(ctx, texto, x, y, opcoes = {}) {
    const { tamanho = 24, peso = 400, cor = CORES.texto, alinhar = "left", larguraMax, italico = false } = opcoes;
    let tam = tamanho;
    let t = String(texto);
    definirFonte(ctx, tam, peso, italico);
    if (larguraMax) {
      while (ctx.measureText(t).width > larguraMax && tam > tamanho * 0.75) definirFonte(ctx, --tam, peso, italico);
      if (ctx.measureText(t).width > larguraMax) {
        while (t.length > 1 && ctx.measureText(`${t}…`).width > larguraMax) t = t.slice(0, -1);
        t += "…";
      }
    }
    ctx.fillStyle = cor;
    ctx.textAlign = alinhar;
    ctx.fillText(t, x, y);
    return ctx.measureText(t).width;
  }

  function retangulo(ctx, x, y, w, h, { cor, borda, raio = 10, larguraBorda = 2 } = {}) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, raio);
    if (cor) { ctx.fillStyle = cor; ctx.fill(); }
    if (borda) { ctx.strokeStyle = borda; ctx.lineWidth = larguraBorda; ctx.stroke(); }
  }

  function formatarDataHora(data) {
    return `${dois(data.getDate())}/${dois(data.getMonth() + 1)}/${data.getFullYear()} às `
      + `${dois(data.getHours())}:${dois(data.getMinutes())}`;
  }

  const TITULO_PADRAO = "Copa FIFA em Duplas";

  function cabecalho(ctx, titulo, subtitulo, geradoEm) {
    ctx.fillStyle = CORES.primaria;
    ctx.fillRect(0, 0, LARGURA, 150);
    escrever(ctx, titulo, MARGEM, 58, { tamanho: 52, peso: 700, cor: "#ffffff", larguraMax: LARGURA - 2 * MARGEM });
    escrever(ctx, subtitulo, MARGEM, 112, { tamanho: 26, cor: "rgba(255,255,255,.85)", larguraMax: 640 });
    escrever(ctx, `Gerado em ${formatarDataHora(geradoEm)}`, LARGURA - MARGEM, 112,
      { tamanho: 22, cor: "rgba(255,255,255,.7)", alinhar: "right" });
  }

  // ---------- classificação ----------

  const ALTURA_LINHA = 39; // 32 linhas cabem em < 1600 px de altura (limite de redução do WhatsApp)
  const ALTURA_MAXIMA = 1600;
  const ALTURA_FIXA = 176 + 16 + 44 + 110; // painel + cabeçalho da tabela + títulos + rodapé
  // Centro de cada coluna numérica.
  const COLUNAS = [
    ["Pts", "pontos", 590], ["V", "v", 655], ["E", "e", 710], ["D", "d", 765],
    ["GP", "gp", 830], ["GC", "gc", 895], ["SG", "sg", 960], ["J", "jogos", 1015],
  ];

  // Altura de cada linha: 39 px; com jogadores demais para caber em 1600 px, diminui (mínimo 18).
  function alturaDaLinha(quantidade) {
    if (!quantidade) return ALTURA_LINHA;
    return Math.max(18, Math.min(ALTURA_LINHA, Math.floor((ALTURA_MAXIMA - ALTURA_FIXA) / quantidade)));
  }

  // tabela = Regras.calcularClassificacao(...)
  // info = { geradoEm, nome (do campeonato), semana (null = ao vivo), lancados, totalJogos }
  function desenharClassificacao(tabela, info) {
    const alt = alturaDaLinha(tabela.length);
    const k = alt / ALTURA_LINHA; // fonte acompanha a altura da linha
    const fonte = (px) => Math.max(10, Math.round(px * k));
    const topoPainel = 176;
    const topoCabecalho = topoPainel + 16;
    const topoLinhas = topoCabecalho + 44;
    const fimLinhas = topoLinhas + tabela.length * alt;
    const altura = fimLinhas + 110;
    const { canvas, ctx } = criarCanvas(altura);

    let situacao;
    if (info.semana) situacao = `após a semana ${info.semana}`;
    else if (!info.totalJogos) situacao = "sem jogos";
    else if (info.lancados === info.totalJogos) situacao = "todos os jogos lançados";
    else situacao = `${info.lancados}/${info.totalJogos} jogos lançados`;
    cabecalho(ctx, info.nome || TITULO_PADRAO, `Classificação · ${situacao}`, info.geradoEm);
    retangulo(ctx, MARGEM - 16, topoPainel, LARGURA - 2 * (MARGEM - 16), fimLinhas - topoPainel + 16,
      { cor: CORES.superficie, raio: 14 });

    // Cabeçalho da tabela
    const yCab = topoCabecalho + 22;
    const estiloCab = { tamanho: 20, peso: 700, cor: CORES.suave };
    escrever(ctx, "POS", MARGEM + 8, yCab, estiloCab);
    escrever(ctx, "JOGADOR", MARGEM + 140, yCab, estiloCab);
    for (const [rotulo, , x] of COLUNAS) escrever(ctx, rotulo, x, yCab, { ...estiloCab, alinhar: "center" });

    tabela.forEach((linha, i) => {
      const y = topoLinhas + i * alt;
      const meio = y + alt / 2;
      if (linha.posicao <= VAGAS_FASE_FINAL) {
        ctx.fillStyle = CORES.classificado;
        ctx.fillRect(MARGEM - 8, y, LARGURA - 2 * (MARGEM - 8), alt);
        ctx.fillStyle = CORES.classificadoBorda;
        ctx.fillRect(MARGEM - 8, y, 5, alt);
      }
      ctx.fillStyle = linha.posicao === VAGAS_FASE_FINAL ? CORES.classificadoBorda : CORES.borda;
      ctx.fillRect(MARGEM - 8, y + alt - (linha.posicao === VAGAS_FASE_FINAL ? 3 : 1),
        LARGURA - 2 * (MARGEM - 8), linha.posicao === VAGAS_FASE_FINAL ? 3 : 1);

      escrever(ctx, `${linha.posicao}º`, MARGEM + 8, meio, { tamanho: fonte(25), peso: 700 });
      if (linha.variacao > 0) escrever(ctx, `▲${linha.variacao}`, MARGEM + 72, meio, { tamanho: fonte(19), cor: CORES.sobe });
      if (linha.variacao < 0) escrever(ctx, `▼${-linha.variacao}`, MARGEM + 72, meio, { tamanho: fonte(19), cor: CORES.desce });

      const larguraNome = escrever(ctx, linha.nome, MARGEM + 140, meio, { tamanho: fonte(26), peso: 600, larguraMax: 330 });
      if (linha.empateTecnico) escrever(ctx, "⚖️", MARGEM + 140 + larguraNome + 8, meio, { tamanho: fonte(20) });

      for (const [, campo, x] of COLUNAS) {
        const valor = campo === "sg" ? formatarSaldo(linha.sg) : linha[campo];
        escrever(ctx, valor, x, meio, { tamanho: fonte(25), peso: campo === "pontos" ? 700 : 400, alinhar: "center" });
      }
    });

    escrever(ctx, "Em verde, o top 8, que vai para a fase final.", MARGEM, fimLinhas + 50, { tamanho: 21, cor: CORES.suave });
    escrever(ctx, "▲▼ variação em relação à semana anterior · ⚖️ empate técnico (ordem definida pela organização)",
      MARGEM, fimLinhas + 82, { tamanho: 19, cor: CORES.suave, larguraMax: LARGURA - 2 * MARGEM });
    return canvas;
  }

  // ---------- mata-mata ----------

  const ROTULOS = { semi1: "Semifinal 1", semi2: "Semifinal 2", terceiro: "Disputa de 3º lugar", final: "Final" };
  const ORIGEM = {
    terceiro: ["Perdedor da Semi 1", "Perdedor da Semi 2"],
    final: ["Vencedor da Semi 1", "Vencedor da Semi 2"],
  };
  const ALTURA_CONFRONTO = 214;

  function placarTexto(a, b) {
    return `${a} × ${b}`;
  }

  // Resumo de uma partida além do tempo normal: "pror. 0 × 0 · pên. 4 × 3".
  function extrasDaPartida(p, analise) {
    const partes = [];
    const etapa = analise.decididoEm || analise.precisa;
    if ((etapa === "prorrogacao" || etapa === "penaltis") && p.prorrogacao1 != null && p.prorrogacao2 != null) {
      partes.push(`prorrogação ${placarTexto(p.prorrogacao1, p.prorrogacao2)}`);
    }
    if (etapa === "penaltis" && p.penaltis1 != null && p.penaltis2 != null) {
      partes.push(`pênaltis ${placarTexto(p.penaltis1, p.penaltis2)}`);
    }
    return partes.join(" · ");
  }

  function desenharConfronto(ctx, c, nomePorId, x, y, w) {
    const decidido = Boolean(c.serie.vencedor);
    retangulo(ctx, x, y, w, ALTURA_CONFRONTO, { cor: CORES.superficie, raio: 12 });
    ctx.fillStyle = decidido ? CORES.classificadoBorda : CORES.pendente;
    ctx.fillRect(x, y + 10, 6, ALTURA_CONFRONTO - 20);

    const titulo = `${ROTULOS[c.chave].toUpperCase()} · ${c.melhorDe > 1 ? `MELHOR DE ${c.melhorDe}` : "JOGO ÚNICO"}`;
    escrever(ctx, titulo, x + 22, y + 30, { tamanho: 20, peso: 700, cor: CORES.suave, larguraMax: w - 44 });

    [1, 2].forEach((lado) => {
      const yLinha = y + 52 + (lado - 1) * 56;
      const dupla = c[`dupla${lado}`];
      const venceu = c.serie.vencedor === lado;
      if (venceu) retangulo(ctx, x + 14, yLinha, w - 28, 50, { cor: CORES.classificado, raio: 8 });
      const meio = yLinha + 25;
      if (dupla) {
        const nomes = dupla.map((id) => nomePorId.get(id)).join(" + ");
        const larg = escrever(ctx, nomes, x + 26, meio,
          { tamanho: 27, peso: venceu ? 700 : 500, cor: decidido && !venceu ? CORES.suave : CORES.texto, larguraMax: w - 150 });
        if (c[`lado${lado}`].manual) {
          escrever(ctx, "*", x + 26 + larg + 4, meio - 6, { tamanho: 24, peso: 700, cor: CORES.manual });
        }
      } else {
        const origem = (ORIGEM[c.chave] || ["A definir", "A definir"])[lado - 1];
        escrever(ctx, origem, x + 26, meio, { tamanho: 25, cor: CORES.suave, italico: true, larguraMax: w - 150 });
      }
      escrever(ctx, valorDoLado(c, lado), x + w - 40, meio, { tamanho: 36, peso: 700, alinhar: "center" });
    });

    escrever(ctx, detalheDoConfronto(c), x + 26, y + ALTURA_CONFRONTO - 32,
      { tamanho: 20, cor: CORES.suave, larguraMax: w - 52 });
  }

  // Número grande ao lado de cada dupla: gols (jogo único) ou vitórias na série (final).
  function valorDoLado(c, lado) {
    if (c.melhorDe > 1) return c.pronto && c.partidas.length ? c.serie.vitorias[lado - 1] : "–";
    const gols = (c.partidas[0] || {})[`gols${lado}`];
    return gols != null ? gols : "–";
  }

  // Linha de detalhes de um confronto resolvido (também usada no modo telão).
  function detalheDoConfronto(c) {
    const partida = c.partidas[0] || {};
    let detalhe = "";
    if (c.melhorDe > 1) {
      detalhe = c.partidas.map((p, i) => {
        const extras = extrasDaPartida(p, c.serie.analises[i] || {});
        const gols = p.gols1 != null && p.gols2 != null ? placarTexto(p.gols1, p.gols2) : "em andamento";
        return `J${i + 1}: ${gols}${extras ? ` (${extras})` : ""}`;
      }).join("  ·  ");
      if (!detalhe) detalhe = c.pronto ? "A jogar" : "Aguardando as semifinais";
    } else if (c.partidas.length) {
      const extras = extrasDaPartida(partida, c.serie.analises[0] || {});
      detalhe = extras ? `Tempo normal ${placarTexto(partida.gols1, partida.gols2)} · ${extras}` : "";
      if (!c.serie.vencedor && !detalhe) detalhe = "Em andamento";
    } else {
      detalhe = c.pronto ? "A jogar" : "Aguardando as semifinais";
    }
    if (c.lado1.manual || c.lado2.manual) detalhe += `${detalhe ? "  ·  " : ""}* dupla alterada pela organização`;
    return detalhe;
  }

  function desenharPodio(ctx, podio, nomePorId, y) {
    const degraus = [
      ["🥇", "CAMPEÕES", podio.campeoes, CORES.ouro, CORES.ouroBorda, 104],
      ["🥈", "VICE", podio.vice, CORES.prata, CORES.prataBorda, 88],
      ["🥉", "3º LUGAR", podio.terceiro, CORES.bronze, CORES.bronzeBorda, 88],
    ];
    for (const [medalha, titulo, dupla, cor, borda, alt] of degraus) {
      retangulo(ctx, MARGEM - 16, y, LARGURA - 2 * (MARGEM - 16), alt,
        dupla ? { cor, borda } : { cor: CORES.superficie, borda: CORES.borda });
      escrever(ctx, medalha, MARGEM + 6, y + alt / 2, { tamanho: alt > 90 ? 54 : 44 });
      escrever(ctx, titulo, MARGEM + 90, y + alt / 2 - (alt > 90 ? 24 : 20), { tamanho: 19, peso: 700, cor: CORES.suave });
      if (dupla) {
        escrever(ctx, dupla.map((id) => nomePorId.get(id)).join(" e "), MARGEM + 90, y + alt / 2 + 14,
          { tamanho: alt > 90 ? 38 : 32, peso: 700, larguraMax: LARGURA - 2 * MARGEM - 110 });
      } else {
        escrever(ctx, "a definir", MARGEM + 90, y + alt / 2 + 12, { tamanho: 28, cor: CORES.suave, italico: true });
      }
      y += alt + 12;
    }
    return y;
  }

  // mm = Regras.resolverMataMata(...); info = { geradoEm, nome (do campeonato) }
  function desenharMataMata(mm, nomePorId, info) {
    const larguraMeia = (LARGURA - 2 * MARGEM - 20) / 2;
    const larguraCheia = LARGURA - 2 * MARGEM;
    const tituloSecao = 56;
    const espaco = 24;
    const alturaPodio = 104 + 88 + 88 + 3 * 12;
    const altura = 150 + espaco + 3 * (tituloSecao + ALTURA_CONFRONTO + espaco) + tituloSecao + alturaPodio + 30;
    const { canvas, ctx } = criarCanvas(altura);

    let subtitulo = "Mata-mata";
    if (mm.podio.campeoes) subtitulo = "Mata-mata · resultado final";
    else if (mm.final.pronto) subtitulo = "Mata-mata · final";
    cabecalho(ctx, info.nome || TITULO_PADRAO, subtitulo, info.geradoEm);

    const secao = (titulo, y) => escrever(ctx, titulo, MARGEM, y + 30, { tamanho: 26, peso: 700, cor: CORES.primaria });

    let y = 150 + espaco;
    secao("SEMIFINAIS", y);
    y += tituloSecao;
    desenharConfronto(ctx, mm.semi1, nomePorId, MARGEM, y, larguraMeia);
    desenharConfronto(ctx, mm.semi2, nomePorId, MARGEM + larguraMeia + 20, y, larguraMeia);
    y += ALTURA_CONFRONTO + espaco;

    secao("FINAL", y);
    y += tituloSecao;
    desenharConfronto(ctx, mm.final, nomePorId, MARGEM, y, larguraCheia);
    y += ALTURA_CONFRONTO + espaco;

    secao("DISPUTA DE 3º LUGAR", y);
    y += tituloSecao;
    desenharConfronto(ctx, mm.terceiro, nomePorId, MARGEM, y, larguraCheia);
    y += ALTURA_CONFRONTO + espaco;

    secao("PÓDIO", y);
    desenharPodio(ctx, mm.podio, nomePorId, y + tituloSecao);
    return canvas;
  }

  // ---------- download ----------

  function nomeArquivo(prefixo, data) {
    return `${prefixo}-${carimbo(data)}.png`;
  }

  function baixarPNG(canvas, nome) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error("o navegador não gerou a imagem.")); return; }
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = nome;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        resolve(nome);
      }, "image/png");
    });
  }

  globalThis.Exportar = {
    desenharClassificacao, desenharMataMata, alturaDaLinha, nomeArquivo, baixarPNG, valorDoLado, detalheDoConfronto, ORIGEM, LARGURA,
  };
})();
