"use client"
import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Users, Activity, BarChart3, Shield, Clock } from 'lucide-react'

export default function AdminPage() {
  const [metrics, setMetrics] = useState<any>(null)
  const [users, setUsers] = useState<any[]>([])
  const [pendingSubs, setPendingSubs] = useState<any[]>([])

  const refresh = () => {
    api.get('/api/v1/admin/metrics').then(r => setMetrics(r.data)).catch(() => {})
    api.get('/api/v1/admin/users?limit=50').then(r => setUsers(r.data)).catch(() => {})
    api.get('/api/v1/admin/subscriptions/pending').then(r => setPendingSubs(r.data)).catch(() => {})
  }

  useEffect(() => { refresh() }, [])

  const handleSuspend = async (userId: string) => {
    try {
      await api.post(`/api/v1/admin/users/${userId}/suspend`)
      toast.success('User suspended')
      setUsers(users.map(u => u.id === userId ? {...u, status: 'suspended'} : u))
    } catch { toast.error('Failed') }
  }

  const handleActivate = async (userId: string) => {
    try {
      await api.post(`/api/v1/admin/users/${userId}/activate`)
      toast.success('User activated')
      setUsers(users.map(u => u.id === userId ? {...u, status: 'active'} : u))
    } catch { toast.error('Failed') }
  }

  const handleApproveSub = async (subId: string) => {
    try {
      await api.post(`/api/v1/admin/subscriptions/${subId}/approve`)
      toast.success('Subscription approved')
      setPendingSubs(pendingSubs.filter(s => s.id !== subId))
      refresh()
    } catch { toast.error('Failed to approve') }
  }

  const handleRejectSub = async (subId: string) => {
    try {
      await api.post(`/api/v1/admin/subscriptions/${subId}/reject`)
      toast.success('Subscription rejected')
      setPendingSubs(pendingSubs.filter(s => s.id !== subId))
    } catch { toast.error('Failed to reject') }
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Admin Dashboard" />
      <div className="flex-1 p-6 space-y-6">
        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Users', value: metrics?.total_users ?? 0, icon: Users, color: 'text-blue-400' },
            { label: 'Active Subscribers', value: metrics?.active_subscribers ?? 0, icon: Shield, color: 'text-green-400' },
            { label: 'Total Executions', value: metrics?.total_executions ?? 0, icon: Activity, color: 'text-purple-400' },
            { label: 'Total Bots', value: metrics?.total_bots ?? 0, icon: BarChart3, color: 'text-yellow-400' },
          ].map((m) => {
            const Icon = m.icon
            return (
              <Card key={m.label} className="bg-[#0f1623] border-[#1e2a3a]">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-400 text-xs">{m.label}</span>
                    <Icon size={16} className={m.color} />
                  </div>
                  <div className="text-2xl font-bold text-white">{m.value}</div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Pending Subscription Approvals */}
        <Card className="bg-[#0f1623] border-[#1e2a3a]">
          <CardHeader>
            <CardTitle className="text-base text-white flex items-center gap-2">
              <Clock size={16} className="text-yellow-400" />
              Pending Subscription Approvals
              {pendingSubs.length > 0 && (
                <span className="ml-2 bg-yellow-500/20 text-yellow-400 text-xs px-2 py-0.5 rounded-full">{pendingSubs.length}</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {pendingSubs.length === 0 ? (
              <p className="px-4 pb-4 text-gray-400 text-sm">No pending approvals.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#1e2a3a]">
                      {['User', 'Email', 'Plan', 'Requested', 'Actions'].map(h => (
                        <th key={h} className="text-left py-3 px-4 text-gray-400 font-medium text-xs">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pendingSubs.map(s => (
                      <tr key={s.id} className="border-b border-[#1e2a3a]/50 hover:bg-[#1e2a3a]/30">
                        <td className="py-3 px-4 text-white">{s.user_name}</td>
                        <td className="py-3 px-4 text-gray-300 text-xs">{s.user_email}</td>
                        <td className="py-3 px-4 text-gray-300">{s.plan_name}</td>
                        <td className="py-3 px-4 text-gray-400 text-xs">{s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}</td>
                        <td className="py-3 px-4 flex gap-2">
                          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white text-xs h-7"
                            onClick={() => handleApproveSub(s.id)}>Approve</Button>
                          <Button size="sm" variant="outline" className="border-red-500/30 text-red-400 hover:text-red-300 text-xs h-7"
                            onClick={() => handleRejectSub(s.id)}>Reject</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* User Management */}
        <Card className="bg-[#0f1623] border-[#1e2a3a]">
          <CardHeader><CardTitle className="text-base text-white">User Management</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1e2a3a]">
                    {['Name', 'Email', 'Role', 'Status', 'MFA', 'Actions'].map(h => (
                      <th key={h} className="text-left py-3 px-4 text-gray-400 font-medium text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-b border-[#1e2a3a]/50 hover:bg-[#1e2a3a]/30">
                      <td className="py-3 px-4 text-white">{u.first_name} {u.last_name}</td>
                      <td className="py-3 px-4 text-gray-300 text-xs">{u.email}</td>
                      <td className="py-3 px-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${u.role === 'admin' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          u.status === 'active' ? 'bg-green-500/20 text-green-400' :
                          u.status === 'suspended' ? 'bg-red-500/20 text-red-400' :
                          'bg-yellow-500/20 text-yellow-400'}`}>
                          {u.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs">{u.mfa_enabled ? <span className="text-green-400">✓</span> : <span className="text-gray-500">—</span>}</td>
                      <td className="py-3 px-4">
                        {u.role !== 'admin' && (
                          u.status !== 'suspended' ? (
                            <Button size="sm" variant="outline" className="border-red-500/30 text-red-400 hover:text-red-300 text-xs h-7"
                              onClick={() => handleSuspend(u.id)}>Suspend</Button>
                          ) : (
                            <Button size="sm" variant="outline" className="border-green-500/30 text-green-400 hover:text-green-300 text-xs h-7"
                              onClick={() => handleActivate(u.id)}>Activate</Button>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr><td colSpan={6} className="py-8 text-center text-gray-400 text-sm">No users found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
