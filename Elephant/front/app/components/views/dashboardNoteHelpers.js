export const DASHBOARD_NOTE_DIRECTORY = ''
export const DASHBOARD_NOTE_FILENAME = 'Dashboard.md'
export const DASHBOARD_NOTE_RELATIVE_PATH = 'Dashboard.md'

export const buildDashboardNoteCreatePayload = () => ({
  relativePath: '',
  filename: DASHBOARD_NOTE_FILENAME,
  title: 'Dashboard'
})

export const isDashboardNotePath = (value = '') => String(value || '') === DASHBOARD_NOTE_RELATIVE_PATH
