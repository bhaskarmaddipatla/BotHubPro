'use client'
import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar, Clock, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

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

const DEFAULT_SCHEDULE: Schedule = {
  days_of_week: [0, 1, 2, 3, 4],
  start_time: '09:30',
  stop_time: '16:00',
  timezone: 'America/New_York',
  enabled: false,
}

function scheduleEqual(a: Schedule, b: Schedule): boolean {
  return (
    a.enabled === b.enabled &&
    a.start_time === b.start_time &&
    a.stop_time === b.stop_time &&
    a.timezone === b.timezone &&
    JSON.stringify([...a.days_of_week].sort()) === JSON.stringify([...b.days_of_week].sort())
  )
}

export default function BotScheduleCard({ botId, apiBase }: { botId: string; apiBase: string }) {
  const storageKey = `bot_schedule_${botId}`

  const [schedule, setSchedule] = useState<Schedule>(() => {
    try {
      const cached = localStorage.getItem(storageKey)
      if (cached) return { ...DEFAULT_SCHEDULE, ...JSON.parse(cached) }
    } catch {}
    return DEFAULT_SCHEDULE
  })

  // Track the last saved/server state to know if there are unsaved changes
  const [savedSchedule, setSavedSchedule] = useState<Schedule>(schedule)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const justSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isDirty = !scheduleEqual(schedule, savedSchedule)

  useEffect(() => {
    fetch(`${apiBase}/api/v1/bots/${botId}/schedule`, { credentials: 'include' })
      .then(r => { if (r.ok) return r.json(); throw new Error('fetch failed') })
      .then(data => {
        if (data && typeof data === 'object') {
          const merged: Schedule = {
            ...DEFAULT_SCHEDULE,
            ...data,
            days_of_week: Array.isArray(data.days_of_week) ? data.days_of_week : DEFAULT_SCHEDULE.days_of_week,
          }
          setSchedule(merged)
          setSavedSchedule(merged)
          try { localStorage.setItem(storageKey, JSON.stringify(merged)) } catch {}
        }
      })
      .catch(() => {})
  }, [botId, apiBase, storageKey])

  const toggleDay = (day: number) => {
    setSchedule(s => {
      const days = Array.isArray(s.days_of_week) ? s.days_of_week : []
      return {
        ...s,
        days_of_week: days.includes(day)
          ? days.filter(d => d !== day)
          : [...days, day].sort(),
      }
    })
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
      if (res.ok) {
        setSavedSchedule(schedule)
        try { localStorage.setItem(storageKey, JSON.stringify(schedule)) } catch {}
        setJustSaved(true)
        toast.success('Schedule saved')
        if (justSavedTimer.current) clearTimeout(justSavedTimer.current)
        justSavedTimer.current = setTimeout(() => setJustSaved(false), 3000)
      } else {
        toast.error('Failed to save schedule')
      }
    } catch {
      toast.error('Failed to save schedule')
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
          <Label htmlFor="schedule-enabled">Auto-start / Auto-stop</Label>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              id="schedule-enabled"
              type="checkbox"
              className="sr-only peer"
              checked={schedule.enabled}
              onChange={e => setSchedule(s => ({ ...s, enabled: e.target.checked }))}
            />
            <div className="w-11 h-6 bg-gray-600 peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5" />
          </label>
        </div>

        {schedule.enabled && (
          <>
            <div>
              <Label className="mb-2 block text-sm">Days</Label>
              <div className="flex gap-2 flex-wrap">
                {DAYS.map((day, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
                      (Array.isArray(schedule.days_of_week) ? schedule.days_of_week : []).includes(i)
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
                  <Clock className="h-4 w-4 text-gray-400 shrink-0" />
                  <Input
                    type="time"
                    value={schedule.start_time}
                    onChange={e => setSchedule(s => ({ ...s, start_time: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <Label className="mb-1 block text-sm">Stop Time</Label>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-400 shrink-0" />
                  <Input
                    type="time"
                    value={schedule.stop_time}
                    onChange={e => setSchedule(s => ({ ...s, stop_time: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div>
              <Label className="mb-1 block text-sm">Timezone</Label>
              <select
                value={schedule.timezone}
                onChange={e => setSchedule(s => ({ ...s, timezone: e.target.value }))}
                className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {TIMEZONES.map(tz => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>

            <p className="text-xs text-gray-500">
              Bot will auto-start at {schedule.start_time} and stop at {schedule.stop_time} ({schedule.timezone}) on selected days.
            </p>
          </>
        )}

        <Button
          onClick={save}
          disabled={saving || (!isDirty && !justSaved)}
          className={`w-full transition-colors ${justSaved && !isDirty ? 'bg-green-600 hover:bg-green-700' : ''}`}
        >
          {justSaved && !isDirty
            ? <><CheckCircle2 className="h-4 w-4 mr-1.5" />Saved</>
            : saving ? 'Saving...'
            : isDirty ? 'Save Schedule'
            : 'Saved'}
        </Button>
      </CardContent>
    </Card>
  )
}
