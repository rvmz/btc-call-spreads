import { Desk } from "@/components/desk"
import { loadMarket } from "@/lib/market"

export const dynamic = "force-dynamic"

export default async function Page() {
  const book = await loadMarket()
  return <Desk initial={book} />
}
