import React, { useMemo, useState, useEffect } from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

// JSON model is imported by the user (no server). Shape:
// {
//   capabilities: [
//     { key, name, description, report_group, questions: [
//        { text, lens, options: {"Pre-crawl"|"Crawl"|"Walk"|"Run"|"Fly": string},
//          scores:  {"Pre-crawl"|"Crawl"|"Walk"|"Run"|"Fly": number} }
//     ]}
//   ]
// }

const LEVELS = ["Pre-crawl", "Crawl", "Walk", "Run", "Fly"];
const LENSES = ["Knowledge", "Process", "Metrics", "Adoption", "Automation"];

// ---- Theme (tuned to your palette)
const THEME = {
  primary: { 100: "#ffe3d6", 300: "#fba48a", 500: "#f56a4e", 700: "#f14227" },
  secondary: { 200: "#d6c7ff", 400: "#9a84ff", 500: "#6d5cff", 700: "#5244e3" },
  gray: { bg: "#f6f7f8", ink: "#121212", border: "#e5e7eb", mute: "#6b7280" },
};

// Per‑lens colors
const LENS_COLORS = {
  Knowledge: "#9a84ff",  // secondary-400
  Process:   "#fba48a",  // primary-300
  Metrics:   "#f56a4e",  // primary-500
  Adoption:  "#6d5cff",  // secondary-500
  Automation:"#5244e3",  // secondary-700
};
const lensColor = (lens) => LENS_COLORS[lens] || THEME.gray.mute;

// --- Small UI helpers (plain React + Tailwind)
const Card = ({ children, className = "" }) => (
  <div className={`rounded-2xl shadow-sm border bg-white ${className}`} style={{ borderColor: THEME.gray.border }}>{children}</div>
);
const CardHeader = ({ children }) => (
  <div className="p-4 border-b border-gray-100"><h2 className="text-xl font-semibold">{children}</h2></div>
);
const CardBody = ({ children, className = "" }) => (
  <div className={`p-4 ${className}`}>{children}</div>
);
const Button = ({ children, onClick, type = "button", className = "", disabled }) => (
  <button
    type={type}
    disabled={disabled}
    onClick={onClick}
    className={`px-4 py-2 rounded-2xl border text-sm font-medium hover:shadow transition ${
      disabled ? "opacity-50 cursor-not-allowed" : ""
    } ${className}`}
  >
    {children}
  </button>
);
const Badge = ({ children }) => (
  <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700 border">{children}</span>
);

