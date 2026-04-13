import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase'
import Dashboard from './Dashboard'
import Simulator from './Simulator'
import Rules from './Rules'

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'simulator', label: 'Simulator', icon: '🔬' },
  { id: 'rules', label: 'Regeln & Strategie', icon: '📋' },
]

export default function App() {
  const [tab, setTab] = useState('dashboard')
  const [products, setProducts] = useState([])
  const [erosion, setErosion] = useState([])
  const [dailySales, setDailySales] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedAsin, setSelectedAsin] = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [pRes, eRes] = await Promise.all([
        supabase.from('products').select('*'),
        supabase.from('erosion_metrics').select('*').order('erosion_pct', { ascending: false }),
      ])
      setProducts(pRes.data || [])
      setErosion(eRes.data || [])
      setLoading(false)
    }
    load()
  }, [])

  // Merge products + erosion
  const merged = useMemo(() => {
    const pMap = Object.fromEntries(products.map(p => [p.asin, p]))
    return erosion.map(e => ({
      ...e,
      produkt: pMap[e.asin]?.produkt || '',
      item_name: pMap[e.asin]?.item_name || '',
      ref_preis: pMap[e.asin]?.ref_preis,
    }))
  }, [products, erosion])

  const handleSelectAsin = (asin) => {
    setSelectedAsin(asin)
    setTab('simulator')
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <header className="border-b border-slate-700 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📉</span>
            <div>
              <h1 className="text-xl font-bold text-white">Deal Erosion Simulator</h1>
              <p className="text-xs text-slate-400">Sportstech Amazon WAS Price Tracking</p>
            </div>
          </div>
          <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  tab === t.id
                    ? 'bg-violet-600 text-white shadow-lg'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-slate-400 text-lg">Lade Daten aus Supabase...</div>
          </div>
        ) : (
          <>
            {tab === 'dashboard' && <Dashboard data={merged} onSelect={handleSelectAsin} />}
            {tab === 'simulator' && <Simulator data={merged} selectedAsin={selectedAsin} />}
            {tab === 'rules' && <Rules />}
          </>
        )}
      </main>
    </div>
  )
}
