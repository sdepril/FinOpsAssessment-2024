import React, { useMemo, useState, useEffect, useRef } from "react";
// ---- Constants
const APP_NAME = "FinOps Maturity Index";
const MODEL_VERSION_FALLBACK = "1.3";
const SNAP_KEY = "finops_cache_history_v1";
const BRAND_KEY = "finops_brand_v1";
const MODEL_HASH_KEY = "finops_auto_model_hash_v1";

const LEVELS = ["Pre-crawl", "Crawl", "Walk", "Run", "Fly"];
const LENSES = ["Knowledge", "Process", "Metrics", "Adoption", "Automation"];

// Lens palette used for option tints and, later, graphs
const LENS_COLORS = ["#8b5cf6", "#f59e0b", "#ef4444", "#6366f1", "#3b82f6"]; // Knowledge, Process, Metrics, Adoption, Automation

// Lens color styles for options & badges
const LENS_STYLE = {
  Knowledge: { color: "#8b5cf6", tint: "rgba(139,92,246,0.12)" },
  Process:   { color: "#f59e0b", tint: "rgba(245,158,11,0.12)" },
  Metrics:   { color: "#ef4444", tint: "rgba(239,68,68,0.12)" },
  Adoption:  { color: "#6366f1", tint: "rgba(99,102,241,0.12)" },
  Automation:{ color: "#3b82f6", tint: "rgba(59,130,246,0.12)" },
  Default:   { color: "#111827", tint: "rgba(17,24,39,0.06)" },
};
const getLensStyle = (lens) => LENS_STYLE[lens] || LENS_STYLE.Default;

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
const prettyDate = (iso) => { try { return new Date(iso).toLocaleString(); } catch { return iso; } };
function maturityFromScore(avg100) {
  if (avg100 < 10) return { key: "Pre-crawl", emoji: "👶" };
  if (avg100 < 30) return { key: "Crawl", emoji: "🐢" };
  if (avg100 < 55) return { key: "Walk", emoji: "🚶" };
  if (avg100 < 80) return { key: "Run", emoji: "🏃" };
  return { key: "Fly", emoji: "🦸" };
}

function Thermometer({ value }){
  const items = ["Pre-crawl","Crawl","Walk","Run","Fly"];
  return (
    <div className="my-3 print:break-inside-avoid">
      <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
        {items.map((k)=> <span key={k}>{k}</span>)}
      </div>
      <div className="h-3 rounded-full bg-gray-200 relative overflow-hidden">
        <div className="absolute inset-y-0 left-0 bg-black/10" style={{width:`20%`}}></div>
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

// --- Charts (SVG) ---
function SpiderLite({ data, size = 360 }) {
  if (!data || !data.length) return <div className="text-sm text-gray-600">No data.</div>;
  const N = data.length;
  const cx = size / 2, cy = size / 2;
  const r = (size / 2) - 28; // margin for labels
  const toRad = (deg) => (deg * Math.PI) / 180;
  const maxAt = (i) => {
    const angle = -90 + (360 / N) * i;
    const rad = toRad(angle);
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const pt = (i) => {
    const d = data[i];
    const ratio = Math.max(0, Math.min(1, (d.total || 0) / (d.fullMark || 1)));
    const angle = -90 + (360 / N) * i;
    const rad = toRad(angle);
    const rr = r * ratio;
    return { x: cx + rr * Math.cos(rad), y: cy + rr * Math.sin(rad) };
  };
  const gridSteps = 4;
  const rings = Array.from({ length: gridSteps }, (_, k) => (k + 1) / gridSteps);
  const poly = data.map((_, i) => {
    const p = pt(i);
    return `${p.x},${p.y}`;
  }).join(" ");

  const labelFont = N > 18 ? 9 : (N > 12 ? 10 : 11);
  const labelOffset = Math.max(10, Math.min(22, r * 0.06));

  return (
    <svg width={size} height={size} role="img" style={{ overflow: 'visible' }}>
      <g>
        {rings.map((f, idx) => (
          <circle key={idx} cx={cx} cy={cy} r={r * f} fill="none" stroke="#E5E7EB" />
        ))}
        {Array.from({ length: N }).map((_, i) => {
          const m = maxAt(i);
          return <line key={i} x1={cx} y1={cy} x2={m.x} y2={m.y} stroke="#E5E7EB" />
        })}
        <polygon points={poly} fill="rgba(17,24,39,0.2)" stroke="#111827" />
        {data.map((d, i) => {
          const m = maxAt(i);
          const angle = -90 + (360 / N) * i;
          const rad = toRad(angle);
          const lx = m.x + Math.cos(rad) * labelOffset;
          const ly = m.y + Math.sin(rad) * labelOffset;
          return <text key={i} x={lx} y={ly} fontSize={labelFont} textAnchor="middle" fill="#374151">{d.subject}</text>
        })}
      </g>
    </svg>
  );
}

function computeSpiderSize(N, containerWidth = 800) {
  // Scale with number of capabilities, but respect container width and a sensible max
  const desired = 24 * N + 280; // 22 caps -> ~808px
  const maxByContainer = Math.max(360, Math.min((containerWidth - 32), 1000));
  return Math.max(420, Math.min(desired, maxByContainer));
}

function SpiderAuto({ data }) {
  const ref = useRef(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const setWidth = () => setW(el.clientWidth || 640);
    setWidth();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => setWidth());
      ro.observe(el);
      return () => ro.disconnect();
    } else {
      window.addEventListener('resize', setWidth);
      return () => window.removeEventListener('resize', setWidth);
    }
  }, []);
  const size = computeSpiderSize(data?.length || 0, w);
  return (
    <div ref={ref} className="w-full flex justify-center">
      <SpiderLite data={data} size={size} />
    </div>
  );
}

