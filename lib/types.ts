/** One Deribit call, priced in BTC. */
export type CallQuote = {
  strike: number
  /** Exchange mark, in BTC. */
  mark: number
  bid: number
  ask: number
  /** Mark implied vol, in percent. */
  iv: number
  oi: number
}

export type MarketBook = {
  asOf: string
  source: "live" | "snapshot"
  /** Set when the live book could not be loaded. */
  notice?: string
  index: number
  /** Option underlying (the Dec future the marks use). */
  forward: number
  /** Expiry, milliseconds since epoch (08:00 UTC on the contract date). */
  expiryMs: number
  /** Deribit expiry token, e.g. 25DEC26. */
  expiryToken: string
  calls: CallQuote[]
}

export type Band = {
  low: number
  high: number
}

export type RankMode = "ratio" | "flat" | "band" | "top" | "market"

export type Spread = {
  id: string
  longStrike: number
  shortStrike: number
  longIv: number
  shortIv: number
  longAsk: number
  shortBid: number
  /** Ask of the long call minus bid of the short call. */
  debit: number
  midDebit: number
  /** How much worse the crossed market is than the mark, as a fraction of the mid debit. */
  slippage: number
  oi: number
  /** BTC profit at the short strike, where this spread peaks. */
  maxProfit: number
  rewardRisk: number
  breakevenLow: number
  breakevenHigh: number
  /** Chance settlement sits strictly between the breakevens. */
  pop: number
  /** Chance settlement is at or above the short strike. */
  pAboveShort: number
  /**
   * Average BTC pnl inside the band, weighted by the call curve, divided by debit.
   * Conditional on landing in the band.
   */
  bandMultiple: number
  /** Same average with every price in the band equally likely, divided by debit. */
  uniformMultiple: number
  /** BTC pnl if settlement equals the top of the band, divided by debit. */
  topMultiple: number
  /** Chain-implied E[pnl] / debit, over the whole distribution. */
  marketMultiple: number
  /**
   * Expected BTC gained when pnl > 0, divided by expected BTC lost when pnl < 0.
   * Probability-weighted reward-to-risk on the call curve.
   */
  weightedRewardRisk: number
  popTimesRewardRisk: number
}
