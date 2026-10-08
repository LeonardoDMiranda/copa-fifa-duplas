// Dados de exemplo (nomes fictícios) de um campeonato com 32 jogadores. Usados só pelos testes.
// Carregado como script clássico (sem fetch) para funcionar em file://.

window.DADOS_INICIAIS = {
  // Classificação acumulada ANTES dos jogos de sexta (02/10/2026).
  // pontos vem da planilha oficial (não recalcular a partir de V/E: 0x0 conta E mas vale 0).
  classificacaoBase: [
    { id: "p23",       nome: "Jogador 23",          pontos: 15, v: 5, e: 0, d: 1, gp: 30, gc: 6  },
    { id: "p17",         nome: "Jogador 17",    pontos: 15, v: 5, e: 0, d: 1, gp: 26, gc: 8  },
    { id: "p12",      nome: "Jogador 12",       pontos: 12, v: 4, e: 0, d: 0, gp: 22, gc: 3  },
    { id: "p24",      nome: "Jogador 24",    pontos: 11, v: 3, e: 2, d: 1, gp: 16, gc: 12 },
    { id: "p21",          nome: "Jogador 21",     pontos: 10, v: 3, e: 1, d: 1, gp: 20, gc: 6  },
    { id: "p30",        nome: "Jogador 30",           pontos: 10, v: 3, e: 1, d: 2, gp: 22, gc: 16 },
    { id: "p28",       nome: "Jogador 28",          pontos: 10, v: 3, e: 1, d: 1, gp: 17, gc: 11 },
    { id: "p05",    nome: "Jogador 05",       pontos: 9,  v: 3, e: 0, d: 2, gp: 22, gc: 9  },
    { id: "p32",      nome: "Jogador 32",         pontos: 9,  v: 3, e: 0, d: 2, gp: 22, gc: 9  },
    { id: "p11",       nome: "Jogador 11",          pontos: 9,  v: 3, e: 0, d: 2, gp: 25, gc: 13 },
    { id: "p20",         nome: "Jogador 20",            pontos: 9,  v: 3, e: 0, d: 2, gp: 14, gc: 7  },
    { id: "p09",      nome: "Jogador 09",       pontos: 9,  v: 3, e: 0, d: 3, gp: 22, gc: 18 },
    { id: "p13",      nome: "Jogador 13",         pontos: 9,  v: 3, e: 0, d: 2, gp: 12, gc: 8  },
    { id: "p07",       nome: "Jogador 07",         pontos: 9,  v: 3, e: 0, d: 3, gp: 16, gc: 17 },
    { id: "p03",      nome: "Jogador 03",         pontos: 8,  v: 2, e: 2, d: 1, gp: 18, gc: 11 },
    { id: "p19",         nome: "Jogador 19",            pontos: 7,  v: 2, e: 1, d: 2, gp: 27, gc: 12 },
    { id: "p16",       nome: "Jogador 16",          pontos: 7,  v: 2, e: 1, d: 2, gp: 20, gc: 9  },
    { id: "p04",       nome: "Jogador 04",          pontos: 7,  v: 2, e: 1, d: 1, gp: 11, gc: 5  },
    { id: "p25",       nome: "Jogador 25", pontos: 7,  v: 2, e: 1, d: 1, gp: 8,  gc: 4  },
    { id: "p06",        nome: "Jogador 06",       pontos: 7,  v: 2, e: 1, d: 3, gp: 11, gc: 28 },
    { id: "p27",        nome: "Jogador 27",           pontos: 6,  v: 2, e: 0, d: 2, gp: 15, gc: 12 },
    { id: "p14",     nome: "Jogador 14",        pontos: 6,  v: 2, e: 0, d: 1, gp: 10, gc: 7  },
    { id: "p08",       nome: "Jogador 08",    pontos: 6,  v: 2, e: 0, d: 2, gp: 9,  gc: 22 },
    { id: "p31",      nome: "Jogador 31",         pontos: 6,  v: 2, e: 0, d: 3, gp: 9,  gc: 27 },
    { id: "p18",         nome: "Jogador 18",            pontos: 4,  v: 1, e: 1, d: 2, gp: 11, gc: 13 },
    { id: "p29",    nome: "Jogador 29",       pontos: 4,  v: 1, e: 1, d: 3, gp: 5,  gc: 16 },
    { id: "p26",      nome: "Jogador 26",         pontos: 4,  v: 1, e: 1, d: 4, gp: 9,  gc: 26 },
    { id: "p02",        nome: "Jogador 02",    pontos: 4,  v: 1, e: 1, d: 4, gp: 12, gc: 32 },
    { id: "p10",         nome: "Jogador 10",            pontos: 3,  v: 1, e: 0, d: 3, gp: 9,  gc: 11 },
    { id: "p22",        nome: "Jogador 22",         pontos: 3,  v: 1, e: 0, d: 4, gp: 5,  gc: 24 },
    { id: "p15",      nome: "Jogador 15",       pontos: 3,  v: 1, e: 0, d: 5, gp: 4,  gc: 45 },
    { id: "p01",          nome: "Jogador 01",      pontos: 0,  v: 0, e: 0, d: 5, gp: 5,  gc: 19 },
  ],

  // Jogos de classificação de sexta, 02/10/2026 (4 da semana 8 + 3 reposições).
  jogosSexta: [
    { id: "j1", origem: "Semana 8", dupla1: ["p20", "p12"],     dupla2: ["p29", "p27"] },
    { id: "j2", origem: "Semana 8", dupla1: ["p31", "p21"],      dupla2: ["p05", "p25"] },
    { id: "j3", origem: "Reposição semana 7", dupla1: ["p01", "p04"],     dupla2: ["p10", "p19"] },
    { id: "j4", origem: "Semana 8", dupla1: ["p13", "p14"], dupla2: ["p10", "p03"] },
    { id: "j5", origem: "Semana 8", dupla1: ["p11", "p04"],    dupla2: ["p32", "p16"] },
    { id: "j6", origem: "Reposição semana 6", dupla1: ["p18", "p28"],    dupla2: ["p12", "p14"] },
    { id: "j7", origem: "Reposição semana 7", dupla1: ["p22", "p14"], dupla2: ["p25", "p27"] },
  ],
};