function LensBarsLite({ items }) {
  if (!items || !items.length) return null;
  return (
    <div className="space-y-2">
      {items.map((it, idx) => (
        <div key={idx}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span>{it.label}</span>
            <span className="text-gray-500">{Math.round(it.value)}%</span>
          </div>
          <div className="h-3 rounded-full bg-gray-200 overflow-hidden">
            <div className="h-3" style={{ width: `${Math.max(0, Math.min(100, it.value))}%`, background: it.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Simple dev self-tests rendered in Admin (since no formal test runner here)
function runDevTests() {
  const tests = [];
  const t = (name, fn) => { try { fn(); tests.push({ name, pass: true }); } catch(e){ tests.push({ name, pass: false, msg: String(e) }); } };
  t("maturityFromScore: 0 => Pre-crawl", ()=>{ if (maturityFromScore(0).key !== "Pre-crawl") throw new Error("expected Pre-crawl"); });
  t("maturityFromScore: 29 => Crawl",     ()=>{ if (maturityFromScore(29).key !== "Crawl") throw new Error("expected Crawl"); });
  t("maturityFromScore: 54 => Walk",      ()=>{ if (maturityFromScore(54).key !== "Walk") throw new Error("expected Walk"); });
  t("maturityFromScore: 79 => Run",       ()=>{ if (maturityFromScore(79).key !== "Run") throw new Error("expected Run"); });
  t("maturityFromScore: 95 => Fly",       ()=>{ if (maturityFromScore(95).key !== "Fly") throw new Error("expected Fly"); });
  t("getLensStyle: unknown lens => Default", ()=>{ const s = getLensStyle("Foo"); if (!s || s.color !== LENS_STYLE.Default.color) throw new Error("fallback failed"); });
  t("computeSpiderSize growth", ()=>{ if (!(computeSpiderSize(22, 1200) > computeSpiderSize(6, 1200))) throw new Error("should grow with N"); });
  return tests;
}

export default function App() {
  const [activeTab, setActiveTab] = useState("setup");

  // model structure expected:
  // { version: "1.x", capabilities: [ { key, name, description, report_group, questions: [ { id?, text, lens, options: {...}, scores: {...} } ] } ] }
  const [model, setModel] = useState(null);
  const [modelSource, setModelSource] = useState("manual");
  const [selectedCaps, setSelectedCaps] = useState([]); // capability keys
  const [answersByCap, setAnswersByCap] = useState({}); // {capKey: {questionIndex: LEVEL}}
  const [meta, setMeta] = useState({ date: new Date().toISOString().slice(0,10), customer: "", assessor: "" });

  // Branding (logos), persisted to localStorage
  const [brand, setBrand] = useState(() => {
    try { return JSON.parse(localStorage.getItem(BRAND_KEY)) || { costraLogo: "", partnerLogo: "" }; }
    catch { return { costraLogo: "", partnerLogo: "" }; }
  });
  useEffect(()=>{ localStorage.setItem(BRAND_KEY, JSON.stringify(brand)); }, [brand]);
  function onLogoFile(which, file){ const r = new FileReader(); r.onload = () => setBrand(prev => ({...prev, [which]: r.result})); r.readAsDataURL(file); }
  function removeLogo(which){ setBrand(prev => ({...prev, [which]: ""})); }

  // Assessment focus + Lens section state
  const [currentCapKey, setCurrentCapKey] = useState(null);
  const [lensCapKey, setLensCapKey] = useState(null);
  const [lensOpen, setLensOpen] = useState(false);

  // derived
  const allCaps = model?.capabilities || [];
  const selectedCapsSafe = selectedCaps.length ? selectedCaps : allCaps.map(c => c.key);

  // Keep currentCapKey / lensCapKey in sync with selection
  useEffect(() => {
    if (selectedCapsSafe.length) {
      if (!currentCapKey || !selectedCapsSafe.includes(currentCapKey)) {
        setCurrentCapKey(selectedCapsSafe[0]);
      }
      if (!lensCapKey || !selectedCapsSafe.includes(lensCapKey)) {
        setLensCapKey(selectedCapsSafe[0]);
      }
    } else {
      setCurrentCapKey(null);
      setLensCapKey(null);
    }
  }, [model, selectedCapsSafe.join('|')]);

  // Compute report
  const report = useMemo(() => {
    if (!model) return null;

    // capability totals (sum of question weights 0..20)
    const capTotals = allCaps
      .filter(c => selectedCapsSafe.includes(c.key))
      .map(cap => {
        let sum20 = 0;
        const lensTotals = LENSES.reduce((acc, l) => (acc[l] = { sum: 0, answered: 0, answers: [] }, acc), {});

        cap.questions.forEach((q, idx) => {
          const lvl = answersByCap?.[cap.key]?.[idx];
          const w = (lvl && typeof q.scores?.[lvl] === "number") ? q.scores[lvl] : null; // 0..20
          if (typeof w === "number") {
            sum20 += w;
            if (q.lens && lensTotals[q.lens]) {
              lensTotals[q.lens].sum += w;
              lensTotals[q.lens].answered += 1;
              const text = q.options?.[lvl] || lvl;
              lensTotals[q.lens].answers.push({ question: q.text, choice: text, weight20: w, level: lvl });
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
    const spiderData = capTotals.map((c) => ({ subject: c.name, total: c.sum20, fullMark: c.max20 }));

    // overall lens trend across all capabilities (people perspective)
    const lensAgg = LENSES.reduce((acc, l) => (acc[l] = { sum: 0, answered: 0 }, acc), {});
    capTotals.forEach(c => {
      LENSES.forEach(l => {
        const tt = c.lensTotals[l];
        if (tt) { lensAgg[l].sum += tt.sum; lensAgg[l].answered += tt.answered; }
      });
    });
    const lensOverview = LENSES.map((l, i) => {
      const a = lensAgg[l];
      const value = a.answered ? (a.sum / (a.answered * 20)) * 100 : 0;
      return { label: l, value, color: LENS_COLORS[i] };
    });

    return { capTotals, overallAvgCapScore100, spiderData, lensOverview };
  }, [model, selectedCapsSafe.join("|"), JSON.stringify(answersByCap)]);

  // Auto-load model.json from /public once (and reset if it changed)
  useEffect(() => {
    (async () => {
      try {
        if (model) return; // don't override a manually imported model in-session
        const res = await fetch('/model.json', { cache: 'no-store' });
        if (!res.ok) return;
        const text = await res.text();
        const obj = JSON.parse(text);
        if (!obj?.capabilities) return;
        // compute a stable hash of file contents; fallback to length+version if subtle crypto not available
        let hash = '';
        try {
          const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
          hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
        } catch {
          hash = `len:${text.length}|ver:${obj.version||''}`;
        }
        const prev = localStorage.getItem(MODEL_HASH_KEY);
        setModel(obj);
        setModelSource('public/model.json');
        if (hash !== prev) {
          localStorage.setItem(MODEL_HASH_KEY, hash);
          setSelectedCaps(obj.capabilities.map(c=>c.key));
          setAnswersByCap({});
        }
      } catch (_) { /* ignore auto-load errors */ }
    })();
  }, []);

  // --- Mechanics
  function importJSONFile(file, handler) {
    const reader = new FileReader();
    reader.onload = () => { try { handler(JSON.parse(String(reader.result))); } catch (e) { alert("Invalid JSON: " + e.message); } };
    reader.readAsText(file);
  }
  function importModel(file) {
    importJSONFile(file, (obj) => {
      if (!obj?.capabilities) { alert("Model must have a `capabilities` array."); return; }
      setModel(obj); setModelSource(file.name); setSelectedCaps(obj.capabilities.map(c => c.key)); setActiveTab("setup");
    });
  }
  function importAnswers(file) {
    importJSONFile(file, (obj) => {
      try { if (obj.selectedCaps) setSelectedCaps(obj.selectedCaps); if (obj.meta) setMeta(obj.meta); if (obj.answersByCap) setAnswersByCap(obj.answersByCap); setActiveTab("report"); } catch (e) { alert("Could not import answers: " + e.message); }
    });
  }
  function buildAnswersJSON(){
    const out = { appName: APP_NAME, exportedAt: new Date().toISOString(), modelVersion: model?.version || MODEL_VERSION_FALLBACK, meta, modelKeys: allCaps.map(c=>c.key), selectedCaps: selectedCapsSafe, answersByCap };
    return out;
  }
  function exportAnswers(){ const blob = new Blob([JSON.stringify(buildAnswersJSON(), null, 2)], {type: "application/json"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="finops-maturity-answers.v1.3.json"; a.click(); URL.revokeObjectURL(a.href); }
  async function copyAnswers(){ try { await navigator.clipboard.writeText(JSON.stringify(buildAnswersJSON(), null, 2)); alert("Copied to clipboard."); } catch(e){ alert("Copy failed: "+e.message);} }
  function printAnswers(){ window.print(); }

  // Snapshots
  function loadSnapshots(){ try { return JSON.parse(localStorage.getItem(SNAP_KEY) || "[]"); } catch { return []; } }
  function saveSnapshots(list){ localStorage.setItem(SNAP_KEY, JSON.stringify(list)); }
  function saveSnapshot(){ const entry = { id: crypto.randomUUID(), ts: new Date().toISOString(), version: model?.version || MODEL_VERSION_FALLBACK, customer: meta.customer || "", assessor: meta.assessor || "", selectedCaps: selectedCapsSafe, answersByCap, meta }; const list = loadSnapshots(); list.unshift(entry); saveSnapshots(list); alert("Snapshot saved."); }
  function restoreSnapshot(id){ const list = loadSnapshots(); const found = list.find(x=>x.id===id); if(!found){ alert("Snapshot not found"); return;} setSelectedCaps(found.selectedCaps || []); setAnswersByCap(found.answersByCap || {}); setMeta(found.meta || meta); setActiveTab("report"); }
  function deleteSnapshot(id){ const list = loadSnapshots(); saveSnapshots(list.filter(x=>x.id!==id)); }

  // Helpers for Setup/Assessment
  function toggleCap(key){ setSelectedCaps(prev => prev.includes(key) ? prev.filter(x=>x!==key) : [...prev, key]); }
  function selectAll(){ setSelectedCaps(allCaps.map(c=>c.key)); }
  function clearAll(){ setSelectedCaps([]); }
  function setAnswer(capKey, qIndex, level){
    setAnswersByCap(prev => ({
      ...prev,
      [capKey]: { ...(prev[capKey] || {}), [qIndex]: level }
    }));
  }

  // Derived helpers for Assessment focus
  const currentCap = allCaps.find(c => c.key === currentCapKey) || null;
  const currentTotalQ = currentCap ? currentCap.questions.length : 0;
  const currentAnswered = currentCap ? Object.keys(answersByCap[currentCapKey] || {}).length : 0;
  const gotoPrev = () => {
    if (!selectedCapsSafe.length) return;
    const idx = selectedCapsSafe.indexOf(currentCapKey);
    const nextIdx = idx <= 0 ? selectedCapsSafe.length - 1 : idx - 1;
    setCurrentCapKey(selectedCapsSafe[nextIdx]);
  };
  const gotoNext = () => {
    if (!selectedCapsSafe.length) return;
    const idx = selectedCapsSafe.indexOf(currentCapKey);
    const nextIdx = idx === -1 ? 0 : (idx + 1) % selectedCapsSafe.length;
    setCurrentCapKey(selectedCapsSafe[nextIdx]);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Print helpers */}
      <style>{`
<<<<<<< HEAD
        @media print { .print\\:hidden { display: none !important; } .print\\:break-inside-avoid { break-inside: avoid; } .no-print-bg { background: white !important; } }
=======
<<<<<<< HEAD
        @media print { .print\\:hidden { display: none !important; } .print\\:break-inside-avoid { break-inside: avoid; } .no-print-bg { background: white !important; } }
=======
        @media print { .print\:hidden { display: none !important; } .print\:break-inside-avoid { break-inside: avoid; } .no-print-bg { background: white !important; } }
>>>>>>> 19a258ac46118e209d224bab33f7578f8e8dcba3
>>>>>>> 7420733a14896e7e19f72086aa2b9d80e0e68460
      `}</style>

      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur bg-white/80 border-b print:hidden">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="shrink-0 w-10 h-10 rounded-2xl bg-black text-white grid place-items-center overflow-hidden">
            {/* Visible logo (fallback to C) */}
            <img src="/Logo black-2.svg" alt="Costra" className="w-10 h-10 object-contain" onError={(e)=>{e.currentTarget.outerHTML='C';}} />
          </div>
          {/* Left nav: Setup / Assessment / Report */}
          <div className="flex items-center gap-2">
            <Button onClick={()=>setActiveTab("setup")} className={activeTab==="setup" ? "bg-white" : ""}>Setup</Button>
            <Button onClick={()=>setActiveTab("assessment")} className={activeTab==="assessment" ? "bg-white" : ""}>Assessment</Button>
            <Button onClick={()=>setActiveTab("report")} className={activeTab==="report" ? "bg-white" : ""}>Report</Button>
          </div>
          <div className="min-w-0 ml-4">
            <h1 className="text-lg font-semibold truncate">{APP_NAME}</h1>
            <p className="text-xs text-gray-500 truncate">{model ? `Model: ${model.version || MODEL_VERSION_FALLBACK} (${modelSource})` : "No model loaded — use Admin to import"}</p>
          </div>
          {/* Right: Admin */}
          <div className="ml-auto flex items-center gap-2">
            <Button onClick={()=>setActiveTab("admin")} className={activeTab==="admin" ? "bg-white" : ""}>Admin</Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4">
        {/* ADMIN (separate tab) */}
        {activeTab==="admin" && (
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
                  <div className="text-sm bg-gray-50 rounded-xl p-4 border">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-0.5 rounded-full text-white bg-black text-xs">V1.3</span>
                      <span className="text-xs text-gray-500">Updated {new Date().toLocaleDateString()}</span>
                    </div>
                    <div className="text-gray-800 font-medium mb-1">What changed</div>
                    <ul className="list-disc pl-5 space-y-1 text-gray-700">
                      <li>Admin split into a <b>separate tab</b>.</li>
                      <li><b>Setup</b> meta fields (date, customer, assessor@costra.io) and clearer CTAs.</li>
                      <li><b>Assessment</b> per capability with <i>Prev/Next</i> navigation.</li>
                      <li><b>Report</b>: multi‑color lens bars, <b>SVG spider</b>, and a printable <b>maturity thermometer</b>.</li>
                      <li><b>Lens insights</b>: overall lens trend across all capabilities + capability picker to zoom in.</li>
                      <li><b>Snapshots</b> (save/restore/delete) in localStorage; export now includes <code>appName</code>.</li>
                      <li><b>Branding</b>: Costra + optional partner logo; footer renders <i>Powered by Costra together with Partner</i> (only when partner is set).</li>
                      <li>Cleaner print layout and minor UI polish.</li>
                    </ul>
                  </div>
                </div>

                {/* Snapshots + Dev tests */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold">Cache history</div>
                    <Button onClick={saveSnapshot}>Save snapshot</Button>
                  </div>
                  <table className="w-full text-xs border rounded-2xl overflow-hidden mb-4">
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

                  {/* Dev tests output */}
                  <div className="text-xs">
                    <div className="font-semibold mb-1">Dev self-tests</div>
                    <ul className="space-y-1">
                      {runDevTests().map((t,i)=> (
                        <li key={i} className={t.pass?"text-green-700":"text-red-700"}>
                          {t.pass ? "✓" : "✗"} {t.name}{t.msg?`: ${t.msg}`:""}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Branding */}
              <div className="mt-6">
                <div className="font-semibold mb-2">Branding</div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm font-medium mb-1">Costra logo</div>
                    <div className="flex items-center gap-3">
                      <label className="px-3 py-2 rounded-2xl border bg-white cursor-pointer text-sm">Upload
                        <input type="file" accept="image/*" className="hidden" onChange={(e)=> e.target.files && e.target.files[0] && onLogoFile('costraLogo', e.target.files[0])} />
                      </label>
                      <img src={brand.costraLogo || '/Logo black-2.svg'} alt="Costra" className="h-8 object-contain" />
                      {brand.costraLogo && (<Button onClick={()=>removeLogo('costraLogo')} className="border-gray-300 bg-white">Clear</Button>)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium mb-1">Partner logo</div>
                    <div className="flex items-center gap-3">
                      <label className="px-3 py-2 rounded-2xl border bg-white cursor-pointer text-sm">Upload
                        <input type="file" accept="image/*" className="hidden" onChange={(e)=> e.target.files && e.target.files[0] && onLogoFile('partnerLogo', e.target.files[0])} />
                      </label>
                      {brand.partnerLogo ? (
                        <img src={brand.partnerLogo} alt="Partner" className="h-8 object-contain" />
                      ) : (
                        <span className="text-xs text-gray-500">No partner logo</span>
                      )}
                      {brand.partnerLogo && (<Button onClick={()=>removeLogo('partnerLogo')} className="border-gray-300 bg-white">Clear</Button>)}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-gray-600 mt-2">Logos are stored locally in your browser and used in the footer.</div>
              </div>

            </CardBody>
          </Card>
        )}

        {/* SETUP */}
        {activeTab==="setup" && (
          <>
            <Card className="mb-4">
              <CardHeader>Setup</CardHeader>
              <CardBody>
                <div className="grid md:grid-cols-3 gap-3">
                  <label className="text-sm">Date
                    <input type="date" className="mt-1 w-full border rounded-xl px-3 py-2" value={meta.date} onChange={e=>setMeta(m=>({...m, date:e.target.value}))} />
                  </label>
                  <label className="text-sm">Customer
                    <input type="text" placeholder="the one who will give his cloud bill nightmares" className="mt-1 w-full border rounded-xl px-3 py-2" value={meta.customer} onChange={e=>setMeta(m=>({...m, customer:e.target.value}))} />
                  </label>
                  <label className="text-sm">Assessment taken by
                    <div className="mt-1 flex items-center border rounded-xl overflow-hidden">
                      <input type="text" placeholder="voornaam.naam" className="flex-1 px-3 py-2 outline-none" value={meta.assessor} onChange={e=>setMeta(m=>({...m, assessor:e.target.value}))} />
                      <span className="px-3 py-2 text-gray-500 bg-gray-50 border-l">@costra.io</span>
                    </div>
                  </label>
                </div>

                <div className="mt-4">
                  <p className="text-gray-700 mb-3">This assessment follows the guidelines of the FinOps Foundation.</p>
                  <div className="flex flex-wrap gap-3">
                    <a href="https://www.finops.org/" target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl text-white bg-violet-600 hover:bg-violet-700">FinOps Foundation</a>
                    <a href="https://www.costra.io/" target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl text-white bg-black hover:bg-gray-800">Costra</a>
                  </div>
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
            {model && (
              <>
                <Card className="mb-4">
                  <CardHeader>Assessment</CardHeader>
                  <CardBody>
                    <div className="flex flex-wrap items-center gap-2 mb-3 text-sm">
                      <label className="text-gray-600">Capability</label>
                      <select
                        className="border rounded-xl px-3 py-2"
                        value={currentCapKey || ''}
                        onChange={(e)=>setCurrentCapKey(e.target.value)}
                      >
                        {selectedCapsSafe.map(k => {
                          const c = allCaps.find(x=>x.key===k);
                          return <option key={k} value={k}>{c ? c.name : k}</option>;
                        })}
                      </select>
                      <Button onClick={gotoPrev}>← Prev</Button>
                      <Button onClick={gotoNext}>Next →</Button>
                      <span className="text-gray-500">{currentAnswered} / {currentTotalQ} answered</span>
                    </div>
                    {!currentCap && (
                      <div className="text-sm text-gray-600">Select at least one capability in Setup.</div>
                    )}
                    {currentCap && (
                      <div className="space-y-3">
                        {currentCap.questions.map((q, idx) => {
                          const selectedLevel = answersByCap?.[currentCap.key]?.[idx];
                          const ls = getLensStyle(q.lens);
                          return (
                            <div key={idx} className="p-3 rounded-xl border">
                              <div className="font-medium">{q.text}</div>
                              {q.lens ? (
                                <div className="mb-2">
                                  <span
                                    className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs"
                                    title={selectedLevel || ''}
                                    style={{ borderColor: ls.color, backgroundColor: ls.tint, color: ls.color }}
                                  >
                                    {q.lens}
                                  </span>
                                </div>
                              ) : null}
                              <div className="space-y-2">
                                {LEVELS.map(level => {
                                  const selected = selectedLevel === level;
                                  return (
                                    <label key={level} className="block">
                                      <input
                                        type="radio"
                                        name={`q-${currentCap.key}-${idx}`}
                                        value={level}
                                        className="hidden"
                                        onChange={()=>setAnswer(currentCap.key, idx, level)}
                                        checked={selected}
                                      />
                                      <div
                                        className="rounded-full border px-4 py-3 text-sm transition-colors"
                                        style={{
                                          borderColor: selected ? ls.color : "#E5E7EB",
                                          backgroundColor: selected ? ls.tint : "#FFFFFF",
                                          color: "#111827",
                                        }}
                                      >
                                        {q.options?.[level] || level}
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardBody>
                </Card>
              </>
            )}
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

                {/* Spider */}
                <Card className="mb-4">
                  <CardHeader>Spider by capability</CardHeader>
                  <CardBody>
                    <SpiderAuto data={report.spiderData} />
                  </CardBody>
                </Card>

                {/* Lens insights (collapsible) */}
                <Card className="mb-4">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <span>Lens insights</span>
                      <Button onClick={()=>setLensOpen(o=>!o)} className="bg-white">{lensOpen ? 'Hide' : 'Show'}</Button>
                    </div>
                  </CardHeader>
                  {lensOpen && (
                    <CardBody>
                      <div className="mb-6">
                        <div className="font-semibold mb-2">Overall trend (all capabilities)</div>
                        <LensBarsLite items={report.lensOverview} />
                      </div>
                      <div className="border-t my-4"></div>
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="font-semibold">Capability focus</div>
                          <select className="border rounded-xl px-3 py-2" value={lensCapKey || ''} onChange={(e)=>setLensCapKey(e.target.value)}>
                            {selectedCapsSafe.map(k => {
                              const c = allCaps.find(x=>x.key===k);
                              return <option key={k} value={k}>{c ? c.name : k}</option>;
                            })}
                          </select>
                        </div>
                        {(() => {
                          const c = report.capTotals.find(x => x.capKey === lensCapKey);
                          if (!c) return <div className="text-sm text-gray-600">Select a capability.</div>;
                          const items = LENSES.map((l, i) => {
                            const tt = c.lensTotals[l];
                            const value = tt && tt.answered ? (tt.sum / (tt.answered * 20)) * 100 : 0;
                            return { label: l, value, color: LENS_COLORS[i] };
                          });
                          return <LensBarsLite items={items} />;
                        })()}
                      </div>
                    </CardBody>
                  )}
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
                          <div className="mb-2 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="font-semibold">{cap.name}</div>
                              <div className="text-sm">
                                {(() => {
                                  const agg = report.capTotals.find(x => x.capKey === cap.key);
                                  const m = maturityFromScore(agg?.capScore100 || 0);
                                  return (
                                    <span className="inline-flex items-center gap-1">
                                      <span>{m.emoji}</span>
                                      <span className="font-medium">{m.key}</span>
                                      <span className="text-gray-500 ml-2">{agg ? agg.capScore100.toFixed(1) : "0.0"} / 100</span>
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>
                            <div>
                              {(() => {
                                const agg = report.capTotals.find(x => x.capKey === cap.key);
                                if (!agg) return null;
                                const items = LENSES.map((l, i) => {
                                  const tt = agg.lensTotals[l];
                                  const value = tt && tt.answered ? (tt.sum / (tt.answered * 20)) * 100 : 0;
                                  return { label: l, value, color: LENS_COLORS[i] };
                                });
                                return <LensBarsLite items={items} />;
                              })()}
                            </div>
                          </div>
                   <table className="w-full text-sm border rounded-xl overflow-hidden">
  <thead className="bg-gray-50">
    <tr>
      <th className="p-2 text-left">Question</th>
      <th className="p-2 text-left">Lens</th>
      <th className="p-2 text-left">Answer</th>
    </tr>
  </thead>
  <tbody>
    {cap.questions.map((q, idx) => (
      <tr key={idx} className="odd:bg-white even:bg-gray-50">
        <td className="p-2">{q.text}</td>
        <td className="p-2">
          {q.lens ? (
            <span
              className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs"
              title={ans?.[idx] || ''}
              style={{
                borderColor: getLensStyle(q.lens).color,
                backgroundColor: getLensStyle(q.lens).tint,
                color: getLensStyle(q.lens).color
              }}
            >
              {q.lens}
            </span>
          ) : (
            "-"
          )}
        </td>
        <td className="p-2">
          {(() => {
            const level = ans?.[idx];
            if (!level)
              return <span className="text-gray-400">–</span>;
            const text = q.options?.[level] || level;
            const ls = getLensStyle(q.lens);
            return (
              <div>
                <span
                  className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs mr-2"
                  style={{
                    borderColor: ls.color,
                    backgroundColor: ls.tint,
                    color: ls.color
                  }}
                >
                  {level}
                </span>
                <span>{text}</span>
              </div>
            );
          })()}
        </td>
      </tr>
    ))}
  </tbody>
</table>

