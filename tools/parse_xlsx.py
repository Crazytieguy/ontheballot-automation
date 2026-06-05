#!/usr/bin/env python
# Parse the source Google Sheet export into per-tab CSVs.
# Usage: uv run --with openpyxl python tools/parse_xlsx.py
# Input:  data/raw/tracker.xlsx  (download the "Current Tracker (v2)" sheet as .xlsx)
# Output: data/csv/<tab>.csv
import csv, os, openpyxl
wb = openpyxl.load_workbook("data/raw/tracker.xlsx", data_only=True, read_only=True)
os.makedirs("data/csv", exist_ok=True)
for ws in wb.worksheets:
    safe = ws.title.strip().lower().replace(" ", "_").replace("/", "-")
    rows = list(ws.iter_rows(values_only=True))
    while rows and all(c is None or str(c).strip() == "" for c in rows[-1]):
        rows.pop()
    with open(f"data/csv/{safe}.csv", "w", newline="") as f:
        w = csv.writer(f)
        for r in rows:
            w.writerow(["" if c is None else c for c in r])
    print(f"{ws.title!r} -> data/csv/{safe}.csv ({len(rows)} rows)")
