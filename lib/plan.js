// Plano do Dr. Victor Rocha (Azul Nutri) — 01/10/2026
// item: { t: texto, s: observação, sup: suplemento, g: grupo, p: porções, shop: [nome, gramas/dia] }
export const WATER_GOAL = 2600;
export const START_WEIGHT = 72.4;

export const MEALS = [
  { id: "m1", name: "Café da manhã", time: "07:00", items: [
    { t: "2 fatias de pão de forma integral", g: 1, p: 1, shop: ["Pão de forma integral (fatias)", 2, "fatias"] },
    { t: "50 g de peito de frango desfiado", g: 5, p: 1, shop: ["Peito de frango", 50, "g"] },
    { t: "1 col. sopa rasa de requeijão light", g: 6, p: 0.5, shop: ["Requeijão light", 15, "g"] },
    { t: "1 g de Ômega 3", sup: 1, short: "Ômega 3" },
    { t: "Cápsula 1 (Selênio, Iodo, Cindura, D3, K2, Vit. E)", s: "1 cápsula pela manhã", sup: 1, short: "Cápsula 1" },
    { t: "6 g de Creatina", s: "todos os dias, inclusive sem treino", sup: 1, short: "Creatina" },
  ]},
  { id: "m2", name: "Lanche da manhã", time: "10:00", items: [
    { t: "70 g de aveia", g: 1, p: 2, shop: ["Aveia", 70, "g"] },
    { t: "40 g de whey concentrado", g: 5, p: 1, shop: ["Whey concentrado", 40, "g"] },
    { t: "1 banana nanica ou maçã média", g: 3, p: 1, shop: ["Banana nanica ou maçã", 1, "unid."] },
  ]},
  { id: "m3", name: "Almoço", time: "12:30", items: [
    { t: "250 g de arroz parboilizado (cozido)", g: 1, p: 2, shop: ["Arroz parboilizado (cozido)", 250, "g"] },
    { t: "50 g de feijão (grãos), caldo à vontade", g: 4, p: 1, shop: ["Feijão (cozido, grãos)", 50, "g"] },
    { t: "100 g de frango grelhado ou 80 g de patinho", g: 5, p: 1, shop: ["Peito de frango", 100, "g"] },
    { t: "Salada de folhas à vontade", shop: ["Folhas para salada", 1, "porção"] },
    { t: "1 g de Ômega 3", sup: 1, short: "Ômega 3" },
  ]},
  { id: "m4", name: "Café da tarde", time: "16:00", items: [
    { t: "2 fatias de pão de forma integral", g: 1, p: 1, shop: ["Pão de forma integral (fatias)", 2, "fatias"] },
    { t: "50 g de peito de frango desfiado", g: 5, p: 1, shop: ["Peito de frango", 50, "g"] },
    { t: "1 col. sopa de requeijão light", g: 6, p: 0.5, shop: ["Requeijão light", 15, "g"] },
    { t: "1 fatia grande de abacaxi", g: 3, p: 1, shop: ["Abacaxi (fatias)", 1, "fatia"] },
  ]},
  { id: "pt", name: "Pós-treino", time: "18:30", workout: true, items: [
    { t: "40 g de whey concentrado", s: "imediatamente após o treino", shop: ["Whey concentrado", 40, "g"] },
    { t: "1 col. sopa de mel", shop: ["Mel", 15, "g"] },
  ]},
  { id: "m5", name: "Jantar", time: "20:30", items: [
    { t: "125 g de arroz parboilizado (cozido)", g: 1, p: 1, shop: ["Arroz parboilizado (cozido)", 125, "g"] },
    { t: "50 g de feijão (grãos), caldo à vontade", g: 4, p: 1, shop: ["Feijão (cozido, grãos)", 50, "g"] },
    { t: "100 g de frango grelhado ou 80 g de patinho", g: 5, p: 1, shop: ["Peito de frango", 100, "g"] },
    { t: "Salada de folhas à vontade", shop: ["Folhas para salada", 1, "porção"] },
    { t: "1 comprimido Centrum Adulto", sup: 1, short: "Centrum" },
    { t: "1 g de Ômega 3", sup: 1, short: "Ômega 3" },
    { t: "Cápsula 2 (Long Jack, Ginseng, Epimedium, Zinco)", s: "1 cápsula após o jantar", sup: 1, short: "Cápsula 2" },
  ]},
];

