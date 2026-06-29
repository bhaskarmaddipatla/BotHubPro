'use client'
import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, Calendar } from 'lucide-react'

export interface TradeEntry {
  time?: string; timestamp?: string
  action?: string; side?: string
  symbol?: string; instrument?: string; description?: string
  status?: string
  qty?: string | number
  price?: string | number; filled_price?: string | number; credit?: string | number
  pnl?: string | number
  group_id?: string; trade_id?: string; spread_id?: string
  [key: string]: unknown
}

function fmtTime(raw?: string): string {
  if (!raw) return '—'
  try {
    const d = new Date(raw)
    if (isNaN(d.getTime())) return raw.length > 19 ? raw.slice(11, 19) : raw
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/New_York', hour12: true })
  } catch { return raw }
}

function fmtPnl(val?: string | number): string {
  if (val === undefined || val === null || val === '') return '—'
  const n = Number(val)
  if (isNaN(n)) return String(val)
  return `${n >= 0 ? '+' : ''}$${n.toFixed(2)}`
}

function fmtPrice(val?: string | number): string {
  if (val === undefined || val === null || val === '') return '—'
  const n = Number(val)
  return isNaN(n) ? String(val) : n.toFixed(2)
}

// Returns YYYY-MM-DD in ET timezone
function todayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

function tradeDate(t: TradeEntry): string {
  const raw = t.time ?? t.timestamp ?? ''
  if (!raw) return ''
  try {
    return new Date(raw).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  } catch { return '' }
}

interface SpreadGroup {
  id: string
  instrument: string
  entries: TradeEntry[]
  exits: TradeEntry[]
  all: TradeEntry[]
  netPnl?: number
  status: 'open' | 'closed' | 'failed'
  openTime?: string
  closeTime?: string
  entryCredit?: number
}

function groupTrades(trades: TradeEntry[]): SpreadGroup[] {
  const filtered = trades.filter(t => t.action)
  const groups: SpreadGroup[] = []
  const byGroupId: Record<string, TradeEntry[]> = {}

  const hasIds = filtered.some(t => t.group_id || t.trade_id || t.spread_id)
  if (hasIds) {
    for (const t of filtered) {
      const id = String(t.group_id ?? t.trade_id ?? t.spread_id ?? 'ungrouped')
      if (!byGroupId[id]) byGroupId[id] = []
      byGroupId[id].push(t)
    }
    for (const [id, rows] of Object.entries(byGroupId)) {
      groups.push(buildGroup(id, rows))
    }
    return groups
  }

  let current: TradeEntry[] | null = null
  let groupIdx = 0
  for (const t of filtered) {
    const action = String(t.action ?? '').toUpperCase()
    const isEntry = action.includes('ENTRY') || action === 'SELL TO OPEN'
    const isExit = action.includes('EXIT') || action === 'BUY TO CLOSE'

    if (isEntry) {
      if (current && current.length > 0) groups.push(buildGroup(String(groupIdx++), current))
      current = [t]
    } else if (isExit) {
      if (!current) current = []
      current.push(t)
    } else {
      if (!current) current = []
      current.push(t)
    }
  }
  if (current && current.length > 0) groups.push(buildGroup(String(groupIdx), current))
  return groups
}

