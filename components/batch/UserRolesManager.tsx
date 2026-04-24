'use client'
import { useAllUserRoles } from '@/hooks/useUserRole'
import type { UserRole } from '@/lib/batch-types'

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-red-50 text-red-700',
  editor: 'bg-blue-50 text-blue-700',
  viewer: 'bg-gray-100 text-gray-600',
}

const ROLES: UserRole[] = ['admin', 'editor', 'viewer']

export function UserRolesManager() {
  const { users, loading, updateRole } = useAllUserRoles()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">User Access</p>
          <p className="mt-0.5 text-xs text-gray-400">{users.length} user{users.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {users.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">No users found.</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">User ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Current Role</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Change Role</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Since</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{user.user_id}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_COLORS[user.role]}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={user.role}
                      onChange={e => updateRole(user.user_id, e.target.value as UserRole)}
                      className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
                    >
                      {ROLES.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(user.created_at).toLocaleDateString('en-IN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-xs font-medium text-amber-800">Role permissions</p>
        <ul className="mt-1 space-y-1 text-xs text-amber-700">
          <li><strong>Admin</strong> — full access: create, edit, delete batches & sessions; manage user roles</li>
          <li><strong>Editor</strong> — create & edit batches and sessions; cannot delete or manage users</li>
          <li><strong>Viewer</strong> — read-only access to all batches and sessions</li>
        </ul>
      </div>
    </div>
  )
}
