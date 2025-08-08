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

/**
 * FinOps Maturity Index — App.jsx (V1.3)
 * Implements:
 * - Header with title + visible logo
 * - Tabs: Start (renamed from Setup), Assessment, Report
 * - Start tab: meta header (Date, Customer, Assessor@costra.io) + links to FinOps.org & Costra.io
 * - Admin panel: mechanics (import/export/copy/print answers), changelog, snapshot history (localStorage finops_cache_history_v1)
 * - Maturity thermometer with label (👶 🐢 🚶 🏃 🦸) — also prints
 * - Spider (RadarChart) uses TOTAL score per capability (not the average) with tooltip
 * - Multi-color lens bars
 * - Export JSON includes appName + meta
 */

// ---- Constants
const APP_NAME = "FinOps Maturity Index";
const MODEL_VERSION_FALLBACK = "1.3";
const SNAP_KEY = "finops_cache_history_v1";

const LEVELS = ["Pre-crawl", "Crawl", "Walk", "Run", "Fly"];
const LENSES = ["Knowledge", "Process", "Metrics", "Adoption", "Automation"];

// Palette for multi-color lens bars
const LENS_COLORS = ["#111827", "#6B7280", "#9CA3AF", "#D1D5DB", "#374151"];

// Lightweight UI atoms
const Card = ({ children, className = "" }) => (
  <div className={`rounded-2xl shadow-sm border bg-white ${className}`} style={{ borderColor: "#E5E7EB" }}>{children}</div>
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
    className={`px-3 py-2 rounded-2xl border ${disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"} ${className}`}
  >{children}</button>
);

// Helpers
const prettyDate = (iso) => {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
};

function maturityFromScore(avg100) {
  if (avg100 < 10) return { key: "Pre-crawl", emoji: "👶" };
  if (avg100 < 30) return { key: "Crawl", emoji: "🐢" };
  if (avg100 < 55) return { key: "Walk", emoji: "🚶" };
  if (avg100 < 80) return { key: "Run", emoji: "🏃" };
  return { key: "Fly", emoji: "🦸" };
}

function Thermometer({ value }){
  const items = ["Pre-crawl","Crawl","Walk","Run","Fly"];
  const idx = value < 10 ? 0 : value < 30 ? 1 : value < 55 ? 2 : value < 80 ? 3 : 4;
  return (
    <div className="my-3 print:break-inside-avoid">
      <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
        {items.map((k)=> <span key={k}>{k}</span>)}
      </div>
      <div className="h-3 rounded-full bg-gray-200 relative overflow-hidden">
        <div className="absolute inset-y-0 left-0 bg-black/10" style={{width:`20%`}}></div>
        <div className="absolute inset-y-0 left:" style={{display:"none"}}></div>
        <div className="absolute inset-y-0 left-[20%] bg-black/15" style={{width:`20%`}}></div>
        <div className="absolute inset-y-0 left-[40%] bg-black/20" style={{width:`20%`}}></div>
        <div className="absolute inset-y-0 left-[60%] bg-black/25" style={{width:`20%`}}></div>
        <div className="absolute inset-y-0 left-0 bg-black/70" style={{width:`${Math.max(0, Math.min(100, value))}%`}}></div>
      </div>
      <div className="text-sm mt-1">
        {(() => { const m = maturityFromScore(value); return <span className="font-medium">{m.emoji} {m.key}</span>; })()}
        <span className="text-gray-500"> · Overall {Math.round(value)} / 100</span>
      </div>
    </div>
  );
}

