# Phase 0 API map

## Entry points (Express)
- /health (GET) -> {"status":"ok"}. `server/index.ts:221-223`
- /changes (GET/POST) -> sync pull/push. `server/index.ts:151-154`, `server/routerExpress/changes.ts:33-94`
- /api/auth (Express auth router). `server/index.ts:132-133`
- /api/trpc (tRPC over HTTP). `server/index.ts:135-146`
- /api (OpenAPI adapter for tRPC). `server/index.ts:210-218`
- /api/openapi.json + /api-doc (OpenAPI JSON + Swagger UI). `server/index.ts:193-208`
- /api/file, /api/file/upload, /api/file/delete, /api/s3file (file endpoints). `server/index.ts:148-152`
- /api/file/by-sync-id/:syncId (download by sync_id). `server/routerExpress/file/file.ts:59-104`
- /api/rss (RSS). `server/index.ts:189-190`
- /v1 (OpenAI proxy router). `server/index.ts:189-191`
- / (mcp router). `server/index.ts:227`

## Local embedded API (Rust/Tauri)
- /health (GET) -> {"ok": true, "version": "local"}. `app/src-tauri/src/local_api/router.rs:28-33`, `app/src-tauri/src/local_api/handlers_auth.rs:27-29`
- /api/notes (GET/POST), /api/notes/:id (GET/PUT/DELETE). `app/src-tauri/src/local_api/router.rs:35-41`
- /api/settings (GET/PUT). `app/src-tauri/src/local_api/router.rs:42-45`
- /sync/settings (GET/PUT), /sync/now (POST). `app/src-tauri/src/local_api/router.rs:47-50`
- /api/file/upload, /api/file/:id (GET/DELETE). `app/src-tauri/src/local_api/router.rs:51-57`
- /api/trpc (GET/POST) + /api/trpc/:path (GET/POST). `app/src-tauri/src/local_api/router.rs:63-66`

## Direct REST calls from the UI
- /api/auth/profile (GET) used for token refresh. `app/src/components/Auth/auth-client.ts:64-75`
- /api/auth/login (POST) used for credentials login. `app/src/components/Auth/auth-client.ts:93-145`
- /api/auth/verify-2fa (POST) used for 2FA verification. `app/src/components/Auth/auth-client.ts:148-182`
- /api/auth/logout (POST) used for logout. `app/src/components/Auth/auth-client.ts:202-212`
- /api/file/upload (POST multipart) used by upload widgets. `app/src/components/Common/UploadFile/index.tsx:33-46`
- /api/file/upload (POST) used by the editor upload adapter. `app/src/components/Common/Editor/hooks/useEditor.ts:237-255`
- /api/file/upload-by-url (POST) used by editor link uploads. `app/src/components/Common/Editor/hooks/useEditor.ts:255-266`
- /api/file/delete (POST) used by attachment delete. `app/src/components/Common/AttachmentRender/icons.tsx:20-25`
- /api/rss/:accountId/atom (GET) used to open RSS feed. `app/src/components/BlinkoCard/cardHeader.tsx:148-150`
- /api/v1/note/public-list (POST) used for remote hub sites. `app/src/store/hubStore.tsx:28-30`
- /api/v1/comment/list|create|delete (POST) used for remote comments. `app/src/components/BlinkoCard/commentButton.tsx:168-224`

## tRPC procedures used by the UI
The UI uses `api.<router>.<procedure>.(query|mutate)` calls via the tRPC client. Full list:

