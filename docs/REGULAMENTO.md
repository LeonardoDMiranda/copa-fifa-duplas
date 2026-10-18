# Regulamento – Copa FIFA em Duplas

Regras que o app implementa. Só vale o que está aqui.

## Formato

- Jogos em **duplas**; a classificação é **individual**. Cada jogador recebe o resultado da partida da sua dupla (V/E/D, gols pró e gols contra).
- Fase de classificação: cada inscrito joga 6 jogos, com duplas pré-definidas pelo calendário.
- Os **N primeiros** vão para a fase final. O padrão é **8**; o organizador pode configurar de 4 a 99 classificados (ver "Fase final").

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
- A configuração vale até o chaveamento ser gerado. Depois, o chaveamento guarda o próprio formato.
- W.O. na fase final continua não previsto (ver "Casos NÃO previstos").

## Regras de jogo (informativas, não afetam cálculos)

- Partidas de 5 minutos, mais 2 minutos antes para ajustes (táticas e substituições).
- Presencial, em dia e horário definidos pela organização. Jogo só muda de semana por remarcação combinada entre as duplas (ver "Sorteio do calendário").
- Proibido jogar com Soccer Aid e Adidas All-Stars Team.
- Proibido ativar qualquer assistência (troca automática de jogador, finalização calibrada, auxílio na defesa etc.).
- Configurações no padrão do sistema.

## Casos NÃO previstos no regulamento

O sistema não deve inventar regra para estes casos. Deve permitir que o organizador decida manualmente:

- W.O. das duas duplas no mesmo jogo.
- Como aplicar o "confronto direto" entre jogadores individuais num campeonato em duplas.
- W.O. na fase final.
