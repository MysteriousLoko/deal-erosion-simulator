"""Import data into Supabase via REST API (uses anon key with permissive RLS)."""
import pandas as pd
import numpy as np
import requests
import json
import sys
from pathlib import Path

SUPABASE_URL = "https://leudrvjflfiovmqkkyji.supabase.co"
SUPABASE_KEY = "sb_publishable_hhT248CUZVTzhkDCvkWL6A_F76lWdAl"
DATA_DIR = Path(r"C:\Users\Amira\Downloads")

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}


def upsert(table, rows, batch_size=200):
    """Upsert rows into Supabase."""
    total = 0
    errors = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        # Clean NaN/None
        clean = []
        for row in batch:
            clean_row = {}
            for k, v in row.items():
                if v is None or (isinstance(v, float) and (np.isnan(v) or np.isinf(v))):
                    clean_row[k] = None
                elif isinstance(v, (np.integer,)):
                    clean_row[k] = int(v)
                elif isinstance(v, (np.floating,)):
                    clean_row[k] = round(float(v), 2)
                elif isinstance(v, pd.Timestamp):
                    clean_row[k] = v.isoformat()
                else:
                    clean_row[k] = v
            clean.append(clean_row)

        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers=HEADERS,
            json=clean,
        )
        if resp.status_code in (200, 201):
            total += len(batch)
        else:
            errors += 1
            print(f"  ERROR batch {i}: {resp.status_code} {resp.text[:300]}")
            if errors > 3:
                print("  Too many errors, stopping.")
                break
    return total


def load_sales():
    df1 = pd.read_csv(DATA_DIR / "Germany_Order_Analysis_2026-01-01_2026-01-31.csv")
    df2 = pd.read_csv(DATA_DIR / "Germany_Order_Analysis_2026-02-01_2026-02-28.csv")
    df3_raw = pd.read_excel(DATA_DIR / "Germany_Order_Analysis_2026-03-01_2026-03-31.xls", engine="xlrd")
    df3 = df3_raw.iloc[1:].copy(); df3.columns = df1.columns
    df4_raw = pd.read_excel(DATA_DIR / "Germany_Order_Analysis_2026-04-01_2026-04-13 (1).xls", engine="xlrd")
    df4 = df4_raw.iloc[1:].copy(); df4.columns = df1.columns
    sales = pd.concat([df1, df2, df3, df4], ignore_index=True)
    sales["Units Sold"] = pd.to_numeric(sales["Units Sold"], errors="coerce").fillna(0).astype(int)
    sales["Sales(€)"] = pd.to_numeric(sales["Sales(€)"], errors="coerce").fillna(0)
    sales["Order Amount after Promotion(€)"] = pd.to_numeric(sales["Order Amount after Promotion(€)"], errors="coerce").fillna(0)
    sales["Order Date"] = pd.to_datetime(sales["Order Date"], errors="coerce")
    sales = sales[sales["Status"].isin(["Shipped", "Pending"])].copy()
    sales["price_per_unit"] = sales["Sales(€)"] / sales["Units Sold"].replace(0, 1)
    return sales


def load_mapping():
    raw = pd.read_excel(DATA_DIR / "Sportstech_Produkt_Mapping.xlsx", engine="openpyxl")
    mapping = raw.iloc[1:].copy(); mapping.columns = raw.columns
    asin_map = {}
    for _, r in mapping.iterrows():
        name = str(r["Produkt"]) if pd.notna(r.get("Produkt")) else ""
        item = str(r["Item Name"]) if pd.notna(r.get("Item Name")) else ""
        ref = float(r["Ref.-Preis"]) if pd.notna(r.get("Ref.-Preis")) else None
        for col in ["Unnamed: 4", "Unnamed: 7", "Unnamed: 10", "Unnamed: 13", "Unnamed: 16", "Unnamed: 19"]:
            a = str(r.get(col, "")) if pd.notna(r.get(col)) else ""
            if a.startswith("B0"):
                asin_map[a] = (name, item, ref)
    return asin_map


