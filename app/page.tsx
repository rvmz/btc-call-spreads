"use client"

import { useEffect, useState } from "react"
import { Desk } from "@/components/desk"
import { loadMarket } from "@/lib/market"
import type { MarketBook } from "@/lib/types"

export default function Page() {
  const [book, setBook] = useState<MarketBook | null>(null)

  useEffect(() => {
    let cancelled = false
    loadMarket().then((next) => {
      if (!cancelled) setBook(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!book) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-16">
        <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">BTC · year-end</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Year-end call spreads</h1>
        <p className="mt-4 text-muted-foreground">Loading the December book from Deribit…</p>
      </main>
    )
  }

  return <Desk initial={book} />
}
