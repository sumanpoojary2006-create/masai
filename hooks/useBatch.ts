'use client'
import { useState, useEffect, useCallback } from 'react'
import { createBrowserSupabase } from '@/lib/supabase-browser'
import type { Batch } from '@/lib/batch-types'

export function useBatches() {
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    const supabase = createBrowserSupabase()
    const { data, error } = await supabase
      .from('batches')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setBatches(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  return { batches, loading, error, refetch: fetch }
}

export function useBatch(id: string) {
  const [batch, setBatch] = useState<Batch | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    const supabase = createBrowserSupabase()
    const { data, error } = await supabase
      .from('batches')
      .select('*')
      .eq('id', id)
      .single()
    if (error) setError(error.message)
    else setBatch(data)
    setLoading(false)
  }, [id])

  useEffect(() => { fetch() }, [fetch])

  async function updateBatch(updates: Partial<Batch>): Promise<{ error: string | null }> {
    const supabase = createBrowserSupabase()
    const { error } = await supabase.from('batches').update(updates).eq('id', id)
    if (error) return { error: error.message }
    setBatch(prev => prev ? { ...prev, ...updates } : prev)
    return { error: null }
  }

  async function cloneBatch(): Promise<{ data: Batch | null; error: string | null }> {
    if (!batch) return { data: null, error: 'No batch loaded' }
    const supabase = createBrowserSupabase()

    // Clone batch metadata (exclude id, created_at, updated_at)
    const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = batch
    const cloneData = { ...rest, batch_name: `${batch.batch_name ?? 'Batch'} - COPY` }

    const { data: newBatch, error: batchErr } = await supabase
      .from('batches')
      .insert(cloneData)
      .select()
      .single()

    if (batchErr) return { data: null, error: batchErr.message }

    // Clone sessions
    const supabase2 = createBrowserSupabase()
    const { data: sessions } = await supabase2
      .from('sessions')
      .select('*')
      .eq('batch_id', id)

    if (sessions && sessions.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const clonedSessions = sessions.map(({ id: _sid, created_at: _sca, updated_at: _sua, batch_id: _bid, ...s }: Record<string, unknown>) => ({
        ...s,
        batch_id: newBatch.id,
      }))
      await supabase2.from('sessions').insert(clonedSessions)
    }

    return { data: newBatch, error: null }
  }

  return { batch, loading, error, updateBatch, cloneBatch, refetch: fetch }
}
