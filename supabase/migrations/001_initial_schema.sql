-- Deal Erosion Simulator - Supabase Schema
-- Sportstech Amazon WAS Price Tracking

-- 1. Produkte (aus Mapping)
CREATE TABLE IF NOT EXISTS products (
  asin TEXT PRIMARY KEY,
  produkt TEXT,              -- Kurzname (z.B. "F37-S", "VP400 BL")
  item_name TEXT,            -- Voller Item-Name
  ref_preis NUMERIC(10,2),  -- Referenzpreis aus Mapping
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. VRP Snapshots (Amazon Vendor/Seller Report)
CREATE TABLE IF NOT EXISTS vrp_snapshots (
  id BIGSERIAL PRIMARY KEY,
  asin TEXT NOT NULL REFERENCES products(asin),
  marketplace TEXT NOT NULL DEFAULT 'DE',
  vrp_source TEXT,           -- LP-Valid, WP-Computed, etc.
  vrp NUMERIC(10,2),         -- Visible Reference Price
  list_price NUMERIC(10,2),  -- List Price
  was_price NUMERIC(10,2),   -- WAS Price (90-day median)
  t30_price NUMERIC(10,2),   -- 30-day price
  snapshot_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(asin, marketplace, snapshot_date)
);

-- 3. Sales Data (aggregiert pro ASIN pro Tag)
CREATE TABLE IF NOT EXISTS daily_sales (
  id BIGSERIAL PRIMARY KEY,
  asin TEXT NOT NULL REFERENCES products(asin),
  sale_date DATE NOT NULL,
  units_sold INTEGER DEFAULT 0,
  revenue NUMERIC(12,2) DEFAULT 0,
  revenue_after_promo NUMERIC(12,2) DEFAULT 0,
  avg_price NUMERIC(10,2),
  median_price NUMERIC(10,2),
  min_price NUMERIC(10,2),
  max_price NUMERIC(10,2),
  order_count INTEGER DEFAULT 0,
  is_deal_day BOOLEAN DEFAULT FALSE,  -- Berechnet: avg_price < vrp * 0.9
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(asin, sale_date)
);

-- 4. Deal Events (wann wurde ein Deal gespielt)
CREATE TABLE IF NOT EXISTS deal_events (
  id BIGSERIAL PRIMARY KEY,
  asin TEXT NOT NULL REFERENCES products(asin),
  deal_type TEXT NOT NULL,    -- 'lightning', 'best_deal', 'coupon', 'ped', 'price_drop'
  start_date DATE NOT NULL,
  end_date DATE,
  deal_price NUMERIC(10,2),
  normal_price NUMERIC(10,2),
  discount_pct NUMERIC(5,1),
  units_sold INTEGER,
  badge_shown BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Erosion Tracking (berechnete Metriken pro ASIN)
CREATE TABLE IF NOT EXISTS erosion_metrics (
  id BIGSERIAL PRIMARY KEY,
  asin TEXT NOT NULL REFERENCES products(asin),
  calc_date DATE NOT NULL,
  vrp NUMERIC(10,2),
  was_price NUMERIC(10,2),
  erosion_pct NUMERIC(5,1),        -- (vrp - was_price) / vrp * 100
  deal_ratio_90d NUMERIC(5,1),     -- % of sales at deal price in 90d
  median_price_90d NUMERIC(10,2),  -- Actual 90d median from sales
  units_90d INTEGER,
  max_deal_price NUMERIC(10,2),    -- was_price - 0.01
  recommended_pause_days INTEGER,
  status TEXT DEFAULT 'ok',        -- ok, warning, critical, recovery
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(asin, calc_date)
);

-- 6. Recovery Plan (geplante Pausen)
CREATE TABLE IF NOT EXISTS recovery_plans (
  id BIGSERIAL PRIMARY KEY,
  asin TEXT NOT NULL REFERENCES products(asin),
  pause_start DATE NOT NULL,
  pause_end DATE,
  target_was_price NUMERIC(10,2),
  actual_was_price NUMERIC(10,2),
  status TEXT DEFAULT 'active',   -- active, completed, cancelled
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_daily_sales_asin_date ON daily_sales(asin, sale_date);
CREATE INDEX idx_vrp_asin_date ON vrp_snapshots(asin, snapshot_date);
CREATE INDEX idx_erosion_asin_date ON erosion_metrics(asin, calc_date);
CREATE INDEX idx_deal_events_asin ON deal_events(asin, start_date);

-- RLS Policies (public read for dashboard)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE vrp_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE erosion_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read products" ON products FOR SELECT USING (true);
CREATE POLICY "Public read vrp" ON vrp_snapshots FOR SELECT USING (true);
CREATE POLICY "Public read sales" ON daily_sales FOR SELECT USING (true);
CREATE POLICY "Public read deals" ON deal_events FOR SELECT USING (true);
CREATE POLICY "Public read erosion" ON erosion_metrics FOR SELECT USING (true);
CREATE POLICY "Public read recovery" ON recovery_plans FOR SELECT USING (true);

-- Service role can write
CREATE POLICY "Service write products" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service write vrp" ON vrp_snapshots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service write sales" ON daily_sales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service write deals" ON deal_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service write erosion" ON erosion_metrics FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service write recovery" ON recovery_plans FOR ALL USING (true) WITH CHECK (true);
