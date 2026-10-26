# Regulamento – Copa FIFA em Duplas

Regras que o app implementa. Só vale o que está aqui.

## Formato

- Jogos em **duplas**; a classificação é **individual**. Cada jogador recebe o resultado da partida da sua dupla (V/E/D, gols pró e gols contra).
- Fase de classificação: cada inscrito joga 6 jogos, com duplas pré-definidas pelo calendário.
- Os **N primeiros** vão para a fase final. O padrão é **8**; o organizador pode configurar de 4 a 99 classificados (ver "Fase final"). Com fase de grupos, classificam-se os primeiros de cada grupo (ver "Fase de grupos").

## Sorteio do calendário (campeonatos conduzidos pelo app)

> Regra decidida pelo organizador para os campeonatos conduzidos pelo app; a primeira edição usava duplas pré-definidas pelo calendário. **Rever este trecho quando o regulamento do próximo campeonato sair.**

- O app sorteia o calendário **inteiro de uma vez**, a partir de: nº de jogadores, jogos por jogador (padrão 6) e nº de semanas (padrão 8).
- Restrições **obrigatórias**: todos os jogadores com o **mesmo número de jogos**; **no máximo 1 jogo por jogador por semana**; **nenhum parceiro repetido** (ninguém joga duas vezes com a mesma pessoa).
- Restrição **desejável** (evitada, mas pode acontecer): repetir adversário.
- **Equilíbrio por nível:** cada jogador tem de **1 a 5 estrelas**, definidas pelo organizador. O sorteio só é liberado quando todos têm estrelas. Elas servem só ao sorteio e aparecem apenas para o organizador (cadastro e calendário), nunca no telão, nas imagens ou na classificação. São **desejáveis** (o sorteio tenta ao máximo, sem quebrar as restrições obrigatórias; o organizador vê o resultado e decide se sorteia de novo, troca à mão ou confirma):
  - **Jogo equilibrado:** a diferença entre as duplas é comparada posição a posição: |mais forte de uma − mais forte da outra| + |mais fraco de uma − mais fraco da outra|. Quanto menor, melhor. **Aceitável: diferença de no máximo 1 estrela**; 2 ou mais fica fora do aceitável.
    - Aceitáveis: 5+4 × 5+4 (0), 5+5 × 5+5 (0), 5+5 × 5+4 (1), 2+2 × 2+1 (1), 5+1 × 4+1 (1).
    - Fora do aceitável: 5+5 × 4+4 (2), 4+2 × 5+1 (2), 5+1 × 3+3 (4), 5+5 × 1+1 (8).
  - O que importa é o jogo ser parelho, não a dupla ser mista: duplas fortes (5+5) ou fracas (2+1) são normais, desde que enfrentem uma dupla parecida.
  - **Justiça na temporada:** o saldo de estrelas de cada jogador (soma das estrelas do seu lado − soma das estrelas do lado adversário, somado em todos os seus jogos) fica o mais perto possível de zero.
  - **Prioridade:** quando não der para evitar as duas coisas, o equilíbrio vem antes. É melhor repetir um adversário do que ter um jogo fora do aceitável.
- Jogos por semana = total de jogos ÷ semanas (ex.: 32 jogadores × 6 jogos ÷ 4 = 48 jogos, 6 por semana). Se não divide, as primeiras semanas ficam com 1 jogo a mais. O total só fecha se jogadores × jogos por jogador for divisível por 4.
- O sorteio usa uma **semente** (guardada no backup): a mesma semente gera o mesmo calendário. O organizador pode sortear de novo e trocar jogadores à mão antes de **confirmar**; depois de confirmado, só dá para renomear jogadores.
- **Remarcação:** as duas duplas podem combinar de **adiar ou adiantar** um jogo para outra semana do campeonato (de 1 até a última). O organizador remarca no app; o jogo mantém seu resultado e conta na semana nova. Só jogo **sem resultado** pode ser remarcado. O limite de 1 jogo por jogador por semana vale para o sorteio: ao remarcar, o app **avisa** se algum jogador já joga na semana escolhida, mas não impede. Não há semana extra além da última.
- Quem não comparece leva W.O.; o W.O. das duas duplas (ou outro caso em que o jogo não vale) é **anulado**: sem pontos, V/E/D nem gols para ninguém.

