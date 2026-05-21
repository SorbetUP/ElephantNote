import { formatShortDate } from '../services/markdownMetaService'

export const getNoteCardTitle = (entry) => entry?.title?.trim() || 'Untitled'

export const getNoteCardTypeLabel = (entry) => entry?.type?.trim() || 'Note'

export const getNoteCardUpdatedLabel = (entry) => formatShortDate(entry?.updatedAt)

export const getNoteCardExcerpt = (entry) => entry?.excerpt?.trim() || 'No preview yet.'
