# CLAUDE.md — dev quickstart

What this project is: see `README.md`. This file is just how to get running on a new machine.

- **Python via `uv`** (3.13+), no venv: `uv run --with requests python <script>`.
- **Secrets:** create `.env` with `EXA_API_KEY=<key>` (get one at exa.ai). It is gitignored.
- **Data is gitignored but regenerable:** download the "Current Tracker (v2)" Google Sheet (id `1QUL47pS1zCwsidvb3FRrORD0A1Itly6U8tL8Hw99wlE`) as `data/raw/tracker.xlsx`, then `uv run --with openpyxl python tools/parse_xlsx.py` → `data/csv/`.
- **Eval harness:** `eval/`. **Agent runners + their pitfalls:** `workflows/` (read `workflows/CLAUDE.md` before running them).
- **Reviewing prompts:** committed full rendered prompts are in `prompts/examples/`; composition logic is in `eval/gen.py`.
