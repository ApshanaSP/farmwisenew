# FarmWise / District IQ — Chennai Collector dashboard

Everything for the project is in this repo: the web app, the data collectors, the curated
district_intel store, generated datasets and the docs.

| Folder | What it is |
|---|---|
| `chennai-grievance-portal-main/` | Next.js web app: citizen portal, Collector console, `/officer` department consoles, Ask District IQ |
| `district_intel/` | Python pipeline that builds the curated store (`output/district_intel.db`) the dashboard reads |
| `aws/` | AWS backend (S3 / DynamoDB / Lambda / API Gateway) setup and push scripts |
| `imd_weather_collector/`, `cpcb_air_quality_collector/`, `cfm_dss_collector/`, `chennai_hospital_data/`, `chennai_news_pipeline/` | Data collectors with their collected data |
| `pwd_dataset_generator/`, `police_dataset_generator/` | Synthetic dataset generators with their output |
| `docs/` | Project report, demo script, slides |

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
