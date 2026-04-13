import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend, Cell } from 'recharts'

const fmt = (v) => v == null ? '–' : Number(v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' \u20AC'
const fmtPct = (v) => v == null ? '–' : Number(v).toFixed(1) + '%'

export default function Simulator({ data, selectedAsin }) {
  const [asin, setAsin] = useState(selectedAsin || (data[0]?.asin ?? ''))
  const [dailySales, setDailySales] = useState([])
  const [dealPrice, setDealPrice] = useState(0)
  const [dealDays, setDealDays] = useState(7)
  const [dealUnitsPerDay, setDealUnitsPerDay] = useState(8)
  const [couponDays, setCouponDays] = useState(0)
  const [loading, setLoading] = useState(false)

  const current = useMemo(() => data.find(d => d.asin === asin), [data, asin])

  // Load daily sales for selected ASIN
  useEffect(() => {
    if (!asin) return
    setLoading(true)
    supabase
      .from('daily_sales')
      .select('*')
      .eq('asin', asin)
      .order('sale_date', { ascending: true })
      .then(({ data: d }) => {
        setDailySales(d || [])
        setLoading(false)
      })
  }, [asin])

  // Update when selectedAsin changes
  useEffect(() => {
    if (selectedAsin) setAsin(selectedAsin)
  }, [selectedAsin])

  // Set default deal price when current changes
  useEffect(() => {
    if (current) {
      setDealPrice(Math.round((current.was_price - 0.01) * 100) / 100)
      // Calculate units per day from actual data
      if (current.units_90d && dailySales.length > 0) {
        const days = dailySales.length
        const normalDays = dailySales.filter(d => !d.is_deal_day)
        const dealDaysData = dailySales.filter(d => d.is_deal_day)
        if (dealDaysData.length > 0) {
          const avgDealUnits = dealDaysData.reduce((s, d) => s + d.units_sold, 0) / dealDaysData.length
          setDealUnitsPerDay(Math.round(avgDealUnits))
        }
      }
    }
  }, [current, dailySales])

  // Simulation
  const simulation = useMemo(() => {
    if (!current) return null

    const vrp = current.vrp
    const wasPrice = current.was_price
    const normalUnitsPerDay = dailySales.length > 0
      ? dailySales.filter(d => !d.is_deal_day).reduce((s, d) => s + d.units_sold, 0) / Math.max(dailySales.filter(d => !d.is_deal_day).length, 1)
      : 1.5

    const badgeWorks = dealPrice < wasPrice
    const discountFromVrp = ((vrp - dealPrice) / vrp * 100).toFixed(1)
    const discountFromWas = ((wasPrice - dealPrice) / wasPrice * 100).toFixed(1)

    // 90-day simulation
    const totalDealUnits = dealDays * dealUnitsPerDay
    const totalCouponUnits = couponDays * (normalUnitsPerDay * 1.5) // Coupons boost ~50%
    const totalNormalDays = 90 - dealDays - couponDays
    const totalNormalUnits = totalNormalDays * normalUnitsPerDay

    const totalUnits = totalDealUnits + totalCouponUnits + totalNormalUnits
    const discountedUnits = totalDealUnits + totalCouponUnits
    const discountRatio = (discountedUnits / totalUnits * 100)

    // New median estimate (simplified)
    const weightedPrice = (
      (totalDealUnits * dealPrice) +
      (totalCouponUnits * dealPrice * 1.05) +
      (totalNormalUnits * vrp)
    ) / totalUnits

    const newMedian = discountRatio > 50 ? dealPrice : weightedPrice
    const medianDrops = discountRatio > 50

    // Erosion spiral: 5 rounds without pause
    const erosionRounds = []
    let currentWas = wasPrice
    for (let round = 1; round <= 6; round++) {
      const dp = Math.round((currentWas * 0.85) * 100) / 100
      const newWas = Math.round((currentWas * 0.92) * 100) / 100
      const margin = vrp - dp
      erosionRounds.push({
        round: `Runde ${round}`,
        dealPrice: dp,
        wasPrice: currentWas,
        newWasPrice: newWas,
        margin,
        marginPct: ((margin / vrp) * 100).toFixed(1),
      })
      currentWas = newWas
    }

    // Recovery: 5 rounds with 60-day pause
    const recoveryRounds = []
    let recWas = wasPrice
    for (let round = 1; round <= 6; round++) {
      const dp = Math.round((recWas * 0.85) * 100) / 100
      const margin = vrp - dp
      recoveryRounds.push({
        round: `Runde ${round}`,
        dealPrice: dp,
        wasPrice: recWas,
        margin,
        marginPct: ((margin / vrp) * 100).toFixed(1),
      })
      // With pause, WAS recovers back ~95% toward VRP
      recWas = Math.round((recWas + (vrp - recWas) * 0.6) * 100) / 100
    }

    return {
      vrp, wasPrice, normalUnitsPerDay: normalUnitsPerDay.toFixed(1),
      badgeWorks, discountFromVrp, discountFromWas,
      totalDealUnits, totalCouponUnits, totalNormalUnits: Math.round(totalNormalUnits),
      totalUnits: Math.round(totalUnits), discountRatio: discountRatio.toFixed(1),
      newMedian: Math.round(newMedian * 100) / 100, medianDrops,
      erosionRounds, recoveryRounds,
    }
  }, [current, dealPrice, dealDays, dealUnitsPerDay, couponDays, dailySales])

  // Sales chart data
  const salesChart = useMemo(() => {
    return dailySales.map(d => ({
      date: d.sale_date,
      units: d.units_sold,
      price: d.avg_price,
      isDeal: d.is_deal_day,
    }))
  }, [dailySales])

  if (!current) {
    return <div className="text-center text-slate-400 py-12">Kein ASIN ausgewahlt. Wahle einen ASIN im Dashboard.</div>
  }

  return (
    <div className="space-y-6">
      {/* ASIN Selector */}
      <div className="flex items-center gap-4">
        <select
          value={asin}
          onChange={e => setAsin(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm border border-slate-600 bg-slate-800 text-white focus:outline-none focus:border-violet-500"
        >
          {data.map(d => (
            <option key={d.asin} value={d.asin}>
              {d.asin} — {d.produkt || 'Unbekannt'} ({fmtPct(d.erosion_pct)} Erosion)
            </option>
          ))}
        </select>
        <a
          href={`https://www.amazon.de/dp/${asin}`}
          target="_blank"
          rel="noopener"
          className="text-xs text-violet-400 hover:underline"
        >
          Amazon.de &rarr;
        </a>
      </div>

      {/* Current Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { label: 'VRP (Normalpreis)', value: fmt(simulation.vrp), color: '#22c55e' },
          { label: 'WAS Price (90d)', value: fmt(simulation.wasPrice), color: '#f59e0b' },
          { label: 'Erosion', value: fmtPct(current.erosion_pct), color: current.status === 'critical' ? '#ef4444' : current.status === 'warning' ? '#f59e0b' : '#22c55e' },
          { label: 'Max Deal-Preis', value: fmt(current.max_deal_price), color: '#8b5cf6' },
          { label: 'Units (90d)', value: current.units_90d?.toLocaleString('de-DE'), color: '#6366f1' },
          { label: 'Deal-Anteil', value: fmtPct(current.deal_ratio_90d), color: '#f59e0b' },
        ].map((c, i) => (
          <div key={i} className="rounded-lg p-3" style={{ background: 'var(--bg-card)', borderLeft: `3px solid ${c.color}` }}>
            <div className="text-[10px] text-slate-400 uppercase">{c.label}</div>
            <div className="text-lg font-bold mt-1" style={{ color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Sales History Chart */}
      {salesChart.length > 0 && (
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)' }}>
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Verkaufshistorie (Jan–Apr 2026)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={salesChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 9 }} angle={-45} textAnchor="end" height={50} interval={6} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 8, color: '#f8fafc' }}
                formatter={(v, name) => [name === 'units' ? v + ' Stk' : fmt(v), name === 'units' ? 'Units' : 'Avg. Preis']}
              />
              <Bar dataKey="units" radius={[2, 2, 0, 0]}>
                {salesChart.map((d, i) => (
                  <Cell key={i} fill={d.isDeal ? '#f59e0b' : '#6366f1'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2 text-xs text-slate-400">
            <span><span className="inline-block w-3 h-3 rounded bg-indigo-500 mr-1" />Normalpreis</span>
            <span><span className="inline-block w-3 h-3 rounded bg-amber-500 mr-1" />Deal-Tag</span>
          </div>
        </div>
      )}

      {/* Simulator Controls */}
      <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)' }}>
        <h3 className="text-sm font-semibold text-slate-300 mb-4">Deal-Simulation</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Deal Price */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Deal-Preis</label>
            <input
              type="number"
              value={dealPrice}
              onChange={e => setDealPrice(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg text-sm border border-slate-600 bg-slate-900 text-white"
              step="0.01"
            />
            {!simulation.badgeWorks && (
              <div className="text-[10px] text-red-400 mt-1">Kein Deal-Badge! Preis muss unter {fmt(simulation.wasPrice)} liegen.</div>
            )}
          </div>
          {/* Deal Duration */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Deal-Dauer: {dealDays} Tage</label>
            <input type="range" min={1} max={14} value={dealDays} onChange={e => setDealDays(Number(e.target.value))}
              className="w-full accent-violet-500" />
          </div>
          {/* Deal Units/Day */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Units/Tag im Deal: {dealUnitsPerDay}</label>
            <input type="range" min={1} max={50} value={dealUnitsPerDay} onChange={e => setDealUnitsPerDay(Number(e.target.value))}
              className="w-full accent-violet-500" />
          </div>
          {/* Coupon Days */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Coupon-Tage: {couponDays}</label>
            <input type="range" min={0} max={60} value={couponDays} onChange={e => setCouponDays(Number(e.target.value))}
              className="w-full accent-amber-500" />
          </div>
        </div>

        {/* Simulation Results */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5">
          {[
            { label: 'Rabatt vs VRP', value: simulation.discountFromVrp + '%', color: '#8b5cf6' },
            { label: 'Rabatt vs WAS', value: simulation.discountFromWas + '%', color: simulation.badgeWorks ? '#22c55e' : '#ef4444' },
            { label: 'Rabatt-Anteil 90d', value: simulation.discountRatio + '%', color: Number(simulation.discountRatio) > 50 ? '#ef4444' : '#22c55e' },
            { label: 'Neuer Median', value: fmt(simulation.newMedian), color: simulation.medianDrops ? '#ef4444' : '#22c55e' },
            { label: 'Median kippt?', value: simulation.medianDrops ? 'JA' : 'NEIN', color: simulation.medianDrops ? '#ef4444' : '#22c55e' },
          ].map((r, i) => (
            <div key={i} className="rounded-lg p-3 text-center" style={{ background: 'var(--bg-primary)' }}>
              <div className="text-[10px] text-slate-400">{r.label}</div>
              <div className="text-lg font-bold" style={{ color: r.color }}>{r.value}</div>
            </div>
          ))}
        </div>

        <div className="text-xs text-slate-500 mt-3">
          Normal: ~{simulation.normalUnitsPerDay} Stk/Tag | Deal: {simulation.totalDealUnits} Stk in {dealDays}d |
          Coupon: {Math.round(simulation.totalCouponUnits)} Stk in {couponDays}d |
          Normal: {simulation.totalNormalUnits} Stk in {90 - dealDays - couponDays}d
        </div>
      </div>

      {/* Erosion vs Recovery Comparison */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Without Pause */}
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)' }}>
          <h3 className="text-sm font-semibold text-red-400 mb-3">Ohne Pause (Erosions-Spirale)</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-slate-700">
                <th className="py-1 text-left">Runde</th>
                <th className="py-1 text-right">Deal-Preis</th>
                <th className="py-1 text-right">WAS Price</th>
                <th className="py-1 text-right">Marge</th>
              </tr>
            </thead>
            <tbody>
              {simulation.erosionRounds.map((r, i) => (
                <tr key={i} className="border-b border-slate-800">
                  <td className="py-1.5 text-slate-300">{r.round}</td>
                  <td className="py-1.5 text-right text-red-400">{fmt(r.dealPrice)}</td>
                  <td className="py-1.5 text-right text-slate-400">{fmt(r.wasPrice)}</td>
                  <td className="py-1.5 text-right" style={{ color: r.margin < 100 ? '#ef4444' : '#f59e0b' }}>{fmt(r.margin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* With Recovery */}
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)' }}>
          <h3 className="text-sm font-semibold text-green-400 mb-3">Mit 60-Tage Recovery-Pausen</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-slate-700">
                <th className="py-1 text-left">Runde</th>
                <th className="py-1 text-right">Deal-Preis</th>
                <th className="py-1 text-right">WAS Price</th>
                <th className="py-1 text-right">Marge</th>
              </tr>
            </thead>
            <tbody>
              {simulation.recoveryRounds.map((r, i) => (
                <tr key={i} className="border-b border-slate-800">
                  <td className="py-1.5 text-slate-300">{r.round}</td>
                  <td className="py-1.5 text-right text-green-400">{fmt(r.dealPrice)}</td>
                  <td className="py-1.5 text-right text-slate-400">{fmt(r.wasPrice)}</td>
                  <td className="py-1.5 text-right text-green-400">{fmt(r.margin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
