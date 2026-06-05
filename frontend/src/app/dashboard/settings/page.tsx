"use client"
import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { userApi, authApi } from '@/lib/api'
import { toast } from 'sonner'
import { User, Lock, Shield } from 'lucide-react'

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [mfaSetup, setMfaSetup] = useState<any>(null)
  const [mfaCode, setMfaCode] = useState('')

  useEffect(() => {
    userApi.getMe().then(r => {
      setUser(r.data)
      setFirstName(r.data.first_name)
      setLastName(r.data.last_name)
    }).catch(() => {})
  }, [])

  const handleUpdateProfile = async () => {
    try {
      await userApi.updateMe({ first_name: firstName, last_name: lastName })
      toast.success('Profile updated')
    } catch { toast.error('Failed to update profile') }
  }

  const handleChangePassword = async () => {
    try {
      await userApi.changePassword({ current_password: currentPw, new_password: newPw })
      toast.success('Password changed')
      setCurrentPw('')
      setNewPw('')
    } catch (e: any) { toast.error(e.response?.data?.detail || 'Failed to change password') }
  }

  const handleSetupMFA = async () => {
    try {
      const res = await authApi.setupMFA()
      setMfaSetup(res.data)
    } catch { toast.error('Failed to setup MFA') }
  }

  const handleVerifyMFA = async () => {
    try {
      await authApi.verifyMFA(mfaCode)
      toast.success('MFA enabled successfully!')
      setMfaSetup(null)
      setMfaCode('')
    } catch { toast.error('Invalid MFA code') }
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
                <p className="text-gray-400 text-sm">Scan this QR code with Google Authenticator or Microsoft Authenticator:</p>
                <img src={mfaSetup.qr_code_url} alt="MFA QR Code" className="w-48 h-48 bg-white p-2 rounded-lg" />
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
      </div>
    </div>
  )
}
