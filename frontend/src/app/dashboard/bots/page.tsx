"use client"
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { botsApi, executionsApi, api, subscriptionsApi } from '@/lib/api'
import { toast } from 'sonner'
import { Play, Trash2, Upload, Clock, X, FileCode, Lock, Radio } from 'lucide-react'

const categoryColors: Record<string, string> = {
  credit_spread: 'bg-blue-500/20 text-blue-400',
  iron_condor: 'bg-purple-500/20 text-purple-400',
  iron_fly: 'bg-yellow-500/20 text-yellow-400',
  butterfly: 'bg-green-500/20 text-green-400',
  pmcc: 'bg-orange-500/20 text-orange-400',
  calendar: 'bg-cyan-500/20 text-cyan-400',
  custom: 'bg-gray-500/20 text-gray-400',
}

const SCHEDULE_TYPES = [
  { value: 'manual', label: 'Manual Only', icon: '🖱️', description: 'Run on demand via Run button' },
  { value: 'market_open', label: 'Market Open', icon: '🔔', description: 'Every weekday at 9:30 AM ET' },
  { value: 'market_close', label: 'Market Close', icon: '🔕', description: 'Every weekday at 4:00 PM ET' },
  { value: 'daily_time', label: 'Daily at Time', icon: '🕐', description: 'Specific time every weekday' },
  { value: 'cron', label: 'Cron Expression', icon: '⚙️', description: 'Advanced custom schedule' },
]

