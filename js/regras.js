// Regras do campeonato (fonte: docs/REGULAMENTO.md).
// FUNÇÕES PURAS: não acessam DOM nem localStorage e não alteram os argumentos.

(function () {
  "use strict";

  const GOLS_WO = 3; // W.O. = 3x0 para a dupla presente

  // Parâmetros do campeonato. Tudo que pode mudar de uma edição para outra fica aqui
  // e é passado às funções por `config` (opcional: sem ele vale o padrão abaixo).
  //   pontosEmpateSemGols: o 0x0 conta como empate (E), mas vale esse tanto de pontos.
  //   vagasFaseFinal: quantos jogadores vão para o mata-mata (de 4 a 99; padrão 8).
  //   terceiroLugar: disputa de 3º lugar (só existe quando há duas semifinais).
  //   melhorDe: jogos de cada rodada do mata-mata, só o que foge do padrão (jogo único; a final
  //     em melhor de 3). Chaves: "final", "semifinais", "quartas", "oitavas", "rodada1"... e "terceiro".
  //   grupos: null (liga única) ou { quantidade, classificados } (fase de grupos; aí vagasFaseFinal =
  //     quantidade × classificados). Ver "Fase de grupos" mais abaixo.
  const REGRAS_PADRAO = Object.freeze({
    pontosVitoria: 3,
    pontosEmpate: 1,
    pontosEmpateSemGols: 0,
    vagasFaseFinal: 8,
    terceiroLugar: true,
    melhorDe: Object.freeze({}),
    jogosPorJogador: 6,
    semanas: 8,
    grupos: null,
  });
  const VAGAS_FASE_FINAL = REGRAS_PADRAO.vagasFaseFinal;
  const MIN_VAGAS_FASE_FINAL = 4;
  const MAX_VAGAS_FASE_FINAL = 99;
  const OPCOES_MELHOR_DE = Object.freeze([1, 3, 5]);

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
    if (!Number.isInteger(c.vagasFaseFinal) || c.vagasFaseFinal < MIN_VAGAS_FASE_FINAL || c.vagasFaseFinal > MAX_VAGAS_FASE_FINAL) {
      return `vagas na fase final precisa ser um inteiro de ${MIN_VAGAS_FASE_FINAL} a ${MAX_VAGAS_FASE_FINAL}.`;
    }
    if (typeof c.terceiroLugar !== "boolean") return "terceiroLugar precisa ser verdadeiro ou falso.";
    return erroDeMelhorDe(c.melhorDe) || erroDosGrupos(c.grupos, c.vagasFaseFinal);
  }

  // Jogos por rodada do mata-mata: { chave: 1 | 3 | 5 }. Erro em português ou null.
  function erroDeMelhorDe(melhorDe) {
    if (!melhorDe || typeof melhorDe !== "object" || Array.isArray(melhorDe)) return "melhorDe precisa ser um objeto.";
    for (const [chave, n] of Object.entries(melhorDe)) {
      if (!OPCOES_MELHOR_DE.includes(n)) return `melhorDe de "${chave}" precisa ser 1, 3 ou 5.`;
    }
    return null;
  }

  // Base zerada da classificação: um jogador por linha, sem jogos. Com fase de grupos, a linha leva o
  // grupo do jogador (só se ele tiver um).
  function baseDosJogadores(jogadores) {
    return jogadores.map((j) => {
      const linha = { id: j.id, nome: j.nome, pontos: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0 };
      if (j.grupo) linha.grupo = j.grupo;
      return linha;
    });
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
  // Com fase de grupos, valem os empates dentro de cada grupo e os da semeadura (entre grupos).
  function podarDesempatesManuais(base, jogos, desempatesManuais, config = REGRAS_PADRAO) {
    const grupos = usaGrupos(config)
      ? [
        ...letrasDosGrupos(config.grupos.quantidade).flatMap((g) =>
          detectarEmpatesTecnicos(aplicarJogos(base.filter((l) => l.grupo === g), jogos, config))),
        ...empatesDaSemeadura(candidatosDaSemeadura(classificacaoDosGrupos(base, jogos, desempatesManuais, config), config, [])),
      ]
      : detectarEmpatesTecnicos(aplicarJogos(base, jogos, config));
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
      lista.push({ id: gerarIdJogador(nome, lista.map((j) => j.id)), nome, estrelas: null });
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

  // ---------- Nível (estrelas) ----------
  // De 1 a 5, definido pelo organizador; só serve ao sorteio (docs/REGULAMENTO.md, "Equilíbrio
  // por nível"). null = ainda não definido.

  const ESTRELAS_MIN = 1;
  const ESTRELAS_MAX = 5;
  const ESTRELAS_NEUTRAS = 3; // usado só nas contas, se faltar algum valor

  function validarEstrelas(valor) {
    return Number.isInteger(valor) && valor >= ESTRELAS_MIN && valor <= ESTRELAS_MAX;
  }

  // Retorna { jogadores } com as estrelas do jogador definidas ou { erro }.
  function definirEstrelas(jogadores, id, estrelas) {
    if (!jogadores.some((j) => j.id === id)) return { erro: "Jogador não encontrado." };
    if (!validarEstrelas(estrelas)) return { erro: `Use de ${ESTRELAS_MIN} a ${ESTRELAS_MAX} estrelas.` };
    return { jogadores: jogadores.map((j) => (j.id === id ? { ...j, estrelas } : j)) };
  }

  function jogadoresSemEstrelas(jogadores) {
    return jogadores.filter((j) => !validarEstrelas(j.estrelas));
  }

  function estrelasPorId(jogadores) {
    return new Map(jogadores.map((j) => [j.id, validarEstrelas(j.estrelas) ? j.estrelas : ESTRELAS_NEUTRAS]));
  }

  // Diferença entre duas duplas, posição a posição: |forte − forte| + |fraco − fraco|.
  // Ex.: 5+5 × 5+4 = 1; 4+2 × 5+1 = 2; 5+5 × 4+4 = 2; 5+1 × 3+3 = 4; 5+5 × 1+1 = 8.
  function diferencaDoJogo(dupla1, dupla2, estrelas) {
    const e = (id) => estrelas.get(id) ?? ESTRELAS_NEUTRAS;
    const [a1, a2] = [e(dupla1[0]), e(dupla1[1])];
    const [b1, b2] = [e(dupla2[0]), e(dupla2[1])];
    return Math.abs(Math.max(a1, a2) - Math.max(b1, b2)) + Math.abs(Math.min(a1, a2) - Math.min(b1, b2));
  }

  // Jogo aceitável: diferença de no máximo 1 estrela (docs/REGULAMENTO.md). Duplas fortes ou
  // fracas são normais, desde que enfrentem uma parecida.
  const DIFERENCA_ACEITAVEL = 1;

  // Equilíbrio de um calendário: diferença de cada jogo e saldo de estrelas de cada jogador
  // (soma do seu lado − soma do lado adversário, somado nos seus jogos).
  function medirEquilibrio(calendario, estrelas) {
    const e = (id) => estrelas.get(id) ?? ESTRELAS_NEUTRAS;
    const saldos = new Map([...estrelas.keys()].map((id) => [id, 0]));
    const diferencas = [];
    for (const jogo of calendario) {
      diferencas.push(diferencaDoJogo(jogo.dupla1, jogo.dupla2, estrelas));
      const delta = e(jogo.dupla1[0]) + e(jogo.dupla1[1]) - e(jogo.dupla2[0]) - e(jogo.dupla2[1]);
      for (const id of jogo.dupla1) saldos.set(id, (saldos.get(id) || 0) + delta);
      for (const id of jogo.dupla2) saldos.set(id, (saldos.get(id) || 0) - delta);
    }
    return { diferencas, saldos };
  }

  // Depois que o calendário é confirmado (ou já há jogos), a lista de jogadores e os
  // parâmetros do sorteio não podem mais mudar: só renomear.
  function cadastroTravado(campeonato, jogos) {
    return jogos.length > 0 || Boolean(campeonato.sorteio && campeonato.sorteio.confirmado);
  }

  // Confere se jogadores × jogos por jogador × semanas formam um calendário possível
  // (cada jogo tem 4 jogadores; no máximo 1 jogo por jogador por semana; sem repetir parceiro).
  // Retorna { jogadores, totalJogos, jogosPorSemanaMin, jogosPorSemanaMax, grupos, problemas: [texto], pronto }.
  // Com fase de grupos, a conta é feita grupo a grupo (cada um tem o seu sorteio) e `grupos` traz
  // [{ grupo, jogadores, totalJogos }]: o tamanho real, ou o esperado enquanto os grupos não foram formados.
  function diagnosticarCampeonato(jogadores, config = REGRAS_PADRAO) {
    const n = jogadores.length;
    const jogos = config.jogosPorJogador;
    const semanas = config.semanas;
    const problemas = [];
    if (n < config.vagasFaseFinal) problemas.push(`Cadastre pelo menos ${config.vagasFaseFinal} jogadores (hoje: ${n}).`);
    let grupos = null;
    if (usaGrupos(config)) {
      grupos = diagnosticarGrupos(jogadores, config, problemas);
    } else {
      const vagas = n * jogos;
      if (vagas % 4 !== 0) {
        problemas.push(`${n} jogadores × ${jogos} jogos = ${vagas} vagas, e cada jogo ocupa 4: não fecha. Ajuste os jogadores ou os jogos por jogador.`);
      }
    }
    if (jogos > semanas) {
      problemas.push(`Cada jogador joga no máximo uma vez por semana: ${jogos} jogos pedem pelo menos ${jogos} semanas (há ${semanas}).`);
    }
    if (!grupos && n > 0 && jogos > n - 1) {
      problemas.push(`Sem repetir parceiro, ${n} jogadores permitem no máximo ${n - 1} jogos por jogador.`);
    }
    const semEstrelas = jogadoresSemEstrelas(jogadores);
    if (semEstrelas.length) {
      const nomes = semEstrelas.slice(0, 5).map((j) => j.nome).join(", ") + (semEstrelas.length > 5 ? ` e mais ${semEstrelas.length - 5}` : "");
      problemas.push(`Defina as estrelas (nível de ${ESTRELAS_MIN} a ${ESTRELAS_MAX}) de ${semEstrelas.length} ${semEstrelas.length === 1 ? "jogador" : "jogadores"}: ${nomes}.`);
    }
    // Com grupos, cada semana soma os jogos de cada grupo (as sobras de cada um ficam nas primeiras semanas).
    const totalJogos = grupos ? grupos.reduce((soma, g) => soma + g.totalJogos, 0) : Math.floor((n * jogos) / 4);
    const porSemana = grupos && semanas > 0
      ? grupos.map((g) => jogosPorSemana(g.totalJogos, semanas)).reduce((soma, lista) => soma.map((v, i) => v + lista[i]))
      : null;
    return {
      jogadores: n,
      totalJogos,
      jogosPorSemanaMin: porSemana ? Math.min(...porSemana) : Math.floor(totalJogos / semanas),
      jogosPorSemanaMax: porSemana ? Math.max(...porSemana) : Math.ceil(totalJogos / semanas),
      grupos,
      problemas,
      pronto: problemas.length === 0,
    };
  }

  // ---------- Sorteio do calendário ----------
  // Calendário = [{ semana, dupla1: [id, id], dupla2: [id, id] }]. Restrições do sorteio
  // (docs/REGULAMENTO.md): todos com o mesmo número de jogos, no máximo 1 jogo por jogador por
  // semana e nenhum parceiro repetido; adversários repetidos são evitados, mas podem acontecer.

  // Poucas tentativas, mas cada uma bem melhorada (trocas locais): mais eficiente que muitas
  // tentativas pouco melhoradas. Medido com 32 jogadores × 6 jogos × 8 semanas: ~1 s por sorteio.
  const TENTATIVAS_SORTEIO = 8; // calendários completos construídos; fica o melhor
  const TENTATIVAS_SEMANA = 6; // formas de montar cada semana; fica a melhor
  const TENTATIVAS_ESCOLHA = 5; // escolhas de quem joga na semana, se a primeira não fecha as duplas
  const MAX_TENTATIVAS_SORTEIO = 60; // se nenhum dos TENTATIVAS_SORTEIO fechou, tenta até aqui
  const MELHORAS_POR_TENTATIVA = 1000;

  // Pesos dos critérios desejáveis (docs/REGULAMENTO.md), aplicados ao quadrado de cada desvio:
  // 1 estrela de diferença num jogo custa 8; um adversário repetido custa 12; um jogo fora do
  // aceitável (2 estrelas ou mais) custa 8 × d² + 100. Assim quase todo jogo fica aceitável e as
  // repetições de adversário, poucas.
  const PESO_JOGO = 8;
  const PESO_FORA_DO_ACEITAVEL = 100;
  const PESO_SALDO = 1;
  const PESO_ADVERSARIO = 12;

  function custoDaDiferenca(d) {
    return PESO_JOGO * d * d + (d > DIFERENCA_ACEITAVEL ? PESO_FORA_DO_ACEITAVEL : 0);
  }

  // Custo total de um calendário (menor = melhor): o mesmo critério para escolher entre tentativas.
  function custoDoCalendario(calendario, estrelas) {
    const encontros = new Map();
    for (const jogo of calendario) {
      for (const a of jogo.dupla1) for (const b of jogo.dupla2) {
        const chave = chaveDoPar(a, b);
        encontros.set(chave, (encontros.get(chave) || 0) + 1);
      }
    }
    let repetidos = 0;
    for (const vezes of encontros.values()) if (vezes > 1) repetidos += (vezes - 1) ** 2;
    const eq = medirEquilibrio(calendario, estrelas);
    let saldos = 0;
    for (const s of eq.saldos.values()) saldos += s * s;
    return PESO_ADVERSARIO * repetidos + eq.diferencas.reduce((soma, d) => soma + custoDaDiferenca(d), 0) + PESO_SALDO * saldos;
  }

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

  // Monta os jogos de uma semana com os 4×g jogadores `jogam`: primeiro duplas sorteadas (sem
  // repetir parceiro); depois melhora aos poucos, trocando duplas de jogo ou jogadores de dupla
  // (sem criar parceiro repetido), para evitar adversário repetido e equilibrar o nível.
  // nivel = { estrelas: Map id -> estrelas, saldos: Map id -> saldo até aqui }.
  // Retorna { jogos: [{ dupla1, dupla2 }], custo } ou null se não achou duplas válidas.
  function montarSemana(jogam, parceiros, encontros, sorteio, nivel) {
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
    const { estrelas, saldos } = nivel;
    const e = (id) => estrelas.get(id) ?? ESTRELAS_NEUTRAS;
    const custoDoJogo = (k) => {
      const x = duplas[2 * k], y = duplas[2 * k + 1];
      let repetidos = 0;
      for (const a of x) for (const b of y) repetidos += vezes(a, b) ** 2;
      // Saldo: cada jogador joga uma vez na semana, então comparar (saldo + delta)² equivale a
      // comparar o quanto o saldo de cada um piora ou melhora.
      const delta = e(x[0]) + e(x[1]) - e(y[0]) - e(y[1]);
      const s = (id) => saldos.get(id) || 0;
      const saldo = (s(x[0]) + delta) ** 2 + (s(x[1]) + delta) ** 2 + (s(y[0]) - delta) ** 2 + (s(y[1]) - delta) ** 2;
      return PESO_ADVERSARIO * repetidos + custoDaDiferenca(diferencaDoJogo(x, y, estrelas)) + PESO_SALDO * saldo;
    };
    const quantidadeJogos = duplas.length / 2;
    let custo = 0;
    for (let k = 0; k < quantidadeJogos; k++) custo += custoDoJogo(k);

    for (let tentativa = 0; tentativa < MELHORAS_POR_TENTATIVA && custo > 0; tentativa++) {
      const x = Math.floor(sorteio() * duplas.length);
      const y = Math.floor(sorteio() * duplas.length);
      const kx = Math.floor(x / 2), ky = Math.floor(y / 2);
      if (x === y) continue;
      const custoDosJogos = () => custoDoJogo(kx) + (kx === ky ? 0 : custoDoJogo(ky));
      const antes = custoDosJogos();
      if (kx !== ky && sorteio() < 0.5) {
        // Troca as duplas de jogo.
        [duplas[x], duplas[y]] = [duplas[y], duplas[x]];
        const depois = custoDosJogos();
        if (depois < antes) custo += depois - antes;
        else [duplas[x], duplas[y]] = [duplas[y], duplas[x]]; // não melhorou: desfaz
      } else {
        // Troca um jogador de uma dupla com um da outra, se não formar parceiro repetido.
        const px = Math.floor(sorteio() * 2), py = Math.floor(sorteio() * 2);
        const dx = duplas[x], dy = duplas[y];
        if (parceiros.has(chaveDoPar(dx[1 - px], dy[py])) || parceiros.has(chaveDoPar(dy[1 - py], dx[px]))) continue;
        [dx[px], dy[py]] = [dy[py], dx[px]];
        const depois = custoDosJogos();
        if (depois < antes) custo += depois - antes;
        else [dx[px], dy[py]] = [dy[py], dx[px]];
      }
    }

    const jogos = [];
    for (let k = 0; k < quantidadeJogos; k++) jogos.push({ dupla1: duplas[2 * k], dupla2: duplas[2 * k + 1] });
    return { jogos, custo };
  }

  // Uma tentativa de calendário completo. Retorna { calendario, custo } ou null.
  function construirCalendario(ids, jogosPorJogador, tamanhos, sorteio, estrelas) {
    const restantes = new Map(ids.map((id) => [id, jogosPorJogador]));
    const parceiros = new Set();
    const encontros = new Map();
    const saldos = new Map(ids.map((id) => [id, 0]));
    const nivel = { estrelas, saldos };
    const e = (id) => estrelas.get(id) ?? ESTRELAS_NEUTRAS;
    const calendario = [];

    for (let semana = 0; semana < tamanhos.length; semana++) {
      const semanasRestantes = tamanhos.length - semana;
      const vagas = 4 * tamanhos[semana];
      const comJogos = ids.filter((id) => restantes.get(id) > 0);
      const obrigados = comJogos.filter((id) => restantes.get(id) === semanasRestantes); // não podem mais descansar
      if (obrigados.length > vagas || comJogos.length < vagas) return null;

      // Se não der para formar duplas sem repetir parceiro com quem foi escolhido, escolhe de novo quem joga
      // (acontece em grupos pequenos, em que quase todos os parceiros possíveis são usados).
      let melhor = null, jogam = null;
      for (let escolha = 0; escolha < TENTATIVAS_ESCOLHA && !melhor; escolha++) {
        // Quem tem mais jogos a cumprir joga primeiro; empate decidido pelo sorteio.
        const outros = embaralhar(comJogos.filter((id) => restantes.get(id) < semanasRestantes), sorteio)
          .sort((a, b) => restantes.get(b) - restantes.get(a));
        jogam = obrigados.concat(outros.slice(0, vagas - obrigados.length));
        for (let t = 0; t < TENTATIVAS_SEMANA; t++) {
          const montada = montarSemana(jogam, parceiros, encontros, sorteio, nivel);
          if (montada && (!melhor || montada.custo < melhor.custo)) melhor = montada;
          if (melhor && melhor.custo === 0) break;
        }
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
        const delta = e(jogo.dupla1[0]) + e(jogo.dupla1[1]) - e(jogo.dupla2[0]) - e(jogo.dupla2[1]);
        for (const id of jogo.dupla1) saldos.set(id, saldos.get(id) + delta);
        for (const id of jogo.dupla2) saldos.set(id, saldos.get(id) - delta);
      }
      for (const id of jogam) restantes.set(id, restantes.get(id) - 1);
    }

    return { calendario, custo: custoDoCalendario(calendario, estrelas) };
  }

  // Sorteia o calendário inteiro. `semente` (inteiro) torna o resultado reproduzível.
  // Com `grupos` (config.grupos), cada grupo tem o seu sorteio, só com os próprios jogadores; as semanas são
  // comuns e, em cada uma, vêm os jogos do Grupo A, depois os do B...
  // Retorna { calendario } ou { erro: texto }.
  function gerarCalendario(jogadores, { jogosPorJogador, semanas, semente, grupos = null }) {
    const vagasFaseFinal = grupos ? grupos.quantidade * grupos.classificados : REGRAS_PADRAO.vagasFaseFinal;
    const diagnostico = diagnosticarCampeonato(jogadores, { ...REGRAS_PADRAO, jogosPorJogador, semanas, grupos, vagasFaseFinal });
    if (!diagnostico.pronto) return { erro: diagnostico.problemas.join(" ") };

    const estrelas = estrelasPorId(jogadores);
    const sorteio = criarSorteador(semente);
    const partes = grupos ? jogadoresPorGrupo(jogadores, grupos.quantidade) : [{ grupo: null, ids: jogadores.map((j) => j.id) }];
    const calendarios = [];
    for (const { grupo, ids } of partes) {
      const tamanhos = jogosPorSemana((ids.length * jogosPorJogador) / 4, semanas);
      let melhor = null;
      for (let t = 0; t < TENTATIVAS_SORTEIO || (!melhor && t < MAX_TENTATIVAS_SORTEIO); t++) {
        const tentativa = construirCalendario(ids, jogosPorJogador, tamanhos, sorteio, estrelas);
        if (tentativa && (!melhor || tentativa.custo < melhor.custo)) melhor = tentativa;
        if (melhor && melhor.custo === 0) break;
      }
      if (!melhor) {
        const qual = grupo ? `o calendário do Grupo ${grupo}` : "um calendário";
        return { erro: `Não foi possível montar ${qual} com essas combinações. Tente sortear de novo.` };
      }
      calendarios.push(melhor.calendario);
    }
    if (calendarios.length === 1) return { calendario: calendarios[0] };
    const calendario = [];
    for (let semana = 1; semana <= semanas; semana++) {
      for (const c of calendarios) calendario.push(...c.filter((j) => j.semana === semana));
    }
    return { calendario };
  }

  // Confere um calendário (rascunho ou jogos confirmados). Violações são as restrições do
  // regulamento; os adversários repetidos são só informativos.
  // Retorna { jogosPorJogador: [{ id, nome, jogos }], minJogos, maxJogos,
  //           parceirosRepetidos: [{ jogadores: [nomeA, nomeB], vezes }],
  //           adversariosRepetidos: { pares, maxVezes },
  //           jogosPorSemana: [n por semana], violacoes: [texto], pronto }
  // Com fase de grupos, jogo com jogadores de grupos diferentes também é violação.
  function avaliarCalendario(jogadores, calendario, config = REGRAS_PADRAO) {
    const nome = new Map(jogadores.map((j) => [j.id, j.nome]));
    const grupoDe = new Map(jogadores.map((j) => [j.id, j.grupo || null]));
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
      if (usaGrupos(config) && new Set([...jogo.dupla1, ...jogo.dupla2].map((id) => grupoDe.get(id))).size > 1) {
        violacoes.push(`Semana ${jogo.semana}: o jogo mistura jogadores de grupos diferentes.`);
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
        violacoes.push(`${j.nome} tem ${j.jogos} ${j.jogos === 1 ? "jogo" : "jogos"} (o esperado é ${config.jogosPorJogador}).`);
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
      equilibrio: avaliarEquilibrio(jogadores, calendario),
      violacoes,
      pronto: violacoes.length === 0,
    };
  }

  // Equilíbrio por nível (só informativo; nunca é violação). null se falta estrela de alguém
  // (ex.: campeonato anterior às estrelas).
  // Retorna { porJogo: [diferença], perfeitos (0), aceitaveis (até DIFERENCA_ACEITAVEL, inclui os
  //           perfeitos), foraDoAceitavel, maiorDiferenca, saldos: [{ id, nome, saldo }],
  //           maiorSaldo: { id, nome, saldo } | null }
  function avaliarEquilibrio(jogadores, calendario) {
    if (!jogadores.length || jogadoresSemEstrelas(jogadores).length) return null;
    const estrelas = estrelasPorId(jogadores);
    const validos = calendario.filter((j) => [...j.dupla1, ...j.dupla2].every((id) => estrelas.has(id)));
    const eq = medirEquilibrio(validos, estrelas);
    const saldos = jogadores.map((j) => ({ id: j.id, nome: j.nome, saldo: eq.saldos.get(j.id) || 0 }));
    const maiorSaldo = saldos.reduce((maior, s) => (!maior || Math.abs(s.saldo) > Math.abs(maior.saldo) ? s : maior), null);
    const porJogo = calendario.map((j) => (validos.includes(j) ? diferencaDoJogo(j.dupla1, j.dupla2, estrelas) : null));
    const difs = eq.diferencas;
    return {
      porJogo,
      perfeitos: difs.filter((d) => d === 0).length,
      aceitaveis: difs.filter((d) => d <= DIFERENCA_ACEITAVEL).length,
      foraDoAceitavel: difs.filter((d) => d > DIFERENCA_ACEITAVEL).length,
      maiorDiferenca: difs.length ? Math.max(...difs) : 0,
      saldos,
      maiorSaldo,
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

  // ---------- Fase de grupos ----------
  // Opcional (docs/REGULAMENTO.md, "Fase de grupos"): config.grupos = { quantidade, classificados }, e cada
  // jogador tem `grupo` ("A", "B"...). O sorteio e a classificação são por grupo; os primeiros de cada grupo
  // vão para a fase final, semeados pela campanha numa lista única. Sem config.grupos, nada disso se aplica.

  const MIN_GRUPOS = 2;
  const MAX_GRUPOS = 8;

  function usaGrupos(config) {
    return Boolean(config && config.grupos);
  }

  // ["A", "B", ...] para `quantidade` grupos.
  function letrasDosGrupos(quantidade) {
    return Array.from({ length: quantidade }, (_, i) => String.fromCharCode(65 + i));
  }

  // Erro da configuração dos grupos (texto em português) ou null. null/undefined = liga única.
  function erroDosGrupos(grupos, vagasFaseFinal) {
    if (grupos === null || grupos === undefined) return null;
    if (typeof grupos !== "object" || Array.isArray(grupos)) return "grupos precisa ser um objeto.";
    const { quantidade, classificados } = grupos;
    if (!Number.isInteger(quantidade) || quantidade < MIN_GRUPOS || quantidade > MAX_GRUPOS) {
      return `o número de grupos precisa ser um inteiro de ${MIN_GRUPOS} a ${MAX_GRUPOS}.`;
    }
    if (!Number.isInteger(classificados) || classificados < 1) return "classificados por grupo precisa ser um inteiro ≥ 1.";
    if (quantidade * classificados !== vagasFaseFinal) {
      return `com grupos, as vagas na fase final são grupos × classificados por grupo (${quantidade} × ${classificados} = ${quantidade * classificados}, não ${vagasFaseFinal}).`;
    }
    return null;
  }

  // Ids dos jogadores de cada grupo: [{ grupo: "A", ids }], na ordem das letras.
  function jogadoresPorGrupo(jogadores, quantidade) {
    return letrasDosGrupos(quantidade).map((grupo) => ({ grupo, ids: jogadores.filter((j) => j.grupo === grupo).map((j) => j.id) }));
  }

  // Confere os grupos para o sorteio (acrescenta os problemas em `problemas`). Enquanto houver jogador sem
  // grupo, confere os tamanhos que a divisão vai dar (diferença de no máximo 1). Retorna
  // [{ grupo, jogadores, totalJogos }].
  function diagnosticarGrupos(jogadores, config, problemas) {
    const { quantidade, classificados } = config.grupos;
    const jogos = config.jogosPorJogador;
    const letras = letrasDosGrupos(quantidade);
    const semGrupo = jogadores.filter((j) => !letras.includes(j.grupo));
    let tamanhos;
    if (semGrupo.length) {
      if (jogadores.length) {
        problemas.push(`Forme os grupos: ${semGrupo.length} ${semGrupo.length === 1 ? "jogador está" : "jogadores estão"} sem grupo.`);
      }
      const base = Math.floor(jogadores.length / quantidade);
      tamanhos = letras.map((_, i) => base + (i < jogadores.length % quantidade ? 1 : 0));
    } else {
      tamanhos = jogadoresPorGrupo(jogadores, quantidade).map((g) => g.ids.length);
      const maior = Math.max(...tamanhos), menor = Math.min(...tamanhos);
      if (maior - menor > 1) {
        problemas.push(`Os grupos têm de ${menor} a ${maior} jogadores: a diferença entre eles pode ser de no máximo 1.`);
      }
    }
    // Problemas iguais em vários grupos (ex.: todos com 7 jogadores) aparecem uma vez só.
    const porTamanho = new Map();
    letras.forEach((g, i) => porTamanho.set(tamanhos[i], [...(porTamanho.get(tamanhos[i]) || []), g]));
    for (const [n, gs] of porTamanho) {
      if (!jogadores.length) break;
      const quais = gs.length === 1 ? `Grupo ${gs[0]}` : `Grupos ${gs.slice(0, -1).join(", ")} e ${gs[gs.length - 1]}`;
      if ((n * jogos) % 4 !== 0) {
        problemas.push(`${quais}: ${n} jogadores × ${jogos} jogos = ${n * jogos} vagas, e cada jogo ocupa 4: não fecha. Ajuste os jogadores, os grupos ou os jogos por jogador.`);
      }
      if (jogos > n - 1) {
        problemas.push(`${quais}: sem repetir parceiro, ${n} jogadores permitem no máximo ${Math.max(0, n - 1)} jogos por jogador.`);
      }
      if (n < classificados) {
        problemas.push(`${quais}: ${n} jogadores, menos que os ${classificados} classificados por grupo.`);
      }
    }
    return letras.map((grupo, i) => ({ grupo, jogadores: tamanhos[i], totalJogos: Math.floor((tamanhos[i] * jogos) / 4) }));
  }

  // Forma os grupos por potes de estrelas: os jogadores, do maior para o menor nível (empates sorteados),
  // são cortados em potes do tamanho do número de grupos, e cada pote manda um jogador para cada grupo, por
  // sorteio. O último pote pode ficar incompleto: alguns grupos têm 1 jogador a mais. Usa a semente do
  // sorteio do calendário. Retorna { jogadores } (mesma ordem, com `grupo`) ou { erro }.
  function formarGruposPorPotes(jogadores, quantidade, semente) {
    if (!Number.isInteger(quantidade) || quantidade < MIN_GRUPOS || quantidade > MAX_GRUPOS) {
      return { erro: `Use de ${MIN_GRUPOS} a ${MAX_GRUPOS} grupos.` };
    }
    const semEstrelas = jogadoresSemEstrelas(jogadores);
    if (semEstrelas.length) return { erro: "Defina as estrelas de todos os jogadores antes de formar os grupos." };
    const sorteio = criarSorteador(semente);
    const letras = letrasDosGrupos(quantidade);
    const ordenados = embaralhar(jogadores, sorteio).sort((a, b) => b.estrelas - a.estrelas);
    const grupoDe = new Map();
    for (let i = 0; i < ordenados.length; i += quantidade) {
      const destinos = embaralhar(letras, sorteio);
      ordenados.slice(i, i + quantidade).forEach((j, k) => grupoDe.set(j.id, destinos[k]));
    }
    return { jogadores: jogadores.map((j) => ({ ...j, grupo: grupoDe.get(j.id) })) };
  }

  // Ajuste manual: põe o jogador em outro grupo. Com todos já nos grupos, os tamanhos não podem ficar com
  // diferença maior que 1. Retorna { jogadores } ou { erro }.
  function moverJogadorDeGrupo(jogadores, id, grupo, quantidade) {
    if (!jogadores.some((j) => j.id === id)) return { erro: "Jogador não encontrado." };
    const letras = letrasDosGrupos(quantidade);
    if (!letras.includes(grupo)) return { erro: "Grupo inválido." };
    const novos = jogadores.map((j) => (j.id === id ? { ...j, grupo } : j));
    if (novos.every((j) => letras.includes(j.grupo))) {
      const tamanhos = jogadoresPorGrupo(novos, quantidade).map((g) => g.ids.length);
      const maior = Math.max(...tamanhos), menor = Math.min(...tamanhos);
      if (maior - menor > 1) {
        return { erro: `Os grupos ficariam com de ${menor} a ${maior} jogadores: a diferença pode ser de no máximo 1. Troque dois jogadores de grupo.` };
      }
    }
    return { jogadores: novos };
  }

  // Ajuste manual: dois jogadores de grupos diferentes trocam de grupo. Retorna { jogadores } ou { erro }.
  function trocarJogadoresDeGrupo(jogadores, idA, idB) {
    const a = jogadores.find((j) => j.id === idA), b = jogadores.find((j) => j.id === idB);
    if (!a || !b) return { erro: "Jogador não encontrado." };
    if (!a.grupo || !b.grupo) return { erro: "Os dois jogadores precisam estar em algum grupo." };
    if (a.grupo === b.grupo) return { erro: "Os dois jogadores já estão no mesmo grupo." };
    return { jogadores: jogadores.map((j) => (j.id === idA ? { ...j, grupo: b.grupo } : j.id === idB ? { ...j, grupo: a.grupo } : j)) };
  }

  // Classificação de cada grupo: [{ grupo, linhas }]. Cada grupo usa só os próprios jogos, e o empate técnico
  // é sinalizado quando começa entre os classificados do grupo. `ate` como em classificacaoPorSemana.
  function classificacaoDosGrupos(base, jogos, desempatesManuais = [], config = REGRAS_PADRAO, ate = null) {
    const configDoGrupo = { ...config, vagasFaseFinal: config.grupos.classificados };
    return letrasDosGrupos(config.grupos.quantidade).map((grupo) => {
      const baseDoGrupo = base.filter((l) => l.grupo === grupo);
      const ids = new Set(baseDoGrupo.map((l) => l.id));
      const jogosDoGrupo = jogos.filter((j) => ids.has(j.dupla1[0]));
      return { grupo, linhas: classificacaoPorSemana(baseDoGrupo, jogosDoGrupo, desempatesManuais, configDoGrupo, ate) };
    });
  }

  // Jogadores para a semeadura, com o grupo, a posição no grupo (contada sem os ausentes) e se está entre os
  // classificados do grupo. Os ausentes ficam de fora.
  function candidatosDaSemeadura(tabelas, config, ausentes) {
    const k = config.grupos.classificados;
    const candidatos = [];
    for (const { grupo, linhas } of tabelas) {
      linhas.filter((l) => !ausentes.includes(l.id)).forEach((l, i) => {
        candidatos.push({ ...l, grupo, posicaoNoGrupo: i + 1, classificado: i < k });
      });
    }
    return candidatos;
  }

  // Critérios 1 a 5 da semeadura: os do desempate e a melhor posição no grupo.
  function chaveDaSemeadura(linha) {
    return `${chaveCriterios(linha)}|${linha.posicaoNoGrupo}`;
  }

  // Empates da semeadura: jogadores (sempre de grupos diferentes) iguais nos critérios 1 a 5.
  function empatesDaSemeadura(candidatos) {
    const grupos = new Map();
    for (const l of candidatos) grupos.set(chaveDaSemeadura(l), [...(grupos.get(chaveDaSemeadura(l)) || []), l.id]);
    return [...grupos.values()].filter((ids) => ids.length > 1);
  }

  // Ordena pela campanha: pontos, V, saldo, gols pró, melhor posição no grupo e, empatados em tudo, a ordem
  // do organizador (sem ela, a alfabética, provisória). O empate é sinalizado (empateSemeadura) quando
  // alguém do grupo já jogou.
  function ordenarPelaCampanha(lista, desempatesManuais) {
    const linhas = lista.slice().sort((a, b) =>
      compararCriterios(a, b) || a.posicaoNoGrupo - b.posicaoNoGrupo || a.nome.localeCompare(b.nome, "pt-BR"));
    for (const grupo of empatesDaSemeadura(linhas)) {
      const manual = desempatesManuais.find((dm) => mesmoConjunto(dm.jogadores, grupo));
      const ordem = manual ? manual.jogadores : grupo;
      const inicio = linhas.findIndex((l) => l.id === grupo[0]);
      const trecho = ordem.map((id) => linhas.find((l) => l.id === id));
      const relevante = trecho.some((l) => l.v + l.e + l.d > 0);
      const info = { grupo: ordem.slice(), ordemManual: Boolean(manual) };
      linhas.splice(inicio, trecho.length, ...trecho.map((l) => (relevante ? { ...l, empateSemeadura: info } : l)));
    }
    return linhas;
  }

  // Lista da fase final com grupos: os classificados de todos os grupos, ordenados pela campanha (é a ordem
  // que forma as duplas: 1º + último...), depois os demais na mesma ordem (de onde saem os substitutos) e, por
  // último, os ausentes. Cada linha leva grupo, posicaoNoGrupo, classificado, ausente e empateSemeadura;
  // `posicao` é a posição na lista.
  function semeaduraPorCampanha(tabelas, config, desempatesManuais = [], ausentes = []) {
    const candidatos = candidatosDaSemeadura(tabelas, config, ausentes);
    const fora = tabelas.flatMap(({ grupo, linhas }) => linhas.filter((l) => ausentes.includes(l.id))
      .map((l) => ({ ...l, grupo, posicaoNoGrupo: null, classificado: false, ausente: true })));
    return [
      ...ordenarPelaCampanha(candidatos.filter((l) => l.classificado), desempatesManuais),
      ...ordenarPelaCampanha(candidatos.filter((l) => !l.classificado), desempatesManuais),
      ...fora,
    ].map((l, i) => ({ ausente: false, empateSemeadura: null, ...l, posicao: i + 1 }));
  }

  // A lista que o mata-mata usa (gerar, resolver, substituir): na liga única, a classificação; com grupos, a
  // semeadura pela campanha, já sem os `ausentes` marcados antes do chaveamento.
  function classificacaoDaFaseFinal(base, jogos, desempatesManuais = [], config = REGRAS_PADRAO, ausentes = []) {
    if (!usaGrupos(config)) return classificacaoPorSemana(base, jogos, desempatesManuais, config);
    return semeaduraPorCampanha(classificacaoDosGrupos(base, jogos, desempatesManuais, config), config, desempatesManuais, ausentes);
  }

  // ---------- Mata-mata ----------
  // Semis e 3º lugar em jogo único; final em melhor de 3. Sem empate: tempo normal,
  // prorrogação (gols só da prorrogação) e pênaltis. Não altera a classificação.

  // Com 8 vagas e a configuração padrão (o formato de antes da Fase 24, que continua valendo
  // para os chaveamentos já gerados): semi1, semi2, terceiro e final.
  const CONFRONTOS = ["semi1", "semi2", "terceiro", "final"];
  const MELHOR_DE = { semi1: 1, semi2: 1, terceiro: 1, final: 3 };
  const FORMATO_PADRAO = Object.freeze({ vagas: VAGAS_FASE_FINAL, terceiroLugar: true, melhorDe: Object.freeze({}) });

  // Formato do mata-mata: { vagas, terceiroLugar, melhorDe }. É copiado da configuração quando o
  // chaveamento é gerado e guardado nele (só se fugir do padrão), então mudar a configuração depois
  // não mexe num chaveamento que já existe. Sem `formato`, vale o padrão.
  function formatoDaConfig(config = REGRAS_PADRAO) {
    return { vagas: config.vagasFaseFinal, terceiroLugar: config.terceiroLugar !== false, melhorDe: { ...(config.melhorDe || {}) } };
  }

  function formatoDoMataMata(mataMata) {
    return (mataMata && mataMata.formato) || FORMATO_PADRAO;
  }

  function formatoEhPadrao(formato) {
    return JSON.stringify(formato) === JSON.stringify(FORMATO_PADRAO);
  }

  // Quantas duplas o mata-mata tem: duas por par de classificados e, com número ímpar, mais uma
  // incompleta (o jogador do meio da tabela, ainda sem parceiro).
  function numeroDeDuplas(vagas) {
    return Math.ceil(vagas / 2);
  }

  // As duplas pela classificação: 1º+último, 2º+penúltimo... Com vagas ímpares, a última dupla é
  // [jogador do meio, null]: o organizador escolhe o parceiro dele (ver definirDupla).
  function duplasIniciais(classificacao, vagas) {
    const ids = classificacao.slice(0, vagas).map((l) => l.id);
    const duplas = [];
    for (let i = 0; i < Math.floor(vagas / 2); i++) duplas.push([ids[i], ids[vagas - 1 - i]]);
    if (vagas % 2) duplas.push([ids[(vagas - 1) / 2], null]);
    return duplas;
  }

  // Estrutura do chaveamento para um formato (só depende do formato, não dos jogadores).
  //   duplas: quantas duplas entram; folgas: índices das que pulam a 1ª rodada (as melhores, quando o
  //   número de duplas não é potência de 2); rodadas: [{ id, nome, chaves }]; terceiro: chave ou null;
  //   ordem: todas as chaves, com o 3º lugar por último; fontes: de onde vem cada dupla de um
  //   confronto, { dupla: i } (pela classificação), { vencedor: chave } ou { perdedor: chave }.
  // As duplas vizinhas se enfrentam (D1×D2, D3×D4...) e os vencedores avançam na mesma ordem.
  const NOMES_DA_RODADA = [["final", "Final"], ["semifinais", "Semifinais"], ["quartas", "Quartas de final"], ["oitavas", "Oitavas de final"]];
  const PREFIXO_DA_CHAVE = { final: "final", semifinais: "semi", quartas: "quartas", oitavas: "oitavas" };

  function estruturaDoMataMata(formato) {
    const duplas = numeroDeDuplas(formato.vagas);
    let tamanho = 1;
    while (tamanho < duplas) tamanho *= 2;
    const totalRodadas = Math.round(Math.log2(tamanho));
    const folgas = Array.from({ length: tamanho - duplas }, (_, i) => i);
    const fontes = {};
    const rodadas = [];

    let jogam = Array.from({ length: duplas - folgas.length }, (_, i) => ({ dupla: folgas.length + i }));
    const esperando = folgas.map((i) => ({ dupla: i }));
    for (let r = 0; r < totalRodadas; r++) {
      const doFim = totalRodadas - 1 - r;
      const [id, nome] = NOMES_DA_RODADA[doFim] || [`rodada${r + 1}`, `Rodada ${r + 1}`];
      const prefixo = PREFIXO_DA_CHAVE[id] || `r${r + 1}-`;
      const total = jogam.length / 2;
      const chaves = Array.from({ length: total }, (_, i) => (id === "final" ? "final" : `${prefixo}${i + 1}`));
      chaves.forEach((chave, i) => { fontes[chave] = [jogam[2 * i], jogam[2 * i + 1]]; });
      rodadas.push({ id, nome, chaves });
      jogam = [...esperando.splice(0), ...chaves.map((chave) => ({ vencedor: chave }))];
    }

    const semis = rodadas.find((r) => r.id === "semifinais");
    const terceiro = formato.terceiroLugar && semis && semis.chaves.length === 2 ? "terceiro" : null;
    if (terceiro) fontes.terceiro = semis.chaves.map((chave) => ({ perdedor: chave }));
    const rodadaDe = {};
    for (const rodada of rodadas) for (const chave of rodada.chaves) rodadaDe[chave] = rodada.id;
    const todas = rodadas.flatMap((r) => r.chaves);
    return { duplas, folgas, rodadas, terceiro, fontes, rodadaDe, ordem: terceiro ? [...todas, terceiro] : todas };
  }

  // Quantos jogos tem o confronto: o escolhido na configuração, ou o padrão (final em melhor de 3,
  // o resto em jogo único).
  function melhorDeDoConfronto(mataMata, chave) {
    const formato = formatoDoMataMata(mataMata);
    const estrutura = estruturaDoMataMata(formato);
    const id = chave === "terceiro" ? "terceiro" : estrutura.rodadaDe[chave];
    return formato.melhorDe[id] || (id === "final" ? 3 : 1);
  }

  // Semi 1 = 1º+8º × 2º+7º; Semi 2 = 3º+6º × 4º+5º (o formato padrão).
  function duplasDasSemis(classificacao) {
    const d = duplasIniciais(classificacao, VAGAS_FASE_FINAL);
    return { semi1: [d[0], d[1]], semi2: [d[2], d[3]] };
  }

  function duplaCompleta(dupla) {
    return Array.isArray(dupla) && dupla.length === 2 && Boolean(dupla[0]) && Boolean(dupla[1]);
  }

  // Estrutura inicial do mata-mata. As duplas que vêm da classificação ficam congeladas na geração;
  // as que vêm dos resultados (vencedores e perdedores) começam em null = automática e ficam
  // congeladas quando o confronto ganha placar (ver fixarDuplasJogadas).
  // A classificação sem os jogadores ausentes da fase final: quem vem depois sobe e ocupa a mesma
  // posição (o 9º entra no lugar de um ausente do top 8; se ele também faltou, o 10º, e assim por diante).
  function semAusentes(classificacao, ausentes) {
    return ausentes && ausentes.length ? classificacao.filter((l) => !ausentes.includes(l.id)) : classificacao;
  }

  // `ausentes`: ids dos jogadores que não vão jogar a fase final, marcados antes de gerar o chaveamento.
  // Ficam em `mataMata.ausentes` (campo opcional, ausente = ninguém) para a classificação ser lida sempre igual.
  function gerarMataMata(classificacao, config = REGRAS_PADRAO, ausentes = []) {
    const formato = formatoDaConfig(config);
    const disponiveis = semAusentes(classificacao, ausentes);
    if (disponiveis.length < formato.vagas) throw new Error(`o chaveamento precisa de ${formato.vagas} jogadores.`);
    const estrutura = estruturaDoMataMata(formato);
    const duplas = duplasIniciais(disponiveis, formato.vagas);
    const confronto = (chave) => {
      const [f1, f2] = estrutura.fontes[chave];
      const inicial = (f) => (f.dupla !== undefined ? duplas[f.dupla].slice() : null);
      return { dupla1: inicial(f1), dupla2: inicial(f2), duplaManual1: false, duplaManual2: false, partidas: [] };
    };
    // Ordem das chaves como no formato de antes: o 3º lugar antes da final.
    const ultima = estrutura.ordem.filter((c) => c !== "final");
    const mataMata = {};
    if (!formatoEhPadrao(formato)) mataMata.formato = formato;
    if (ausentes.length) mataMata.ausentes = ausentes.slice();
    for (const chave of [...ultima, "final"]) mataMata[chave] = confronto(chave);
    return mataMata;
  }

  // Motivos para confirmar antes de gerar o chaveamento (lista vazia = tudo certo).
  function avisosParaGerarChaveamento(jogos, classificacao, config = REGRAS_PADRAO, ausentes = []) {
    const avisos = [];
    const pendentes = jogos.filter((j) => !efeitosDoResultado(j.resultado, config));
    if (pendentes.length) {
      // Por semana: com muitos jogos, só a quantidade; com poucos, o número de cada jogo na semana.
      const numeros = numerosNaSemana(jogos);
      const porSemana = new Map();
      for (const j of pendentes) porSemana.set(semanaDoJogo(j), (porSemana.get(semanaDoJogo(j)) || []).concat(numeros.get(j.id)));
      const semanas = [...porSemana].sort((a, b) => a[0] - b[0]);
      const listar = (ns) => (ns.length > 1 ? `jogos ${ns.slice(0, -1).join(", ")} e ${ns[ns.length - 1]}` : `jogo ${ns[0]}`);
      const detalhe = semanas.map(([semana, ns]) => `semana ${semana}: ${pendentes.length > 12 ? ns.length : listar(ns)}`).join("; ");
      avisos.push(`${pendentes.length} ${pendentes.length === 1 ? "jogo" : "jogos"} de classificação sem resultado (${detalhe}).`);
    }
    const nome = (id) => classificacao.find((l) => l.id === id).nome;
    const vistos = new Set();
    for (const linha of semAusentes(classificacao, ausentes).slice(0, config.vagasFaseFinal)) {
      // Com grupos: o empate dentro do grupo e o da semeadura (entre grupos).
      for (const [empate, onde] of [
        [linha.empateTecnico, linha.grupo ? `no Grupo ${linha.grupo}` : `no top ${config.vagasFaseFinal}`],
        [linha.empateSemeadura, "na semeadura da fase final"],
      ]) {
        if (!empate || empate.ordemManual) continue;
        const chave = empate.grupo.join("|");
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        avisos.push(`Empate técnico sem ordem manual ${onde}: ${empate.grupo.map(nome).join(", ")}.`);
      }
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
    if (confronto.wo) throw new Error(`${rotuloDoConfronto(chave)} está com W.O.: desfaça o W.O. antes de lançar placar.`);
    while (confronto.partidas.length <= indice) confronto.partidas.push({ gols1: null, gols2: null });
    confronto.partidas[indice][campo] = valor;
    confronto.partidas = normalizarPartidas(confronto.partidas, melhorDeDoConfronto(novo, chave));
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
    if (mataMata[chave].wo) throw new Error(`${rotuloDoConfronto(chave)} está com W.O.: desfaça o W.O. antes de trocar a dupla.`);
    const novo = clonarMataMata(mataMata);
    novo[chave][`dupla${lado}`] = dupla.slice();
    novo[chave][`duplaManual${lado}`] = true;
    return novo;
  }

  // Volta à dupla automática: nas semis, a da classificação atual; no 3º lugar e na
  // final, a que sai dos resultados das semis.
  function voltarDuplaAutomatica(mataMata, chave, lado, classificacao) {
    const novo = clonarMataMata(mataMata);
    const formato = formatoDoMataMata(mataMata);
    const fonte = estruturaDoMataMata(formato).fontes[chave][lado - 1];
    novo[chave][`dupla${lado}`] = fonte.dupla !== undefined
      ? duplasIniciais(semAusentes(classificacao, mataMata.ausentes), formato.vagas)[fonte.dupla].slice() : null;
    novo[chave][`duplaManual${lado}`] = false;
    return novo;
  }

  // Atualiza as duplas não manuais que vêm da classificação (a 1ª rodada, e as duplas que folgam)
  // para a classificação atual.
  function atualizarDuplasDasSemis(mataMata, classificacao) {
    const estrutura = estruturaDoMataMata(formatoDoMataMata(mataMata));
    let novo = mataMata;
    for (const chave of estrutura.ordem) {
      for (const lado of [1, 2]) {
        if (estrutura.fontes[chave][lado - 1].dupla === undefined) continue;
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
    for (const chave of resolvido.estrutura.ordem) {
      const c = novo[chave];
      for (const lado of [1, 2]) {
        if (resolvido.estrutura.fontes[chave][lado - 1].dupla !== undefined) continue;
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
    const estrutura = estruturaDoMataMata(formatoDoMataMata(mataMata));
    for (const chave of estrutura.ordem) {
      for (const lado of [1, 2]) {
        if (estrutura.fontes[chave][lado - 1].dupla !== undefined) continue;
        if (!novo[chave][`duplaManual${lado}`]) novo[chave][`dupla${lado}`] = null;
      }
    }
    return fixarDuplasJogadas(novo, classificacao, config);
  }

  function mesmaDupla(a, b) {
    if (!a || !b) return a === b;
    return mesmoConjunto(a, b);
  }

  // ---------- Trocar duplas de lugar ----------
  // O organizador reorganiza o chaveamento trocando de lugar duas duplas de confrontos da mesma
  // rodada (a = { chave, lado }, b = igual). As duas ficam como "alteradas manualmente"; trocar de novo
  // as devolve ao lugar de origem. Os vencedores avançam pelos confrontos como sempre.

  // Por que não dá para trocar, ou null se dá. Com `b` null, só confere se `a` pode ser a 1ª escolhida:
  // o confronto não pode ter placar (limpe antes) e a dupla precisa estar definida.
  function erroDeTrocaDeLugar(mataMata, classificacao, a, b, config = REGRAS_PADRAO) {
    const resolvido = resolverMataMata(mataMata, classificacao, config);
    const fontes = resolvido.estrutura.fontes;
    const origem = (x) => {
      if (!x || !fontes[x.chave] || (x.lado !== 1 && x.lado !== 2)) return "Confronto não encontrado.";
      const c = resolvido[x.chave];
      if (c.wo) return `${rotuloDoConfronto(x.chave)} está com W.O. Desfaça o W.O. antes de trocar as duplas de lugar.`;
      if (c.partidas.length) return `${rotuloDoConfronto(x.chave)} já tem placar lançado. Limpe os placares dele antes de trocar as duplas de lugar.`;
      if (!c[`dupla${x.lado}`]) return `A dupla ${x.lado} de ${rotuloDoConfronto(x.chave)} ainda não está definida.`;
      return null;
    };
    const erroA = origem(a);
    if (erroA || !b) return erroA;
    const erroB = origem(b);
    if (erroB) return erroB;
    if (a.chave === b.chave) return "As duas duplas já se enfrentam: escolha uma dupla de outro confronto.";
    const rodada = resolvido.estrutura.rodadaDe;
    if (rodada[a.chave] === undefined || rodada[a.chave] !== rodada[b.chave]) {
      return "Só dá para trocar duplas de lugar entre confrontos da mesma rodada.";
    }
    // Um jogador não pode ficar nas duas duplas do mesmo confronto (acontece se alguma dupla foi editada à mão).
    const dupla = (x) => resolvido[x.chave][`dupla${x.lado}`];
    const depois = (x, nova) => (x.lado === 1 ? [nova, resolvido[x.chave].dupla2] : [resolvido[x.chave].dupla1, nova]);
    for (const [x, nova] of [[a, dupla(b)], [b, dupla(a)]]) {
      const [d1, d2] = depois(x, nova);
      const erro = duplaCompleta(d1) && duplaCompleta(d2) ? validarDuplas(d1, d2) : null;
      if (erro) return `${rotuloDoConfronto(x.chave)}: ${erro}`;
    }
    return null;
  }

  // Novo mata-mata com as duplas de `a` e `b` trocadas de lugar. Lança Error se erroDeTrocaDeLugar não for null.
  function trocarDeLugar(mataMata, classificacao, a, b, config = REGRAS_PADRAO) {
    const erro = erroDeTrocaDeLugar(mataMata, classificacao, a, b, config);
    if (erro) throw new Error(erro);
    const resolvido = resolverMataMata(mataMata, classificacao, config);
    const novo = clonarMataMata(mataMata);
    const colocar = (alvo, dupla) => {
      const lado = resolvido[alvo.chave][`lado${alvo.lado}`];
      const doResultado = resolvido.estrutura.fontes[alvo.chave][alvo.lado - 1].dupla === undefined;
      const c = novo[alvo.chave];
      if (lado.automatica && mesmaDupla(dupla, lado.automatica)) {
        // De volta ao lugar de origem: deixa de ser manual (como depois de "Voltar à automática").
        c[`duplaManual${alvo.lado}`] = false;
        c[`dupla${alvo.lado}`] = doResultado ? null : lado.automatica.slice();
      } else {
        c[`dupla${alvo.lado}`] = dupla.slice();
        c[`duplaManual${alvo.lado}`] = true;
      }
    };
    const duplaA = resolvido[a.chave][`dupla${a.lado}`];
    const duplaB = resolvido[b.chave][`dupla${b.lado}`];
    colocar(a, duplaB);
    colocar(b, duplaA);
    return novo;
  }

  // ---------- Ausência durante o mata-mata ----------
  // Dois caminhos, escolhidos pelo organizador (docs/REGULAMENTO.md, "Ausência na fase final"):
  // substituir o jogador ausente pelo próximo da classificação que ainda não está no chaveamento, ou
  // dar W.O. à dupla dele (a dupla adversária avança sem placar).

  // O próximo da classificação que pode entrar no lugar de um ausente: fora do chaveamento, não marcado
  // como ausente antes de gerar e nunca antes substituído. Null se a classificação acabou.
  // Com grupos e o ausente informado (`jogadorId`), vem primeiro o próximo do mesmo grupo; se o grupo não
  // tiver mais ninguém, o próximo da lista geral (a semeadura).
  function proximoSubstituto(mataMata, classificacao, config = REGRAS_PADRAO, jogadorId = null) {
    const ocupados = new Set([...(mataMata.ausentes || []), ...(mataMata.substituidos || [])]);
    const resolvido = resolverMataMata(mataMata, classificacao, config);
    for (const chave of resolvido.chaves) {
      const c = resolvido[chave];
      for (const dupla of [c.dupla1, c.dupla2, c.lado1.automatica, c.lado2.automatica]) {
        for (const id of dupla || []) ocupados.add(id);
      }
    }
    const ausente = usaGrupos(config) && jogadorId ? classificacao.find((l) => l.id === jogadorId) : null;
    const doGrupo = ausente && ausente.grupo ? classificacao.find((l) => l.grupo === ausente.grupo && !ocupados.has(l.id)) : null;
    const proximo = doGrupo || classificacao.find((l) => !ocupados.has(l.id));
    return proximo ? proximo.id : null;
  }

  // Por que não dá para substituir `jogadorId` na dupla `lado` do confronto, ou null se dá.
  function erroDeSubstituicao(mataMata, classificacao, chave, lado, jogadorId, config = REGRAS_PADRAO) {
    const resolvido = resolverMataMata(mataMata, classificacao, config);
    if (!resolvido.estrutura.fontes[chave] || (lado !== 1 && lado !== 2)) return "Confronto não encontrado.";
    const c = resolvido[chave];
    const rotulo = rotuloDoConfronto(chave);
    if (c.wo) return `${rotulo} está com W.O. Desfaça o W.O. antes de substituir um jogador.`;
    if (c.serie.vencedor) return `${rotulo} já está decidido: não dá para substituir um jogador dele.`;
    const dupla = c[`dupla${lado}`];
    if (!dupla || !dupla.includes(jogadorId)) return "O jogador não está nessa dupla.";
    if (proximoSubstituto(mataMata, classificacao, config, jogadorId) === null) {
      return "Não há mais jogadores na classificação para entrar no lugar do ausente.";
    }
    return null;
  }

  // Novo mata-mata com o ausente trocado pelo próximo da classificação; a dupla segue (fica "alterada
  // manualmente"). Lança Error se erroDeSubstituicao não for null.
  function substituirJogador(mataMata, classificacao, chave, lado, jogadorId, config = REGRAS_PADRAO) {
    const erro = erroDeSubstituicao(mataMata, classificacao, chave, lado, jogadorId, config);
    if (erro) throw new Error(erro);
    const entra = proximoSubstituto(mataMata, classificacao, config, jogadorId);
    const dupla = resolverMataMata(mataMata, classificacao, config)[chave][`dupla${lado}`];
    const novo = definirDupla(mataMata, chave, lado, dupla.map((id) => (id === jogadorId ? entra : id)));
    novo.substituidos = [...(mataMata.substituidos || []), jogadorId];
    return novo;
  }

  // Por que não dá para dar W.O. à dupla `lado` do confronto, ou null se dá. Só uma dupla por confronto:
  // o W.O. das duas é decisão do organizador, fora do app.
  function erroDeWO(mataMata, classificacao, chave, lado, config = REGRAS_PADRAO) {
    const resolvido = resolverMataMata(mataMata, classificacao, config);
    if (!resolvido.estrutura.fontes[chave] || (lado !== 1 && lado !== 2)) return "Confronto não encontrado.";
    const c = resolvido[chave];
    const rotulo = rotuloDoConfronto(chave);
    if (c.wo === lado) return `A dupla ${lado} de ${rotulo} já está com W.O.`;
    if (c.wo) return `${rotulo} já tem W.O. da dupla ${c.wo}. O W.O. das duas duplas é decisão do organizador: desfaça o W.O. antes.`;
    if (!c.pronto) return `${rotulo} ainda não tem as duas duplas completas.`;
    if (c.partidas.length) return `${rotulo} já tem placar lançado. Limpe os placares dele antes de dar W.O.`;
    return null;
  }

  // Novo mata-mata com W.O. da dupla `lado`: a outra dupla vence o confronto sem placar. Lança Error se
  // erroDeWO não for null.
  function marcarWO(mataMata, classificacao, chave, lado, config = REGRAS_PADRAO) {
    const erro = erroDeWO(mataMata, classificacao, chave, lado, config);
    if (erro) throw new Error(erro);
    const novo = clonarMataMata(mataMata);
    novo[chave].wo = lado;
    return novo;
  }

  // Novo mata-mata sem o W.O. do confronto (o confronto volta a aceitar placares).
  function desfazerWO(mataMata, chave) {
    const novo = clonarMataMata(mataMata);
    delete novo[chave].wo;
    return novo;
  }

  // Resolve o mata-mata inteiro: duplas efetivas, séries, avanço de vencedores/perdedores e pódio.
  function resolverMataMata(mataMata, classificacao, config = REGRAS_PADRAO) {
    const formato = formatoDoMataMata(mataMata);
    const estrutura = estruturaDoMataMata(formato);
    const disponiveis = semAusentes(classificacao, mataMata.ausentes);
    const iniciais = disponiveis.length >= formato.vagas ? duplasIniciais(disponiveis, formato.vagas) : [];
    const resolvidos = {};

    // A dupla guardada vale no lugar da automática quando a automática vem da classificação (sempre)
    // ou dos resultados de outros confrontos (depois do primeiro placar, se a dupla foi guardada por
    // fixarDuplasJogadas).
    function resolver(chave) {
      const c = mataMata[chave];
      const fontes = estrutura.fontes[chave];
      const lado = (n) => {
        const fonte = fontes[n - 1];
        let automatica = null;
        let congelada = c.partidas.length > 0;
        if (fonte.dupla !== undefined) { automatica = iniciais[fonte.dupla] || null; congelada = true; }
        else if (fonte.vencedor) automatica = resolvidos[fonte.vencedor].vencedora;
        else automatica = resolvidos[fonte.perdedor].perdedora;
        const manual = Boolean(c[`duplaManual${n}`]);
        const guardada = c[`dupla${n}`];
        const usaGuardada = manual || (congelada && Boolean(guardada));
        const dupla = usaGuardada ? guardada : automatica;
        return { dupla, manual, automatica, desatualizada: usaGuardada && !manual && !mesmaDupla(dupla, automatica) };
      };
      const lado1 = lado(1), lado2 = lado(2);
      const melhorDe = melhorDeDoConfronto(mataMata, chave);
      const pronto = duplaCompleta(lado1.dupla) && duplaCompleta(lado2.dupla);
      // W.O.: a dupla do outro lado vence sem placar (só vale com as duas duplas definidas).
      const wo = pronto && (c.wo === 1 || c.wo === 2) ? c.wo : null;
      const serie = wo
        ? { vencedor: 3 - wo, vitorias: [0, 0], necessarias: Math.floor(melhorDe / 2) + 1, analises: [], partidasVisiveis: 0, wo }
        : analisarSerie(c.partidas, melhorDe);
      const vencedora = serie.vencedor ? [lado1, lado2][serie.vencedor - 1].dupla : null;
      const perdedora = serie.vencedor ? [lado1, lado2][2 - serie.vencedor].dupla : null;
      return {
        chave,
        melhorDe,
        wo,
        dupla1: lado1.dupla,
        dupla2: lado2.dupla,
        lado1,
        lado2,
        origem: fontes.map((f) => origemDaDupla(f, formato.vagas)),
        pronto,
        partidas: c.partidas,
        serie,
        vencedora,
        perdedora,
      };
    }

    for (const chave of estrutura.ordem) resolvidos[chave] = resolver(chave);
    const final = resolvidos.final;
    const terceiro = resolvidos.terceiro || null;
    const daClassificacao = (chave) => estrutura.fontes[chave].some((f) => f.dupla !== undefined);
    return {
      ...resolvidos,
      terceiro,
      formato,
      estrutura,
      vagas: formato.vagas,
      // Em ordem de leitura: as rodadas, a final por último na última, e o 3º lugar depois.
      rodadas: estrutura.rodadas.map((r) => ({ id: r.id, nome: r.nome, confrontos: r.chaves.map((chave) => resolvidos[chave]) })),
      chaves: estrutura.ordem,
      // Confrontos com duplas que vêm da classificação, e os que dependem de resultados.
      daClassificacao: estrutura.ordem.filter(daClassificacao).map((chave) => resolvidos[chave]),
      dosResultados: estrutura.ordem.filter((chave) => estrutura.fontes[chave].some((f) => f.dupla === undefined)).map((chave) => resolvidos[chave]),
      folgam: estrutura.folgas.map((i) => ({ dupla: iniciais[i] || null, origem: origemDaDupla({ dupla: i }, formato.vagas) })),
      podio: { campeoes: final.vencedora, vice: final.perdedora, terceiro: terceiro ? terceiro.vencedora : null },
    };
  }

  // De onde vem uma dupla do confronto: a posição na classificação ("1º + 8º") ou o resultado de
  // outro confronto ("Vencedor da Semi 1").
  function origemDaDupla(fonte, vagas) {
    if (fonte.dupla !== undefined) {
      const i = fonte.dupla;
      return i < Math.floor(vagas / 2) ? `${i + 1}º + ${vagas - i}º` : `${(vagas + 1) / 2}º, sem dupla`;
    }
    return fonte.vencedor ? `Vencedor ${rotuloCurtoDoConfronto(fonte.vencedor)}` : `Perdedor ${rotuloCurtoDoConfronto(fonte.perdedor)}`;
  }

  // "da Semi 1", "das Quartas 2": o confronto dentro de uma frase ("Vencedor da Semi 1").
  function rotuloCurtoDoConfronto(chave) {
    const m = /^(semi|quartas|oitavas)(\d+)$/.exec(chave);
    if (m) return m[1] === "semi" ? `da Semi ${m[2]}` : `das ${m[1] === "quartas" ? "Quartas" : "Oitavas"} ${m[2]}`;
    const r = /^r(\d+)-(\d+)$/.exec(chave);
    if (r) return `da Rodada ${r[1]}, jogo ${r[2]}`;
    return chave === "terceiro" ? "do 3º lugar" : "da Final";
  }

  // Nome do confronto na tela: "Semifinal 1", "Quartas de final 2", "Final", "3º lugar".
  function rotuloDoConfronto(chave) {
    const m = /^(semi|quartas|oitavas)(\d+)$/.exec(chave);
    if (m) return `${m[1] === "semi" ? "Semifinal" : m[1] === "quartas" ? "Quartas de final" : "Oitavas de final"} ${m[2]}`;
    const r = /^r(\d+)-(\d+)$/.exec(chave);
    if (r) return `Rodada ${r[1]}, jogo ${r[2]}`;
    return chave === "terceiro" ? "3º lugar" : "Final";
  }

  // ---------- Semanas (rodadas) ----------

  // Jogos sem semana (dados antigos de teste) contam como semana 1.
  function semanaDoJogo(jogo) {
    return Number.isInteger(jogo.semana) ? jogo.semana : 1;
  }

  // id do jogo -> número do jogo dentro da sua semana (1, 2...), na ordem da lista. É assim que o
  // organizador chama um jogo ("Semana 3 · Jogo 2"); o id interno não aparece na tela.
  function numerosNaSemana(jogos) {
    const contagem = new Map();
    const mapa = new Map();
    for (const j of jogos) {
      const semana = semanaDoJogo(j);
      contagem.set(semana, (contagem.get(semana) || 0) + 1);
      mapa.set(j.id, contagem.get(semana));
    }
    return mapa;
  }

  // ---------- Remarcação ----------
  // Dupla e adversária combinam de adiar ou adiantar um jogo: ele muda de semana. O id não muda
  // (os resultados e a ficha se apoiam nele); `semanaOriginal` guarda onde o jogo estava no
  // calendário sorteado e só existe enquanto ele estiver fora dela.

  function jogoRemarcado(jogo) {
    return Number.isInteger(jogo.semanaOriginal) && jogo.semanaOriginal !== semanaDoJogo(jogo);
  }

  // Motivo de o jogo não poder ir para `novaSemana`, ou null se pode. Só semanas do campeonato
  // e só jogo sem resultado.
  function erroDeRemarcacao(jogos, idJogo, novaSemana, config = REGRAS_PADRAO) {
    const jogo = jogos.find((j) => j.id === idJogo);
    if (!jogo) return "Jogo não encontrado.";
    if (efeitosDoResultado(jogo.resultado, config)) return "Jogo com resultado não pode ser remarcado. Limpe o resultado antes.";
    if (!Number.isInteger(novaSemana) || novaSemana < 1 || novaSemana > config.semanas) {
      return `Escolha uma semana de 1 a ${config.semanas}.`;
    }
    if (novaSemana === semanaDoJogo(jogo)) return `O jogo já está na semana ${novaSemana}.`;
    return null;
  }

  // Nova lista com o jogo na semana `novaSemana`, como último da semana (o número dele ali fica
  // previsível). Lança Error se erroDeRemarcacao não for null.
  function remarcarJogo(jogos, idJogo, novaSemana, config = REGRAS_PADRAO) {
    const erro = erroDeRemarcacao(jogos, idJogo, novaSemana, config);
    if (erro) throw new Error(erro);
    const original = jogos.find((j) => j.id === idJogo);
    const { semanaOriginal: _, ...resto } = original;
    const origem = Number.isInteger(original.semanaOriginal) ? original.semanaOriginal : semanaDoJogo(original);
    const movido = { ...resto, semana: novaSemana };
    if (origem !== novaSemana) movido.semanaOriginal = origem;
    const demais = jogos.filter((j) => j.id !== idJogo);
    let posicao = 0;
    demais.forEach((j, i) => { if (semanaDoJogo(j) <= novaSemana) posicao = i + 1; });
    return [...demais.slice(0, posicao), movido, ...demais.slice(posicao)];
  }

  // Jogadores do jogo que já têm outro jogo em `semana` (aviso ao remarcar: o limite de 1 jogo por
  // jogador por semana vale para o sorteio, não impede a remarcação). Na ordem dos jogadores do jogo.
  function jogadoresOcupadosNaSemana(jogos, idJogo, semana) {
    const jogo = jogos.find((j) => j.id === idJogo);
    if (!jogo) return [];
    const ocupados = new Set(jogos.filter((j) => j.id !== idJogo && semanaDoJogo(j) === semana).flatMap((j) => [...j.dupla1, ...j.dupla2]));
    return [...jogo.dupla1, ...jogo.dupla2].filter((id) => ocupados.has(id));
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

  // Etapa de uma edição, para a lista de campeonatos: "cadastro", "semanas" (com a semana em
  // andamento), "fase-final" ou "campeoes". Recebe o estado salvo da edição (campeonato, jogos...).
  function situacaoDoCampeonato(estado) {
    const config = estado.campeonato.config;
    if (estado.mataMata) {
      const base = baseDosJogadores(estado.campeonato.jogadores);
      const tabela = classificacaoDaFaseFinal(base, estado.jogos, estado.desempatesManuais, config, estado.mataMata.ausentes || []);
      const campeoes = resolverMataMata(estado.mataMata, tabela, config).podio.campeoes;
      return campeoes ? { etapa: "campeoes", texto: "🏆 campeões" } : { etapa: "fase-final", texto: "fase final" };
    }
    if (!estado.jogos.length) return { etapa: "cadastro", texto: "cadastro" };
    return { etapa: "semanas", texto: `semana ${semanaAtual(estado.jogos, config)} de ${config.semanas}` };
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
    FORMATO_PADRAO,
    OPCOES_MELHOR_DE,
    MIN_VAGAS_FASE_FINAL,
    MAX_VAGAS_FASE_FINAL,
    erroDeMelhorDe,
    formatoDaConfig,
    formatoDoMataMata,
    formatoEhPadrao,
    duplasIniciais,
    duplaCompleta,
    estruturaDoMataMata,
    erroDeTrocaDeLugar,
    trocarDeLugar,
    melhorDeDoConfronto,
    rotuloDoConfronto,
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
    ESTRELAS_MIN,
    ESTRELAS_MAX,
    validarEstrelas,
    definirEstrelas,
    jogadoresSemEstrelas,
    estrelasPorId,
    diferencaDoJogo,
    DIFERENCA_ACEITAVEL,
    custoDoCalendario,
    cadastroTravado,
    diagnosticarCampeonato,
    MIN_GRUPOS,
    MAX_GRUPOS,
    usaGrupos,
    letrasDosGrupos,
    jogadoresPorGrupo,
    formarGruposPorPotes,
    moverJogadorDeGrupo,
    trocarJogadoresDeGrupo,
    classificacaoDosGrupos,
    semeaduraPorCampanha,
    classificacaoDaFaseFinal,
    semanaDoJogo,
    numerosNaSemana,
    jogoRemarcado,
    erroDeRemarcacao,
    remarcarJogo,
    jogadoresOcupadosNaSemana,
    progressoPorSemana,
    contarSemanasCompletas,
    precisaDeBackup,
    DIAS_PARA_LEMBRAR_BACKUP,
    semanaAtual,
    ultimaSemanaComResultado,
    classificacaoPorSemana,
    situacaoDoCampeonato,
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
    semAusentes,
    proximoSubstituto,
    erroDeSubstituicao,
    substituirJogador,
    erroDeWO,
    marcarWO,
    desfazerWO,
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
