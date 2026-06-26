export const DASHBOARD_NOTE_DIRECTORY = '.dashboard'
export const DASHBOARD_NOTE_FILENAME = 'Dashboard.md'
export const DASHBOARD_NOTE_RELATIVE_PATH = '.dashboard/Dashboard.md'

export const buildDashboardNoteCreatePayload = () => ({
  relativePath: DASHBOARD_NOTE_DIRECTORY,
  filename: DASHBOARD_NOTE_FILENAME,
  title: 'Dashboard'
})

export const isDashboardNotePath = (value = '') => String(value || '') === DASHBOARD_NOTE_RELATIVE_PATH
