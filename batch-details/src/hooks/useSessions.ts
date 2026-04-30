import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Session } from '../types'

export function useSessions(batchId: string) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('batch_id', batchId)
      .order('date', { ascending: true, nullsFirst: false })
    if (error) setError(error.message)
    else setSessions(data ?? [])
    setLoading(false)
  }, [batchId])

  useEffect(() => { fetch() }, [fetch])

  async function addSession(): Promise<{ data: Session | null; error: string | null }> {
    const { data, error } = await supabase
      .from('sessions')
      .insert({ batch_id: batchId })
      .select()
      .single()
    if (error) return { data: null, error: error.message }
    setSessions(prev => [...prev, data])
    return { data, error: null }
  }

  async function updateSession(
    sessionId: string,
    updates: Partial<Session>
  ): Promise<{ error: string | null }> {
    const { error } = await supabase
      .from('sessions')
      .update(updates)
      .eq('id', sessionId)
    if (error) return { error: error.message }
    setSessions(prev =>
      prev.map(s => (s.id === sessionId ? { ...s, ...updates } : s))
    )
    return { error: null }
  }

  async function deleteSession(sessionId: string): Promise<{ error: string | null }> {
    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('id', sessionId)
    if (error) return { error: error.message }
    setSessions(prev => prev.filter(s => s.id !== sessionId))
    return { error: null }
  }

  return { sessions, loading, error, addSession, updateSession, deleteSession, refetch: fetch }
}
