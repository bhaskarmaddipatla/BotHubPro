"use client"
import { useEffect, useState, useRef, useCallback } from 'react'
import { botsApi, botRunnerApi } from '@/lib/api'
import { Terminal, RefreshCw, Copy, Check, Search, X, ChevronDown, ChevronRight, AlertCircle, Info, AlertTriangle } from 'lucide-react'

interface Bot { id: string; name: string }
interface LogResult {
  lines: string[]
  total_lines: number
  filtered_lines?: number
  message?: string
  error?: string
}

// ── View presets ──────────────────────────────────────────────────────────────
// Each preset is a list of regex patterns; a line is kept if ANY pattern matches.
// Empty patterns array = keep all lines.
const VIEW_PRESETS: Record<string, { label: string; color: string; patterns: RegExp[] }> = {
  all: {
    label: 'All Logs',
    color: 'text-gray-300',
    patterns: [],
  },
  trades: {
    label: 'Trades Only',
    color: 'text-green-400',
    patterns: [
      /order\s+(submit|place|fill|execut|cancel|reject)/i,
      /trade\s+(open|close|enter|exit|placed|executed)/i,
      /position\s+(open|close|enter|exit)/i,
      /entry|exit_trade|place_order|order_filled|order_id/i,
      /BUY|SELL.*spread|spread.*SELL|spread.*BUY/i,
      /stop.loss|take.profit|profit.target/i,
      /credit.*\$|debit.*\$|\$.*credit|\$.*debit/i,
      /net.*p&l|p&l|pnl/i,
      /closed.*position|position.*closed/i,
      /trade=True|trade=False.*confidence/i,
      /MASTER:.*trade=/i,
    ],
  },
  decisions: {
    label: 'AI Decisions',
    color: 'text-purple-400',
    patterns: [
      /MASTER:|master analyst/i,
      /trade=True|trade=False/i,
      /confidence=\d/i,
      /No Trade|no_trade/i,
      /strategy=|recommendation=/i,
      /analyst.*panel|consulting.*analyst/i,
      /Trend Analyst|Volatility Analyst|Risk Analyst|Technical Analyst|Market Analyst/i,
      /bull.?put|bear.?call|iron.?condor|call.?credit|put.?credit/i,
    ],
  },
  signals: {
    label: 'Signals',
    color: 'text-yellow-400',
    patterns: [
      /ADD=|add_value|ADD\s+signal/i,
      /EMA.*trend|ema_trend/i,
      /VWAP|vwap/i,
      /move.*implied|implied.*move|move.ratio/i,
      /VIX|vix/i,
      /bias.*score|score.*bias|ScoreBreak/i,
      /signal.*confirm|confirm.*signal/i,
      /bullish|bearish|neutral/i,
      /atm_iv|iv_source/i,
    ],
  },
  errors: {
    label: 'Errors & Warnings',
    color: 'text-red-400',
    patterns: [
      /\[ERROR\]|\| ERROR \|/,
      /\[WARNING\]|\| WARNING \|/,
      /Error \d+|reqId \d+.*Error/i,
      /Traceback|Exception|raise |failed|failure/i,
    ],
  },
}

// ── Line classification ───────────────────────────────────────────────────────
function classifyLine(line: string): 'ERROR' | 'WARNING' | 'INFO' | 'TRADE' | '' {
  if (/\[ERROR\]|\| ERROR \||Error \d+/.test(line)) return 'ERROR'
  if (/\[WARNING\]|\| WARNING \|/.test(line)) return 'WARNING'
  if (/order.*fill|trade.*open|trade.*close|position.*open|position.*close|MASTER:.*trade=True|entry|exit_trade/i.test(line)) return 'TRADE'
  if (/\[INFO\]|\| INFO \|/.test(line)) return 'INFO'
  return ''
}

const LEVEL_STYLE: Record<string, string> = {
  ERROR:   'text-red-400 bg-red-500/5',
  WARNING: 'text-yellow-300 bg-yellow-500/5',
  TRADE:   'text-green-300 bg-green-500/8 font-medium',
  INFO:    'text-gray-300',
  '':      'text-gray-500',
}

const LEVEL_BADGE: Record<string, React.ReactNode> = {
  ERROR:   <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-red-500/20 text-red-400 px-1 rounded mr-1.5">ERR</span>,
  WARNING: <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-yellow-500/20 text-yellow-400 px-1 rounded mr-1.5">WARN</span>,
  TRADE:   <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-green-500/20 text-green-400 px-1 rounded mr-1.5">TRADE</span>,
}

