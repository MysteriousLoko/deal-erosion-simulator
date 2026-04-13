"""
Import Sportstech data into Supabase Deal Erosion Simulator
Sources: VRP Report, Order Analysis (Jan-Apr 2026), Product Mapping
"""
import os, sys, json
import pandas as pd
import numpy as np
from datetime import date
from pathlib import Path

# Supabase REST API
import requests

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://leudrvjflfiovmqkkyji.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")  # Service role key needed for writes

if not SUPABASE_KEY:
    print("ERROR: Set SUPABASE_SERVICE_KEY environment variable")
    sys.exit(1)

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates"
}

DATA_DIR = Path(r"C:\Users\Amira\Downloads")


def supabase_upsert(table: str, rows: list[dict], batch_size: int = 500) -> int:
    """Upsert rows into Supabase table in batches."""
    total = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i+batch_size]
        # Clean NaN/None values
        for row in batch:
            for k, v in list(row.items()):
                if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
                    row[k] = None
                elif pd.isna(v):
                    row[k] = None
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers=HEADERS,
            json=batch
        )
        if resp.status_code not in (200, 201):
            print(f"  ERROR {table} batch {i}: {resp.status_code} {resp.text[:200]}")
        else:
            total += len(batch)
    return total


def load_sales() -> pd.DataFrame:
    """Load and merge all Order Analysis files."""
    print("Loading sales data...")

    # Jan + Feb (CSV)
    df1 = pd.read_csv(DATA_DIR / "Germany_Order_Analysis_2026-01-01_2026-01-31.csv")
    df2 = pd.read_csv(DATA_DIR / "Germany_Order_Analysis_2026-02-01_2026-02-28.csv")

    # März + April (XLS)
    df3_raw = pd.read_excel(DATA_DIR / "Germany_Order_Analysis_2026-03-01_2026-03-31.xls", engine="xlrd")
    df3 = df3_raw.iloc[1:].copy()
    df3.columns = df1.columns

    df4_raw = pd.read_excel(DATA_DIR / "Germany_Order_Analysis_2026-04-01_2026-04-13 (1).xls", engine="xlrd")
    df4 = df4_raw.iloc[1:].copy()
    df4.columns = df1.columns

    sales = pd.concat([df1, df2, df3, df4], ignore_index=True)
    sales["Units Sold"] = pd.to_numeric(sales["Units Sold"], errors="coerce").fillna(0).astype(int)
    sales["Sales(€)"] = pd.to_numeric(sales["Sales(€)"], errors="coerce").fillna(0)
    sales["Order Amount after Promotion(€)"] = pd.to_numeric(sales["Order Amount after Promotion(€)"], errors="coerce").fillna(0)
    sales["Order Date"] = pd.to_datetime(sales["Order Date"], errors="coerce")

    # Only shipped + pending
    sales = sales[sales["Status"].isin(["Shipped", "Pending"])].copy()
    sales["price_per_unit"] = sales["Sales(€)"] / sales["Units Sold"].replace(0, 1)

    print(f"  {len(sales)} valid orders, {sales['(Child)ASIN'].nunique()} ASINs")
    return sales


def load_vrp() -> pd.DataFrame:
    """Load VRP report."""
    print("Loading VRP data...")
    vrp = pd.read_excel(DATA_DIR / "SportsTech_VRP_31.03 1.xlsx", engine="openpyxl")
    print(f"  {len(vrp)} rows, {vrp['Marketplace'].nunique()} marketplaces")
    return vrp


def load_mapping() -> pd.DataFrame:
    """Load product mapping."""
    print("Loading product mapping...")
    raw = pd.read_excel(DATA_DIR / "Sportstech_Produkt_Mapping.xlsx", engine="openpyxl")
    mapping = raw.iloc[1:].copy()
    mapping.columns = raw.columns

    rows = []
    for _, r in mapping.iterrows():
        item_name = str(r["Item Name"]) if pd.notna(r.get("Item Name")) else ""
        produkt = str(r["Produkt"]) if pd.notna(r.get("Produkt")) else ""
        ref_preis = float(r["Ref.-Preis"]) if pd.notna(r.get("Ref.-Preis")) else None

        # Collect all ASINs (L1-L6)
        for col in ["Unnamed: 4", "Unnamed: 7", "Unnamed: 10", "Unnamed: 13", "Unnamed: 16", "Unnamed: 19"]:
            asin = str(r.get(col, "")) if pd.notna(r.get(col)) else ""
            if asin.startswith("B0"):
                rows.append({
                    "asin": asin,
                    "produkt": produkt,
                    "item_name": item_name,
                    "ref_preis": ref_preis
                })

    df = pd.DataFrame(rows).drop_duplicates(subset=["asin"], keep="first")
    print(f"  {len(df)} unique ASINs mapped to products")
    return df


