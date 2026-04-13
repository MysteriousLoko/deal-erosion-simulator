export default function Rules() {
  return (
    <div className="space-y-6 max-w-4xl">
      {/* WAS Price Mechanik */}
      <Section title="WAS Price Mechanik" icon="🧮">
        <p>Der <b>WAS Price</b> ist der 90-Tage-Median der tatsachlich bezahlten Preise. Amazon nutzt diesen als Referenz fur Deal-Rabatte.</p>
        <ul className="list-disc ml-5 mt-2 space-y-1">
          <li>Basiert auf dem <b>Median</b> (nicht Durchschnitt) aller Verkaufe der letzten 90 Tage</li>
          <li>Seit 2025 zahlen <b>Coupons und Prime Exclusive Discounts</b> mit in die Berechnung</li>
          <li>Deal-Badge erscheint nur wenn der Deal-Preis <b>unter dem WAS Price</b> liegt</li>
          <li>Ab <b>18. Mai 2026</b>: Wenn &gt;50% der Tage unter dem Medianpreis liegen, zahlen ALLE Verkaufe inkl. Promotions</li>
        </ul>
      </Section>

      {/* Erosions-Spirale */}
      <Section title="Die Erosions-Spirale" icon="🌀">
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm">
          <p><b>Das Problem:</b> Je haufiger Deals gespielt werden, desto niedriger der WAS Price → desto tiefer muss der nachste Deal → noch niedrigerer WAS Price → ...</p>
        </div>
        <p className="mt-3">Bei Fitnessgeraten besonders kritisch: Normalverkauf 1-3 Stuck/Tag, aber im Deal 8-15 Stuck/Tag. Ein einziger 7-Tage-Deal kann &gt;50% aller 90-Tage-Verkaufe ausmachen.</p>
      </Section>

      {/* Recovery-Strategie */}
      <Section title="Recovery-Strategie" icon="🔄">
        <table className="w-full text-sm mt-2">
          <thead>
            <tr className="text-slate-400 border-b border-slate-700">
              <th className="py-2 text-left">Erosion</th>
              <th className="py-2 text-left">Status</th>
              <th className="py-2 text-left">Empfohlene Pause</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['0-5%', 'OK', 'Keine Pause notig', '#22c55e'],
              ['5-10%', 'Leicht', '30 Tage', '#22c55e'],
              ['10-15%', 'Warnung', '45 Tage', '#f59e0b'],
              ['15-20%', 'Erhoht', '60 Tage', '#f59e0b'],
              ['>20%', 'Kritisch', '90 Tage (volles 90d-Fenster)', '#ef4444'],
            ].map(([erosion, status, pause, color], i) => (
              <tr key={i} className="border-b border-slate-800">
                <td className="py-2 font-bold" style={{ color }}>{erosion}</td>
                <td className="py-2" style={{ color }}>{status}</td>
                <td className="py-2 text-slate-300">{pause}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* Wahrend der Pause */}
      <Section title="Wahrend der Pause: VERBOTEN" icon="🚫">
        <div className="grid grid-cols-2 gap-3 mt-2">
          {[
            'Lightning Deals',
            'Best Deals / 7-Day Deals',
            'Coupons (alle Arten)',
            'Prime Exclusive Discounts',
            'Preissenkungen',
            'Sale Events (ausser Prime Day / Black Friday)',
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2 bg-red-500/10 rounded-lg px-3 py-2 text-sm border border-red-500/20">
              <span className="text-red-400">✕</span>
              <span className="text-slate-300">{item}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Deal-Typen */}
      <Section title="Deal-Typen & WAS Price Impact" icon="📊">
        <table className="w-full text-sm mt-2">
          <thead>
            <tr className="text-slate-400 border-b border-slate-700">
              <th className="py-2 text-left">Deal-Typ</th>
              <th className="py-2 text-left">Impact auf WAS</th>
              <th className="py-2 text-left">Empfehlung</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Lightning Deal', 'HOCH — Kurze Dauer, aber extremes Volumen', 'Max 1x pro Quartal'],
              ['Best Deal (7 Tage)', 'SEHR HOCH — Lange Laufzeit + hohes Volumen', 'Nur zu Peak Events'],
              ['Coupon', 'MITTEL — Seit 2025 im WAS Price enthalten', 'Vorsichtig einsetzen'],
              ['Prime Exclusive Discount', 'MITTEL — Zahlt jetzt in WAS Price', 'Begrenzt nutzen'],
              ['Preissenkung', 'HOCH — Direkte Absenkung des Verkaufspreises', 'Nur temporar'],
            ].map(([type, impact, rec], i) => (
              <tr key={i} className="border-b border-slate-800">
                <td className="py-2 font-medium text-white">{type}</td>
                <td className="py-2 text-slate-300 text-xs">{impact}</td>
                <td className="py-2 text-violet-400 text-xs">{rec}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* Peak Events */}
      <Section title="Peak Events (Ausnahmen)" icon="⭐">
        <p>Verkaufe wahrend <b>Prime Day</b> und <b>Black Friday / Cyber Monday</b> sind von der Typical-Price-Berechnung ausgenommen.</p>
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 mt-2 text-sm">
          <b>Strategie:</b> Aggressive Deals NUR zu Peak Events spielen. Dort konnt ihr den vollen Rabatt geben, ohne den WAS Price dauerhaft zu schadigen.
        </div>
      </Section>

      {/* 12-Monats-Kalender */}
      <Section title="Empfohlener 12-Monats Deal-Kalender" icon="📅">
        <div className="grid grid-cols-3 md:grid-cols-4 gap-2 mt-2">
          {[
            { month: 'Jan', action: 'PAUSE', color: '#22c55e', note: 'Recovery nach Q4' },
            { month: 'Feb', action: 'PAUSE', color: '#22c55e', note: 'WAS Price erholen' },
            { month: 'Marz', action: 'DEAL', color: '#8b5cf6', note: 'Spring Sale (moderat)' },
            { month: 'Apr', action: 'PAUSE', color: '#22c55e', note: 'Recovery' },
            { month: 'Mai', action: 'PAUSE', color: '#22c55e', note: 'Recovery' },
            { month: 'Jun', action: 'DEAL', color: '#8b5cf6', note: 'Sommer-Fitness' },
            { month: 'Jul', action: 'PEAK', color: '#f59e0b', note: 'Prime Day (aggressiv!)' },
            { month: 'Aug', action: 'PAUSE', color: '#22c55e', note: 'Post-Prime Recovery' },
            { month: 'Sep', action: 'PAUSE', color: '#22c55e', note: 'Recovery' },
            { month: 'Okt', action: 'DEAL', color: '#8b5cf6', note: 'Oktober-Deals' },
            { month: 'Nov', action: 'PEAK', color: '#f59e0b', note: 'Black Friday (aggressiv!)' },
            { month: 'Dez', action: 'DEAL', color: '#8b5cf6', note: 'Weihnachts-Push' },
          ].map((m, i) => (
            <div key={i} className="rounded-lg p-2 text-center" style={{ background: 'var(--bg-primary)', borderTop: `3px solid ${m.color}` }}>
              <div className="text-xs font-bold" style={{ color: m.color }}>{m.month}</div>
              <div className="text-[10px] font-bold mt-0.5" style={{ color: m.color }}>{m.action}</div>
              <div className="text-[9px] text-slate-500 mt-0.5">{m.note}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

function Section({ title, icon, children }) {
  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)' }}>
      <h2 className="text-base font-semibold text-white mb-3">{icon} {title}</h2>
      <div className="text-sm text-slate-300 leading-relaxed">{children}</div>
    </div>
  )
}
