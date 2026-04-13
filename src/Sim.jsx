import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ComposedChart, Line, Legend, ReferenceLine } from 'recharts'

const fmt = v => v != null ? Number(v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' \u20ac' : '--'
const fPct = v => v != null ? Number(v).toFixed(1) + '%' : '--'

function sim(vrp, was, dp, upd, dupd, dd, cd, withRecovery) {
  const rounds = []
  let currentWas = was
  for (let rn = 1; rn <= 6; rn++) {
    const dealUnits = dupd * dd
    const couponUnits = cd * upd * 1.5
    const normalDays = 90 - dd - cd
    const normalUnits = upd * normalDays
    const total = dealUnits + couponUnits + normalUnits
    const discRatio = (dealUnits + couponUnits) / total

    const weightedAvg = (dealUnits * dp + couponUnits * dp * 1.05 + normalUnits * vrp) / total
    const newMedian = discRatio > 0.5 ? dp : weightedAvg
    const newWas = Math.round(Math.min(vrp, newMedian) * 100) / 100
    const maxDeal = Math.round((newWas - 0.01) * 100) / 100
    const erosion = vrp > 0 ? Math.round((vrp - newWas) / vrp * 1000) / 10 : 0
    const margin = vrp - dp

    rounds.push({ rn, dp: Math.round(dp * 100) / 100, was: currentWas, newWas, maxDeal, erosion, margin, discRatio: Math.round(discRatio * 1000) / 10 })

    if (withRecovery) {
      // With 60-day pause, WAS recovers ~60% toward VRP
      currentWas = Math.round((newWas + (vrp - newWas) * 0.6) * 100) / 100
    } else {
      currentWas = newWas
    }
    // Next deal must be below new WAS
    dp = Math.round((currentWas * 0.85) * 100) / 100
  }
  return rounds
}

export default function Sim({ data, init, C }) {
  const [d, setD] = useState(init || data.find(x => x.asin === 'B075SJ6C9F') || data[0])
  const [dailySales, setDailySales] = useState([])
  const [vrp, setVrp] = useState(d?.vrp || 0)
  const [was, setWas] = useState(d?.was || d?.avgP || 0)
  const [dp, setDp] = useState(d?.maxDeal || 0)
  const [upd, setUpd] = useState(d?.upd || 1.5)
  const [dupd, setDupd] = useState(Math.max(Math.round((d?.upd || 1.5) * 4), 2))
  const [dd, setDd] = useState(7)
  const [cd, setCd] = useState(0)

  // Load daily sales
  useEffect(() => {
    if (!d?.asin) return
    supabase.from('daily_sales').select('*').eq('asin', d.asin).order('sale_date').then(({ data: s }) => setDailySales(s || []))
  }, [d?.asin])

  // Update when init changes
  useEffect(() => {
    if (init) {
      setD(init)
      setVrp(init.vrp || 0)
      setWas(init.was || init.avgP || 0)
      setDp(init.asin === 'B075SJ6C9F' ? 925.99 : init.maxDeal || (init.was ? init.was - 0.01 : 0))
      setUpd(init.upd || 1.5)
      setDupd(Math.max(Math.round((init.upd || 1.5) * 4), 2))
    }
  }, [init])

  const er = useMemo(() => sim(vrp, was, dp, upd, dupd, dd, cd, false), [vrp, was, dp, upd, dupd, dd, cd])
  const rc = useMemo(() => sim(vrp, was, dp, upd, dupd, dd, cd, true), [vrp, was, dp, upd, dupd, dd, cd])
  const ok = dp < was
  const ePct = was < vrp ? ((vrp - was) / vrp * 100) : 0
  const cmp = er.map((e, i) => ({ r: `R${e.rn}`, ohne: e.dp, mit: rc[i].dp, vrp }))

  // Related ASINs (same product group)
  const related = useMemo(() => {
    if (!d?.group) return []
    return data.filter(x => x.group === d.group && x.asin !== d.asin)
  }, [d, data])

  const salesChart = useMemo(() => dailySales.map(s => ({
    date: s.sale_date, units: s.units_sold, price: s.avg_price, isDeal: s.is_deal_day,
  })), [dailySales])

  if (!d) return <div style={{ color: C.dim, padding: 40, textAlign: 'center' }}>Wahle ein ASIN im Portfolio-Tab.</div>

  const S = (label, value, color) => (
    <div style={{ background: C.bg, borderRadius: 8, padding: '8px 12px', borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
    </div>
  )

  return (
    <div>
      {/* ASIN Selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <select value={d.asin} onChange={e => {
          const found = data.find(x => x.asin === e.target.value)
          if (found) { setD(found); setVrp(found.vrp); setWas(found.was || found.avgP || 0); setDp(found.maxDeal || 0); setUpd(found.upd || 1.5); setDupd(Math.max(Math.round((found.upd || 1.5) * 4), 2)) }
        }} style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 12, maxWidth: 500 }}>
          {data.map(x => (
            <option key={x.asin} value={x.asin}>{x.asin} — {x.prod || '?'} ({x.hasVrp ? fPct(x.erosion) : 'kein VRP'})</option>
          ))}
        </select>
        <a href={`https://www.amazon.de/dp/${d.asin}`} target="_blank" rel="noopener" style={{ fontSize: 11, color: '#a78bfa' }}>Amazon.de →</a>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: C.dim }}>
          {d.prod && <span style={{ color: C.text, fontWeight: 600 }}>{d.prod}</span>}
          {d.group && d.group !== d.prod && <span> ({d.group})</span>}
        </div>
      </div>

      {/* Related ASINs */}
      {related.length > 0 && (
        <div style={{ background: C.card, borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 11 }}>
          <span style={{ color: '#a78bfa', fontWeight: 600 }}>📦 {d.group}</span>
          <span style={{ color: C.dim }}> — {related.length + 1} ASINs: </span>
          <span style={{ color: '#22c55e', fontWeight: 600 }}>{d.asin}</span>
          {related.map(r => (
            <span key={r.asin} onClick={() => { setD(r); setVrp(r.vrp); setWas(r.was || r.avgP || 0); setDp(r.maxDeal || 0); setUpd(r.upd || 1.5) }}
              style={{ color: '#64748b', cursor: 'pointer', marginLeft: 6 }} onMouseEnter={e => e.target.style.color = '#a78bfa'} onMouseLeave={e => e.target.style.color = '#64748b'}>
              {r.asin}
            </span>
          ))}
        </div>
      )}

      {/* Status Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 14 }}>
        {S('VRP', fmt(vrp), C.he)}
        {S('WAS Price', was ? fmt(was) : '--', C.wa)}
        {S('Erosion', d.hasVrp ? fPct(ePct) : '--', ePct > 20 ? C.cr : ePct > 10 ? C.wa : C.he)}
        {S('Max Deal', d.maxDeal ? fmt(d.maxDeal) : '--', C.accent)}
        {S('Units (103d)', d.units > 0 ? d.units.toLocaleString('de-DE') : '--', '#06b6d4')}
        {S('Badge?', ok ? 'JA ✓' : 'NEIN ✕', ok ? C.he : C.cr)}
      </div>

      {/* Sales Chart */}
      {salesChart.length > 0 && (
        <div style={{ background: C.card, borderRadius: 10, padding: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>Verkaufshistorie (Jan–Apr 2026)</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={salesChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2140" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 8 }} angle={-45} textAnchor="end" height={45} interval={6} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f8fafc', fontSize: 11 }} />
              <Bar dataKey="units" radius={[2, 2, 0, 0]}>
                {salesChart.map((d, i) => <Cell key={i} fill={d.isDeal ? '#f59e0b' : '#6366f1'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Sliders */}
      <div style={{ background: C.card, borderRadius: 10, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 10 }}>Deal-Simulation</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Slider label="Deal-Preis" value={dp} onChange={setDp} min={0} max={vrp} step={0.01} fmt={fmt} warn={!ok && 'Uber WAS Price — kein Badge!'} />
          <Slider label="Deal-Dauer (Tage)" value={dd} onChange={setDd} min={1} max={14} step={1} />
          <Slider label="Units/Tag im Deal" value={dupd} onChange={setDupd} min={1} max={50} step={1} />
          <Slider label="Normal Units/Tag" value={upd} onChange={setUpd} min={0.1} max={20} step={0.1} />
          <Slider label="Coupon-Tage" value={cd} onChange={setCd} min={0} max={60} step={1} color="#f59e0b" />
          <div>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>VRP (Normalpreis)</div>
            <input type="number" value={vrp} onChange={e => setVrp(Number(e.target.value))} step="0.01"
              style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }} />
          </div>
        </div>

        {/* Simulation Results */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginTop: 12 }}>
          {[
            { l: 'Rabatt vs VRP', v: vrp > 0 ? fPct((vrp - dp) / vrp * 100) : '--', c: C.accent },
            { l: 'Rabatt vs WAS', v: was > 0 ? fPct((was - dp) / was * 100) : '--', c: ok ? C.he : C.cr },
            { l: 'Deal-Anteil 90d', v: fPct(er[0]?.discRatio), c: er[0]?.discRatio > 50 ? C.cr : C.he },
            { l: 'Neuer WAS', v: fmt(er[0]?.newWas), c: er[0]?.newWas < was ? C.cr : C.he },
            { l: 'Median kippt?', v: er[0]?.discRatio > 50 ? 'JA ⚠' : 'NEIN ✓', c: er[0]?.discRatio > 50 ? C.cr : C.he },
          ].map((r, i) => (
            <div key={i} style={{ background: C.bg, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: C.dim }}>{r.l}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: r.c }}>{r.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Comparison Chart */}
      <div style={{ background: C.card, borderRadius: 10, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>Erosions-Spirale vs. Recovery</div>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={cmp}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2140" />
            <XAxis dataKey="r" tick={{ fill: '#64748b', fontSize: 11 }} />
            <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={v => Math.round(v) + '€'} domain={['auto', 'auto']} />
            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f8fafc', fontSize: 11 }}
              formatter={v => [fmt(v)]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={vrp} stroke="#22c55e" strokeDasharray="5 5" label={{ value: 'VRP', fill: '#22c55e', fontSize: 10 }} />
            <Bar dataKey="ohne" name="Ohne Pause" fill="#ef4444" radius={[3, 3, 0, 0]} barSize={20} />
            <Bar dataKey="mit" name="Mit 60d Recovery" fill="#22c55e" radius={[3, 3, 0, 0]} barSize={20} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Tables side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <RoundTable title="Ohne Pause (Erosion)" rounds={er} color="#ef4444" C={C} />
        <RoundTable title="Mit 60-Tage Recovery" rounds={rc} color="#22c55e" C={C} />
      </div>
    </div>
  )
}

function Slider({ label, value, onChange, min, max, step, fmt: fmtFn, warn, color = '#6366f1' }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{fmtFn ? fmtFn(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: color }} />
      {warn && <div style={{ fontSize: 9, color: '#ef4444', marginTop: 2 }}>⚠ {warn}</div>}
    </div>
  )
}

function RoundTable({ title, rounds, color, C }) {
  return (
    <div style={{ background: C.card, borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color, marginBottom: 8 }}>{title}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {['Runde', 'Deal-Preis', 'WAS Price', 'Erosion', 'Marge'].map(h => (
              <th key={h} style={{ padding: '4px 6px', textAlign: 'right', fontSize: 10, color: '#64748b', fontWeight: 500 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rounds.map(r => (
            <tr key={r.rn} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: '5px 6px', color: '#94a3b8' }}>R{r.rn}</td>
              <td style={{ padding: '5px 6px', textAlign: 'right', color, fontWeight: 600 }}>{fmt(r.dp)}</td>
              <td style={{ padding: '5px 6px', textAlign: 'right', color: '#94a3b8' }}>{fmt(r.was)}</td>
              <td style={{ padding: '5px 6px', textAlign: 'right', color: r.erosion > 20 ? '#ef4444' : '#f59e0b' }}>{fPct(r.erosion)}</td>
              <td style={{ padding: '5px 6px', textAlign: 'right', color: r.margin < 100 ? '#ef4444' : '#94a3b8' }}>{fmt(r.margin)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
