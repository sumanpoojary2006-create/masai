#!/usr/bin/env python3
"""
Import educators from 'Educator Master - Currently Ass' sheet into Supabase.

Usage:
  pip install pandas openpyxl supabase
  SUPABASE_URL=https://xxx.supabase.co SUPABASE_KEY=service_role_key python scripts/import-educators.py

Idempotent — safe to re-run. Upserts on email.

availability JSONB structure:
  {
    "mon": true,           # general availability (declared by educator)
    ...
    "blocked": {           # current batch commitments (from "Current" columns)
      "thu": true,
      "sat": true
    },
    "stats": {             # from sheet; overridden by live DB query when sessions have names
      "totalSessions": 44,
      "overallAvgRating": 4.63,
      "last5AvgRating": 4.65,
      "sessionsRated4_5Plus": 40
    }
  }
"""

import os
import sys
import math
import pandas as pd
from supabase import create_client

EXCEL_PATH = "EDUCATOR MANAGEMENT.xlsx"
SHEET_NAME = "Educator Master - Currently Ass"

GENERAL_DAY_COLS = {
    "mon": "General Mon",
    "tue": "General Tue",
    "wed": "General Wed",
    "thu": "General Thu",
    "fri": "General Fri",
    "sat": "General Sat",
    "sun": "General Sun",
}

CURRENT_DAY_COLS = {
    "mon": "Current Mon ( Do not update this )",
    "tue": "Current Tue ( Do not update this )",
    "wed": "Current Wed ( Do not update this )",
    "thu": "Current Thu ( Do not update this )",
    "fri": "Current Fri ( Do not update this )",
    "sat": "Current Sat ( Do not update this )",
    "sun": "Current Sun ( Do not update this )",
}


def clean(value):
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    s = str(value).strip()
    return s if s else None


def to_bool(value, true_value="Yes"):
    v = clean(value)
    if v is None:
        return False
    return v.strip().lower() == true_value.lower()


def to_float(value):
    v = clean(value)
    if v is None:
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def to_int(value):
    v = to_float(value)
    return int(v) if v is not None else None


def build_availability(row):
    # General: Available = true, Unavailable = false
    general = {}
    for key, col in GENERAL_DAY_COLS.items():
        val = clean(row.get(col))
        general[key] = val != "Unavailable" if val is not None else True

    # Current blocked: "Blocked" = true (has batch commitment on that day)
    blocked = {}
    for key, col in CURRENT_DAY_COLS.items():
        val = clean(row.get(col))
        if val == "Blocked":
            blocked[key] = True

    # Stats from sheet columns
    stats = {}
    total = to_int(row.get("Total Sessions"))
    overall = to_float(row.get("Overall Avg Rating"))
    last5 = to_float(row.get("Last 5 Classes Avg Rating"))
    rated_4_5 = to_int(row.get("Sessions with Rating >= 4.5"))

    if total is not None:
        stats["totalSessions"] = total
    if overall is not None:
        stats["overallAvgRating"] = overall
    if last5 is not None:
        stats["last5AvgRating"] = last5
    if rated_4_5 is not None:
        stats["sessionsRated4_5Plus"] = rated_4_5

    return {**general, "blocked": blocked, "stats": stats}


def build_record(row, placeholder_email=False):
    email = clean(row.get("Educator ID")) or clean(row.get("Email"))

    if not email and placeholder_email:
        name = clean(row.get("Name"))
        if name:
            email = name.strip().lower().replace(" ", ".") + "@no-email.masai.internal"

    if not email:
        return None

    name = clean(row.get("Name"))
    if not name:
        return None

    yoe = to_float(row.get("YOE"))

    return {
        "email": email.lower(),
        "name": name,
        "phone": clean(row.get("Contact")),
        "linkedin_url": clean(row.get("Profile (Linkedin)")),
        "tier": clean(row.get("Tier")),
        "instructor_type": clean(row.get("Instructor Type")),
        "primary_domain": clean(row.get("Primary Domain")),
        "secondary_domain": clean(row.get("Secondary Domain")),
        "company": clean(row.get("Current Company/Institute")),
        "yoe": yoe,
        "languages": clean(row.get("Language")),
        "masai_history": to_bool(row.get("Masai History")),
        "mou_status": clean(row.get("Status")),
        "curriculum_approval_rating": clean(row.get("Curriculum Approval Rating")),
        "blacklisted": to_bool(row.get("Blacklisted")),
        "remarks": clean(row.get("Remarks")),
        "availability": build_availability(row),
    }


def main():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")

    if not url or not key:
        print("ERROR: Set SUPABASE_URL and SUPABASE_KEY environment variables.", file=sys.stderr)
        sys.exit(1)

    if not os.path.exists(EXCEL_PATH):
        print(f"ERROR: Excel file not found at '{EXCEL_PATH}'.", file=sys.stderr)
        print("Run this script from the repo root, or update EXCEL_PATH.", file=sys.stderr)
        sys.exit(1)

    print(f"Reading '{SHEET_NAME}' from {EXCEL_PATH} …")
    df = pd.read_excel(EXCEL_PATH, sheet_name=SHEET_NAME, header=0, dtype=str)
    df = df.where(pd.notna(df), None)

    records = []
    skipped = 0
    for _, row in df.iterrows():
        rec = build_record(row, placeholder_email=True)
        if rec is None:
            skipped += 1
        else:
            records.append(rec)

    print(f"  {len(records)} valid rows, {skipped} skipped (truly blank rows)")

    supabase = create_client(url, key)
    batch_size = 100
    total_upserted = 0

    for i in range(0, len(records), batch_size):
        batch = records[i : i + batch_size]
        supabase.table("educators").upsert(batch, on_conflict="email").execute()
        total_upserted += len(batch)
        print(f"  Upserted {total_upserted}/{len(records)} …")

    print(f"Done. {total_upserted} educators upserted into Supabase.")


if __name__ == "__main__":
    main()
