"use client"

import { useMemo, useState } from "react"
import { formatBtc, formatStrike, formatUsd } from "@/lib/format"
import { spreadPnl } from "@/lib/spreads"
import type { Band, Spread } from "@/lib/types"

const VIEW_W = 800
const VIEW_H = 320
const PAD = { l: 56, r: 16, t: 18, b: 36 }

type Props = {
  spread: Spread
  index: number
  band: Band
}

export function PayoffChart({ spread, index, band }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const model = useMemo(() => buildModel(spread, index, band), [spread, index, band])

  function priceAt(clientX: number, width: number): number | null {
    const x = (clientX / width) * VIEW_W
    if (x < PAD.l || x > VIEW_W - PAD.r) return null
    const t = (x - PAD.l) / (VIEW_W - PAD.l - PAD.r)
    return model.minX + t * (model.maxX - model.minX)
  }

  const hoverPnl = hover === null ? null : spreadPnl(hover, spread.longStrike, spread.shortStrike, spread.debit)

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="h-auto w-full touch-none"
        role="img"
        aria-label={`Payoff for the ${formatStrike(spread.longStrike)} ${formatStrike(spread.shortStrike)} call spread. Loss is the debit below the long strike. Profit peaks at the short strike.`}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          setHover(priceAt(event.clientX - rect.left, rect.width))
        }}
        onPointerLeave={() => setHover(null)}
      >
        <rect x={PAD.l} y={PAD.t} width={VIEW_W - PAD.l - PAD.r} height={VIEW_H - PAD.t - PAD.b} fill="#f7f4ee" />
        <BandRect model={model} band={band} />
        <line
          x1={PAD.l}
          x2={VIEW_W - PAD.r}
          y1={model.y(0)}
          y2={model.y(0)}
          stroke="#1c1915"
          strokeOpacity={0.35}
        />
        <polyline
          fill="none"
          stroke="#1f7a4d"
          strokeWidth={2.25}
          points={model.points.map((point) => `${point.x},${point.y}`).join(" ")}
        />
        <Marker model={model} price={index} label="spot" />
        <Marker model={model} price={spread.breakevenLow} label="breakeven" dashed />
        <Marker model={model} price={spread.shortStrike} label="peak" />
        {model.ticks.map((tick) => (
          <text
            key={tick.price}
            x={model.x(tick.price)}
            y={VIEW_H - 12}
            textAnchor="middle"
            fill="#5c574e"
            fontSize={11}
            fontFamily="IBM Plex Mono, ui-monospace, monospace"
          >
            {tick.label}
          </text>
        ))}
        {model.yTicks.map((tick) => (
          <text
            key={tick}
            x={PAD.l - 8}
            y={model.y(tick) + 4}
            textAnchor="end"
            fill="#5c574e"
            fontSize={11}
            fontFamily="IBM Plex Mono, ui-monospace, monospace"
          >
            {tick.toFixed(2)}
          </text>
        ))}
        {hover !== null && hoverPnl !== null && (
          <g>
            <line
              x1={model.x(hover)}
              x2={model.x(hover)}
              y1={PAD.t}
              y2={VIEW_H - PAD.b}
              stroke="#9a3412"
              strokeDasharray="3 3"
            />
            <circle cx={model.x(hover)} cy={model.y(hoverPnl)} r={4} fill="#9a3412" />
          </g>
        )}
      </svg>
      <p className="font-mono text-xs text-muted-foreground">
        {hover !== null && hoverPnl !== null ? (
          <>
            At {formatStrike(hover)} the spread {hoverPnl >= 0 ? "makes" : "loses"} {formatBtc(Math.abs(hoverPnl))} BTC
            {" "}({formatUsd(hoverPnl * hover)} if that bitcoin is sold at expiry).
          </>
        ) : (
          <>Drag across the chart. The line is bitcoin profit. It peaks at the short strike, then fades.</>
        )}
      </p>
    </div>
  )
}

function BandRect({
  model,
  band,
}: {
  model: ChartModel
  band: Band
}) {
  const x = model.x(Math.max(band.low, model.minX))
  const right = model.x(Math.min(band.high, model.maxX))
  return (
    <rect
      x={x}
      y={PAD.t}
      width={Math.max(0, right - x)}
      height={VIEW_H - PAD.t - PAD.b}
      fill="#1f7a4d"
      opacity={0.08}
    />
  )
}

function Marker({
  model,
  price,
  label,
  dashed,
}: {
  model: ChartModel
  price: number
  label: string
  dashed?: boolean
}) {
  if (price < model.minX || price > model.maxX) return null
  const x = model.x(price)
  return (
    <g>
      <line
        x1={x}
        x2={x}
        y1={PAD.t}
        y2={VIEW_H - PAD.b}
        stroke="#9a3412"
        strokeOpacity={0.45}
        strokeDasharray={dashed ? "4 4" : undefined}
      />
      <text
        x={x + 4}
        y={PAD.t + 12}
        fill="#9a3412"
        fontSize={11}
        fontFamily="IBM Plex Sans, sans-serif"
      >
        {label}
      </text>
    </g>
  )
}

type ChartModel = {
  minX: number
  maxX: number
  points: { x: number; y: number }[]
  ticks: { price: number; label: string }[]
  yTicks: number[]
  x: (price: number) => number
  y: (pnl: number) => number
}

function buildModel(spread: Spread, index: number, band: Band): ChartModel {
  const minX = Math.min(index * 0.72, band.low * 0.85, spread.longStrike * 0.8)
  const maxX = Math.max(band.high * 1.35, spread.shortStrike * 1.2, index * 1.7)
  let minY = -spread.debit
  let maxY = spread.maxProfit
  const samples: { price: number; pnl: number }[] = []
  const count = 160
  for (let i = 0; i <= count; i++) {
    const price = minX + ((maxX - minX) * i) / count
    const pnl = spreadPnl(price, spread.longStrike, spread.shortStrike, spread.debit)
    samples.push({ price, pnl })
    minY = Math.min(minY, pnl)
    maxY = Math.max(maxY, pnl)
  }
  const yPad = Math.max(0.004, (maxY - minY) * 0.12)
  minY -= yPad
  maxY += yPad
  const plotW = VIEW_W - PAD.l - PAD.r
  const plotH = VIEW_H - PAD.t - PAD.b
  const x = (price: number) => PAD.l + ((price - minX) / (maxX - minX)) * plotW
  const y = (pnl: number) => PAD.t + ((maxY - pnl) / (maxY - minY)) * plotH
  const tickPrices = uniquePrices([
    Math.round(minX / 10000) * 10000,
    index,
    band.low,
    band.high,
    Math.round(maxX / 10000) * 10000,
  ]).filter((price) => price >= minX && price <= maxX)
  const yTicks = [minY + yPad, 0, maxY - yPad].filter((value, index, all) =>
    all.findIndex((other) => Math.abs(other - value) < 0.004) === index
  )
  return {
    minX,
    maxX,
    points: samples.map((sample) => ({ x: x(sample.price), y: y(sample.pnl) })),
    ticks: tickPrices.map((price) => ({
      price,
      label: price >= 1000 ? `${Math.round(price / 1000)}k` : String(price),
    })),
    yTicks,
    x,
    y,
  }
}

function uniquePrices(prices: number[]): number[] {
  const sorted = [...prices].sort((a, b) => a - b)
  return sorted.filter((price, index) => index === 0 || price - sorted[index - 1] > 2500)
}
