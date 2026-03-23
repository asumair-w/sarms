import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

function loadEnv(filePath) {
  const out = {}
  const txt = fs.readFileSync(filePath, 'utf8')
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx <= 0) continue
    const k = line.slice(0, idx).trim()
    const v = line.slice(idx + 1).trim()
    out[k] = v
  }
  return out
}

function id(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
}

const env = loadEnv(path.resolve('.env'))
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Missing Supabase env vars in .env')
  process.exit(1)
}

const supabase = createClient(url, key)
const report = {
  startedAt: new Date().toISOString(),
  scenarios: [],
}

async function run(name, fn) {
  const entry = { scenario: name, status: 'running', steps: [], errors: [] }
  report.scenarios.push(entry)
  const step = async (label, action) => {
    const s = { label, ok: false }
    entry.steps.push(s)
    try {
      const data = await action()
      s.ok = true
      if (data !== undefined) s.data = data
      return data
    } catch (e) {
      s.ok = false
      s.error = e?.message ?? String(e)
      entry.errors.push(`${label}: ${s.error}`)
      throw e
    }
  }
  try {
    await fn(step)
    entry.status = 'pass'
  } catch (e) {
    entry.status = 'fail'
  }
}

let workerId = null
let zoneId = null

await run('workers add/update/delete', async (step) => {
  const employeeId = id('smoke-w')
  const inserted = await step('insert worker', async () => {
    const row = {
      employee_id: employeeId,
      full_name: 'Smoke Worker',
      role: 'worker',
      department: 'farming',
      status: 'active',
      skills: [],
      data: {},
    }
    const { data, error } = await supabase.from('workers').insert(row).select('id,employee_id,full_name').single()
    if (error) throw error
    workerId = data.id
    return { workerId: data.id, employeeId: data.employee_id }
  })
  await step('update worker name', async () => {
    const { data, error } = await supabase
      .from('workers')
      .update({ full_name: 'Smoke Worker Updated' })
      .eq('id', inserted.workerId)
      .select('id,full_name')
      .single()
    if (error) throw error
    return data
  })
  await step('delete worker', async () => {
    const { error } = await supabase.from('workers').delete().eq('id', inserted.workerId)
    if (error) throw error
    const { data, error: checkErr } = await supabase.from('workers').select('id').eq('id', inserted.workerId).maybeSingle()
    if (checkErr) throw checkErr
    if (data) throw new Error('worker still exists after delete')
    workerId = null
    return { deleted: true }
  })
})

await run('tasks/sessions/approve -> operations_log', async (step) => {
  const employeeId = id('smoke-ops-w')
  const taskId = id('smoke-task')
  const sessionId = crypto.randomUUID()
  let approvedBy = null

  await step('prepare worker', async () => {
    const { data, error } = await supabase
      .from('workers')
      .insert({
        employee_id: employeeId,
        full_name: 'Smoke Ops Worker',
        role: 'worker',
        department: 'farming',
        status: 'active',
        skills: [],
      })
      .select('id')
      .single()
    if (error) throw error
    workerId = data.id
    approvedBy = data.id
    return { workerId }
  })

  await step('load one zone id', async () => {
    const { data, error } = await supabase.from('zones').select('id').limit(1).single()
    if (error) throw error
    zoneId = data.id
    return { zoneId }
  })

  await step('insert task', async () => {
    const { error } = await supabase.from('tasks').insert({
      id: taskId,
      zone_id: zoneId,
      batch_id: '1',
      task_type: 'farming',
      department_id: 'farming',
      task_id: 'harvesting',
      status: 'finished_by_worker',
      estimated_minutes: 60,
      data: {},
    })
    if (error) throw error
    const { error: twErr } = await supabase.from('task_workers').insert({ task_id: taskId, worker_id: workerId })
    if (twErr) throw twErr
    return { taskId }
  })

  await step('insert session', async () => {
    const now = new Date().toISOString()
    const { error } = await supabase.from('sessions').insert({
      id: sessionId,
      task_id: taskId,
      worker_id: workerId,
      worker_name: 'Smoke Ops Worker',
      department: 'farming',
      department_id: 'farming',
      task_type_id: 'farming',
      task: 'Harvest',
      zone: zoneId,
      zone_id: zoneId,
      lines_area: '1-2',
      start_time: now,
      expected_minutes: 60,
      status: 'finished_by_worker',
      finished_by_worker_at: now,
      assigned_by_engineer: true,
      flagged: false,
      notes: [],
      data: { clientId: id('session-client') },
    })
    if (error) throw error
    return { sessionId }
  })

  await step('call approve_task_complete RPC', async () => {
    const { error } = await supabase.rpc('approve_task_complete', {
      p_task_id: taskId,
      p_session_id: sessionId,
      p_start_time: new Date().toISOString(),
      p_expected_minutes: 60,
      p_record_id: id('rec'),
      p_record_snapshot: {
        id: id('rec-snap'),
        recordType: 'production',
        dateTime: new Date().toISOString(),
        notes: 'smoke worker note',
        engineerNotes: 'smoke engineer note',
      },
      p_approved_by: approvedBy,
    })
    if (error) throw error
    return { rpc: 'ok' }
  })

  await step('verify operations_log row exists and session removed', async () => {
    const { data: ops, error: opsErr } = await supabase
      .from('operations_log')
      .select('id,task_id,source_session_id,approved_at')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (opsErr) throw opsErr
    const { data: sess, error: sErr } = await supabase.from('sessions').select('id').eq('id', sessionId).maybeSingle()
    if (sErr) throw sErr
    if (sess) throw new Error('session still exists after approve RPC')
    return { operationsLogId: ops.id, sessionDeleted: true }
  })

  await step('cleanup task + worker', async () => {
    await supabase.from('task_workers').delete().eq('task_id', taskId)
    await supabase.from('tasks').delete().eq('id', taskId)
    await supabase.from('workers').delete().eq('id', workerId)
    workerId = null
    return { cleaned: true }
  })
})

