const ADDON_ID = 'com.elephantnote.elephant-tasks'
const VIEW_ID = `${ADDON_ID}.workspace`
const STORAGE_KEY = 'database'
const DATABASE_VERSION = 1
const LIMITS = Object.freeze({ tasks: 10000, areas: 200, projects: 1000, futureOccurrences: 12 })

const pad = value => String(value).padStart(2, '0')
const todayString = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const nowIso = () => new Date().toISOString()
const text = (value, max = 500) => String(value ?? '').trim().slice(0, max)
const id = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
const dateValue = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : ''
const unique = (values, max = 80) => [...new Set((values || []).map(value => text(value, max).toLowerCase()).filter(Boolean))]
const compareDate = (left, right) => String(left || '').localeCompare(String(right || ''))
const parsedDate = value => {
  const normalized = dateValue(value)
  if (!normalized) return null
  const result = new Date(`${normalized}T12:00:00`)
  return Number.isNaN(result.getTime()) ? null : result
}
const shiftDays = (value, amount) => {
  const result = parsedDate(value) || new Date()
  result.setDate(result.getDate() + Number(amount || 0))
  return todayString(result)
}
const shiftMonths = (value, amount) => {
  const result = parsedDate(value) || new Date()
  const day = result.getDate()
  result.setDate(1)
  result.setMonth(result.getMonth() + Number(amount || 0))
  result.setDate(Math.min(day, new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()))
  return todayString(result)
}
const shiftYears = (value, amount) => {
  const result = parsedDate(value) || new Date()
  const month = result.getMonth()
  result.setFullYear(result.getFullYear() + Number(amount || 0))
  if (result.getMonth() !== month) result.setDate(0)
  return todayString(result)
}
const advanceDate = (value, frequency, interval = 1) => {
  const step = Math.max(1, Math.min(365, Number(interval) || 1))
  if (frequency === 'daily') return shiftDays(value, step)
  if (frequency === 'monthly') return shiftMonths(value, step)
  if (frequency === 'yearly') return shiftYears(value, step)
  return shiftDays(value, step * 7)
}

const blankDatabase = () => ({
  version: DATABASE_VERSION,
  tasks: [],
  areas: [],
  projects: [],
  repeatTemplates: [],
  createdAt: nowIso(),
  updatedAt: nowIso()
})

const normalizeChecklist = value => Array.isArray(value)
  ? value.slice(0, 200).map(item => ({
    id: text(item?.id, 100) || id('check'),
    title: text(item?.title, 500),
    completed: item?.completed === true
  })).filter(item => item.title)
  : []

const recurrenceValue = value => {
  if (!value || typeof value !== 'object') return null
  return {
    mode: value.mode === 'after-completion' ? 'after-completion' : 'fixed',
    frequency: ['daily', 'weekly', 'monthly', 'yearly'].includes(value.frequency) ? value.frequency : 'weekly',
    interval: Math.max(1, Math.min(365, Number(value.interval) || 1))
  }
}

const normalizeTask = (value = {}) => ({
  id: text(value.id, 100) || id('task'),
  title: text(value.title, 500) || 'Untitled task',
  notes: String(value.notes || '').slice(0, 20000),
  status: ['open', 'completed', 'canceled'].includes(value.status) ? value.status : 'open',
  bucket: ['inbox', 'anytime', 'someday'].includes(value.bucket) ? value.bucket : 'inbox',
  today: value.today === true,
  evening: value.evening === true,
  startDate: dateValue(value.startDate),
  deadline: dateValue(value.deadline),
  areaId: text(value.areaId, 100),
  projectId: text(value.projectId, 100),
  heading: text(value.heading, 160),
  tags: unique(value.tags),
  checklist: normalizeChecklist(value.checklist),
  order: Number.isFinite(value.order) ? value.order : Date.now(),
  recurrenceTemplateId: text(value.recurrenceTemplateId, 100),
  occurrenceDate: dateValue(value.occurrenceDate),
  createdAt: text(value.createdAt, 60) || nowIso(),
  updatedAt: text(value.updatedAt, 60) || nowIso(),
  completedAt: text(value.completedAt, 60),
  canceledAt: text(value.canceledAt, 60)
})