// Strip timestamp + logger prefix to keep lines short; show on expand
function parseLine(line: string) {
  // Match: "2026-07-14 10:55:11,735 | swing_bot.main | INFO | actual message"
  //    or: "2026-07-14 10:55:11,735 [INFO] swing_bot.main: actual message"
  const m1 = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[,.\d]*)\s*\|[^|]+\|\s*\w+\s*\|\s*(.+)$/)
  if (m1) return { ts: m1[1], msg: m1[2] }
  const m2 = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[,.\d]*)\s*\[\w+\]\s*[\w.]+:\s*(.+)$/)
  if (m2) return { ts: m2[1], msg: m2[2] }
  return { ts: '', msg: line }
}

function LogLine({ line, expand }: { line: string; expand: boolean }) {
  const [open, setOpen] = useState(false)
  const level = classifyLine(line)
  const style = LEVEL_STYLE[level] || LEVEL_STYLE['']
  const badge = LEVEL_BADGE[level]
  const { ts, msg } = parseLine(line)
  const isLong = msg.length > 140
  const showFull = open || expand || !isLong

  return (
    <div
      className={`font-mono text-xs leading-5 px-3 py-[2px] border-b border-white/[0.03] hover:bg-white/[0.04] cursor-default ${style}`}
      onClick={() => isLong && setOpen(v => !v)}
    >
      {ts && <span className="text-gray-600 mr-2 select-none">{ts.slice(11, 19)}</span>}
      {badge}
      <span className={isLong && !showFull ? 'line-clamp-1' : 'whitespace-pre-wrap break-all'}>
        {showFull ? msg : msg.slice(0, 140) + '…'}
      </span>
      {isLong && (
        <span className="ml-1 text-gray-600 select-none">
          {showFull
            ? <ChevronDown size={10} className="inline" />
            : <ChevronRight size={10} className="inline" />}
        </span>
      )}
    </div>
  )
}

