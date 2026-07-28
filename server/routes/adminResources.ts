import { Router } from 'express'
import { requireAuth } from '../lib/httpAuth.js'
import { getSupabase } from '../lib/supabase.js'
import { CAPABILITY_ROLES } from '../config/capabilities.js'

const router = Router()

router.use(requireAuth([...CAPABILITY_ROLES.manageResources]))

router.post('/warehouses', async (req, res, next) => {
  try {
    const code = String(req.body?.code ?? '').trim().toUpperCase()
    const name = String(req.body?.name ?? '').trim()
    if (!code || !name) {
      res.status(400).json({ error: 'Code and name are required' })
      return
    }
    const { error } = await getSupabase().from('warehouses').insert({ code, name, active: true } as never)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

router.put('/warehouses/:id', async (req, res, next) => {
  try {
    const name = String(req.body?.name ?? '').trim()
    if (!name) {
      res.status(400).json({ error: 'Name is required' })
      return
    }
    const { error } = await getSupabase().from('warehouses').update({ name } as never).eq('id', req.params.id)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

router.delete('/warehouses/:id', async (req, res, next) => {
  try {
    const { error } = await getSupabase().from('warehouses').delete().eq('id', req.params.id)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

router.post('/suppliers', async (req, res, next) => {
  try {
    const code = String(req.body?.code ?? '').trim().toUpperCase()
    const name = String(req.body?.name ?? '').trim()
    if (!code || !name) {
      res.status(400).json({ error: 'Code and name are required' })
      return
    }
    const { error } = await getSupabase().from('suppliers').insert({ code, name, active: true } as never)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

router.put('/suppliers/:id', async (req, res, next) => {
  try {
    const code = String(req.body?.code ?? '').trim().toUpperCase()
    const name = String(req.body?.name ?? '').trim()
    if (!code || !name) {
      res.status(400).json({ error: 'Code and name are required' })
      return
    }
    const { error } = await getSupabase().from('suppliers').update({ code, name } as never).eq('id', req.params.id)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

router.delete('/suppliers/:id', async (req, res, next) => {
  try {
    const { error } = await getSupabase().from('suppliers').delete().eq('id', req.params.id)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router
