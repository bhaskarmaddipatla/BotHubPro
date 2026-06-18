"use client"
import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { userApi, authApi, api, telegramApi } from '@/lib/api'
import { toast } from 'sonner'
import { User, Lock, Shield, Plug, CheckCircle, XCircle, Loader2, Bell, Send, Unlink, Bug } from 'lucide-react'

type BrokerTab = 'ibkr' | 'moomoo'

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [mfaSetup, setMfaSetup] = useState<any>(null)
  const [mfaCode, setMfaCode] = useState('')

  // Telegram
  const [telegramStatus, setTelegramStatus] = useState<any>(null)
  const [telegramCode, setTelegramCode] = useState<any>(null)
  const [telegramLoading, setTelegramLoading] = useState(false)
  const [connecting, setConnecting] = useState(false)

  // Diagnose mode — stored in localStorage, visible to non-admins for self-service troubleshooting
  const [diagnoseMode, setDiagnoseMode] = useState(false)
  useEffect(() => { setDiagnoseMode(localStorage.getItem('diagnose_mode') === 'true') }, [])
  const toggleDiagnoseMode = (v: boolean) => { setDiagnoseMode(v); localStorage.setItem('diagnose_mode', String(v)) }

  // Broker tab
  const [brokerTab, setBrokerTab] = useState<BrokerTab>('ibkr')

  // IBKR
  const [ibkr, setIbkr] = useState({ host: '', port: 7497, client_id: 1, account: '', paper_account: '', live_account: '', paper_trading: true })
  const [savingIbkr, setSavingIbkr] = useState(false)
  const [testingConn, setTestingConn] = useState(false)
  const [connResult, setConnResult] = useState<{ reachable: boolean; latency_ms: number | null; message: string } | null>(null)

  // Moomoo
  const [moomoo, setMoomoo] = useState({ api_key: '', api_secret: '', account_id: '', paper_trading: true })
  const [savingMoomoo, setSavingMoomoo] = useState(false)

  useEffect(() => {
    userApi.getMe().then(r => { setUser(r.data); setFirstName(r.data.first_name); setLastName(r.data.last_name) }).catch(() => {})
    api.get('/api/v1/broker/ibkr').then(r => { if (r.data) setIbkr(prev => ({ ...prev, ...r.data })) }).catch(() => {})
    api.get('/api/v1/broker/moomoo').then(r => { if (r.data) setMoomoo(prev => ({ ...prev, ...r.data, api_secret: '' })) }).catch(() => {})
    telegramApi.status().then(r => setTelegramStatus(r.data)).catch(() => {})
  }, [])

  const handleUpdateProfile = async () => {
    try { await userApi.updateMe({ first_name: firstName, last_name: lastName }); toast.success('Profile updated') }
    catch { toast.error('Failed to update profile') }
  }

  const handleChangePassword = async () => {
    try { await userApi.changePassword({ current_password: currentPw, new_password: newPw }); toast.success('Password changed'); setCurrentPw(''); setNewPw('') }
    catch (e: any) { toast.error(e.response?.data?.detail || 'Failed') }
  }

  const handleSetupMFA = async () => {
    try { const res = await authApi.setupMFA(); setMfaSetup(res.data) }
    catch { toast.error('Failed to setup MFA') }
  }

  const handleVerifyMFA = async () => {
    try { await authApi.verifyMFA(mfaCode); toast.success('MFA enabled!'); setMfaSetup(null); setMfaCode('') }
    catch { toast.error('Invalid MFA code') }
  }

  const handleSaveIBKR = async () => {
    setSavingIbkr(true)
    try {
      await api.post('/api/v1/broker/ibkr', ibkr)
      toast.success('IBKR credentials saved securely')
    } catch (e: any) { toast.error(e.response?.data?.detail || 'Failed to save') }
    finally { setSavingIbkr(false) }
  }

  const handleTestConnection = async () => {
    setTestingConn(true)
    setConnResult(null)
    try {
      const res = await api.post('/api/v1/broker/test-connection', {}, { timeout: 10000 })
      setConnResult(res.data)
    } catch (e: any) {
      const msg = e.code === 'ECONNABORTED'
        ? 'Request timed out — backend did not respond in 10s'
        : e.response?.data?.detail || 'Connection test failed'
      setConnResult({ reachable: false, latency_ms: null, message: msg })
    } finally { setTestingConn(false) }
  }

  const handleSaveMoomoo = async () => {
    if (!moomoo.api_key) { toast.error('API Key is required'); return }
    setSavingMoomoo(true)
    try {
      await api.post('/api/v1/broker/moomoo', moomoo)
      toast.success('Moomoo credentials saved securely')
    } catch (e: any) { toast.error(e.response?.data?.detail || 'Failed to save') }
    finally { setSavingMoomoo(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Settings" />
      <div className="flex-1 p-6 space-y-6 max-w-2xl">

        <Card className="bg-[#0f1623] border-[#1e2a3a]">
          <CardHeader><CardTitle className="text-base text-white flex items-center gap-2"><User size={16} /> Profile</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>First Name</Label>
                <Input value={firstName} onChange={e => setFirstName(e.target.value)} className="bg-[#0a0e1a] border-[#1e2a3a]" />
              </div>
              <div className="space-y-1">
                <Label>Last Name</Label>
                <Input value={lastName} onChange={e => setLastName(e.target.value)} className="bg-[#0a0e1a] border-[#1e2a3a]" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={user?.email || ''} disabled className="bg-[#0a0e1a] border-[#1e2a3a] opacity-60" />
            </div>
            <Button onClick={handleUpdateProfile}>Save Changes</Button>
          </CardContent>
        </Card>

        <Card className="bg-[#0f1623] border-[#1e2a3a]">
          <CardHeader><CardTitle className="text-base text-white flex items-center gap-2"><Lock size={16} /> Change Password</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Current Password</Label>
              <Input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} className="bg-[#0a0e1a] border-[#1e2a3a]" />
            </div>
            <div className="space-y-1">
              <Label>New Password</Label>
              <Input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} className="bg-[#0a0e1a] border-[#1e2a3a]" />
            </div>
            <Button onClick={handleChangePassword}>Update Password</Button>
          </CardContent>
        </Card>

        <Card className="bg-[#0f1623] border-[#1e2a3a]">
          <CardHeader><CardTitle className="text-base text-white flex items-center gap-2"><Shield size={16} /> Two-Factor Authentication</CardTitle></CardHeader>
          <CardContent>
            {user?.mfa_enabled ? (
              <div className="flex items-center gap-3">
                <span className="bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-sm">MFA Enabled</span>
                <span className="text-gray-400 text-sm">Your account is protected with 2FA</span>
              </div>
            ) : mfaSetup ? (
              <div className="space-y-4">
                <p className="text-gray-400 text-sm">Scan with Google/Microsoft Authenticator:</p>
                <img src={mfaSetup.qr_code_url} alt="MFA QR" className="w-48 h-48 bg-white p-2 rounded-lg" />
                <div className="space-y-1">
                  <Label>Verification Code</Label>
                  <Input value={mfaCode} onChange={e => setMfaCode(e.target.value)} placeholder="000000" maxLength={6}
                    className="bg-[#0a0e1a] border-[#1e2a3a] w-40 text-center tracking-widest text-lg" />
                </div>
                <Button onClick={handleVerifyMFA}>Enable MFA</Button>
              </div>
            ) : (
              <div>
                <p className="text-gray-400 text-sm mb-4">Protect your account with two-factor authentication</p>
                <Button variant="outline" className="border-[#1e2a3a]" onClick={handleSetupMFA}>Setup MFA</Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Broker Connection */}
        <Card className="bg-[#0f1623] border-[#1e2a3a]">
          <CardHeader>
            <CardTitle className="text-base text-white flex items-center gap-2">
              <Plug size={16} /> Broker Connection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Broker tabs */}
            <div className="flex gap-1 bg-[#0a0e1a] p-1 rounded-lg w-fit">
              <button
                onClick={() => setBrokerTab('ibkr')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${brokerTab === 'ibkr' ? 'bg-[#1e2a3a] text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                Interactive Brokers
              </button>
              <button
                onClick={() => setBrokerTab('moomoo')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${brokerTab === 'moomoo' ? 'bg-[#1e2a3a] text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                Moomoo
              </button>
            </div>

            {brokerTab === 'ibkr' && (
              <div className="space-y-4">
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300 space-y-1">
                  <p>📋 TWS / IB Gateway must be running on your local machine with <strong>API connections enabled</strong> (File → Global Configuration → API → Settings → Enable ActiveX and Socket Clients).</p>
                  <p>⚠️ <strong>Docker users:</strong> the backend runs inside a container, so <code className="bg-black/30 px-1 rounded">127.0.0.1</code> refers to the container, not your PC. Use <code className="bg-black/30 px-1 rounded">host.docker.internal</code> (Windows/Mac) or your machine's LAN IP (e.g. <code className="bg-black/30 px-1 rounded">192.168.x.x</code>) as the TWS Host instead.</p>
                </div>

                {/* Paper / Live toggle — switching restores the saved account for that mode */}
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={ibkr.paper_trading}
                      onChange={e => {
                        const isPaper = e.target.checked
                        // Save current account to the outgoing mode, restore the other mode's account
                        const updated = {
                          ...ibkr,
                          paper_trading: isPaper,
                          paper_account: isPaper ? ibkr.paper_account : ibkr.account,
                          live_account:  isPaper ? ibkr.account : ibkr.live_account,
                          account: isPaper ? ibkr.paper_account : ibkr.live_account,
                          port: isPaper ? 7497 : 7496,
                        }
                        setIbkr(updated)
                      }}
                      className="w-4 h-4 rounded" />
                    <span className="text-sm text-gray-300">Paper Trading Mode</span>
                  </label>
                  {ibkr.paper_trading
                    ? <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">Simulated</span>
                    : <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">⚠ Live Trading</span>
                  }
                </div>

                {/* Contextual account hint */}
                <div className={`text-xs rounded-lg px-3 py-2 ${ibkr.paper_trading ? 'bg-yellow-500/10 text-yellow-300 border border-yellow-500/20' : 'bg-red-500/10 text-red-300 border border-red-500/20'}`}>
                  {ibkr.paper_trading
                    ? <>📄 <strong>Paper account</strong> — enter your IBKR paper account ID (starts with <code className="bg-black/30 px-1 rounded">DU</code>, e.g. <code className="bg-black/30 px-1 rounded">DU1234567</code>). Port is auto-set to 7497.</>
                    : <>🔴 <strong>Live account</strong> — enter your real IBKR account ID (starts with <code className="bg-black/30 px-1 rounded">U</code>, e.g. <code className="bg-black/30 px-1 rounded">U1234567</code>). Port is auto-set to 7496. Real capital at risk.</>
                  }
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>TWS Host</Label>
                    <Input value={ibkr.host} onChange={e => setIbkr({...ibkr, host: e.target.value})}
                      placeholder="host.docker.internal" className="bg-[#0a0e1a] border-[#1e2a3a]" />
                  </div>
                  <div className="space-y-1">
                    <Label>Port</Label>
                    <Input type="number" value={ibkr.port} onChange={e => setIbkr({...ibkr, port: +e.target.value})}
                      placeholder={ibkr.paper_trading ? '7497' : '7496'} className="bg-[#0a0e1a] border-[#1e2a3a]" />
                    <p className="text-xs text-gray-500">Paper: 7497 · Live: 7496</p>
                  </div>
                  <div className="space-y-1">
                    <Label>Client ID</Label>
                    <Input type="number" value={ibkr.client_id || ''} onChange={e => setIbkr({...ibkr, client_id: +e.target.value})}
                      placeholder="1" className="bg-[#0a0e1a] border-[#1e2a3a]" />
                  </div>
                  <div className="space-y-1">
                    <Label>{ibkr.paper_trading ? 'Paper Account ID' : 'Live Account ID'}</Label>
                    <Input
                      value={ibkr.account}
                      onChange={e => {
                        const v = e.target.value
                        setIbkr(prev => ({
                          ...prev,
                          account: v,
                          paper_account: prev.paper_trading ? v : prev.paper_account,
                          live_account:  prev.paper_trading ? prev.live_account : v,
                        }))
                      }}
                      placeholder={ibkr.paper_trading ? 'DU1234567' : 'U1234567'}
                      className="bg-[#0a0e1a] border-[#1e2a3a]" />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={handleSaveIBKR} disabled={savingIbkr}>
                    {savingIbkr ? 'Saving...' : 'Save IBKR Credentials'}
                  </Button>
                  <Button variant="outline" className="border-[#1e2a3a]" onClick={handleTestConnection} disabled={testingConn}>
                    {testingConn ? <><Loader2 size={14} className="mr-1 animate-spin" /> Testing...</> : 'Test Connection'}
                  </Button>
                </div>
                {connResult && (
                  <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${connResult.reachable ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                    {connResult.reachable
                      ? <><CheckCircle size={14} /> Connected — {connResult.latency_ms}ms latency</>
                      : <><XCircle size={14} /> {connResult.message}</>
                    }
                  </div>
                )}
              </div>
            )}

            {brokerTab === 'moomoo' && (
              <div className="space-y-4">
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300">
                  📋 Enter your Moomoo OpenAPI credentials. You can find your API key and secret in the Moomoo OpenAPI portal. Your credentials are encrypted before storage.
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>API Key</Label>
                    <Input value={moomoo.api_key} onChange={e => setMoomoo({...moomoo, api_key: e.target.value})}
                      placeholder="Enter your Moomoo API key" className="bg-[#0a0e1a] border-[#1e2a3a]" />
                  </div>
                  <div className="space-y-1">
                    <Label>API Secret</Label>
                    <Input type="password" value={moomoo.api_secret} onChange={e => setMoomoo({...moomoo, api_secret: e.target.value})}
                      placeholder="Enter your Moomoo API secret" className="bg-[#0a0e1a] border-[#1e2a3a]" />
                  </div>
                  <div className="space-y-1">
                    <Label>Account ID <span className="text-gray-500 font-normal">(optional)</span></Label>
                    <Input value={moomoo.account_id} onChange={e => setMoomoo({...moomoo, account_id: e.target.value})}
                      placeholder="e.g. 123456789" className="bg-[#0a0e1a] border-[#1e2a3a]" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={moomoo.paper_trading}
                      onChange={e => setMoomoo({...moomoo, paper_trading: e.target.checked})}
                      className="w-4 h-4 rounded" />
                    <span className="text-sm text-gray-300">Paper Trading Mode</span>
                  </label>
                  {moomoo.paper_trading
                    ? <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">Simulated</span>
                    : <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">⚠ Live Trading</span>
                  }
                </div>
                <Button onClick={handleSaveMoomoo} disabled={savingMoomoo}>
                  {savingMoomoo ? 'Saving...' : 'Save Moomoo Credentials'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Telegram Notifications */}
        <Card className="bg-[#0f1623] border-[#1e2a3a]">
          <CardHeader>
            <CardTitle className="text-base text-white flex items-center gap-2"><Bell size={16} /> Telegram Notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {telegramStatus?.connected ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-sm">Connected</span>
                  <span className="text-gray-400 text-sm">Chat ID: {telegramStatus.chat_id}</span>
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={telegramStatus.notify_live ?? true}
                      onChange={async e => {
                        try {
                          const r = await telegramApi.updatePrefs({ notify_live: e.target.checked })
                          setTelegramStatus((s: any) => ({ ...s, notify_live: r.data.notify_live }))
                          toast.success('Preference saved')
                        } catch { toast.error('Failed to update preference') }
                      }}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-sm text-gray-300">Notify on Live Trades</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={telegramStatus.notify_sim ?? true}
                      onChange={async e => {
                        try {
                          const r = await telegramApi.updatePrefs({ notify_sim: e.target.checked })
                          setTelegramStatus((s: any) => ({ ...s, notify_sim: r.data.notify_sim }))
                          toast.success('Preference saved')
                        } catch { toast.error('Failed to update preference') }
                      }}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-sm text-gray-300">Notify on Simulated Trades</span>
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="border-[#1e2a3a]"
                    disabled={telegramLoading}
                    onClick={async () => {
                      setTelegramLoading(true)
                      try {
                        await telegramApi.test()
                        toast.success('Test message sent!')
                      } catch (e: any) { toast.error(e.response?.data?.detail || 'Failed to send test') }
                      finally { setTelegramLoading(false) }
                    }}
                  >
                    {telegramLoading ? <><Loader2 size={14} className="mr-1 animate-spin" /> Sending...</> : <><Send size={14} className="mr-1" /> Send Test</>}
                  </Button>
                  <Button
                    variant="outline"
                    className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                    onClick={async () => {
                      try {
                        await telegramApi.disconnect()
                        setTelegramStatus((s: any) => ({ ...s, connected: false, chat_id: null }))
                        setTelegramCode(null)
                        toast.success('Telegram disconnected')
                      } catch { toast.error('Failed to disconnect') }
                    }}
                  >
                    <Unlink size={14} className="mr-1" /> Disconnect
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-gray-400 text-sm">Connect your Telegram account to receive trade alerts from your bots.</p>
                {telegramCode ? (
                  <div className="space-y-3">
                    <div className="bg-[#0a0e1a] border border-[#1e2a3a] rounded-lg p-4 space-y-2">
                      <p className="text-sm text-gray-300"><span className="font-semibold text-white">Step 1:</span> Open Telegram and search for <span className="text-blue-400">@{telegramCode.bot_username}</span></p>
                      <p className="text-sm text-gray-300"><span className="font-semibold text-white">Step 2:</span> Send this message to the bot:</p>
                      <div className="bg-black/40 rounded px-3 py-2 font-mono text-green-400 text-sm select-all">/link {telegramCode.code}</div>
                      <p className="text-sm text-gray-300"><span className="font-semibold text-white">Step 3:</span> The bot will confirm your account is linked</p>
                      <p className="text-xs text-yellow-400">Code expires in 10 minutes</p>
                    </div>
                    <Button
                      variant="outline"
                      className="border-[#1e2a3a]"
                      onClick={async () => {
                        try {
                          const r = await telegramApi.status()
                          setTelegramStatus(r.data)
                          if (r.data.connected) { setTelegramCode(null); toast.success('Telegram connected!') }
                          else toast.info('Not linked yet — send the code to the bot first')
                        } catch { toast.error('Failed to check status') }
                      }}
                    >
                      Refresh Status
                    </Button>
                  </div>
                ) : (
                  <Button
                    disabled={connecting}
                    onClick={async () => {
                      setConnecting(true)
                      try {
                        const r = await telegramApi.connect()
                        setTelegramCode(r.data)
                      } catch { toast.error('Failed to generate link code') }
                      finally { setConnecting(false) }
                    }}
                  >
                    {connecting ? <><Loader2 size={14} className="mr-1 animate-spin" /> Generating...</> : 'Connect Telegram'}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Diagnose Mode — only shown to non-admins; admins always have debug tools */}
        {user?.role !== 'admin' && (
          <Card className="bg-[#0f1623] border-[#1e2a3a]">
            <CardHeader><CardTitle className="text-base text-white flex items-center gap-2"><Bug size={16} /> Developer / Troubleshooting</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-gray-400">Enable Diagnose Mode to show the <strong className="text-gray-300">Diagnose</strong> button and <strong className="text-gray-300">Process Log</strong> on the Live Bot Monitor. Useful when troubleshooting connectivity issues with your broker.</p>
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div
                  onClick={() => toggleDiagnoseMode(!diagnoseMode)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${diagnoseMode ? 'bg-blue-600' : 'bg-gray-700'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${diagnoseMode ? 'translate-x-5' : 'translate-x-0'}`} />
                </div>
                <span className="text-sm text-gray-300">{diagnoseMode ? 'Diagnose Mode ON — debug tools visible on bot monitor' : 'Diagnose Mode OFF — debug tools hidden'}</span>
              </label>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  )
}
