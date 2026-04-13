import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const fmt = (v) => v == null ? '–' : Number(v).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' \u20AC'
const fmtPct = (v) => v == null ? '–' : Number(v).toFixed(1) + '%'

const STATUS_COLORS = {
  critical: '#ef4444',
  warning: '#f59e0b',
  ok: '#22c55e',
}

const STATUS_LABELS = {
  critical: 'Kritisch (>20%)',
  warning: 'Warnung (10-20%)',
  ok: 'OK (<10%)',
}

export default function Dashboard({ data, onSelect }) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('erosion_pct')
  const [sortDir, setSortDir] = useState('desc')

  const stats = useMemo(() => {
    const critical = data.filter(d => d.status === 'critical').length
    const warning = data.filter(d => d.status === 'warning').length
    const ok = data.filter(d => d.status === 'ok').length
    const avgErosion = data.length > 0 ? data.reduce((s, d) => s + (d.erosion_pct || 0), 0) / data.length : 0
    const totalUnits = data.reduce((s, d) => s + (d.units_90d || 0), 0)
    return { critical, warning, ok, avgErosion, totalUnits, total: data.length }
  }, [data])

  const filtered = useMemo(() => {
    let d = [...data]
    if (filter !== 'all') d = d.filter(x => x.status === filter)
    if (search) {
      const s = search.toLowerCase()
      d = d.filter(x => x.asin?.toLowerCase().includes(s) || x.produkt?.toLowerCase().includes(s))
    }
    d.sort((a, b) => {
      const av = a[sortKey] ?? 0, bv = b[sortKey] ?? 0
      return sortDir === 'desc' ? bv - av : av - bv
    })
    return d
  }, [data, filter, search, sortKey, sortDir])

  // Chart data: top 20 by erosion
  const chartData = useMemo(() => {
    return data
      .filter(d => d.erosion_pct > 0)
      .sort((a, b) => b.erosion_pct - a.erosion_pct)
      .slice(0, 25)
      .map(d => ({
        name: d.produkt || d.asin?.slice(-6),
        asin: d.asin,
        erosion: d.erosion_pct,
        status: d.status,
      }))
  }, [data])

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const SortIcon = ({ k }) => sortKey === k ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Gesamt ASINs', value: stats.total, color: '#8b5cf6' },
          { label: 'Kritisch', value: stats.critical, color: '#ef4444' },
          { label: 'Warnung', value: stats.warning, color: '#f59e0b' },
          { label: 'OK', value: stats.ok, color: '#22c55e' },
          { label: 'Avg. Erosion', value: fmtPct(stats.avgErosion), color: '#8b5cf6' },
        ].map((kpi, i) => (
          <div key={i} className="rounded-xl p-4" style={{ background: 'var(--bg-card)', borderLeft: `3px solid ${kpi.color}` }}>
            <div className="text-xs text-slate-400">{kpi.label}</div>
            <div className="text-2xl font-bold mt-1" style={{ color: kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)' }}>
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Top 25 Erosion nach ASIN</h2>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
            <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} angle={-45} textAnchor="end" height={60} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => v + '%'} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 8, color: '#f8fafc' }}
              formatter={(v) => [v.toFixed(1) + '%', 'Erosion']}
              labelFormatter={(l) => chartData.find(d => d.name === l)?.asin || l}
            />
            <Bar dataKey="erosion" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(d) => onSelect(d.asin)}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={STATUS_COLORS[d.status] || '#8b5cf6'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Suche ASIN / Produkt..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm border border-slate-600 bg-slate-800 text-white placeholder-slate-400 focus:outline-none focus:border-violet-500 w-64"
        />
        <div className="flex gap-1">
          {['all', 'critical', 'warning', 'ok'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                filter === f ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {f === 'all' ? `Alle (${data.length})` : `${STATUS_LABELS[f]} (${data.filter(d => d.status === f).length})`}
            </button>
          ))}
        </div>
        <div className="text-xs text-slate-500 ml-auto">{filtered.length} ASINs</div>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                {[
                  { key: 'status', label: 'Status', w: 'w-16' },
                  { key: 'asin', label: 'ASIN', w: 'w-32' },
                  { key: 'produkt', label: 'Produkt', w: 'w-32' },
                  { key: 'vrp', label: 'VRP', w: 'w-24' },
                  { key: 'was_price', label: 'WAS Price', w: 'w-24' },
                  { key: 'erosion_pct', label: 'Erosion', w: 'w-20' },
                  { key: 'max_deal_price', label: 'Max Deal', w: 'w-24' },
                  { key: 'deal_ratio_90d', label: 'Deal-Anteil', w: 'w-24' },
                  { key: 'units_90d', label: 'Units', w: 'w-20' },
                  { key: 'recommended_pause_days', label: 'Pause', w: 'w-16' },
                ].map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`px-3 py-2.5 text-left text-xs font-medium text-slate-400 cursor-pointer hover:text-white ${col.w}`}
                  >
                    {col.label}<SortIcon k={col.key} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr
                  key={row.asin}
                  onClick={() => onSelect(row.asin)}
                  className="border-b border-slate-800 cursor-pointer transition-colors hover:bg-slate-700/50"
                >
                  <td className="px-3 py-2">
                    <span className="inline-block w-3 h-3 rounded-full" style={{ background: STATUS_COLORS[row.status] }} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-300">{row.asin}</td>
                  <td className="px-3 py-2 font-medium text-white">{row.produkt || '–'}</td>
                  <td className="px-3 py-2 text-slate-300">{fmt(row.vrp)}</td>
                  <td className="px-3 py-2 text-slate-300">{fmt(row.was_price)}</td>
                  <td className="px-3 py-2 font-bold" style={{ color: STATUS_COLORS[row.status] }}>
                    {fmtPct(row.erosion_pct)}
                  </td>
                  <td className="px-3 py-2 text-violet-400 font-medium">{fmt(row.max_deal_price)}</td>
                  <td className="px-3 py-2 text-slate-300">{fmtPct(row.deal_ratio_90d)}</td>
                  <td className="px-3 py-2 text-slate-300">{row.units_90d?.toLocaleString('de-DE')}</td>
                  <td className="px-3 py-2 text-slate-300">{row.recommended_pause_days}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
