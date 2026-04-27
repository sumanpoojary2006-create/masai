'use client'
import { useState, useEffect, useCallback } from 'react'
import { createBrowserSupabase } from '@/lib/supabase-browser'
import type { Session } from '@/lib/batch-types'

export function useSessions(batchId: string) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    const supabase = createBrowserSupabase()
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('batch_id', batchId)
      .order('date', { ascending: true, nullsFirst: false })
    if (error) setError(error.message)
    else {
      setError(null)
      setSessions(data ?? [])
    }
    if (showLoading) setLoading(false)
  }, [batchId])

  useEffect(() => { fetch() }, [fetch])

  useEffect(() => {
    const supabase = createBrowserSupabase()
    const channel = supabase
      .channel(`batch-details-sessions-${batchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions', filter: `batch_id=eq.${batchId}` },
        () => {
          void fetch(false)
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [batchId, fetch])

  async function addSession(): Promise<{ data: Session | null; error: string | null }> {
    const supabase = createBrowserSupabase()
    const { data, error } = await supabase
      .from('sessions')
      .insert({ batch_id: batchId })
      .select()
      .single()
    if (error) return { data: null, error: error.message }
    setSessions(prev => [...prev, data])
    return { data, error: null }
  }

  async function updateSession(sessionId: string, updates: Partial<Session>): Promise<{ error: string | null }> {
    const supabase = createBrowserSupabase()
    const { error } = await supabase.from('sessions').update(updates).eq('id', sessionId)
    if (error) return { error: error.message }
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, ...updates } : s))
    return { error: null }
  }

  async function deleteSession(sessionId: string): Promise<{ error: string | null }> {
    const supabase = createBrowserSupabase()
    const { error } = await supabase.from('sessions').delete().eq('id', sessionId)
    if (error) return { error: error.message }
    setSessions(prev => prev.filter(s => s.id !== sessionId))
    return { error: null }
  }

  return { sessions, loading, error, addSession, updateSession, deleteSession, refetch: fetch }
}
