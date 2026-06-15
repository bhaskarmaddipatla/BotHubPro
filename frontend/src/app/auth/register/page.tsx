"use client"
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authApi } from '@/lib/api'

const registerSchema = z.object({
  first_name: z.string().min(1, 'First name required'),
  last_name: z.string().min(1, 'Last name required'),
  email: z.string().email('Invalid email'),
  password: z.string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[a-z]/, 'Must contain lowercase letter')
    .regex(/\d/, 'Must contain number'),
  acceptTerms: z.boolean().refine(v => v === true, 'You must accept the Terms of Service'),
  acceptRisk: z.boolean().refine(v => v === true, 'You must acknowledge the Risk Disclosure'),
  acceptSuitability: z.boolean().refine(v => v === true, 'You must confirm suitability'),
})

type RegisterForm = z.infer<typeof registerSchema>

export default function RegisterPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { acceptTerms: false, acceptRisk: false, acceptSuitability: false },
  })

  const onSubmit = async (data: RegisterForm) => {
    setLoading(true)
    try {
      await authApi.register({
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        password: data.password,
      })
      toast.success('Account created! Please check your email to verify.')
      router.push('/auth/login')
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center p-4">
      <Link href="/" className="absolute top-6 left-6 flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        Back to Home
      </Link>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6 hover:opacity-80 transition-opacity">
            <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center font-bold">B</div>
            <span className="text-2xl font-bold text-white">BotHub Pro</span>
          </Link>
          <h1 className="text-2xl font-bold text-white mb-2">Create your account</h1>
          <p className="text-gray-400 text-sm">Start your 7-day free trial today</p>
        </div>

        {/* Risk banner */}
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-3 mb-4 text-xs text-yellow-300">
          ⚠️ <strong>Options trading involves substantial risk of loss.</strong> BotHub Pro is a software tool, not financial advice. Only trade with capital you can afford to lose.
        </div>

        <div className="bg-[#0f1623] border border-[#1e2a3a] rounded-xl p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input {...register('first_name')} placeholder="John" className="bg-[#0a0e1a] border-[#1e2a3a]" />
                {errors.first_name && <p className="text-red-400 text-xs">{errors.first_name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input {...register('last_name')} placeholder="Doe" className="bg-[#0a0e1a] border-[#1e2a3a]" />
                {errors.last_name && <p className="text-red-400 text-xs">{errors.last_name.message}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Email</Label>
              <Input {...register('email')} type="email" placeholder="john@example.com" className="bg-[#0a0e1a] border-[#1e2a3a]" />
              {errors.email && <p className="text-red-400 text-xs">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Password</Label>
              <Input {...register('password')} type="password" placeholder="Min 8 chars, upper, lower, number" className="bg-[#0a0e1a] border-[#1e2a3a]" />
              {errors.password && <p className="text-red-400 text-xs">{errors.password.message}</p>}
            </div>

            {/* Compliance checkboxes */}
            <div className="space-y-3 pt-2 border-t border-[#1e2a3a]">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Required Acknowledgements</p>

              <label className="flex items-start gap-3 cursor-pointer group">
                <input type="checkbox" {...register('acceptTerms')} className="mt-0.5 w-4 h-4 rounded shrink-0" />
                <span className="text-xs text-gray-400 group-hover:text-gray-300">
                  I have read and agree to the{' '}
                  <Link href="/legal/terms" target="_blank" className="text-blue-400 hover:text-blue-300 underline">Terms of Service</Link>
                  {' '}and{' '}
                  <Link href="/legal/privacy" target="_blank" className="text-blue-400 hover:text-blue-300 underline">Privacy Policy</Link>
                </span>
              </label>
              {errors.acceptTerms && <p className="text-red-400 text-xs ml-7">{errors.acceptTerms.message}</p>}

              <label className="flex items-start gap-3 cursor-pointer group">
                <input type="checkbox" {...register('acceptRisk')} className="mt-0.5 w-4 h-4 rounded shrink-0" />
                <span className="text-xs text-gray-400 group-hover:text-gray-300">
                  I have read and understood the{' '}
                  <Link href="/legal/risk-disclosure" target="_blank" className="text-blue-400 hover:text-blue-300 underline">Risk Disclosure Statement</Link>
                  {' '}and acknowledge that options trading involves substantial risk of loss, including loss of all capital
                </span>
              </label>
              {errors.acceptRisk && <p className="text-red-400 text-xs ml-7">{errors.acceptRisk.message}</p>}

              <label className="flex items-start gap-3 cursor-pointer group">
                <input type="checkbox" {...register('acceptSuitability')} className="mt-0.5 w-4 h-4 rounded shrink-0" />
                <span className="text-xs text-gray-400 group-hover:text-gray-300">
                  I confirm that I am 18 or older, have been approved by my broker for options trading, understand the strategies I am deploying, and am not relying on this software as my primary source of income. I understand BotHub Pro does not provide financial advice.
                </span>
              </label>
              {errors.acceptSuitability && <p className="text-red-400 text-xs ml-7">{errors.acceptSuitability.message}</p>}
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>

          <div className="mt-4 text-center text-sm text-gray-400">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-blue-400 hover:text-blue-300">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
