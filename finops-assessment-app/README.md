
# FinOps Maturity Index — v1.3

Single‑file React app (Vite) to run a **FinOps Maturity** assessment, capture answers, and generate a printable report with a spider chart, lens trends, and an overall maturity thermometer.

> App ID: `FinOps Maturity Index`  
> Primary entry: `src/App.jsx`  
> Default model source: `public/model.json` (auto‑loaded)

---

## ✨ What’s in v1.3

- **Admin as separate tab** (no more slide‑out drawer)
- **Setup**: Date, Customer, *Assessor@costra.io* meta
- **Assessment**: per‑capability flow with Prev/Next; lens‑tinted options
- **Report**:
  - **Spider** (SVG) per capability *(uses total score per capability — not the average)*
  - **Lens trends**: overall (all capabilities) + picker to focus one capability
  - **Maturity thermometer** with labels: _Pre‑crawl_, _Crawl_, _Walk_, _Run_, _Fly_
  - **Printable answers** including chosen level text
- **Branding**: show **Powered by Costra** and optional **together with Partner** logo
- **Snapshots**: save/restore/delete to `localStorage` (and robust Export/Copy JSON)
- Auto‑load and hash‑check of `public/model.json` with safe reset on change

---

## 🧰 Quick start

```bash
# Node 18+ recommended
npm ci          # or: npm install
npm run dev     # start Vite dev server
npm run build   # production build
```

### Deploy (Vercel)
- Link the repo to Vercel, framework preset **Vite**.  
- If you hit a weird build after a big refactor, try **"Redeploy → Clear build cache"**.

---

## 📁 Project structure (minimal)

```
public/
  model.json              # default questionnaire (auto-loaded)
  Logo black-2.svg        # Costra logo fallback
src/
  App.jsx                 # the entire app (this file)
index.html                # Vite entry
```

---

## 📄 Model schema (`public/model.json`)

The app expects a JSON like this:

```jsonc
{
  "version": "1.3",
  "capabilities": [
    {
      "key": "allocation",
      "name": "Allocation",
      "description": "Chargeback/showback model ...",
      "report_group": "Core",
      "questions": [
        {
          "text": "How comprehensive is your organization's knowledge ...?",
          "lens": "Knowledge",                // Knowledge | Process | Metrics | Adoption | Automation
          "options": {
            "Pre-crawl": "No knowledge ...",
            "Crawl": "Basic awareness ...",
            "Walk": "Moderate understanding ...",
            "Run": "Strong org‑wide knowledge ...",
            "Fly": "Advanced knowledge ..."
          },
          "scores": {                         // 0..20 per level → used to compute totals/percentages
            "Pre-crawl": 0,
            "Crawl": 5,
            "Walk": 10,
            "Run": 15,
            "Fly": 20
          }
        }
      ]
    }
  ]
}
```

**Notes**
- Lens must be exactly one of: `Knowledge | Process | Metrics | Adoption | Automation` (for colors).
- The **spider** uses the **sum of question weights** per capability (`0..20` each), not the average.
- If `model.json` changes, the app detects it (content hash) and resets selections/answers safely.

---

## 🔄 Auto‑load behaviour

On first load the app fetches `/model.json` with `cache: no-store`, calculates a content hash, and:
- `MODEL_HASH_KEY = finops_auto_model_hash_v1` in `localStorage`
- If the hash **differs**, it resets `selectedCaps` and `answersByCap` to match the new model

You can still import a different model via **Admin → Import Model** (overrides the auto‑loaded one for the current session).

---

## 📝 Data & storage

### Export format (answers)
- **Menu**: Admin → Export Answers / Copy JSON
- Includes `appName`, `exportedAt`, `modelVersion`, `meta`, `selectedCaps`, `answersByCap`

