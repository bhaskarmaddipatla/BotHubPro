"use client"
import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { subscriptionsApi } from '@/lib/api'
import { toast } from 'sonner'
import { CreditCard, Check } from 'lucide-react'

export default function BillingPage() {
  const [plans, setPlans] = useState<any[]>([])
  const [current, setCurrent] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
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

  return (
    <div className="flex flex-col h-full">
      <Header title="Billing" />
      <div className="flex-1 p-6 space-y-6">
        {/* Current plan */}
        <Card className="bg-[#0f1623] border-[#1e2a3a]">
          <CardHeader><CardTitle className="text-base text-white flex items-center gap-2"><CreditCard size={16} /> Current Plan</CardTitle></CardHeader>
          <CardContent>
            {current ? (
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-white font-medium">{current.status === 'trialing' ? 'Free Trial' : 'Active Subscription'}</div>
                  <div className="text-gray-400 text-sm mt-1">
                    {current.trial_end ? `Trial ends ${new Date(current.trial_end).toLocaleDateString()}` : `Renews ${new Date(current.current_period_end).toLocaleDateString()}`}
                  </div>
                </div>
                <span className="bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-sm font-medium capitalize">{current.status}</span>
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
            {plans.map((plan) => (
              <Card key={plan.id} className={`bg-[#0f1623] border transition-colors ${plan.plan_type === 'monthly' ? 'border-blue-500/50' : 'border-[#1e2a3a]'}`}>
                <CardContent className="p-5">
                  {plan.plan_type === 'monthly' && <div className="text-blue-400 text-xs font-semibold uppercase tracking-wider mb-2">Popular</div>}
                  <div className="text-lg font-bold text-white mb-1">{plan.name}</div>
                  <div className="text-3xl font-bold text-white mb-4">
                    {plan.price_monthly === 0 ? 'Free' : `$${plan.price_monthly}`}
                    {plan.price_monthly > 0 && <span className="text-gray-400 text-sm font-normal">/mo</span>}
                  </div>
                  <ul className="space-y-2 mb-5">
                    {(plan.features || '').split(',').map((f: string) => (
                      <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                        <Check size={12} className="text-green-400 flex-shrink-0" /> {f.trim()}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    variant={plan.plan_type === 'monthly' ? 'default' : 'outline'}
                    disabled={plan.plan_type === 'enterprise'}
                  >
                    {plan.plan_type === 'enterprise' ? 'Contact Sales' : plan.plan_type === 'trial' ? 'Start Trial' : 'Subscribe'}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
