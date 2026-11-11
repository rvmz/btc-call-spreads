import assert from "node:assert/strict"
import test from "node:test"
import { buildDistribution, enumerateSpreads, spreadPnl } from "./spreads.ts"
import type { CallQuote } from "./types.ts"

test("inverse call spread peaks at the short strike and then fades", () => {
  const debit = 0.02
  const atPeak = spreadPnl(100_000, 80_000, 100_000, debit)
  const above = spreadPnl(200_000, 80_000, 100_000, debit)
  const below = spreadPnl(70_000, 80_000, 100_000, debit)
  assert.equal(below, -debit)
  assert.ok(atPeak > above)
  assert.ok(atPeak > 0)
  assert.equal(atPeak, 20_000 / 100_000 - debit)
})

test("lower breakeven is the spot where the long call covers the debit", () => {
  const debit = 0.02
  const breakeven = 80_000 / (1 - debit)
  assert.ok(Math.abs(spreadPnl(breakeven, 80_000, 100_000, debit)) < 1e-12)
})

test("survival from the call curve falls as the strike rises", () => {
  const forward = 100
  const calls: CallQuote[] = [
    { strike: 80, mark: 0.25, bid: 0.24, ask: 0.26, iv: 40, oi: 10 },
    { strike: 100, mark: 0.1, bid: 0.09, ask: 0.11, iv: 40, oi: 10 },
    { strike: 120, mark: 0.04, bid: 0.03, ask: 0.05, iv: 42, oi: 10 },
    { strike: 150, mark: 0.01, bid: 0.005, ask: 0.015, iv: 45, oi: 10 },
  ]
  const distribution = buildDistribution(calls, forward)
  const at90 = distribution.above(90)
  const at110 = distribution.above(110)
  const at135 = distribution.above(135)
  assert.ok(Math.abs(at90 - 0.75) < 1e-9)
  assert.ok(Math.abs(at110 - 0.3) < 1e-9)
  assert.ok(Math.abs(at135 - 0.1) < 1e-9)
  assert.ok(distribution.above(100) < at90)
  assert.ok(distribution.above(100) > at110)
  const mass = distribution.buckets.reduce((sum, bucket) => sum + bucket.mass, 0)
  assert.ok(mass > 0.8 && mass < 1.05)
})

test("a noisy bump in the wing does not erase the tail", () => {
  const forward = 100
  const calls: CallQuote[] = [
    { strike: 50, mark: 0.5, bid: 1, ask: 1, iv: 1, oi: 1 },
    { strike: 80, mark: 0.2, bid: 1, ask: 1, iv: 1, oi: 1 },
    { strike: 100, mark: 0.2, bid: 1, ask: 1, iv: 1, oi: 1 },
    { strike: 130, mark: 0.05, bid: 1, ask: 1, iv: 1, oi: 1 },
  ]
  const distribution = buildDistribution(calls, forward)
  assert.ok(distribution.above(115) > 0)
  assert.ok(distribution.above(60) > distribution.above(115))
})

test("enumerate keeps a crossed bull call spread and drops a locked market", () => {
  const calls: CallQuote[] = [
    { strike: 80_000, mark: 0.03, bid: 0.029, ask: 0.031, iv: 37, oi: 500 },
    { strike: 100_000, mark: 0.005, bid: 0.004, ask: 0.006, iv: 44, oi: 800 },
    { strike: 90_000, mark: 0.01, bid: 0, ask: 0.012, iv: 40, oi: 10 },
  ]
  const spreads = enumerateSpreads(calls, 74_000, { low: 80_000, high: 100_000 })
  assert.equal(spreads.length, 1)
  const spread = spreads[0]
  assert.equal(spread.longStrike, 80_000)
  assert.equal(spread.shortStrike, 100_000)
  assert.equal(spread.debit, 0.031 - 0.004)
  assert.ok(spread.maxProfit > 0)
  assert.ok(spread.breakevenLow > 80_000)
  assert.ok(spread.breakevenHigh > 100_000)
  assert.ok(spread.bandMultiple > 0)
})
