import { ATOMIC_MODEL_CATALOG, createDefaultModelSelection } from 'common/elephantnote/atomicWorkspace'
import { AI_SETUP_RECOMMENDED_IDS, isRunnableSetupModel } from 'common/elephantnote/aiSetup'
export const MODEL_ROLES=Object.freeze([{id:'embedding',label:'Embedding',hint:'Semantic search and note graph retrieval'},{id:'chat',label:'Chat',hint:'Assistant, RAG chat and agent bridging'},{id:'ocr',label:'OCR',hint:'Extract text from images and scans'}])
export const ROLE_IDS=Object.freeze(MODEL_ROLES.map(r=>r.id));export const USE_NONE='none'
export const formatBytes=v=>{let b=Number(v)||0;if(!b)return'';const u=['B','KB','MB','GB','TB'];let i=0;while(b>=1024&&i<u.length-1){b/=1024;i++}const d=i===0||b>=100||Math.abs(b-Math.round(b))<.05?0:1;return`${b.toFixed(d)} ${u[i]}`}
export const formatCompactCount=v=>{const n=Number(v)||0;if(n>=1e6)return`${(n/1e6).toFixed(n>=1e7?0:1)}M`;if(n>=1e3)return`${(n/1e3).toFixed(n>=1e4?0:1)}K`;return`${n}`}
export const resolveModelId=m=>String(m?.id||m?.repoId||m?.modelId||m?.modelPath||m?.path||m?.name||'').trim()
export const resolveModelName=m=>String(m?.name||m?.id||m?.repoId||m?.modelId||'Untitled model').trim()
export const resolveModelAuthor=m=>{const a=String(m?.author||'').trim();if(a)return a;const r=String(m?.repoId||m?.id||'').trim();return r.includes('/')?r.split('/')[0]:''}
export const isLocalModel=m=>m?.provider==='local-ocr'||Boolean(m?.path||m?.modelPath||m?.local)
export const isRemoteModel=m=>!isLocalModel(m)&&Boolean(m?.provider==='huggingface'||m?.repoId||m?.source==='huggingface'||m?.pull||m?.uri)
export const isRunnableModel=m=>isRunnableSetupModel(m)
export const isDownloading=(m={},d=new Map())=>Boolean(resolveModelId(m)&&d.has(resolveModelId(m)))
export const downloadProgress=(m={},d=new Map())=>Number(d.get(resolveModelId(m))?.percent||0)
export const downloadMessage=(m={},d=new Map())=>String(d.get(resolveModelId(m))?.message||'')
export const getRoleAssignments=(m={},s={})=>{const id=resolveModelId(m);return id?ROLE_IDS.filter(r=>s[r]===id):[]}
export const isAssignedToRole=(m={},r='',s={})=>Boolean(resolveModelId(m)&&r&&s[r]===resolveModelId(m))
export const assignRole=(s={},r='',m={})=>ROLE_IDS.includes(r)&&resolveModelId(m)?{...s,[r]:resolveModelId(m)}:{...s}
export const clearRoleAssignment=(s={},m={})=>{const id=resolveModelId(m),n={...s};for(const r of ROLE_IDS)if(n[r]===id)n[r]='';return n}
export const clearSpecificRole=(s={},r='')=>ROLE_IDS.includes(r)?{...s,[r]:''}:{...s}
export const applyRoleChoice=(s={},r='',m={},c='')=>c===USE_NONE?clearRoleAssignment(s,m):assignRole(s,r,m)
export const countAssignedRoles=s=>ROLE_IDS.reduce((n,r)=>n+(s?.[r]?1:0),0)
export const getAssignedModelForRole=(r='',cat=[],s={})=>cat.find(m=>resolveModelId(m)===s[r])||null
export const normalizeSelection=s=>({...createDefaultModelSelection(),...(s&&typeof s==='object'?s:{})})
export const getModelSummary=m=>String(m?.summary||m?.notes||m?.pipelineTag||m?.message||m?.repoId||'No description available.').trim()
export const getModelSizeLabel=m=>formatBytes(m?.sizeBytes||m?.size)||String(m?.size||'').trim()
export const getModelTags=m=>Array.from(new Set([m?.pipelineTag,m?.purpose&&m.purpose!=='chat'?m.purpose:'',...(Array.isArray(m?.tags)?m.tags:[])].filter(Boolean))).slice(0,4)
export const filterModelsByName=(models=[],q='')=>{const t=String(q).trim().toLowerCase();if(!t)return[...models];return models.filter(m=>[m.name,m.id,m.repoId,m.modelId,m.author,m.pipelineTag,...(Array.isArray(m.tags)?m.tags:[])].filter(Boolean).join(' ').toLowerCase().includes(t))}
const dedupeKey=m=>String(m?.repoId||m?.id||m?.modelId||m?.name||m?.path||m?.modelPath||'').trim().toLowerCase()
export const dedupeModelsById=(models=[])=>Array.from(models.reduce((map,m)=>{const k=dedupeKey(m);if(!k)return map;const old=map.get(k);if(!old||isLocalModel(m)&&!isLocalModel(old)||Number(m?.downloads||0)>Number(old?.downloads||0))map.set(k,m);return map},new Map()).values())
export const sortByPopularity=(models=[])=>dedupeModelsById(models).sort((a,b)=>Number(b.downloads||0)-Number(a.downloads||0)||Number(b.likes||0)-Number(a.likes||0)||String(a.name||'').localeCompare(String(b.name||'')))
export const mergeLocalAndRemote=(l=[],r=[])=>dedupeModelsById([...(Array.isArray(l)?l:[]),...(Array.isArray(r)?r:[])])
export const getPopularModels=({catalog=ATOMIC_MODEL_CATALOG,remote=[],limit=12}={})=>sortByPopularity(mergeLocalAndRemote(catalog.filter(isRunnableModel),remote)).slice(0,Number(limit)||12)
export const getRecommendedModelId=(r='')=>(AI_SETUP_RECOMMENDED_IDS['node-llama-cpp']||{})[r]||''
export const getRecommendedModel=(r='',c=ATOMIC_MODEL_CATALOG)=>c.find(m=>m.id===getRecommendedModelId(r))||null
export const buildStateBadge=(m={},s={},d=new Map())=>isDownloading(m,d)?{tone:'downloading',label:'Downloading'}:getRoleAssignments(m,s).length?{tone:'active',label:`Active · ${getRoleAssignments(m,s).length} role${getRoleAssignments(m,s).length>1?'s':''}`}:isLocalModel(m)?{tone:'installed',label:'Installed'}:{tone:'available',label:'Available'}
export const createInitialSelection=()=>normalizeSelection({})
export const getUseMenuOptions=(m={},s={})=>[...MODEL_ROLES.map(r=>({...r,selected:getRoleAssignments(m,s).includes(r.id),recommended:getRecommendedModelId(r.id)===resolveModelId(m)})),{id:USE_NONE,label:'None',hint:getRoleAssignments(m,s).length?'Unassign from every role':'Not in use',selected:getRoleAssignments(m,s).length===0}]
export const FORMAT_FILTERS=Object.freeze([{id:'all',label:'All'},{id:'gguf',label:'GGUF'},{id:'mlx',label:'MLX'},{id:'onnx',label:'ONNX'}])
export const SOURCE_FILTERS=Object.freeze([{id:'all',label:'All'},{id:'installed',label:'Installed'},{id:'local',label:'Local'},{id:'remote',label:'Remote'}])
export const SORT_OPTIONS=Object.freeze([{id:'best',label:'Best Match'},{id:'downloads',label:'Downloads'},{id:'updated',label:'Recently Updated'},{id:'likes',label:'Likes'},{id:'name',label:'Name'}])
export const getModelFormat=m=>{const n=String(m?.fileName||m?.filename||m?.name||m?.id||'').toLowerCase();if(n.includes('mlx'))return'MLX';if(n.includes('onnx'))return'ONNX';if(m?.provider==='local-ocr'||m?.task==='ocr')return'OCR';return'GGUF'}
export const getModelQuantization=m=>{const n=String(m?.fileName||m?.filename||m?.name||m?.id||'');const q=n.match(/q([0-9]+(?:_[a-z0-9_]+)*)/i);if(q)return`Q${q[1].toUpperCase()}`;if(m?.dtype)return String(m.dtype).toUpperCase();if(/f16|fp16/i.test(n))return'F16';if(/q8/i.test(n))return'Q8';return''}
export const getModelCapabilities=m=>{const caps=new Set(),p=String(m?.purpose||'').toLowerCase(),t=String(m?.task||'').toLowerCase(),pl=String(m?.pipelineTag||'').toLowerCase(),tags=Array.isArray(m?.tags)?m.tags.map(x=>String(x).toLowerCase()):[];if(p==='chat'||t.includes('chat')||t.includes('text-generation')||pl.includes('text-generation'))caps.add('Chat');if(p==='embedding'||t.includes('embedding'))caps.add('Embedding');if(p==='ocr'||t.includes('ocr'))caps.add('OCR');if(tags.some(x=>['vision','vlm','image'].includes(x)))caps.add('Vision');if(tags.some(x=>['tool-use','tools','function-calling'].includes(x)))caps.add('Tool Use');if(!caps.size&&isRunnableModel(m))caps.add('Chat');return[...caps]}
export const getModelUpdatedDate=m=>{const raw=m?.updatedAt||m?.modifiedAt||m?.lastModified||m?.created_at||m?.createdAt;if(!raw)return'';const d=new Date(raw);return Number.isNaN(d.getTime())?'':d.toISOString().slice(0,10)}
export const formatRelativeDate=(v='',now=new Date())=>{if(!v)return'';const d=new Date(v),days=Math.floor((now-d)/86400000);if(Number.isNaN(d.getTime()))return'';if(days<1)return'today';if(days<30)return`${days} days ago`;const mo=Math.floor(days/30);if(mo<12)return mo===1?'1 month ago':`${mo} months ago`;const y=Math.floor(days/365);return y===1?'1 year ago':`${y} years ago`}
export const getModelSource=m=>isLocalModel(m)?'Local':isRemoteModel(m)?'Hugging Face':m?.provider||'Unknown'
export const getModelLicense=m=>String(m?.cardData?.license||m?.license||'').trim()||'unknown'
export const getModelRuntime=m=>m?.provider==='node-llama-cpp'?'llama.cpp':m?.provider==='local-ocr'||m?.engine==='tesseract'?'Tesseract':m?.engine||m?.provider||'llama.cpp'
export const getModelReadme=m=>({creator:resolveModelAuthor(m)||'unknown',original:String(m?.repoId||m?.id||'').trim()||'unknown',format:getModelFormat(m),runtime:getModelRuntime(m),license:getModelLicense(m),description:getModelSummary(m)})
export const filterByFormat=(ms=[],f='all')=>!f||f==='all'?[...ms]:ms.filter(m=>getModelFormat(m).toLowerCase()===f.toLowerCase())
export const filterBySource=(ms=[],s='all')=>!s||s==='all'?[...ms]:s==='remote'?ms.filter(m=>isRemoteModel(m)&&!isLocalModel(m)):s==='installed'||s==='local'?ms.filter(isLocalModel):[...ms]
export const sortModels=(ms=[],s='best')=>{const l=dedupeModelsById(ms);if(s==='downloads')return l.sort((a,b)=>Number(b.downloads||0)-Number(a.downloads||0));if(s==='likes')return l.sort((a,b)=>Number(b.likes||0)-Number(a.likes||0));if(s==='updated')return l.sort((a,b)=>new Date(b.updatedAt||b.modifiedAt||0)-new Date(a.updatedAt||a.modifiedAt||0));if(s==='name')return l.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));return sortByPopularity(l)}
export const applyCatalogFilters=({models=[],query='',format='all',source='all',sort='best'}={})=>sortModels(filterBySource(filterByFormat(filterModelsByName(dedupeModelsById(models),query),format),source),sort)
export const getDownloadOption=m=>({format:getModelFormat(m),quantization:getModelQuantization(m),sizeLabel:getModelSizeLabel(m),fileName:String(m?.fileName||m?.filename||'').trim()||resolveModelName(m),installed:isLocalModel(m),status:isLocalModel(m)?'Applicable model file already downloaded':isRemoteModel(m)?'Available for download':'Local file'})
