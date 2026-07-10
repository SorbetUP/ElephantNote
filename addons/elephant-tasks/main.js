const ADDON_ID = 'com.elephantnote.elephant-tasks'
const VIEW_ID = `${ADDON_ID}.workspace`
const STORAGE_KEY = 'database'
const DATABASE_VERSION = 1
const MAX_TASKS = 10000
const MAX_AREAS = 200
const MAX_PROJECTS = 1000
const MAX_REPEAT_GENERATIONS = 64

const pad = (value) => String(value).padStart(2, '0')
const localDate = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const nowIso = () => new Date().toISOString()
const safeText = (value, max = 500) => String(value ?? '').trim().slice(0, max)
const unique = (values) => [...new Set((values || []).map(value => safeText(value, 80).toLowerCase()).filter(Boolean))]
const createId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : ''
const compareDate = (left, right) => String(left || '').localeCompare(String(right || ''))
const parseDate = (value) => {
  const normalized = validDate(value)
  if (!normalized) return null
  const date = new Date(`${normalized}T12:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}
const addDays = (value, amount) => {
  const date = parseDate(value) || new Date()
  date.setDate(date.getDate() + Number(amount || 0))
  return localDate(date)
}
const addMonths = (value, amount) => {
  const date = parseDate(value) || new Date()
  const expectedDay = date.getDate()
  date.setDate(1)
  date.setMonth(date.getMonth() + Number(amount || 0))
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  date.setDate(Math.min(expectedDay, lastDay))
  return localDate(date)
}
const addYears = (value, amount) => {
  const date = parseDate(value) || new Date()
  const month = date.getMonth()
  date.setFullYear(date.getFullYear() + Number(amount || 0))
  if (date.getMonth() !== month) date.setDate(0)
  return localDate(date)
}
const advanceDate = (value, frequency, interval = 1) => {
  const step = Math.max(1, Math.min(365, Number(interval) || 1))
  if (frequency === 'daily') return addDays(value, step)
  if (frequency === 'monthly') return addMonths(value, step)
  if (frequency === 'yearly') return addYears(value, step)
  return addDays(value, step * 7)
}

const defaultDatabase = () => ({
  version: DATABASE_VERSION,
  tasks: [],
  areas: [],
  projects: [],
  repeatTemplates: [],
  createdAt: nowIso(),
  updatedAt: nowIso()
})

const normalizeChecklist = (value) => Array.isArray(value)
  ? value.slice(0, 200).map(item => ({
    id: safeText(item?.id, 100) || createId('check'),
    title: safeText(item?.title, 500),
    completed: item?.completed === true
  })).filter(item => item.title)
  : []

const normalizeRecurrence = (value) => {
  if (!value || typeof value !== 'object') return null
  const mode = value.mode === 'after-completion' ? 'after-completion' : 'fixed'
  const frequency = ['daily', 'weekly', 'monthly', 'yearly'].includes(value.frequency) ? value.frequency : 'weekly'
  return {
    mode,
    frequency,
    interval: Math.max(1, Math.min(365, Number(value.interval) || 1))
  }
}

const normalizeTask = (task = {}) => ({
  id: safeText(task.id, 100) || createId('task'),
  title: safeText(task.title, 500) || 'Untitled task',
  notes: String(task.notes || '').slice(0, 20000),
  status: ['open', 'completed', 'canceled'].includes(task.status) ? task.status : 'open',
  bucket: ['inbox', 'anytime', 'someday'].includes(task.bucket) ? task.bucket : 'inbox',
  today: task.today === true,
  evening: task.evening === true,
  startDate: validDate(task.startDate),
  deadline: validDate(task.deadline),
  areaId: safeText(task.areaId, 100),
  projectId: safeText(task.projectId, 100),
  heading: safeText(task.heading, 160),
  tags: unique(task.tags),
  checklist: normalizeChecklist(task.checklist),
  order: Number.isFinite(task.order) ? task.order : Date.now(),
  recurrenceTemplateId: safeText(task.recurrenceTemplateId, 100),
  occurrenceDate: validDate(task.occurrenceDate),
  createdAt: safeText(task.createdAt, 60) || nowIso(),
  updatedAt: safeText(task.updatedAt, 60) || nowIso(),
  completedAt: safeText(task.completedAt, 60),
  canceledAt: safeText(task.canceledAt, 60)
})

const normalizeArea = (area = {}) => ({
  id: safeText(area.id, 100) || createId('area'),
  title: safeText(area.title, 100) || 'Untitled area',
  notes: String(area.notes || '').slice(0, 10000),
  tags: unique(area.tags),
  color: safeText(area.color, 30),
  archived: area.archived === true,
  createdAt: safeText(area.createdAt, 60) || nowIso(),
  updatedAt: safeText(area.updatedAt, 60) || nowIso()
})

const normalizeProject = (project = {}) => ({
  id: safeText(project.id, 100) || createId('project'),
  title: safeText(project.title, 160) || 'Untitled project',
  notes: String(project.notes || '').slice(0, 20000),
  areaId: safeText(project.areaId, 100),
  status: ['open', 'completed', 'canceled'].includes(project.status) ? project.status : 'open',
  tags: unique(project.tags),
  headings: unique(project.headings).map(value => safeText(value, 160)),
  startDate: validDate(project.startDate),
  deadline: validDate(project.deadline),
  createdAt: safeText(project.createdAt, 60) || nowIso(),
  updatedAt: safeText(project.updatedAt, 60) || nowIso(),
  completedAt: safeText(project.completedAt, 60)
})

const normalizeTemplate = (template = {}) => ({
  id: safeText(template.id, 100) || createId('repeat'),
  sourceTaskId: safeText(template.sourceTaskId, 100),
  title: safeText(template.title, 500) || 'Untitled repeating task',
  notes: String(template.notes || '').slice(0, 20000),
  bucket: ['inbox', 'anytime', 'someday'].includes(template.bucket) ? template.bucket : 'anytime',
  today: template.today === true,
  evening: template.evening === true,
  areaId: safeText(template.areaId, 100),
  projectId: safeText(template.projectId, 100),
  heading: safeText(template.heading, 160),
  tags: unique(template.tags),
  checklist: normalizeChecklist(template.checklist).map(item => ({ ...item, completed: false })),
  mode: template.mode === 'after-completion' ? 'after-completion' : 'fixed',
  frequency: ['daily', 'weekly', 'monthly', 'yearly'].includes(template.frequency) ? template.frequency : 'weekly',
  interval: Math.max(1, Math.min(365, Number(template.interval) || 1)),
  nextDate: validDate(template.nextDate),
  deadlineOffsetDays: Number.isFinite(template.deadlineOffsetDays) ? template.deadlineOffsetDays : null,
  paused: template.paused === true,
  createdAt: safeText(template.createdAt, 60) || nowIso(),
  updatedAt: safeText(template.updatedAt, 60) || nowIso()
})

const normalizeDatabase = (value) => {
  if (!value || typeof value !== 'object' || value.version !== DATABASE_VERSION) return defaultDatabase()
  return {
    version: DATABASE_VERSION,
    tasks: Array.isArray(value.tasks) ? value.tasks.slice(0, MAX_TASKS).map(normalizeTask) : [],
    areas: Array.isArray(value.areas) ? value.areas.slice(0, MAX_AREAS).map(normalizeArea) : [],
    projects: Array.isArray(value.projects) ? value.projects.slice(0, MAX_PROJECTS).map(normalizeProject) : [],
    repeatTemplates: Array.isArray(value.repeatTemplates) ? value.repeatTemplates.slice(0, MAX_TASKS).map(normalizeTemplate) : [],
    createdAt: safeText(value.createdAt, 60) || nowIso(),
    updatedAt: safeText(value.updatedAt, 60) || nowIso()
  }
}

const parseQuickCapture = (rawTitle, params = {}) => {
  let title = safeText(rawTitle, 500)
  const tags = []
  const tokens = title.split(/\s+/)
  const kept = []
  const result = {
    title: '',
    bucket: params.bucket || 'inbox',
    today: params.today === true,
    evening: false,
    startDate: validDate(params.startDate),
    deadline: validDate(params.deadline),
    tags: unique(params.tags)
  }
  for (const token of tokens) {
    if (/^#[\p{L}\p{N}_/-]+$/u.test(token)) {
      tags.push(token.slice(1))
    } else if (token === '!today') {
      result.today = true
      result.bucket = 'anytime'
    } else if (token === '!evening') {
      result.today = true
      result.evening = true
      result.bucket = 'anytime'
    } else if (token === '!tomorrow') {
      result.startDate = addDays(localDate(), 1)
      result.bucket = 'anytime'
    } else if (token === '!someday') {
      result.bucket = 'someday'
      result.today = false
    } else if (/^start:\d{4}-\d{2}-\d{2}$/.test(token)) {
      result.startDate = token.slice(6)
      result.bucket = 'anytime'
    } else if (/^due:\d{4}-\d{2}-\d{2}$/.test(token)) {
      result.deadline = token.slice(4)
    } else {
      kept.push(token)
    }
  }
  title = kept.join(' ').trim()
  result.title = title || safeText(rawTitle, 500)
  result.tags = unique([...result.tags, ...tags])
  return result
}

const inheritedTags = (db, task) => {
  const area = db.areas.find(item => item.id === task.areaId)
  const project = db.projects.find(item => item.id === task.projectId)
  const projectArea = db.areas.find(item => item.id === project?.areaId)
  return unique([...(task.tags || []), ...(area?.tags || []), ...(project?.tags || []), ...(projectArea?.tags || [])])
}

const makeOccurrence = (template, date) => normalizeTask({
  id: createId('task'),
  title: template.title,
  notes: template.notes,
  bucket: template.bucket,
  today: template.today,
  evening: template.evening,
  startDate: date,
  deadline: Number.isFinite(template.deadlineOffsetDays) ? addDays(date, template.deadlineOffsetDays) : '',
  areaId: template.areaId,
  projectId: template.projectId,
  heading: template.heading,
  tags: template.tags,
  checklist: template.checklist.map(item => ({ ...item, id: createId('check'), completed: false })),
  recurrenceTemplateId: template.id,
  occurrenceDate: date,
  createdAt: nowIso(),
  updatedAt: nowIso()
})

const materializeRepeats = (db, today = localDate()) => {
  const horizon = addDays(today, 90)
  let generated = 0
  for (const template of db.repeatTemplates) {
    if (template.paused || template.mode !== 'fixed' || !template.nextDate) continue
    while (template.nextDate && compareDate(template.nextDate, horizon) <= 0 && generated < MAX_REPEAT_GENERATIONS) {
      const exists = db.tasks.some(task => task.recurrenceTemplateId === template.id && task.occurrenceDate === template.nextDate)
      if (!exists && db.tasks.length < MAX_TASKS) {
        db.tasks.push(makeOccurrence(template, template.nextDate))
        generated += 1
      }
      template.nextDate = advanceDate(template.nextDate, template.frequency, template.interval)
      template.updatedAt = nowIso()
    }
  }
  return generated
}

const createOrUpdateTemplate = (db, task, recurrence) => {
  const normalized = normalizeRecurrence(recurrence)
  if (!normalized) {
    if (task.recurrenceTemplateId) {
      const template = db.repeatTemplates.find(item => item.id === task.recurrenceTemplateId)
      if (template) template.paused = true
    }
    task.recurrenceTemplateId = ''
    return null
  }

  let template = db.repeatTemplates.find(item => item.id === task.recurrenceTemplateId)
  if (!template) {
    template = normalizeTemplate({ id: createId('repeat'), sourceTaskId: task.id })
    db.repeatTemplates.push(template)
    task.recurrenceTemplateId = template.id
  }

  const baseDate = task.startDate || localDate()
  const deadlineOffsetDays = task.deadline && parseDate(task.deadline) && parseDate(baseDate)
    ? Math.round((parseDate(task.deadline).getTime() - parseDate(baseDate).getTime()) / 86400000)
    : null
  Object.assign(template, {
    title: task.title,
    notes: task.notes,
    bucket: task.bucket === 'inbox' ? 'anytime' : task.bucket,
    today: task.today,
    evening: task.evening,
    areaId: task.areaId,
    projectId: task.projectId,
    heading: task.heading,
    tags: [...task.tags],
    checklist: task.checklist.map(item => ({ ...item, completed: false })),
    mode: normalized.mode,
    frequency: normalized.frequency,
    interval: normalized.interval,
    deadlineOffsetDays,
    nextDate: normalized.mode === 'fixed' ? advanceDate(baseDate, normalized.frequency, normalized.interval) : '',
    paused: false,
    updatedAt: nowIso()
  })
  return template
}

const completeTask = (db, task) => {
  if (!task || task.status !== 'open') return
  const completedAt = nowIso()
  task.status = 'completed'
  task.completedAt = completedAt
  task.updatedAt = completedAt
  task.today = false

  const template = db.repeatTemplates.find(item => item.id === task.recurrenceTemplateId)
  if (template && !template.paused && template.mode === 'after-completion' && db.tasks.length < MAX_TASKS) {
    const nextDate = advanceDate(localDate(), template.frequency, template.interval)
    const existing = db.tasks.some(candidate => candidate.recurrenceTemplateId === template.id && candidate.status === 'open')
    if (!existing) db.tasks.push(makeOccurrence(template, nextDate))
  }
}

const taskMatchesList = (task, list, today) => {
  if (list === 'logbook') return task.status === 'completed' || task.status === 'canceled'
  if (task.status !== 'open') return false
  if (list === 'inbox') return task.bucket === 'inbox'
  if (list === 'today') {
    if (task.today) return true
    if (task.startDate && compareDate(task.startDate, today) <= 0) return true
    return Boolean(task.deadline && compareDate(task.deadline, today) <= 0)
  }
  if (list === 'upcoming') return Boolean(task.startDate && compareDate(task.startDate, today) > 0)
  if (list === 'anytime') return task.bucket === 'anytime' && (!task.startDate || compareDate(task.startDate, today) <= 0)
  if (list === 'someday') return task.bucket === 'someday'
  if (list === 'deadlines') return Boolean(task.deadline)
  if (list === 'repeating') return Boolean(task.recurrenceTemplateId)
  if (list.startsWith('area:')) return task.areaId === list.slice(5) || Boolean(task.projectId && task.projectId === list.slice(5))
  if (list.startsWith('project:')) return task.projectId === list.slice(8)
  return false
}

const listMetadata = (db, list) => {
  const fixed = {
    inbox: ['Inbox', 'Capture first. Clarify and organize when you are ready.', 'Capture'],
    today: ['Today', 'A deliberate, realistic list for the day.', 'Focus'],
    upcoming: ['Upcoming', 'Tasks stay out of sight until their start date.', 'Plan'],
    anytime: ['Anytime', 'Available work you can start now.', 'Available'],
    someday: ['Someday', 'Ideas and commitments that are not actionable yet.', 'Later'],
    deadlines: ['Deadlines', 'Hard finish dates, kept separate from start dates.', 'Time-sensitive'],
    repeating: ['Repeating', 'Generated occurrences from active repeat templates.', 'Routines'],
    logbook: ['Logbook', 'Completed and canceled work remains searchable.', 'History']
  }
  if (fixed[list]) return { id: list, title: fixed[list][0], description: fixed[list][1], eyebrow: fixed[list][2] }
  if (list.startsWith('area:')) {
    const area = db.areas.find(item => item.id === list.slice(5))
    return { id: list, title: area?.title || 'Area', description: area?.notes || 'An ongoing area of responsibility.', eyebrow: 'Area' }
  }
  if (list.startsWith('project:')) {
    const project = db.projects.find(item => item.id === list.slice(8))
    return { id: list, title: project?.title || 'Project', description: project?.notes || 'A finite outcome with multiple steps.', eyebrow: 'Project' }
  }
  return { id: 'inbox', title: 'Inbox', description: 'Capture first. Clarify later.', eyebrow: 'Capture' }
}

const taskView = (db, task, today) => {
  const project = db.projects.find(item => item.id === task.projectId)
  const directArea = db.areas.find(item => item.id === task.areaId)
  const projectArea = db.areas.find(item => item.id === project?.areaId)
  const checklistCompleted = task.checklist.filter(item => item.completed).length
  return {
    ...task,
    tags: inheritedTags(db, task),
    projectTitle: project?.title || '',
    areaTitle: directArea?.title || projectArea?.title || '',
    deadlineOverdue: Boolean(task.deadline && compareDate(task.deadline, today) < 0 && task.status === 'open'),
    repeating: Boolean(task.recurrenceTemplateId),
    recurrence: task.recurrenceTemplateId
      ? db.repeatTemplates.find(item => item.id === task.recurrenceTemplateId) || null
      : null,
    checklistCompleted,
    checklistTotal: task.checklist.length
  }
}

const sortTasks = (left, right) => {
  if (left.status !== right.status) return left.status === 'open' ? -1 : 1
  if (left.deadline && right.deadline && left.deadline !== right.deadline) return compareDate(left.deadline, right.deadline)
  if (left.startDate && right.startDate && left.startDate !== right.startDate) return compareDate(left.startDate, right.startDate)
  if (left.startDate !== right.startDate) return left.startDate ? -1 : 1
  return Number(left.order || 0) - Number(right.order || 0)
}

const makeSections = (db, list, tasks, today) => {
  const rows = tasks.map(task => taskView(db, task, today))
  if (list === 'today') {
    const overdue = rows.filter(task => task.deadlineOverdue || (task.startDate && compareDate(task.startDate, today) < 0)).filter(task => !task.evening)
    const daytime = rows.filter(task => !overdue.includes(task) && !task.evening)
    const evening = rows.filter(task => task.evening)
    return [
      { id: 'overdue', title: overdue.length ? 'Overdue' : '', tasks: overdue },
      { id: 'today', title: 'Today', tasks: daytime },
      { id: 'evening', title: evening.length ? 'Evening' : '', tasks: evening }
    ].filter(section => section.tasks.length)
  }
  if (list === 'upcoming') {
    const groups = new Map()
    for (const task of rows) {
      const key = task.startDate || 'Later'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(task)
    }
    return [...groups.entries()].sort(([left], [right]) => compareDate(left, right)).map(([date, grouped]) => ({
      id: date,
      title: date === 'Later' ? date : new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(parseDate(date)),
      tasks: grouped
    }))
  }
  if (list === 'deadlines') {
    const groups = new Map()
    for (const task of rows) {
      const key = task.deadline && compareDate(task.deadline, today) < 0 ? 'Overdue' : task.deadline || 'No deadline'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(task)
    }
    return [...groups.entries()].map(([date, grouped]) => ({ id: date, title: date, tasks: grouped }))
  }
  if (list === 'logbook') {
    const groups = new Map()
    for (const task of rows) {
      const key = (task.completedAt || task.canceledAt || task.updatedAt || '').slice(0, 10) || 'Earlier'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(task)
    }
    return [...groups.entries()].sort(([left], [right]) => right.localeCompare(left)).map(([date, grouped]) => ({ id: date, title: date, tasks: grouped }))
  }
  if (list.startsWith('project:')) {
    const groups = new Map()
    for (const task of rows) {
      const key = task.heading || 'Tasks'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(task)
    }
    return [...groups.entries()].map(([heading, grouped]) => ({ id: heading, title: heading, tasks: grouped }))
  }
  return [{ id: list, title: '', tasks: rows }]
}

const createState = (db, params = {}) => {
  const today = localDate()
  materializeRepeats(db, today)
  const requestedList = safeText(params.list, 120) || 'inbox'
  const list = requestedList.startsWith('area:') || requestedList.startsWith('project:') || ['inbox', 'today', 'upcoming', 'anytime', 'someday', 'deadlines', 'repeating', 'logbook'].includes(requestedList)
    ? requestedList
    : 'inbox'
  const query = safeText(params.query, 500).toLowerCase()
  const tag = safeText(params.tag, 80).toLowerCase()
  const filtered = db.tasks
    .filter(task => taskMatchesList(task, list, today))
    .filter(task => {
      const tags = inheritedTags(db, task)
      if (tag && !tags.includes(tag)) return false
      if (!query) return true
      return `${task.title}\n${task.notes}\n${tags.join(' ')}`.toLowerCase().includes(query)
    })
    .sort(sortTasks)

  const openTasks = db.tasks.filter(task => task.status === 'open')
  const navigation = [
    ['inbox', 'Inbox'], ['today', 'Today'], ['upcoming', 'Upcoming'], ['anytime', 'Anytime'],
    ['someday', 'Someday'], ['deadlines', 'Deadlines'], ['repeating', 'Repeating'], ['logbook', 'Logbook']
  ].map(([id, title]) => ({
    id,
    title,
    count: db.tasks.filter(task => taskMatchesList(task, id, today)).length
  }))
  const areas = db.areas.filter(area => !area.archived).map(area => ({
    ...area,
    count: openTasks.filter(task => task.areaId === area.id || db.projects.find(project => project.id === task.projectId)?.areaId === area.id).length
  }))
  const projects = db.projects.filter(project => project.status === 'open').map(project => {
    const tasks = db.tasks.filter(task => task.projectId === project.id)
    const completed = tasks.filter(task => task.status === 'completed').length
    return {
      ...project,
      openCount: tasks.filter(task => task.status === 'open').length,
      progress: tasks.length ? Math.round(completed / tasks.length * 100) : 0
    }
  })
  const tagCounts = new Map()
  for (const task of openTasks) {
    for (const item of inheritedTags(db, task)) tagCounts.set(item, (tagCounts.get(item) || 0) + 1)
  }
  const selectedTask = db.tasks.find(task => task.id === safeText(params.selectedTaskId, 100))

  return {
    schema: 'task-manager-v1',
    version: DATABASE_VERSION,
    title: 'Elephant Tasks',
    subtitle: 'Calm, focused task management',
    activeList: listMetadata(db, list),
    navigation,
    sections: makeSections(db, list, filtered, today),
    selectedTask: selectedTask ? taskView(db, selectedTask, today) : null,
    areas,
    projects,
    tags: [...tagCounts.entries()].map(([name, count]) => ({ name, count })).sort((left, right) => left.name.localeCompare(right.name)),
    repeatTemplates: db.repeatTemplates.filter(template => !template.paused),
    summary: {
      open: openTasks.length,
      completed: db.tasks.filter(task => task.status === 'completed').length,
      inbox: db.tasks.filter(task => taskMatchesList(task, 'inbox', today)).length,
      today: db.tasks.filter(task => taskMatchesList(task, 'today', today)).length
    },
    generatedAt: nowIso()
  }
}

self.elephantAddon = {
  async activate(api) {
    let database = normalizeDatabase(await api.storage.get(STORAGE_KEY))
    let writeQueue = Promise.resolve()

    const save = async () => {
      database.updatedAt = nowIso()
      writeQueue = writeQueue.then(() => api.storage.set(STORAGE_KEY, database))
      await writeQueue
    }

    const mutate = async (operation) => {
      const result = await operation(database)
      await save()
      return result
    }

    const capture = async (params = {}) => mutate(async db => {
      if (db.tasks.length >= MAX_TASKS) throw new Error(`Task limit reached (${MAX_TASKS})`)
      const parsed = parseQuickCapture(params.title || params.text || '', params)
      if (!parsed.title) throw new Error('Task title is required')
      const task = normalizeTask({ ...parsed, id: createId('task'), createdAt: nowIso(), updatedAt: nowIso() })
      db.tasks.push(task)
      return { id: task.id, title: task.title, openView: VIEW_ID }
    })

    const commandDispose = api.commands.register({
      id: `${ADDON_ID}.capture`,
      title: 'Capture task',
      description: 'Capture a task into Elephant Tasks. Supports !today, !tomorrow, !evening, !someday, #tags, start:YYYY-MM-DD and due:YYYY-MM-DD.',
      async run(params = {}) {
        return capture(params)
      }
    })

    const viewDispose = api.views.register({
      id: VIEW_ID,
      title: 'Tasks',
      description: 'Inbox, Today, Upcoming, Anytime, Someday, Areas, Projects, repeats and Logbook.',
      icon: 'list-todo',
      kind: 'task-manager-v1',
      order: 10,
      async getState(params = {}) {
        const generated = materializeRepeats(database)
        if (generated) await save()
        return createState(database, params)
      },
      async dispatch(action, params = {}) {
        const selectedTaskId = safeText(params.selectedTaskId || params.id, 100)
        await mutate(async db => {
          const task = selectedTaskId ? db.tasks.find(item => item.id === selectedTaskId) : null
          if (action === 'createTask') {
            if (db.tasks.length >= MAX_TASKS) throw new Error(`Task limit reached (${MAX_TASKS})`)
            const parsed = parseQuickCapture(params.title || '', params)
            if (!parsed.title) throw new Error('Task title is required')
            db.tasks.push(normalizeTask({ ...parsed, id: createId('task'), createdAt: nowIso(), updatedAt: nowIso() }))
            return
          }
          if (action === 'updateTask') {
            if (!task) throw new Error('Task not found')
            task.title = safeText(params.title, 500) || task.title
            task.notes = String(params.notes || '').slice(0, 20000)
            task.bucket = ['inbox', 'anytime', 'someday'].includes(params.bucket) ? params.bucket : task.bucket
            task.startDate = validDate(params.startDate)
            task.deadline = validDate(params.deadline)
            task.today = params.today === true
            task.evening = params.evening === true && task.today
            task.areaId = safeText(params.areaId, 100)
            task.projectId = safeText(params.projectId, 100)
            task.heading = safeText(params.heading, 160)
            task.tags = unique(params.tags)
            if (Array.isArray(params.checklist)) task.checklist = normalizeChecklist(params.checklist)
            task.updatedAt = nowIso()
            createOrUpdateTemplate(db, task, params.recurrence)
            return
          }
          if (action === 'completeTask') {
            if (!task) throw new Error('Task not found')
            completeTask(db, task)
            return
          }
          if (action === 'reopenTask') {
            if (!task) throw new Error('Task not found')
            task.status = 'open'
            task.completedAt = ''
            task.canceledAt = ''
            task.updatedAt = nowIso()
            return
          }
          if (action === 'cancelTask') {
            if (!task) throw new Error('Task not found')
            task.status = 'canceled'
            task.canceledAt = nowIso()
            task.today = false
            task.updatedAt = task.canceledAt
            return
          }
          if (action === 'deleteTask') {
            if (!task) throw new Error('Task not found')
            db.tasks = db.tasks.filter(item => item.id !== task.id)
            return
          }
          if (action === 'toggleToday') {
            if (!task) throw new Error('Task not found')
            task.today = !task.today
            if (task.today && task.bucket === 'inbox') task.bucket = 'anytime'
            if (!task.today) task.evening = false
            task.updatedAt = nowIso()
            return
          }
          if (action === 'toggleChecklistItem') {
            if (!task) throw new Error('Task not found')
            const item = task.checklist.find(candidate => candidate.id === safeText(params.itemId, 100))
            if (!item) throw new Error('Checklist item not found')
            item.completed = !item.completed
            task.updatedAt = nowIso()
            return
          }
          if (action === 'createArea') {
            if (db.areas.length >= MAX_AREAS) throw new Error(`Area limit reached (${MAX_AREAS})`)
            const title = safeText(params.title, 100)
            if (!title) throw new Error('Area title is required')
            db.areas.push(normalizeArea({ id: createId('area'), title, tags: params.tags, color: params.color }))
            return
          }
          if (action === 'updateArea') {
            const area = db.areas.find(item => item.id === safeText(params.id, 100))
            if (!area) throw new Error('Area not found')
            area.title = safeText(params.title, 100) || area.title
            area.notes = String(params.notes || area.notes).slice(0, 10000)
            area.tags = unique(params.tags || area.tags)
            area.color = safeText(params.color, 30) || area.color
            area.updatedAt = nowIso()
            return
          }
          if (action === 'createProject') {
            if (db.projects.length >= MAX_PROJECTS) throw new Error(`Project limit reached (${MAX_PROJECTS})`)
            const title = safeText(params.title, 160)
            if (!title) throw new Error('Project title is required')
            db.projects.push(normalizeProject({ id: createId('project'), title, areaId: params.areaId, tags: params.tags }))
            return
          }
          if (action === 'updateProject') {
            const project = db.projects.find(item => item.id === safeText(params.id, 100))
            if (!project) throw new Error('Project not found')
            project.title = safeText(params.title, 160) || project.title
            project.notes = String(params.notes || project.notes).slice(0, 20000)
            project.areaId = safeText(params.areaId, 100)
            project.tags = unique(params.tags || project.tags)
            project.startDate = validDate(params.startDate)
            project.deadline = validDate(params.deadline)
            project.headings = unique(params.headings || project.headings).map(value => safeText(value, 160))
            project.updatedAt = nowIso()
            return
          }
          if (action === 'completeProject') {
            const project = db.projects.find(item => item.id === safeText(params.id, 100))
            if (!project) throw new Error('Project not found')
            project.status = 'completed'
            project.completedAt = nowIso()
            project.updatedAt = project.completedAt
            if (params.completeOpenTasks === true) {
              for (const item of db.tasks.filter(candidate => candidate.projectId === project.id && candidate.status === 'open')) completeTask(db, item)
            }
            return
          }
          if (action === 'pauseRepeat' || action === 'resumeRepeat') {
            const template = db.repeatTemplates.find(item => item.id === safeText(params.id, 100))
            if (!template) throw new Error('Repeat template not found')
            template.paused = action === 'pauseRepeat'
            template.updatedAt = nowIso()
            return
          }
          throw new Error(`Unsupported task action: ${action}`)
        })
        return {
          ok: true,
          state: createState(database, {
            list: params.list || 'inbox',
            query: params.query || '',
            tag: params.tag || '',
            selectedTaskId: action === 'deleteTask' ? '' : selectedTaskId
          })
        }
      }
    })

    return () => {
      commandDispose()
      viewDispose()
    }
  }
}
