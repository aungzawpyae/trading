export default defineEventHandler(async () => {
  const supabase = useDb()
  const { data: pairs } = await supabase
    .from('trading_pairs')
    .select('*')
    .eq('is_active', true)

  return { pairs: pairs || [] }
})
