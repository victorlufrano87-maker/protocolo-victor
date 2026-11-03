"use client";
import { useMemo, useState } from "react";
import { RECIPES } from "@/lib/recipes";
import { supabase, spNow } from "@/lib/supabase";
import { MEALS, GROUPS, RULES, SUPPLIES, LETTERS, WEEKDAYS, PREWORKOUT, PREP, WEEK_BASIC, stockLeft, weekShop, fmtQty } from "@/lib/plan";
import { buzz } from "@/components/shared";
import { AICredit } from "@/components/ai";



function SubsTable() {
  const [g, setG] = useState("1");
  return (
    <div className="card">
      <h2>Tabela de substituição</h2>
      <div className="tag">Mesmo grupo, mesma quantidade de porções. Para o cálculo automático, use o botão de troca ao lado de cada alimento em Hoje.</div>
      <select id="grp" value={g} onChange={(e) => setG(e.target.value)}>
        {Object.entries(GROUPS).map(([k, v]) => <option key={k} value={k}>Grupo {k} · {v.name} ({v.kcal} kcal)</option>)}
      </select>
      <table><tbody>{GROUPS[g].foods.map((f) => <tr key={f.n}><td>{f.n}</td><td className="q">{f.g} g</td><td className="tag">{f.m}</td></tr>)}</tbody></table>
    </div>
  );
}