def main():
    print("Loading data...")
    sales = load_sales()
    vrp = pd.read_excel(DATA_DIR / "SportsTech_VRP_31.03 1.xlsx", engine="openpyxl")
    asin_map = load_mapping()
    vrp_de = vrp[vrp["Marketplace"] == "DE"].set_index("asin")["vrp"].to_dict()

    # === 1. Products ===
    print("\n1. Importing products...")
    all_asins = sorted(set(sales["(Child)ASIN"].unique()) | set(vrp["asin"].unique()))
    rows = []
    for a in all_asins:
        info = asin_map.get(a, ("", "", None))
        rows.append({"asin": a, "produkt": info[0], "item_name": info[1], "ref_preis": info[2]})
    n = upsert("products", rows)
    print(f"  {n}/{len(rows)} products imported")

    # === 2. VRP Snapshots ===
    print("\n2. Importing VRP snapshots...")
    rows = []
    for _, r in vrp.iterrows():
        src = r["vrp_source"] if r["vrp_source"] != "-" else None
        rows.append({
            "asin": r["asin"],
            "marketplace": r["Marketplace"],
            "vrp_source": src,
            "vrp": float(r["vrp"]) if pd.notna(r["vrp"]) else None,
            "list_price": float(r["list_price"]) if pd.notna(r["list_price"]) else None,
            "was_price": float(r["was_price"]) if pd.notna(r["was_price"]) else None,
            "t30_price": float(r["T30 _price"]) if pd.notna(r["T30 _price"]) else None,
            "snapshot_date": "2026-03-31",
        })
    n = upsert("vrp_snapshots", rows)
    print(f"  {n}/{len(rows)} VRP snapshots imported")

    # === 3. Daily Sales ===
    print("\n3. Importing daily sales...")
    sales["sale_date"] = sales["Order Date"].dt.date
    daily = sales.groupby(["(Child)ASIN", "sale_date"]).agg(
        units_sold=("Units Sold", "sum"),
        revenue=("Sales(€)", "sum"),
        revenue_after_promo=("Order Amount after Promotion(€)", "sum"),
        avg_price=("price_per_unit", "mean"),
        median_price=("price_per_unit", "median"),
        min_price=("price_per_unit", "min"),
        max_price=("price_per_unit", "max"),
        order_count=("Order Id", "count"),
    ).reset_index()

    rows = []
    for _, r in daily.iterrows():
        a = r["(Child)ASIN"]
        vrp_val = vrp_de.get(a)
        is_deal = bool(vrp_val and r["avg_price"] < vrp_val * 0.92)
        rows.append({
            "asin": a,
            "sale_date": str(r["sale_date"]),
            "units_sold": int(r["units_sold"]),
            "revenue": round(float(r["revenue"]), 2),
            "revenue_after_promo": round(float(r["revenue_after_promo"]), 2),
            "avg_price": round(float(r["avg_price"]), 2),
            "median_price": round(float(r["median_price"]), 2),
            "min_price": round(float(r["min_price"]), 2),
            "max_price": round(float(r["max_price"]), 2),
            "order_count": int(r["order_count"]),
            "is_deal_day": is_deal,
        })
    n = upsert("daily_sales", rows, batch_size=300)
    print(f"  {n}/{len(rows)} daily sales imported")

    # === 4. Erosion Metrics ===
    print("\n4. Importing erosion metrics...")
    asin_stats = sales.groupby("(Child)ASIN").agg(
        total_units=("Units Sold", "sum"),
        avg_price=("price_per_unit", "mean"),
        median_price=("price_per_unit", "median"),
    ).reset_index()
    asin_stats.columns = ["asin", "total_units", "avg_price", "median_price"]
    merged = asin_stats.merge(vrp[vrp["Marketplace"] == "DE"][["asin", "vrp", "was_price"]], on="asin", how="left")

    rows = []
    for _, r in merged.iterrows():
        if pd.isna(r["vrp"]) or pd.isna(r["was_price"]) or r["vrp"] == 0:
            continue
        erosion = round((r["vrp"] - r["was_price"]) / r["vrp"] * 100, 1)
        max_deal = round(r["was_price"] - 0.01, 2)
        deal_threshold = r["vrp"] * 0.92
        deal_units = sales[
            (sales["(Child)ASIN"] == r["asin"]) & (sales["price_per_unit"] < deal_threshold)
        ]["Units Sold"].sum()
        deal_ratio = round(deal_units / max(r["total_units"], 1) * 100, 1)

        if erosion > 20: pause, status = 90, "critical"
        elif erosion > 15: pause, status = 60, "warning"
        elif erosion > 10: pause, status = 45, "warning"
        elif erosion > 5: pause, status = 30, "ok"
        else: pause, status = 0, "ok"

        rows.append({
            "asin": r["asin"],
            "calc_date": "2026-04-13",
            "vrp": float(r["vrp"]),
            "was_price": float(r["was_price"]),
            "erosion_pct": erosion,
            "deal_ratio_90d": deal_ratio,
            "median_price_90d": round(float(r["median_price"]), 2),
            "units_90d": int(r["total_units"]),
            "max_deal_price": max_deal,
            "recommended_pause_days": pause,
            "status": status,
        })
    n = upsert("erosion_metrics", rows)
    print(f"  {n}/{len(rows)} erosion metrics imported")

    # === Summary ===
    print("\n=== IMPORT COMPLETE ===")
    for table in ["products", "vrp_snapshots", "daily_sales", "erosion_metrics"]:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/{table}?select=count",
            headers={**HEADERS, "Prefer": "count=exact"},
        )
        count = r.headers.get("content-range", "?").split("/")[-1]
        print(f"  {table}: {count} rows")


if __name__ == "__main__":
    main()
