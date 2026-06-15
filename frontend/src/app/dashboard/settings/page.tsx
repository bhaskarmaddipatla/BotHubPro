"use client"
import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { userApi, authApi, api } from '@/lib/api'
import { toast } from 'sonner'
import { User, Lock, Shield, Plug, CheckCircle, XCircle, Loader2 } from 'lucide-react'

type BrokerTab = 'ibkr' | 'moomoo'

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [mfaSetup, setMfaSetup] = useState<any>(null)
  const [mfaCode, setMfaCode] = useState('')

  // Broker tab
  const [brokerTab, setBrokerTab] = useState<BrokerTab>('ibkr')

  // IBKR
  const [ibkr, setIbkr] = useState({ host: '127.0.0.1', port: 7497, client_id: 1, account: '', paper_trading: true })
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>TWS Host</Label>
                    <Input value={ibkr.host} onChange={e => setIbkr({...ibkr, host: e.target.value})}
                      placeholder="127.0.0.1" className="bg-[#0a0e1a] border-[#1e2a3a]" />
                  </div>
                  <div className="space-y-1">
                    <Label>Port</Label>
                    <Input type="number" value={ibkr.port} onChange={e => setIbkr({...ibkr, port: +e.target.value})}
                      placeholder="7497" className="bg-[#0a0e1a] border-[#1e2a3a]" />
                    <p className="text-xs text-gray-500">Paper: 7497 · Live: 7496</p>
                  </div>
                  <div className="space-y-1">
                    <Label>Client ID</Label>
                    <Input type="number" value={ibkr.client_id} onChange={e => setIbkr({...ibkr, client_id: +e.target.value})}
                      placeholder="1" className="bg-[#0a0e1a] border-[#1e2a3a]" />
                  </div>
                  <div className="space-y-1">
                    <Label>Account ID</Label>
                    <Input value={ibkr.account} onChange={e => setIbkr({...ibkr, account: e.target.value})}
                      placeholder="DU1234567" className="bg-[#0a0e1a] border-[#1e2a3a]" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={ibkr.paper_trading}
                      onChange={e => setIbkr({...ibkr, paper_trading: e.target.checked})}
                      className="w-4 h-4 rounded" />
                    <span className="text-sm text-gray-300">Paper Trading Mode</span>
                  </label>
                  {ibkr.paper_trading
                    ? <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">Simulated</span>
                    : <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">⚠ Live Trading</span>
                  }
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

      </div>
    </div>
  )
}
