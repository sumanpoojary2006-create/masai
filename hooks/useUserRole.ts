'use client'
import { useState, useEffect, useCallback } from 'react'
import { createBrowserSupabase } from '@/lib/supabase-browser'
import type { UserRole, UserRoleRecord } from '@/lib/batch-types'

export function useMyRole() {
  const [role, setRole] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createBrowserSupabase()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single()
      setRole((data?.role as UserRole) ?? 'viewer')
      setLoading(false)
    }
    load()
  }, [])

  return {
    role,
    loading,
    isAdmin: role === 'admin',
    canEdit: role === 'admin' || role === 'editor',
  }
}

export function useAllUserRoles() {
  const [users, setUsers] = useState<UserRoleRecord[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const supabase = createBrowserSupabase()
    const { data } = await supabase
      .from('user_roles')
      .select('*')
      .order('created_at', { ascending: true })
    setUsers(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  async function updateRole(userId: string, role: UserRole) {
    const supabase = createBrowserSupabase()
    await supabase.from('user_roles').update({ role }).eq('user_id', userId)
    setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, role } : u))
  }

  return { users, loading, updateRole, refetch: fetch }
}
