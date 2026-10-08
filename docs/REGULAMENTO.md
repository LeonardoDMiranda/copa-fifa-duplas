# Regulamento – Copa FIFA em Duplas

Regras que o app implementa. Só vale o que está aqui.

## Formato

- Jogos em **duplas**; a classificação é **individual**. Cada jogador recebe o resultado da partida da sua dupla (V/E/D, gols pró e gols contra).
- Fase de classificação: cada inscrito joga 6 jogos, com duplas pré-definidas pelo calendário.
- Os **8 primeiros** vão para a fase final.

## Sorteio do calendário (campeonatos conduzidos pelo app)

> Regra decidida pelo organizador para os campeonatos conduzidos pelo app; a primeira edição usava duplas pré-definidas pelo calendário. **Rever este trecho quando o regulamento do próximo campeonato sair.**

- O app sorteia o calendário **inteiro de uma vez**, a partir de: nº de jogadores, jogos por jogador (padrão 6) e nº de semanas (padrão 8).
- Restrições **obrigatórias**: todos os jogadores com o **mesmo número de jogos**; **no máximo 1 jogo por jogador por semana**; **nenhum parceiro repetido** (ninguém joga duas vezes com a mesma pessoa).
- Restrição **desejável** (evitada, mas pode acontecer): repetir adversário.
- Jogos por semana = total de jogos ÷ semanas (ex.: 32 jogadores × 6 jogos ÷ 4 = 48 jogos, 6 por semana). Se não divide, as primeiras semanas ficam com 1 jogo a mais. O total só fecha se jogadores × jogos por jogador for divisível por 4.
- O sorteio usa uma **semente** (guardada no backup): a mesma semente gera o mesmo calendário. O organizador pode sortear de novo e trocar jogadores à mão antes de **confirmar**; depois de confirmado, só dá para renomear jogadores.
- Reposição: não há remarcação de jogos. Quem não comparece leva W.O.; o W.O. das duas duplas (ou outro caso em que o jogo não vale) é **anulado**: sem pontos, V/E/D nem gols para ninguém.

## Pontuação (fase de classificação)

| Resultado | Pontos |
|---|---|
| Vitória | 3 |
| Empate com gols (ex.: 1×1, 2×2) | 1 |
| Empate sem gols (0×0) | **0** |
| Derrota | 0 |

Na fase de classificação o jogo pode terminar empatado (sem prorrogação nem pênaltis).

> Observação para o sistema: o 0×0 conta como **empate (E)** na coluna de empates, mas vale 0 ponto.

## Critério de desempate (após pontos, nesta ordem)

1. Vitórias
2. Saldo de gols
3. Gols pró
4. Confronto direto
5. Sorteio

## W.O.

- A dupla presente vence por **3×0**: 3 pontos e saldo +3.
- A dupla que sofreu o W.O. não pontua e fica com saldo -3.

## Fase final

| Jogo | Formato | Duplas |
|---|---|---|
| Semifinal 1 | Jogo único | **1º + 8º** × **2º + 7º** |
| Semifinal 2 | Jogo único | **3º + 6º** × **4º + 5º** |
| Disputa de 3º lugar | Jogo único | Perdedor Semi 1 × Perdedor Semi 2 |
| Final | **Melhor de 3 (MD3)** | Vencedor Semi 1 × Vencedor Semi 2 |

- Na fase final **não há empate**: prorrogação e, se necessário, pênaltis.
- A final é a única fase em MD3.
- "Teremos uma SURPRESA antes da final": as duplas da final podem ser alteradas pela organização.

## Regras de jogo (informativas, não afetam cálculos)

- Partidas de 5 minutos, mais 2 minutos antes para ajustes (táticas e substituições).
- Presencial, em dia e horário definidos pela organização. Sem reposição em outros dias.
- Proibido jogar com Soccer Aid e Adidas All-Stars Team.
- Proibido ativar qualquer assistência (troca automática de jogador, finalização calibrada, auxílio na defesa etc.).
- Configurações no padrão do sistema.

## Casos NÃO previstos no regulamento

O sistema não deve inventar regra para estes casos. Deve permitir que o organizador decida manualmente:

- W.O. das duas duplas no mesmo jogo.
- Como aplicar o "confronto direto" entre jogadores individuais num campeonato em duplas.
- W.O. na fase final.
