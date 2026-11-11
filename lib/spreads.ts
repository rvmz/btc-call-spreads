import type { Band, CallQuote, Spread } from "./types"

/**
 * BTC pnl of a Deribit bull call spread at expiry.
 * Settlement pays max(S-K, 0) / S bitcoins, so profit peaks at the short
 * strike and shrinks if the price keeps rising.
 */
export function spreadPnl(
  spot: number,
  longStrike: number,
  shortStrike: number,
  debit: number
): number {
  if (spot <= 0) return -debit
  const long = Math.max(spot - longStrike, 0) / spot
  const short = Math.max(spot - shortStrike, 0) / spot
  return long - short - debit
}

export type Distribution = {
  /** Risk-neutral P(S > strike), read off the call curve. */
  above: (strike: number) => number
  /** Bucket midpoints and probability mass, covering the listed strikes. */
  buckets: { spot: number; mass: number }[]
}

type SlopePoint = { mid: number; survival: number }

/**
 * Build P(S > K) from call marks.
 * Call value in the forward's units is mark × forward. Its slope versus
 * strike is the risk-neutral chance of finishing above that strike.
 */
export function buildDistribution(
  calls: CallQuote[],
  forward: number
): Distribution {
  const quoted = calls
    .filter((call) => call.mark > 0 && call.strike > 0)
    .sort((a, b) => a.strike - b.strike)
    .filter((call, index, all) => index === 0 || call.strike !== all[index - 1].strike)

  const points: SlopePoint[] = []
  if (quoted.length >= 2 && forward > 0) {
    const raw: number[] = []
    for (let i = 0; i < quoted.length - 1; i++) {
      const width = quoted[i + 1].strike - quoted[i].strike
      const left = quoted[i].mark * forward
      const right = quoted[i + 1].mark * forward
      raw.push(width > 0 ? (left - right) / width : 0)
    }
    const survival = decreasing(raw.map((value) => clamp(value, 0, 1)))
    for (let i = 0; i < survival.length; i++) {
      points.push({
        mid: (quoted[i].strike + quoted[i + 1].strike) / 2,
        survival: survival[i],
      })
    }
  }

  const above = (strike: number) => survivalAt(points, strike)
  const buckets = bucketize(above, quoted)
  return { above, buckets }
}

/** Pool adjacent violators so the survival curve never rises with strike. */
function decreasing(values: number[]): number[] {
  const next = values.slice()
  for (let i = 1; i < next.length; i++) {
    if (next[i] <= next[i - 1] + 1e-9) continue
    let sum = next[i]
    let count = 1
    let start = i
    while (start > 0 && next[start - 1] < sum / count) {
      start--
      sum += next[start]
      count++
    }
    const average = sum / count
    for (let k = start; k <= i; k++) next[k] = average
  }
  return next
}

function survivalAt(points: SlopePoint[], strike: number): number {
  if (points.length === 0) return strike <= 0 ? 1 : 0
  const first = points[0]
  const last = points[points.length - 1]
  if (strike <= first.mid) {
    if (strike <= 0 || first.mid <= 0) return 1
    const t = clamp(strike / first.mid, 0, 1)
    return 1 * (1 - t) + first.survival * t
  }
  if (strike >= last.mid) {
    const span = Math.max(last.mid * 0.5, 1)
    const t = clamp((strike - last.mid) / span, 0, 1)
    return last.survival * (1 - t)
  }
  for (let i = 0; i < points.length - 1; i++) {
    const left = points[i]
    const right = points[i + 1]
    if (strike < left.mid || strike > right.mid) continue
    const span = right.mid - left.mid
    const t = span === 0 ? 0 : (strike - left.mid) / span
    return left.survival * (1 - t) + right.survival * t
  }
  return last.survival
}

function bucketize(
  above: (strike: number) => number,
  quoted: CallQuote[]
): { spot: number; mass: number }[] {
  const first = quoted[0]?.strike ?? 20_000
  const last = quoted[quoted.length - 1]?.strike ?? 200_000
  const low = first * 0.4
  const high = last * 1.6
  const step = high - low > 5_000 ? 250 : (high - low) / 400
  const buckets: { spot: number; mass: number }[] = []
  for (let strike = low; strike < high; strike += step) {
    const mass = Math.max(0, above(strike) - above(Math.min(high, strike + step)))
    buckets.push({ spot: strike + step / 2, mass })
  }
  return buckets
}

export type SpreadFilters = {
  minDebit?: number
  maxSlippage?: number
  minOi?: number
  minWidth?: number
  /** How far below the band the long strike may sit. */
  longExtension?: number
  /** How far above the band the short strike may sit. */
  shortExtension?: number
}

