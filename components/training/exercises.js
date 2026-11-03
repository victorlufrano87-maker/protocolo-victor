"use client";
import { useState } from 'react';
import { LIBRARY, GROUPS_EX, EQUIP } from '@/lib/library';
import { BodyMap, MUSCLE_PARTS } from '@/components/exercise-map';
import { ExAnim } from '@/components/exercises';
import { musclesOf, weekMuscles } from '@/lib/training/muscles.mjs';

const images = { 'machine-squat': 'Leg_Press', goblet: 'Goblet_Squat', squat: 'Bodyweight_Squat', pushup: 'Pushups', 'cable-row': 'Seated_Cable_Rows', 'db-row': 'One-Arm_Dumbbell_Row', rdl: 'Romanian_Deadlift', 'curl-machine': 'Seated_Leg_Curl', deadbug: 'Dead_Bug', lateral: 'Side_Lateral_Raise', calf: 'Standing_Calf_Raises' };
export function ExerciseGuide({ exercise }) {
  const image = exercise.id === 'press-machine' ? 'Machine_Bench_Press' : images[exercise.id];
  return <details className="tr-card tr-guide" key={exercise.id}><summary>Ver execução e músculos trabalhados</summary>{image && <ExAnim img={image} name={exercise.name} />}<BodyMap pm={musclesOf(exercise.id)} /><p>{musclesOf(exercise.id).join(' · ')}</p><p>Use as instruções abaixo para a variação do seu treino. Pare se sentir dor.</p><a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(exercise.name + ' execução correta')}`} target="_blank" rel="noreferrer">Buscar demonstração em vídeo ↗</a></details>;
}
export function TrainingLibrary() {
  const [query, setQuery] = useState(''), [group, setGroup] = useState(''), [equipment, setEquipment] = useState(''), [open, setOpen] = useState(null);
  const norm = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const list = LIBRARY.filter(x => (!group || x.g === group) && (!equipment || x.eq === equipment) && norm(`${x.n} ${x.g} ${x.foco || ''} ${x.pm.join(' ')}`).includes(norm(query.trim())));
  if (open) return <section className="tr-library"><button onClick={() => setOpen(null)}>← Voltar à busca</button><h1>{open.n}</h1><p>{open.g} · {open.eq}</p><ExAnim key={open.img} img={open.img} name={open.n} /><BodyMap pm={open.pm} sm={open.sm} /><h2>Onde sentir</h2><p>{open.foco || open.pm.join(', ')}</p><h2>Como fazer</h2><ol>{open.s.map(s => <li key={s}>{s}</li>)}</ol>{open.erro && <p className="tr-caution"><b>Erro comum:</b> {open.erro}</p>}<a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(open.n + ' execução correta')}`} target="_blank" rel="noreferrer">Buscar demonstração em vídeo ↗</a><p className="tr-small">A biblioteca serve para consultar movimentos. Para trocar no treino, use as alternativas compatíveis com seu perfil durante a sessão.</p></section>;
  return <section className="tr-library"><h1>Exercícios.</h1><p>Explore a mesma biblioteca visual do aplicativo pessoal.</p><label>Buscar exercício ou músculo<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Ex.: peito, glúteos, supino" /></label><div className="tr-filters"><label>Grupo muscular<select value={group} onChange={e => setGroup(e.target.value)}><option value="">Todos os músculos</option>{GROUPS_EX.map(g => <option key={g}>{g}</option>)}</select></label><label>Equipamento<select value={equipment} onChange={e => setEquipment(e.target.value)}><option value="">Todos os equipamentos</option>{EQUIP.map(g => <option key={g}>{g}</option>)}</select></label></div><p role="status">{list.length} exercícios encontrados</p><div className="tr-library-grid">{list.map(x => <button key={x.n} onClick={() => { setOpen(x); window.scrollTo(0, 0); }}><img src={`/ex/${x.img}.jpg`} alt="" loading="lazy" /><b>{x.n}</b><span>{x.g} · {x.eq}</span></button>)}</div>{!list.length && <p>Tente outro nome ou remova um dos filtros.</p>}</section>;
}
export function TrainingMuscles({ plan, sessions }) {
  const { done, target } = weekMuscles(plan, sessions), heat = {};
  for (const [m, parts] of Object.entries(MUSCLE_PARTS)) for (const part of parts) heat[part] = Math.max(heat[part] || 0, (done[m] || 0) / (target[m] || 1));
  return <section className="tr-card tr-muscles"><h2>Músculos da semana</h2><p>Séries registradas / previstas no seu plano</p><BodyMap heat={heat} />{Object.keys(MUSCLE_PARTS).filter(m => target[m] || done[m]).map(m => <div className="tr-muscle-row" key={m}><span>{m}</span><progress max={Math.max(target[m] || 0, done[m] || 0, 1)} value={done[m] || 0} /><b>{done[m] || 0}/{target[m] || 0}</b></div>)}<p className="tr-small">Segunda até hoje. Uma série pode trabalhar vários músculos; os totais não devem ser somados. A cor representa registros, não recuperação muscular.</p></section>;
}
