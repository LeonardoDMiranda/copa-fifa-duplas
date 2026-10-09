// Regras do campeonato (fonte: docs/REGULAMENTO.md).
// FUNÇÕES PURAS: não acessam DOM nem localStorage e não alteram os argumentos.

(function () {
  "use strict";

  const GOLS_WO = 3; // W.O. = 3x0 para a dupla presente

  // Parâmetros do campeonato. Tudo que pode mudar de uma edição para outra fica aqui
  // e é passado às funções por `config` (opcional: sem ele vale o padrão abaixo).
  //   pontosEmpateSemGols: o 0x0 conta como empate (E), mas vale esse tanto de pontos.
  //   vagasFaseFinal: só 8 é suportado (o chaveamento 1º+8º × 2º+7º é fixo).
  const REGRAS_PADRAO = Object.freeze({
    pontosVitoria: 3,
    pontosEmpate: 1,
    pontosEmpateSemGols: 0,
    vagasFaseFinal: 8,
    jogosPorJogador: 6,
    semanas: 8,
  });
  const VAGAS_FASE_FINAL = REGRAS_PADRAO.vagasFaseFinal;

  // "O que está em jogo" enumera todos os cenários dos jogos pendentes (desfechos^pendentes).
  // Acima de 65.536 cenários não calcula: com a pontuação padrão (4 desfechos), 8 jogos.
  const MAX_CENARIOS_SITUACOES = 4 ** 8;
  const MAX_PENDENTES_SITUACOES = limitePendentesSituacoes(REGRAS_PADRAO);

  // Completa uma config parcial com o padrão.
  function normalizarConfig(parcial) {
    return { ...REGRAS_PADRAO, ...(parcial || {}) };
  }

  // Erro de validação da config (texto em português) ou null se estiver tudo certo.
  function validarConfig(config) {
    const c = config;
    if (!c || typeof c !== "object") return "configuração ausente.";
    for (const campo of ["pontosVitoria", "pontosEmpate", "pontosEmpateSemGols"]) {
      if (!Number.isInteger(c[campo]) || c[campo] < 0) return `${campo} precisa ser um inteiro ≥ 0.`;
    }
    for (const campo of ["jogosPorJogador", "semanas"]) {
      if (!Number.isInteger(c[campo]) || c[campo] < 1) return `${campo} precisa ser um inteiro ≥ 1.`;
    }
    if (c.vagasFaseFinal !== VAGAS_FASE_FINAL) {
      return `só ${VAGAS_FASE_FINAL} vagas na fase final é suportado (o chaveamento é fixo).`;
    }
    return null;
  }

  // Base zerada da classificação: um jogador por linha, sem jogos.
  function baseDosJogadores(jogadores) {
    return jogadores.map((j) => ({ id: j.id, nome: j.nome, pontos: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0 }));
  }

  function saldo(linha) {
    return linha.gp - linha.gc;
  }

  function golsValidos(g) {
    return Number.isInteger(g) && g >= 0;
  }

  // Traduz o resultado de um jogo de classificação no que cada dupla recebe.
  // Retorna { 1: efeito, 2: efeito } ou null se o jogo não tem resultado válido
  // (jogo sem placar lançado não conta).
  // efeito = { pontos, v, e, d, gp, gc }
  // Resultado "anulado" (ex.: W.O. das duas duplas, caso que o regulamento deixa para o
  // organizador): o jogo está resolvido, mas não vale pontos, V/E/D nem gols para ninguém.
  function efeitosDoResultado(resultado, config = REGRAS_PADRAO) {
    if (!resultado) return null;

    if (resultado.tipo === "anulado") {
      const nenhum = { pontos: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0 };
      return { 1: nenhum, 2: nenhum };
    }

    if (resultado.tipo === "wo") {
      if (resultado.vencedor !== 1 && resultado.vencedor !== 2) return null;
      const presente = { pontos: config.pontosVitoria, v: 1, e: 0, d: 0, gp: GOLS_WO, gc: 0 };
      const ausente = { pontos: 0, v: 0, e: 0, d: 1, gp: 0, gc: GOLS_WO };
      return resultado.vencedor === 1 ? { 1: presente, 2: ausente } : { 1: ausente, 2: presente };
    }

    if (resultado.tipo === "placar") {
      const { gols1, gols2 } = resultado;
      if (!golsValidos(gols1) || !golsValidos(gols2)) return null;

      const efeito = (feitos, sofridos) => {
        if (feitos > sofridos) return { pontos: config.pontosVitoria, v: 1, e: 0, d: 0, gp: feitos, gc: sofridos };
        if (feitos < sofridos) return { pontos: 0, v: 0, e: 0, d: 1, gp: feitos, gc: sofridos };
        const pontos = feitos > 0 ? config.pontosEmpate : config.pontosEmpateSemGols;
        return { pontos, v: 0, e: 1, d: 0, gp: feitos, gc: sofridos };
      };
      return { 1: efeito(gols1, gols2), 2: efeito(gols2, gols1) };
    }

    return null;
  }

  // Aplica um jogo de classificação a cada jogador das duas duplas.
  // Retorna uma NOVA classificação (array de linhas); a original não é alterada.
  function aplicarJogo(classificacao, jogo, config = REGRAS_PADRAO) {
    const efeitos = efeitosDoResultado(jogo.resultado, config);
    if (!efeitos) return classificacao.slice();

    const efeitoPorJogador = new Map();
    for (const id of jogo.dupla1) efeitoPorJogador.set(id, efeitos[1]);
    for (const id of jogo.dupla2) efeitoPorJogador.set(id, efeitos[2]);

    return classificacao.map((linha) => {
      const ef = efeitoPorJogador.get(linha.id);
      if (!ef) return linha;
      return {
        ...linha,
        pontos: linha.pontos + ef.pontos,
        v: linha.v + ef.v,
        e: linha.e + ef.e,
        d: linha.d + ef.d,
        gp: linha.gp + ef.gp,
        gc: linha.gc + ef.gc,
      };
    });
  }

  function aplicarJogos(base, jogos, config = REGRAS_PADRAO) {
    return jogos.reduce((classificacao, jogo) => aplicarJogo(classificacao, jogo, config), base.slice());
  }

  // Critérios 1 a 4: pontos, vitórias, saldo, gols pró (todos desc).
  // Confronto direto e sorteio (5 e 6) são decididos pelo organizador.
  function compararCriterios(a, b) {
    return (
      b.pontos - a.pontos ||
      b.v - a.v ||
      saldo(b) - saldo(a) ||
      b.gp - a.gp
    );
  }

  function chaveCriterios(linha) {
    return [linha.pontos, linha.v, saldo(linha), linha.gp].join("|");
  }

  // Grupos de jogadores empatados em todos os critérios 1 a 4 (só grupos com 2+).
  // Cada grupo é um array de ids, na ordem em que aparecem em `linhas`.
  function detectarEmpatesTecnicos(linhas) {
    const grupos = new Map();
    for (const linha of linhas) {
      const chave = chaveCriterios(linha);
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(linha.id);
    }
    return [...grupos.values()].filter((ids) => ids.length > 1);
  }

  function mesmoConjunto(a, b) {
    if (a.length !== b.length) return false;
    const conjunto = new Set(a);
    return b.every((id) => conjunto.has(id));
  }

  // Classificação = base + jogos com resultado. Nunca é guardada no estado.
  // opcoes (todas opcionais):
  //   config: parâmetros do campeonato (padrão: REGRAS_PADRAO)
  //   posicoesAnteriores: Map id -> posição de referência para a variação (▲▼).
  //     Omitida: vale a ordem do array `base`; null: sem variação.
  // Retorna linhas ordenadas com campos calculados:
  //   posicao, posicaoBase (null sem referência), variacao (>0 subiu), sg, jogos,
  //   empateTecnico: null | { grupo: [ids], ordemManual: bool }
  // O empate técnico só é sinalizado quando importa: o grupo começa dentro das vagas da fase
  // final e alguém dele já jogou (no início todos empatam em 0 e isso não é um empate de verdade).
  // Fora disso a ordem continua valendo (manual, se houver; senão alfabética), só sem o aviso.
  function calcularClassificacao(base, jogos, desempatesManuais = [], opcoes = {}) {
    const config = opcoes.config || REGRAS_PADRAO;
    const anteriores = opcoes.posicoesAnteriores;
    const posicaoDeReferencia = (linha, i) => {
      if (anteriores === undefined) return i + 1;
      if (anteriores === null) return null;
      return anteriores.has(linha.id) ? anteriores.get(linha.id) : null;
    };
    const linhas = aplicarJogos(base.map((linha, i) => ({ ...linha, posicaoBase: posicaoDeReferencia(linha, i) })), jogos, config);

    linhas.sort((a, b) => compararCriterios(a, b) || a.nome.localeCompare(b.nome, "pt-BR"));

    for (const grupo of detectarEmpatesTecnicos(linhas)) {
      // A ordem manual só vale se o grupo tiver exatamente os mesmos jogadores.
      const manual = desempatesManuais.find((dm) => mesmoConjunto(dm.jogadores, grupo));
      const ordem = manual ? manual.jogadores : grupo; // sem manual: alfabética (provisória)
      const inicio = linhas.findIndex((l) => l.id === grupo[0]);
      const trecho = ordem.map((id) => linhas.find((l) => l.id === id));
      const relevante = inicio < config.vagasFaseFinal && trecho.some((l) => l.v + l.e + l.d > 0);
      const info = { grupo: ordem.slice(), ordemManual: Boolean(manual) };
      linhas.splice(inicio, trecho.length, ...trecho.map((l) => (relevante ? { ...l, empateTecnico: info } : l)));
    }

    return linhas.map((linha, i) => ({
      ...linha,
      posicao: i + 1,
      variacao: linha.posicaoBase === null ? 0 : linha.posicaoBase - (i + 1),
      sg: saldo(linha),
      jogos: linha.v + linha.e + linha.d,
      empateTecnico: linha.empateTecnico || null,
    }));
  }

  // Descarta as ordens manuais cujo grupo não existe mais exatamente igual
  // (ex.: um placar mudou e desfez ou alterou o empate técnico).
  function podarDesempatesManuais(base, jogos, desempatesManuais, config = REGRAS_PADRAO) {
    const grupos = detectarEmpatesTecnicos(aplicarJogos(base, jogos, config));
    return desempatesManuais.filter((dm) => grupos.some((g) => mesmoConjunto(g, dm.jogadores)));
  }

  // Grava a ordem manual de um grupo, substituindo a ordem anterior do mesmo grupo.
  function definirOrdemDesempate(desempatesManuais, ordem) {
    return [
      ...desempatesManuais.filter((dm) => !mesmoConjunto(dm.jogadores, ordem)),
      { jogadores: ordem.slice() },
    ];
  }

  // ---------- Cadastro de jogadores ----------

  const MAX_CARACTERES_NOME = 30; // cabe nas linhas do telão e do PNG

  function normalizarNome(nome) {
    return String(nome).replace(/\s+/g, " ").trim();
  }

  // Chave para comparar nomes sem diferenciar maiúsculas, acentos nem espaços repetidos.
  function chaveDoNome(nome) {
    return normalizarNome(nome).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  // Id estável do jogador: slug do nome ("João Exemplo" -> "joao-exemplo"), com sufixo
  // -2, -3... se já existir. O id não muda quando o jogador é renomeado.
  function gerarIdJogador(nome, idsExistentes) {
    const base = chaveDoNome(nome).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "jogador";
    const usados = new Set(idsExistentes);
    let id = base;
    for (let n = 2; usados.has(id); n++) id = `${base}-${n}`;
    return id;
  }

  // Texto colado (um nome por linha) -> nomes normalizados, sem linhas vazias.
  function interpretarListaNomes(texto) {
    return String(texto).split(/\r?\n/).map(normalizarNome).filter(Boolean);
  }

  // Erro de validação do nome (texto em português) ou null. `idIgnorar`: o próprio jogador
  // numa renomeação.
  function validarNomeJogador(nome, jogadores, idIgnorar = null) {
    const n = normalizarNome(nome);
    if (!n) return "Informe um nome.";
    if (n.length > MAX_CARACTERES_NOME) return `Nome muito longo (máximo ${MAX_CARACTERES_NOME} caracteres).`;
    const chave = chaveDoNome(n);
    const igual = jogadores.find((j) => j.id !== idIgnorar && chaveDoNome(j.nome) === chave);
    if (igual) return `Já existe um jogador chamado "${igual.nome}".`;
    return null;
  }

  // Acrescenta nomes ao fim da lista, na ordem. Nomes inválidos ou repetidos (inclusive dentro
  // da própria lista) são ignorados com o motivo. Retorna { jogadores, adicionados, ignorados }.
  function adicionarJogadores(jogadores, nomes) {
    const lista = jogadores.slice();
    const adicionados = [];
    const ignorados = [];
    for (const bruto of nomes) {
      const nome = normalizarNome(bruto);
      if (!nome) continue;
      const erro = validarNomeJogador(nome, lista);
      if (erro) {
        ignorados.push({ nome, motivo: erro });
        continue;
      }
      lista.push({ id: gerarIdJogador(nome, lista.map((j) => j.id)), nome });
      adicionados.push(nome);
    }
    return { jogadores: lista, adicionados, ignorados };
  }

  // Retorna { jogadores } com o jogador renomeado ou { erro }.
  function renomearJogador(jogadores, id, novoNome) {
    if (!jogadores.some((j) => j.id === id)) return { erro: "Jogador não encontrado." };
    const erro = validarNomeJogador(novoNome, jogadores, id);
    if (erro) return { erro };
    const nome = normalizarNome(novoNome);
    return { jogadores: jogadores.map((j) => (j.id === id ? { ...j, nome } : j)) };
  }

  function removerJogador(jogadores, id) {
    return jogadores.filter((j) => j.id !== id);
  }

  // Depois que o calendário é confirmado (ou já há jogos), a lista de jogadores e os
  // parâmetros do sorteio não podem mais mudar: só renomear.
  function cadastroTravado(campeonato, jogos) {
    return jogos.length > 0 || Boolean(campeonato.sorteio && campeonato.sorteio.confirmado);
  }

  // Confere se jogadores × jogos por jogador × semanas formam um calendário possível
  // (cada jogo tem 4 jogadores; no máximo 1 jogo por jogador por semana; sem repetir parceiro).
  // Retorna { jogadores, totalJogos, jogosPorSemanaMin, jogosPorSemanaMax, problemas: [texto], pronto }.
  function diagnosticarCampeonato(jogadores, config = REGRAS_PADRAO) {
    const n = jogadores.length;
    const jogos = config.jogosPorJogador;
    const semanas = config.semanas;
    const vagas = n * jogos;
    const totalJogos = Math.floor(vagas / 4);
    const problemas = [];
    if (n < config.vagasFaseFinal) problemas.push(`Cadastre pelo menos ${config.vagasFaseFinal} jogadores (hoje: ${n}).`);
    if (vagas % 4 !== 0) {
      problemas.push(`${n} jogadores × ${jogos} jogos = ${vagas} vagas, e cada jogo ocupa 4: não fecha. Ajuste os jogadores ou os jogos por jogador.`);
    }
    if (jogos > semanas) {
      problemas.push(`Cada jogador joga no máximo uma vez por semana: ${jogos} jogos pedem pelo menos ${jogos} semanas (há ${semanas}).`);
    }
    if (n > 0 && jogos > n - 1) {
      problemas.push(`Sem repetir parceiro, ${n} jogadores permitem no máximo ${n - 1} jogos por jogador.`);
    }
    return {
      jogadores: n,
      totalJogos,
      jogosPorSemanaMin: Math.floor(totalJogos / semanas),
      jogosPorSemanaMax: Math.ceil(totalJogos / semanas),
      problemas,
      pronto: problemas.length === 0,
    };
  }

  // ---------- Sorteio do calendário ----------
  // Calendário = [{ semana, dupla1: [id, id], dupla2: [id, id] }]. Restrições do sorteio
  // (docs/REGULAMENTO.md): todos com o mesmo número de jogos, no máximo 1 jogo por jogador por
  // semana e nenhum parceiro repetido; adversários repetidos são evitados, mas podem acontecer.

  const TENTATIVAS_SORTEIO = 40; // calendários completos construídos; fica o melhor
  const TENTATIVAS_SEMANA = 40; // formas de montar cada semana; fica a melhor
  const MELHORAS_POR_TENTATIVA = 60;

  // Gerador pseudoaleatório com semente (mulberry32): a mesma semente dá o mesmo calendário.
  function criarSorteador(semente) {
    let a = semente >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function embaralhar(lista, sorteio) {
    const copia = lista.slice();
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(sorteio() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  }

  function chaveDoPar(a, b) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  // Quantos jogos cada semana tem: total ÷ semanas; as semanas que sobram ficam com 1 a mais,
  // as primeiras primeiro (ex.: 45 jogos em 8 semanas = 6,6,6,6,6,5,5,5).
  function jogosPorSemana(totalJogos, semanas) {
    const base = Math.floor(totalJogos / semanas);
    const sobra = totalJogos % semanas;
    return Array.from({ length: semanas }, (_, i) => base + (i < sobra ? 1 : 0));
  }

  // Monta os jogos de uma semana com os 4×g jogadores `jogam`: primeiro as duplas (sem repetir
  // parceiro), depois quem enfrenta quem (trocando duplas de lugar para evitar adversário repetido).
  // Retorna { jogos: [{ dupla1, dupla2 }], custo } ou null se não achou duplas válidas.
  function montarSemana(jogam, parceiros, encontros, sorteio) {
    const fila = embaralhar(jogam, sorteio);
    const duplas = [];
    while (fila.length) {
      const a = fila.shift();
      const candidatos = [];
      for (let i = 0; i < fila.length; i++) if (!parceiros.has(chaveDoPar(a, fila[i]))) candidatos.push(i);
      if (!candidatos.length) return null;
      const escolhido = candidatos[Math.floor(sorteio() * candidatos.length)];
      duplas.push([a, fila.splice(escolhido, 1)[0]]);
    }

    const vezes = (a, b) => encontros.get(chaveDoPar(a, b)) || 0;
    const custoEntre = (x, y) => {
      let c = 0;
      for (const a of x) for (const b of y) c += vezes(a, b) ** 2;
      return c;
    };
    const custoDoJogo = (k) => custoEntre(duplas[2 * k], duplas[2 * k + 1]);
    const quantidadeJogos = duplas.length / 2;
    let custo = 0;
    for (let k = 0; k < quantidadeJogos; k++) custo += custoDoJogo(k);

    for (let tentativa = 0; tentativa < MELHORAS_POR_TENTATIVA && custo > 0 && quantidadeJogos > 1; tentativa++) {
      const x = Math.floor(sorteio() * duplas.length);
      const y = Math.floor(sorteio() * duplas.length);
      const kx = Math.floor(x / 2), ky = Math.floor(y / 2);
      if (kx === ky) continue;
      const antes = custoDoJogo(kx) + custoDoJogo(ky);
      [duplas[x], duplas[y]] = [duplas[y], duplas[x]];
      const depois = custoDoJogo(kx) + custoDoJogo(ky);
      if (depois < antes) custo += depois - antes;
      else [duplas[x], duplas[y]] = [duplas[y], duplas[x]]; // não melhorou: desfaz
    }

    const jogos = [];
    for (let k = 0; k < quantidadeJogos; k++) jogos.push({ dupla1: duplas[2 * k], dupla2: duplas[2 * k + 1] });
    return { jogos, custo };
  }

  // Uma tentativa de calendário completo. Retorna { calendario, custo } ou null.
  function construirCalendario(ids, jogosPorJogador, tamanhos, sorteio) {
    const restantes = new Map(ids.map((id) => [id, jogosPorJogador]));
    const parceiros = new Set();
    const encontros = new Map();
    const calendario = [];

    for (let semana = 0; semana < tamanhos.length; semana++) {
      const semanasRestantes = tamanhos.length - semana;
      const vagas = 4 * tamanhos[semana];
      const comJogos = ids.filter((id) => restantes.get(id) > 0);
      const obrigados = comJogos.filter((id) => restantes.get(id) === semanasRestantes); // não podem mais descansar
      if (obrigados.length > vagas || comJogos.length < vagas) return null;
      // Quem tem mais jogos a cumprir joga primeiro; empate decidido pelo sorteio.
      const outros = embaralhar(comJogos.filter((id) => restantes.get(id) < semanasRestantes), sorteio)
        .sort((a, b) => restantes.get(b) - restantes.get(a));
      const jogam = obrigados.concat(outros.slice(0, vagas - obrigados.length));

      let melhor = null;
      for (let t = 0; t < TENTATIVAS_SEMANA; t++) {
        const montada = montarSemana(jogam, parceiros, encontros, sorteio);
        if (montada && (!melhor || montada.custo < melhor.custo)) melhor = montada;
        if (melhor && melhor.custo === 0) break;
      }
      if (!melhor) return null;

      for (const jogo of melhor.jogos) {
        calendario.push({ semana: semana + 1, dupla1: jogo.dupla1.slice(), dupla2: jogo.dupla2.slice() });
        parceiros.add(chaveDoPar(jogo.dupla1[0], jogo.dupla1[1]));
        parceiros.add(chaveDoPar(jogo.dupla2[0], jogo.dupla2[1]));
        for (const a of jogo.dupla1) for (const b of jogo.dupla2) {
          const chave = chaveDoPar(a, b);
          encontros.set(chave, (encontros.get(chave) || 0) + 1);
        }
      }
      for (const id of jogam) restantes.set(id, restantes.get(id) - 1);
    }

    let custo = 0;
    for (const vezes of encontros.values()) if (vezes > 1) custo += (vezes - 1) ** 2;
    return { calendario, custo };
  }

  // Sorteia o calendário inteiro. `semente` (inteiro) torna o resultado reproduzível.
  // Retorna { calendario } ou { erro: texto }.
  function gerarCalendario(jogadores, { jogosPorJogador, semanas, semente }) {
    const diagnostico = diagnosticarCampeonato(jogadores, { ...REGRAS_PADRAO, jogosPorJogador, semanas });
    if (!diagnostico.pronto) return { erro: diagnostico.problemas.join(" ") };

    const ids = jogadores.map((j) => j.id);
    const tamanhos = jogosPorSemana(diagnostico.totalJogos, semanas);
    const sorteio = criarSorteador(semente);
    let melhor = null;
    for (let t = 0; t < TENTATIVAS_SORTEIO; t++) {
      const tentativa = construirCalendario(ids, jogosPorJogador, tamanhos, sorteio);
      if (tentativa && (!melhor || tentativa.custo < melhor.custo)) melhor = tentativa;
      if (melhor && melhor.custo === 0) break;
    }
    if (!melhor) return { erro: "Não foi possível montar um calendário com essas combinações. Tente sortear de novo." };
    return { calendario: melhor.calendario };
  }

  // Confere um calendário (rascunho ou jogos confirmados). Violações são as restrições do
  // regulamento; os adversários repetidos são só informativos.
  // Retorna { jogosPorJogador: [{ id, nome, jogos }], minJogos, maxJogos,
  //           parceirosRepetidos: [{ jogadores: [nomeA, nomeB], vezes }],
  //           adversariosRepetidos: { pares, maxVezes },
  //           jogosPorSemana: [n por semana], violacoes: [texto], pronto }
  function avaliarCalendario(jogadores, calendario, config = REGRAS_PADRAO) {
    const nome = new Map(jogadores.map((j) => [j.id, j.nome]));
    const jogosDe = new Map(jogadores.map((j) => [j.id, 0]));
    const semanasDe = new Map(jogadores.map((j) => [j.id, []]));
    const parceiros = new Map();
    const encontros = new Map();
    const porSemana = Array.from({ length: config.semanas }, () => 0);
    const violacoes = [];
    const contar = (mapa, chave) => mapa.set(chave, (mapa.get(chave) || 0) + 1);

    for (const jogo of calendario) {
      if (!Number.isInteger(jogo.semana) || jogo.semana < 1 || jogo.semana > config.semanas) {
        violacoes.push(`Jogo na semana ${jogo.semana}, fora das ${config.semanas} semanas do campeonato.`);
      } else {
        porSemana[jogo.semana - 1]++;
      }
      const erroDuplas = validarDuplas(jogo.dupla1, jogo.dupla2);
      if (erroDuplas) {
        violacoes.push(`Semana ${jogo.semana}: ${erroDuplas}`);
        continue;
      }
      for (const id of [...jogo.dupla1, ...jogo.dupla2]) {
        if (!jogosDe.has(id)) {
          violacoes.push(`Jogador desconhecido no calendário: ${id}.`);
          continue;
        }
        jogosDe.set(id, jogosDe.get(id) + 1);
        semanasDe.get(id).push(jogo.semana);
      }
      contar(parceiros, chaveDoPar(jogo.dupla1[0], jogo.dupla1[1]));
      contar(parceiros, chaveDoPar(jogo.dupla2[0], jogo.dupla2[1]));
      for (const a of jogo.dupla1) for (const b of jogo.dupla2) contar(encontros, chaveDoPar(a, b));
    }

    const nomes = (chave) => chave.split("|").map((id) => nome.get(id) || id);
    const lista = jogadores.map((j) => ({ id: j.id, nome: j.nome, jogos: jogosDe.get(j.id) }));
    for (const j of lista) {
      if (j.jogos !== config.jogosPorJogador) {
        violacoes.push(`${j.nome} tem ${j.jogos} jogo(s) (o esperado é ${config.jogosPorJogador}).`);
      }
    }
    for (const j of jogadores) {
      const semanas = semanasDe.get(j.id);
      const repetidas = [...new Set(semanas.filter((s, i) => semanas.indexOf(s) !== i))];
      for (const s of repetidas) violacoes.push(`${j.nome} joga mais de uma vez na semana ${s}.`);
    }
    const parceirosRepetidos = [...parceiros]
      .filter(([, vezes]) => vezes > 1)
      .map(([chave, vezes]) => ({ jogadores: nomes(chave), vezes }));
    for (const p of parceirosRepetidos) violacoes.push(`${p.jogadores.join(" e ")} são parceiros ${p.vezes} vezes.`);

    const repetidosContra = [...encontros.values()].filter((v) => v > 1);
    const minMax = lista.map((j) => j.jogos);
    return {
      jogosPorJogador: lista,
      minJogos: minMax.length ? Math.min(...minMax) : 0,
      maxJogos: minMax.length ? Math.max(...minMax) : 0,
      parceirosRepetidos,
      adversariosRepetidos: { pares: repetidosContra.length, maxVezes: repetidosContra.length ? Math.max(...repetidosContra) : 0 },
      jogosPorSemana: porSemana,
      violacoes,
      pronto: violacoes.length === 0,
    };
  }

  // Troca manual: coloca `novoId` na posição (0 ou 1) da dupla `lado` do jogo `indice`.
  // Se ele já joga na mesma semana (neste ou noutro jogo), os dois trocam de lugar; se estava
  // descansando, quem saiu passa a descansar. Retorna um NOVO calendário.
  function trocarJogadorNoCalendario(calendario, indice, lado, posicao, novoId) {
    const novo = calendario.map((j) => ({ semana: j.semana, dupla1: j.dupla1.slice(), dupla2: j.dupla2.slice() }));
    const jogo = novo[indice];
    const antigo = jogo[`dupla${lado}`][posicao];
    if (antigo === novoId) return novo;
    for (const outro of novo) {
      if (outro.semana !== jogo.semana) continue;
      for (const l of [1, 2]) {
        const p = outro[`dupla${l}`].indexOf(novoId);
        if (p >= 0) outro[`dupla${l}`][p] = antigo;
      }
    }
    jogo[`dupla${lado}`][posicao] = novoId;
    return novo;
  }

  // Calendário confirmado -> jogos da classificação (ids s{semana}-j{n}, n = ordem na semana).
  function calendarioParaJogos(calendario) {
    const ordenado = calendario
      .map((j, i) => ({ j, i }))
      .sort((a, b) => a.j.semana - b.j.semana || a.i - b.i);
    const contagem = new Map();
    return ordenado.map(({ j }) => {
      const n = (contagem.get(j.semana) || 0) + 1;
      contagem.set(j.semana, n);
      return { id: `s${j.semana}-j${n}`, semana: j.semana, dupla1: j.dupla1.slice(), dupla2: j.dupla2.slice(), resultado: null };
    });
  }

  // ---------- Mata-mata ----------
  // Semis e 3º lugar em jogo único; final em melhor de 3. Sem empate: tempo normal,
  // prorrogação (gols só da prorrogação) e pênaltis. Não altera a classificação.

  const CONFRONTOS = ["semi1", "semi2", "terceiro", "final"];
  const MELHOR_DE = { semi1: 1, semi2: 1, terceiro: 1, final: 3 };

  // Semi 1 = 1º+8º × 2º+7º; Semi 2 = 3º+6º × 4º+5º.
  function duplasDasSemis(classificacao) {
    const id = (pos) => classificacao[pos - 1].id;
    return {
      semi1: [[id(1), id(8)], [id(2), id(7)]],
      semi2: [[id(3), id(6)], [id(4), id(5)]],
    };
  }

  // Estrutura inicial do mata-mata. As duplas das semis ficam congeladas na geração;
  // as do 3º lugar e da final saem dos resultados das semis (null = automática) e ficam
  // congeladas quando o confronto ganha placar (ver fixarDuplasJogadas).
  function gerarMataMata(classificacao) {
    const semis = duplasDasSemis(classificacao);
    const confronto = (duplas) => ({
      dupla1: duplas ? duplas[0].slice() : null,
      dupla2: duplas ? duplas[1].slice() : null,
      duplaManual1: false,
      duplaManual2: false,
      partidas: [],
    });
    return {
      semi1: confronto(semis.semi1),
      semi2: confronto(semis.semi2),
      terceiro: confronto(null),
      final: confronto(null),
    };
  }

  // Motivos para confirmar antes de gerar o chaveamento (lista vazia = tudo certo).
  function avisosParaGerarChaveamento(jogos, classificacao, config = REGRAS_PADRAO) {
    const avisos = [];
    const pendentes = jogos.filter((j) => !efeitosDoResultado(j.resultado, config));
    if (pendentes.length) {
      // Com muitos jogos, resume por semana; com poucos, lista os ids.
      const porSemana = new Map();
      for (const j of pendentes) porSemana.set(semanaDoJogo(j), (porSemana.get(semanaDoJogo(j)) || []).concat(j.id));
      const semanas = [...porSemana].sort((a, b) => a[0] - b[0]);
      const detalhe = pendentes.length > 12
        ? semanas.map(([semana, ids]) => `semana ${semana}: ${ids.length}`).join("; ")
        : pendentes.map((j) => j.id).join(", ");
      avisos.push(`${pendentes.length} jogo(s) de classificação sem resultado (${detalhe}).`);
    }
    const nome = (id) => classificacao.find((l) => l.id === id).nome;
    const vistos = new Set();
    for (const linha of classificacao.slice(0, config.vagasFaseFinal)) {
      const empate = linha.empateTecnico;
      if (!empate || empate.ordemManual) continue;
      const chave = empate.grupo.join("|");
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      avisos.push(`Empate técnico sem ordem manual no top 8: ${empate.grupo.map(nome).join(", ")}.`);
    }
    return avisos;
  }

  // Analisa uma partida do mata-mata.
  // Retorna { vencedor: 1|2|null, precisa: null|"placar"|"prorrogacao"|"penaltis",
  //           decididoEm?: "placar"|"prorrogacao"|"penaltis", erro?: texto }
  function analisarPartida(p) {
    if (!p || !golsValidos(p.gols1) || !golsValidos(p.gols2)) return { vencedor: null, precisa: "placar" };
    if (p.gols1 !== p.gols2) return { vencedor: p.gols1 > p.gols2 ? 1 : 2, precisa: null, decididoEm: "placar" };
    if (!golsValidos(p.prorrogacao1) || !golsValidos(p.prorrogacao2)) return { vencedor: null, precisa: "prorrogacao" };
    if (p.prorrogacao1 !== p.prorrogacao2) {
      return { vencedor: p.prorrogacao1 > p.prorrogacao2 ? 1 : 2, precisa: null, decididoEm: "prorrogacao" };
    }
    if (!golsValidos(p.penaltis1) || !golsValidos(p.penaltis2)) return { vencedor: null, precisa: "penaltis" };
    if (p.penaltis1 === p.penaltis2) {
      return { vencedor: null, precisa: "penaltis", erro: "Pênaltis não podem terminar empatados." };
    }
    return { vencedor: p.penaltis1 > p.penaltis2 ? 1 : 2, precisa: null, decididoEm: "penaltis" };
  }

  // Analisa uma série (jogo único = melhorDe 1; final = melhorDe 3).
  // Um jogo incompleto no meio (ex.: placar corrigido para empate, esperando a prorrogação)
  // não apaga os jogos seguintes: eles continuam na série, mas ela só é decidida quando
  // todos os jogos até o decisivo estiverem completos.
  // analises = uma por jogo considerado (até o decisivo, se houver).
  // partidasVisiveis = quantos jogos a tela deve mostrar (inclui o próximo a jogar).
  function analisarSerie(partidas, melhorDe) {
    const necessarias = Math.floor(melhorDe / 2) + 1;
    const vitorias = [0, 0];
    const analises = [];
    let vencedor = null;
    let todasCompletas = true;
    for (const p of partidas.slice(0, melhorDe)) {
      const a = analisarPartida(p);
      analises.push(a);
      if (!a.vencedor) {
        todasCompletas = false;
        continue;
      }
      vitorias[a.vencedor - 1]++;
      if (todasCompletas && vitorias[a.vencedor - 1] === necessarias) {
        vencedor = a.vencedor;
        break;
      }
    }
    const faltaJogo = !vencedor && todasCompletas && analises.length < melhorDe;
    const partidasVisiveis = faltaJogo ? analises.length + 1 : analises.length;
    return { vencedor, vitorias, necessarias, analises, partidasVisiveis };
  }

  function valorOuNulo(v) {
    return v === undefined ? null : v;
  }

  // Mantém só os campos que a partida precisa: prorrogação só se empatou no tempo normal,
  // pênaltis só se empatou também na prorrogação.
  function limparPartida(p) {
    const nova = { gols1: valorOuNulo(p.gols1), gols2: valorOuNulo(p.gols2) };
    if (golsValidos(nova.gols1) && nova.gols1 === nova.gols2) {
      nova.prorrogacao1 = valorOuNulo(p.prorrogacao1);
      nova.prorrogacao2 = valorOuNulo(p.prorrogacao2);
      if (golsValidos(nova.prorrogacao1) && nova.prorrogacao1 === nova.prorrogacao2) {
        nova.penaltis1 = valorOuNulo(p.penaltis1);
        nova.penaltis2 = valorOuNulo(p.penaltis2);
      }
    }
    return nova;
  }

  function partidaVazia(p) {
    return Object.values(p).every((v) => v === null);
  }

  // Descarta os jogos que sobram depois de a série ser decidida, os jogos vazios do fim
  // e os campos desnecessários. Jogos depois de um jogo incompleto são mantidos.
  function normalizarPartidas(partidas, melhorDe) {
    const serie = analisarSerie(partidas, melhorDe);
    const mantidas = partidas.slice(0, serie.analises.length).map(limparPartida);
    while (mantidas.length && partidaVazia(mantidas[mantidas.length - 1])) mantidas.pop();
    return mantidas;
  }

  function clonarMataMata(mm) {
    return JSON.parse(JSON.stringify(mm));
  }

  // Grava um campo (gols1, prorrogacao2, penaltis1...) de um jogo do confronto.
  // valor = inteiro ≥ 0 ou null (apagar). Retorna um NOVO mata-mata.
  function definirCampoPartida(mataMata, chave, indice, campo, valor) {
    const novo = clonarMataMata(mataMata);
    const confronto = novo[chave];
    while (confronto.partidas.length <= indice) confronto.partidas.push({ gols1: null, gols2: null });
    confronto.partidas[indice][campo] = valor;
    confronto.partidas = normalizarPartidas(confronto.partidas, MELHOR_DE[chave]);
    return novo;
  }

  // Erro de validação das duas duplas de um confronto, ou null se estiver tudo certo.
  function validarDuplas(dupla1, dupla2) {
    for (const dupla of [dupla1, dupla2]) {
      if (!dupla) continue;
      if (dupla.length !== 2 || !dupla[0] || !dupla[1]) return "Cada dupla precisa de 2 jogadores.";
      if (dupla[0] === dupla[1]) return "Os dois jogadores da dupla precisam ser diferentes.";
    }
    if (dupla1 && dupla2 && dupla1.some((id) => dupla2.includes(id))) {
      return "Um jogador não pode estar nas duas duplas do mesmo jogo.";
    }
    return null;
  }

  // Troca manual de dupla (ex.: "SURPRESA antes da final").
  function definirDupla(mataMata, chave, lado, dupla) {
    const novo = clonarMataMata(mataMata);
    novo[chave][`dupla${lado}`] = dupla.slice();
    novo[chave][`duplaManual${lado}`] = true;
    return novo;
  }

  // Volta à dupla automática: nas semis, a da classificação atual; no 3º lugar e na
  // final, a que sai dos resultados das semis.
  function voltarDuplaAutomatica(mataMata, chave, lado, classificacao) {
    const novo = clonarMataMata(mataMata);
    const semis = duplasDasSemis(classificacao);
    novo[chave][`dupla${lado}`] = semis[chave] ? semis[chave][lado - 1].slice() : null;
    novo[chave][`duplaManual${lado}`] = false;
    return novo;
  }

  // Atualiza as duplas não manuais das semis para a classificação atual.
  function atualizarDuplasDasSemis(mataMata, classificacao) {
    let novo = mataMata;
    for (const chave of ["semi1", "semi2"]) {
      for (const lado of [1, 2]) {
        if (!mataMata[chave][`duplaManual${lado}`]) novo = voltarDuplaAutomatica(novo, chave, lado, classificacao);
      }
    }
    return novo;
  }

  // 3º lugar e final: quando o confronto ganha o primeiro placar, as duplas automáticas que
  // jogaram ficam guardadas. Assim, corrigir depois o resultado de uma semi não passa os placares
  // já lançados para outra dupla sem aviso (a dupla fica "desatualizada"). Sem placar, volta a
  // seguir as semis. Duplas manuais não mudam. Retorna um NOVO mata-mata.
  function fixarDuplasJogadas(mataMata, classificacao, config = REGRAS_PADRAO) {
    const resolvido = resolverMataMata(mataMata, classificacao, config);
    const novo = clonarMataMata(mataMata);
    for (const chave of ["terceiro", "final"]) {
      const c = novo[chave];
      for (const lado of [1, 2]) {
        if (c[`duplaManual${lado}`]) continue;
        if (!c.partidas.length) {
          c[`dupla${lado}`] = null;
        } else if (!c[`dupla${lado}`]) {
          const automatica = resolvido[chave][`lado${lado}`].automatica;
          c[`dupla${lado}`] = automatica ? automatica.slice() : null;
        }
      }
    }
    return novo;
  }

  // 3º lugar e final: troca as duplas automáticas guardadas pelas que saem hoje das semis.
  // Os placares já lançados continuam e passam a valer para as novas duplas.
  function atualizarDuplasDasFinais(mataMata, classificacao, config = REGRAS_PADRAO) {
    const novo = clonarMataMata(mataMata);
    for (const chave of ["terceiro", "final"]) {
      for (const lado of [1, 2]) {
        if (!novo[chave][`duplaManual${lado}`]) novo[chave][`dupla${lado}`] = null;
      }
    }
    return fixarDuplasJogadas(novo, classificacao, config);
  }

  function mesmaDupla(a, b) {
    if (!a || !b) return a === b;
    return mesmoConjunto(a, b);
  }

  // Resolve o mata-mata inteiro: duplas efetivas, séries, avanço de vencedores/perdedores e pódio.
  function resolverMataMata(mataMata, classificacao, config = REGRAS_PADRAO) {
    const semisAtuais = classificacao.length >= config.vagasFaseFinal ? duplasDasSemis(classificacao) : {};

    // congelada: a dupla guardada vale no lugar da automática (semis sempre; 3º lugar e final
    // depois do primeiro placar, se a dupla foi guardada por fixarDuplasJogadas).
    function resolver(chave, automaticas, congelada) {
      const c = mataMata[chave];
      const lado = (n) => {
        const manual = Boolean(c[`duplaManual${n}`]);
        const automatica = automaticas[n - 1] || null;
        const guardada = c[`dupla${n}`];
        const usaGuardada = manual || (congelada && Boolean(guardada));
        const dupla = usaGuardada ? guardada : automatica;
        return { dupla, manual, automatica, desatualizada: usaGuardada && !manual && !mesmaDupla(dupla, automatica) };
      };
      const lado1 = lado(1), lado2 = lado(2);
      const serie = analisarSerie(c.partidas, MELHOR_DE[chave]);
      const vencedora = serie.vencedor ? [lado1, lado2][serie.vencedor - 1].dupla : null;
      const perdedora = serie.vencedor ? [lado1, lado2][2 - serie.vencedor].dupla : null;
      return {
        chave,
        melhorDe: MELHOR_DE[chave],
        dupla1: lado1.dupla,
        dupla2: lado2.dupla,
        lado1,
        lado2,
        pronto: Boolean(lado1.dupla && lado2.dupla),
        partidas: c.partidas,
        serie,
        vencedora,
        perdedora,
      };
    }

    const semi1 = resolver("semi1", semisAtuais.semi1 || [], true);
    const semi2 = resolver("semi2", semisAtuais.semi2 || [], true);
    const terceiro = resolver("terceiro", [semi1.perdedora, semi2.perdedora], mataMata.terceiro.partidas.length > 0);
    const final = resolver("final", [semi1.vencedora, semi2.vencedora], mataMata.final.partidas.length > 0);
    return {
      semi1, semi2, terceiro, final,
      podio: { campeoes: final.vencedora, vice: final.perdedora, terceiro: terceiro.vencedora },
    };
  }

  // ---------- Semanas (rodadas) ----------

  // Jogos sem semana (dados antigos de teste) contam como semana 1.
  function semanaDoJogo(jogo) {
    return Number.isInteger(jogo.semana) ? jogo.semana : 1;
  }

  // [{ semana, total, resolvidos }] para as semanas 1..semanas. "Resolvido" = tem resultado
  // válido (placar, W.O. ou anulado).
  function progressoPorSemana(jogos, semanas, config = REGRAS_PADRAO) {
    const lista = Array.from({ length: semanas }, (_, i) => ({ semana: i + 1, total: 0, resolvidos: 0 }));
    for (const jogo of jogos) {
      const item = lista[semanaDoJogo(jogo) - 1];
      if (!item) continue;
      item.total++;
      if (efeitosDoResultado(jogo.resultado, config)) item.resolvidos++;
    }
    return lista;
  }

  // Quantas semanas já têm todos os jogos resolvidos.
  function contarSemanasCompletas(jogos, semanas, config = REGRAS_PADRAO) {
    return progressoPorSemana(jogos, semanas, config).filter((p) => p.total > 0 && p.resolvidos === p.total).length;
  }

  // Lembrete de backup: null se não precisa, ou { mensagem }. Só vale quando já há jogos (antes
  // disso o cadastro e o sorteio são baratos de refazer). `ultimoBackup` = { em: ISO, semanasCompletas }
  // ou null; `agora` é injetado para os testes.
  const DIAS_PARA_LEMBRAR_BACKUP = 7;
  function precisaDeBackup(campeonato, jogos, ultimoBackup, agora = new Date()) {
    if (!campeonato.jogadores.length || !jogos.length) return null;
    if (!ultimoBackup) return { mensagem: "Você ainda não exportou nenhum backup deste campeonato." };
    const completas = contarSemanasCompletas(jogos, campeonato.config.semanas, campeonato.config);
    if (completas > ultimoBackup.semanasCompletas) {
      return { mensagem: `${completas === 1 ? "A 1ª semana foi concluída" : `${completas} semanas já foram concluídas`}, mais do que no último backup.` };
    }
    const dias = Math.floor((agora - new Date(ultimoBackup.em)) / 86400000);
    if (dias >= DIAS_PARA_LEMBRAR_BACKUP) return { mensagem: `Faz ${dias} dias desde o último backup.` };
    return null;
  }

  // Semana em andamento: a primeira com jogo pendente; se tudo foi resolvido, a última.
  // null se não há jogos.
  function semanaAtual(jogos, config = REGRAS_PADRAO) {
    if (!jogos.length) return null;
    const pendentes = jogos.filter((j) => !efeitosDoResultado(j.resultado, config)).map(semanaDoJogo);
    return pendentes.length ? Math.min(...pendentes) : Math.max(...jogos.map(semanaDoJogo));
  }

  // Última semana em que algum jogo já tem resultado (null se nenhum).
  function ultimaSemanaComResultado(jogos, config = REGRAS_PADRAO) {
    const semanas = jogos.filter((j) => efeitosDoResultado(j.resultado, config)).map(semanaDoJogo);
    return semanas.length ? Math.max(...semanas) : null;
  }

  // Classificação considerando só as semanas até `ate` (null = todas, ao vivo). A variação
  // ▲▼ compara com a classificação da semana anterior à de referência: `ate`, ou, ao vivo,
  // a última semana com resultado. Sem semana anterior com resultados, não há variação.
  function classificacaoPorSemana(base, jogos, desempatesManuais = [], config = REGRAS_PADRAO, ate = null) {
    const considerados = ate === null ? jogos : jogos.filter((j) => semanaDoJogo(j) <= ate);
    const referencia = ate === null ? ultimaSemanaComResultado(considerados, config) : ate;
    let anteriores = null;
    if (referencia !== null && referencia > 1) {
      const antes = jogos.filter((j) => semanaDoJogo(j) < referencia);
      if (antes.some((j) => efeitosDoResultado(j.resultado, config))) {
        const tabelaAnterior = calcularClassificacao(base, antes, desempatesManuais, { config, posicoesAnteriores: null });
        anteriores = new Map(tabelaAnterior.map((l) => [l.id, l.posicao]));
      }
    }
    return calcularClassificacao(base, considerados, desempatesManuais, { config, posicoesAnteriores: anteriores });
  }

  // ---------- O que está em jogo ----------

  // Desfechos possíveis de um jogo pendente, só pelo que importa aqui (pontos e vitórias):
  // [pontos dupla 1, V dupla 1, pontos dupla 2, V dupla 2]. O W.O. vale o mesmo que a vitória
  // e o jogo anulado não dá nada a ninguém. Desfechos iguais (ex.: anulado e 0x0 com a
  // pontuação padrão) entram uma vez só, para não repetir cenários.
  function desfechosPossiveis(config) {
    const { pontosVitoria: pv, pontosEmpate: pe, pontosEmpateSemGols: p0 } = config;
    const todos = [
      [pv, 1, 0, 0], // vitória (ou W.O.) da dupla 1
      [pe, 0, pe, 0], // empate com gols
      [p0, 0, p0, 0], // 0x0
      [0, 0, 0, 0], // anulado
      [0, 0, pv, 1], // vitória (ou W.O.) da dupla 2
    ];
    const vistos = new Set();
    return todos.filter((d) => {
      const chave = d.join("|");
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });
  }

  // Quantos jogos pendentes "o que está em jogo" aceita com essa pontuação.
  function limitePendentesSituacoes(config = REGRAS_PADRAO) {
    const desfechos = desfechosPossiveis(config).length;
    let n = 0;
    while (desfechos ** (n + 1) <= MAX_CENARIOS_SITUACOES) n++;
    return n;
  }

  function contarCenarios(pendentes, config = REGRAS_PADRAO) {
    return desfechosPossiveis(config).length ** pendentes;
  }

  // Para cada jogador: garantido, em disputa ou eliminado na zona de classificação (top 8).
  // Enumera todos os desfechos dos jogos pendentes (até MAX_CENARIOS_SITUACOES cenários) e, em
  // cada um, compara pontos e vitórias. Saldo e gols pró só entram entre dois jogadores que não
  // jogam mais (os números deles já são definitivos); se aí empatarem em tudo, vale a ordem
  // manual do organizador, se todos do grupo já tiverem terminado e se, no cenário, ninguém que
  // ainda joga empatar com eles em pontos e V (aí o grupo muda e a ordem manual é descartada).
  //   Garantido: em todos os cenários, (à frente + empatados) ≤ 7.
  //   Eliminado: em todos os cenários, à frente ≥ 8.
  // Retorna [{ id, nome, situacao: "garantido"|"disputa"|"eliminado",
  //            dependeDoSaldo, dependeDoDesempate, jogosPendentes: [ids] }] na ordem da base,
  // ou null se houver mais jogos pendentes do que limitePendentesSituacoes(config).
  function calcularSituacoes(base, jogos, desempatesManuais = [], config = REGRAS_PADRAO) {
    const pendentes = jogos.filter((j) => !efeitosDoResultado(j.resultado, config));
    const DESFECHOS = desfechosPossiveis(config);
    const totalCenarios = DESFECHOS.length ** pendentes.length;
    if (totalCenarios > MAX_CENARIOS_SITUACOES) return null;
    const atual = aplicarJogos(base, jogos, config);
    const VAGAS = config.vagasFaseFinal;
    const n = atual.length;
    const indice = new Map(atual.map((l, i) => [l.id, i]));

    const jogosPendentes = atual.map(() => []);
    for (const jogo of pendentes) {
      for (const id of [...jogo.dupla1, ...jogo.dupla2]) jogosPendentes[indice.get(id)].push(jogo.id);
    }
    const terminou = jogosPendentes.map((js) => js.length === 0);

    // Só vale ordem manual de grupo em que todos já terminaram: se alguém do grupo ainda
    // joga, o grupo vai mudar e essa ordem será descartada (podarDesempatesManuais).
    const ordensDefinitivas = desempatesManuais.filter((dm) =>
      dm.jogadores.every((id) => indice.has(id) && terminou[indice.get(id)]));

    // >0 se idB vem antes de idA na ordem manual; 0 se não há ordem manual com os dois.
    function ordemManual(idA, idB) {
      for (const dm of ordensDefinitivas) {
        const a = dm.jogadores.indexOf(idA), b = dm.jogadores.indexOf(idB);
        if (a >= 0 && b >= 0) return a - b;
      }
      return 0;
    }

    // desempate[p][q] (só quando p e q empatam em pontos e V):
    //   >0 q fica à frente de p; <0 p fica à frente; 0 indefinido.
    // tipoEmpate[p][q]: "saldo" (alguém ainda joga) ou "manual" (empate total entre quem já terminou).
    // viaOrdemManual[p][q]: o desempate veio só da ordem manual (saldo e gols pró iguais).
    const desempate = [], tipoEmpate = [], viaOrdemManual = [];
    for (let p = 0; p < n; p++) {
      desempate.push(new Int32Array(n));
      viaOrdemManual.push(new Uint8Array(n));
      tipoEmpate.push([]);
      for (let q = 0; q < n; q++) {
        if (p === q) continue;
        if (!terminou[p] || !terminou[q]) { tipoEmpate[p][q] = "saldo"; continue; }
        const lp = atual[p], lq = atual[q];
        const pelosNumeros = saldo(lq) - saldo(lp) || lq.gp - lp.gp;
        const d = pelosNumeros || ordemManual(lp.id, lq.id);
        desempate[p][q] = d;
        if (d === 0) tipoEmpate[p][q] = "manual";
        else if (!pelosNumeros) viaOrdemManual[p][q] = 1;
      }
    }

    const semprePrimeiros8 = new Array(n).fill(true);
    const sempreFora = new Array(n).fill(true);
    const dependeDoSaldo = new Array(n).fill(false);
    const dependeDoDesempate = new Array(n).fill(false);
    const pontos = new Int32Array(n), vitorias = new Int32Array(n);
    const duplas = pendentes.map((j) => [j.dupla1.map((id) => indice.get(id)), j.dupla2.map((id) => indice.get(id))]);

    // Em cada cenário, ordena por pontos e V (chave = pontos × fator + V, com o fator maior que
    // qualquer V possível) e só compara par a par dentro de cada grupo empatado. A ordem muda
    // pouco de um cenário para o seguinte, então a ordenação por inserção é quase linear.
    const fator = 1 + Math.max(0, ...atual.map((l, i) => l.v + jogosPendentes[i].length));
    const chave = new Float64Array(n);
    const ordem = Int32Array.from({ length: n }, (_, i) => i);

    for (let cenario = 0; cenario < totalCenarios; cenario++) {
      for (let i = 0; i < n; i++) { pontos[i] = atual[i].pontos; vitorias[i] = atual[i].v; }
      let resto = cenario;
      for (const [d1, d2] of duplas) {
        const d = DESFECHOS[resto % DESFECHOS.length];
        resto = Math.floor(resto / DESFECHOS.length);
        for (const i of d1) { pontos[i] += d[0]; vitorias[i] += d[1]; }
        for (const i of d2) { pontos[i] += d[2]; vitorias[i] += d[3]; }
      }

      for (let i = 0; i < n; i++) chave[i] = pontos[i] * fator + vitorias[i];
      for (let k = 1; k < n; k++) {
        const x = ordem[k], cx = chave[x];
        let m = k - 1;
        while (m >= 0 && chave[ordem[m]] < cx) { ordem[m + 1] = ordem[m]; m--; }
        ordem[m + 1] = x;
      }

      // Percorre os grupos empatados em pontos e V; `inicio` = quantos estão estritamente à frente.
      for (let inicio = 0; inicio < n;) {
        if (inicio >= VAGAS) {
          // Daqui para baixo, todos têm pelo menos 8 à frente.
          for (let k = inicio; k < n; k++) semprePrimeiros8[ordem[k]] = false;
          break;
        }
        let fim = inicio + 1;
        while (fim < n && chave[ordem[fim]] === chave[ordem[inicio]]) fim++;
        let alguemAindaJoga = false;
        for (let k = inicio; k < fim; k++) if (!terminou[ordem[k]]) alguemAindaJoga = true;

        for (let k = inicio; k < fim; k++) {
          const p = ordem[k];
          let frente = inicio, empatadosSaldo = 0, empatadosManual = 0;
          for (let m = inicio; m < fim; m++) {
            const q = ordem[m];
            if (q === p) continue;
            // Com alguém que ainda joga no mesmo grupo, a ordem manual entre os dois pode ser
            // descartada (o grupo muda): o desfecho depende do saldo de quem ainda joga.
            const d = viaOrdemManual[p][q] && alguemAindaJoga ? 0 : desempate[p][q];
            if (d > 0) frente++;
            else if (d === 0) {
              if (tipoEmpate[p][q] === "manual") empatadosManual++;
              else empatadosSaldo++;
            }
          }
          const empatados = empatadosSaldo + empatadosManual;
          if (frente + empatados > VAGAS - 1) semprePrimeiros8[p] = false;
          if (frente < VAGAS) sempreFora[p] = false;
          if (frente < VAGAS && frente + empatados >= VAGAS) {
            if (empatadosSaldo) dependeDoSaldo[p] = true;
            if (empatadosManual) dependeDoDesempate[p] = true;
          }
        }
        inicio = fim;
      }
    }

    return atual.map((l, i) => {
      let situacao = "disputa";
      if (semprePrimeiros8[i]) situacao = "garantido";
      else if (sempreFora[i]) situacao = "eliminado";
      return {
        id: l.id,
        nome: l.nome,
        situacao,
        dependeDoSaldo: situacao === "disputa" && dependeDoSaldo[i],
        dependeDoDesempate: situacao === "disputa" && dependeDoDesempate[i],
        jogosPendentes: jogosPendentes[i],
      };
    });
  }

  globalThis.Regras = {
    calcularSituacoes,
    CONFRONTOS,
    MELHOR_DE,
    REGRAS_PADRAO,
    VAGAS_FASE_FINAL,
    MAX_PENDENTES_SITUACOES,
    MAX_CENARIOS_SITUACOES,
    limitePendentesSituacoes,
    contarCenarios,
    normalizarConfig,
    validarConfig,
    baseDosJogadores,
    MAX_CARACTERES_NOME,
    normalizarNome,
    chaveDoNome,
    gerarIdJogador,
    interpretarListaNomes,
    validarNomeJogador,
    adicionarJogadores,
    renomearJogador,
    removerJogador,
    cadastroTravado,
    diagnosticarCampeonato,
    semanaDoJogo,
    progressoPorSemana,
    contarSemanasCompletas,
    precisaDeBackup,
    DIAS_PARA_LEMBRAR_BACKUP,
    semanaAtual,
    ultimaSemanaComResultado,
    classificacaoPorSemana,
    jogosPorSemana,
    gerarCalendario,
    avaliarCalendario,
    trocarJogadorNoCalendario,
    calendarioParaJogos,
    duplasDasSemis,
    gerarMataMata,
    avisosParaGerarChaveamento,
    analisarPartida,
    analisarSerie,
    normalizarPartidas,
    definirCampoPartida,
    validarDuplas,
    definirDupla,
    voltarDuplaAutomatica,
    atualizarDuplasDasSemis,
    fixarDuplasJogadas,
    atualizarDuplasDasFinais,
    resolverMataMata,
    efeitosDoResultado,
    aplicarJogo,
    aplicarJogos,
    podarDesempatesManuais,
    definirOrdemDesempate,
    compararCriterios,
    detectarEmpatesTecnicos,
    calcularClassificacao,
  };
})();
