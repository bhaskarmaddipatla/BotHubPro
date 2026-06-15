import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0a0e1a] text-gray-300">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <Link href="/" className="text-blue-400 hover:text-blue-300 text-sm">← Back to Home</Link>
        </div>

        <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-gray-500 text-sm mb-10">Last updated: June 2025</p>

        <div className="space-y-8 text-sm leading-relaxed">

          <section>
            <h2 className="text-white font-semibold text-lg mb-3">1. Information We Collect</h2>
            <ul className="space-y-2 ml-4 list-disc">
              <li><strong>Account information:</strong> name, email address, hashed password</li>
              <li><strong>Broker credentials:</strong> stored encrypted (base64) in our database; never transmitted to third parties</li>
              <li><strong>Usage data:</strong> bot executions, trade logs, performance metrics associated with your account</li>
              <li><strong>Payment information:</strong> processed by Stripe; we do not store card numbers</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-3">2. How We Use Your Information</h2>
            <ul className="space-y-1 ml-4 list-disc">
              <li>To operate and improve the Platform</li>
              <li>To authenticate you and secure your account</li>
              <li>To process subscription payments</li>
              <li>To send service-related emails (verification, billing receipts)</li>
              <li>We do NOT sell your data to third parties</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-3">3. Broker Credential Security</h2>
            <p>Your brokerage API credentials and connection details are encrypted before storage and are only decrypted at the moment a bot process is spawned on your behalf, inside our secure infrastructure. Credentials are never logged or shared.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-3">4. Data Retention</h2>
            <p>We retain your account data for as long as your account is active. Upon account deletion, your personal data is removed within 30 days. Trade logs may be retained in anonymised form for platform analytics.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-3">5. Cookies</h2>
            <p>We use session cookies (JWT tokens) solely for authentication. We do not use third-party tracking or advertising cookies.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-3">6. Your Rights</h2>
            <p>You may request access to, correction of, or deletion of your personal data by contacting us at <a href="mailto:privacy@bothubpro.com" className="text-blue-400 hover:text-blue-300">privacy@bothubpro.com</a>. We will respond within 30 days.</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-3">7. Third-Party Services</h2>
            <ul className="space-y-1 ml-4 list-disc">
              <li><strong>Stripe</strong> — payment processing (<a href="https://stripe.com/privacy" className="text-blue-400">stripe.com/privacy</a>)</li>
              <li><strong>SendGrid</strong> — transactional email delivery</li>
              <li><strong>Interactive Brokers / Moomoo</strong> — brokerage connectivity (governed by their own terms)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-3">8. Contact</h2>
            <p>For privacy inquiries: <a href="mailto:privacy@bothubpro.com" className="text-blue-400 hover:text-blue-300">privacy@bothubpro.com</a></p>
          </section>

        </div>
      </div>
    </div>
  )
}
