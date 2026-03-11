import { eq } from 'drizzle-orm'
import { tradingPairs } from '../../database/schema'

export default defineEventHandler(async () => {
  const db = useDb()
  const pairs = await db.select().from(tradingPairs).where(eq(tradingPairs.isActive, true))
  return { pairs }
})