def import_products(mapping: pd.DataFrame, sales: pd.DataFrame, vrp: pd.DataFrame):
    """Import all unique ASINs as products."""
    print("\n=== Importing products ===")

    # All ASINs from all sources
    all_asins = set(sales["(Child)ASIN"].unique()) | set(vrp["asin"].unique())

    # Map to product names
    asin_map = dict(zip(mapping["asin"], mapping[["produkt", "item_name", "ref_preis"]].to_dict("records")))

    rows = []
    for asin in sorted(all_asins):
        info = asin_map.get(asin, {})
        rows.append({
            "asin": asin,
            "produkt": info.get("produkt", ""),
            "item_name": info.get("item_name", ""),
            "ref_preis": info.get("ref_preis"),
        })

    n = supabase_upsert("products", rows)
    print(f"  {n} products imported")


def import_vrp(vrp: pd.DataFrame):
    """Import VRP snapshots."""
    print("\n=== Importing VRP snapshots ===")

    rows = []
    for _, r in vrp.iterrows():
        rows.append({
            "asin": r["asin"],
            "marketplace": r["Marketplace"],
            "vrp_source": r["vrp_source"] if r["vrp_source"] != "-" else None,
            "vrp": float(r["vrp"]) if pd.notna(r["vrp"]) else None,
            "list_price": float(r["list_price"]) if pd.notna(r["list_price"]) else None,
            "was_price": float(r["was_price"]) if pd.notna(r["was_price"]) else None,
            "t30_price": float(r["T30 _price"]) if pd.notna(r["T30 _price"]) else None,
            "snapshot_date": "2026-03-31",
        })

    n = supabase_upsert("vrp_snapshots", rows)
    print(f"  {n} VRP snapshots imported")


def import_daily_sales(sales: pd.DataFrame, vrp: pd.DataFrame):
    """Aggregate sales per ASIN per day and import."""
    print("\n=== Importing daily sales ===")

    sales["sale_date"] = sales["Order Date"].dt.date

    # VRP lookup for deal detection
    vrp_de = vrp[vrp["Marketplace"] == "DE"].set_index("asin")["vrp"].to_dict()

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
        asin = r["(Child)ASIN"]
        vrp_val = vrp_de.get(asin)
        is_deal = bool(vrp_val and r["avg_price"] < vrp_val * 0.92)

        rows.append({
            "asin": asin,
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

    n = supabase_upsert("daily_sales", rows)
    print(f"  {n} daily sales records imported ({len(daily)} days across all ASINs)")


def import_erosion_metrics(sales: pd.DataFrame, vrp: pd.DataFrame):
    """Calculate and import erosion metrics."""
    print("\n=== Calculating erosion metrics ===")

    vrp_de = vrp[vrp["Marketplace"] == "DE"].copy()

    asin_stats = sales.groupby("(Child)ASIN").agg(
        total_units=("Units Sold", "sum"),
        avg_price=("price_per_unit", "mean"),
        median_price=("price_per_unit", "median"),
    ).reset_index()
    asin_stats.columns = ["asin", "total_units", "avg_price", "median_price"]

    merged = asin_stats.merge(vrp_de[["asin", "vrp", "was_price"]], on="asin", how="left")

    rows = []
    for _, r in merged.iterrows():
        if pd.isna(r["vrp"]) or pd.isna(r["was_price"]) or r["vrp"] == 0:
            continue

        erosion = round((r["vrp"] - r["was_price"]) / r["vrp"] * 100, 1)
        max_deal = round(r["was_price"] - 0.01, 2)

        # Deal ratio: % of units sold below 92% of VRP
        deal_threshold = r["vrp"] * 0.92
        deal_units = sales[
            (sales["(Child)ASIN"] == r["asin"]) & (sales["price_per_unit"] < deal_threshold)
        ]["Units Sold"].sum()
        deal_ratio = round(deal_units / max(r["total_units"], 1) * 100, 1)

        # Recommended pause
        if erosion > 20:
            pause = 90
            status = "critical"
        elif erosion > 15:
            pause = 60
            status = "warning"
        elif erosion > 10:
            pause = 45
            status = "warning"
        elif erosion > 5:
            pause = 30
            status = "ok"
        else:
            pause = 0
            status = "ok"

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

    n = supabase_upsert("erosion_metrics", rows)
    print(f"  {n} erosion metrics imported")

    # Summary
    critical = sum(1 for r in rows if r["status"] == "critical")
    warning = sum(1 for r in rows if r["status"] == "warning")
    print(f"  Status: {critical} critical, {warning} warning, {len(rows)-critical-warning} ok")


if __name__ == "__main__":
    sales = load_sales()
    vrp = load_vrp()
    mapping = load_mapping()

    import_products(mapping, sales, vrp)
    import_vrp(vrp)
    import_daily_sales(sales, vrp)
    import_erosion_metrics(sales, vrp)

    print("\n=== DONE ===")