## Fase de grupos (opcional)

> Regras decididas pelo organizador para os campeonatos conduzidos pelo app; o regulamento original só prevê liga única. Sem grupos, vale tudo o que está acima, sem mudança.

- **Grupos:** o organizador escolhe de **2 a 8 grupos** (A, B, C...). Os tamanhos podem diferir em **no máximo 1 jogador**. Cada grupo precisa fechar a conta sozinho: jogadores do grupo × jogos por jogador **divisível por 4**, e pelo menos **jogos por jogador + 1** jogadores no grupo (para ninguém repetir parceiro). No padrão de 6 jogos, o menor grupo possível tem 8 jogadores. Se a conta não fecha, o sorteio não é liberado.
- **Formação por potes:** os jogadores são ordenados por estrelas (do maior para o menor) e divididos em potes do tamanho do número de grupos (com 4 grupos, o pote 1 tem os 4 de mais estrelas). Cada pote manda **um jogador para cada grupo**, por sorteio; empates de estrelas na divisa entre potes também são sorteados. O último pote pode ficar incompleto: por isso alguns grupos têm 1 jogador a mais. A formação usa uma semente, como o sorteio do calendário: a mesma semente forma os mesmos grupos.
- **Ajuste manual:** antes de confirmar o calendário, o organizador pode mover um jogador para outro grupo ou trocar dois jogadores de grupo, desde que os tamanhos continuem válidos. Mudar os grupos descarta o rascunho do calendário. Depois de confirmado, os grupos não mudam.
- **Sorteio do calendário:** feito **dentro de cada grupo**, com as mesmas restrições obrigatórias e desejáveis da liga única (parceiros e adversários só do próprio grupo). As semanas são comuns a todos os grupos, e continua valendo no máximo 1 jogo por jogador por semana. Quando os jogos de um grupo não se dividem igualmente pelas semanas, as semanas com 1 jogo a mais de cada grupo ficam **em semanas diferentes** das dos outros grupos (em rodízio), para todas as semanas terem quase o mesmo número de jogos (ex.: 4 grupos de 8, com 12 jogos cada em 8 semanas: 6 jogos em toda semana). Em grupos pequenos, repetir adversário é esperado.
- **Classificação:** cada grupo tem a sua, com a mesma pontuação e os mesmos critérios de desempate (inclusive a ordem manual em empate técnico, dentro do grupo).
- **Classificados:** o organizador escolhe quantos se classificam **por grupo** (o mesmo número em todos, sem melhores terceiros). O total de classificados é grupos × classificados por grupo e precisa ficar entre 4 e 99.
- **Semeadura por campanha:** os classificados de todos os grupos formam uma lista única, ordenada por: 1) pontos; 2) vitórias; 3) saldo de gols; 4) gols pró; 5) melhor posição no grupo; 6) ordem definida pelo organizador. Dois jogadores do mesmo grupo mantêm sempre a ordem do grupo. A partir dessa lista, a fase final segue as regras de "Fase final" (1º + último, 2º + penúltimo...). Jogadores do mesmo grupo podem formar dupla ou se enfrentar; o organizador pode reorganizar o chaveamento pelas regras de sempre.
- **Ausência:** antes do chaveamento, o ausente é substituído pelo próximo do **mesmo grupo**, e a lista da semeadura é refeita com ele, pela campanha. Durante a fase final, a substituição também chama o próximo do mesmo grupo que ainda não esteja no chaveamento; se o grupo não tiver mais ninguém, chama o próximo da lista geral (mesma ordem da semeadura) entre os não classificados. O W.O. da dupla funciona como em "Ausência na fase final".

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
- Com o padrão (8 classificados), a final é a única fase em MD3.
- "Teremos uma SURPRESA antes da final": as duplas da final podem ser alteradas pela organização.