const normalizeArea = (value = {}) => ({
  id: text(value.id, 100) || id('area'),
  title: text(value.title, 100) || 'Untitled area',
  notes: String(value.notes || '').slice(0, 10000),
  tags: unique(value.tags),
  color: text(value.color, 30),
  archived: value.archived === true,
  createdAt: text(value.createdAt, 60) || nowIso(),
  updatedAt: text(value.updatedAt, 60) || nowIso()
})

const normalizeProject = (value = {}) => ({
  id: text(value.id, 100) || id('project'),
  title: text(value.title, 160) || 'Untitled project',
  notes: String(value.notes || '').slice(0, 20000),
  areaId: text(value.areaId, 100),
  status: ['open', 'completed', 'canceled'].includes(value.status) ? value.status : 'open',
  tags: unique(value.tags),
  headings: unique(value.headings, 160),
  startDate: dateValue(value.startDate),
  deadline: dateValue(value.deadline),
  createdAt: text(value.createdAt, 60) || nowIso(),
  updatedAt: text(value.updatedAt, 60) || nowIso(),
  completedAt: text(value.completedAt, 60)
})

const normalizeTemplate = (value = {}) => ({
  id: text(value.id, 100) || id('repeat'),
  sourceTaskId: text(value.sourceTaskId, 100),
  title: text(value.title, 500) || 'Untitled repeating task',
  notes: String(value.notes || '').slice(0, 20000),
  bucket: ['inbox', 'anytime', 'someday'].includes(value.bucket) ? value.bucket : 'anytime',
  today: value.today === true,
  evening: value.evening === true,
  areaId: text(value.areaId, 100),
  projectId: text(value.projectId, 100),
  heading: text(value.heading, 160),
  tags: unique(value.tags),
  checklist: normalizeChecklist(value.checklist).map(item => ({ ...item, completed: false })),
  mode: value.mode === 'after-completion' ? 'after-completion' : 'fixed',
  frequency: ['daily', 'weekly', 'monthly', 'yearly'].includes(value.frequency) ? value.frequency : 'weekly',
  interval: Math.max(1, Math.min(365, Number(value.interval) || 1)),
  nextDate: dateValue(value.nextDate),
  deadlineOffsetDays: Number.isFinite(value.deadlineOffsetDays) ? value.deadlineOffsetDays : null,
  paused: value.paused === true,
  createdAt: text(value.createdAt, 60) || nowIso(),
  updatedAt: text(value.updatedAt, 60) || nowIso()
})

const normalizeDatabase = value => {
  if (value == null) return blankDatabase()
  if (!value || typeof value !== 'object') throw new Error('Elephant Tasks database must be an object')
  if (value.version !== DATABASE_VERSION) {
    throw new Error(`Unsupported Elephant Tasks database version ${value.version}; no data was modified`)
  }
  return {
    version: DATABASE_VERSION,
    tasks: Array.isArray(value.tasks) ? value.tasks.slice(0, LIMITS.tasks).map(normalizeTask) : [],
    areas: Array.isArray(value.areas) ? value.areas.slice(0, LIMITS.areas).map(normalizeArea) : [],
    projects: Array.isArray(value.projects) ? value.projects.slice(0, LIMITS.projects).map(normalizeProject) : [],
    repeatTemplates: Array.isArray(value.repeatTemplates) ? value.repeatTemplates.slice(0, LIMITS.tasks).map(normalizeTemplate) : [],
    createdAt: text(value.createdAt, 60) || nowIso(),
    updatedAt: text(value.updatedAt, 60) || nowIso()
  }
}

