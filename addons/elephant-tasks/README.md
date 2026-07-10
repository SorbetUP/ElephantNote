# Elephant Tasks

A focused, local-first task manager for ElephantNote. It is inspired by the workflow principles of dedicated task managers, but its implementation and data format are original to ElephantNote.

## Lists

- **Inbox** — frictionless capture before clarification.
- **Today** — explicit Today items, tasks whose start date has arrived, and due or overdue deadlines. Evening tasks are separated.
- **Upcoming** — future start dates and generated repeat occurrences.
- **Anytime** — actionable tasks whose start date has arrived.
- **Someday** — ideas and commitments intentionally deferred.
- **Deadlines** — hard finish dates, independent from start dates.
- **Repeating** — active generated routines.
- **Logbook** — completed and canceled tasks.

## Structure

- **Areas** are ongoing responsibilities and do not have a completion state.
- **Projects** represent finite outcomes and may contain headings.
- Project and Area tags are inherited by their tasks while task-specific tags remain available.
- Tasks support notes, checklist data, start dates, deadlines, Today, Evening, Areas, Projects, headings and tags.

## Repeating tasks

Two repeat modes are stored as templates:

- fixed schedule: daily, weekly, monthly or yearly;
- after completion: the next occurrence is calculated after the current task is completed.

Generated occurrences are separate tasks. Completing an occurrence never rewrites its history.

## Quick capture syntax

The `Capture task` command and the view's quick entry support conservative tokens:

```text
Prepare release !today #work due:2026-07-15
Call the dentist !tomorrow #phone
Read the paper !someday #research
```

Supported tokens:

- `!today`
- `!evening`
- `!tomorrow`
- `!someday`
- `#tag`
- `start:YYYY-MM-DD`
- `due:YYYY-MM-DD`

## Data and privacy

The addon does not use network access and does not modify Markdown notes. Its database is stored in the active vault under ElephantNote's private addon directory:

```text
.elephantnote/addons/data/com.elephantnote.elephant-tasks/storage.json
```

Disabling the addon stops its Worker and removes the view from the sidebar without deleting task data. Uninstalling the package also leaves its private data available for a later reinstall.

## Current boundaries

- No operating-system notifications are claimed.
- Calendar events are not converted into tasks.
- Apple Calendar display and reminder scheduling require separate native capabilities.
- The first declarative workspace renderer is `task-manager-v1`; addons cannot inject arbitrary HTML or access Vue, Pinia, the DOM or Tauri APIs.