// estoque: perDay = consumo diário (treino conta ~5x/semana)
export const SUPPLIES = [
  { id: "caps1", name: "Cápsula 1 (manhã)", unit: "cápsulas", def: 60, perDay: 1, shop: "Cápsula 1 (manhã)" },
  { id: "caps2", name: "Cápsula 2 (jantar)", unit: "cápsulas", def: 60, perDay: 1, shop: "Cápsula 2 (jantar)" },
  { id: "omega", name: "Ômega 3", unit: "cápsulas de 1 g", def: 120, perDay: 3, shop: "Ômega 3" },
  { id: "centrum", name: "Centrum Adulto", unit: "comprimidos", def: 60, perDay: 1, shop: "Centrum Adulto" },
  { id: "creat", name: "Creatina", unit: "g", def: 300, perDay: 6, shop: "Creatina" },
  { id: "whey", name: "Whey concentrado", unit: "g", def: 900, perDay: 40 + 40 * 5 / 7, shop: "Whey concentrado" },
  { id: "dila", name: "Dila Pump (pré-treino)", unit: "g", def: 318, perDay: 10.6 * 5 / 7, shop: "Dila Pump tangerina (pré-treino)" },
];
export function stockLeft(s, info, day) {
  if (!info?.start) return null;
  const used = Math.max(0, (new Date(day + "T12:00:00Z") - new Date(info.start + "T12:00:00Z")) / 864e5) * s.perDay;
  const left = Math.max(0, (+info.qty || s.def) - used);
  return { left: Math.round(left), days: Math.floor(left / s.perDay) };
}

// pré-treino (fora da dieta do nutricionista; dose do rótulo)
export const PREWORKOUT = {
  name: "Dila Pump tangerina",
  dose: "2 scoops (10,6 g)",
  how: "em 260 ml de água gelada, 20 a 30 min antes do treino",
  note: "Dose do rótulo. Sem cafeína: não conta no limite de 500 mg.",
};

export const RULES = [
  "Água: 2,6 L por dia (importante).",
  "Creatina 6 g todos os dias, inclusive sem treino.",
  "Cafeína à gosto, máximo 500 mg/dia.",
  "Perdeu uma refeição: una com a próxima, mas não com frequência.",
  "Azeite só para untar. Sal no máximo 5 g/dia. Sem temperos industrializados.",
  "Bebidas livres: refri zero, Clight, café/chá sem açúcar, água saborizada, com limão ou com gás.",
  "1 refeição livre por semana, substituindo uma refeição, sem exageros.",
  "Substituições só quando necessário, no mesmo grupo e na mesma quantidade de porções.",
  "Treino no MFIT: siga a ordem A-B-C-D, não o dia da semana.",
];