function download(filename, text) {
  try {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch (e) {
    console.error("download failed", e);
    return false;
  }
}

// Helpers
function questionsWithIds(capability) {
  return capability ? capability.questions.map((q, idx) => ({ ...q, id: String(idx) })) : [];
}

function computeCapMetrics(capability, answersMap) {
  if (!capability) return { sum20:0, avg20:0, max20:0, count:0, capScore100:0, radarData:[], lensView:[] };
  const questions = questionsWithIds(capability);
  let sum20 = 0; let count = 0; const totalCount = questions.length; const max20 = 20 * totalCount;
  // Track lens totals and total questions per lens for proper 0–100 normalization
  const lensTotals = Object.fromEntries(LENSES.map(l => [l, { sum: 0, answered: 0, total: 0, answers: [] }]));
  questions.forEach(q => { if (lensTotals[q.lens]) lensTotals[q.lens].total += 1; });

  questions.forEach((q) => {
    const lvl = answersMap?.[q.id];
    if (lvl && typeof q.scores?.[lvl] === "number") {
      const w = q.scores[lvl]; // 0–20
      sum20 += w; count += 1;
      if (q.lens && lensTotals[q.lens]) {
        lensTotals[q.lens].sum += w;
        lensTotals[q.lens].answered += 1;
        const text = q.options?.[lvl] || lvl;
        lensTotals[q.lens].answers.push({ question: q.text, choice: text, weight20: w });
      }
    }
  });

  // Total capability score as a percentage of the maximum possible
  const capScore100 = max20 ? (sum20 / max20) * 100 : 0;

  const radarData = LENSES.map(lens => {
    const lt = lensTotals[lens];
    const denom = lt.total * 20 || 1;
    return { lens, value: (lt.sum / denom) * 100 };
  });

  const lensView = LENSES.map(lens => {
    const lt = lensTotals[lens];
    const avg100 = (lt.sum / (lt.total * 20 || 1)) * 100;
    return { lens, avg100, answers: lt.answers };
  }).sort((a,b) => a.avg100 - b.avg100);

  return { sum20, avg20: count? sum20/count : 0, max20, count, capScore100, radarData, lensView };
}

export default function App() {
  const [modelSource, setModelSource] = useState("auto");
  const [model, setModel] = useState({ capabilities: [] });
  const [answersByCap, setAnswersByCap] = useState({}); // { [capKey]: { [qid]: level } }
  const [selectedCaps, setSelectedCaps] = useState([]); // which caps are in scope
  const [activeTab, setActiveTab] = useState("setup"); // "setup" | "assessment" | "report"
  const [capIndex, setCapIndex] = useState(0); // index within filtered list

  // Derived lists
  const allCaps = model.capabilities;

  // --- Auto-load model.json from /public on first load (and optional ?model=URL override)
  useEffect(() => {
    let cancelled = false;
    async function tryFetch(url) {
      try {
        const res = await fetch(url, { cache: "no-cache" });
        if (!res.ok) return null;
        const data = await res.json();
        if (Array.isArray(data?.capabilities)) return data;
      } catch {/* ignore */}
      return null;
    }
    async function boot() {
      const params = new URLSearchParams(window.location.search);
      const override = params.get("model");
      const base = (import.meta?.env?.BASE_URL) || "/";
      const candidates = [];
      if (override) candidates.push(override);
      candidates.push(base.replace(/\/$/, "") + "/model.json"); // e.g. /model.json or /app-base/model.json
      candidates.push("/model.json");
      candidates.push("model.json");
      const pathBase = window.location.pathname.replace(/\/$/, "");
      candidates.push(pathBase + "/model.json");

      for (const url of candidates) {
        const data = await tryFetch(url);
        if (data) {
          if (cancelled) return;
          setModel({ capabilities: data.capabilities });
          const keys = data.capabilities.map(c => c.key || "");
          setSelectedCaps(keys);
          setAnswersByCap({});
          setCapIndex(0);
          setActiveTab("setup");
          setModelSource(url);
          return;
        }
      }
      setModelSource("manual");
    }
    boot();
    return () => { cancelled = true; };
  }, []);
  const selectedList = useMemo(() => {
    if (!allCaps.length) return [];
    const keys = new Set(selectedCaps.length ? selectedCaps : allCaps.map(c => c.key || ""));
    return allCaps.filter(c => keys.has(c.key || ""));
  }, [allCaps, selectedCaps]);

  const capability = selectedList[capIndex];
  const capKey = capability?.key || `cap_${capIndex}`;
  const currentAnswers = answersByCap[capKey] || {};
  const questions = useMemo(() => questionsWithIds(capability), [capability]);

  // Metrics for current capability
  const metrics = useMemo(() => computeCapMetrics(capability, currentAnswers), [capability, currentAnswers]);

  // All-capabilities overview (filter to selected)
  const allCapScores = useMemo(() => selectedList.map((cap, idx) => {
    const key = cap.key || `cap_${idx}`;
    const m = computeCapMetrics(cap, answersByCap[key] || {});
    return { key, name: cap.name || key, metrics: m, questions: questionsWithIds(cap) };
  }), [selectedList, answersByCap]);

  const overallSpiderData = useMemo(() => allCapScores.map(c => ({ capability: c.name, value: c.metrics.capScore100 || 0 })), [allCapScores]);

  function setAnswer(qid, level) {
    setAnswersByCap(prev => ({
      ...prev,
      [capKey]: { ...(prev[capKey] || {}), [qid]: level }
    }));
  }
  function resetCurrent() { setAnswersByCap(prev => ({ ...prev, [capKey]: {} })); }

  // Build answers JSON for export/print
  function buildAnswersJSON() {
    const out = {
      exportedAt: new Date().toISOString(),
      modelKeys: allCaps.map(c=>c.key),
      selectedCaps,
      answers: {},
    };
    for (const cap of selectedList) {
      const key = cap.key;
      const qids = questionsWithIds(cap);
      const ansMap = answersByCap[key] || {};
      out.answers[key] = {
        name: cap.name,
        items: qids.map(q => ({
          question: q.text,
          lens: q.lens,
          chosenLevel: ansMap[q.id] || null,
          answerText: ansMap[q.id] ? (q.options?.[ansMap[q.id]] || ansMap[q.id]) : null,
        }))
      };
    }
    return out;
  }

  // Export / Import
  function exportAnswers() {
    const payload = buildAnswersJSON();
    const json = JSON.stringify(payload, null, 2);
    const ok = download("finops_answers_all_caps.json", json);
    if (!ok && navigator?.clipboard) {
      navigator.clipboard.writeText(json).then(()=>{
        alert("Download geblokkeerd — JSON is naar het klembord gekopieerd.");
      }).catch(()=>{
        alert("Kon niet downloaden of kopiëren. Open de console voor de JSON.");
        console.log(json);
      });
    }
  }
  function copyAnswers() {
    const json = JSON.stringify(buildAnswersJSON(), null, 2);
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(json).then(()=> alert("JSON gekopieerd"), ()=> alert("Kopiëren mislukt"));
    } else {
      alert("Clipboard niet beschikbaar");
    }
  }
  function importAnswers(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || typeof data !== "object") throw new Error("Invalid JSON");
        if (data.answers) {
          const merged = {};
          for (const [capKey, payload] of Object.entries(data.answers)) {
            const map = {};
            // We need to map back to qids by matching question text; assumes same model
            const cap = allCaps.find(c=>c.key===capKey);
            if (cap) {
              questionsWithIds(cap).forEach((q, idx)=>{
                const found = (payload.items||[]).find(it=>it.question===q.text);
                if (found && found.chosenLevel) map[q.id] = found.chosenLevel;
              });
            }
            merged[capKey] = map;
          }
          setAnswersByCap(merged);
        }
        if (Array.isArray(data.selectedCaps)) setSelectedCaps(data.selectedCaps);
      } catch (e) { alert("Kon antwoorden niet inlezen: " + e.message); }
    };
    reader.readAsText(file);
  }
  function importModel(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.capabilities)) throw new Error("Invalid JSON shape");
        setModel({ capabilities: data.capabilities });
        const keys = data.capabilities.map(c => c.key || "");
        setSelectedCaps(keys); // default select all
        setAnswersByCap({});
        setCapIndex(0);
        setActiveTab("setup");
      } catch (e) { alert("Kon model niet inlezen: " + e.message); }
    };
    reader.readAsText(file);
  }

  // Setup tab helpers
  function toggleCap(k) {
    setSelectedCaps(prev => prev.includes(k) ? prev.filter(x => x!==k) : [...prev, k]);
  }
  function selectAll() { setSelectedCaps(allCaps.map(c => c.key || "")); }
  function clearAll() { setSelectedCaps([]); }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="shrink-0 w-9 h-9 rounded-2xl bg-black text-white grid place-items-center overflow-hidden">
            {/* Logo slot; falls back to MVP if asset not found */}
            <img src="Logo black-2.svg" alt="logo" className="w-9 h-9 object-contain" onError={(e)=>{e.currentTarget.outerHTML='MVP'}} />
          </div>
          <div>
            <h1 className="text-lg font-semibold">FinOps – Setup · Assessment · Report</h1>
            <p className="text-xs text-gray-500">{modelSource!=="manual" ? `Model: auto geladen (${modelSource})` : "Geen automatisch model gevonden – gebruik Import Model."}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <label className="px-3 py-2 rounded-2xl border bg-white cursor-pointer text-sm">
              Import Model
              <input type="file" accept=".json,application/json" className="hidden" onChange={(e)=> e.target.files && e.target.files[0] && importModel(e.target.files[0])} />
            </label>
            <label className="px-3 py-2 rounded-2xl border bg-white cursor-pointer text-sm">
              Import Answers
              <input type="file" accept=".json,application/json" className="hidden" onChange={(e)=> e.target.files && e.target.files[0] && importAnswers(e.target.files[0])} />
            </label>
            <Button onClick={exportAnswers} className="border-gray-300 bg-white">Export Answers</Button>
            <Button onClick={copyAnswers} className="border-gray-300 bg-white">Copy JSON</Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 grid gap-4">
        {allCaps.length > 0 ? (
          <>
            {/* Tabs */}
            <div className="bg-gray-100 rounded-2xl p-1 w-fit">
              <button onClick={() => setActiveTab("setup")} className={`px-3 py-1 rounded-xl text-sm ${activeTab==="setup"?"bg-white border": ""}`}>Setup</button>
              <button onClick={() => setActiveTab("assessment")} className={`px-3 py-1 rounded-xl text-sm ${activeTab==="assessment"?"bg-white border": ""}`}>Assessment</button>
              <button onClick={() => setActiveTab("report")} className={`px-3 py-1 rounded-xl text-sm ${activeTab==="report"?"bg-white border": ""}`}>Report</button>
            </div>

            {/* SETUP TAB */}
            {activeTab === "setup" && (
              <Card>
                <CardHeader>Welke capabilities wil je bevragen?</CardHeader>
                <CardBody>
                  <div className="flex items-center gap-2 mb-3">
                    <Button onClick={selectAll}>Selecteer alles</Button>
                    <Button onClick={clearAll}>Leegmaken</Button>
                    <span className="text-sm text-gray-500">Geselecteerd: {selectedList.length} / {allCaps.length}</span>
                  </div>
                  <div className="grid md:grid-cols-3 gap-2">
                    {allCaps.map((c) => (
                      <label key={c.key} className="flex items-center gap-2 border rounded-2xl p-2 bg-white">
                        <input type="checkbox" checked={selectedCaps.includes(c.key)} onChange={() => toggleCap(c.key)} />
                        <span className="text-sm">{c.name}</span>
                      </label>
                    ))}
                  </div>
                </CardBody>
              </Card>
            )}

            {/* ASSESSMENT TAB */}
            {activeTab === "assessment" && (
              <>
                {selectedList.length === 0 ? (
                  <Card><CardBody><p className="text-sm text-gray-600">Selecteer eerst capabilities in de tab <b>Setup</b>.</p></CardBody></Card>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="text-sm text-gray-600">Capability:</div>
                      <select className="border rounded-xl px-2 py-1 text-sm" value={capIndex} onChange={(e)=> { setCapIndex(Number(e.target.value)); }}>
                        {selectedList.map((c, idx) => (
                          <option key={c.key||idx} value={idx}>{c.name || c.key}</option>
                        ))}
                      </select>
                      <div className="ml-auto">
                        <Button onClick={resetCurrent} className="border-gray-300 bg-white">Reset (huidige cap)</Button>
                      </div>
                    </div>

                    {capability && (
                      <>
                        <Card>
                          <CardHeader>{capability.name}</CardHeader>
                          <CardBody>
                            <p className="text-sm text-gray-700 mb-2">{capability.description}</p>
                          </CardBody>
                        </Card>

                        <Card>
                          <CardHeader>
                            <div className="flex items-center justify-between">
                              <span>Vragen</span>
                              <Badge>Lens: Knowledge · Process · Metrics · Adoption · Automation</Badge>
                            </div>
                          </CardHeader>
                          <CardBody>
                            <div className="grid gap-3">
                              {questions.map((q) => (
                                <div key={q.id} className="p-3 rounded-2xl border bg-white">
                                  <div className="flex items-start gap-2">
                                    <div className="flex-1">
                                      <p className="font-medium">{q.text}</p>
                                      {q.lens && (
                                        <p className="text-xs text-gray-500 mt-1">Lens: <Badge>{q.lens}</Badge></p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="mt-3 grid gap-2">
                                    {LEVELS.map((level) => (
                                      q.options && q.options[level] ? (
                                        <label key={level} className={`block border rounded-2xl p-3 cursor-pointer hover:shadow ${currentAnswers[q.id]===level?"ring-2 ring-black bg-gray-50":"bg-white"}`}>
                                          <input type="radio" name={`q_${capKey}_${q.id}`} value={level} className="hidden" onChange={()=>setAnswer(q.id, level)} checked={currentAnswers[q.id]===level} />
                                          <div className="text-sm text-gray-800">{q.options[level]}</div>
                                        </label>
                                      ) : null
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardBody>
                        </Card>
                      </>
                    )}
                  </>
                )}
              </>
            )}

            {/* REPORT TAB */}
            {activeTab === "report" && (
              <>
                {/* OVERALL SPIDER across selected capabilities (0–100, TOTALS not average) */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="text-2xl font-semibold">Overall maturity (0–100)</div>
                      <div className="text-xs text-gray-500">Totale score per capability = (som weging / max) × 100</div>
                    </div>
                  </CardHeader>
                  <CardBody>
                    <div className="h-[520px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart data={overallSpiderData} outerRadius="80%">
                          <PolarGrid />
                          <PolarAngleAxis dataKey="capability" tick={{ fontSize: 11 }} />
                          <PolarRadiusAxis domain={[0,100]} />
                          <Tooltip formatter={(v)=> (typeof v === 'number' ? `${v.toFixed(1)} / 100` : v)} labelFormatter={(l)=> `${l}`} />
                          <Radar dataKey="value" name="Capability (0–100)" stroke={THEME.secondary[700]} fill={THEME.secondary[400]} fillOpacity={0.25} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardBody>
                </Card>

                {/* PER-CAPABILITY LENS VIEWS + SMALL BAR CHART */}
                <Card>
                  <CardHeader>
                    <div className="text-lg font-semibold">Per capability – Lens breakdown (0–100)</div>
                  </CardHeader>
                  <CardBody>
                    <div className="grid lg:grid-cols-2 gap-4">
                      {allCapScores.map(({ key, name, metrics }) => (
                        <div key={key} className="rounded-2xl border p-3 bg-gray-50">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-sm font-semibold">{name}</div>
                            <div className="text-sm font-bold">{metrics.capScore100.toFixed(1)} / 100</div>
                          </div>

                          {/* Mini bar chart per lens (multi-color) */}
                          <div className="h-[220px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={metrics.radarData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="lens" angle={-25} textAnchor="end" height={50} />
                                <YAxis domain={[0,100]} />
                                <Tooltip formatter={(v, n, p)=> `${typeof v==='number'?v.toFixed(1):v} / 100`} />
                                <Bar dataKey="value" name="0–100" radius={[10,10,0,0]}>
                                  {metrics.radarData.map((r) => (
                                    <Cell key={r.lens} fill={lensColor(r.lens)} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardBody>
                </Card>

                {/* Printable Answers */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="text-lg font-semibold">Answers (printable)</div>
                      <div className="flex items-center gap-2">
                        <Button onClick={()=>window.print()}>Print</Button>
                        <Button onClick={exportAnswers}>Download JSON</Button>
                        <Button onClick={copyAnswers}>Copy JSON</Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardBody>
                    <div className="grid gap-4">
                      {allCapScores.map(({ key, name, questions }) => (
                        <div key={key} className="rounded-xl border p-3">
                          <div className="font-semibold mb-2">{name}</div>
                          <ol className="list-decimal pl-5 space-y-1 text-sm">
                            {questions.map((q) => {
                              // find chosen answer text
                              const chosenLevel = (answersByCap[key]||{})[q.id];
                              const text = chosenLevel ? (q.options?.[chosenLevel] || chosenLevel) : "—";
                              return (
                                <li key={q.id}>
                                  <span className="text-gray-800">{q.text}</span>
                                  <div className="text-gray-600 text-xs">Lens: {q.lens || '—'} • Antwoord: <b>{text}</b></div>
                                </li>
                              );
                            })}
                          </ol>
                        </div>
                      ))}
                    </div>
                  </CardBody>
                </Card>
              </>
            )}
          </>
        ) : (
          <Card>
            <CardHeader>Start hier</CardHeader>
            <CardBody>
              <p className="text-sm text-gray-600">
                Importeer eerst je <b>JSON-model</b> (gegenereerd uit de Excel-template). Daarna kies je in <b>Setup</b> de capabilities, vul je <b>Assessment</b> in en bekijk je <b>Report</b>.
              </p>
            </CardBody>
          </Card>
        )}
      </main>

      <footer className="max-w-7xl mx-auto px-4 py-6 text-xs text-gray-500">
        <p>Nieuw: multi‑color lens bars, tooltip op spider, robuuste export (download + copy), en een printbare antwoordenlijst. Spider gebruikt de <b>totale</b> score per capability (niet het gemiddelde).</p>
      </footer>
    </div>
  );
}