const defaultFilters: Required<SpreadFilters> = {
  minDebit: 0.002,
  maxSlippage: 0.3,
  minOi: 100,
  minWidth: 2000,
  longExtension: 20000,
  shortExtension: 15000,
}

/**
 * Every liquid bull call spread that expresses a move into the band.
 * Debit is the price to cross the market: buy the ask, sell the bid.
 */
export function enumerateSpreads(
  calls: CallQuote[],
  forward: number,
  band: Band,
  filters: SpreadFilters = {}
): Spread[] {
  const rules = { ...defaultFilters, ...filters }
  const distribution = buildDistribution(calls, forward)
  const eligible = calls.filter(
    (call) => call.bid > 0 && call.ask > 0 && call.ask >= call.bid && call.mark > 0
  )
  const spreads: Spread[] = []

  for (const long of eligible) {
    if (long.strike < band.low - rules.longExtension) continue
    if (long.strike > band.high) continue
    for (const short of eligible) {
      if (short.strike < band.low) continue
      if (short.strike > band.high + rules.shortExtension) continue
      if (short.strike < long.strike + rules.minWidth) continue

      const debit = long.ask - short.bid
      const midDebit = long.mark - short.mark
      if (debit < rules.minDebit || midDebit <= 0) continue
      const slippage = (debit - midDebit) / midDebit
      if (slippage > rules.maxSlippage) continue
      const oi = Math.min(long.oi, short.oi)
      if (oi < rules.minOi) continue

      const maxProfit = (short.strike - long.strike) / short.strike - debit
      if (maxProfit <= 0 || debit >= 1) continue

      const breakevenLow = long.strike / (1 - debit)
      const breakevenHigh = (short.strike - long.strike) / debit
      const pop = Math.max(0, distribution.above(breakevenLow) - distribution.above(breakevenHigh))
      const moments = expectedPnl(distribution, long.strike, short.strike, debit, band)

      spreads.push({
        id: `${long.strike}-${short.strike}`,
        longStrike: long.strike,
        shortStrike: short.strike,
        longIv: long.iv,
        shortIv: short.iv,
        longAsk: long.ask,
        shortBid: short.bid,
        debit,
        midDebit,
        slippage,
        oi,
        maxProfit,
        rewardRisk: maxProfit / debit,
        breakevenLow,
        breakevenHigh,
        pop,
        pAboveShort: distribution.above(short.strike),
        bandMultiple: moments.band / debit,
        uniformMultiple: moments.uniform / debit,
        topMultiple: spreadPnl(band.high, long.strike, short.strike, debit) / debit,
        marketMultiple: moments.all / debit,
        weightedRewardRisk: moments.loss > 0 ? moments.gain / moments.loss : 0,
        popTimesRewardRisk: pop * (maxProfit / debit),
      })
    }
  }

  return spreads
}

function expectedPnl(
  distribution: Distribution,
  longStrike: number,
  shortStrike: number,
  debit: number,
  band: Band
): { all: number; band: number; bandMass: number; uniform: number; gain: number; loss: number } {
  let all = 0
  let bandPnl = 0
  let bandMass = 0
  let gain = 0
  let loss = 0
  for (const bucket of distribution.buckets) {
    const pnl = spreadPnl(bucket.spot, longStrike, shortStrike, debit)
    all += bucket.mass * pnl
    if (pnl > 0) gain += bucket.mass * pnl
    else loss += bucket.mass * -pnl
    if (bucket.spot >= band.low && bucket.spot <= band.high) {
      bandPnl += bucket.mass * pnl
      bandMass += bucket.mass
    }
  }

  const steps = 200
  const width = band.high - band.low
  let uniform = 0
  if (width > 0) {
    for (let i = 0; i < steps; i++) {
      const spot = band.low + ((i + 0.5) * width) / steps
      uniform += spreadPnl(spot, longStrike, shortStrike, debit)
    }
    uniform /= steps
  }

  return {
    all,
    band: bandMass > 0 ? bandPnl / bandMass : 0,
    bandMass,
    uniform,
    gain,
    loss,
  }
}

export function chanceBetween(
  distribution: Distribution,
  low: number,
  high: number
): number {
  return Math.max(0, distribution.above(low) - distribution.above(high))
}

export function findSpread(
  spreads: Spread[],
  longStrike: number,
  shortStrike: number
): Spread | undefined {
  return spreads.find(
    (spread) => spread.longStrike === longStrike && spread.shortStrike === shortStrike
  )
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}
