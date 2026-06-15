import Link from 'next/link'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#0a0e1a] text-gray-300">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <Link href="/" className="text-blue-400 hover:text-blue-300 text-sm">← Back to Home</Link>
        </div>

        <h1 className="text-3xl font-bold text-white mb-2">Terms of Service</h1>
        <p className="text-gray-500 text-sm mb-10">Last updated: June 2025</p>

        <div className="space-y-8 text-sm leading-relaxed">

          <section>
            <h2 className="text-white font-semibold text-lg mb-3">1. Acceptance of Terms</h2>
            <p>By accessing or using BotHub Pro ("the Platform", "we", "us"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Platform.</p>
          </section>

          <section className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <h2 className="text-red-300 font-semibold text-lg mb-3">2. Important Risk Disclosure — Please Read Carefully</h2>
            <ul className="space-y-2 text-red-200/80">
              <li>• <strong>Options trading involves substantial risk of loss</strong> and is not suitable for all investors. You may lose your entire investment.</li>
              <li>• <strong>Past performance is not indicative of future results.</strong> Historical backtests and simulated results do not guarantee future performance.</li>
              <li>• <strong>Automated trading systems</strong> can experience technical failures, connectivity issues, or unexpected market conditions that result in losses.</li>
              <li>• <strong>BotHub Pro is not a registered investment adviser</strong>, broker-dealer, or financial planner. Nothing on this platform constitutes investment advice, financial advice, or a recommendation to buy or sell any security.</li>
              <li>• You are solely responsible for all trading decisions and for evaluating the risks associated with using automated trading software.</li>
              <li>• Only trade with capital you can afford to lose.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-3">3. Nature of the Service</h2>
            <p className="mb-2">BotHub Pro provides <strong>software tools</strong> that connect to your personal brokerage account and execute trades based on algorithmic rules you have chosen to deploy. The Platform:</p>
            <ul className="space-y-1 ml-4 list-disc">
              <li>Does NOT hold, custody, or manage your funds</li>
              <li>Does NOT provide personalised investment advice</li>
              <li>Does NOT guarantee any particular trading outcome</li>
              <li>Operates solely through your own brokerage account (Interactive Brokers, Moomoo, etc.)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-3">4. Eligibility</h2>
            <p>You must be at least 18 years old and legally permitted to trade options in your jurisdiction. By registering, you represent that you have the legal capacity and appropriate brokerage account permissions to trade options.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-3">5. Subscriptions and Billing</h2>
            <p className="mb-2">Subscription fees are charged in advance on a monthly or annual basis. All fees are non-refundable except where required by applicable law. We reserve the right to change pricing with 30 days' notice.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-3">6. Prohibited Use</h2>
            <ul className="space-y-1 ml-4 list-disc">
              <li>You may not use the Platform to engage in market manipulation or any illegal trading activity</li>
              <li>You may not share your account credentials</li>
              <li>You may not reverse-engineer or resell the Platform's algorithms</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-3">7. Limitation of Liability</h2>
            <p>To the maximum extent permitted by law, BotHub Pro and its operators shall not be liable for any direct, indirect, incidental, or consequential damages arising from your use of the Platform, including but not limited to trading losses, missed opportunities, or technical failures.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-3">8. Termination</h2>
            <p>We reserve the right to suspend or terminate your account at our discretion, including for violation of these Terms. You may cancel your subscription at any time through the Billing page.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-3">9. Governing Law</h2>
            <p>These Terms shall be governed by and construed in accordance with the laws of the State of Delaware, United States, without regard to conflict of law provisions.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-3">10. Contact</h2>
            <p>For questions about these Terms, contact us at <a href="mailto:legal@bothubpro.com" className="text-blue-400 hover:text-blue-300">legal@bothubpro.com</a>.</p>
          </section>

        </div>
      </div>
    </div>
  )
}