await run('harvest_log insert/update/delete', async (step) => {
  const employeeId = id('smoke-harvest-w')
  const harvestId = crypto.randomUUID()
  await step('prepare worker + zone', async () => {
    const { data: w, error: wErr } = await supabase
      .from('workers')
      .insert({
        employee_id: employeeId,
        full_name: 'Smoke Harvest Worker',
        role: 'worker',
        department: 'farming',
        status: 'active',
        skills: [],
      })
      .select('id')
      .single()
    if (wErr) throw wErr
    workerId = w.id
    const { data: z, error: zErr } = await supabase.from('zones').select('id,label').limit(1).single()
    if (zErr) throw zErr
    zoneId = z.id
    return { workerId, zoneId }
  })
  await step('insert harvest_log row', async () => {
    const { error } = await supabase.from('harvest_log').insert({
      id: harvestId,
      zone_id: zoneId,
      zone_label: zoneId,
      lines_area: '3-5',
      recorded_at: new Date().toISOString(),
      quantity: 42,
      unit: 'kg',
      notes: 'smoke harvest',
      recorded_by: workerId,
    })
    if (error) throw error
    return { harvestId }
  })
  await step('update harvest_log row', async () => {
    const { data, error } = await supabase
      .from('harvest_log')
      .update({ quantity: 55, notes: 'smoke harvest updated' })
      .eq('id', harvestId)
      .select('id,quantity,notes')
      .single()
    if (error) throw error
    return data
  })
  await step('delete harvest_log row', async () => {
    const { error } = await supabase.from('harvest_log').delete().eq('id', harvestId)
    if (error) throw error
    const { data, error: checkErr } = await supabase.from('harvest_log').select('id').eq('id', harvestId).maybeSingle()
    if (checkErr) throw checkErr
    if (data) throw new Error('harvest row still exists after delete')
    return { deleted: true }
  })
  await step('cleanup worker', async () => {
    const { error } = await supabase.from('workers').delete().eq('id', workerId)
    if (error) throw error
    workerId = null
    return { cleaned: true }
  })
})

await run('inventory + inventory_movements', async (step) => {
  const invId = crypto.randomUUID()
  await step('insert inventory item', async () => {
    const { error } = await supabase.from('inventory').insert({
      id: invId,
      name: 'Smoke Item',
      category: 'general',
      quantity: 10,
      unit: 'kg',
      min_qty: 1,
      warning_qty: 2,
    })
    if (error) throw error
    return { invId }
  })
  await step('update inventory quantity', async () => {
    const { data, error } = await supabase
      .from('inventory')
      .update({ quantity: 14, last_updated: new Date().toISOString() })
      .eq('id', invId)
      .select('id,quantity')
      .single()
    if (error) throw error
    return data
  })
  await step('insert movement row', async () => {
    const { error } = await supabase.from('inventory_movements').insert({
      item_id: invId,
      old_quantity: 10,
      new_quantity: 14,
      movement_type: 'edit',
      changed_by: 'smoke-test',
      data: {},
    })
    if (error) throw error
    const { data, error: checkErr } = await supabase
      .from('inventory_movements')
      .select('id,item_id,old_quantity,new_quantity')
      .eq('item_id', invId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (checkErr) throw checkErr
    return data
  })
  await step('cleanup inventory', async () => {
    await supabase.from('inventory_movements').delete().eq('item_id', invId)
    await supabase.from('inventory').delete().eq('id', invId)
    return { cleaned: true }
  })
})

await run('equipment + ticket + resolve', async (step) => {
  const eqId = crypto.randomUUID()
  const ticketId = crypto.randomUUID()
  await step('insert equipment', async () => {
    const { error } = await supabase.from('equipment').insert({
      id: eqId,
      name: 'Smoke Equipment',
      zone: zoneId || 'inventory',
      status: 'active',
    })
    if (error) throw error
    return { eqId }
  })
  await step('insert open equipment ticket', async () => {
    const { error } = await supabase.from('equipment_tickets').insert({
      id: ticketId,
      equipment_id: eqId,
      equipment_name: 'Smoke Equipment',
      ticket_type: 'fault',
      status: 'open',
      severity: 'medium',
      description: 'smoke fault',
    })
    if (error) throw error
    return { ticketId }
  })
  await step('insert resolved ticket row', async () => {
    const { error } = await supabase.from('resolved_tickets').insert({
      source_ticket_id: ticketId,
      equipment_id: eqId,
      equipment_name: 'Smoke Equipment',
      ticket_type: 'fault',
      resolved_at: new Date().toISOString(),
      summary: 'resolved in smoke test',
      ticket_snapshot: { status: 'open' },
    })
    if (error) throw error
    return { resolved: true }
  })
  await step('delete open ticket and verify resolved exists', async () => {
    const { error } = await supabase.from('equipment_tickets').delete().eq('id', ticketId)
    if (error) throw error
    const { data, error: checkErr } = await supabase
      .from('resolved_tickets')
      .select('id,source_ticket_id')
      .eq('source_ticket_id', ticketId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (checkErr) throw checkErr
    return { resolvedTicketId: data.id }
  })
  await step('cleanup equipment domain rows', async () => {
    await supabase.from('resolved_tickets').delete().eq('source_ticket_id', ticketId)
    await supabase.from('equipment').delete().eq('id', eqId)
    return { cleaned: true }
  })
})

report.finishedAt = new Date().toISOString()
console.log(JSON.stringify(report, null, 2))
