"use client"
import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { subscriptionsApi, userApi } from '@/lib/api'
import { toast } from 'sonner'
import { CreditCard, Check, ShieldCheck } from 'lucide-react'

export default function BillingPage() {
  const [plans, setPlans] = useState<any[]>([])
  const [current, setCurrent] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [subscribingPlan, setSubscribingPlan] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [meLoaded, setMeLoaded] = useState(false)

  useEffect(() => {
    userApi.getMe().then(r => {
      setIsAdmin(r.data.role === 'admin')
      setMeLoaded(true)
    }).catch(() => setMeLoaded(true))
    subscriptionsApi.getPlans().then(r => setPlans(r.data)).catch(() => {})
    subscriptionsApi.getCurrent().then(r => setCurrent(r.data)).catch(() => {})
  }, [])

  const handleStartTrial = async () => {
    setLoading(true)
    try {
      await subscriptionsApi.startTrial()
      toast.success('Trial started! You have 7 days free.')
      subscriptionsApi.getCurrent().then(r => setCurrent(r.data))
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to start trial')
    } finally {
      setLoading(false)
    }
  }

  const handleSubscribe = async (plan: any) => {
    if (plan.plan_type === 'trial') {
      handleStartTrial()
      return
    }
    if (plan.plan_type === 'enterprise') {
      window.open('mailto:sales@bothubpro.com?subject=Enterprise Plan Inquiry', '_blank')
      return
    }
    // Paid plans — Stripe checkout
    setSubscribingPlan(plan.id)
    try {
      // TODO: call POST /api/v1/subscriptions/checkout to get Stripe session URL
      toast.info('Stripe checkout coming soon. Contact sales@bothubpro.com to subscribe.')
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to start checkout')
    } finally {
      setSubscribingPlan(null)
    }
  }

  if (!meLoaded) return null

  // Admin view — no billing needed
  if (isAdmin) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Billing" />
        <div className="flex-1 p-6 flex items-start">
          <Card className="bg-[#0f1623] border-[#1e2a3a] w-full max-w-lg">
            <CardContent className="p-8 flex flex-col items-center text-center gap-4">
              <div className="w-14 h-14 bg-blue-500/10 rounded-full flex items-center justify-center">
                <ShieldCheck size={28} className="text-blue-400" />
              </div>
              <h2 className="text-xl font-bold text-white">Admin Account</h2>
              <p className="text-gray-400 text-sm leading-relaxed">
                Your admin account has full platform access with no subscription required.
                Use the <strong className="text-white">Admin panel</strong> to manage user subscriptions and plans.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const activeSubscription = current && current.status !== 'canceled'

  return (
    <div className="flex flex-col h-full">
      <Header title="Billing" />
      <div className="flex-1 p-6 space-y-6">
        {/* Current plan */}
        <Card className="bg-[#0f1623] border-[#1e2a3a]">
          <CardHeader><CardTitle className="text-base text-white flex items-center gap-2"><CreditCard size={16} /> Current Plan</CardTitle></CardHeader>
          <CardContent>
            {activeSubscription ? (
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-white font-medium">
                    {current.status === 'trialing' ? 'Free Trial' : 'Active Subscription'}
                  </div>
                  <div className="text-gray-400 text-sm mt-1">
                    {current.trial_end
                      ? `Trial ends ${new Date(current.trial_end).toLocaleDateString()}`
                      : current.current_period_end
                        ? `Renews ${new Date(current.current_period_end).toLocaleDateString()}`
                        : ''}
                  </div>
                </div>
                <span className="bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-sm font-medium capitalize">
                  {current.status}
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-white font-medium">No active subscription</div>
                  <div className="text-gray-400 text-sm mt-1">Start your 7-day free trial to get access</div>
                </div>
                <Button onClick={handleStartTrial} disabled={loading}>
                  {loading ? 'Starting...' : 'Start Free Trial'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Plans */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Available Plans</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map((plan) => {
              const isCurrent = activeSubscription && current?.plan_type === plan.plan_type
              const isPopular = plan.plan_type === 'monthly'
              return (
                <Card key={plan.id} className={`bg-[#0f1623] border transition-colors ${isPopular ? 'border-blue-500/50' : 'border-[#1e2a3a]'} ${isCurrent ? 'ring-1 ring-green-500/40' : ''}`}>
                  <CardContent className="p-5 flex flex-col h-full">
                    {isPopular && <div className="text-blue-400 text-xs font-semibold uppercase tracking-wider mb-2">Popular</div>}
                    {isCurrent && <div className="text-green-400 text-xs font-semibold uppercase tracking-wider mb-2">Current Plan</div>}
                    <div className="text-lg font-bold text-white mb-1">{plan.name}</div>
                    <div className="text-3xl font-bold text-white mb-4">
                      {plan.price_monthly === 0 ? 'Free' : `$${plan.price_monthly}`}
                      {plan.price_monthly > 0 && <span className="text-gray-400 text-sm font-normal">/mo</span>}
                    </div>
                    <ul className="space-y-2 mb-5 flex-1">
                      {(plan.features || '').split(',').map((f: string) => (
                        <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                          <Check size={12} className="text-green-400 flex-shrink-0" /> {f.trim()}
                        </li>
                      ))}
                    </ul>
                    <Button
                      className="w-full"
                      variant={isPopular ? 'default' : 'outline'}
                      disabled={isCurrent || subscribingPlan === plan.id}
                      onClick={() => handleSubscribe(plan)}
                    >
                      {isCurrent
                        ? 'Current Plan'
                        : subscribingPlan === plan.id
                          ? 'Loading...'
                          : plan.plan_type === 'enterprise'
                            ? 'Contact Sales'
                            : plan.plan_type === 'trial'
                              ? 'Start Trial'
                              : 'Subscribe'}
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>

        {/* Note about Stripe */}
        <p className="text-xs text-gray-500 text-center">
          Paid plans are processed securely via Stripe. You can cancel anytime from your billing portal.
        </p>
      </div>
    </div>
  )
}