function Plan({ uid, settings, saveSettings, today, say }) {
  const T = settings.times || {};
  const left = settings.update_date ? Math.round((new Date(settings.update_date) - new Date(spNow().day)) / 864e5) : null;
  const setT = (k, v) => saveSettings({ times: { ...T, [k]: v } });
  const divs = +(T.divs || 5);

  return (
    <>
      <div className="card">
        <h2>Horários</h2>
        <div className="tag">As notificações seguem estes horários.</div>
        {MEALS.filter((m) => !m.workout).map((m) => (
          <div key={m.id} className="mh"><span>{m.name}</span><input id={"tm-" + m.id} type="time" value={T[m.id] || m.time} onChange={(e) => setT(m.id, e.target.value)} /></div>
        ))}
        <div className="mh"><span>Treino</span><input id="tm-treino" type="time" value={T.treino || "21:00"} onChange={(e) => setT("treino", e.target.value)} /></div>
        <div className="mh"><span>Dormir<div className="tag">aviso 30 min antes para desacelerar</div></span><input id="tm-sleep" type="time" value={T.sleep || "23:00"} onChange={(e) => setT("sleep", e.target.value)} /></div>
        <div className="mh"><span>Lembrete de dormir</span><label className="switch"><input id="sleep-on" type="checkbox" checked={T.sleep_on !== false} onChange={(e) => setT("sleep_on", e.target.checked)} /><span /></label></div>
      </div>

      <div className="card">
        <div className="mh"><h2>Fim de semana</h2>
          <label className="switch"><input id="we-on" type="checkbox" checked={!!T.we_on} onChange={(e) => setT("we_on", e.target.checked)} /><span /></label></div>
        <div className="tag">{T.we_on ? "Sábado e domingo usam estes horários (avisos também)." : "Ligue para usar horários diferentes no sábado e domingo."}</div>
        {T.we_on && <>
          {MEALS.filter((m) => !m.workout).map((m) => (
            <div key={m.id} className="mh"><span>{m.name}</span><input id={"we-" + m.id} type="time" value={T["we_" + m.id] || T[m.id] || m.time} onChange={(e) => setT("we_" + m.id, e.target.value)} /></div>
          ))}
          <div className="mh"><span>Treino</span><input id="we-treino" type="time" value={T.we_treino || T.treino || "21:00"} onChange={(e) => setT("we_treino", e.target.value)} /></div>
        </>}
      </div>

      <div className="card">
        <h2>Pesagem e check-in semanal</h2>
        <div className="tag">No dia escolhido: aviso às 6h45 para pesar em jejum e card de check-in no app.</div>
        <div className="mh"><span>Dia da semana</span>
          <select id="weigh" value={T.weigh ?? ""} onChange={(e) => setT("weigh", e.target.value === "" ? "" : +e.target.value)}>
            <option value="">Não definido</option>{WEEKDAYS.map((w, i) => <option key={w} value={i}>{w}</option>)}</select></div>
      </div>

      <div className="card">
        <h2>Treino</h2>
        <div className="tag">Siga a ordem das divisões, não o dia da semana.</div>
        <div className="mh"><span>Divisões</span>
          <select id="divs" value={divs} onChange={(e) => setT("divs", +e.target.value)}>{[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{LETTERS.slice(0, n).split("").join("-")}</option>)}</select></div>
        <div className="mh"><span>Próximo treino</span>
          <select id="next" value={+(T.next || 0) % divs} onChange={(e) => setT("next", +e.target.value)}>{LETTERS.slice(0, divs).split("").map((l, i) => <option key={l} value={i}>Treino {l}</option>)}</select></div>
      </div>

      <Stock {...{ settings, saveSettings, today }} />

      <div className="card">
        <h2>Pré-treino</h2>
        <div className="tag">{PREWORKOUT.name}: <b style={{ color: "var(--fg)" }}>{PREWORKOUT.dose}</b> {PREWORKOUT.how}. {PREWORKOUT.rest}</div>
        <div className="tag">{PREWORKOUT.note}</div>
      </div>

      <div className="card">
        <h2>Dia e água</h2>
        <div className="mh"><span>O dia termina às<div className="tag">ir dormir 1h ainda conta como hoje</div></span>
          <select id="dayEnd" value={T.dayEnd || 0} onChange={(e) => setT("dayEnd", +e.target.value)}>
            <option value={0}>00:00</option><option value={2}>02:00</option><option value={3}>03:00</option><option value={4}>04:00</option></select></div>
        <div className="mh"><span>Sua garrafa</span>
          <select id="bottle" value={T.bottle || 500} onChange={(e) => setT("bottle", +e.target.value)}>
            {[300, 400, 500, 600, 750, 1000].map((v) => <option key={v} value={v}>{v} ml</option>)}</select></div>
      </div>

      <AICredit settings={settings} saveSettings={saveSettings} />
      <ScaleShortcut />
      <Shortcuts />

      <div className="card">
        <h2>Receitas do plano</h2>
        <div className="tag">Ideias de preparo usando só os alimentos e quantidades da sua dieta.</div>
        {RECIPES.map((r) => (
          <details key={r.name} className="recipe"><summary><b>{r.name}</b><span className="tag">{r.when}</span></summary>
            <ul>{r.items.map((x) => <li key={x}>{x}</li>)}</ul><p>{r.how}</p></details>
        ))}
      </div>

      <SubsTable />

      <div className="card">
        <h2>Regras do plano</h2>
        <ul className="rules">{RULES.map((r) => <li key={r}>{r}</li>)}</ul>
      </div>

      <button onClick={() => supabase.auth.signOut()}>Sair</button>
    </>
  );
}

const SUP_ITEMS = ["Ômega 3", "Cápsula 1 (manhã)", "Cápsula 2 (jantar)", "Creatina", "Centrum Adulto", "Whey concentrado", "Dila Pump tangerina (pré-treino)"];

const FOOD_ITEMS = [...new Set(MEALS.flatMap((m) => m.items.filter((it) => it.shop).map((it) => it.shop[0])))].filter((n) => n !== "Whey concentrado");