const raw = {
  1: ["Arroz, pão, massa, batata", 150, "Arroz branco cozido|125|5 col. sopa;Arroz integral cozido|125|6 col. sopa;Batata cozida|200|1½ unid.;Batata doce cozida|150|1½ col. servir;Batata sauté|125|2½ col. servir;Biscoito água e sal|33|6 unid.;Biscoito Club Social|26|1 pacote;Biscoito de leite|30|6 unid.;Biscoito maisena|35|7 unid.;Biscoito maria|35|7 unid.;Bolo de banana|50|1 fatia;Bolo de chocolate simples|35|1 fatia;Bolo de milho simples|50|1 fatia;Bolo simples outros|50|1 fatia;Aveia flocos|37|2½ col. sopa;Farinha de mandioca|40|2½ col. sopa;Farinha de milho|42|3½ col. sopa;Mandioca cozida/amassada|126|3½ col.;Macarrão cozido|105|4 col. sopa;Mandioca cozida|128|4 col. sopa;Milho verde espiga|100|1 unid.;Milho em conserva|142|7 col. sopa;Pão de centeio|60|2 fatias;Pão de forma integral|50|2 fatias;Pão de forma tradicional|50|2 fatias;Pão de queijo|60|1 unid.;Pão de queijo mini|60|6 unid.;Pão francês|50|1 unid.;Bisnaguinha|60|3 unid.;Pipoca com sal|30|3 xíc. chá;Polenta cozida|250|3 fatias;Purê de batata|130|2 col. servir;Torrada salgada|40|4 unid.;Torrada com fibras|40|4 unid.;Torrada pão francês|33|6 fatias"],
  2: ["Legumes e verduras", 15, "Abóbora cozida|70|2 col. sopa;Abobrinha cozida|80|3 col. sopa;Acelga cozida|85|2½ col. sopa;Acelga crua|90|9 col. sopa;Agrião|132|22 ramos;Aipo cru|80|2 unid.;Alcachofra cozida|35|½ unid.;Alface lisa|120|11 folhas;Alface americana|120|6 folhas;Aspargo cozido|73|6½ unid.;Berinjela cozida|60|2 col. sopa;Beterraba cozida|43|3 fatias;Beterraba crua ralada|43|2 col. sopa;Brócolis cozido|60|4½ col. sopa;Broto de feijão cozido|80|1½ col. servir;Cenoura cozida fatias|35|7 fatias;Cenoura crua picada|40|1 col. servir;Chuchu cozido|57|2½ col. sopa;Couve de bruxelas|40|2½ unid.;Couve-flor cozida|69|3 ramos;Couve manteiga cozida|42|1 col. servir;Ervilha fresca|20|1½ col. sopa;Escarola|85|10 folhas;Espinafre cozido|67|2½ col. sopa;Jiló cozido|40|1½ col. sopa;Pepino japonês|130|1 unid.;Pimentão cru fatiado|56|8 fatias;Quiabo cozido|52|2 col. sopa;Rabanete|90|3 unid.;Repolho branco cru|72|6 col. sopa;Repolho cozido|75|5 col. sopa;Repolho roxo cru|60|5 col. sopa;Rúcula|90|15 ramos;Salsão cru|95|5 col. sopa;Tomate caqui|75|2½ fatias;Tomate cereja|70|7 unid.;Tomate comum|80|4 fatias;Vagem cozida|44|2 col. sopa"],
  3: ["Frutas", 70, "Abacate amassado|45|2 col. sopa;Abacaxi|145|1 fatia;Acerola|220|32 unid.;Ameixa desidratada|30|3 unid.;Ameixa vermelha|130|2 unid.;Atemóia|74|½ unid.;Banana nanica|120|1 unid.;Banana prata|75|1 unid.;Caju|142|1½ unid.;Caqui|100|1 unid.;Carambola|215|2 unid.;Cereja fresca|96|24 unid.;Damasco desidratado|30|4 unid.;Figo|86|1½ unid.;Fruta do conde|75|½ unid.;Goiaba|138|1 unid.;Jabuticaba|140|20 unid.;Jaca|75|5 bagos;Kiwi|115|1½ unid.;Laranja Bahia|144|1 unid.;Laranja Kinkan|156|12 unid.;Laranja Lima|153|1½ unid.;Laranja Pêra|137|1 unid.;Limão|252|3 unid.;Maçã|120|1 unid.;Mamão formosa|220|1 fatia;Mamão papaia|180|½ unid.;Manga Bordon|110|1 unid.;Manga Haden|110|½ unid.;Maracujá polpa|72|3 col. sopa;Melancia|220|2 fatias;Melão|200|½ fatia;Mexerica|160|1 unid.;Morango|235|10 unid.;Pêra williams|120|1 unid.;Pêssego|165|1½ unid.;Suco de laranja puro|187|200 ml;Suco de abacaxi|125|200 ml;Uva niágara|100|8 unid.;Uva thompson|100|32 unid.;Uva passa|17|1 col. sopa"],
  4: ["Feijões e oleaginosas", 55, "Feijão (50% caldo)|86|1 concha;Feijão só grãos|50|2 col. sopa;Feijão branco|48|1½ col. sopa;Ervilha seca cozida|72|2½ col. sopa;Grão de bico cozido|36|1½ col. sopa;Lentilha cozida|48|2 col. sopa;Soja cozida|43|1½ col. servir;Amêndoa|10|9 unid.;Amendoim torrado|9|22 unid.;Avelã|9|10 unid.;Castanha de caju|10|4 unid.;Macadâmia|9|3 unid.;Nozes|9|4 unid."],
  5: ["Carnes e ovos", 190, "Bacalhoada|75|1 col. servir;Bife de fígado|100|1 unid.;Bife grelhado|100|1 unid.;Camarão cozido|190|20 unid.;Carne assada|170|1 fatia;Carne moída refogada|100|5 col. sopa;Filé de frango grelhado|100|1 unid.;Frango assado s/ pele|100|1 pedaço;Sobrecoxa cozida s/ pele|100|1½ unid.;Merluza cozida|200|2 filés;Omelete simples|100|1½ unid.;Ovo cozido|90|2 unid.;Ovo de codorna|120|15 unid.;Peixe espada cozido|100|1 filé;Tilápia|100|1 filé;Salmão|100|1 filé"],
  6: ["Leite, queijo, iogurte", 120, "Coalhada|100|200 ml;Iogurte desnatado de frutas|120|200 ml;Iogurte desnatado natural|200|200 ml;Iogurte integral de frutas|150|200 ml;Iogurte integral natural|200|200 ml;Leite em pó desnatado|30|3 col. sopa;Leite em pó integral|26|2 col. sopa;Leite integral|200|200 ml;Leite semidesnatado|270|200 ml;Queijo minas|50|1½ fatia;Muçarela|45|3 fatias;Requeijão cremoso|45|1½ col. sopa;Ricota|100|2 fatias;Vitamina leite c/ frutas|180|200 ml"],
  7: ["Óleos e gorduras", 73, "Azeite de oliva|8|1 col. sopa;Manteiga|10|½ col. sopa;Margarina|10|½ col. sopa;Óleo de canola|8|1 col. sopa;Óleo de girassol|8|1 col. sopa;Óleo de soja|8|1 col. sopa"],
  8: ["Açúcares e doces", 110, "Açúcar mascavo fino|25|1 col. sopa;Mel|37|2½ col. sopa;Melado|32|2 col. sopa;Açúcar refinado|28|1 col. sopa;Brigadeiro|30|2 unid. pequenas;Geleia|45|3 col. sobremesa;Goiabada|45|½ fatia"],
};
export const GROUPS = Object.fromEntries(Object.entries(raw).map(([k, [name, kcal, list]]) => [k, {
  name, kcal, foods: list.split(";").map((r) => { const [n, g, m] = r.split("|"); return { n, g: +g, m }; }),
}]));

