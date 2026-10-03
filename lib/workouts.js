// Treino "Hipertrofia t2y" do personal (MFIT). Ordem = ordem prescrita.
// tip: como fazer (para iniciante). Fonte das séries/descanso: PDF do personal.
export const WORKOUTS = [
  { id: "A", name: "Peito", ex: [
    { n: "Supino Máquina Inclinado (pegada pronada)", s: 5, r: 15, rest: 20, load: "aquecimento, carga leve", tip: "Aquecimento: carga bem leve. Ajuste o banco para a pegada ficar na altura do peito. Costas e cabeça sempre encostadas, ombros para trás e para baixo. Empurre sem travar os cotovelos e volte devagar." },
    { n: "Supino Inclinado no Banco (barra)", s: 3, r: 12, rest: 45, tip: "Banco a ~30–45°. Pegada um pouco mais aberta que os ombros. Desça a barra controlando até a parte alta do peito e empurre. Pés firmes no chão, lombar sem arquear demais. Use alguém de apoio se for pesado." },
    { n: "Crucifixo Inclinado com Halteres", s: 3, r: 12, rest: 45, tip: "Banco inclinado, halteres sobre o peito com palmas se olhando. Abra os braços em arco com cotovelos levemente dobrados (como abraçar uma árvore) até sentir alongar o peito. Volte pelo mesmo arco. Carga leve: o foco é o alongamento." },
    { n: "Crossover Polia Baixa", s: 3, r: 15, rest: 45, tip: "Polias embaixo. Um passo à frente, tronco reto. Puxe as alças de baixo para cima até a altura do peito, juntando as mãos à frente, como se fosse servir uma bandeja. Cotovelos levemente dobrados e fixos." },
    { n: "Supino Máquina (pegada pronada)", s: 3, r: 15, rest: 45, tip: "Mesma técnica do primeiro: costas encostadas, ombros para trás. Empurre até quase esticar e volte em 2 segundos sentindo o peito." },
    { n: "Crossover Polia Alta", s: 3, r: 12, rest: 45, tip: "Polias no alto. Um passo à frente, tronco levemente inclinado. Traga as alças de cima para baixo e para o centro, mãos se encontrando na altura do umbigo. Aperte o peito 1 segundo e volte devagar." },
    { n: "Supino Declinado com Halteres", s: 3, r: 12, rest: 45, tip: "Banco declinado com os pés presos. Halteres na linha da parte baixa do peito. Empurre para cima e desça controlando. Para sair, sente primeiro com os halteres no colo antes de soltar." },
  ]},
  { id: "B", name: "Costas", ex: [
    { n: "Crucifixo Inverso Máquina", s: 3, r: 15, rest: 45, tip: "Sentado de frente para o encosto (peito apoiado). Braços esticados à frente, abra para trás até a linha do corpo, apertando as escápulas. Não use impulso; volte devagar." },
    { n: "Remada Alta na Polia Alta com Corda (face pull)", s: 3, r: 15, rest: 45, tip: "Polia na altura do rosto, corda. Puxe a corda em direção ao rosto abrindo as mãos para os lados, cotovelos altos. Postura ereta, sem jogar o corpo para trás." },
    { n: "Barra Fixa no Gráviton (pegada aberta)", s: 4, r: 12, rest: 45, tip: "Ajoelhe na plataforma: mais peso no gráviton = mais ajuda (fica mais fácil). Pegada aberta, puxe o peito em direção à barra levando os cotovelos para baixo. Desça até quase esticar os braços." },
    { n: "Puxada Neutra com Triângulo", s: 3, r: 10, rest: 45, tip: "Sentado, coxas presas. Puxe o triângulo até a parte alta do peito, tronco levemente inclinado para trás, peito estufado. Pense em levar os cotovelos para o bolso de trás. Suba controlando." },
    { n: "Remada Baixa (pegada pronada)", s: 3, r: 10, rest: 45, tip: "Sentado, joelhos levemente dobrados, coluna reta. Puxe a barra até o abdômen, palmas para baixo, cotovelos abertos. Aperte as costas 1 segundo. Não balance o tronco para frente e para trás." },
    { n: "Remada Baixa com Barra H", s: 3, r: 10, rest: 45, tip: "Mesma postura da anterior. Puxe até o umbigo com cotovelos rentes ao corpo. Ombros longe das orelhas." },
    { n: "Remada Baixa com Triângulo", s: 3, r: 10, rest: 45, tip: "Puxe o triângulo até o umbigo, cotovelos raspando no corpo. Na volta, deixe alongar sem curvar a lombar." },
    { n: "Hiperextensão de Lombar", s: 4, r: 15, rest: 45, tip: "No banco romano, quadril na almofada. Mãos no peito. Desça o tronco com a coluna reta e suba até ficar alinhado com as pernas, sem passar disso (não hiperestender). Movimento lento." },
  ]},
  { id: "C", name: "Inferiores", ex: [
    { n: "Cadeira Extensora", s: 3, r: 18, rest: 45, load: "59 kg", tip: "Ajuste o encosto para o joelho ficar alinhado com o eixo da máquina e o rolo no peito do pé. Estique as pernas, segure 1 segundo em cima e desça devagar. Segure nas alças do banco." },
    { n: "Leg Press 45° Unilateral", s: 3, r: 10, rest: 45, load: "120 kg", tip: "Uma perna por vez, pé no meio da plataforma. Destrave, desça até o joelho formar ~90° sem tirar o quadril do banco e empurre pelo calcanhar. Nunca trave o joelho em cima. Trave a máquina antes de trocar de perna." },
    { n: "Agachamento Hack", s: 3, r: 12, rest: 45, load: "60 kg", tip: "Costas e ombros encostados, pés na largura dos ombros, um pouco à frente. Desça até as coxas ficarem paralelas à plataforma, joelhos na direção dos pés, e suba empurrando o chão." },
    { n: "Mesa Flexora", s: 3, r: 18, rest: 45, load: "38 kg", tip: "Deitado de bruços, joelho logo após a borda do banco e o rolo acima do calcanhar. Puxe os calcanhares em direção ao bumbum sem tirar o quadril do banco. Desça devagar." },
    { n: "Stiff com Barra Livre (pés próximos)", s: 3, r: 18, rest: 45, tip: "Pés juntos, joelhos levemente dobrados e fixos. Desça a barra rente às pernas empurrando o quadril para trás, coluna sempre reta, até sentir puxar atrás da coxa (meio da canela). Suba contraindo glúteo. Carga leve até pegar a técnica." },
    { n: "Abdução de Quadril Máquina", s: 3, r: 18, rest: 45, tip: "Sentado, costas encostadas. Abra as pernas contra as almofadas, segure 1 segundo aberto e feche controlando, sem deixar o peso bater." },
    { n: "Cadeira Extensora (finalizador)", s: 9, r: 10, rest: 45, load: "3 séries pés abertos · 3 neutros · 3 fechados", tip: "9 séries de 10: 3 com as pontas dos pés viradas para fora, 3 retas e 3 viradas para dentro. Carga moderada. Confirme o detalhe com o personal (o PDF corta o texto)." },
  ]},
  { id: "D", name: "Ombros", ex: [
    { n: "Elevação Lateral com Halteres", s: 5, r: 15, rest: 45, tip: "Em pé, halteres ao lado do corpo, cotovelos levemente dobrados. Suba os braços para os lados até a altura dos ombros (não acima), como se derramasse uma jarra. Desça devagar. Carga leve, sem balançar o corpo." },
    { n: "Desenvolvimento com Halteres Sentado", s: 4, r: 10, rest: 45, tip: "Banco com encosto reto. Halteres na altura das orelhas, cotovelos um pouco à frente do corpo. Empurre para cima até quase esticar e desça até a altura do queixo. Lombar encostada." },
    { n: "Remada Alta com Barra W", s: 4, r: 10, rest: 45, tip: "Em pé, pegada na parte mais aberta da barra W. Puxe a barra rente ao corpo até a altura do peito, cotovelos subindo para os lados. Não passe da altura do ombro. Se doer o ombro, pare e fale com o personal." },
    { n: "Desenvolvimento Máquina (pegada neutra)", s: 4, r: 10, rest: 45, tip: "Ajuste o banco para as pegadas ficarem na altura dos ombros. Palmas se olhando. Empurre para cima sem travar os cotovelos e volte controlando." },
    { n: "Elevação Frontal Alternada", s: 4, r: 12, rest: 45, tip: "Em pé, halteres à frente das coxas. Suba um braço de cada vez à frente até a altura do ombro e desça devagar. Tronco parado, sem jogar o corpo." },
    { n: "Elevação Frontal com Anilha", s: 4, r: 12, rest: 45, tip: "Segure a anilha pelas laterais (como um volante). Suba à frente até a altura dos olhos com cotovelos levemente dobrados e desça controlando." },
  ]},
  { id: "E", name: "Braço", ex: [
    { n: "Rosca Scott com Barra W", s: 3, r: 12, rest: 45, tip: "Axilas encaixadas no apoio, braços apoiados no banco. Suba a barra contraindo o bíceps e desça devagar até quase esticar (sem esticar de vez nem soltar o peso)." },
    { n: "Rosca Scott com Barra H", s: 3, r: 12, rest: 45, tip: "Mesma técnica da anterior, com a barra H (pegada neutra, palmas se olhando)." },
    { n: "Rosca Concentrada", s: 3, r: 12, rest: 45, tip: "Sentado, cotovelo apoiado na parte interna da coxa. Suba o halter até o ombro girando levemente a palma para cima e desça devagar. Um braço por vez." },
    { n: "Tríceps na Polia com Barra Reta", s: 3, r: 15, rest: 45, tip: "Polia alta. Cotovelos colados ao corpo e parados. Empurre a barra para baixo até esticar os braços e volte só até ~90°. Só o antebraço se move." },
    { n: "Tríceps na Polia com Corda", s: 3, r: 15, rest: 45, tip: "Igual ao anterior, mas no final abra a corda para os lados, afastando as mãos. Cotovelos fixos ao lado do corpo." },
    { n: "Tríceps Francês na Polia com Corda", s: 3, r: 15, rest: 45, tip: "De costas para a polia, corda atrás da cabeça, cotovelos apontando para frente/cima. Estique os braços à frente e acima da cabeça e volte devagar. Cotovelos fixos." },
    { n: "Rosca Inversa na Polia Baixa", s: 4, r: 20, rest: 45, tip: "Pegada pronada (palmas para baixo). Cotovelos colados ao corpo, suba a barra até o peito e desça controlando. Trabalha antebraço. O PDF mostra descanso de 1 s: confirme com o personal." },
  ]},
];
