import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase'
import Overview from './Overview'
import Sim from './Sim'
import Rules from './Rules'

const C = { bg: '#0c0e1a', card: '#13162a', border: '#1e2140', accent: '#6366f1', text: '#e2e8f0', dim: '#64748b', cr: '#ef4444', wa: '#f59e0b', he: '#22c55e', mo: '#3b82f6' }

export default function App() {
  const [tab, setTab] = useState('overview')
  const [products, setProducts] = useState([])
  const [erosion, setErosion] = useState([])
  const [vrp, setVrp] = useState([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState(null)

  useEffect(() => {
    async function load() {
      const [pRes, eRes, vRes] = await Promise.all([
        supabase.from('products').select('*'),
        supabase.from('erosion_metrics').select('*').order('erosion_pct', { ascending: false }),
        supabase.from('vrp_snapshots').select('*').eq('marketplace', 'DE'),
      ])
      setProducts(pRes.data || [])
      setErosion(eRes.data || [])
      setVrp(vRes.data || [])
      setLoading(false)
    }
    load()
  }, [])

  // Build merged DATA array like the original simulator
  const DATA = useMemo(() => {
    const eMap = Object.fromEntries(erosion.map(e => [e.asin, e]))
    const vMap = Object.fromEntries(vrp.map(v => [v.asin, v]))

    return products.map(p => {
      const e = eMap[p.asin]
      const v = vMap[p.asin]
      const hasVrp = !!(v?.vrp && v?.was_price)
      const erosionPct = e?.erosion_pct ?? (hasVrp ? Math.round((v.vrp - v.was_price) / v.vrp * 1000) / 10 : 0)

      // Group name: strip color variants
      const group = p.produkt ? p.produkt.replace(/\s+(BL|BS|CA|RS|RD|WT|GR|GWD|LWD|BLUE|ROS|OAK|WN|TU|DWD|Pro|Bundle)\s*$/i, '').trim() : null

      return {
        asin: p.asin,
        prod: p.produkt || '',
        item: p.item_name || '',
        group,
        ref: p.ref_preis,
        vrp: v?.vrp ?? p.ref_preis ?? 0,
        was: v?.was_price ?? null,
        listPrice: v?.list_price ?? null,
        hasVrp,
        hasSales: !!(e?.units_90d),
        erosion: erosionPct,
        maxDeal: e?.max_deal_price ?? (v?.was_price ? v.was_price - 0.01 : null),
        dealRatio: e?.deal_ratio_90d ?? 0,
        units: e?.units_90d ?? 0,
        avgP: e?.median_price_90d ?? 0,
        upd: e?.units_90d && e.units_90d > 0 ? Math.round(e.units_90d / 103 * 100) / 100 : 0,
        pause: e?.recommended_pause_days ?? 0,
        status: e?.status ?? 'ok',
      }
    }).sort((a, b) => b.erosion - a.erosion)
  }, [products, erosion, vrp])

  if (loading) {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: C.dim, fontSize: 16 }}>Lade Daten aus Supabase...</div>
      </div>
    )
  }

  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text, fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif' }}>
      {/* Header */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>📉</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Deal Erosion Simulator</div>
            <div style={{ fontSize: 10, color: C.dim }}>Sportstech — Amazon WAS Price Tracking</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 2, background: C.card, borderRadius: 8, padding: 3 }}>
          {[
            { k: 'overview', l: 'Portfolio', i: '📋' },
            { k: 'sim', l: 'Deal-Simulation', i: '🎛️' },
            { k: 'rules', l: 'Regeln', i: '📖' },
          ].map(t => (
            <button key={t.k} onClick={() => setTab(t.k)} style={{
              flex: 1, padding: '7px 14px', borderRadius: 6, border: 'none',
              background: tab === t.k ? 'rgba(99,102,241,0.15)' : 'transparent',
              color: tab === t.k ? '#8b8bf5' : 'rgba(255,255,255,0.35)',
              cursor: 'pointer', fontSize: 12, fontWeight: tab === t.k ? 600 : 400,
            }}>{t.i} {t.l}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '16px 20px' }}>
        {tab === 'overview' && <Overview data={DATA} onSelect={d => { setSel(d); setTab('sim') }} C={C} />}
        {tab === 'sim' && <Sim data={DATA} init={sel} C={C} />}
        {tab === 'rules' && <Rules C={C} />}
      </div>
    </div>
  )
}
