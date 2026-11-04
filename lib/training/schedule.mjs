export const GENERATOR_VERSION = 3;
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const adjacent = (a, b) => [1, 6].includes(Math.abs(DAYS.indexOf(a) - DAYS.indexOf(b)));
export function trainingSchedule(p, needsAdaptation, hasPull) {
  const days = DAYS.filter(d => p.days.includes(d));
  // Search the whole selected week, including the Sunday/Monday boundary.
  if (!needsAdaptation && hasPull && days.length >= 4 && p.minutes >= 30 && ['muscle', 'strength'].includes(p.goal)) {
    for (let code = 0; code < 3 ** days.length; code++) {
      let n = code;
      const groups = days.map(() => { const g = n % 3; n = Math.floor(n / 3); return g; });
      if ([1, 2].some(g => groups.filter(x => x === g).length !== 2)) continue;
      if ([1, 2].some(g => days.some((d, i) => groups[i] === g && days.some((other, j) => j > i && groups[j] === g && adjacent(d, other))))) continue;
      const first = groups.find(g => g > 0), lowerFirst = p.priorities.includes('lower');
      const name = g => g === first ? (lowerFirst ? 'lower' : 'upper') : (lowerFirst ? 'upper' : 'lower');
      return { division: 'upper_lower', focus: Object.fromEntries(days.map((d, i) => [d, groups[i] ? name(groups[i]) : 'recovery'])), reason: 'Quatro sessões divididas entre superiores e inferiores: você informou experiência prévia, ausência de pausa prolongada, pelo menos 30 minutos e equipamentos para puxadas. A mesma região não foi colocada em dias consecutivos. Recuperação e retorno ao treino ajustam o volume separadamente.' };
    }
  }
  let best = [];
  for (let mask = 1; mask < 2 ** days.length; mask++) {
    const selected = days.filter((_, i) => mask & (1 << i));
    if (selected.length > 3 || selected.length <= best.length) continue;
    if (selected.some((d, i) => selected.some((other, j) => j > i && adjacent(d, other)))) continue;
    best = selected;
  }
  return { division: 'full_body', focus: Object.fromEntries(days.map(d => [d, best.includes(d) ? 'full' : 'recovery'])), reason: needsAdaptation ? 'Corpo todo com volume inicial reduzido: você informou início na musculação ou uma pausa de pelo menos um mês. Os dias extras ficam para recuperação ativa.' : 'Corpo todo distribui o trabalho nos dias disponíveis. A divisão em superiores/inferiores requer quatro dias compatíveis, tempo e equipamentos suficientes; nem todo perfil precisa dessa divisão.' };
}
