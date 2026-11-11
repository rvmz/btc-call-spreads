import { NextResponse } from "next/server"
import { loadMarket } from "@/lib/market"

export const dynamic = "force-dynamic"

export async function GET() {
  const book = await loadMarket()
  return NextResponse.json(book)
}
