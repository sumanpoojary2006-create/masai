import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Batch } from '../types'

export function useBatches() {
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
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
    const { error } = await supabase
      .from('batches')
      .update(updates)
      .eq('id', id)
    if (error) return { error: error.message }
    setBatch(prev => prev ? { ...prev, ...updates } : prev)
    return { error: null }
  }

  return { batch, loading, error, updateBatch, refetch: fetch }
}