function buildGroup(id: string, rows: TradeEntry[]): SpreadGroup {
  const entries = rows.filter(r => {
    const a = String(r.action ?? '').toUpperCase()
    return a.includes('ENTRY') || a === 'SELL TO OPEN'
  })
  const exits = rows.filter(r => {
    const a = String(r.action ?? '').toUpperCase()
    return a.includes('EXIT') || a === 'BUY TO CLOSE'
  })

  const instrument = String(rows[0]?.instrument ?? rows[0]?.description ?? rows[0]?.symbol ?? 'SPX Spread')
  const allTimes = rows.map(r => r.time ?? r.timestamp).filter(Boolean) as string[]
  const sorted = [...allTimes].sort()
  const openTime = sorted[0]
  const closeTime = exits.length > 0 ? sorted[sorted.length - 1] : undefined
  const pnlVals = exits.map(r => Number(r.pnl ?? NaN)).filter(n => !isNaN(n))
  const netPnl = pnlVals.length > 0 ? pnlVals.reduce((a, b) => a + b, 0) : undefined
  const creditVals = entries.map(r => Number(r.filled_price ?? r.price ?? r.credit ?? NaN)).filter(n => !isNaN(n))
  const entryCredit = creditVals.length > 0 ? creditVals.reduce((a, b) => a + b, 0) / creditVals.length : undefined
  const hasFailedExit = exits.some(r => String(r.status ?? '').toUpperCase() === 'FAILED')
  const status: SpreadGroup['status'] = exits.length > 0 && !hasFailedExit ? 'closed' : hasFailedExit ? 'failed' : 'open'

  return { id, instrument, entries, exits, all: rows, netPnl, status, openTime, closeTime, entryCredit }
}

export function countTradeGroups(trades: TradeEntry[]): number {
  return groupTrades(trades).length
}

type FilterMode = 'today' | 'custom'