const parseCapture = (raw, params = {}) => {
  const result = {
    title: '',
    bucket: ['inbox', 'anytime', 'someday'].includes(params.bucket) ? params.bucket : 'inbox',
    today: params.today === true,
    evening: false,
    startDate: dateValue(params.startDate),
    deadline: dateValue(params.deadline),
    tags: unique(params.tags)
  }
  const kept = []
  const tags = []
  for (const token of text(raw, 500).split(/\s+/)) {
    if (/^#[\p{L}\p{N}_/-]+$/u.test(token)) tags.push(token.slice(1))
    else if (token === '!today') Object.assign(result, { today: true, bucket: 'anytime' })
    else if (token === '!evening') Object.assign(result, { today: true, evening: true, bucket: 'anytime' })
    else if (token === '!tomorrow') Object.assign(result, { startDate: shiftDays(todayString(), 1), bucket: 'anytime' })
    else if (token === '!someday') Object.assign(result, { bucket: 'someday', today: false, evening: false })
    else if (/^start:\d{4}-\d{2}-\d{2}$/.test(token)) Object.assign(result, { startDate: token.slice(6), bucket: 'anytime' })
    else if (/^due:\d{4}-\d{2}-\d{2}$/.test(token)) result.deadline = token.slice(4)
    else kept.push(token)
  }
  result.title = kept.join(' ').trim() || text(raw, 500)
  result.tags = unique([...result.tags, ...tags])
  return result
}

const projectFor = (db, task) => db.projects.find(project => project.id === task.projectId)
const areaFor = (db, task) => {
  const project = projectFor(db, task)
  return db.areas.find(area => area.id === task.areaId || area.id === project?.areaId)
}
const taskAreaId = (db, task) => task.areaId || projectFor(db, task)?.areaId || ''
const inheritedTags = (db, task) => {
  const project = projectFor(db, task)
  const directArea = db.areas.find(area => area.id === task.areaId)
  const projectArea = db.areas.find(area => area.id === project?.areaId)
  return unique([...(task.tags || []), ...(project?.tags || []), ...(directArea?.tags || []), ...(projectArea?.tags || [])])
}

const makeOccurrence = (template, occurrenceDate) => normalizeTask({
  id: id('task'),
  title: template.title,
  notes: template.notes,
  bucket: template.bucket,
  today: template.today,
  evening: template.evening,
  startDate: occurrenceDate,
  deadline: Number.isFinite(template.deadlineOffsetDays) ? shiftDays(occurrenceDate, template.deadlineOffsetDays) : '',
  areaId: template.areaId,
  projectId: template.projectId,
  heading: template.heading,
  tags: template.tags,
  checklist: template.checklist.map(item => ({ ...item, id: id('check'), completed: false })),
  recurrenceTemplateId: template.id,
  occurrenceDate,
  createdAt: nowIso(),
  updatedAt: nowIso()
})

const materializeFixedRepeats = (db, referenceDate = todayString()) => {
  const horizon = shiftDays(referenceDate, 90)
  let generated = 0
  for (const template of db.repeatTemplates) {
    if (template.paused || template.mode !== 'fixed' || !template.nextDate) continue
    let generatedForTemplate = 0
    while (
      template.nextDate &&
      compareDate(template.nextDate, horizon) <= 0 &&
      generatedForTemplate < LIMITS.futureOccurrences &&
      db.tasks.length < LIMITS.tasks
    ) {
      const exists = db.tasks.some(task => task.recurrenceTemplateId === template.id && task.occurrenceDate === template.nextDate)
      if (!exists) {
        db.tasks.push(makeOccurrence(template, template.nextDate))
        generated += 1
        generatedForTemplate += 1
      }
      template.nextDate = advanceDate(template.nextDate, template.frequency, template.interval)
      template.updatedAt = nowIso()
    }
  }
  return generated
}

const syncRepeatTemplate = (db, task, recurrence) => {
  const normalized = recurrenceValue(recurrence)
  if (!normalized) {
    const previous = db.repeatTemplates.find(template => template.id === task.recurrenceTemplateId)
    if (previous) previous.paused = true
    task.recurrenceTemplateId = ''
    return
  }
  let template = db.repeatTemplates.find(item => item.id === task.recurrenceTemplateId)
  if (!template) {
    template = normalizeTemplate({ id: id('repeat'), sourceTaskId: task.id })
    db.repeatTemplates.push(template)
    task.recurrenceTemplateId = template.id
  }
  const baseDate = task.startDate || todayString()
  const start = parsedDate(baseDate)
  const deadline = parsedDate(task.deadline)
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
    deadlineOffsetDays: start && deadline ? Math.round((deadline.getTime() - start.getTime()) / 86400000) : null,
    nextDate: normalized.mode === 'fixed' ? advanceDate(baseDate, normalized.frequency, normalized.interval) : '',
    paused: false,
    updatedAt: nowIso()
  })
}