```json
{
  "appName": "FinOps Maturity Index",
  "exportedAt": "2025-08-08T20:24:18.123Z",
  "modelVersion": "1.3",
  "meta": { "date": "2025-08-08", "customer": "ACME", "assessor": "stijn" },
  "modelKeys": ["allocation","budgeting", "..."],
  "selectedCaps": ["allocation","budgeting"],
  "answersByCap": {
    "allocation": { "0": "Walk", "1": "Run", "2": "Crawl" },
    "budgeting":  { "0": "Walk" }
  }
}
```

### Snapshots (history)
- **Keys**: `finops_cache_history_v1`  
- Each snapshot: `{ id, ts, version, customer, assessor, selectedCaps, answersByCap, meta }`
- Restore jumps straight to **Report** with the selected snapshot state

### Branding
- **Key**: `finops_brand_v1`  
- `{ costraLogo: dataURL, partnerLogo: dataURL }` (stored locally only).  
- Footer shows: **Powered by Costra** and *(only if partnerLogo present)* **together with [Partner]**.

---

## 📊 Scoring & visuals

- **Maturity thermometer** tiers (based on overall average of capability percentages):
  - `< 10` → **Pre‑crawl** 👶
  - `< 30` → **Crawl** 🐢
  - `< 55` → **Walk** 🚶
  - `< 80` → **Run** 🏃
  - `≥ 80` → **Fly** 🦸
- **Spider** auto‑scales to the number of selected capabilities (labels stay readable up to 22).
- **Lens bars** appear:
  - Overall (across all capabilities)
  - Per capability (average of answered questions for that lens)

---

## 🧩 Admin functions

- **Import Model**: replace current model (session‑only; auto‑load remains for next visit)
- **Import Answers**: loads exported JSON
- **Export Answers / Copy JSON / Print answers**
- **Save snapshot**: pushes entry to history table (localStorage)
- **Branding**: upload Costra logo & optional partner logo (dataURLs, local only)

---

## 🧪 Dev self‑tests

Minimal assertions are rendered in Admin under **Dev self‑tests** to sanity‑check core functions
(e.g., maturity tier mapping, spider sizing logic, lens style fallback).

---

## 🐛 Troubleshooting

### ❌ “Expected identifier but found `<`” (Vercel / esbuild)
Er zitten **merge‑conflict markers** in je broncode, bv. `<<<<<<< HEAD`, `=======`, `>>>>>>>`.
Oplossing:
```bash
git grep -nE '^(<<<<<<<|=======|>>>>>>>)'
# open & fix (houd één versie over, verwijder de markers)
npm run build
```

### ❌ “SyntaxError: Expecting Unicode escape sequence \uXXXX”
Komt doorgaans door een losse backslash of een verkeerd ge‑escape‑de string.  
Zoek naar `\` die geen geldige escape zijn in string‑/template‑literals.

### ❌ “Syntax error 'n' … at App.jsx:659:76”
Dat is meestal een literal `\n` die per ongeluk buiten een string terecht kwam.  
Check de regels rondom het gemelde locatienummer en verwijder/escape correct.

### ❌ Model wordt niet geladen
- Bestaat `public/model.json` en is het geldige JSON?
- Browser devtools → Network: is `/model.json` 200 OK?
- Herlaad met `Disable cache` of verwijder `localStorage[finops_auto_model_hash_v1]`

### Vercel build blijft “plakken”
Try **Redeploy → Clear build cache** in Vercel.

---

## 🖨️ Print‑tips

- Browser “Print background graphics” aanzetten voor beste resultaat
- Thermometer + logos worden mee geprint
- Antwoordenlijst is “print‑friendly” (breekt niet midden in een capability‑blok)

---

## 🔐 Notes on data
Alle antwoorden/snapshots/branding worden **lokaal** in de browser opgeslagen (localStorage).  
Er is geen backend of tracking.

---

## 🗺️ Roadmap (suggesties)
- Authored model library (versiebeheer + kiezen)
- CSV export
- Grouped report sections per **report_group**
- Shareable state via URL (base64) of Gist

---

## 📜 License
Copyright © Costra. Internal tool; usage per engagement.

