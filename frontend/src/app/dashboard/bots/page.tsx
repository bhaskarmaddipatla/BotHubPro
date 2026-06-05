"use client"
import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { botsApi, executionsApi } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, Play, Settings, Trash2 } from 'lucide-react'

const categoryColors: Record<string, string> = {
  credit_spread: 'bg-blue-500/20 text-blue-400',
  iron_condor: 'bg-purple-500/20 text-purple-400',
  iron_fly: 'bg-yellow-500/20 text-yellow-400',
  butterfly: 'bg-green-500/20 text-green-400',
  pmcc: 'bg-orange-500/20 text-orange-400',
  custom: 'bg-gray-500/20 text-gray-400',
}

const statusBadge: Record<string, string> = {
  active: 'bg-green-500/20 text-green-400',
  inactive: 'bg-gray-500/20 text-gray-400',
  pending_approval: 'bg-yellow-500/20 text-yellow-400',
  suspended: 'bg-red-500/20 text-red-400',
}

export default function BotsPage() {
  const [bots, setBots] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    botsApi.list()
      .then(r => setBots(r.data))
      .catch(() => setBots([]))
      .finally(() => setLoading(false))
  }, [])

  const handleRun = async (botId: string) => {
    try {
      await executionsApi.create({ bot_id: botId, trigger: 'manual' })
      toast.success('Bot execution started')
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to run bot')
    }
  }

  const handleDelete = async (botId: string) => {
    try {
      await botsApi.delete(botId)
      setBots(bots.filter(b => b.id !== botId))
      toast.success('Bot deleted')
    } catch (e: any) {
      toast.error('Failed to delete bot')
    }
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Bots" />
      <div className="flex-1 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-white">Your Bots</h2>
            <p className="text-gray-400 text-sm mt-1">{bots.length} bot{bots.length !== 1 ? 's' : ''} configured</p>
          </div>
          <Button className="gap-2">
            <Plus size={16} /> New Bot
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-gray-400">Loading bots...</div>
          </div>
        ) : bots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-[#1e2a3a] rounded-full flex items-center justify-center mb-4">
              <Settings size={24} className="text-gray-400" />
            </div>
            <h3 className="text-white font-medium mb-2">No bots yet</h3>
            <p className="text-gray-400 text-sm mb-6">Create your first trading bot to get started</p>
            <Button className="gap-2"><Plus size={16} /> Create Bot</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bots.map((bot) => (
              <Card key={bot.id} className="bg-[#0f1623] border-[#1e2a3a] hover:border-blue-500/30 transition-colors">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-white text-sm">{bot.name}</h3>
                      <p className="text-gray-400 text-xs mt-0.5 line-clamp-1">{bot.description || 'No description'}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge[bot.status] || 'bg-gray-500/20 text-gray-400'}`}>
                      {bot.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${categoryColors[bot.category] || 'bg-gray-500/20 text-gray-400'}`}>
                      {bot.category.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-gray-500">{bot.risk_level} risk</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" className="flex-1 gap-1 text-xs" onClick={() => handleRun(bot.id)}>
                      <Play size={12} /> Run
                    </Button>
                    <Button size="sm" variant="outline" className="border-[#1e2a3a] text-gray-400 hover:text-white">
                      <Settings size={14} />
                    </Button>
                    <Button size="sm" variant="outline" className="border-[#1e2a3a] text-red-400 hover:text-red-300" onClick={() => handleDelete(bot.id)}>
                      <Trash2 size={14} />
                    </Button>
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