export function mainItemsCount() {
  return MEALS.filter((m) => !m.workout).reduce((a, m) => a + m.items.length, 0);
}

/* ---------- regras compartilhadas (app + notificações) ---------- */
export const LETTERS = "ABCDEF";
export const CAFFEINE_MAX = 500;
export const CAFFEINE = [
  ["Café coado (xícara)", 90], ["Expresso", 65], ["Pré-treino (dose)", 200],
  ["Energético (lata)", 80], ["Refri zero cola (lata)", 35], ["Chá preto/mate", 40],
];
export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const weekday = (day) => new Date(day + "T12:00:00Z").getUTCDay();
export const isWeekend = (day) => [0, 6].includes(weekday(day));

// horário da refeição no dia (respeita horários de fim de semana)
export function mealTime(m, times = {}, day) {
  if (times.we_on && day && isWeekend(day) && times["we_" + m.id]) return times["we_" + m.id];
  return times[m.id] || m.time;
}
export function trainTime(times = {}, day) {
  if (times.we_on && day && isWeekend(day) && times.we_treino) return times.we_treino;
  return times.treino || "18:00";
}

export const itemDone = (log, m, i) => !!(log?.checks?.[`${m.id}-${i}`] || log?.checks?._free === m.id);
export const mealIsDone = (log, m) => m.items.every((_, i) => itemDone(log, m, i));

export function dayScore(log) {
  if (!log) return 0;
  let done = 0;
  MEALS.filter((m) => !m.workout).forEach((m) => m.items.forEach((_, i) => { if (itemDone(log, m, i)) done++; }));
  return Math.round(((done / mainItemsCount()) * 0.75 + Math.min((log.water_ml || 0) / WATER_GOAL, 1) * 0.25) * 100);
}

// sugestão de reposição: como somar a refeição perdida na próxima
export function replaceSuggestion(src, target) {
  const lines = [];
  src.items.forEach((it) => {
    if (it.sup) { lines.push({ sup: true, text: `${it.short || it.t}: tome junto` }); return; }
    const match = it.shop && target.items.find((x) => x.shop && x.shop[0] === it.shop[0]);
    if (match && it.shop[2] === match.shop[2]) {
      const tot = it.shop[1] + match.shop[1];
      lines.push({ text: `${it.shop[0]}: some ${it.shop[1]} ${it.shop[2]} aos ${match.shop[1]} ${match.shop[2]} (total ${tot} ${it.shop[2]})` });
    } else lines.push({ text: `${it.t}: coma junto` });
  });
  return lines;
}

// quantidades da semana (meal prep / compras)
export function weekShop(trainings = 5) {
  const acc = {};
  MEALS.forEach((m) => m.items.forEach((it) => {
    if (!it.shop) return; const [n, q, u] = it.shop; const mult = m.workout ? trainings : 7;
    acc[n] = acc[n] || { q: 0, u }; acc[n].q += q * mult;
  }));
  acc["Creatina"] = { q: 42, u: "g" };
  return Object.entries(acc);
}
export const fmtQty = (q, u) => u === "g" && q >= 1000 ? `${(q / 1000).toFixed(2).replace(".", ",")} kg` : `${q} ${u}`;

// virada do dia: depois da meia-noite, até "dayEnd" horas, ainda conta como o dia anterior
export function effectiveNow(spn, times = {}, addDaysFn) {
  const end = +(times.dayEnd || 0);
  if (end && spn.min < end * 60) return { day: addDaysFn(spn.day, -1), min: spn.min + 1440 };
  return spn;
}