export default function BotTradeLog({ trades }: { trades: TradeEntry[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [filterMode, setFilterMode] = useState<FilterMode>('today')
  const [fromDate, setFromDate] = useState(todayET())
  const [toDate, setToDate] = useState(todayET())

  const toggle = (id: string) => setExpanded(e => ({ ...e, [id]: !e[id] }))

  const filtered = useMemo(() => {
    if (filterMode === 'today') {
      const today = todayET()
      return trades.filter(t => tradeDate(t) === today)
    }
    return trades.filter(t => {
      const d = tradeDate(t)
      return d >= fromDate && d <= toDate
    })
  }, [trades, filterMode, fromDate, toDate])

  const groups = groupTrades(filtered)

  const totalPnl = groups.reduce((sum, g) => sum + (g.netPnl ?? 0), 0)
  const closedGroups = groups.filter(g => g.status === 'closed')

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1e2a3a] flex-wrap">
        <Calendar size={12} className="text-gray-500 shrink-0" />
        <button
          onClick={() => setFilterMode('today')}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
            filterMode === 'today'
              ? 'bg-blue-600/20 border-blue-500/50 text-blue-400'
              : 'border-[#1e2a3a] text-gray-500 hover:text-gray-300'
          }`}
        >
          Today
        </button>
        <button
          onClick={() => setFilterMode('custom')}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
            filterMode === 'custom'
              ? 'bg-blue-600/20 border-blue-500/50 text-blue-400'
              : 'border-[#1e2a3a] text-gray-500 hover:text-gray-300'
          }`}
        >
          Custom
        </button>
        {filterMode === 'custom' && (
          <>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="text-xs bg-[#0a0e1a] border border-[#1e2a3a] rounded px-2 py-0.5 text-gray-300 focus:outline-none focus:border-blue-500/50"
            />
            <span className="text-gray-600 text-xs">→</span>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="text-xs bg-[#0a0e1a] border border-[#1e2a3a] rounded px-2 py-0.5 text-gray-300 focus:outline-none focus:border-blue-500/50"
            />
          </>
        )}
        {groups.length > 0 && (
          <span className="ml-auto text-xs text-gray-500">
            {closedGroups.length} closed
            {closedGroups.length > 0 && (
              <span className={`ml-2 font-medium ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
              </span>
            )}
          </span>
        )}
      </div>

      {/* Table */}
      {groups.length === 0 ? (
        <p className="text-gray-600 text-xs text-center py-5">No trades for selected period</p>
      ) : (
        <div className="overflow-auto flex-1">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[#0f1623] z-10">
              <tr className="text-gray-500 border-b border-[#1e2a3a]">
                <th className="text-left px-3 py-1.5 w-6"></th>
                <th className="text-left px-3 py-1.5">Instrument</th>
                <th className="text-left px-3 py-1.5">Status</th>
                <th className="text-left px-3 py-1.5">Opened (ET)</th>
                <th className="text-left px-3 py-1.5">Closed (ET)</th>
                <th className="text-right px-3 py-1.5">Credit</th>
                <th className="text-right px-3 py-1.5">Net P&L</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const isOpen = expanded[g.id]
                const statusColor = g.status === 'closed' ? 'text-green-400'
                  : g.status === 'failed' ? 'text-red-500'
                  : 'text-yellow-400'
                const statusLabel = g.status === 'closed' ? 'Closed'
                  : g.status === 'failed' ? 'Failed' : 'Open'
                const pnlColor = g.netPnl === undefined ? 'text-gray-500'
                  : g.netPnl >= 0 ? 'text-green-400' : 'text-red-400'

                return (
                  <>
                    <tr
                      key={`g-${g.id}`}
                      className="border-b border-[#1e2a3a]/60 hover:bg-[#1e2a3a]/40 cursor-pointer"
                      onClick={() => toggle(g.id)}
                    >
                      <td className="px-3 py-2 text-gray-500">
                        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      </td>
                      <td className="px-3 py-2 font-mono text-gray-200 font-medium">{g.instrument}</td>
                      <td className={`px-3 py-2 font-medium ${statusColor}`}>{statusLabel}</td>
                      <td className="px-3 py-2 text-gray-400">{fmtTime(g.openTime)}</td>
                      <td className="px-3 py-2 text-gray-400">{g.closeTime ? fmtTime(g.closeTime) : '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-300">
                        {g.entryCredit !== undefined ? g.entryCredit.toFixed(2) : '—'}
                      </td>
                      <td className={`px-3 py-2 text-right font-medium ${pnlColor}`}>
                        {g.netPnl !== undefined ? fmtPnl(g.netPnl) : g.status === 'open' ? <span className="text-gray-500">Open</span> : '—'}
                      </td>
                    </tr>

                    {isOpen && g.all.map((t, i) => {
                      const action = String(t.action ?? '').toUpperCase()
                      const isEntry = action.includes('ENTRY') || action === 'SELL TO OPEN'
                      const status = String(t.status ?? '')
                      const rowStatusColor = status.toLowerCase() === 'filled' ? 'text-green-400'
                        : status.toLowerCase().includes('work') || status.toLowerCase() === 'submitted' ? 'text-yellow-400'
                        : status.toLowerCase() === 'failed' ? 'text-red-500'
                        : 'text-gray-400'
                      const price = t.filled_price ?? t.price ?? t.credit
                      return (
                        <tr key={`g-${g.id}-r-${i}`} className="border-b border-[#1e2a3a]/30 bg-[#0a1020]">
                          <td className="px-3 py-1.5"></td>
                          <td className="px-3 py-1.5 text-gray-500 pl-6">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${isEntry ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'}`}>
                              {String(t.side ?? (isEntry ? 'Sell to Open' : 'Buy to Close'))}
                            </span>
                          </td>
                          <td className={`px-3 py-1.5 ${rowStatusColor}`}>{status || '—'}</td>
                          <td className="px-3 py-1.5 text-gray-500">{fmtTime(String(t.time ?? t.timestamp ?? ''))}</td>
                          <td className="px-3 py-1.5 text-gray-500">
                            {t.qty !== undefined ? `${t.qty} contract${Number(t.qty) !== 1 ? 's' : ''}` : '—'}
                          </td>
                          <td className="px-3 py-1.5 text-right text-gray-300">{fmtPrice(price)}</td>
                          <td className={`px-3 py-1.5 text-right font-medium ${t.pnl !== undefined ? (Number(t.pnl) >= 0 ? 'text-green-400' : 'text-red-400') : 'text-gray-500'}`}>
                            {t.pnl !== undefined ? fmtPnl(t.pnl) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
