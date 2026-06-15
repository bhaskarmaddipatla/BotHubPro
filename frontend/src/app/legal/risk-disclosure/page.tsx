import Link from 'next/link'

export default function RiskDisclosurePage() {
  return (
    <div className="min-h-screen bg-[#0a0e1a] text-gray-300">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <Link href="/" className="text-blue-400 hover:text-blue-300 text-sm">← Back to Home</Link>
        </div>

        <h1 className="text-3xl font-bold text-white mb-2">Risk Disclosure Statement</h1>
        <p className="text-gray-500 text-sm mb-10">Last updated: June 2025</p>

        <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-5 mb-8">
          <p className="text-red-300 font-semibold text-base">This statement is provided to ensure you fully understand the risks involved in options trading and the use of automated trading software before subscribing to BotHub Pro.</p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed">

          <section>
            <h2 className="text-white font-semibold text-lg mb-3">1. Options Trading Risk</h2>
            <ul className="space-y-2 ml-4 list-disc">
              <li>Options are leveraged instruments. You can lose <strong>100% of the premium paid</strong> on long options.</li>
              <li>Selling options (credit spreads, iron condors, etc.) involves <strong>defined but potentially large losses</strong> if the market moves against your position.</li>
              <li>0DTE (zero days to expiration) options are particularly volatile and can move to maximum loss within minutes.</li>
              <li>SPX options settle in cash and are European-style — they cannot be exercised early, but their value can move rapidly.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-3">2. Automated Trading Risk</h2>
            <ul className="space-y-2 ml-4 list-disc">
              <li>Automated systems can experience software bugs, connectivity failures, or data feed errors that result in unintended trades or missed exits.</li>
              <li>An internet or server outage during an open position may prevent stop-loss orders from executing.</li>
              <li>The bot operates on your brokerage account — you are responsible for monitoring it and having sufficient margin.</li>
              <li>Algorithm performance in live markets may differ significantly from backtested results.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-3">3. No Investment Advice</h2>
            <p>BotHub Pro is a <strong>software platform only</strong>. We are not a registered investment adviser, broker-dealer, or commodity trading adviser. Nothing on this platform constitutes a personalised recommendation or investment advice. You should consult a qualified financial professional before using automated trading software.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-3">4. Past Performance</h2>
            <p>Any historical performance data, backtests, or simulated results shown on the platform <strong>do not guarantee future performance</strong>. Markets change. Strategies that worked in the past may fail in current conditions.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-3">5. Suitability</h2>
            <p>Options trading is <strong>not suitable for all investors</strong>. You should only use this platform if you:</p>
            <ul className="space-y-1 ml-4 list-disc mt-2">
              <li>Understand how options work and the specific strategies being deployed</li>
              <li>Have been approved by your broker for options trading at the appropriate level</li>
              <li>Can financially and emotionally tolerate the potential loss of all capital deployed</li>
              <li>Are not relying on trading profits as a primary source of income</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-3">6. Paper Trading Recommendation</h2>
            <p>We strongly recommend running all strategies in <strong>paper trading (simulation) mode</strong> for a minimum of 30 trading days before deploying real capital. Enable paper trading mode in Settings → Broker Connection.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-3">7. Acknowledgement</h2>
            <p>By using BotHub Pro you acknowledge that you have read, understood, and accepted this Risk Disclosure Statement in full.</p>
          </section>

        </div>
      </div>
    </div>
  )
}
