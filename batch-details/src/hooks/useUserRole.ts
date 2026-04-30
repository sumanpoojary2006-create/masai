import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { UserRoleRecord, UserRole } from '../types'

export function useAllUserRoles() {
  const [users, setUsers] = useState<UserRoleRecord[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('user_roles')
      .select('*')
      .order('created_at', { ascending: true })
    setUsers(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  async function updateRole(userId: string, role: UserRole) {
    await supabase.from('user_roles').update({ role }).eq('user_id', userId)
    setUsers(prev => prev.map(u => (u.user_id === userId ? { ...u, role } : u)))
  }

  return { users, loading, updateRole, refetch: fetch }
}