// Filter selections are persisted so a page refresh doesn't lose them
const FILTERS_KEY = 'bothub.logFilters'

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LogsPage() {
  const [bots, setBots] = useState<Bot[]>([])
  const [selectedBot, setSelectedBot] = useState('')
  const [rawLogs, setRawLogs] = useState<LogResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [copied, setCopied] = useState(false)
  const [lineCount, setLineCount] = useState(2000)
  const [view, setView] = useState('all')
  const [levelFilter, setLevelFilter] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searchFilter, setSearchFilter] = useState('')
  const [sinceDate, setSinceDate] = useState(new Date().toISOString().slice(0, 10))
  const [filterByDate, setFilterByDate] = useState(true)
  const [expandAll, setExpandAll] = useState(false)
  const [restored, setRestored] = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Restore persisted filters before the first save runs
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FILTERS_KEY) || '{}')
      if (saved.view && VIEW_PRESETS[saved.view]) setView(saved.view)
      if (typeof saved.levelFilter === 'string') setLevelFilter(saved.levelFilter)
      if (typeof saved.lineCount === 'number') setLineCount(saved.lineCount)
      if (typeof saved.filterByDate === 'boolean') setFilterByDate(saved.filterByDate)
      if (typeof saved.sinceDate === 'string' && saved.sinceDate) setSinceDate(saved.sinceDate)
      if (typeof saved.searchFilter === 'string' && saved.searchFilter) {
        setSearchFilter(saved.searchFilter)
        setSearchInput(saved.searchFilter)
      }
    } catch {}
    setRestored(true)
  }, [])

  useEffect(() => {
    if (!restored) return
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify({
        selectedBot, view, levelFilter, lineCount, filterByDate, sinceDate, searchFilter,
      }))
    } catch {}
  }, [restored, selectedBot, view, levelFilter, lineCount, filterByDate, sinceDate, searchFilter])

  useEffect(() => {
    botsApi.list().then(r => {
      const list: Bot[] = Array.isArray(r.data) ? r.data : (r.data?.bots ?? [])
      setBots(list)
      let savedBot = ''
      try { savedBot = JSON.parse(localStorage.getItem(FILTERS_KEY) || '{}').selectedBot || '' } catch {}
      const initial = list.find(b => b.id === savedBot)?.id ?? list[0]?.id ?? ''
      if (initial) setSelectedBot(initial)
    }).catch(() => {})
  }, [])

  const fetchLogs = useCallback(async (botId?: string) => {
    const id = botId ?? selectedBot
    if (!id) return
    setLoading(true)
    try {
      const opts: { lines: number; level?: string; since?: string } = { lines: lineCount }
      if (levelFilter) opts.level = levelFilter
      if (filterByDate && sinceDate) opts.since = sinceDate
      const r = await botRunnerApi.logs(id, opts)
      setRawLogs(r.data)
    } catch {
      setRawLogs({ lines: [], total_lines: 0, error: 'Failed to fetch logs' })
    } finally {
      setLoading(false)
    }
  }, [selectedBot, lineCount, levelFilter, filterByDate, sinceDate])

  useEffect(() => { if (selectedBot) fetchLogs() }, [selectedBot, levelFilter, filterByDate, sinceDate, lineCount])

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (autoRefresh && selectedBot) timerRef.current = setInterval(() => fetchLogs(), 5000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [autoRefresh, selectedBot, fetchLogs])

  useEffect(() => {
    if (autoRefresh) logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [rawLogs, autoRefresh])

  // Apply view preset + search filter client-side (fast, no round-trip)
  const displayLines = (() => {
    if (!rawLogs?.lines) return []
    let lines = rawLogs.lines
    const preset = VIEW_PRESETS[view]
    if (preset.patterns.length > 0) {
      lines = lines.filter(l => preset.patterns.some(p => p.test(l)))
    }
    if (searchFilter) {
      const sl = searchFilter.toLowerCase()
      lines = lines.filter(l => l.toLowerCase().includes(sl))
    }
    return lines
  })()

  const handleCopy = () => {
    if (!displayLines.length) return
    navigator.clipboard.writeText(displayLines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const selectedBotName = bots.find(b => b.id === selectedBot)?.name ?? ''
  const preset = VIEW_PRESETS[view]

  return (
    <div className="flex flex-col h-full min-h-screen bg-[#070b14] text-white">

      {/* ── Header ── */}
      <div className="border-b border-[#1e2a3a] px-4 py-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 mr-2">
          <Terminal size={16} className="text-blue-400" />
          <h1 className="text-sm font-semibold">Bot Logs</h1>
        </div>

        {/* Bot selector */}
        <Sel value={selectedBot} onChange={setSelectedBot}>
          {bots.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Sel>

        {/* View preset — the main new dropdown */}
        <Sel value={view} onChange={setView} highlight>
          {Object.entries(VIEW_PRESETS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </Sel>

        {/* Level filter */}
        <Sel value={levelFilter} onChange={setLevelFilter}>
          <option value="">All levels</option>
          <option value="INFO">INFO</option>
          <option value="WARNING">WARNING</option>
          <option value="ERROR">ERROR</option>
          <option value="DEBUG">DEBUG</option>
        </Sel>

        {/* Date filter */}
        <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
          <input type="checkbox" checked={filterByDate} onChange={e => setFilterByDate(e.target.checked)} className="accent-blue-500" />
          <input
            type="date" value={sinceDate} onChange={e => setSinceDate(e.target.value)} disabled={!filterByDate}
            className="bg-[#0f1929] border border-[#1e2a3a] text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500 disabled:opacity-40"
          />
        </label>

        {/* Line count */}
        <Sel value={String(lineCount)} onChange={v => setLineCount(Number(v))}>
          <option value="500">500 lines</option>
          <option value="1000">1000 lines</option>
          <option value="2000">2000 lines</option>
          <option value="5000">5000 lines</option>
          <option value="9999">All</option>
        </Sel>

        {/* Search */}
        <form onSubmit={e => { e.preventDefault(); setSearchFilter(searchInput) }} className="flex items-center gap-1">
          <div className="relative">
            <Search size={11} className="absolute left-2 top-2 text-gray-500" />
            <input
              type="text" value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search…"
              className="bg-[#0f1929] border border-[#1e2a3a] text-white text-xs rounded-lg pl-6 pr-2 py-1.5 w-32 focus:outline-none focus:border-blue-500"
            />
          </div>
          {searchFilter && (
            <button type="button" onClick={() => { setSearchFilter(''); setSearchInput('') }} className="text-gray-500 hover:text-white">
              <X size={12} />
            </button>
          )}
        </form>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Stats */}
        <span className="text-xs text-gray-600">
          {rawLogs?.filtered_lines !== undefined
            ? `${displayLines.length} shown / ${rawLogs.filtered_lines} matched / ${rawLogs.total_lines} total`
            : `${displayLines.length} / ${rawLogs?.total_lines ?? 0}`}
        </span>

        {/* Expand toggle */}
        <button onClick={() => setExpandAll(v => !v)}
          className="text-xs px-2 py-1.5 rounded border border-[#1e2a3a] text-gray-400 hover:text-white transition-colors">
          {expandAll ? 'Collapse' : 'Expand all'}
        </button>

        {/* Auto refresh */}
        <button onClick={() => setAutoRefresh(v => !v)}
          className={`flex items-center gap-1 text-xs px-2 py-1.5 rounded border transition-colors ${
            autoRefresh ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'border-[#1e2a3a] text-gray-400 hover:text-white'
          }`}>
          <RefreshCw size={11} className={autoRefresh ? 'animate-spin' : ''} />
          {autoRefresh ? 'Live' : 'Auto'}
        </button>

        {/* Refresh */}
        <button onClick={() => fetchLogs()} disabled={loading}
          className="p-1.5 rounded border border-[#1e2a3a] text-blue-400 hover:bg-blue-500/10 disabled:opacity-50">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>

        {/* Copy */}
        <button onClick={handleCopy} disabled={!displayLines.length}
          className="flex items-center gap-1 text-xs px-2 py-1.5 rounded border border-[#1e2a3a] text-gray-400 hover:text-white disabled:opacity-40">
          {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
          {copied ? 'Copied!' : 'Copy all'}
        </button>
      </div>

      {/* ── View preset pills ── */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-[#1e2a3a] bg-[#0a0e1a] flex-wrap">
        {Object.entries(VIEW_PRESETS).map(([k, v]) => (
          <button key={k} onClick={() => setView(k)}
            className={`text-[11px] px-2.5 py-0.5 rounded-full border transition-colors ${
              view === k
                ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                : 'border-[#1e2a3a] text-gray-500 hover:text-gray-300 hover:border-gray-600'
            }`}>
            {v.label}
          </button>
        ))}
        {filterByDate && sinceDate && (
          <span className="text-[11px] bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2.5 py-0.5 rounded-full">
            date: {sinceDate} <button onClick={() => setFilterByDate(false)} className="ml-1 hover:text-white"><X size={9} className="inline" /></button>
          </span>
        )}
        {levelFilter && (
          <span className={`text-[11px] px-2.5 py-0.5 rounded-full border ${
            levelFilter === 'ERROR' ? 'bg-red-500/10 text-red-300 border-red-500/20' :
            levelFilter === 'WARNING' ? 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20' :
            'bg-blue-500/10 text-blue-300 border-blue-500/20'
          }`}>
            level: {levelFilter} <button onClick={() => setLevelFilter('')} className="ml-1 hover:text-white"><X size={9} className="inline" /></button>
          </span>
        )}
        {searchFilter && (
          <span className="text-[11px] bg-purple-500/10 text-purple-300 border border-purple-500/20 px-2.5 py-0.5 rounded-full">
            search: "{searchFilter}" <button onClick={() => { setSearchFilter(''); setSearchInput('') }} className="ml-1 hover:text-white"><X size={9} className="inline" /></button>
          </span>
        )}
        {(levelFilter || searchFilter || filterByDate) && (
          <button
            onClick={() => { setLevelFilter(''); setSearchFilter(''); setSearchInput(''); setFilterByDate(false) }}
            className="text-[11px] text-gray-500 hover:text-white ml-1">
            clear all
          </button>
        )}
      </div>

      {/* ── Log body ── */}
      <div className="flex-1 overflow-y-auto bg-[#070b14]">
        {loading && !rawLogs && (
          <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
            <RefreshCw size={14} className="animate-spin mr-2" /> Loading…
          </div>
        )}
        {rawLogs?.error && (
          <div className="mx-4 mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex gap-2">
            <AlertCircle size={15} className="shrink-0 mt-0.5" /> {rawLogs.error}
          </div>
        )}
        {rawLogs?.message && !rawLogs.lines.length && (
          <div className="mx-4 mt-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-sm flex gap-2">
            <Info size={15} className="shrink-0 mt-0.5" /> {rawLogs.message}
          </div>
        )}
        {displayLines.length === 0 && !rawLogs?.error && !rawLogs?.message && !loading && (
          <div className="flex flex-col items-center justify-center h-40 text-gray-500 text-sm gap-2">
            <AlertTriangle size={20} className="text-gray-600" />
            No log lines match <span className="text-gray-400">"{preset.label}"</span>
            {view !== 'all' && (
              <button onClick={() => setView('all')} className="text-blue-400 text-xs hover:underline">Switch to All Logs</button>
            )}
          </div>
        )}
        {displayLines.map((line, i) => <LogLine key={i} line={line} expand={expandAll} />)}
        <div ref={logEndRef} />
      </div>

      {/* ── Footer ── */}
      <div className="border-t border-[#1e2a3a] px-4 py-1.5 flex items-center justify-between text-[11px] text-gray-600">
        <span>{selectedBotName}</span>
        <span>Click a long line to expand · <kbd className="bg-[#1e2a3a] text-gray-400 px-1 rounded">Copy all</kbd> → paste into chat</span>
      </div>
    </div>
  )
}

// ── Small reusable select ─────────────────────────────────────────────────────
function Sel({ value, onChange, children, highlight }: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
  highlight?: boolean
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`appearance-none text-xs rounded-lg pl-2.5 pr-6 py-1.5 focus:outline-none focus:border-blue-500 border ${
          highlight
            ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
            : 'bg-[#0f1929] border-[#1e2a3a] text-white'
        }`}
      >
        {children}
      </select>
      <ChevronDown size={11} className="absolute right-1.5 top-2 text-gray-400 pointer-events-none" />
    </div>
  )
}
