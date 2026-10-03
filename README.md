# FarmWise / District IQ — Chennai Collector dashboard

Everything for the project is in this repo: the web app, the data collectors, the curated
district_intel store, generated datasets and the docs.

| Folder | What it is |
|---|---|
| `chennai-grievance-portal-main/` | Next.js web app: citizen portal, Collector console, `/officer` department consoles, Ask District IQ |
| `district_intel/` | Python pipeline that builds the curated store (`output/district_intel.db`) the dashboard reads |
| `imd_weather_collector/`, `cpcb_air_quality_collector/`, `cfm_dss_collector/`, `chennai_hospital_data/`, `chennai_news_pipeline/` | Data collectors with their collected data |
| `pwd_dataset_generator/`, `police_dataset_generator/` | Synthetic dataset generators with their output |
| `docs/` | Project report, demo script, slides |

## Quick start: the website on your PC with the team's AWS data

No MySQL and no Python: the data comes from the team's AWS account and is refreshed every hour.

1. Install **Node.js 22** (22.13 or newer) and **Git**.
2. Download the code **without** the large files (about 1 GB the website does not need).

   Windows PowerShell:
   ```powershell
   $env:GIT_LFS_SKIP_SMUDGE = "1"
   git clone -c core.longpaths=true --depth 1 https://github.com/ApshanaSP/farmwisenew.git
   cd farmwisenew/chennai-grievance-portal-main
   Remove-Item -Recurse -Force .cache
   ```
   Mac, Linux or Git Bash:
   ```bash
   GIT_LFS_SKIP_SMUDGE=1 git clone -c core.longpaths=true --depth 1 https://github.com/ApshanaSP/farmwisenew.git
   cd farmwisenew/chennai-grievance-portal-main
   rm -rf .cache
   ```
   (`core.longpaths` is for Windows: some collector files have very long names, and without it the download fails
   with "Filename too long" and leaves an empty folder. `.cache` then holds only placeholders; the AI search model downloads itself, about 280 MB, the first time it is used.)
3. Copy `.env.aws.example` to `.env` and fill in the two team secrets (`REFRESH_API_KEY`, `AADHAAR_ENCRYPTION_KEY`).
   Ask the project owner for them: they are never in this repo.
4. Start it:
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:3000. The first start takes about a minute while the data downloads.
5. Log in with the team's usual accounts (they are stored in AWS).

**Staying up to date.** While you use the site it picks up new data from AWS by itself: the district data and the
complaints, accounts and Collector/officer work saved by the team every 5 minutes. No restart needed.

**Saving.** What you do on your copy (filing complaints, approving tasks ...) stays on your PC and is **not saved to
AWS**; it is gone when you restart. Only one PC, the project owner's, saves (`AWS_STORE_SAVE=1` in its `.env`): two
saving PCs would give new complaints the same numbers and overwrite each other. Photos are kept on the PC they were
uploaded to, so photos from the owner's PC do not show on yours.

**Problems.** `fetch failed` or `unable to get local issuer certificate`: your antivirus checks HTTPS traffic; set
`NODE_EXTRA_CA_CERTS` to its root certificate file before `npm run dev`. `REFRESH_API_KEY is not set`: `.env` is
missing or not in `chennai-grievance-portal-main/`.

The sections below are the full setup with your own MySQL database instead (`DATA_BACKEND=mysql`).

## 1. Download

Clone it with Git LFS so the large files (AI model, news dumps, `district_intel.db`) come down too:

```bash
git lfs install
git clone https://github.com/ApshanaSP/farmwisenew.git
```

If you use **Download ZIP** instead, check that `district_intel/output/district_intel.db` is ~160 MB.
If it is a tiny text file, the zip didn't include the LFS files, so clone with Git instead.

## 2. Prerequisites

- Node.js 22.x
- Python 3.11+
- MySQL 8 (only if you run with `DATA_BACKEND=mysql`, the default)

## 3. Secrets (not in this repo)

`.env` files are deliberately not committed. Copy each example and fill it in, or ask the
project owner for the real files:

```bash
cp chennai-grievance-portal-main/.env.example chennai-grievance-portal-main/.env
cp police_dataset_generator/.env.example police_dataset_generator/.env
cp chennai_news_pipeline/.env.example chennai_news_pipeline/.env
```

Department officer logins are created with `npm run seed:officers`, which writes
`officer-accounts.local.csv` (also not committed).

## 4. Run the web app

```bash
cd chennai-grievance-portal-main
npm install
npm run db:setup        # creates the MySQL DB, applies migrations, loads reference data
npm run setup:ops       # Collector ops tables
npm run setup:officer   # officer console tables
npm run seed:officers   # officer logins → officer-accounts.local.csv
npm run dev             # http://localhost:3000
```

See `chennai-grievance-portal-main/README.md` for the full guide: accounts, OTPs, API and officer consoles.

## 5. Python pipeline (optional, the built store is already included)

```bash
cd district_intel
python -m venv .venv
.venv/Scripts/activate      # Windows; on Mac/Linux: source .venv/bin/activate
pip install -r requirements.txt
python run_pipeline.py build
```

See `district_intel/README.md` for details.
