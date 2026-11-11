"use client"

import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { PayoffChart } from "@/components/payoff-chart"
import {
  formatBtc,
  formatCompactStrike,
  formatCountdown,
  formatKyiv,
  formatMultiple,
  formatPct,
  formatStrike,
  formatTimes,
  formatUsd,
} from "@/lib/format"
import { buildDistribution, chanceBetween, enumerateSpreads, spreadPnl } from "@/lib/spreads"
import type { Band, MarketBook, RankMode, Spread } from "@/lib/types"

const PRESETS: { label: string; band: Band }[] = [
  { label: "80–100k", band: { low: 80_000, high: 100_000 } },
  { label: "80–90k", band: { low: 80_000, high: 90_000 } },
  { label: "90–100k", band: { low: 90_000, high: 100_000 } },
  { label: "75–100k", band: { low: 75_000, high: 100_000 } },
]

export function Desk({ initial }: { initial: MarketBook }) {
  const [book, setBook] = useState(initial)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [band, setBand] = useState<Band>({ low: 80_000, high: 100_000 })
  const [mode, setMode] = useState<RankMode>("ratio")
  const [selectedId, setSelectedId] = useState("80000-100000")
  const [now, setNow] = useState(new Date(initial.asOf).getTime())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const distribution = useMemo(
    () => buildDistribution(book.calls, book.forward),
    [book]
  )
  const spreads = useMemo(
    () => enumerateSpreads(book.calls, book.forward, band),
    [book, band]
  )
  const ranked = useMemo(() => sortSpreads(spreads, mode), [spreads, mode])

  useEffect(() => {
    if (spreads.some((spread) => spread.id === selectedId)) return
    const named = spreads.find(
      (spread) => spread.longStrike === band.low && spread.shortStrike === band.high
    )
    const best = sortSpreads(spreads, "band")[0]
    setSelectedId((named ?? best)?.id ?? "")
  }, [spreads, selectedId, band.low, band.high])

  const selected = ranked.find((spread) => spread.id === selectedId) ?? ranked[0]
  const bestRatio = sortSpreads(spreads, "ratio")[0]
  const bestBand = sortSpreads(spreads, "band")[0]
  const named = spreads.find(
    (spread) => spread.longStrike === band.low && spread.shortStrike === band.high
  )
  const inBand = chanceBetween(distribution, band.low, band.high)
  const aboveLow = distribution.above(band.low)
  const atm = book.calls.reduce<(typeof book.calls)[number] | null>((best, call) => {
    if (!best) return call
    return Math.abs(call.strike - book.forward) < Math.abs(best.strike - book.forward) ? call : best
  }, null)
  const rewardBand = rewardRange(spreads)

  async function refresh() {
    setPending(true)
    setError(null)
    try {
      const response = await fetch("/api/market", { cache: "no-store" })
      if (!response.ok) throw new Error(`book request failed (${response.status})`)
      const next = (await response.json()) as MarketBook
      setBook(next)
      setNow(Date.now())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not refresh the book")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl space-y-3">
              <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
                BTC · {book.expiryToken} · up · call spreads only
              </p>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Year-end call spreads
              </h1>
              <Lead
                band={band}
                bestRatio={bestRatio}
                bestBand={bestBand}
                named={named}
                inBand={inBand}
                rewardBand={rewardBand}
              />
            </div>
            <Button variant="outline" onClick={refresh} disabled={pending}>
              {pending ? "Refreshing…" : "Refresh book"}
            </Button>
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Index" value={formatUsd(book.index)} />
            <Stat label="Dec future" value={formatUsd(book.forward)} />
            <Stat label="To expiry" value={formatCountdown(book.expiryMs, now)} detail={formatKyiv(book.expiryMs)} />
            <Stat label="ATM vol" value={atm ? `${atm.iv.toFixed(1)}%` : "—"} detail={atm ? formatStrike(atm.strike) : undefined} />
            <Stat label="Odds in your band" value={formatPct(inBand)} detail={`${formatPct(aboveLow)} above ${formatCompactStrike(band.low)}`} />
            <Stat
              label="Book"
              value={book.source === "live" ? "Live" : "Saved"}
              detail={formatKyiv(new Date(book.asOf).getTime())}
            />
          </dl>
          {book.notice && (
            <p className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
              {book.notice}
            </p>
          )}
          {error && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((preset) => {
                  const active = preset.band.low === band.low && preset.band.high === band.high
                  return (
                    <Button
                      key={preset.label}
                      size="sm"
                      variant={active ? "default" : "outline"}
                      onClick={() => setBand(preset.band)}
                    >
                      {preset.label}
                    </Button>
                  )
                })}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <BandField
                  label="From"
                  value={band.low}
                  onChange={(low) => setBand((current) => clampBand(low, current.high))}
                />
                <BandField
                  label="To"
                  value={band.high}
                  onChange={(high) => setBand((current) => clampBand(current.low, high))}
                />
              </div>
            </div>
            <div className="w-full max-w-md space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Settlement band</span>
                <span className="font-mono text-foreground">
                  {formatStrike(band.low)} – {formatStrike(band.high)}
                </span>
              </div>
              <Slider
                min={40_000}
                max={160_000}
                step={1000}
                value={[band.low, band.high]}
                thumbCollisionBehavior="none"
                onValueChange={(value) => {
                  const [low, high] = value as number[]
                  if (high - low < 2000) return
                  setBand({ low, high })
                }}
                aria-label="Settlement band"
              />
            </div>
          </div>
        </section>

        {ranked.length === 0 || !selected ? (
          <Empty band={band} />
        ) : (
          <>
            <section className="grid gap-3 md:grid-cols-3">
              <Spotlight
                kicker="Best range ratio"
                spread={bestRatio}
                figure={bestRatio ? ratioLabel(bestRatio) : "—"}
                caption="Chance of profit, times the payoff if every price in the band is equally likely."
                active={selected.id === bestRatio?.id}
                onSelect={() => bestRatio && setSelectedId(bestRatio.id)}
              />
              <Spotlight
                kicker="Best if the curve is right"
                spread={bestBand}
                figure={bestBand ? formatTimes(bestBand.bandMultiple) : "—"}
                caption="Pays the most per debit when the band hits and the market’s odds inside it are right. Those odds sit near the bottom of the band."
                active={selected.id === bestBand?.id}
                onSelect={() => bestBand && setSelectedId(bestBand.id)}
              />
              <Spotlight
                kicker="The band as one spread"
                spread={named}
                figure={named ? ratioLabel(named) : "No market"}
                caption={
                  named
                    ? `Buy ${formatCompactStrike(named.longStrike)}, sell ${formatCompactStrike(named.shortStrike)}. ${formatTimes(named.topMultiple)} the debit if expiry is ${formatStrike(band.high)}.`
                    : `No two-sided market exactly at ${formatCompactStrike(band.low)} / ${formatCompactStrike(band.high)}.`
                }
                active={named ? selected.id === named.id : false}
                onSelect={() => named && setSelectedId(named.id)}
              />
            </section>

            <section className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold">
                    {formatStrike(selected.longStrike)} / {formatStrike(selected.shortStrike)} call spread
                  </h2>
                  <p className="font-mono text-xs text-muted-foreground">
                    Buy {formatBtc(selected.longAsk)} · sell {formatBtc(selected.shortBid)}
                  </p>
                </div>
                <PayoffChart spread={selected} index={book.index} band={band} />
              </div>
              <Ticket spread={selected} index={book.index} band={band} />
            </section>

            <Scenarios spread={selected} index={book.index} band={band} />

            <section className="space-y-3">
              <div className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold">Liquid spreads into this band</h2>
                <div className="flex flex-wrap gap-2">
                  {RANK_MODES.map((item) => (
                    <Button
                      key={item.id}
                      size="sm"
                      variant={mode === item.id ? "default" : "outline"}
                      onClick={() => setMode(item.id)}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[760px] border-collapse text-sm">
                  <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Spread</th>
                      <th className="px-3 py-2 font-medium">Debit</th>
                      <th className="px-3 py-2 font-medium">Breakeven</th>
                      <th className="px-3 py-2 font-medium">Chance</th>
                      <th className="px-3 py-2 font-medium">Range ratio</th>
                      <th className="px-3 py-2 font-medium">Flat band</th>
                      <th className="px-3 py-2 font-medium">At {formatCompactStrike(band.high)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleSpreads(ranked, selected).map((spread) => {
                      const active = spread.id === selected.id
                      return (
                        <tr
                          key={spread.id}
                          data-spread={spread.id}
                          aria-selected={active}
                          tabIndex={0}
                          onClick={() => setSelectedId(spread.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault()
                              setSelectedId(spread.id)
                            }
                          }}
                          className={
                            active
                              ? "cursor-pointer border-t border-border bg-primary/10"
                              : "cursor-pointer border-t border-border hover:bg-muted/50"
                          }
                        >
                          <td className="px-3 py-2 font-medium">
                            {formatCompactStrike(spread.longStrike)} / {formatCompactStrike(spread.shortStrike)}
                            <span className="mt-0.5 block font-mono text-[11px] font-normal text-muted-foreground">
                              OI {Math.round(spread.oi).toLocaleString("en-US")}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono">
                            {formatBtc(spread.debit)}
                            <span className="mt-0.5 block text-[11px] text-muted-foreground">
                              {formatUsd(spread.debit * book.index)}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono">{formatStrike(spread.breakevenLow)}</td>
                          <td className="px-3 py-2 font-mono">{formatPct(spread.pop)}</td>
                          <td className="px-3 py-2 font-mono">{rangeRatio(spread).toFixed(2)}</td>
                          <td className="px-3 py-2 font-mono">{formatMultiple(spread.uniformMultiple)}</td>
                          <td className="px-3 py-2 font-mono">{formatMultiple(spread.topMultiple)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                Showing {Math.min(15, ranked.length)} of {ranked.length} spreads with a two-sided market, debit of at least 0.002 BTC, and open interest of at least 100 on both legs.
                Debit is the ask you buy minus the bid you sell. Range ratio is the chance of profit times the flat-band multiple.
                The flat-band multiple assumes every settlement inside the band is equally likely.
              </p>
            </section>
          </>
        )}

        <section className="space-y-3 border-t border-border pt-6 text-sm text-muted-foreground">
          <h2 className="text-base font-semibold text-foreground">How the ratio is calculated</h2>
          <p>
            These are Deribit inverse calls. You pay the premium in bitcoin, and at expiry a call pays
            max(settlement − strike, 0) / settlement bitcoins. On a bull call spread the most you can lose is that
            net premium. Profit in bitcoin is highest if settlement lands on the short strike. Above that, the same
            dollar width converts into fewer bitcoins, so the profit fades. It does not turn into a loss until a price
            far above this book.
          </p>
          <p>
            The chance of profit is read from the call curve: how fast the call mark falls as the strike rises. That
            is the market’s risk-neutral probability, not a forecast. The range ratio multiplies that chance by the
            average bitcoin profit per debit if every price in your band is equally likely. Peak reward-to-risk alone
            favors a tight spread at the top of the band, where the chance is small. Once gain and loss are both
            probability-weighted, liquid spreads cluster{rewardBand ? ` around ${rewardBand}` : ""}. The curve is pricing
            the shapes against each other.
          </p>
          <p>
            This is a calculator for that choice. It is not a recommendation to trade, and the premium is lost in full
            if bitcoin settles at or below the long strike. Marks move, and a live fill can be worse than the crossed
            bid and ask shown here.
          </p>
        </section>
      </main>
    </div>
  )
}

function Lead({
  band,
  bestRatio,
  bestBand,
  named,
  inBand,
  rewardBand,
}: {
  band: Band
  bestRatio?: Spread
  bestBand?: Spread
  named?: Spread
  inBand: number
  rewardBand: string | null
}) {
  if (!bestRatio || !bestBand) {
    return (
      <p className="text-base leading-relaxed text-muted-foreground">
        No liquid bull call spread currently expresses {formatStrike(band.low)}–{formatStrike(band.high)}.
      </p>
    )
  }
  return (
    <div className="space-y-2 text-base leading-relaxed">
      <p>
        A bull call spread into {bookLabel(band)} can lose only its debit. On this book the probability-weighted
        reward-to-risk clusters{rewardBand ? ` around ${rewardBand}` : ""}: expected bitcoin gained when the spread
        wins, divided by expected bitcoin lost when it doesn’t. The call curve puts {formatPct(inBand, 0)} on finishing
        inside the band, with most of that weight near {formatCompactStrike(band.low)}.
      </p>
      <p>
        The highest range ratio is the{" "}
        <span className="font-medium text-foreground">
          {formatCompactStrike(bestRatio.longStrike)}/{formatCompactStrike(bestRatio.shortStrike)}
        </span>
        : {formatPct(bestRatio.pop, 0)} chance of profit, and {formatTimes(bestRatio.uniformMultiple)} the debit if
        every price in the band is equally likely.{" "}
        {named && named.id !== bestRatio.id ? (
          <>
            The {formatCompactStrike(named.longStrike)}/{formatCompactStrike(named.shortStrike)} across the whole range
            is close — {formatPct(named.pop, 0)} chance, {formatTimes(named.uniformMultiple)} on that flat band, and{" "}
            {formatTimes(named.topMultiple)} if expiry is {formatStrike(band.high)}.{" "}
          </>
        ) : null}
        If instead you trust the curve inside the band, the{" "}
        <span className="font-medium text-foreground">
          {formatCompactStrike(bestBand.longStrike)}/{formatCompactStrike(bestBand.shortStrike)}
        </span>{" "}
        returns {formatTimes(bestBand.bandMultiple)} the debit and starts paying once price clears{" "}
        {formatStrike(bestBand.breakevenLow)}.
      </p>
    </div>
  )
}

function bookLabel(band: Band): string {
  return `${formatCompactStrike(band.low)}–${formatCompactStrike(band.high)}`
}

function Ticket({ spread, index, band }: { spread: Spread; index: number; band: Band }) {
  const rows = [
    ["Debit, the most you can lose", `${formatBtc(spread.debit)} BTC · ${formatUsd(spread.debit * index)} today`],
    ["Peak profit, at the short strike", `${formatBtc(spread.maxProfit)} BTC · ${spread.rewardRisk.toFixed(2)}× the debit`],
    ["Lower breakeven", formatStrike(spread.breakevenLow)],
    ["Chance of any profit", formatPct(spread.pop)],
    ["Chance at or above the short strike", formatPct(spread.pAboveShort)],
    ["If settlement is inside the band", `${formatMultiple(spread.bandMultiple)} the debit`],
    ["If every price in the band is equal", `${formatMultiple(spread.uniformMultiple)} the debit`],
    ["Range ratio", `${rangeRatio(spread).toFixed(2)} · ${ratioLabel(spread)}`],
    ["Chain-implied average", `${formatMultiple(spread.marketMultiple)} the debit`],
    ["Vol, long / short", `${spread.longIv.toFixed(1)}% / ${spread.shortIv.toFixed(1)}%`],
  ]
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-lg font-semibold">The trade</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Buy the {formatStrike(spread.longStrike)} call, sell the {formatStrike(spread.shortStrike)} call, for 1 BTC of notional.
      </p>
      <dl className="mt-4 space-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 border-b border-border pb-2">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-right font-mono text-sm">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {spread.breakevenHigh > band.high * 2
          ? `Bitcoin profit stays positive well past ${formatStrike(band.high)}, until about ${formatStrike(spread.breakevenHigh)}, but it is already shrinking once price clears the short strike.`
          : `Upper breakeven, where the fading bitcoin payoff gives the debit back, is ${formatStrike(spread.breakevenHigh)}.`}
        {spread.slippage > 0.05
          ? ` Crossing the market costs ${(spread.slippage * 100).toFixed(0)}% more than the mark.`
          : ""}
      </p>
    </div>
  )
}

function Scenarios({ spread, index, band }: { spread: Spread; index: number; band: Band }) {
  const rows = scenarioRows(spread, index, band)
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">If it expires here</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {rows.map((row) => {
          const pnl = spreadPnl(row.spot, spread.longStrike, spread.shortStrike, spread.debit)
          const positive = pnl > 0.0000001
          const negative = pnl < -0.0000001
          return (
            <div key={row.label} className="rounded-lg border border-border bg-card px-3 py-2">
              <p className="text-xs text-muted-foreground">{row.label}</p>
              <p className="font-mono text-sm">{formatStrike(row.spot)}</p>
              <p className={positive ? "font-mono text-sm text-[#1f7a4d]" : negative ? "font-mono text-sm text-destructive" : "font-mono text-sm"}>
                {formatMultiple(pnl / spread.debit)} · {formatBtc(pnl)} BTC
              </p>
              <p className="font-mono text-[11px] text-muted-foreground">{formatUsd(pnl * row.spot)} at expiry</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function scenarioRows(spread: Spread, index: number, band: Band): { label: string; spot: number }[] {
  const candidates = [
    { label: "Below the long strike", spot: Math.min(index, spread.longStrike * 0.9) },
    { label: "Long strike", spot: spread.longStrike },
    { label: "Breakeven", spot: spread.breakevenLow },
    { label: "Middle of the band", spot: (band.low + band.high) / 2 },
    { label: "Peak", spot: spread.shortStrike },
    { label: "Top of your band", spot: band.high },
    { label: "A push past the band", spot: Math.max(band.high * 1.2, spread.shortStrike * 1.15) },
  ]
  const kept: { label: string; spot: number }[] = []
  for (const candidate of candidates) {
    if (kept.some((row) => Math.abs(row.spot - candidate.spot) < 750)) continue
    kept.push(candidate)
  }
  return kept
}

function Spotlight({
  kicker,
  spread,
  figure,
  caption,
  active,
  onSelect,
}: {
  kicker: string
  spread?: Spread
  figure: string
  caption: string
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!spread}
      className={
        active
          ? "rounded-xl border border-primary bg-primary/10 p-4 text-left"
          : "rounded-xl border border-border bg-card p-4 text-left hover:bg-muted/40 disabled:cursor-default disabled:opacity-70"
      }
    >
      <p className="text-xs text-muted-foreground">{kicker}</p>
      <p className="mt-2 font-mono text-xl font-medium break-words sm:text-2xl">{figure}</p>
      <p className="mt-1 text-sm font-medium">
        {spread ? `${formatCompactStrike(spread.longStrike)} / ${formatCompactStrike(spread.shortStrike)}` : "—"}
        {spread && (
          <Badge variant="outline" className="ml-2 align-middle">
            {formatPct(spread.pop, 0)} chance
          </Badge>
        )}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{caption}</p>
    </button>
  )
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm font-medium">{value}</dd>
      {detail && <dd className="font-mono text-[11px] text-muted-foreground">{detail}</dd>}
    </div>
  )
}

function Empty({ band }: { band: Band }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center">
      <p className="font-medium">Nothing liquid in this band</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        No bull call spread into {formatStrike(band.low)}–{formatStrike(band.high)} has a two-sided market tight enough
        to rank. Widen the band, or move it closer to the future.
      </p>
    </div>
  )
}

function BandField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Input
        className="w-28 font-mono"
        inputMode="numeric"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          const next = Number(text.replace(/[^0-9]/g, ""))
          if (Number.isFinite(next) && next > 0) onChange(next)
          else setText(String(value))
        }}
      />
    </label>
  )
}

function clampBand(low: number, high: number): Band {
  const nextLow = clamp(Math.round(low), 20_000, 200_000)
  const nextHigh = clamp(Math.round(high), 20_000, 240_000)
  if (nextHigh - nextLow < 2000) return { low: nextLow, high: nextLow + 2000 }
  return { low: nextLow, high: nextHigh }
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

const RANK_MODES: { id: RankMode; label: string }[] = [
  { id: "ratio", label: "Range ratio" },
  { id: "flat", label: "Flat band" },
  { id: "band", label: "Curve in band" },
  { id: "top", label: "At the top" },
  { id: "market", label: "Chain average" },
]

function rangeRatio(spread: Spread): number {
  return spread.pop * spread.uniformMultiple
}

function ratioLabel(spread: Spread): string {
  return `${formatPct(spread.pop, 0)} × ${formatTimes(spread.uniformMultiple)}`
}

function visibleSpreads(ranked: Spread[], selected?: Spread): Spread[] {
  const top = ranked.slice(0, 15)
  if (selected && !top.some((spread) => spread.id === selected.id)) top.push(selected)
  return top
}

function sortSpreads(spreads: Spread[], mode: RankMode): Spread[] {
  const score = (spread: Spread) => {
    if (mode === "ratio") return rangeRatio(spread)
    if (mode === "flat") return spread.uniformMultiple
    if (mode === "top") return spread.topMultiple
    if (mode === "market") return spread.marketMultiple
    return spread.bandMultiple
  }
  return [...spreads].sort((a, b) => score(b) - score(a) || a.longStrike - b.longStrike || a.shortStrike - b.shortStrike)
}

function rewardRange(spreads: Spread[]): string | null {
  const values = spreads
    .map((spread) => spread.weightedRewardRisk)
    .filter((value) => value > 0)
    .sort((a, b) => a - b)
  if (values.length === 0) return null
  const at = (p: number) => values[Math.min(values.length - 1, Math.max(0, Math.round(p * (values.length - 1))))]
  const low = at(0.1)
  const high = at(0.9)
  if (high - low < 0.05) return low.toFixed(2)
  return `${low.toFixed(2)}–${high.toFixed(2)}`
}