### ai
| procedure | type | ui usage |
| --- | --- | --- |
| autoEmoji | mutate | `app/src/store/aiStore.tsx:373` |
| autoTag | mutate | `app/src/store/aiStore.tsx:339` |
| createModel | mutate | `app/src/store/aiSettingStore.tsx:85` |
| createModelsFromProvider | mutate | `app/src/store/aiSettingStore.tsx:109` |
| createProvider | mutate | `app/src/store/aiSettingStore.tsx:63` |
| deleteModel | mutate | `app/src/store/aiSettingStore.tsx:101` |
| deleteProvider | mutate | `app/src/store/aiSettingStore.tsx:77` |
| embeddingDelete | mutate | `app/src/components/BlinkoMultiSelectPop/index.tsx:67` |
| getAllModels | query | `app/src/store/aiSettingStore.tsx:52` |
| getAllProviders | query | `app/src/store/aiSettingStore.tsx:44` |
| rebuildEmbeddingProgress | query | `app/src/components/BlinkoSettings/AiSetting/EmbeddingSettingsSection.tsx:34` |
| rebuildEmbeddingStart | mutate | `app/src/components/BlinkoSettings/AiSetting/EmbeddingSettingsSection.tsx:90` |
| rebuildEmbeddingStop | mutate | `app/src/components/Common/RebuildEmbeddingProgress/index.tsx:117` |
| summarizeConversationTitle | mutate | `app/src/store/aiStore.tsx:196` |
| testConnect | mutate | `app/src/components/BlinkoSettings/AiSetting/ModelDialogContent.tsx:163` |
| updateModel | mutate | `app/src/store/aiSettingStore.tsx:93` |
| updateProvider | mutate | `app/src/store/aiSettingStore.tsx:70` |

### aiTask
| procedure | type | ui usage |
| --- | --- | --- |
| delete | mutate | `app/src/components/BlinkoSettings/TaskSetting.tsx:141` |
| list | query | `app/src/components/BlinkoSettings/TaskSetting.tsx:122` |
| runNow | mutate | `app/src/components/BlinkoSettings/TaskSetting.tsx:146` |
| toggle | mutate | `app/src/components/BlinkoSettings/TaskSetting.tsx:136` |

### analytics
| procedure | type | ui usage |
| --- | --- | --- |
| dailyNoteCount | mutate | `app/src/store/analyticsStore.ts:35` |
| monthlyStats | mutate | `app/src/store/analyticsStore.ts:42` |

### attachments
| procedure | type | ui usage |
| --- | --- | --- |
| createFolder | mutate | `app/src/store/resourceStore.tsx:195` |
| delete | mutate | `app/src/components/BlinkoResource/ResourceContextMenu.tsx:121` |
| deleteMany | mutate | `app/src/components/BlinkoResource/ResourceMultiSelectpop.tsx:29` |
| list | query | `app/src/store/blinkoStore.tsx:428` |
| move | mutate | `app/src/components/BlinkoResource/ResourceContextMenu.tsx:157` |
| rename | mutate | `app/src/components/BlinkoResource/ResourceContextMenu.tsx:84` |

### comments
| procedure | type | ui usage |
| --- | --- | --- |
| create | mutate | `app/src/components/BlinkoCard/commentButton.tsx:211` |
| delete | mutate | `app/src/components/BlinkoCard/commentButton.tsx:226` |
| list | query | `app/src/components/BlinkoCard/commentButton.tsx:179` |

### config
| procedure | type | ui usage |
| --- | --- | --- |
| list | query | `app/src/store/blinkoStore.tsx:452` |
| update | mutate | `app/src/components/BlinkoSettings/AiSetting/AiPostProcessingSection.tsx:43` |

### conversation
| procedure | type | ui usage |
| --- | --- | --- |
| clearMessages | mutate | `app/src/components/BlinkoAi/aiInput.tsx:107` |
| create | mutate | `app/src/store/aiStore.tsx:110` |
| delete | mutate | `app/src/components/BlinkoAi/aiConversactionList.tsx:35` |
| detail | query | `app/src/store/aiStore.tsx:87` |
| list | query | `app/src/store/aiStore.tsx:94` |
| publicDetail | query | `app/src/pages/ai-share.tsx:48` |
| toggleShare | mutate | `app/src/components/BlinkoAi/aiChatBox.tsx:237` |
| update | mutate | `app/src/components/BlinkoAi/aiConversactionList.tsx:26` |

### follows
| procedure | type | ui usage |
| --- | --- | --- |
| follow | mutate | `app/src/components/BlinkoFollowDialog/index.tsx:99` |
| followList | query | `app/src/store/hubStore.tsx:58` |
| followerList | query | `app/src/store/hubStore.tsx:52` |
| recommandList | query | `app/src/store/hubStore.tsx:25` |
| unfollow | mutate | `app/src/components/BlinkoFollowDialog/index.tsx:164` |

