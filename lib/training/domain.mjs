import { trainingSchedule, GENERATOR_VERSION } from "./schedule.mjs";
export { GENERATOR_VERSION } from "./schedule.mjs";
export const VERSION = 1;
export const DAYS = [["mon", "Segunda"], ["tue", "Terça"], ["wed", "Quarta"], ["thu", "Quinta"], ["fri", "Sexta"], ["sat", "Sábado"], ["sun", "Domingo"]];
export const GOALS = [["muscle", "Ganhar massa muscular"], ["strength", "Ficar mais forte"], ["fatloss", "Reduzir gordura e melhorar o condicionamento"], ["health", "Saúde, disposição e consistência"]];
export const EQUIPMENT = [["dumbbells", "Halteres"], ["bands", "Elásticos próprios para exercício"], ["bench", "Banco firme de treino"], ["machines", "Máquinas de musculação"], ["cables", "Polias"], ["barbell", "Barra e anilhas"], ["pullup", "Barra fixa instalada"], ["cardio", "Esteira ou bicicleta"]];
const yesno = [["no", "Não"], ["yes", "Sim"], ["unsure", "Não sei / prefiro avaliar"]];
export const QUESTIONS = [{
  id: "name",
  section: "Sobre você",
  title: "Como você quer ser chamado?",
  type: "text",
  max: 50,
  hint: "Seu primeiro nome é suficiente."
}, {
  id: "age",
  section: "Sobre você",
  title: "Qual é sua idade?",
  type: "number",
  min: 18,
  max: 100,
  hint: "Esta versão é para adultos de 18 a 100 anos."
}, {
  id: "goal",
  section: "Seu objetivo",
  title: "Qual é seu principal objetivo agora?",
  type: "choice",
  options: GOALS
}, {
  id: "priorities",
  section: "Seu objetivo",
  title: "Quer dar atenção extra a alguma região?",
  type: "multi",
  max: 2,
  optional: true,
  options: [["upper", "Peito, costas e braços"], ["lower", "Pernas e glúteos"], ["core", "Força do tronco"], ["balanced", "Corpo todo, de forma equilibrada"]],
  hint: "Até duas opções. A rotina continuará trabalhando o corpo todo."
}, {
  id: "experience",
  section: "Sua experiência",
  title: "Como está sua experiência com musculação?",
  type: "choice",
  options: [["new", "Estou começando"], ["returning", "Já treinei, mas estou voltando"], ["regular", "Treino com regularidade há pelo menos 6 meses"]]
}, {
  id: "break",
  section: "Sua experiência",
  title: "Há quanto tempo você está sem treinar regularmente?",
  type: "choice",
  options: [["none", "Continuo treinando"], ["short", "Menos de 1 mês"], ["medium", "De 1 a 3 meses"], ["long", "Mais de 3 meses / nunca treinei"]]
}, {
  id: "currentRoutine",
  section: "Sua experiência",
  title: "O que você faz hoje e o que já funcionou para você?",
  type: "text",
  max: 600,
  optional: true,
  hint: "Ex.: caminhadas, esportes, treino anterior. Pode pular."
}, {
  id: "symptoms",
  section: "Antes de começar",
  title: "Você teve dor no peito, desmaio, tontura importante ou falta de ar incomum em repouso ou esforço leve?",
  type: "choice",
  options: yesno,
  hint: "Não inclui apenas ficar ofegante em um exercício intenso. Se algum sintoma está acontecendo agora, procure atendimento."
}, {
  id: "condition",
  section: "Antes de começar",
  title: "Você tem alguma condição de saúde que precise ser considerada para fazer exercício?",
  type: "choice",
  options: yesno,
  hint: "Por exemplo: condição cardíaca, respiratória, metabólica ou renal. Não precisa informar um diagnóstico aqui."
}, {
  id: "pain",
  section: "Antes de começar",
  title: "Tem dor atual, lesão, cirurgia recente ou limitação de movimento?",
  type: "choice",
  options: yesno
}, {
  id: "restriction",
  section: "Antes de começar",
  title: "Algum profissional orientou evitar ou adaptar exercícios?",
  type: "choice",
  options: yesno
}, {
  id: "medication",
  section: "Antes de começar",
  title: "Usa medicamento que afete pressão, frequência cardíaca, equilíbrio ou glicemia durante exercício?",
  type: "choice",
  options: yesno,
  hint: "Se não souber, escolha a terceira opção e confirme com quem acompanha sua saúde."
}, {
  id: "special",
  section: "Antes de começar",
  title: "Gestação ou pós-parto se aplica a você neste momento?",
  type: "choice",
  options: [["no", "Não se aplica"], ["yes", "Sim"], ["unsure", "Prefiro avaliar com um profissional"]]
}, {
  id: "place",
  section: "Sua rotina",
  title: "Onde você pretende treinar?",
  type: "choice",
  options: [["gym", "Na academia"], ["home", "Em casa"], ["mixed", "Nos dois lugares"]]
}, {
  id: "equipment",
  section: "Sua rotina",
  title: "Quais equipamentos você realmente terá disponíveis?",
  type: "multi",
  optional: true,
  options: EQUIPMENT,
  hint: "Marque só os que você tem. Pode continuar sem marcar para usar o peso do corpo. Se alterna locais, escolha o conjunto disponível para esta rotina."
}, {
  id: "days",
  section: "Sua rotina",
  title: "Em quais dias você consegue reservar tempo para treinar?",
  type: "multi",
  min: 1,
  max: 5,
  options: DAYS,
  hint: "De 1 a 5 dias. Parte dos dias pode ser dedicada a recuperação ativa."
}, {
  id: "minutes",
  section: "Sua rotina",
  title: "Quanto tempo cabe em cada sessão, incluindo aquecimento?",
  type: "choice",
  options: [[20, "20 minutos"], [30, "30 minutos"], [45, "45 minutos"], [60, "60 minutos"]]
}, {
  id: "activity",
  section: "Recuperação",
  title: "Como é seu movimento fora do treino?",
  type: "choice",
  options: [["low", "Passo a maior parte do dia sentado"], ["moderate", "Caminho e me movimento um pouco"], ["high", "Tenho trabalho físico ou pratico esporte com frequência"]]
}, {
  id: "sleep",
  section: "Recuperação",
  title: "Quantas horas você costuma dormir?",
  type: "choice",
  options: [["low", "Menos de 6 horas"], ["normal", "De 6 a 8 horas"], ["high", "Mais de 8 horas"]]
}, {
  id: "stress",
  section: "Recuperação",
  title: "Como está seu estresse nesta fase?",
  type: "choice",
  options: [["low", "Baixo"], ["moderate", "Moderado"], ["high", "Alto"]]
}, {
  id: "avoid",
  section: "Suas preferências",
  title: "O que você prefere evitar?",
  type: "multi",
  optional: true,
  options: [["impact", "Saltos e corrida"], ["floor", "Exercícios no chão"], ["overhead", "Movimentos acima da cabeça"], ["barbell", "Exercícios com barra"]],
  hint: "Se a razão for dor ou restrição de saúde, volte e informe isso na etapa anterior."
}, {
  id: "preferences",
  section: "Suas preferências",
  title: "O que faz você gostar de um treino — ou abandonar um?",
  type: "text",
  max: 600,
  optional: true,
  hint: "Ex.: gosto de máquinas; fico perdido com muitas opções; tenho dificuldade de manter a rotina."
}, {
  id: "support",
  section: "Suas preferências",
  title: "Terá alguém para ajudar com a técnica dos exercícios?",
  type: "choice",
  options: [["yes", "Sim, um profissional"], ["no", "Não neste momento"]]
}, {
  id: "weight",
  section: "Ponto de partida",
  title: "Quer registrar seu peso inicial?",
  type: "number",
  min: 20,
  max: 500,
  optional: true,
  hint: "Opcional, em kg. O app não define sua carga de treino a partir do peso corporal."
}, {
  id: "aiConsent",
  section: "Sua privacidade",
  title: "Quer uma explicação da IA para a sua proposta de treino?",
  type: "choice",
  options: [[true, "Sim, autorizo enviar o resumo de treino à IA"], [false, "Prefiro usar apenas o plano base"]],
  hint: "Somente objetivo, experiência, equipamentos e rotina são enviados. Nome, foto e respostas de saúde não são enviados à IA. A seleção e os limites do treino passam pelas mesmas regras nos dois casos."
}];
export class TrainingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const same = (a, b) => String(a) === String(b);
export function validateAnswer(q, value) {
  if (q.optional && (value == null || value === "" || Array.isArray(value) && !value.length)) return null;
  if (q.type === "text") return typeof value === "string" && value.trim().length > 0 && value.length <= q.max ? null : "Preencha uma resposta válida.";
  if (q.type === "number") return value !== "" && Number.isFinite(Number(value)) && Number(value) >= q.min && Number(value) <= q.max && (q.id !== "age" || Number.isInteger(Number(value))) ? null : `Informe um número entre ${q.min} e ${q.max}.`;
  if (q.type === "choice") return q.options.some(([v]) => same(v, value)) ? null : "Escolha uma opção.";
  return Array.isArray(value) && value.length >= (q.min || 0) && value.length <= (q.max || q.options.length) && new Set(value).size === value.length && value.every(v => q.options.some(([x]) => same(x, v))) ? null : "Confira as opções selecionadas.";
}
export function validateProfile(input) {
  if (!input || input.consent !== true) throw new TrainingError("Confirme o uso das respostas para montar e acompanhar seu treino.");
  const out = {
    version: VERSION,
    consent: true
  };
  for (const q of QUESTIONS) {
    const v = input[q.id],
      error = validateAnswer(q, v);
    if (error) throw new TrainingError(`${q.title} ${error}`);
    if (q.type === "number") out[q.id] = v === "" || v == null ? null : Number(v);else if (q.type === "choice") out[q.id] = q.options.find(([key]) => same(key, v))?.[0];else out[q.id] = q.type === "multi" ? v || [] : String(v || "").trim();
  }
  out.photoConsent = input.photoConsent === true;
  return out;
}
export function screening(profile) {
  const reasons = ["symptoms", "condition", "pain", "restriction", "medication", "special"].filter(k => profile[k] !== "no");
  return {
    ready: !reasons.length,
    reasons,
    message: reasons.length ? "Suas respostas pedem avaliação antes de uma rotina automática. Converse com um profissional de saúde ou de educação física, conforme a situação. Depois, o treino precisa considerar as orientações recebidas." : "Sem sinal informado que interrompa esta proposta inicial. Isso não é liberação médica."
  };
}
const ex = (id, name, pattern, requires, cues, extra = {}) => ({
  id,
  name,
  pattern,
  requires,
  cues,
  ...extra
});
export const CATALOG = [ex("machine-squat", "Leg press", "squat", ["machines"], ["Ajuste o banco para uma amplitude confortável.", "Pés apoiados, joelhos acompanham a direção dos pés.", "Empurre sem travar os joelhos e retorne com controle."], {
  img: "Leg_Press"
}), ex("goblet", "Agachamento goblet", "squat", ["dumbbells"], ["Segure um halter junto ao peito.", "Desça só até onde mantém controle e conforto.", "Suba pressionando o chão com os pés."], {
  img: "Dumbbell_Goblet_Squat"
}), ex("squat", "Agachamento com peso do corpo", "squat", [], ["Pés em posição confortável, tronco firme.", "Leve o quadril para trás e flexione os joelhos com controle.", "Volte sem prender a respiração."], {
  img: "Bodyweight_Squat"
}), ex("press-machine", "Supino na máquina", "push", ["machines"], ["Ajuste as pegadas na altura do peito.", "Mantenha costas apoiadas e ombros confortáveis.", "Empurre e retorne sem deixar o peso bater."]), ex("floor-press", "Supino no chão com halteres", "push", ["dumbbells"], ["Deite com joelhos flexionados e pés apoiados.", "Desça até os braços tocarem suavemente o chão.", "Empurre os halteres com controle."], {
  floor: true
}), ex("wall-push", "Flexão na parede", "push", [], ["Apoie as mãos na parede, na altura do peito.", "Afaste os pés sem perder o alinhamento do corpo.", "Dobre os cotovelos e empurre de volta."]), ex("pushup", "Flexão no chão", "push", [], ["Mãos um pouco além dos ombros e tronco firme.", "Desça com controle, sem deixar o quadril cair.", "Se não mantiver a técnica, use a versão na parede."], {
  floor: true,
  experienced: true,
  img: "Pushups"
}), ex("cable-row", "Remada sentada na polia", "pull", ["cables"], ["Ajuste a posição e mantenha o tronco firme.", "Traga as mãos em direção ao tronco sem dar impulso.", "Retorne devagar, mantendo os ombros confortáveis."], {
  img: "Seated_Cable_Rows"
}), ex("machine-row", "Remada na máquina", "pull", ["machines"], ["Ajuste o apoio para manter o tronco estável.", "Puxe os cotovelos para trás sem elevar os ombros.", "Solte o peso devagar."]), ex("db-row", "Remada com halter e apoio", "pull", ["dumbbells", "bench"], ["Use um banco firme para apoiar mão e joelho.", "Puxe o halter em direção ao quadril.", "Mantenha as costas estáveis, sem girar o tronco."], {
  img: "One-Arm_Dumbbell_Row"
}), ex("band-row", "Remada sentada com elástico nos pés", "pull", ["bands"], ["Use elástico íntegro e próprio para exercício.", "Sente, passe o elástico pelo meio dos pés calçados e segure com firmeza.", "Puxe sem aproximar o elástico do rosto e retorne com controle."], {
  floor: true
}), ex("rdl", "Terra romeno com halteres", "hinge", ["dumbbells"], ["Comece com halteres leves próximos às coxas.", "Leve o quadril para trás, com joelhos levemente flexionados.", "Desça só enquanto mantém o tronco estável e volte com controle."], {
  img: "Romanian_Deadlift"
}), ex("curl-machine", "Flexão de joelhos na máquina", "hinge", ["machines"], ["Peça ajuda para ajustar o equipamento ao seu corpo.", "Dobre os joelhos sem usar impulso.", "Volte com controle e sem dor."]), ex("bridge", "Ponte de glúteos", "hinge", [], ["Deite de costas com pés apoiados e joelhos dobrados.", "Eleve o quadril sem exagerar o arco das costas.", "Desça devagar."], {
  floor: true
}), ex("standing-hinge", "Movimento de quadril em pé", "hinge", [], ["Pés firmes e joelhos levemente flexionados.", "Leve o quadril para trás com as mãos nas coxas.", "Volte à posição em pé, sem forçar a amplitude."]), ex("deadbug", "Dead bug alternado", "core", [], ["Deite e mantenha o tronco confortável e estável.", "Mova um braço e a perna oposta devagar.", "Reduza a amplitude se perder o controle da lombar."], {
  floor: true
}), ex("standing-core", "Marcha controlada com tronco firme", "core", [], ["Em pé, firme o abdômen sem prender a respiração.", "Eleve um joelho de cada vez sem inclinar o tronco.", "Use uma parede próxima se precisar de apoio."]), ex("lateral", "Elevação lateral com halteres", "accessory", ["dumbbells"], ["Use carga leve e cotovelos suavemente dobrados.", "Eleve os braços só até uma altura confortável, até a linha dos ombros.", "Desça devagar, sem balanço."]), ex("calf", "Elevação de panturrilhas em pé", "accessory", [], ["Use apoio firme para o equilíbrio.", "Eleve os calcanhares e desça com controle.", "Mantenha uma amplitude confortável."])];
CATALOG.push(
  ex("lat-pulldown", "Puxada na polia alta", "pull", ["cables"], ["Ajuste o apoio das coxas e mantenha os pés firmes.", "Puxe a barra à frente, em direção à parte alta do peito, sem balanço.", "Retorne devagar sem elevar os ombros à força."], { overhead: true, img: "Wide-Grip_Lat_Pulldown" }),
  ex("db-shoulder", "Desenvolvimento com halteres", "shoulder", ["dumbbells", "bench"], ["Sente com as costas apoiadas e use halteres leves.", "Empurre para cima só na amplitude confortável, sem arquear a lombar.", "Volte devagar, mantendo os punhos alinhados."], { overhead: true, img: "Dumbbell_Shoulder_Press" }),
  ex("db-curl", "Rosca alternada com halteres", "biceps", ["dumbbells"], ["Mantenha cotovelos próximos ao tronco.", "Dobre um cotovelo de cada vez sem balançar o corpo; faça a faixa de repetições em cada braço.", "Desça com controle, sem forçar os punhos."], { img: "Dumbbell_Alternate_Bicep_Curl" }),
  ex("cable-triceps", "Tríceps na polia", "triceps", ["cables"], ["Mantenha cotovelos próximos ao corpo e tronco firme.", "Estenda os cotovelos sem usar o peso do tronco.", "Retorne devagar sem mover os ombros."], { img: "Triceps_Pushdown" }),
  ex("db-hammer", "Rosca martelo", "biceps", ["dumbbells"], ["Segure os halteres com as palmas voltadas para dentro.", "Flexione os cotovelos sem impulso do tronco.", "Retorne lentamente."], { img: "Hammer_Curls" })
);
export function eligibleExercises(p) {
  return CATALOG.filter(x => x.requires.every(e => p.equipment.includes(e)) && !(x.floor && p.avoid.includes("floor")) && !(x.experienced && p.experience !== "regular") && !(x.overhead && p.avoid.includes("overhead")) && !(x.requires.includes("barbell") && p.avoid.includes("barbell")));
}
const dayIndex = d => DAYS.findIndex(([key]) => key === d);
export function buildPlan(raw, {
  now = new Date().toISOString(),
  recent = [],
  aiRanking = []
} = {}) {
  const p = validateProfile(raw),
    gate = screening(p);
  if (!gate.ready) throw new TrainingError(gate.message, 422);
  const latest = recent[0];
  if (recent.some(s => s.feedback?.pain === true)) throw new TrainingError("Você relatou dor em uma sessão. O ajuste automático está pausado até avaliar a situação com um profissional.", 422);
  const needsAdaptation = p.experience === "new" || ["medium", "long"].includes(p.break);
  const cautious = needsAdaptation || p.experience === "returning" || p.sleep === "low" || p.stress === "high" || p.activity === "high" || latest?.feedback?.effort >= 9 || latest?.feedback?.recovery === "poor";
  const pool = eligibleExercises(p),
    notes = [];
  const days = [...p.days].sort((a, b) => dayIndex(a) - dayIndex(b));
  const schedule = trainingSchedule(p, needsAdaptation, pool.some(x => x.pattern === "pull"));
  const strengthDays = days.filter(d => schedule.focus[d] !== "recovery");
  if (strengthDays.length < 2) notes.push("Com os dias escolhidos, há só uma sessão de força sem dias consecutivos. Se puder, escolha dois dias separados.");
  if (!pool.some(x => x.pattern === "pull")) notes.push("Faltou equipamento para puxadas resistidas. Inclua acesso a uma máquina, polia ou elástico adequado para completar o trabalho de costas; o plano não inventa uma alternativa equivalente sem equipamento.");
  if (cautious) notes.push("O volume inicial foi reduzido para facilitar adaptação e recuperação.");
  if (p.experience === "returning" && p.break === "none") notes.push("Você marcou retorno ao treino e também ausência de pausa. Consideramos a experiência prévia para a divisão e mantivemos volume conservador. Se houve uma pausa, revise essa resposta para ajustar a proposta.");
  if (p.support === "no") notes.push("Peça a um profissional uma demonstração dos movimentos que você ainda não domina antes de adicionar carga.");
  const ranked = pool.slice().sort((a, b) => {
    const ai = aiRanking.indexOf(a.id),
      bi = aiRanking.indexOf(b.id);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  });
  const rationale = [schedule.reason,
    cautious ? "O volume foi reduzido por adaptação, retorno ou recuperação informada. Esse ajuste de séries não obriga uma mudança para corpo todo." : "O volume usa a base do objetivo e do tempo disponível, sem sinal informado que exija redução inicial.",
    `Objetivo: ${GOALS.find(([id]) => id === p.goal)?.[1]}. O tempo de ${p.minutes} minutos inclui aquecimento e descanso.`,
    p.priorities.includes("upper") ? "Superiores recebem prioridade na ordem e, quando há tempo e recuperação, séries extras e trabalho de braços." : p.priorities.includes("lower") ? "Pernas e glúteos recebem prioridade na ordem e, quando há tempo e recuperação, séries extras." : p.priorities.includes("core") ? "O trabalho de tronco recebe prioridade e volume adicional quando há tempo e recuperação." : "Distribuição equilibrada entre as regiões, respeitando os equipamentos informados."
  ];
  if (p.avoid.length) rationale.push("As preferências de movimentos a evitar foram aplicadas ao catálogo e às alternativas.");
  let strengthIndex = 0;
  const workouts = days.map((d, i) => {
    if (!strengthDays.includes(d)) return {
      id: `recovery-${d}`,
      day: d,
      name: "Recuperação ativa",
      kind: "recovery",
      minutes: Math.min(p.minutes, 20),
      exercises: [],
      warmup: "Comece devagar.",
      guidance: "Caminhada confortável ou mobilidade leve, sem dor. Este dia não é outro treino pesado."
    };
    const focus = schedule.focus[d], order = strengthIndex++;
    let patterns = focus === "upper" ? ["push", "pull", "shoulder", "biceps", "triceps"] : focus === "lower" ? ["squat", "hinge", "accessory", "core"] : ["squat", "push", "pull", "hinge", ...(p.minutes > 20 ? ["core"] : [])];
    if (focus === "full" && !cautious && p.minutes >= 45) patterns.push(p.priorities.includes("upper") ? (order % 2 ? "triceps" : "biceps") : "accessory");
    const preferred = p.priorities.includes("upper") ? ["push", "pull", "shoulder", "biceps", "triceps"] : p.priorities.includes("lower") ? ["squat", "hinge"] : p.priorities.includes("core") ? ["core"] : [];
    patterns = [...patterns.filter(x => preferred.includes(x)), ...patterns.filter(x => !preferred.includes(x))];
    const exercises = patterns.flatMap(pattern => {
      let options = ranked.filter(x => x.pattern === pattern);
      if (pattern === "accessory" && focus === "lower") options = options.filter(x => x.id === "calf");
      if (pattern === "accessory" && focus === "full" && p.priorities.includes("lower")) options = options.filter(x => x.id === "calf");
      if (!options.length) return [];
      const variant = focus === "full" ? order : Math.floor(order / 2);
      const x = options[variant % options.length];
      const isolation = ["accessory", "shoulder", "biceps", "triceps", "core"].includes(pattern);
      const strength = p.goal === "strength" && !cautious && !isolation && x.requires.length > 0;
      return [{ ...x,
        sets: (cautious ? 2 : 3) + (!cautious && p.minutes >= 45 && preferred.includes(pattern) ? 1 : 0),
        reps: strength ? "6–8" : isolation ? "10–15" : ["health", "fatloss"].includes(p.goal) ? "10–15" : "8–12",
        rest: strength ? 150 : isolation ? 60 : p.goal === "muscle" && !cautious ? 90 : 75,
        rir: cautious ? 3 : 2,
        alternatives: options.filter(y => y.id !== x.id).map(y => y.id)
      }];
    });
    const estimate = () => 5 + exercises.reduce((n, x) => n + (x.sets * 40 + (x.sets - 1) * x.rest + 35) / 60, 0);
    while (estimate() > p.minutes && exercises.some(x => x.sets > 1)) for (const x of exercises) {
      if (estimate() <= p.minutes) break;
      if (x.sets > 1) x.sets--;
    }
    if (!exercises.length) throw new TrainingError("Não encontramos uma rotina compatível com as opções de equipamento. Revise suas respostas.");
    return {
      id: `strength-${d}`,
      day: d,
      focus,
      name: `Treino ${String.fromCharCode(64 + strengthIndex)} · ${focus === "upper" ? "Superiores" : focus === "lower" ? "Inferiores" : "Corpo todo"}`,
      kind: "strength",
      minutes: Math.ceil(estimate()),
      warmup: "Reserve 5 minutos para movimento leve e uma série de ensaio com pouca ou nenhuma carga nos primeiros exercícios.",
      exercises,
      guidance: "Escolha uma carga que permita terminar cada série com técnica e ainda fazer 2–3 repetições. Não é necessário ir até a falha."
    };
  });
  return {
    version: VERSION,
    generatorVersion: GENERATOR_VERSION,
    division: schedule.division,
    rationale,
    createdAt: now,
    goal: p.goal,
    weeks: 4,
    workouts,
    notes,
    source: "base",
    explanation: `${schedule.division === "upper_lower" ? "Divisão em superiores e inferiores" : "Corpo todo"} em ${strengthDays.length} sessões de força, com ${cautious ? "volume inicial reduzido" : "volume ajustado ao objetivo"}. Exercícios e alternativas respeitam os equipamentos e preferências informados.`,
    progression: "Quando completar o topo da faixa em todas as séries, em duas sessões sem dor e com 2–3 repetições de reserva, considere o menor aumento de carga disponível. Se perder a técnica, mantenha ou reduza. Não há aumento automático obrigatório."
  };
}
export function validateSession(body, plan) {
  if (!body || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.id || "")) throw new TrainingError("Identificador de sessão inválido.");
  const workout = plan.workouts.find(w => w.id === body.workoutId);
  if (!workout) throw new TrainingError("Treino não encontrado.");
  const f = body.feedback;
  if (!f || typeof f.pain !== "boolean" || !Number.isInteger(f.effort) || f.effort < 1 || f.effort > 10 || !["good", "tired", "poor"].includes(f.recovery)) throw new TrainingError("Preencha esforço, recuperação e se houve dor.");
  const sets = body.sets;
  if (!Array.isArray(sets) || sets.length > 60) throw new TrainingError("Registro de séries inválido.");
  const seen = new Set();
  for (const s of sets) {
    const ex = workout.exercises.find(e => e.id === (s.slotId || s.exerciseId)),
      key = `${s.slotId || s.exerciseId}:${s.index}`;
    if (!ex || !(s.exerciseId === ex.id || ex.alternatives.includes(s.exerciseId)) || !Number.isInteger(s.index) || s.index < 0 || s.index >= ex.sets || !Number.isFinite(s.reps) || s.reps < 1 || s.reps > 100 || !Number.isFinite(s.kg) || s.kg < 0 || s.kg > 500 || seen.has(key)) throw new TrainingError("Confira repetições e carga de cada série.");
    seen.add(key);
  }
  if (workout.kind === "strength" && !sets.length) throw new TrainingError("Registre pelo menos uma série antes de concluir.");
  const completed = new Date(body.completedAt || Date.now());
  if (!Number.isFinite(completed.getTime()) || completed.getTime() > Date.now() + 300000 || completed.getTime() < Date.now() - 365 * 86400000) throw new TrainingError("Data de sessão inválida.");
  return {
    id: body.id,
    workoutId: workout.id,
    completedAt: completed.toISOString(),
    sets,
    feedback: {
      pain: f.pain,
      effort: f.effort,
      recovery: f.recovery,
      note: String(f.note || "").slice(0, 500)
    }
  };
}
export function aiSummary(p, plan) {
  return {
    goal: p.goal,
    experience: p.experience,
    place: p.place,
    equipment: p.equipment,
    days: p.days,
    minutes: p.minutes,
    priorities: p.priorities,
    division: plan.division,
    rationale: plan.rationale,
    candidates: eligibleExercises(p).map(x => ({
      id: x.id,
      name: x.name,
      pattern: x.pattern
    })),
    base: plan.workouts.map(w => ({
      name: w.name,
      exercises: w.exercises.map(x => x.id)
    }))
  };
}
