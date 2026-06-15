"use client"
import Link from 'next/link'
import { useEffect, useState } from 'react'
import Cookies from 'js-cookie'

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  useEffect(() => {
    setIsLoggedIn(!!Cookies.get('access_token'))
  }, [])
  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white">
      {/* Navigation */}
      <nav className="border-b border-[#1e2a3a] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center font-bold text-sm">B</div>
            <span className="text-xl font-bold text-white">BotHub Pro</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-400">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="#marketplace" className="hover:text-white transition-colors">Marketplace</a>
          </div>
          <div className="flex items-center gap-3">
            {isLoggedIn ? (
              <Link href="/dashboard" className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">Go to Dashboard</Link>
            ) : (
              <>
                <Link href="/auth/login" className="text-sm text-gray-400 hover:text-white transition-colors">Sign In</Link>
                <Link href="/auth/register" className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">Get Started</Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1 text-blue-400 text-sm mb-8">
          <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></span>
          Live Trading Automation Platform
        </div>
        <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
          Automate Your{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
            SPX Trading
          </span>
          {' '}Strategy
        </h1>
        <p className="text-xl text-gray-400 max-w-3xl mx-auto mb-10">
          Professional-grade trading bot platform for options traders. Deploy, monitor, and scale
          your credit spread, iron condor, and butterfly strategies with institutional precision.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link href="/auth/register" className="bg-blue-500 hover:bg-blue-600 text-white px-8 py-3 rounded-lg font-medium transition-colors text-lg">
            Start Free Trial
          </Link>
          <Link href="/marketplace" className="border border-[#1e2a3a] hover:border-blue-500/50 text-white px-8 py-3 rounded-lg font-medium transition-colors text-lg">
            View Bot Marketplace
          </Link>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-[#1e2a3a] py-12">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { label: 'Active Bots', value: '2,400+' },
            { label: 'Daily Executions', value: '18,000+' },
            { label: 'Avg Win Rate', value: '66.8%' },
            { label: 'Total PnL Generated', value: '$4.2M+' },
          ].map((stat) => (
            <div key={stat.label}>
              <div className="text-3xl font-bold text-white mb-1">{stat.value}</div>
              <div className="text-gray-400 text-sm">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">Everything You Need to Automate</h2>
          <p className="text-gray-400 text-lg">Institutional tools built for serious options traders</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { icon: '🤖', title: 'Bot Management', desc: 'Create, configure, and deploy trading bots with JSON configuration and visual parameter editors.' },
            { icon: '📊', title: 'Performance Analytics', desc: 'Detailed equity curves, drawdown charts, win rate tracking, and Sharpe ratio calculations.' },
            { icon: '⚡', title: 'Instant Execution', desc: 'Sub-second order execution with manual triggers, cron scheduling, and market event automation.' },
            { icon: '🔒', title: 'Bank-Grade Security', desc: 'MFA enforcement, encrypted API keys, audit logging, and OWASP-compliant security.' },
            { icon: '📈', title: 'Backtesting Engine', desc: 'Test strategies against historical data before deploying real capital.' },
            { icon: '🔔', title: 'Smart Notifications', desc: 'Real-time alerts via email and dashboard for every trade event and risk condition.' },
          ].map((feature) => (
            <div key={feature.title} className="bg-[#0f1623] border border-[#1e2a3a] rounded-xl p-6 hover:border-blue-500/30 transition-colors">
              <div className="text-3xl mb-4">{feature.icon}</div>
              <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-[#0f1623] py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Simple, Transparent Pricing</h2>
            <p className="text-gray-400 text-lg">Start free, scale as you grow</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              { name: 'Trial', price: 'Free', period: '7 days', features: ['1 bot', '5 executions/day', 'Basic analytics', 'Email support'], cta: 'Start Free', highlight: false },
              { name: 'Monthly', price: '$49', period: '/month', features: ['3 bots', 'Unlimited executions', 'Full analytics', 'Notifications', 'API access'], cta: 'Get Started', highlight: true },
              { name: 'Professional', price: '$99', period: '/month', features: ['10 bots', 'Advanced analytics', 'Multiple brokers', 'Priority support', 'Backtesting'], cta: 'Go Pro', highlight: false },
            ].map((plan) => (
              <div key={plan.name} className={`rounded-xl p-6 border ${plan.highlight ? 'border-blue-500 bg-blue-500/5' : 'border-[#1e2a3a] bg-[#0a0e1a]'}`}>
                {plan.highlight && <div className="text-blue-400 text-xs font-semibold uppercase tracking-wider mb-3">Most Popular</div>}
                <div className="text-xl font-bold mb-1">{plan.name}</div>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-gray-400">{plan.period}</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                      <span className="text-green-400">✓</span> {f}
                    </li>
                  ))}
                </ul>
                <Link href="/auth/register" className={`block text-center py-2 rounded-lg text-sm font-medium transition-colors ${plan.highlight ? 'bg-blue-500 hover:bg-blue-600 text-white' : 'border border-[#1e2a3a] hover:border-blue-500/50 text-white'}`}>
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Marketplace Preview */}
      <section id="marketplace" className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">Bot Marketplace</h2>
          <p className="text-gray-400 text-lg">Deploy proven SPX strategies in minutes</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { name: 'SPX Credit Spread Bot', wr: '68.5%', pf: '1.82', dd: '-12.3%', ret: '+4.2%/mo' },
            { name: 'SPX 0DTE Credit Spread', wr: '72.1%', pf: '1.65', dd: '-18.7%', ret: '+6.8%/mo' },
            { name: 'SPX Iron Fly Bot', wr: '61.3%', pf: '1.94', dd: '-15.2%', ret: '+3.9%/mo' },
          ].map((bot) => (
            <div key={bot.name} className="bg-[#0f1623] border border-[#1e2a3a] rounded-xl p-5 hover:border-blue-500/30 transition-colors">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-sm">{bot.name}</h3>
                <span className="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full">Active</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-[#0a0e1a] rounded-lg p-2">
                  <div className="text-gray-400 mb-0.5">Win Rate</div>
                  <div className="text-green-400 font-semibold">{bot.wr}</div>
                </div>
                <div className="bg-[#0a0e1a] rounded-lg p-2">
                  <div className="text-gray-400 mb-0.5">Profit Factor</div>
                  <div className="text-blue-400 font-semibold">{bot.pf}</div>
                </div>
                <div className="bg-[#0a0e1a] rounded-lg p-2">
                  <div className="text-gray-400 mb-0.5">Max Drawdown</div>
                  <div className="text-red-400 font-semibold">{bot.dd}</div>
                </div>
                <div className="bg-[#0a0e1a] rounded-lg p-2">
                  <div className="text-gray-400 mb-0.5">Monthly Return</div>
                  <div className="text-green-400 font-semibold">{bot.ret}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="text-center mt-8">
          <Link href="/marketplace" className="text-blue-400 hover:text-blue-300 text-sm">View all bots →</Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#1e2a3a] py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-500 rounded flex items-center justify-center font-bold text-xs">B</div>
            <span className="font-semibold">BotHub Pro</span>
          </div>
          <div className="text-gray-400 text-sm">© 2024 BotHub Pro. All rights reserved.</div>
          <div className="flex gap-6 text-sm text-gray-400">
            <a href="#" className="hover:text-white">Privacy</a>
            <a href="#" className="hover:text-white">Terms</a>
            <a href="#" className="hover:text-white">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