const finishTask = (db, task) => {
  if (!task || task.status !== 'open') return
  task.status = 'completed'
  task.completedAt = nowIso()
  task.updatedAt = task.completedAt
  task.today = false
  task.evening = false
  const template = db.repeatTemplates.find(item => item.id === task.recurrenceTemplateId)
  if (!template || template.paused || template.mode !== 'after-completion' || db.tasks.length >= LIMITS.tasks) return
  const hasOpenOccurrence = db.tasks.some(candidate => candidate.id !== task.id && candidate.recurrenceTemplateId === template.id && candidate.status === 'open')
  if (!hasOpenOccurrence) db.tasks.push(makeOccurrence(template, advanceDate(todayString(), template.frequency, template.interval)))
}

const validList = value => {
  const list = text(value, 120) || 'inbox'
  if (list.startsWith('area:') || list.startsWith('project:')) return list
  return ['inbox', 'today', 'upcoming', 'anytime', 'someday', 'deadlines', 'repeating', 'logbook'].includes(list) ? list : 'inbox'
}

const taskMatchesList = (db, task, list, currentDate) => {
  if (list === 'logbook') return task.status === 'completed' || task.status === 'canceled'
  if (task.status !== 'open') return false
  if (list === 'inbox') return task.bucket === 'inbox'
  if (list === 'today') return task.today || Boolean(task.startDate && compareDate(task.startDate, currentDate) <= 0) || Boolean(task.deadline && compareDate(task.deadline, currentDate) <= 0)
  if (list === 'upcoming') return Boolean(task.startDate && compareDate(task.startDate, currentDate) > 0)
  if (list === 'anytime') return task.bucket === 'anytime' && (!task.startDate || compareDate(task.startDate, currentDate) <= 0)
  if (list === 'someday') return task.bucket === 'someday'
  if (list === 'deadlines') return Boolean(task.deadline)
  if (list === 'repeating') return Boolean(task.recurrenceTemplateId)
  if (list.startsWith('area:')) return taskAreaId(db, task) === list.slice(5)
  if (list.startsWith('project:')) return task.projectId === list.slice(8)
  return false
}

const listInfo = (db, list) => {
  const builtins = {
    inbox: ['Inbox', 'Capture first. Clarify and organize when you are ready.', 'Capture'],
    today: ['Today', 'A deliberate, realistic list for the day.', 'Focus'],
    upcoming: ['Upcoming', 'Tasks stay out of sight until their start date.', 'Plan'],
    anytime: ['Anytime', 'Available work you can start now.', 'Available'],
    someday: ['Someday', 'Ideas and commitments intentionally deferred.', 'Later'],
    deadlines: ['Deadlines', 'Hard finish dates, kept separate from start dates.', 'Time-sensitive'],
    repeating: ['Repeating', 'Generated occurrences from active repeat templates.', 'Routines'],
    logbook: ['Logbook', 'Completed and canceled work remains searchable.', 'History']
  }
  if (builtins[list]) return { id: list, title: builtins[list][0], description: builtins[list][1], eyebrow: builtins[list][2] }
  if (list.startsWith('area:')) {
    const area = db.areas.find(item => item.id === list.slice(5))
    return { id: list, title: area?.title || 'Area', description: area?.notes || 'An ongoing area of responsibility.', eyebrow: 'Area' }
  }
  const project = db.projects.find(item => item.id === list.slice(8))
  return { id: list, title: project?.title || 'Project', description: project?.notes || 'A finite outcome with multiple steps.', eyebrow: 'Project' }
}

