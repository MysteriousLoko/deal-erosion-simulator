"""Generate SQL INSERT statements from data files."""
import pandas as pd
import numpy as np
from pathlib import Path

DATA_DIR = Path(r"C:\Users\Amira\Downloads")
OUT_DIR = DATA_DIR / "deal-erosion-simulator" / "scripts"


def esc(s):
    """Escape single quotes for SQL."""
    if pd.isna(s) or s is None:
        return ""
    return str(s).replace("'", "''")


def num(v):
    """Format number or NULL for SQL."""
    if pd.isna(v) or v is None:
        return "NULL"
    return str(v)


def load_all_sales():
    df1 = pd.read_csv(DATA_DIR / "Germany_Order_Analysis_2026-01-01_2026-01-31.csv")
    df2 = pd.read_csv(DATA_DIR / "Germany_Order_Analysis_2026-02-01_2026-02-28.csv")
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
    sales = sales[sales["Status"].isin(["Shipped", "Pending"])].copy()
    sales["price_per_unit"] = sales["Sales(€)"] / sales["Units Sold"].replace(0, 1)
    return sales


def load_mapping():
    raw = pd.read_excel(DATA_DIR / "Sportstech_Produkt_Mapping.xlsx", engine="openpyxl")
    mapping = raw.iloc[1:].copy()
    mapping.columns = raw.columns
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
    sales = load_all_sales()
    vrp = pd.read_excel(DATA_DIR / "SportsTech_VRP_31.03 1.xlsx", engine="openpyxl")
    asin_map = load_mapping()

    # 1. Products
    print("Generating products SQL...")
    all_asins = sorted(set(sales["(Child)ASIN"].unique()) | set(vrp["asin"].unique()))
    vals = []
    for a in all_asins:
        info = asin_map.get(a, ("", "", None))
        vals.append(f"('{esc(a)}', '{esc(info[0])}', '{esc(info[1])}', {num(info[2])})")

    sql = "INSERT INTO products (asin, produkt, item_name, ref_preis) VALUES\n"
    sql += ",\n".join(vals)
    sql += "\nON CONFLICT (asin) DO UPDATE SET produkt=EXCLUDED.produkt, item_name=EXCLUDED.item_name, ref_preis=EXCLUDED.ref_preis;"
    (OUT_DIR / "01_products.sql").write_text(sql, encoding="utf-8")
    print(f"  {len(vals)} products")

    # 2. VRP Snapshots
    print("Generating VRP SQL...")
    vals = []
    for _, r in vrp.iterrows():
        src = r["vrp_source"] if r["vrp_source"] != "-" else None
        src_sql = f"'{esc(src)}'" if src else "NULL"
        vals.append(
            f"('{esc(r['asin'])}', '{esc(r['Marketplace'])}', {src_sql}, "
            f"{num(r['vrp'])}, {num(r['list_price'])}, {num(r['was_price'])}, "
            f"{num(r['T30 _price'])}, '2026-03-31')"
        )

    sql = "INSERT INTO vrp_snapshots (asin, marketplace, vrp_source, vrp, list_price, was_price, t30_price, snapshot_date) VALUES\n"
    sql += ",\n".join(vals)
    sql += "\nON CONFLICT (asin, marketplace, snapshot_date) DO UPDATE SET vrp=EXCLUDED.vrp, list_price=EXCLUDED.list_price, was_price=EXCLUDED.was_price, t30_price=EXCLUDED.t30_price, vrp_source=EXCLUDED.vrp_source;"
    (OUT_DIR / "02_vrp.sql").write_text(sql, encoding="utf-8")
    print(f"  {len(vals)} VRP rows")

    # 3. Daily Sales
    print("Generating daily sales SQL...")
    sales["sale_date"] = sales["Order Date"].dt.date
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

    vals = []
    for _, r in daily.iterrows():
        a = r["(Child)ASIN"]
        vrp_val = vrp_de.get(a)
        is_deal = "true" if (vrp_val and r["avg_price"] < vrp_val * 0.92) else "false"
        vals.append(
            f"('{esc(a)}','{r['sale_date']}',{int(r['units_sold'])},"
            f"{r['revenue']:.2f},{r['revenue_after_promo']:.2f},"
            f"{r['avg_price']:.2f},{r['median_price']:.2f},"
            f"{r['min_price']:.2f},{r['max_price']:.2f},"
            f"{int(r['order_count'])},{is_deal})"
        )

    # Split into chunks of 2000 to avoid SQL size limits
    chunk_size = 2000
    for i in range(0, len(vals), chunk_size):
        chunk = vals[i:i + chunk_size]
        sql = "INSERT INTO daily_sales (asin,sale_date,units_sold,revenue,revenue_after_promo,avg_price,median_price,min_price,max_price,order_count,is_deal_day) VALUES\n"
        sql += ",\n".join(chunk)
        sql += "\nON CONFLICT (asin, sale_date) DO UPDATE SET units_sold=EXCLUDED.units_sold, revenue=EXCLUDED.revenue, avg_price=EXCLUDED.avg_price, median_price=EXCLUDED.median_price, order_count=EXCLUDED.order_count, is_deal_day=EXCLUDED.is_deal_day;"
        part = i // chunk_size + 1
        (OUT_DIR / f"03_daily_sales_part{part}.sql").write_text(sql, encoding="utf-8")
    print(f"  {len(vals)} daily sales rows in {(len(vals)-1)//chunk_size + 1} parts")

    # 4. Erosion Metrics
    print("Generating erosion metrics SQL...")
    asin_stats = sales.groupby("(Child)ASIN").agg(
        total_units=("Units Sold", "sum"),
        avg_price=("price_per_unit", "mean"),
        median_price=("price_per_unit", "median"),
    ).reset_index()
    asin_stats.columns = ["asin", "total_units", "avg_price", "median_price"]
    merged = asin_stats.merge(
        vrp[vrp["Marketplace"] == "DE"][["asin", "vrp", "was_price"]], on="asin", how="left"
    )

    vals = []
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

        if erosion > 20:
            pause, status = 90, "critical"
        elif erosion > 15:
            pause, status = 60, "warning"
        elif erosion > 10:
            pause, status = 45, "warning"
        elif erosion > 5:
            pause, status = 30, "ok"
        else:
            pause, status = 0, "ok"

        vals.append(
            f"('{esc(r['asin'])}','2026-04-13',{r['vrp']},{r['was_price']},"
            f"{erosion},{deal_ratio},{r['median_price']:.2f},"
            f"{int(r['total_units'])},{max_deal},{pause},'{status}')"
        )

    sql = "INSERT INTO erosion_metrics (asin,calc_date,vrp,was_price,erosion_pct,deal_ratio_90d,median_price_90d,units_90d,max_deal_price,recommended_pause_days,status) VALUES\n"
    sql += ",\n".join(vals)
    sql += "\nON CONFLICT (asin, calc_date) DO UPDATE SET vrp=EXCLUDED.vrp, was_price=EXCLUDED.was_price, erosion_pct=EXCLUDED.erosion_pct, deal_ratio_90d=EXCLUDED.deal_ratio_90d, median_price_90d=EXCLUDED.median_price_90d, units_90d=EXCLUDED.units_90d, max_deal_price=EXCLUDED.max_deal_price, recommended_pause_days=EXCLUDED.recommended_pause_days, status=EXCLUDED.status;"
    (OUT_DIR / "04_erosion.sql").write_text(sql, encoding="utf-8")
    print(f"  {len(vals)} erosion metrics")

    print("\nDone! SQL files written to scripts/")


if __name__ == "__main__":
    main()