function Prep({ settings, saveSettings, say }) {
  const prep = settings.supplies?._prep || {};
  const set = (id, v) => saveSettings({ supplies: { ...settings.supplies, _prep: { ...prep, [id]: Math.max(0, v) } } });
  const low = PREP.filter((p) => (prep[p.id] ?? 0) <= 2);
  return (
    <div className="card">
      <div className="mh"><h2>Marmitas na geladeira</h2>{low.length > 0 && <span className="tag warn">cozinhar logo</span>}</div>
      <div className="tag">Desconta sozinho quando você conclui a refeição. Fez comida? Toque em + (ou +5).</div>
      {PREP.map((p) => (
        <div key={p.id} className="stock">
          <div className="mh"><b>{p.name}</b><span className={"num" + ((prep[p.id] ?? 0) <= 2 ? " warn" : "")} style={{ fontSize: 20 }}>{prep[p.id] ?? 0}</span></div>
          <div className="row tag"><span style={{ flex: 1 }}>{p.tip}</span>
            <button className="sm" aria-label="Menos uma" onClick={() => set(p.id, (prep[p.id] ?? 0) - 1)}>−</button>
            <button className="sm" onClick={() => set(p.id, (prep[p.id] ?? 0) + 1)}>+1</button>
            <button className="sm pri" onClick={() => { set(p.id, (prep[p.id] ?? 0) + 5); say("Marmitas adicionadas"); }}>+5</button></div>
        </div>
      ))}
    </div>
  );
}

function Shopping({ settings, saveSettings, say }) {
  const list = settings.supplies?._shop || [];
  const [txt, setTxt] = useState("");
  const [trainings, setTrainings] = useState(5);
  const save = (l) => saveSettings({ supplies: { ...settings.supplies, _shop: l } });
  const add = (n) => { n = n.trim(); if (!n) return; if (list.some((x) => x.toLowerCase() === n.toLowerCase())) return say("Já está na lista"); buzz(); save([...list, n]); };
  const bought = (n) => { buzz(30); save(list.filter((x) => x !== n)); say(`${n} comprado`); };
  const [copied, setCopied] = useState(false);
  const text = "Lista de compras:\n" + list.map((n) => "• " + n).join("\n");
  const canShare = typeof navigator !== "undefined" && !!navigator.share;
  async function copyList() {
    try { await navigator.clipboard.writeText(text); }
    catch { const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); }
    buzz(30); setCopied(true); setTimeout(() => setCopied(false), 2000);
  }
  async function shareList() { try { await navigator.share({ title: "Lista de compras", text }); } catch {} }

  const week = useMemo(() => weekShop(trainings), [trainings]);
  const fmtQ = fmtQty;

  const Quick = ({ title, items }) => (
    <div className="card">
      <h3>{title}</h3>
      <div className="chips">{items.map((n) => {
        const inList = list.includes(n);
        return <button key={n} className={"chip" + (inList ? " picked" : "")} onClick={() => inList ? bought(n) : add(n)}><b>{n}</b></button>;
      })}</div>
    </div>
  );

  return (
    <>
      <div className="card">
        <div className="mh"><h2>Para comprar</h2><span className="tag num">{list.length} {list.length === 1 ? "item" : "itens"}</span></div>
        {list.length > 0 && <div className="row">
          <button className="pri grow big" onClick={copyList}>{copied ? "Copiado ✓" : "Copiar lista"}</button>
          {canShare && <button className="ok grow big" onClick={shareList}>Enviar</button>}
        </div>}
        {list.length === 0 ? <div className="tag">Nada na lista. Quando algo acabar, toque nele abaixo.</div> :
          list.map((n) => (
            <div key={n} className="item">
              <button className="ck" aria-label={"Comprei " + n} onClick={() => bought(n)} />
              <div className="t" onClick={() => bought(n)}><b>{n}</b></div>
            </div>
          ))}
        <div className="row">
          <input id="shopadd" placeholder="Adicionar outro item" value={txt} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { add(txt); setTxt(""); } }} style={{ flex: 1, minWidth: 0 }} />
          <button className="pri" onClick={() => { add(txt); setTxt(""); }}>Adicionar</button>
        </div>
      </div>

      <button onClick={() => { const add = WEEK_BASIC.filter((n) => !list.includes(n)); save([...list, ...add]); buzz(30); say(add.length ? `${add.length} itens da semana adicionados` : "A lista da semana já está aí"); }}>+ Adicionar compra básica da semana</button>

      <Prep {...{ settings, saveSettings, say }} />

      <div className="tag">O que acabou? Toque para pôr na lista (toque de novo para tirar).</div>
      <Quick title="Suplementos" items={SUP_ITEMS} />
      <Quick title="Alimentos da dieta" items={FOOD_ITEMS} />

      <div className="card">
        <div className="mh"><h3>Quantidade por semana</h3><span className="tag">referência</span></div>
        <div className="row tag">Treinos/semana <input id="trn" type="number" min="0" max="7" value={trainings} onChange={(e) => setTrainings(+e.target.value)} style={{ width: 70 }} /></div>
        <table><tbody>{week.map(([n, { q, u }]) => <tr key={n}><td>{n}</td><td className="q">{fmtQ(q, u)}</td></tr>)}</tbody></table>
        <div className="tag">Arroz e feijão em peso cozido. Mais Ômega 3 (3 g/dia), Centrum e cápsulas.</div>
      </div>
    </>
  );
}