### mcpServers
| procedure | type | ui usage |
| --- | --- | --- |
| connectionStatus | query | `app/src/store/aiSettingStore.tsx:326` |
| create | mutate | `app/src/store/aiSettingStore.tsx:343` |
| delete | mutate | `app/src/store/aiSettingStore.tsx:368` |
| disconnect | mutate | `app/src/store/aiSettingStore.tsx:390` |
| list | query | `app/src/store/aiSettingStore.tsx:319` |
| testConnection | mutate | `app/src/store/aiSettingStore.tsx:382` |
| toggle | mutate | `app/src/store/aiSettingStore.tsx:375` |
| update | mutate | `app/src/store/aiSettingStore.tsx:361` |

### message
| procedure | type | ui usage |
| --- | --- | --- |
| clearAfter | mutate | `app/src/store/aiStore.tsx:231` |
| create | mutate | `app/src/store/aiStore.tsx:116` |
| delete | mutate | `app/src/store/aiStore.tsx:215` |
| update | mutate | `app/src/store/aiStore.tsx:225` |

### notes
| procedure | type | ui usage |
| --- | --- | --- |
| clearRecycleBin | mutate | `app/src/components/Layout/index.tsx:155` |
| dailyReviewNoteList | query | `app/src/store/blinkoStore.tsx:416` |
| deleteMany | mutate | `app/src/components/BlinkoMultiSelectPop/index.tsx:61` |
| detail | mutate | `app/src/components/BlinkoCard/referencesContent.tsx:19` |
| getInternalSharedUsers | mutate | `app/src/store/blinkoStore.tsx:268` |
| getNoteHistory | query | `app/src/components/BlinkoNoteHistory/NoteHistoryModal.tsx:43` |
| internalShareNote | mutate | `app/src/store/blinkoStore.tsx:259` |
| list | mutate | `app/src/store/blinkoStore.tsx:161` |
| listByIds | mutate | `app/src/components/Common/Editor/editorStore.tsx:344` |
| noteReferenceList | mutate | `app/src/components/BlinkoReference/index.tsx:15` |
| publicDetail | mutate | `app/src/pages/share/[id].tsx:31` |
| publicList | mutate | `app/src/store/hubStore.tsx:22` |
| randomNoteList | query | `app/src/store/blinkoStore.tsx:422` |
| relatedNotes | query | `app/src/components/BlinkoRightClickMenu/index.tsx:317` |
| reviewNote | mutate | `app/src/pages/review.tsx:158` |
| shareNote | mutate | `app/src/store/blinkoStore.tsx:250` |
| trashMany | mutate | `app/src/components/BlinkoCard/index.tsx:113` |
| updateAttachmentsOrder | mutate | `app/src/components/Common/AttachmentRender/DraggableFileGrid.tsx:45` |
| updateMany | mutate | `app/src/components/BlinkoMultiSelectPop/index.tsx:23` |
| updateNotesOrder | mutate | `app/src/hooks/useDragCard.tsx:110` |
| upsert | mutate | `app/src/components/BlinkoNoteHistory/NoteHistoryModal.tsx:53` |

### notifications
| procedure | type | ui usage |
| --- | --- | --- |
| list | query | `app/src/components/BlinkoNotification/index.tsx:32` |
| markAsRead | mutate | `app/src/components/BlinkoNotification/index.tsx:44` |
| unreadCount | query | `app/src/components/BlinkoNotification/index.tsx:39` |

### plugin
| procedure | type | ui usage |
| --- | --- | --- |
| getAllPlugins | query | `app/src/store/plugin/pluginManagerStore.ts:54` |
| getInstalledPlugins | query | `app/src/store/plugin/pluginManagerStore.ts:61` |
| getPluginCssContents | query | `app/src/store/plugin/pluginManagerStore.ts:84` |
| installPlugin | mutate | `app/src/store/plugin/pluginManagerStore.ts:532` |
| saveAdditionalDevFile | mutate | `app/src/store/plugin/pluginManagerStore.ts:367` |
| saveDevPlugin | mutate | `app/src/store/plugin/pluginManagerStore.ts:336` |
| uninstallPlugin | mutate | `app/src/store/plugin/pluginManagerStore.ts:544` |

