import snapshotJson from "../data/snapshot.json"
import type { CallQuote, MarketBook } from "./types"

const DERIBIT = "https://www.deribit.com/api/v2"
const MONTHS: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
}

type BookRow = {
  instrument_name?: string
  mark_price?: number
  bid_price?: number
  ask_price?: number
  mark_iv?: number
  open_interest?: number
}

/**
 * Live Deribit book, or the committed snapshot if the exchange is unreachable.
 */
export async function loadMarket(): Promise<MarketBook> {
  try {
    return await fetchLive()
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error"
    return {
      ...(snapshotJson as MarketBook),
      source: "snapshot",
      notice: `Live Deribit book is unavailable (${reason}). Showing the saved book.`,
    }
  }
}

async function fetchLive(): Promise<MarketBook> {
  const [book, indexBody] = await Promise.all([
    deribit<{ result: BookRow[] }>(
      "public/get_book_summary_by_currency?currency=BTC&kind=option"
    ),
    deribit<{ result: { index_price: number } }>(
      "public/get_index_price?index_name=btc_usd"
    ),
  ])

  const index = indexBody.result.index_price
  const grouped = new Map<string, CallQuote[]>()
  for (const row of book.result) {
    const parsed = parseCall(row.instrument_name ?? "")
    if (!parsed) continue
    const quote: CallQuote = {
      strike: parsed.strike,
      mark: row.mark_price ?? 0,
      bid: row.bid_price ?? 0,
      ask: row.ask_price ?? 0,
      iv: row.mark_iv ?? 0,
      oi: row.open_interest ?? 0,
    }
    const list = grouped.get(parsed.token) ?? []
    list.push(quote)
    grouped.set(parsed.token, list)
  }

  const now = Date.now()
  const chosen = chooseExpiry([...grouped.keys()], now)
  if (!chosen) throw new Error("no future BTC option expiry")
  const calls = (grouped.get(chosen.token) ?? []).sort((a, b) => a.strike - b.strike)
  if (calls.length < 3) throw new Error(`thin book for ${chosen.token}`)

  const nearest = calls.reduce((best, call) =>
    Math.abs(call.strike - index) < Math.abs(best.strike - index) ? call : best
  )
  const ticker = await deribit<{
    result: { underlying_price?: number; index_price?: number }
  }>(
    `public/ticker?instrument_name=BTC-${chosen.token}-${nearest.strike}-C`
  )
  const forward = ticker.result.underlying_price || index
  const spot = ticker.result.index_price || index

  return {
    asOf: new Date(now).toISOString(),
    source: "live",
    index: spot,
    forward,
    expiryMs: chosen.expiryMs,
    expiryToken: chosen.token,
    calls,
  }
}

function chooseExpiry(
  tokens: string[],
  now: number
): { token: string; expiryMs: number } | null {
  const dated = tokens
    .map((token) => ({ token, expiryMs: expiryMs(token) }))
    .filter((item): item is { token: string; expiryMs: number } => item.expiryMs !== null)
    .filter((item) => item.expiryMs > now)
  if (dated.length === 0) return null

  const thisYearEnd = Date.UTC(new Date(now).getUTCFullYear(), 11, 25, 8, 0, 0)
  const target = now > thisYearEnd ? Date.UTC(new Date(now).getUTCFullYear() + 1, 11, 25, 8, 0, 0) : thisYearEnd
  dated.sort((a, b) => Math.abs(a.expiryMs - target) - Math.abs(b.expiryMs - target))
  return dated[0]
}

/** Deribit expiry codes settle at 08:00 UTC. */
export function expiryMs(token: string): number | null {
  const match = /^(\d{1,2})([A-Z]{3})(\d{2})$/.exec(token)
  if (!match) return null
  const month = MONTHS[match[2]]
  if (month === undefined) return null
  return Date.UTC(2000 + Number(match[3]), month, Number(match[1]), 8, 0, 0)
}

function parseCall(name: string): { token: string; strike: number } | null {
  const match = /^BTC-(\d{1,2}[A-Z]{3}\d{2})-(\d+)-C$/.exec(name)
  if (!match) return null
  return { token: match[1], strike: Number(match[2]) }
}

async function deribit<T>(path: string): Promise<T> {
  const response = await fetch(`${DERIBIT}/${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error(`Deribit ${response.status}`)
  return (await response.json()) as T
}
