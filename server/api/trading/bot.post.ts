export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const action = body?.action // 'start' | 'stop' | 'status'
  const interval = body?.interval || '15m'
  const supabase = useDb()

  if (action === 'start') {
    await supabase.from('bot_config').upsert({
      key: 'auto_trade',
      enabled: true,
      value: { interval, started_at: new Date().toISOString() },
    }, { onConflict: 'key' })

    return { status: 'running', interval }
  }

  if (action === 'stop') {
    await supabase.from('bot_config').upsert({
      key: 'auto_trade',
      enabled: false,
      value: { interval, stopped_at: new Date().toISOString() },
    }, { onConflict: 'key' })

    return { status: 'stopped' }
  }

  // status
  const { data: config } = await supabase
    .from('bot_config')
    .select('*')
    .eq('key', 'auto_trade')
    .single()

  return {
    status: config?.enabled ? 'running' : 'stopped',
    interval: config?.value?.interval || '15m',
    config,
  }
})
