const btcFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
})

const usdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

const kyivFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Kyiv",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

export function formatBtc(value: number): string {
  const sign = value < 0 ? "−" : ""
  return `${sign}${btcFormat.format(Math.abs(value))}`
}

export function formatUsd(value: number): string {
  const sign = value < 0 ? "−" : ""
  return `${sign}${usdFormat.format(Math.abs(value)).replace("-", "")}`
}

export function formatStrike(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`
}

export function formatCompactStrike(value: number): string {
  if (Math.abs(value) >= 1000) {
    const thousands = value / 1000
    const digits = thousands >= 100 || Number.isInteger(thousands) ? 0 : 1
    return `${thousands.toFixed(digits)}k`
  }
  return Math.round(value).toString()
}

export function formatPct(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits)}%`
}

export function formatMultiple(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : ""
  return `${sign}${Math.abs(value).toFixed(2)}×`
}

/** A payoff multiple that is already described as a return, so no sign. */
export function formatTimes(value: number): string {
  return `${value.toFixed(2)}×`
}

export function formatKyiv(ms: number): string {
  return `${kyivFormat.format(ms)} Kyiv`
}

export function formatCountdown(expiryMs: number, nowMs: number): string {
  const remain = expiryMs - nowMs
  if (remain <= 0) return "expired"
  const days = Math.floor(remain / 86_400_000)
  const hours = Math.floor((remain % 86_400_000) / 3_600_000)
  return `${days}d ${hours}h`
}
