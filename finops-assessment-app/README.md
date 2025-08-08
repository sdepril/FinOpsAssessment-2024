# FinOps Assessment App (Vite + React)

Single-page webapp to run a FinOps capability/lens assessment, visualize results (spider + per-lens bars), and export/import answers.

## Local dev

```bash
npm i
npm run dev
```

Open http://localhost:5173 and **Import Model** (use `public/model.json` to test).

## Build

```bash
npm run build
npm run preview
```

## Deploy

### Easiest: Vercel
- Import this repo in Vercel, framework = Vite. No extra config.

### GitHub Pages
We set `base` from an env var so the app works under `/REPO_NAME/`:

```bash
VITE_BASE=/<your-repo-name>/ npm run build
```

Then publish the `dist/` folder as Pages (or keep the included GH Action).

### Included GitHub Action
A workflow is included at `.github/workflows/deploy.yml` that builds with the correct base and deploys to Pages on every push to `main`.

## Notes
- Tailwind classes are used; Tailwind is included and pre-configured.
- Recharts provides the spider + bar charts.
- **Export Answers** downloads JSON; **Import Answers** restores selection + answers.