function Stock({ settings, saveSettings, today }) {
  const stock = settings.supplies?._stock || {};
  const set = (id, patch) => saveSettings({ supplies: { ...settings.supplies, _stock: { ...stock, [id]: { ...stock[id], ...patch } } } });
  return (
    <div className="card">
      <h2>Estoque</h2>
      <div className="tag">Ao abrir um pote, toque em "Abri um novo". Ele calcula quanto resta pelo consumo do plano e, faltando 5 dias, coloca na lista de compras e te avisa.</div>
      {SUPPLIES.map((s) => {
        const info = stock[s.id], r = stockLeft(s, info, today);
        return (
          <div key={s.id} className="stock">
            <div className="mh"><b>{s.name}</b>{r && <span className={"tag num" + (r.days <= 5 ? " warn" : "")}>~{r.left} {s.unit.split(" ")[0]} · {r.days} dias</span>}</div>
            {r && <div className="bar"><i style={{ width: `${Math.min(100, (r.left / (+info.qty || s.def)) * 100)}%`, background: r.days <= 5 ? "var(--warn)" : "var(--ok)" }} /></div>}
            <div className="row tag">
              <span>Pote com</span>
              <input id={"qty-" + s.id} type="number" inputMode="numeric" value={info?.qty ?? s.def} onChange={(e) => set(s.id, { qty: +e.target.value })} style={{ width: 84 }} />
              <span>{s.unit}</span>
              <button className="sm" onClick={() => set(s.id, { start: today, qty: info?.qty ?? s.def, auto: null })}>Abri um novo</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Shortcuts() {
  const base = typeof location !== "undefined" ? location.origin : "https://protocolo-victor.vercel.app";
  const [c, setC] = useState(null);
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); setC(t); setTimeout(() => setC(null), 2000); } catch {} };
  return (
    <div className="card">
      <h2>Atalhos (Siri / tela de início)</h2>
      <div className="tag"><b>"Tomei os suplementos"</b> marca todos os suplementos do horário atual. <b>"Bebi água"</b> soma 250 ou 500 ml.</div>
      <ol className="steps">
        <li>Abra o app <b>Atalhos</b> do iPhone → <b>+</b> → <b>Adicionar Ação</b> → busque <b>Abrir URLs</b></li>
        <li>Cole o endereço abaixo e dê o nome <b>Bebi água</b></li>
        <li>Diga "E aí Siri, bebi água", ou adicione o atalho na tela de início / Toque Atrás (Ajustes → Acessibilidade → Toque)</li>
      </ol>
      {[["sup", 1], ["agua", 250], ["agua", 500]].map(([k, v]) => { const u = `${base}/?${k}=${v}`; return <button key={v} className="opt" onClick={() => copy(u)}><span className="num" style={{ fontSize: 12.5, wordBreak: "break-all" }}>{u}</span><span className="q">{c === u ? "copiado" : "copiar"}</span></button>; })}
    </div>
  );
}

function PersonalLink({ settings, saveSettings, say }) {
  const token = settings.supplies?._token;
  const url = token ? `${typeof location !== "undefined" ? location.origin : ""}/p/${token}` : null;
  const gen = () => { const t = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join(""); saveSettings({ supplies: { ...settings.supplies, _token: t } }); };
  return (
    <div className="card">
      <h2>Link para o personal</h2>
      <div className="tag">Página só de leitura com adesão, água, treinos, peso e check-ins dos últimos 28 dias. Dá para salvar em PDF por lá.</div>
      {url ? <>
        <button className="opt" onClick={async () => { try { await navigator.clipboard.writeText(url); say("Link copiado"); } catch {} }}><span className="num" style={{ fontSize: 12.5, wordBreak: "break-all" }}>{url}</span><span className="q">copiar</span></button>
        <div className="row"><a className="btn" href={url} target="_blank" rel="noreferrer">Ver como o personal vê</a>
          <button onClick={() => { const s2 = { ...settings.supplies }; delete s2._token; saveSettings({ supplies: s2 }); say("Link desativado"); }}>Desativar link</button></div>
      </> : <button className="pri" onClick={gen}>Gerar link</button>}
    </div>
  );
}

function ScaleShortcut() {
  const base = typeof location !== "undefined" ? location.origin : "https://protocolo-victor.vercel.app";
  const [c, setC] = useState(false);
  const url = `${base}/?peso=`;
  return (
    <div className="card">
      <h2>Balança (bioimpedância)</h2>
      <div className="tag">Sua balança manda os dados para o app <b>Saúde</b>. Este atalho pega de lá e joga aqui sozinho.</div>
      <ol className="steps">
        <li>No app da balança: ative a sincronização com o <b>Saúde</b> (Apple Health).</li>
        <li>App <b>Atalhos</b> → <b>+</b> → adicione <b>Encontrar Amostras de Saúde</b>: tipo <b>Peso</b>, ordenar por <b>Data de Início, mais recente</b>, limite <b>1</b>.</li>
        <li>Repita a ação para <b>Percentual de Gordura Corporal</b> e <b>Massa Corporal Magra</b>.</li>
        <li>Adicione <b>Abrir URLs</b> e monte: o endereço abaixo + a variável Peso, depois <b>&amp;gordura=</b> + variável Gordura, <b>&amp;magra=</b> + variável Massa Magra.</li>
        <li>Nome: <b>Pesagem</b>. Para ficar automático: aba <b>Automação</b> → <b>App</b> → escolha o app da balança → <b>For fechado</b> → <b>Executar imediatamente</b> → atalho Pesagem.</li>
      </ol>
      <button className="opt" onClick={async () => { try { await navigator.clipboard.writeText(url); setC(true); setTimeout(() => setC(false), 2000); } catch {} }}>
        <span className="num" style={{ fontSize: 12.5, wordBreak: "break-all" }}>{url}<i style={{ color: "var(--mute)" }}>[Peso]&amp;gordura=[Gordura]&amp;magra=[Magra]</i></span><span className="q">{c ? "copiado" : "copiar"}</span></button>
      <div className="tag">Também aceita: &amp;musculo= &amp;agua= &amp;visceral= &amp;imc=. Resultado: você se pesa, fecha o app da balança e tudo aparece em Progresso.</div>
    </div>
  );
}

export { Plan, SubsTable, Prep, Shopping, Stock, Shortcuts, PersonalLink, ScaleShortcut, SUP_ITEMS, FOOD_ITEMS };