const taskRow = (db, task, currentDate) => {
  const project = projectFor(db, task)
  const area = areaFor(db, task)
  const template = db.repeatTemplates.find(item => item.id === task.recurrenceTemplateId)
  return {
    ...task,
    tags: inheritedTags(db, task),
    projectTitle: project?.title || '',
    areaTitle: area?.title || '',
    deadlineOverdue: Boolean(task.deadline && compareDate(task.deadline, currentDate) < 0 && task.status === 'open'),
    repeating: Boolean(template),
    recurrence: template || null,
    checklistCompleted: task.checklist.filter(item => item.completed).length,
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

const sectionsFor = (db, list, tasks, currentDate) => {
  const rows = tasks.map(task => taskRow(db, task, currentDate))
  if (list === 'today') {
    const overdue = rows.filter(task => !task.evening && (task.deadlineOverdue || Boolean(task.startDate && compareDate(task.startDate, currentDate) < 0)))
    return [
      { id: 'overdue', title: overdue.length ? 'Overdue' : '', tasks: overdue },
      { id: 'today', title: 'Today', tasks: rows.filter(task => !task.evening && !overdue.includes(task)) },
      { id: 'evening', title: 'Evening', tasks: rows.filter(task => task.evening) }
    ].filter(section => section.tasks.length)
  }
  if (list === 'upcoming') {
    const groups = new Map()
    for (const task of rows) {
      const key = task.startDate || 'Later'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(task)
    }
    return [...groups.entries()].sort(([left], [right]) => compareDate(left, right)).map(([key, grouped]) => ({
      id: key,
      title: key === 'Later' ? key : new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(parsedDate(key)),
      tasks: grouped
    }))
  }
  if (list === 'deadlines') {
    const groups = new Map()
    for (const task of rows) {
      const key = compareDate(task.deadline, currentDate) < 0 ? 'Overdue' : task.deadline
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(task)
    }
    return [...groups.entries()].map(([key, grouped]) => ({ id: key, title: key, tasks: grouped }))
  }
  if (list === 'logbook') {
    const groups = new Map()
    for (const task of rows) {
      const key = (task.completedAt || task.canceledAt || task.updatedAt || '').slice(0, 10) || 'Earlier'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(task)
    }
    return [...groups.entries()].sort(([left], [right]) => right.localeCompare(left)).map(([key, grouped]) => ({ id: key, title: key, tasks: grouped }))
  }
  if (list.startsWith('project:')) {
    const groups = new Map()
    for (const task of rows) {
      const key = task.heading || 'Tasks'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(task)
    }
    return [...groups.entries()].map(([key, grouped]) => ({ id: key, title: key, tasks: grouped }))
  }
  return [{ id: list, title: '', tasks: rows }]
}

const stateFor = (db, params = {}) => {
  const currentDate = todayString()
  const list = validList(params.list)
  const query = text(params.query, 500).toLowerCase()
  const tag = text(params.tag, 80).toLowerCase()
  const tasks = db.tasks
    .filter(task => taskMatchesList(db, task, list, currentDate))
    .filter(task => {
      const tags = inheritedTags(db, task)
      if (tag && !tags.includes(tag)) return false
      return !query || `${task.title}\n${task.notes}\n${tags.join(' ')}`.toLowerCase().includes(query)
    })
    .sort(sortTasks)
  const openTasks = db.tasks.filter(task => task.status === 'open')
  const navigation = [
    ['inbox', 'Inbox'], ['today', 'Today'], ['upcoming', 'Upcoming'], ['anytime', 'Anytime'],
    ['someday', 'Someday'], ['deadlines', 'Deadlines'], ['repeating', 'Repeating'], ['logbook', 'Logbook']
  ].map(([itemId, title]) => ({
    id: itemId,
    title,
    count: db.tasks.filter(task => taskMatchesList(db, task, itemId, currentDate)).length
  }))
  const areas = db.areas.filter(area => !area.archived).map(area => ({
    ...area,
    count: openTasks.filter(task => taskAreaId(db, task) === area.id).length
  }))
  const projects = db.projects.filter(project => project.status === 'open').map(project => {
    const projectTasks = db.tasks.filter(task => task.projectId === project.id)
    const completed = projectTasks.filter(task => task.status === 'completed').length
    return {
      ...project,
      openCount: projectTasks.filter(task => task.status === 'open').length,
      progress: projectTasks.length ? Math.round(completed / projectTasks.length * 100) : 0
    }
  })
  const tagCounts = new Map()
  for (const task of openTasks) for (const item of inheritedTags(db, task)) tagCounts.set(item, (tagCounts.get(item) || 0) + 1)
  const selected = db.tasks.find(task => task.id === text(params.selectedTaskId, 100))
  return {
    schema: 'task-manager-v1',
    version: DATABASE_VERSION,
    title: 'Elephant Tasks',
    subtitle: 'Calm, focused task management',
    activeList: listInfo(db, list),
    navigation,
    sections: sectionsFor(db, list, tasks, currentDate),
    selectedTask: selected ? taskRow(db, selected, currentDate) : null,
    areas,
    projects,
    tags: [...tagCounts.entries()].map(([name, count]) => ({ name, count })).sort((left, right) => left.name.localeCompare(right.name)),
    repeatTemplates: db.repeatTemplates.filter(template => !template.paused),
    summary: {
      open: openTasks.length,
      completed: db.tasks.filter(task => task.status === 'completed').length,
      inbox: db.tasks.filter(task => taskMatchesList(db, task, 'inbox', currentDate)).length,
      today: db.tasks.filter(task => taskMatchesList(db, task, 'today', currentDate)).length
    },
    generatedAt: nowIso()
  }
}

self.elephantAddon = {
  async activate(api) {
    let database = normalizeDatabase(await api.storage.get(STORAGE_KEY))
    let writeQueue = Promise.resolve()
    let lastViewParams = { list: 'inbox', query: '', tag: '', selectedTaskId: '' }

    const save = async () => {
      database.updatedAt = nowIso()
      writeQueue = writeQueue.then(() => api.storage.set(STORAGE_KEY, database))
      await writeQueue
    }
    const mutate = async operation => {
      await operation(database)
      await save()
    }
    const capture = async (params = {}) => {
      if (database.tasks.length >= LIMITS.tasks) throw new Error(`Task limit reached (${LIMITS.tasks})`)
      const parsed = parseCapture(params.title || params.text || '', params)
      if (!parsed.title) throw new Error('Task title is required')
      const task = normalizeTask({ ...parsed, id: id('task'), createdAt: nowIso(), updatedAt: nowIso() })
      await mutate(db => { db.tasks.push(task) })
      return { id: task.id, title: task.title, openView: VIEW_ID }
    }

    const commandDispose = api.commands.register({
      id: `${ADDON_ID}.capture`,
      title: 'Capture task',
      description: 'Supports !today, !tomorrow, !evening, !someday, #tags, start:YYYY-MM-DD and due:YYYY-MM-DD.',
      run: capture
    })

    const viewDispose = api.views.register({
      id: VIEW_ID,
      title: 'Tasks',
      description: 'Inbox, Today, Upcoming, Anytime, Someday, Areas, Projects, repeats and Logbook.',
      icon: 'list-todo',
      kind: 'task-manager-v1',
      order: 10,
      async getState(params = {}) {
        lastViewParams = { ...lastViewParams, ...params, list: validList(params.list || lastViewParams.list) }
        if (materializeFixedRepeats(database)) await save()
        return stateFor(database, lastViewParams)
      },
      async dispatch(action, params = {}) {
        const selectedTaskId = text(params.id || params.selectedTaskId, 100)
        await mutate(db => {
          const task = selectedTaskId ? db.tasks.find(item => item.id === selectedTaskId) : null
          if (action === 'createTask') {
            if (db.tasks.length >= LIMITS.tasks) throw new Error(`Task limit reached (${LIMITS.tasks})`)
            const parsed = parseCapture(params.title || '', params)
            if (!parsed.title) throw new Error('Task title is required')
            db.tasks.push(normalizeTask({ ...parsed, id: id('task'), createdAt: nowIso(), updatedAt: nowIso() }))
            return
          }
          if (action === 'updateTask') {
            if (!task) throw new Error('Task not found')
            task.title = text(params.title, 500) || task.title
            task.notes = String(params.notes || '').slice(0, 20000)
            task.bucket = ['inbox', 'anytime', 'someday'].includes(params.bucket) ? params.bucket : task.bucket
            task.startDate = dateValue(params.startDate)
            task.deadline = dateValue(params.deadline)
            task.today = params.today === true
            task.evening = params.evening === true && task.today
            task.areaId = text(params.areaId, 100)
            task.projectId = text(params.projectId, 100)
            task.heading = text(params.heading, 160)
            task.tags = unique(params.tags)
            if (Array.isArray(params.checklist)) task.checklist = normalizeChecklist(params.checklist)
            task.updatedAt = nowIso()
            syncRepeatTemplate(db, task, params.recurrence)
            return
          }
          if (action === 'completeTask') {
            if (!task) throw new Error('Task not found')
            finishTask(db, task)
            return
          }
          if (action === 'reopenTask') {
            if (!task) throw new Error('Task not found')
            Object.assign(task, { status: 'open', completedAt: '', canceledAt: '', updatedAt: nowIso() })
            return
          }
          if (action === 'cancelTask') {
            if (!task) throw new Error('Task not found')
            Object.assign(task, { status: 'canceled', canceledAt: nowIso(), today: false, evening: false, updatedAt: nowIso() })
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
            const item = task.checklist.find(candidate => candidate.id === text(params.itemId, 100))
            if (!item) throw new Error('Checklist item not found')
            item.completed = !item.completed
            task.updatedAt = nowIso()
            return
          }
          if (action === 'createArea') {
            if (db.areas.length >= LIMITS.areas) throw new Error(`Area limit reached (${LIMITS.areas})`)
            const title = text(params.title, 100)
            if (!title) throw new Error('Area title is required')
            db.areas.push(normalizeArea({ id: id('area'), title, tags: params.tags, color: params.color }))
            return
          }
          if (action === 'updateArea') {
            const area = db.areas.find(item => item.id === text(params.id, 100))
            if (!area) throw new Error('Area not found')
            area.title = text(params.title, 100) || area.title
            area.notes = String(params.notes || area.notes).slice(0, 10000)
            area.tags = unique(params.tags || area.tags)
            area.color = text(params.color, 30) || area.color
            area.updatedAt = nowIso()
            return
          }
          if (action === 'createProject') {
            if (db.projects.length >= LIMITS.projects) throw new Error(`Project limit reached (${LIMITS.projects})`)
            const title = text(params.title, 160)
            if (!title) throw new Error('Project title is required')
            db.projects.push(normalizeProject({ id: id('project'), title, areaId: params.areaId, tags: params.tags }))
            return
          }
          if (action === 'updateProject') {
            const project = db.projects.find(item => item.id === text(params.id, 100))
            if (!project) throw new Error('Project not found')
            project.title = text(params.title, 160) || project.title
            project.notes = String(params.notes || project.notes).slice(0, 20000)
            project.areaId = text(params.areaId, 100)
            project.tags = unique(params.tags || project.tags)
            project.startDate = dateValue(params.startDate)
            project.deadline = dateValue(params.deadline)
            project.headings = unique(params.headings || project.headings, 160)
            project.updatedAt = nowIso()
            return
          }
          if (action === 'completeProject') {
            const project = db.projects.find(item => item.id === text(params.id, 100))
            if (!project) throw new Error('Project not found')
            Object.assign(project, { status: 'completed', completedAt: nowIso(), updatedAt: nowIso() })
            if (params.completeOpenTasks === true) {
              for (const item of db.tasks.filter(candidate => candidate.projectId === project.id && candidate.status === 'open')) finishTask(db, item)
            }
            return
          }
          if (action === 'pauseRepeat' || action === 'resumeRepeat') {
            const template = db.repeatTemplates.find(item => item.id === text(params.id, 100))
            if (!template) throw new Error('Repeat template not found')
            template.paused = action === 'pauseRepeat'
            template.updatedAt = nowIso()
            return
          }
          throw new Error(`Unsupported task action: ${action}`)
        })
        lastViewParams = {
          ...lastViewParams,
          list: validList(params.list || lastViewParams.list),
          query: params.query ?? lastViewParams.query,
          tag: params.tag ?? lastViewParams.tag,
          selectedTaskId: action === 'deleteTask' ? '' : selectedTaskId || lastViewParams.selectedTaskId
        }
        if (materializeFixedRepeats(database)) await save()
        return { ok: true, state: stateFor(database, lastViewParams) }
      }
    })

    return () => {
      commandDispose()
      viewDispose()
    }
  }
}
