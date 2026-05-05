#!/usr/bin/env python3
"""
Import educators from 'Educator Master - Currently Ass' sheet into Supabase.

Usage:
  pip install pandas openpyxl supabase
  SUPABASE_URL=https://xxx.supabase.co SUPABASE_KEY=service_role_key python scripts/import-educators.py

The script is idempotent: rows with duplicate emails are updated (upserted),
so it is safe to run multiple times.
"""

import os
import sys
import math
import pandas as pd
from supabase import create_client

EXCEL_PATH = "EDUCATOR MANAGEMENT.xlsx"
SHEET_NAME = "Educator Master - Currently Ass"

DAY_COLS = {
    "mon": "General Mon",
    "tue": "General Tue",
    "wed": "General Wed",
    "thu": "General Thu",
    "fri": "General Fri",
    "sat": "General Sat",
    "sun": "General Sun",
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


def build_availability(row):
    avail = {}
    for key, col in DAY_COLS.items():
        val = clean(row.get(col))
        avail[key] = val != "Unavailable" if val is not None else True
    return avail


def build_record(row):
    email = clean(row.get("Educator ID")) or clean(row.get("Email"))
    if not email:
        return None

    name = clean(row.get("Name"))
    if not name:
        return None

    yoe_raw = row.get("YOE")
    yoe = None
    if yoe_raw is not None and not (isinstance(yoe_raw, float) and math.isnan(yoe_raw)):
        try:
            yoe = float(yoe_raw)
        except (ValueError, TypeError):
            yoe = None

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
        rec = build_record(row)
        if rec is None:
            skipped += 1
        else:
            records.append(rec)

    print(f"  {len(records)} valid rows, {skipped} skipped (missing email/name)")

    supabase = create_client(url, key)

    batch_size = 100
    total_upserted = 0

    for i in range(0, len(records), batch_size):
        batch = records[i : i + batch_size]
        result = (
            supabase.table("educators")
            .upsert(batch, on_conflict="email")
            .execute()
        )
        total_upserted += len(batch)
        print(f"  Upserted {total_upserted}/{len(records)} …")

    print(f"Done. {total_upserted} educators upserted into Supabase.")


if __name__ == "__main__":
    main()
