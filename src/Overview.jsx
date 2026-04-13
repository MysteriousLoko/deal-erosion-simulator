import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const fmt = v => v != null ? Number(v).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' \u20ac' : '--'
const fPct = v => v != null ? Number(v).toFixed(1) + '%' : '--'
const fN = v => v != null ? Number(v).toLocaleString('de-DE') : '--'

const gC = (e, h) => !h ? '#475569' : e > 20 ? '#ef4444' : e > 10 ? '#f59e0b' : e > 5 ? '#3b82f6' : '#22c55e'
const gL = (e, h) => !h ? 'Keine VRP' : e > 20 ? 'Kritisch' : e > 10 ? 'Warnung' : e > 5 ? 'Moderat' : 'Gesund'

export default function Overview({ data, onSelect, C }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [grouped, setGrouped] = useState(false)

  const filtered = useMemo(() => {
    let r = data
    if (filter === 'eroded') r = r.filter(d => d.hasVrp && d.erosion > 5)
    else if (filter === 'critical') r = r.filter(d => d.hasVrp && d.erosion > 20)
    else if (filter === 'warning') r = r.filter(d => d.hasVrp && d.erosion > 10 && d.erosion <= 20)
    else if (filter === 'sales') r = r.filter(d => d.hasSales)
    if (search) {
      const s = search.toLowerCase()
      r = r.filter(d => d.asin.toLowerCase().includes(s) || d.prod.toLowerCase().includes(s) || d.item.toLowerCase().includes(s) || (d.group && d.group.toLowerCase().includes(s)))
    }
    return r
  }, [data, filter, search])

  const groups = useMemo(() => {
    if (!grouped) return null
    const g = {}
    filtered.forEach(d => {
      const k = d.group || d.prod || d.asin
      if (!g[k]) g[k] = []
      g[k].push(d)
    })
    return Object.entries(g).sort((a, b) => Math.max(...b[1].map(x => x.erosion)) - Math.max(...a[1].map(x => x.erosion)))
  }, [filtered, grouped])

  const stats = useMemo(() => {
    const wv = data.filter(d => d.hasVrp)
    return {
      total: data.length,
      wv: wv.length,
      ws: data.filter(d => d.hasSales).length,
      eroded: wv.filter(d => d.erosion > 5).length,
      crit: wv.filter(d => d.erosion > 20).length,
    }
  }, [data])

  const chartData = useMemo(() =>
    data.filter(d => d.hasVrp && d.erosion > 5)
      .sort((a, b) => b.erosion - a.erosion)
      .slice(0, 30)
      .map(d => ({ name: d.prod || d.asin.slice(-6), erosion: d.erosion, asin: d.asin, color: gC(d.erosion, true) })),
  [data])

  const row = (d, i, indent) => (
    <tr key={d.asin} onClick={() => onSelect(d)} style={{ cursor: 'pointer', background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent' }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
      onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent'}>
      <td style={{ padding: '6px 8px', width: 12 }}>
        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: gC(d.erosion, d.hasVrp) }} />
      </td>
      <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 11, color: '#94a3b8', paddingLeft: indent ? 24 : 8 }}>{d.asin}</td>
      <td style={{ padding: '6px 8px', fontWeight: 500, fontSize: 12 }}>{d.prod || '–'}</td>
      <td style={{ padding: '6px 8px', fontSize: 11, color: '#94a3b8' }}>{fmt(d.vrp)}</td>
      <td style={{ padding: '6px 8px', fontSize: 11, color: '#94a3b8' }}>{d.was ? fmt(d.was) : '–'}</td>
      <td style={{ padding: '6px 8px', fontWeight: 700, color: gC(d.erosion, d.hasVrp), fontSize: 12 }}>{d.hasVrp ? fPct(d.erosion) : '–'}</td>
      <td style={{ padding: '6px 8px', fontSize: 11, color: '#a78bfa' }}>{d.maxDeal ? fmt(d.maxDeal) : '–'}</td>
      <td style={{ padding: '6px 8px', fontSize: 11, color: '#94a3b8' }}>{fPct(d.dealRatio)}</td>
      <td style={{ padding: '6px 8px', fontSize: 11, color: '#94a3b8' }}>{fN(d.units)}</td>
      <td style={{ padding: '6px 8px', fontSize: 11, color: '#94a3b8' }}>{d.upd > 0 ? d.upd.toFixed(1) + '/d' : '–'}</td>
      <td style={{ padding: '6px 8px', fontSize: 11, color: d.pause >= 60 ? '#ef4444' : d.pause >= 30 ? '#f59e0b' : '#94a3b8' }}>{d.pause > 0 ? d.pause + 'd' : '–'}</td>
    </tr>
  )

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { l: 'ASINs gesamt', v: stats.total, c: C.accent },
          { l: 'Mit VRP', v: stats.wv, c: '#06b6d4' },
          { l: 'Mit Sales', v: stats.ws, c: C.he },
          { l: 'Erodiert (>5%)', v: stats.eroded, c: C.wa },
          { l: 'Kritisch (>20%)', v: stats.crit, c: C.cr },
        ].map((k, i) => (
          <div key={i} style={{ background: C.card, borderRadius: 10, padding: '10px 14px', borderLeft: `3px solid ${k.c}` }}>
            <div style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase' }}>{k.l}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.c, marginTop: 2 }}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{ background: C.card, borderRadius: 10, padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>Top 30 Erosion nach ASIN</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData}>
            <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 9 }} angle={-45} textAnchor="end" height={55} />
            <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={v => v + '%'} />
            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f8fafc', fontSize: 12 }}
              formatter={v => [v.toFixed(1) + '%', 'Erosion']} labelFormatter={l => chartData.find(d => d.name === l)?.asin || l} />
            <Bar dataKey="erosion" radius={[3, 3, 0, 0]} cursor="pointer" onClick={d => { const found = data.find(x => x.asin === d.asin); if (found) onSelect(found) }}>
              {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="text" placeholder="Suche ASIN / Produkt..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 12, width: 220, outline: 'none' }} />
        {[
          { k: 'all', l: `Alle (${data.length})` },
          { k: 'eroded', l: `Erodiert (${stats.eroded})` },
          { k: 'critical', l: `Kritisch (${stats.crit})` },
          { k: 'sales', l: `Mit Sales (${stats.ws})` },
        ].map(f => (
          <button key={f.k} onClick={() => setFilter(f.k)} style={{
            padding: '5px 10px', borderRadius: 5, border: 'none', fontSize: 11, cursor: 'pointer', fontWeight: 500,
            background: filter === f.k ? 'rgba(99,102,241,0.2)' : C.card,
            color: filter === f.k ? '#8b8bf5' : '#64748b',
          }}>{f.l}</button>
        ))}
        <button onClick={() => setGrouped(!grouped)} style={{
          padding: '5px 10px', borderRadius: 5, border: 'none', fontSize: 11, cursor: 'pointer', fontWeight: 500, marginLeft: 'auto',
          background: grouped ? 'rgba(99,102,241,0.2)' : C.card,
          color: grouped ? '#8b8bf5' : '#64748b',
        }}>{grouped ? '📦 Gruppiert' : '📋 Einzeln'}</button>
        <span style={{ fontSize: 10, color: C.dim }}>{filtered.length} ASINs</span>
      </div>

      {/* Table */}
      <div style={{ background: C.card, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['', 'ASIN', 'Produkt', 'VRP', 'WAS Price', 'Erosion', 'Max Deal', 'Deal-%', 'Units', 'Stk/Tag', 'Pause'].map((h, i) => (
                  <th key={i} style={{ padding: '8px 8px', textAlign: 'left', fontSize: 10, color: '#64748b', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped && groups ? groups.map(([groupName, items]) => (
                <React.Fragment key={groupName}>
                  <tr style={{ background: 'rgba(99,102,241,0.05)' }}>
                    <td colSpan={11} style={{ padding: '6px 8px', fontSize: 11, fontWeight: 600, color: '#a78bfa' }}>
                      📦 {groupName} ({items.length} ASINs) — Max Erosion: {fPct(Math.max(...items.map(x => x.erosion)))}
                    </td>
                  </tr>
                  {items.map((d, i) => row(d, i, true))}
                </React.Fragment>
              )) : filtered.map((d, i) => row(d, i, false))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