### public
| procedure | type | ui usage |
| --- | --- | --- |
| hubSiteList | query | `app/src/components/BlinkoFollowDialog/index.tsx:77` |
| latestClientVersion | query | `app/src/components/BlinkoSettings/AboutSetting.tsx:35` |
| latestServerVersion | query | `app/src/components/BlinkoSettings/AboutSetting.tsx:30` |
| linkPreview | query | `app/src/components/Common/MarkdownRender/LinkPreview.tsx:41` |
| musicMetadata | query | `app/src/components/Common/AttachmentRender/audioRender.tsx:42` |
| oauthProviders | query | `app/src/pages/signin.tsx:51` |
| serverVersion | query | `app/src/components/BlinkoSettings/AboutSetting.tsx:25` |
| siteInfo | query | `app/src/store/hubStore.tsx:46` |
| testHttpProxy | mutate | `app/src/components/BlinkoSettings/HttpProxySetting.tsx:50` |

### tags
| procedure | type | ui usage |
| --- | --- | --- |
| deleteOnlyTag | mutate | `app/src/components/Common/TagListPanel.tsx:285` |
| deleteTagWithAllNote | mutate | `app/src/components/Common/TagListPanel.tsx:293` |
| fullTagNameById | query | `app/src/components/Common/Editor/hooks/useEditor.ts:333` |
| list | query | `app/src/store/blinkoStore.tsx:434` |
| updateTagIcon | mutate | `app/src/components/Common/TagListPanel.tsx:44` |
| updateTagMany | mutate | `app/src/components/BlinkoMultiSelectPop/index.tsx:40` |
| updateTagName | mutate | `app/src/components/Common/TagListPanel.tsx:200` |
| updateTagOrder | mutate | `app/src/components/Common/TagListPanel.tsx:236` |

### task
| procedure | type | ui usage |
| --- | --- | --- |
| exportMarkdown | mutate | `app/src/components/BlinkoSettings/ExportSetting.tsx:53` |
| list | query | `app/src/store/blinkoStore.tsx:461` |
| upsertTask | mutate | `app/src/components/BlinkoSettings/TaskSetting.tsx:269` |

### users
| procedure | type | ui usage |
| --- | --- | --- |
| canRegister | mutate | `app/src/store/user.ts:102` |
| deleteUser | mutate | `app/src/components/BlinkoSettings/UserSetting.tsx:135` |
| detail | query | `app/src/store/user.ts:93` |
| genLowPermToken | mutate | `app/src/components/BlinkoSettings/BasicSetting.tsx:72` |
| generate2FASecret | mutate | `app/src/components/BlinkoSettings/BasicSetting.tsx:352` |
| linkAccount | mutate | `app/src/components/Common/Modals/LinkAccountModal.tsx:31` |
| list | query | `app/src/store/blinkoStore.tsx:404` |
| nativeAccountList | query | `app/src/components/Common/Modals/LinkAccountModal.tsx:21` |
| publicUserList | query | `app/src/components/BlinkoShareDialog/index.tsx:215` |
| regenToken | mutate | `app/src/components/BlinkoSettings/BasicSetting.tsx:235` |
| register | mutate | `app/src/pages/signup.tsx:104` |
| unlinkAccount | mutate | `app/src/components/BlinkoSettings/BasicSetting.tsx:155` |
| upsertUser | mutate | `app/src/components/BlinkoSettings/BasicSetting.tsx:97` |
| upsertUserByAdmin | mutate | `app/src/components/BlinkoSettings/UserSetting.tsx:33` |
| verify2FAToken | mutate | `app/src/components/Common/TwoFactorModal/gen2FATokenModal.tsx:35` |


## MVP note endpoints (current server contract)
These are the minimal note CRUD endpoints for local-first parity (server side types shown).

| route | method | request | response | evidence |
| --- | --- | --- | --- | --- |
| /v1/note/list | POST | JSON body with filters (tagId/page/size/orderBy/type/...); see Zod input | Array of notes + attachments/tags/references; see Zod output | `server/routerTrpc/note.ts:26-105` |
| /v1/note/detail | POST | JSON {"id": number} | note object (attachments/tags/etc) or null | `server/routerTrpc/note.ts:569-623` |
| /v1/note/upsert | POST | JSON note payload (content/type/attachments/id/etc) | z.any() (server returns note/metadata) | `server/routerTrpc/note.ts:830-866` |
| /v1/note/batch-trash | POST | JSON {"ids": number[]} | z.any() (soft delete) | `server/routerTrpc/note.ts:1295-1303` |
| /v1/note/batch-delete | POST | JSON {"ids": number[]} | z.any() (hard delete) | `server/routerTrpc/note.ts:1304-1329` |
