export const DASHBOARD_NOTE_DIRECTORY = ''
export const DASHBOARD_NOTE_FILENAME = 'Dashboard.md'
export const DASHBOARD_NOTE_RELATIVE_PATH = DASHBOARD_NOTE_FILENAME

export const buildDashboardNoteCreatePayload = () => ({
  relativePath: DASHBOARD_NOTE_DIRECTORY,
  filename: DASHBOARD_NOTE_FILENAME,
  title: 'Dashboard'
})

export const isDashboardNotePath = (value = '') => String(value || '') === DASHBOARD_NOTE_RELATIVE_PATH
