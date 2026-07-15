"use client"
import { useEffect, useState, useRef, useCallback } from 'react'
import { botsApi, botRunnerApi } from '@/lib/api'
import { Terminal, RefreshCw, Copy, Check, Search, X, ChevronDown, AlertCircle, Info, AlertTriangle, Bug } from 'lucide-react'

interface Bot {
  id: string
  name: string
  status?: string
}

interface LogResult {
  lines: string[]
  total_lines: number
  filtered_lines?: number
  message?: string
  error?: string
}

const LEVEL_COLORS: Record<string, string> = {
  ERROR:   'text-red-400',
  WARNING: 'text-yellow-400',
  INFO:    'text-blue-300',
  DEBUG:   'text-gray-500',
}

const LEVEL_ICONS: Record<string, React.ReactNode> = {
  ERROR:   <AlertCircle size={11} className="inline mr-1 text-red-400" />,
  WARNING: <AlertTriangle size={11} className="inline mr-1 text-yellow-400" />,
  INFO:    <Info size={11} className="inline mr-1 text-blue-300" />,
  DEBUG:   <Bug size={11} className="inline mr-1 text-gray-500" />,
}

function classifyLine(line: string): string {
  if (/\[ERROR\]|\| ERROR \|/.test(line)) return 'ERROR'
  if (/\[WARNING\]|\| WARNING \|/.test(line)) return 'WARNING'
  if (/\[INFO\]|\| INFO \|/.test(line)) return 'INFO'
  if (/\[DEBUG\]|\| DEBUG \|/.test(line)) return 'DEBUG'
  return ''
}

function LogLine({ line }: { line: string }) {
  const level = classifyLine(line)
  const color = level ? LEVEL_COLORS[level] : 'text-gray-300'
  const icon = level ? LEVEL_ICONS[level] : null
  return (
    <div className={`font-mono text-xs leading-5 whitespace-pre-wrap break-all px-3 py-[1px] hover:bg-white/5 ${color}`}>
      {icon}{line}
    </div>
  )
}

