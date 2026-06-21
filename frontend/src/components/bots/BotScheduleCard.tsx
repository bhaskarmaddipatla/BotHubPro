'use client'
import { useState, useEffect } from 'react'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar, Clock } from 'lucide-react'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Singapore',
  'UTC',
]

interface Schedule {
  days_of_week: number[]
  start_time: string
  stop_time: string
  timezone: string
  enabled: boolean
}

export default function BotScheduleCard({ botId, apiBase }: { botId: string; apiBase: string }) {
  const [schedule, setSchedule] = useState<Schedule>({
    days_of_week: [0, 1, 2, 3, 4],
    start_time: '09:30',
    stop_time: '16:00',
    timezone: 'America/New_York',
    enabled: false,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch(`${apiBase}/api/v1/bots/${botId}/schedule`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => setSchedule(data))
      .catch(() => {})
  }, [botId, apiBase])

  const toggleDay = (day: number) => {
    setSchedule(s => ({
      ...s,
      days_of_week: s.days_of_week.includes(day)
        ? s.days_of_week.filter(d => d !== day)
        : [...s.days_of_week, day].sort(),
    }))
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`${apiBase}/api/v1/bots/${botId}/schedule`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schedule),
      })
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Calendar className="h-4 w-4" />
          Bot Schedule
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>Auto-start / Auto-stop</Label>
          <Switch
            checked={schedule.enabled}
            onCheckedChange={v => setSchedule(s => ({ ...s, enabled: v }))}
          />
        </div>

        {schedule.enabled && (
          <>
            <div>
              <Label className="mb-2 block text-sm">Days</Label>
              <div className="flex gap-2 flex-wrap">
                {DAYS.map((day, i) => (
                  <button
                    key={i}
                    onClick={() => toggleDay(i)}
                    className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
                      schedule.days_of_week.includes(i)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="mb-1 block text-sm">Start Time</Label>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <Input
                    type="time"
                    value={schedule.start_time}
                    onChange={e => setSchedule(s => ({ ...s, start_time: e.target.value }))}
                    className="w-full"
                  />
                </div>
              </div>
              <div>
                <Label className="mb-1 block text-sm">Stop Time</Label>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <Input
                    type="time"
                    value={schedule.stop_time}
                    onChange={e => setSchedule(s => ({ ...s, stop_time: e.target.value }))}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            <div>
              <Label className="mb-1 block text-sm">Timezone</Label>
              <Select value={schedule.timezone} onValueChange={v => setSchedule(s => ({ ...s, timezone: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map(tz => (
                    <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <p className="text-xs text-gray-500">
              Bot will auto-start at {schedule.start_time} and stop at {schedule.stop_time} ({schedule.timezone}) on selected days.
            </p>
          </>
        )}

        <Button onClick={save} disabled={saving} className="w-full">
          {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Schedule'}
        </Button>
      </CardContent>
    </Card>
  )
}
