export type UserRole = 'admin' | 'editor' | 'viewer'

export interface UserRoleRecord {
  id: string
  user_id: string
  role: UserRole
  created_at: string
  email?: string
}

export interface TeamMembers {
  curriculum_coordinator?: string
  instructor_1?: string
  instructor_2?: string
  instructor_3?: string
  teaching_assistants?: string[]
}

export interface GradingComponent {
  component: string
  weightage: number | null
}

export interface Batch {
  id: string
  batch_name: string | null
  program_name: string | null
  institute_name: string | null
  model_number: number | null
  start_date: string | null
  end_date_scheduled: string | null
  actual_end_date: string | null
  status: 'about-to-start' | 'in-order' | 'completed/last-leg' | null
  domain: string | null
  language: string | null
  website_link: string | null
  team_members: TeamMembers | null
  grading_policy: GradingComponent[] | null
  created_at: string
  updated_at: string
}

export interface Session {
  id: string
  batch_id: string
  date: string | null
  day: string | null
  start_time: string | null
  end_time: string | null
  session_title: string | null
  learning_objectives: string | null
  to_be_taken_by: string | null
  instructor_name: string | null
  rating: number | null
  zoom_link: string | null
  module_number: number | null
  module_name: string | null
  week_number: number | null
  session_number: number | null
  is_end_of_schedule: boolean | null
  created_at: string
  updated_at: string
}