// --- Main App
export default function App() {
  const [activeTab, setActiveTab] = useState("setup"); // labels will say "Start"
  const [adminOpen, setAdminOpen] = useState(false);

  // model structure expected:
  // { version: "1.x", capabilities: [ { key, name, description, report_group, questions: [ { id?, text, lens, options: {...}, scores: {...} } ] } ] }
  const [model, setModel] = useState(null);
  const [modelSource, setModelSource] = useState("manual");
  const [selectedCaps, setSelectedCaps] = useState([]); // capability keys
  const [answersByCap, setAnswersByCap] = useState({}); // {capKey: {questionIndex: LEVEL}}
  const [meta, setMeta] = useState({
    date: new Date().toISOString().slice(0,10),
    customer: "",
    assessor: ""
  });

  // derived
  const allCaps = model?.capabilities || [];
  const selectedCapsSafe = selectedCaps.length ? selectedCaps : allCaps.map(c => c.key);

  // Compute scores
  const report = useMemo(() => {
    if (!model) return null;

    // capability totals (sum of question weights 0..20)
    const capTotals = allCaps
      .filter(c => selectedCapsSafe.includes(c.key))
      .map(cap => {
        let sum20 = 0;
        let count = 0;
        const lensTotals = LENSES.reduce((acc, l) => (acc[l] = { sum: 0, answered: 0, answers: [] }, acc), {});

        cap.questions.forEach((q, idx) => {
          const lvl = answersByCap?.[cap.key]?.[idx];
          const w = (lvl && typeof q.scores?.[lvl] === "number") ? q.scores[lvl] : null; // 0..20
          if (typeof w === "number") {
            sum20 += w; count += 1;
            if (q.lens && lensTotals[q.lens]) {
              lensTotals[q.lens].sum += w;
              lensTotals[q.lens].answered += 1;
              const text = q.options?.[lvl] || lvl;
              lensTotals[q.lens].answers.push({ question: q.text, choice: text, weight20: w });
            }
          }
        });

        const max20 = Math.max(1, cap.questions.length * 20);
        const capScore100 = (sum20 / max20) * 100;

        return { capKey: cap.key, name: cap.name, sum20, max20, capScore100, lensTotals };
      });

    // overall
    const overallAvgCapScore100 = capTotals.length
      ? capTotals.reduce((a,c) => a + c.capScore100, 0) / capTotals.length
      : 0;

    // spider (TOTAL per cap, not average)
    const spiderData = capTotals.map((c) => ({
      subject: c.name,
      total: c.sum20, // TOTAL, not %
      fullMark: c.max20,
    }));

    // lens bars (aggregate across selected caps)
    const lensAgg = LENSES.map(l => ({ lens: l, sum20: 0, max20: 0 }));
    capTotals.forEach(c => {
      LENSES.forEach((l, i) => {
        const tt = c.lensTotals[l];
        if (tt) {
          lensAgg[i].sum20 += tt.sum;
          // assume max20 per lens is proportional to answered * 20 (only count answered for %)
          lensAgg[i].max20 += (tt.answered || 0) * 20;
        }
      });
    });
    const lensBars = lensAgg.map((x, i) => ({
      lens: x.lens,
      value100: x.max20 ? Math.round((x.sum20 / x.max20) * 100) : 0,
      color: LENS_COLORS[i % LENS_COLORS.length],
    }));

    return { capTotals, overallAvgCapScore100, spiderData, lensBars };
  }, [model, selectedCapsSafe.join("|"), JSON.stringify(answersByCap)]);

  // --- Mechanics (moved behind Admin)
  function importJSONFile(file, handler) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result));
        handler(obj);
      } catch (e) {
        alert("Invalid JSON: " + e.message);
      }
    };
    reader.readAsText(file);
  }

  function importModel(file) {
    importJSONFile(file, (obj) => {
      if (!obj?.capabilities) {
        alert("Model must have a `capabilities` array.");
        return;
      }
      setModel(obj);
      setModelSource(file.name);
      // Preselect all
      setSelectedCaps(obj.capabilities.map(c => c.key));
      setActiveTab("setup");
    });
  }

  function importAnswers(file) {
    importJSONFile(file, (obj) => {
      try {
        if (obj.selectedCaps) setSelectedCaps(obj.selectedCaps);
        if (obj.meta) setMeta(obj.meta);
        if (obj.answersByCap) setAnswersByCap(obj.answersByCap);
        setActiveTab("report");
      } catch (e) {
        alert("Could not import answers: " + e.message);
      }
    });
  }

  function buildAnswersJSON(){
    const out = {
      appName: APP_NAME,
      exportedAt: new Date().toISOString(),
      modelVersion: model?.version || MODEL_VERSION_FALLBACK,
      meta,
      modelKeys: allCaps.map(c=>c.key),
      selectedCaps: selectedCapsSafe,
      answersByCap,
    };
    return out;
  }

  function exportAnswers(){
    const payload = buildAnswersJSON();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type: "application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "finops-maturity-answers.v1.3.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function copyAnswers(){
    try {
      await navigator.clipboard.writeText(JSON.stringify(buildAnswersJSON(), null, 2));
      alert("Copied to clipboard.");
    } catch (e) {
      alert("Copy failed: " + e.message);
    }
  }

  function printAnswers(){
    window.print();
  }

  // --- Snapshot history (separate from any rolling cache you might have)
  function loadSnapshots(){ try { return JSON.parse(localStorage.getItem(SNAP_KEY) || "[]"); } catch { return []; } }
  function saveSnapshots(list){ localStorage.setItem(SNAP_KEY, JSON.stringify(list)); }

  function saveSnapshot(){
    const payload = buildAnswersJSON();
    const entry = {
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      version: payload.modelVersion,
      customer: meta.customer || "",
      assessor: meta.assessor || "",
      selectedCaps: selectedCapsSafe,
      answersByCap,
      meta
    };
    const list = loadSnapshots();
    list.unshift(entry);
    saveSnapshots(list);
    alert("Snapshot saved.");
  }

  function restoreSnapshot(id){
    const list = loadSnapshots();
    const found = list.find(x=>x.id===id);
    if(!found){ alert("Snapshot not found"); return; }
    setSelectedCaps(found.selectedCaps || []);
    setAnswersByCap(found.answersByCap || {});
    setMeta(found.meta || meta);
    setActiveTab("report");
  }

  function deleteSnapshot(id){
    const list = loadSnapshots();
    saveSnapshots(list.filter(x=>x.id!==id));
  }

  // --- UI helpers for Start/Assessment
  const allSelected = selectedCapsSafe.length === allCaps.length;
  function toggleCap(key){
    setSelectedCaps(prev => prev.includes(key) ? prev.filter(x=>x!==key) : [...prev, key]);
  }
  function selectAll(){ setSelectedCaps(allCaps.map(c=>c.key)); }
  function clearAll(){ setSelectedCaps([]); }

  function setAnswer(capKey, qIndex, level){
    setAnswersByCap(prev => ({ ...prev, [capKey]: { ...(prev[capKey] || {}), [qIndex]: level } }));
  }

  // --- Render
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Print helpers */}
      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          .print\\:break-inside-avoid { break-inside: avoid; }
          .no-print-bg { background: white !important; }
        }
      `}</style>

      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur bg-white/80 border-b print:hidden">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="shrink-0 w-10 h-10 rounded-2xl bg-black text-white grid place-items-center overflow-hidden">
            {/* Visible logo (fallback to C) */}
            <img src="/Logo black-2.svg" alt="Costra" className="w-10 h-10 object-contain" onError={(e)=>{e.currentTarget.outerHTML='C';}} />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold truncate">{APP_NAME}</h1>
            <p className="text-xs text-gray-500 truncate">{model ? `Model: ${model.version || MODEL_VERSION_FALLBACK} (${modelSource})` : "No model loaded — use Admin to import"}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button onClick={()=>setActiveTab("setup")} className={activeTab==="setup" ? "bg-white" : ""}>Start</Button>
            <Button onClick={()=>setActiveTab("assessment")} className={activeTab==="assessment" ? "bg-white" : ""}>Assessment</Button>
            <Button onClick={()=>setActiveTab("report")} className={activeTab==="report" ? "bg-white" : ""}>Report</Button>
            <Button onClick={()=>setAdminOpen(v=>!v)} className="border-gray-300 bg-white">{adminOpen? "Close Admin":"Admin"}</Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4">

        {/* Admin panel */}
        {adminOpen && (
          <Card>
            <CardHeader>Admin</CardHeader>
            <CardBody>
              <div className="grid md:grid-cols-3 gap-4">
                {/* Mechanics */}
                <div>
                  <div className="font-semibold mb-2">Mechanics</div>
                  <div className="flex flex-wrap gap-2">
                    <label className="px-3 py-2 rounded-2xl border bg-white cursor-pointer text-sm">Import Model
                      <input type="file" accept=".json,application/json" className="hidden" onChange={(e)=> e.target.files && e.target.files[0] && importModel(e.target.files[0])} />
                    </label>
                    <label className="px-3 py-2 rounded-2xl border bg-white cursor-pointer text-sm">Import Answers
                      <input type="file" accept=".json,application/json" className="hidden" onChange={(e)=> e.target.files && e.target.files[0] && importAnswers(e.target.files[0])} />
                    </label>
                    <Button onClick={exportAnswers} className="border-gray-300 bg-white">Export Answers</Button>
                    <Button onClick={copyAnswers} className="border-gray-300 bg-white">Copy JSON</Button>
                    <Button onClick={printAnswers} className="border-gray-300 bg-white">Print answers</Button>
                  </div>
                </div>

                {/* Changelog */}
                <div>
                  <div className="font-semibold mb-2">Changelog</div>
                  <div className="text-xs text-gray-600 bg-gray-50 rounded-xl p-3 border">
                    <p>Nieuw: multi‑color lens bars, tooltip op spider, robuuste export (download + copy), en een printbare antwoordenlijst. Spider gebruikt de <b>totale</b> score per capability (niet het gemiddelde).</p>
                  </div>
                </div>

                {/* Snapshots */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold">Cache history</div>
                    <Button onClick={saveSnapshot}>Save snapshot</Button>
                  </div>
                  <table className="w-full text-xs border rounded-xl overflow-hidden">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="p-2 text-left">Date/Time</th>
                        <th className="p-2 text-left">Version</th>
                        <th className="p-2 text-left">Customer</th>
                        <th className="p-2 text-left">Assessor</th>
                        <th className="p-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadSnapshots().map(row => (
                        <tr key={row.id} className="odd:bg-white even:bg-gray-50">
                          <td className="p-2 whitespace-nowrap">{prettyDate(row.ts)}</td>
                          <td className="p-2">{row.version}</td>
                          <td className="p-2">{row.customer}</td>
                          <td className="p-2">{row.assessor}</td>
                          <td className="p-2 text-right">
                            <Button onClick={()=>restoreSnapshot(row.id)} className="mr-2">Restore</Button>
                            <Button onClick={()=>deleteSnapshot(row.id)} className="border-red-300 text-red-600 bg-white">Delete</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardBody>
          </Card>
        )}

        {/* START (renamed label from Setup) */}
        {activeTab==="setup" && (
          <>
            <Card className="mb-4">
              <CardHeader>Start</CardHeader>
              <CardBody>
                <div className="grid md:grid-cols-3 gap-3">
                  <label className="text-sm">Date
                    <input type="date" className="mt-1 w-full border rounded-xl px-3 py-2" value={meta.date} onChange={e=>setMeta(m=>({...m, date:e.target.value}))} />
                  </label>
                  <label className="text-sm">Customer
                    <input type="text" placeholder="Acme Health" className="mt-1 w-full border rounded-xl px-3 py-2" value={meta.customer} onChange={e=>setMeta(m=>({...m, customer:e.target.value}))} />
                  </label>
                  <label className="text-sm">Assessment taken by
                    <div className="mt-1 flex items-center border rounded-xl overflow-hidden">
                      <input type="text" placeholder="voornaam.naam" className="flex-1 px-3 py-2 outline-none" value={meta.assessor} onChange={e=>setMeta(m=>({...m, assessor:e.target.value}))} />
                      <span className="px-3 py-2 text-gray-500 bg-gray-50 border-l">@costra.io</span>
                    </div>
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-sm">
                  <span className="text-gray-600">Deze Assessment volgt de richtlijnen van de FinOps Foundation.</span>
                  <a href="https://www.finops.org/" target="_blank" rel="noreferrer" className="px-3 py-1 rounded-xl border bg-white">FinOps.org</a>
                  <a href="https://www.costra.io/" target="_blank" rel="noreferrer" className="px-3 py-1 rounded-xl border bg-white">Costra.io</a>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>Select capabilities</CardHeader>
              <CardBody>
                {!model && (
                  <div className="text-sm text-gray-600">
                    No model loaded. Open <b>Admin</b> and use <i>Import Model</i> to load a questionnaire.
                  </div>
                )}
                {model && (
                  <>
                    <div className="mb-2 flex items-center gap-2 text-sm">
                      <Button onClick={selectAll}>Select all</Button>
                      <Button onClick={clearAll}>Clear</Button>
                      <span className="text-gray-500">{selectedCapsSafe.length} / {allCaps.length} selected</span>
                    </div>
                    <div className="grid md:grid-cols-2 gap-2">
                      {allCaps.map(cap => (
                        <label key={cap.key} className={`flex items-start gap-3 p-3 rounded-xl border ${selectedCapsSafe.includes(cap.key) ? "bg-white" : "bg-gray-50"}`}>
                          <input type="checkbox" className="mt-1" checked={selectedCapsSafe.includes(cap.key)} onChange={()=>toggleCap(cap.key)} />
                          <div>
                            <div className="font-medium">{cap.name}</div>
                            <div className="text-xs text-gray-600">{cap.description || cap.report_group}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </CardBody>
            </Card>
          </>
        )}

        {/* ASSESSMENT */}
        {activeTab==="assessment" && (
          <>
            {!model && (
              <Card><CardBody>No model loaded. Use Admin → Import Model.</CardBody></Card>
            )}
            {model && selectedCapsSafe.map(capKey => {
              const cap = allCaps.find(c=>c.key===capKey);
              if (!cap) return null;
              return (
                <Card key={cap.key} className="mb-4">
                  <CardHeader>{cap.name}</CardHeader>
                  <CardBody>
                    <div className="space-y-3">
                      {cap.questions.map((q, idx) => (
                        <div key={idx} className="p-3 rounded-xl border">
                          <div className="font-medium">{q.text}</div>
                          <div className="text-xs text-gray-500 mb-2">{q.lens ? `Lens: ${q.lens}` : ""}</div>
                          <div className="flex flex-wrap gap-2">
                            {LEVELS.map(level => (
                              <label key={level} className={`px-2 py-1 rounded-lg border text-xs cursor-pointer ${answersByCap?.[cap.key]?.[idx]===level ? "bg-black text-white" : "bg-white"}`}>
                                <input type="radio" name={`q-${cap.key}-${idx}`} value={level} className="hidden"
                                  onChange={()=>setAnswer(cap.key, idx, level)} checked={answersByCap?.[cap.key]?.[idx]===level} />
                                {q.options?.[level] || level}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </>
        )}

        {/* REPORT */}
        {activeTab==="report" && (
          <>
            {!model && (
              <Card><CardBody>No model loaded. Use Admin → Import Model.</CardBody></Card>
            )}
            {model && report && (
              <>
                {/* Maturity thermometer */}
                <Card className="mb-4">
                  <CardHeader>Maturity</CardHeader>
                  <CardBody>
                    <Thermometer value={report.overallAvgCapScore100} />
                  </CardBody>
                </Card>

                {/* Spider (Radar) — TOTAL per cap + Tooltip */}
                <Card className="mb-4">
                  <CardHeader>Spider by capability (total score)</CardHeader>
                  <CardBody>
                    <div style={{ width: "100%", height: 320 }}>
                      <ResponsiveContainer>
                        <RadarChart data={report.spiderData}>
                          <PolarGrid />
                          <PolarAngleAxis dataKey="subject" />
                          <PolarRadiusAxis />
                          <Tooltip />
                          <Radar name="Total" dataKey="total" stroke="#111827" fill="#111827" fillOpacity={0.25} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardBody>
                </Card>

                {/* Lens bars (multi-color) */}
                <Card className="mb-4">
                  <CardHeader>Lens health</CardHeader>
                  <CardBody>
                    <div style={{ width: "100%", height: 300 }}>
                      <ResponsiveContainer>
                        <BarChart data={report.lensBars}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="lens" />
                          <YAxis domain={[0, 100]} />
                          <Tooltip />
                          <Bar dataKey="value100">
                            {report.lensBars.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardBody>
                </Card>

                {/* Printable answers list */}
                <Card className="mb-4">
                  <CardHeader>Answers</CardHeader>
                  <CardBody>
                    {selectedCapsSafe.map(capKey => {
                      const cap = allCaps.find(c=>c.key===capKey);
                      if (!cap) return null;
                      const ans = answersByCap?.[cap.key] || {};
                      return (
                        <div key={cap.key} className="mb-4 print:break-inside-avoid">
                          <div className="font-semibold mb-2">{cap.name}</div>
                          <table className="w-full text-sm border rounded-xl overflow-hidden">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="p-2 text-left">Question</th>
                                <th className="p-2 text-left">Chosen level</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cap.questions.map((q, idx) => (
                                <tr key={idx} className="odd:bg-white even:bg-gray-50">
                                  <td className="p-2">{q.text}</td>
                                  <td className="p-2">{ans?.[idx] || "-"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </CardBody>
                </Card>
              </>
            )}
          </>
        )}

      </main>

      {/* Footer (prints as well) */}
      <footer className="max-w-7xl mx-auto px-4 py-6 text-xs text-gray-500 text-center print:text-black">
        <div className="flex items-center justify-center gap-2">
          <span>Powered by</span>
          <img src="/Logo black-2.svg" alt="Costra" className="h-4 object-contain" onError={(e)=>{e.currentTarget.style.display='none';}} />
        </div>
      </footer>
    </div>
  );
}