export default function LogsPage() {
  const [bots, setBots] = useState<Bot[]>([])
  const [selectedBot, setSelectedBot] = useState<string>('')
  const [logs, setLogs] = useState<LogResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [copied, setCopied] = useState(false)
  const [lineCount, setLineCount] = useState(500)
  const [levelFilter, setLevelFilter] = useState('')
  const [searchFilter, setSearchFilter] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [sinceDate, setSinceDate] = useState(new Date().toISOString().slice(0, 10))
  const [filterByDate, setFilterByDate] = useState(true)
  const logEndRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    botsApi.list().then(r => {
      const list = Array.isArray(r.data) ? r.data : (r.data?.bots ?? [])
      setBots(list)
      if (list.length > 0) setSelectedBot(list[0].id)
    }).catch(() => {})
  }, [])

  const fetchLogs = useCallback(async (botId?: string) => {
    const id = botId ?? selectedBot
    if (!id) return
    setLoading(true)
    try {
      const opts: { lines: number; level?: string; search?: string; since?: string } = { lines: lineCount }
      if (levelFilter) opts.level = levelFilter
      if (searchFilter) opts.search = searchFilter
      if (filterByDate && sinceDate) opts.since = sinceDate
      const r = await botRunnerApi.logs(id, opts)
      setLogs(r.data)
    } catch {
      setLogs({ lines: [], total_lines: 0, error: 'Failed to fetch logs' })
    } finally {
      setLoading(false)
    }
  }, [selectedBot, lineCount, levelFilter, searchFilter, filterByDate, sinceDate])

  useEffect(() => {
    if (selectedBot) fetchLogs()
  }, [selectedBot, levelFilter, searchFilter, filterByDate, sinceDate, lineCount])

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (autoRefresh && selectedBot) {
      timerRef.current = setInterval(() => fetchLogs(), 5000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [autoRefresh, selectedBot, fetchLogs])

  useEffect(() => {
    if (autoRefresh) logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs, autoRefresh])

  const handleCopy = () => {
    if (!logs?.lines.length) return
    navigator.clipboard.writeText(logs.lines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearchFilter(searchInput)
  }

  const selectedBotName = bots.find(b => b.id === selectedBot)?.name ?? ''

  return (
    <div className="flex flex-col h-full min-h-screen bg-[#070b14] text-white">
      {/* Header */}
      <div className="border-b border-[#1e2a3a] px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Terminal size={18} className="text-blue-400" />
          <h1 className="text-lg font-semibold">Bot Logs</h1>
          {logs && (
            <span className="text-xs text-gray-500 ml-2">
              {logs.filtered_lines !== undefined
                ? `${logs.lines.length} shown / ${logs.filtered_lines} matched / ${logs.total_lines} total`
                : `${logs.lines.length} / ${logs.total_lines} lines`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Bot selector */}
          <div className="relative">
            <select
              value={selectedBot}
              onChange={e => setSelectedBot(e.target.value)}
              className="appearance-none bg-[#0f1929] border border-[#1e2a3a] text-white text-sm rounded-lg px-3 py-1.5 pr-8 focus:outline-none focus:border-blue-500"
            >
              {bots.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-2 text-gray-400 pointer-events-none" />
          </div>

          {/* Date toggle */}
          <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filterByDate}
              onChange={e => setFilterByDate(e.target.checked)}
              className="accent-blue-500"
            />
            Date:
            <input
              type="date"
              value={sinceDate}
              onChange={e => setSinceDate(e.target.value)}
              disabled={!filterByDate}
              className="bg-[#0f1929] border border-[#1e2a3a] text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500 disabled:opacity-40"
            />
          </label>

          {/* Level filter */}
          <div className="relative">
            <select
              value={levelFilter}
              onChange={e => setLevelFilter(e.target.value)}
              className="appearance-none bg-[#0f1929] border border-[#1e2a3a] text-white text-xs rounded-lg px-3 py-1.5 pr-7 focus:outline-none focus:border-blue-500"
            >
              <option value="">All levels</option>
              <option value="ERROR">ERROR</option>
              <option value="WARNING">WARNING</option>
              <option value="INFO">INFO</option>
              <option value="DEBUG">DEBUG</option>
            </select>
            <ChevronDown size={12} className="absolute right-2 top-2 text-gray-400 pointer-events-none" />
          </div>

          {/* Line count */}
          <div className="relative">
            <select
              value={lineCount}
              onChange={e => setLineCount(Number(e.target.value))}
              className="appearance-none bg-[#0f1929] border border-[#1e2a3a] text-white text-xs rounded-lg px-3 py-1.5 pr-7 focus:outline-none focus:border-blue-500"
            >
              <option value={200}>Last 200</option>
              <option value={500}>Last 500</option>
              <option value={1000}>Last 1000</option>
              <option value={2000}>Last 2000</option>
              <option value={9999}>All</option>
            </select>
            <ChevronDown size={12} className="absolute right-2 top-2 text-gray-400 pointer-events-none" />
          </div>

          {/* Search */}
          <form onSubmit={handleSearch} className="flex items-center gap-1">
            <div className="relative">
              <Search size={12} className="absolute left-2 top-2 text-gray-500" />
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Search logs…"
                className="bg-[#0f1929] border border-[#1e2a3a] text-white text-xs rounded-lg pl-7 pr-2 py-1.5 w-36 focus:outline-none focus:border-blue-500"
              />
            </div>
            {searchFilter && (
              <button type="button" onClick={() => { setSearchFilter(''); setSearchInput('') }}
                className="text-gray-400 hover:text-white p-1">
                <X size={12} />
              </button>
            )}
          </form>

          {/* Auto refresh toggle */}
          <button
            onClick={() => setAutoRefresh(v => !v)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              autoRefresh
                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                : 'bg-[#0f1929] border-[#1e2a3a] text-gray-400 hover:text-white'
            }`}
          >
            <RefreshCw size={12} className={autoRefresh ? 'animate-spin' : ''} />
            {autoRefresh ? 'Live' : 'Auto'}
          </button>

          {/* Manual refresh */}
          <button
            onClick={() => fetchLogs()}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>

          {/* Copy */}
          <button
            onClick={handleCopy}
            disabled={!logs?.lines.length}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#0f1929] border border-[#1e2a3a] text-gray-400 hover:text-white transition-colors disabled:opacity-40"
          >
            {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
            {copied ? 'Copied!' : 'Copy all'}
          </button>
        </div>
      </div>

      {/* Active filters badge row */}
      {(levelFilter || searchFilter || filterByDate) && (
        <div className="px-6 py-2 flex items-center gap-2 flex-wrap border-b border-[#1e2a3a] bg-[#0a0e1a]">
          <span className="text-xs text-gray-500">Filters:</span>
          {filterByDate && sinceDate && (
            <span className="text-xs bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded-full">
              date: {sinceDate}
            </span>
          )}
          {levelFilter && (
            <span className={`text-xs px-2 py-0.5 rounded-full border ${
              levelFilter === 'ERROR' ? 'bg-red-500/10 text-red-300 border-red-500/20' :
              levelFilter === 'WARNING' ? 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20' :
              'bg-blue-500/10 text-blue-300 border-blue-500/20'
            }`}>
              level: {levelFilter}
            </span>
          )}
          {searchFilter && (
            <span className="text-xs bg-purple-500/10 text-purple-300 border border-purple-500/20 px-2 py-0.5 rounded-full">
              search: "{searchFilter}"
            </span>
          )}
          <button
            onClick={() => { setLevelFilter(''); setSearchFilter(''); setSearchInput(''); setFilterByDate(false) }}
            className="text-xs text-gray-500 hover:text-white ml-1"
          >
            clear all
          </button>
        </div>
      )}

      {/* Log body */}
      <div className="flex-1 overflow-y-auto bg-[#070b14] py-2">
        {loading && !logs && (
          <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
            <RefreshCw size={16} className="animate-spin mr-2" /> Loading logs…
          </div>
        )}

        {logs?.error && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {logs.error}
          </div>
        )}

        {logs?.message && !logs.lines.length && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-sm">
            {logs.message}
          </div>
        )}

        {logs?.lines.map((line, i) => <LogLine key={i} line={line} />)}

        {logs?.lines.length === 0 && !logs.error && !logs.message && !loading && (
          <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
            No log lines match the current filters.
          </div>
        )}

        <div ref={logEndRef} />
      </div>

      {/* Footer hint */}
      <div className="border-t border-[#1e2a3a] px-6 py-2 flex items-center justify-between text-xs text-gray-600">
        <span>{selectedBotName || 'No bot selected'}</span>
        <span>Press <kbd className="bg-[#1e2a3a] text-gray-400 px-1.5 py-0.5 rounded text-[10px]">Copy all</kbd> then paste into chat for troubleshooting</span>
      </div>
    </div>
  )
}
