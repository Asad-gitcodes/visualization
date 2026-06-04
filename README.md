# Cerebras Inference Perf Explorer

A performance projection explorer for Cerebras inference sweeps. Upload one or more `.xlsx` sweep files to visualize, compare, and validate model performance across traffic profiles and batch sizes.

**Live URL:** _[add Vercel URL after deploy]_

---

## Features

- **Drag-and-drop upload** of any number of `Model_X_profile_N.xlsx` sweep files — no config changes needed for new models
- **Customer / PM view**: Go/No-Go decision cards with per-profile SLO thresholds, TTFT, Gen Speed, RPM charts
- **Engineer view**: anomaly detection (throughput monotonicity, TTFT spikes, maxMs≠targetMs), cached vs uncached breakdown, hardware efficiency chart, full raw data table
- **Comparison mode**: filter by model and traffic profile to compare sweeps side-by-side
- **Configurable SLO thresholds**: per-profile defaults with global override via the Settings panel
- **Sample data**: click "Load Sample Data" to pre-load 5 profiles from the shipped dataset

---

## Install & Run

**Requirements:** Node.js 18+

```bash
cd "task 1"
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deploy to Vercel

```bash
npm install -g vercel
vercel --prod
```

Or connect this repo in the Vercel dashboard — no configuration needed, Next.js is auto-detected.

---

## Data Format

Each `.xlsx` file must have a single sheet (`Summary`) with the following layout:

| Row | Content |
|-----|---------|
| 1 | Empty or metadata |
| 2 | Column headers (must include "Batch Size", "Throughput (t/s)", "TTFT (ms)", etc.) |
| 3+ | Data rows — one per batch size. Input Length / Output Length / Cache % only need to appear in the first data row; subsequent rows may leave them blank. |

**Expected columns** (order flexible, matched by substring):

- `Input Length`, `Output Length`, `Cache %`
- `Batch Size`
- `Max number of milliseconds`, `Target Max number of milliseconds`
- `Prompt only Throughput (t/s)`, `Gen only Throughput (t/s)`
- `Throughput (t/s)`, `Throughput / box (t/s/hardware)`
- `Uncached Throughput (t/s)`, `Uncached Throughput / box (t/s/hardware)`
- `Cached Throughput (t/s)`, `Cached Throughput / box (t/s/hardware)`
- `TTFT (ms)`
- `Real Prompt Speed (t/s/user)`, `Prompt Speed with Queueing (t/s/user)`, `Gen Speed (t/s/user)`
- `RPM`

**File naming convention** (used to extract model and profile labels):

```
Model_<Name>_profile_<N>.xlsx
Model <Name> profile <N>.xlsx   ← spaces also accepted
```

Examples: `Model A profile 1.xlsx`, `Model_L_profile_3.xlsx`.

Unknown profile numbers (e.g. Profile 8) display as "Profile 8" with no description — no code changes required.

---

## SLO Thresholds

Go/No-Go decisions use **per-profile defaults** based on use-case latency tolerance:

| Profile | Use Case | TTFT SLO | Gen Speed SLO |
|---------|----------|----------|---------------|
| P1 | Long-ctx RAG | 200 ms | 20 t/s |
| P2 | Long-form Gen | 50 ms | 30 t/s |
| P3 | Balanced | 30 ms | 50 t/s |
| P4 | Conversational | 30 ms | 50 t/s |
| P5 | Doc Processing | 100 ms | 20 t/s |
| P6 | Large-Doc Analysis | 200 ms | 20 t/s |
| P7 | Complex Gen | 50 ms | 30 t/s |

**Rationale:** Human reading speed ≈ 15 t/s. Interactive profiles target 3× reading speed (50 t/s). Streaming profiles target 2× (30 t/s). Batch/RAG profiles are less latency-sensitive (20 t/s). TTFT SLOs reflect the difference between a user waiting for a chat reply (30ms perceptible threshold) vs. waiting for a document analysis result (200ms tolerable).

Global overrides are available via the Settings panel in the Customer view — useful for customer-specific SLA negotiations.

---

## Tech Stack

- [Next.js 16](https://nextjs.org) (App Router)
- [SheetJS / xlsx](https://sheetjs.com) — client-side Excel parsing, no server needed
- [Recharts](https://recharts.org) — charts
- [Tailwind CSS v4](https://tailwindcss.com)
- [Lucide React](https://lucide.dev) — icons