### Fase final com outro número de classificados

> Regras decididas pelo organizador para os campeonatos conduzidos pelo app; o regulamento original só trata de 8 classificados.

- **Duplas:** formam-se pela classificação final: 1º + último, 2º + penúltimo, e assim por diante (com 12 classificados: 1º+12º, 2º+11º, ...). As duplas vizinhas se enfrentam (dupla 1 × dupla 2, dupla 3 × dupla 4...) e os vencedores avançam na mesma ordem.
- **Número ímpar:** o jogador do meio da tabela (ex.: o 9º com 17 classificados) fica **sem dupla**. O app não escolhe o parceiro dele: o organizador o define pela troca de dupla, e o confronto só abre para placar quando a dupla estiver completa.
- **Folgas:** se o número de duplas não é potência de 2 (6, 9, 10...), as **melhores duplas** pulam a 1ª rodada e esperam na seguinte; o organizador pode trocar quem folga à mão. As duplas que folgam e os vencedores da 1ª rodada formam a rodada seguinte, na ordem (folgas primeiro, depois os vencedores), com as vizinhas se enfrentando.
- **Rodadas:** Final, Semifinais, Quartas de final, Oitavas de final e, antes disso, "Rodada N". Com 4 classificados há só a final.
- **3º lugar:** a disputa (perdedores das duas semifinais) é opcional. Só existe quando há duas semifinais; com 4 ou 6 classificados a opção não se aplica.
- **Jogos por rodada:** o padrão é jogo único em todas as rodadas e MD3 na final; o organizador pode escolher jogo único, melhor de 3 ou melhor de 5 para cada rodada e para o 3º lugar. Nos melhores de N termina quem chega à maioria das vitórias.
- **Reorganizar o chaveamento:** a qualquer momento o organizador pode trocar de lugar duas duplas de confrontos da **mesma rodada** (ex.: a 2ª dupla da Semi 1 com a 1ª da Semi 2). Os vencedores avançam pelos confrontos como ficaram. Só vale para confrontos **sem placar lançado** (para trocar de um confronto já jogado, o organizador limpa os placares antes) e entre duplas já definidas. As duplas trocadas ficam marcadas como alteradas pela organização; trocar de novo as devolve ao lugar de origem.
- A configuração vale até o chaveamento ser gerado. Depois, o chaveamento guarda o próprio formato.

### Ausência na fase final

> Regras decididas pelo organizador para os campeonatos conduzidos pelo app; o regulamento original não prevê ausência na fase final.

- **Antes do chaveamento:** o jogador ausente é substituído pelo próximo da classificação, que entra na mesma posição.
- **Durante a fase final:** o organizador escolhe entre (a) substituir o jogador ausente pelo próximo da classificação que ainda não esteja no chaveamento, mantendo a dupla; ou (b) dar W.O. à dupla do ausente, e a dupla adversária avança sem placar.
- O W.O. só pode ser marcado em confronto sem placar lançado.
- O W.O. das duas duplas no mesmo confronto continua sendo decisão do organizador (ver "Casos NÃO previstos").

## Regras de jogo (informativas, não afetam cálculos)

- Partidas de 5 minutos, mais 2 minutos antes para ajustes (táticas e substituições).
- Presencial, em dia e horário definidos pela organização. Jogo só muda de semana por remarcação combinada entre as duplas (ver "Sorteio do calendário").
- Proibido jogar com Soccer Aid e Adidas All-Stars Team.
- Proibido ativar qualquer assistência (troca automática de jogador, finalização calibrada, auxílio na defesa etc.).
- Configurações no padrão do sistema.

## Casos NÃO previstos no regulamento

O sistema não deve inventar regra para estes casos. Deve permitir que o organizador decida manualmente:

- W.O. das duas duplas no mesmo jogo (na fase final, também no mesmo confronto).
- Como aplicar o "confronto direto" entre jogadores individuais num campeonato em duplas.
