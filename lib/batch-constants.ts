export const BATCH_STATUS_OPTIONS = [
  'about-to-start',
  'in-order',
  'completed/last-leg',
]

export const DOMAIN_OPTIONS = [
  'AI-ML-DS',
  'Analytics',
  'Cloud & DevOps',
  'Cyber Security',
  'Digital Marketing',
  'Entrepreneurship / Leadership',
  'Finance',
  'Gen AI / Applied AI',
  'Maths',
  'Product Management',
  'Project Management',
  'Software Engineering',
  'MBA',
  'Others',
]

export const LANGUAGE_OPTIONS = [
  'English',
  'Hindi',
  'Telugu',
  'Tamil',
  'Kannada',
  'Marathi',
  'Malayalam',
  'Bengali',
  'Gujarati',
  'Punjabi',
  'Odia',
]

export const MODEL_NUMBER_OPTIONS = ['0', '1', '2', '3']

export const DAY_OPTIONS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

export const SESSION_ROLE_OPTIONS = [
  'professor',
  'industry-mentor',
  'teaching-assistant',
  'program-coordinator',
  'curriculum-coordinator',
  'guest-lecturer',
]

export const TEAM_ROLES = [
  { key: 'curriculum_coordinator', label: 'Curriculum Coordinator' },
  { key: 'instructor_1', label: 'Instructor 1 (IIT/IIM Professor)' },
  { key: 'instructor_2', label: 'Instructor 2 (Industry Mentor)' },
  { key: 'instructor_3', label: 'Instructor 3 (Industry Mentor)' },
]

export const STATUS_COLOR: Record<string, string> = {
  'about-to-start': '#3b82f6',
  'in-order': '#22c55e',
  'completed/last-leg': '#f97316',
}

export const STATUS_BG: Record<string, string> = {
  'about-to-start': '#eff6ff',
  'in-order': '#f0fdf4',
  'completed/last-leg': '#fff7ed',
}