export default function BotsPage() {
  const router = useRouter()
  const [bots, setBots] = useState<any[]>([])
  const [user, setUser] = useState<any>(null)
  const [subscription, setSubscription] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [showSchedule, setShowSchedule] = useState<string | null>(null)
  const [showFiles, setShowFiles] = useState<string | null>(null)
  const [botFiles, setBotFiles] = useState<any[]>([])
  const [uploading, setUploading] = useState(false)
  const [runningBots, setRunningBots] = useState<Set<string>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)

  const [uploadForm, setUploadForm] = useState({
    name: '', description: '', category: 'custom',
    risk_level: 'medium', entry_file: 'main.py'
  })
  const [scheduleForm, setScheduleForm] = useState({ type: 'manual', value: '09:45' })

  const isAdmin = user?.role === 'admin'
  const hasSubscription = subscription && ['active', 'trialing'].includes(subscription.status)

  useEffect(() => {
    Promise.all([
      api.get('/api/v1/users/me').catch(() => ({ data: null })),
      subscriptionsApi.getCurrent().catch(() => ({ data: null })),
      botsApi.list().catch(() => ({ data: [] })),
    ]).then(([userRes, subRes, botsRes]) => {
      setUser(userRes.data)
      setSubscription(subRes.data)
      setBots(botsRes.data)
    }).finally(() => setLoading(false))
  }, [])

  const handleRun = async (botId: string) => {
    if (!hasSubscription && !isAdmin) {
      toast.error('An active subscription is required to run bots. Please upgrade in Billing.')
      return
    }
    setRunningBots(prev => new Set([...prev, botId]))
    try {
      // Use bot-runner directly — starts subprocess immediately and marks running
      await api.post(`/api/v1/bot-runner/${botId}/start`)
      toast.success('Bot started — opening Live Monitor')
      router.push(`/dashboard/bots/${botId}/live`)
    } catch (e: any) {
      const msg = e.response?.data?.detail || 'Failed to start bot'
      toast.error(msg)
    } finally {
      setRunningBots(prev => { const s = new Set(prev); s.delete(botId); return s })
    }
  }

  const handleDelete = async (botId: string) => {
    if (!confirm('Delete this bot and all its files?')) return
    try {
      await botsApi.delete(botId)
      setBots(bots.filter(b => b.id !== botId))
      toast.success('Bot deleted')
    } catch { toast.error('Failed to delete bot') }
  }

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) { toast.error('Please select a .zip file'); return }
    if (!uploadForm.name) { toast.error('Bot name is required'); return }

    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('name', uploadForm.name)
    fd.append('description', uploadForm.description)
    fd.append('category', uploadForm.category)
    fd.append('risk_level', uploadForm.risk_level)
    fd.append('entry_file', uploadForm.entry_file)

    try {
      const res = await api.post('/api/v1/bots/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setBots([...bots, res.data])
      setShowUpload(false)
      setUploadForm({ name: '', description: '', category: 'custom', risk_level: 'medium', entry_file: 'main.py' })
      if (fileRef.current) fileRef.current.value = ''
      toast.success('Bot uploaded and available to subscribers!')
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleSchedule = async (botId: string) => {
    try {
      await api.post(`/api/v1/bots/${botId}/schedule`, scheduleForm)
      toast.success('Schedule saved')
      setShowSchedule(null)
      const res = await botsApi.list()
      setBots(res.data)
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to set schedule')
    }
  }

  const loadFiles = async (botId: string) => {
    try {
      const res = await api.get(`/api/v1/bots/${botId}/files`)
      setBotFiles(res.data.files)
    } catch { setBotFiles([]) }
    setShowFiles(botId)
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Bots" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-400">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Bots" />
      <div className="flex-1 p-6">

        {/* Header row */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-white">
              {isAdmin ? 'Manage Bots' : 'Available Bots'}
            </h2>
            <p className="text-gray-400 text-sm mt-1">
              {isAdmin
                ? `${bots.length} bot${bots.length !== 1 ? 's' : ''} on the platform`
                : hasSubscription
                  ? `${bots.length} bot${bots.length !== 1 ? 's' : ''} available to run`
                  : 'Subscribe to run trading bots'
              }
            </p>
          </div>
          {isAdmin && (
            <Button className="gap-2" onClick={() => setShowUpload(true)}>
              <Upload size={16} /> Upload Bot
            </Button>
          )}
        </div>

        {/* Subscription banner for non-subscribers */}
        {!isAdmin && !hasSubscription && (
          <div className="mb-6 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Lock size={20} className="text-yellow-400" />
              <div>
                <div className="text-white font-medium text-sm">Subscription Required</div>
                <div className="text-gray-400 text-xs mt-0.5">Upgrade your plan to run these bots on your account</div>
              </div>
            </div>
            <a href="/dashboard/billing">
              <Button size="sm" className="bg-yellow-500 hover:bg-yellow-600 text-black font-medium">
                View Plans
              </Button>
            </a>
          </div>
        )}

        {/* Upload Modal (admin only) */}
        {showUpload && isAdmin && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-[#0f1623] border border-[#1e2a3a] rounded-xl p-6 w-full max-w-lg">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-semibold text-white">Upload Bot</h3>
                <button onClick={() => setShowUpload(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
              </div>
              <div className="space-y-4">
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300">
                  📦 Zip your entire bot folder (e.g. <code>spx_credit_spread.zip</code>). The entry file (default: <code>main.py</code>) will be executed on each run. IBKR credentials are injected as environment variables automatically.
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1 col-span-2">
                    <Label>Bot Name *</Label>
                    <Input value={uploadForm.name} onChange={e => setUploadForm({...uploadForm, name: e.target.value})}
                      placeholder="SPX Credit Spread Bot" className="bg-[#0a0e1a] border-[#1e2a3a]" />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label>Description</Label>
                    <Input value={uploadForm.description} onChange={e => setUploadForm({...uploadForm, description: e.target.value})}
                      placeholder="Describe your strategy..." className="bg-[#0a0e1a] border-[#1e2a3a]" />
                  </div>
                  <div className="space-y-1">
                    <Label>Category</Label>
                    <select value={uploadForm.category} onChange={e => setUploadForm({...uploadForm, category: e.target.value})}
                      className="w-full h-10 rounded-md border border-[#1e2a3a] bg-[#0a0e1a] px-3 text-sm text-white">
                      <option value="credit_spread">Credit Spread</option>
                      <option value="iron_condor">Iron Condor</option>
                      <option value="iron_fly">Iron Fly</option>
                      <option value="butterfly">Butterfly</option>
                      <option value="pmcc">PMCC</option>
                      <option value="calendar">Calendar</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Risk Level</Label>
                    <select value={uploadForm.risk_level} onChange={e => setUploadForm({...uploadForm, risk_level: e.target.value})}
                      className="w-full h-10 rounded-md border border-[#1e2a3a] bg-[#0a0e1a] px-3 text-sm text-white">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label>Entry File (inside zip)</Label>
                    <Input value={uploadForm.entry_file} onChange={e => setUploadForm({...uploadForm, entry_file: e.target.value})}
                      placeholder="main.py" className="bg-[#0a0e1a] border-[#1e2a3a]" />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label>Bot Zip File *</Label>
                    <input type="file" accept=".zip" ref={fileRef}
                      className="w-full text-sm text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-blue-500/20 file:text-blue-400 hover:file:bg-blue-500/30 cursor-pointer" />
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button className="flex-1" onClick={handleUpload} disabled={uploading}>
                    {uploading ? 'Uploading...' : 'Upload Bot'}
                  </Button>
                  <Button variant="outline" className="border-[#1e2a3a]" onClick={() => setShowUpload(false)}>Cancel</Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Schedule Modal */}
        {showSchedule && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-[#0f1623] border border-[#1e2a3a] rounded-xl p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2"><Clock size={18} /> Set Schedule</h3>
                <button onClick={() => setShowSchedule(null)} className="text-gray-400 hover:text-white"><X size={20} /></button>
              </div>
              <div className="space-y-2 mb-5">
                {SCHEDULE_TYPES.map(s => (
                  <button key={s.value} onClick={() => setScheduleForm({...scheduleForm, type: s.value})}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${scheduleForm.type === s.value ? 'border-blue-500/50 bg-blue-500/10' : 'border-[#1e2a3a] hover:border-[#2e3a4a]'}`}>
                    <span className="text-xl">{s.icon}</span>
                    <div>
                      <div className="text-sm font-medium text-white">{s.label}</div>
                      <div className="text-xs text-gray-400">{s.description}</div>
                    </div>
                  </button>
                ))}
              </div>
              {scheduleForm.type === 'daily_time' && (
                <div className="space-y-1 mb-4">
                  <Label>Time (ET, 24h)</Label>
                  <Input type="time" value={scheduleForm.value} onChange={e => setScheduleForm({...scheduleForm, value: e.target.value})}
                    className="bg-[#0a0e1a] border-[#1e2a3a]" />
                </div>
              )}
              {scheduleForm.type === 'cron' && (
                <div className="space-y-1 mb-4">
                  <Label>Cron Expression</Label>
                  <Input value={scheduleForm.value} onChange={e => setScheduleForm({...scheduleForm, value: e.target.value})}
                    placeholder="30 9 * * 1-5" className="bg-[#0a0e1a] border-[#1e2a3a] font-mono" />
                  <p className="text-xs text-gray-500">minute hour day month weekday</p>
                </div>
              )}
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => handleSchedule(showSchedule)}>Save Schedule</Button>
                <Button variant="outline" className="border-[#1e2a3a]" onClick={() => setShowSchedule(null)}>Cancel</Button>
              </div>
            </div>
          </div>
        )}

        {/* Files Modal */}
        {showFiles && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-[#0f1623] border border-[#1e2a3a] rounded-xl p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2"><FileCode size={18} /> Bot Files</h3>
                <button onClick={() => setShowFiles(null)} className="text-gray-400 hover:text-white"><X size={20} /></button>
              </div>
              {botFiles.length === 0 ? (
                <p className="text-gray-400 text-sm">No files uploaded yet</p>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {botFiles.map(f => (
                    <div key={f.name} className="flex items-center justify-between py-2 px-3 rounded bg-[#0a0e1a] text-sm">
                      <span className="text-gray-300 font-mono text-xs">{f.name}</span>
                      <span className="text-gray-500 text-xs">{(f.size / 1024).toFixed(1)} KB</span>
                    </div>
                  ))}
                </div>
              )}
              <Button variant="outline" className="border-[#1e2a3a] mt-4 w-full" onClick={() => setShowFiles(null)}>Close</Button>
            </div>
          </div>
        )}

        {/* Bots Grid */}
        {bots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-[#1e2a3a] rounded-full flex items-center justify-center mb-4">
              <Upload size={24} className="text-gray-400" />
            </div>
            <h3 className="text-white font-medium mb-2">
              {isAdmin ? 'No bots yet' : 'No bots available'}
            </h3>
            <p className="text-gray-400 text-sm mb-6">
              {isAdmin ? 'Upload your first Python bot to make it available to subscribers' : 'Check back soon — the admin is setting up bots for you'}
            </p>
            {isAdmin && (
              <Button className="gap-2" onClick={() => setShowUpload(true)}><Upload size={16} /> Upload Bot</Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bots.map((bot) => (
              <Card key={bot.id} className="bg-[#0f1623] border-[#1e2a3a] hover:border-blue-500/20 transition-colors">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-white text-sm leading-tight">{bot.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ml-2 flex-shrink-0 ${
                      bot.status === 'active' ? 'bg-green-500/20 text-green-400' :
                      bot.status === 'inactive' ? 'bg-gray-500/20 text-gray-400' :
                      'bg-yellow-500/20 text-yellow-400'
                    }`}>{bot.status}</span>
                  </div>

                  {bot.description && <p className="text-gray-400 text-xs mb-3 line-clamp-2">{bot.description}</p>}

                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${categoryColors[bot.category] || 'bg-gray-500/20 text-gray-400'}`}>
                      {bot.category?.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs text-gray-500">{bot.risk_level} risk</span>
                  </div>

                  {bot.schedule_cron && (
                    <div className="flex items-center gap-1.5 mb-3 text-xs text-cyan-400 bg-cyan-500/10 rounded px-2 py-1">
                      <Clock size={10} />
                      <span className="font-mono">
                        {bot.configuration?.schedule_type === 'market_open' ? 'Market Open' :
                         bot.configuration?.schedule_type === 'market_close' ? 'Market Close' :
                         bot.configuration?.schedule_type === 'daily_time' ? `Daily ${bot.configuration?.schedule_value}` :
                         bot.schedule_cron}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5">
                    {/* Run button - all users, but locked if no subscription */}
                    <Button size="sm"
                      className={`flex-1 gap-1 text-xs h-8 ${!hasSubscription && !isAdmin ? 'opacity-60' : ''}`}
                      onClick={() => handleRun(bot.id)}
                      disabled={runningBots.has(bot.id)}>
                      {!hasSubscription && !isAdmin ? <Lock size={11} /> : <Play size={11} />}
                      {runningBots.has(bot.id) ? 'Running...' : hasSubscription || isAdmin ? 'Run Now' : 'Locked'}
                    </Button>

                    {/* Live Monitor button */}
                    {(hasSubscription || isAdmin) && (
                      <Button size="sm" variant="outline"
                        className="border-green-500/30 text-green-400 hover:text-green-300 hover:bg-green-500/10 h-8 gap-1 text-xs"
                        title="Live Monitor"
                        onClick={() => router.push(`/dashboard/bots/${bot.id}/live`)}>
                        <Radio size={11} /> Live
                      </Button>
                    )}

                    {/* Schedule - admin only */}
                    {isAdmin && (
                      <Button size="sm" variant="outline" className="border-[#1e2a3a] text-cyan-400 hover:text-cyan-300 h-8"
                        title="Set Schedule"
                        onClick={() => { setScheduleForm({ type: bot.configuration?.schedule_type || 'manual', value: bot.configuration?.schedule_value || '09:45' }); setShowSchedule(bot.id) }}>
                        <Clock size={13} />
                      </Button>
                    )}

                    {/* View Files - admin only */}
                    {isAdmin && (
                      <Button size="sm" variant="outline" className="border-[#1e2a3a] text-gray-400 hover:text-white h-8"
                        title="View Files" onClick={() => loadFiles(bot.id)}>
                        <FileCode size={13} />
                      </Button>
                    )}

                    {/* Delete - admin only */}
                    {isAdmin && (
                      <Button size="sm" variant="outline" className="border-[#1e2a3a] text-red-400 hover:text-red-300 h-8"
                        onClick={() => handleDelete(bot.id)}>
                        <Trash2 size={13} />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
