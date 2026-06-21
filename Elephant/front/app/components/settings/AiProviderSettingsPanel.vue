<template>
  <section class="en-ai-provider-settings">
    <header class="en-ai-provider-header">
      <div>
        <h3>AI settings</h3>
        <p>Model Library keeps local model download and role assignment. Here you choose which runtime/provider each AI feature should use.</p>
      </div>
      <div class="en-ai-actions">
        <button type="button" :disabled="loading" @click="loadConfig">{{ loading ? 'Loading...' : 'Reload' }}</button>
        <button type="button" :disabled="saving" @click="saveConfig">{{ saving ? 'Saving...' : 'Save' }}</button>
      </div>
    </header>

    <section class="en-ai-block">
      <h4>Local app roles</h4>
      <p class="en-ai-muted">Read-only: these come from the Model Library. Settings never download, uninstall, or manually pick local files.</p>
      <div class="en-ai-route-summary">
        <span>Embedding: {{ localSelection.embedding || 'not assigned' }}</span>
        <span>Chat: {{ localSelection.chat || 'not assigned' }}</span>
        <span>OCR: {{ localSelection.ocr || 'not assigned' }}</span>
      </div>
    </section>

    <section class="en-ai-block">
      <h4>Provider configuration</h4>
      <div class="en-ai-grid">
        <label><span>Default provider</span><select v-model="form.defaultProvider"><option value="app-local">App local models</option><option value="api">OpenAI-compatible API</option><option value="codex">Codex bridge</option><option value="ollama">Ollama</option><option value="lmstudio">LM Studio</option><option value="llamacpp">llama.cpp server</option><option value="atomic">Atomic provider registry</option></select></label>
        <label><span>Temperature</span><input v-model.number="form.temperature" type="number" min="0" max="2" step="0.05" /></label>
        <label><span>Max tokens</span><input v-model.number="form.maxTokens" type="number" min="1" step="128" /></label>
        <label><span>Context window</span><input v-model.number="form.contextWindow" type="number" min="512" step="512" /></label>
        <label><span>RAG top K</span><input v-model.number="form.ragTopK" type="number" min="1" max="50" /></label>
      </div>
      <div class="en-ai-actions">
        <button type="button" :class="{ active: form.enableRag }" @click="form.enableRag = !form.enableRag">{{ form.enableRag ? 'RAG on' : 'RAG off' }}</button>
        <button type="button" :class="{ active: form.enableTools }" @click="form.enableTools = !form.enableTools">{{ form.enableTools ? 'Tools on' : 'Tools off' }}</button>
        <button type="button" :class="{ active: form.stream }" @click="form.stream = !form.stream">{{ form.stream ? 'Streaming on' : 'Streaming off' }}</button>
      </div>
      <label class="en-ai-full"><span>System prompt</span><textarea v-model="form.systemPrompt" rows="4" placeholder="Global instructions used by AI features when supported." /></label>
    </section>

    <section class="en-ai-block">
      <h4>Provider endpoints</h4>
      <div class="en-ai-grid">
        <label><span>API endpoint</span><input v-model.trim="form.apiEndpoint" type="text" placeholder="OpenAI-compatible endpoint" /></label>
        <label><span>API provider name</span><input v-model.trim="form.apiProvider" type="text" placeholder="openai, openrouter, mistral, custom" /></label>
        <label><span>Ollama endpoint</span><input v-model.trim="form.ollamaEndpoint" type="text" placeholder="http://127.0.0.1:11434" /></label>
        <label><span>LM Studio endpoint</span><input v-model.trim="form.lmstudioEndpoint" type="text" placeholder="http://127.0.0.1:1234/v1" /></label>
        <label><span>llama.cpp server endpoint</span><input v-model.trim="form.llamacppEndpoint" type="text" placeholder="http://127.0.0.1:8080" /></label>
        <label><span>Headers JSON</span><input v-model.trim="form.headersJson" type="text" placeholder='{"Header":"value"}' /></label>
      </div>
    </section>

    <section class="en-ai-block">
      <h4>Codex / Pi / Atomic bridge</h4>
      <p class="en-ai-muted">Codex is configured as a bridge provider, the same idea as Pi: the app stores a provider id/command and the backend decides how to execute it.</p>
      <div class="en-ai-grid">
        <label><span>Codex bridge id</span><input v-model.trim="form.codexProviderId" type="text" placeholder="codex" /></label>
        <label><span>Codex command</span><input v-model.trim="form.codexCommand" type="text" placeholder="codex" /></label>
        <label><span>Codex args</span><input v-model.trim="form.codexArgs" type="text" placeholder="--model ..." /></label>
        <label><span>Codex cwd</span><input v-model.trim="form.codexCwd" type="text" placeholder="empty = active vault" /></label>
        <label><span>Pi bridge endpoint</span><input v-model.trim="form.piEndpoint" type="text" placeholder="Pi bridge endpoint or command" /></label>
        <label><span>Atomic provider id</span><input v-model.trim="form.atomicProviderId" type="text" placeholder="provider id" /></label>
      </div>
      <div class="en-ai-actions">
        <button type="button" :disabled="loadingAtomic" @click="loadAtomicProviders">{{ loadingAtomic ? 'Inspecting...' : 'Inspect Atomic providers' }}</button>
        <span>{{ atomicMessage }}</span>
      </div>
      <pre v-if="atomicText">{{ atomicText }}</pre>
    </section>

    <section class="en-ai-block">
      <h4>Feature routing</h4>
      <p class="en-ai-muted">Choose a runtime per feature. Use “App local role” to use the model selected in the Model Library.</p>
      <div class="en-ai-feature-grid">
        <article v-for="route in routes" :key="route.id" class="en-ai-route-card">
          <h5>{{ route.title }}</h5>
          <label><span>Runtime</span><select v-model="form.routes[route.id].source"><option value="app-local">App local role</option><option value="api">API provider</option><option value="codex">Codex bridge</option><option value="ollama">Ollama</option><option value="lmstudio">LM Studio</option><option value="llamacpp">llama.cpp server</option><option value="atomic">Atomic provider</option><option value="disabled">Disabled</option></select></label>
          <label><span>Model / provider model</span><input v-model.trim="form.routes[route.id].model" type="text" :placeholder="route.placeholder" /></label>
          <label><span>Endpoint override</span><input v-model.trim="form.routes[route.id].endpoint" type="text" placeholder="optional" /></label>
          <label><span>Provider options JSON</span><input v-model.trim="form.routes[route.id].optionsJson" type="text" placeholder='{"key":"value"}' /></label>
        </article>
      </div>
    </section>

    <section class="en-ai-block">
      <h4>Test and debug</h4>
      <div class="en-ai-actions">
        <button type="button" :disabled="testing" @click="testConfig">{{ testing ? 'Testing...' : 'Test current config' }}</button>
        <span>{{ message }}</span>
      </div>
      <pre>{{ preview }}</pre>
    </section>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import log from 'electron-log/renderer'
import { normalizeAiConfig } from 'common/elephantnote/aiProviders'
import { elephantnoteClient } from '../../services/elephantnoteClient'
import { clonePlainObject } from './settingsModelHelpers'
const loading=ref(false),saving=ref(false),testing=ref(false),loadingAtomic=ref(false),message=ref(''),atomicMessage=ref(''),atomicText=ref('')
const currentConfig=ref(normalizeAiConfig())
const localSelection=ref({embedding:'',chat:'',ocr:''})
const routes=Object.freeze([{id:'embedding',title:'Embedding',placeholder:'local role, text embedding API, nomic...'},{id:'chat',title:'Chat',placeholder:'local role, codex, gpt, qwen...'},{id:'ocr',title:'OCR',placeholder:'local OCR, mistral OCR, custom...'}])
function defaultRoute(){return{source:'app-local',model:'',endpoint:'',optionsJson:''}}
function defaultForm(){return{defaultProvider:'app-local',temperature:0.2,maxTokens:2048,contextWindow:8192,ragTopK:6,enableRag:true,enableTools:true,stream:true,systemPrompt:'',apiEndpoint:'',apiProvider:'openai-compatible',ollamaEndpoint:'http://127.0.0.1:11434',lmstudioEndpoint:'http://127.0.0.1:1234/v1',llamacppEndpoint:'http://127.0.0.1:8080',headersJson:'',codexProviderId:'codex',codexCommand:'codex',codexArgs:'',codexCwd:'',piEndpoint:'',atomicProviderId:'',routes:{embedding:defaultRoute(),chat:defaultRoute(),ocr:defaultRoute()}}}
const form=ref(defaultForm())
const parseJsonObject=(text='')=>{if(!String(text).trim())return{};try{const v=JSON.parse(text);return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}catch(error){log.warn('[ai-settings] invalid-json',error);return{}}}
const normalizeRoute=(v={},fallback='app-local')=>({...defaultRoute(),source:v.source||v.provider||fallback,model:v.model||'',endpoint:v.endpoint||'',optionsJson:v.options?JSON.stringify(v.options):v.optionsJson||''})
const routePayload=(r={})=>({source:r.source,provider:r.source,model:r.model,endpoint:r.endpoint,options:parseJsonObject(r.optionsJson)})
const primaryEndpoint=(provider)=>provider==='api'?form.value.apiEndpoint:provider==='ollama'?form.value.ollamaEndpoint:provider==='lmstudio'?form.value.lmstudioEndpoint:provider==='llamacpp'?form.value.llamacppEndpoint:provider==='codex'?'codex://bridge':provider==='atomic'?'atomic://provider':'node-llama-cpp://local'
const applyConfig=(config={})=>{log.info('[ai-settings] applyConfig:start',{keys:Object.keys(config||{})});const savedRoutes=config.routes||config.aiRoutes||{};form.value={...defaultForm(),defaultProvider:config.defaultProvider||config.provider||config.transport||'app-local',temperature:Number(config.temperature??0.2),maxTokens:Number(config.maxTokens??config.max_tokens??2048),contextWindow:Number(config.contextWindow??config.context_window??8192),ragTopK:Number(config.ragTopK??config.rag?.topK??6),enableRag:config.enableRag??config.rag?.enabled??true,enableTools:config.enableTools??config.tools?.enabled??true,stream:config.stream??config.streaming??true,systemPrompt:config.systemPrompt||config.system||'',apiEndpoint:config.providers?.api?.endpoint||config.apiEndpoint||config.endpoint||'',apiProvider:config.providers?.api?.name||config.apiProvider||'openai-compatible',ollamaEndpoint:config.providers?.ollama?.endpoint||'http://127.0.0.1:11434',lmstudioEndpoint:config.providers?.lmstudio?.endpoint||'http://127.0.0.1:1234/v1',llamacppEndpoint:config.providers?.llamacpp?.endpoint||'http://127.0.0.1:8080',headersJson:config.headers?JSON.stringify(config.headers):'',codexProviderId:config.providers?.codex?.id||config.codex?.providerId||'codex',codexCommand:config.providers?.codex?.command||config.codex?.command||'codex',codexArgs:Array.isArray(config.providers?.codex?.args)?config.providers.codex.args.join(' '):Array.isArray(config.codex?.args)?config.codex.args.join(' '):'',codexCwd:config.providers?.codex?.cwd||config.codex?.cwd||'',piEndpoint:config.providers?.pi?.endpoint||config.pi?.endpoint||'',atomicProviderId:config.providers?.atomic?.providerId||config.atomic?.providerId||'',routes:{embedding:normalizeRoute(savedRoutes.embedding),chat:normalizeRoute(savedRoutes.chat),ocr:normalizeRoute(savedRoutes.ocr)}};log.info('[ai-settings] applyConfig:done',{defaultProvider:form.value.defaultProvider,routes:form.value.routes})}
const buildConfig=()=>{const chatRoute=form.value.routes.chat||defaultRoute();const provider=chatRoute.source==='app-local'?'node-llama-cpp':chatRoute.source;return normalizeAiConfig({...clonePlainObject(currentConfig.value),defaultProvider:form.value.defaultProvider,provider,transport:provider,endpoint:chatRoute.endpoint||primaryEndpoint(chatRoute.source),model:chatRoute.model,temperature:Number(form.value.temperature)||0,maxTokens:Number(form.value.maxTokens)||2048,contextWindow:Number(form.value.contextWindow)||8192,systemPrompt:form.value.systemPrompt,stream:Boolean(form.value.stream),enableRag:Boolean(form.value.enableRag),enableTools:Boolean(form.value.enableTools),headers:parseJsonObject(form.value.headersJson),rag:{enabled:Boolean(form.value.enableRag),topK:Number(form.value.ragTopK)||6},tools:{enabled:Boolean(form.value.enableTools)},providers:{api:{name:form.value.apiProvider,endpoint:form.value.apiEndpoint},ollama:{endpoint:form.value.ollamaEndpoint},lmstudio:{endpoint:form.value.lmstudioEndpoint},llamacpp:{endpoint:form.value.llamacppEndpoint},codex:{id:form.value.codexProviderId,mode:'bridge',command:form.value.codexCommand,args:form.value.codexArgs.split(' ').filter(Boolean),cwd:form.value.codexCwd},pi:{endpoint:form.value.piEndpoint,mode:'bridge'},atomic:{providerId:form.value.atomicProviderId}},routes:{embedding:routePayload(form.value.routes.embedding),chat:routePayload(form.value.routes.chat),ocr:routePayload(form.value.routes.ocr)},localModelSelection:clonePlainObject(localSelection.value)})}
const preview=computed(()=>JSON.stringify(buildConfig(),null,2))
const loadLocalSelection=async()=>{try{localSelection.value={embedding:'',chat:'',ocr:'',...(await elephantnoteClient.models.getSelection?.())};log.info('[ai-settings] local-selection:loaded',localSelection.value)}catch(error){log.warn('[ai-settings] local-selection:failed',error)}}
const loadConfig=async()=>{loading.value=true;message.value='Loading AI config...';log.info('[ai-settings] loadConfig:start');try{await loadLocalSelection();const config=await elephantnoteClient.ai.getConfig();currentConfig.value=normalizeAiConfig(config);applyConfig(currentConfig.value);message.value='AI config loaded.';log.info('[ai-settings] loadConfig:done',{provider:form.value.defaultProvider,routes:form.value.routes})}catch(error){log.error('[ai-settings] loadConfig:failed',error);message.value=error instanceof Error?error.message:'Unable to load AI config.'}finally{loading.value=false}}
const saveConfig=async()=>{saving.value=true;message.value='Saving AI config...';const payload=buildConfig();log.info('[ai-settings] saveConfig:start',{provider:payload.provider,endpoint:payload.endpoint,routes:payload.routes,providers:payload.providers});try{const saved=await elephantnoteClient.ai.setConfig(clonePlainObject(payload));currentConfig.value=normalizeAiConfig(saved||payload);message.value='AI config saved.';log.info('[ai-settings] saveConfig:done',{provider:currentConfig.value.provider||currentConfig.value.transport,routes:currentConfig.value.routes})}catch(error){log.error('[ai-settings] saveConfig:failed',error);message.value=error instanceof Error?error.message:'Unable to save AI config.'}finally{saving.value=false}}
const testConfig=async()=>{testing.value=true;const payload=buildConfig();message.value='Testing AI config...';log.info('[ai-settings] testConfig:start',{provider:payload.provider,endpoint:payload.endpoint,model:payload.model,routes:payload.routes});try{const result=await elephantnoteClient.ai.testConfig(clonePlainObject(payload));message.value=`AI config OK · ${Math.round(result.latencyMs||0)} ms · ${result.response||'response received'}`;log.info('[ai-settings] testConfig:done',result)}catch(error){log.error('[ai-settings] testConfig:failed',error);message.value=error instanceof Error?error.message:'AI endpoint test failed.'}finally{testing.value=false}}
const loadAtomicProviders=async()=>{loadingAtomic.value=true;atomicMessage.value='Inspecting Atomic providers...';log.info('[ai-settings] loadAtomicProviders:start');try{const providers=await elephantnoteClient.atomicFeatures.providers();atomicText.value=JSON.stringify(providers,null,2);atomicMessage.value='Atomic providers loaded.';log.info('[ai-settings] loadAtomicProviders:done',providers)}catch(error){log.error('[ai-settings] loadAtomicProviders:failed',error);atomicMessage.value=error instanceof Error?error.message:'Unable to inspect Atomic providers.'}finally{loadingAtomic.value=false}}
onMounted(loadConfig)
</script>

<style scoped>
.en-ai-provider-settings{display:grid;gap:14px}.en-ai-provider-header,.en-ai-block{display:grid;gap:12px;padding:16px;border:1px solid var(--en-border,rgba(255,255,255,.14));border-radius:16px;background:var(--en-card,#252525)}.en-ai-provider-header{grid-template-columns:minmax(0,1fr) auto;align-items:center}.en-ai-provider-header h3,.en-ai-block h4,.en-ai-route-card h5{margin:0}.en-ai-provider-header p,.en-ai-muted{margin:4px 0 0;color:var(--en-muted,#9a9a9a)}.en-ai-grid,.en-ai-feature-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.en-ai-feature-grid{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.en-ai-route-card{display:grid;gap:10px;padding:12px;border:1px solid var(--en-border,rgba(255,255,255,.14));border-radius:14px;background:rgba(0,0,0,.12)}.en-ai-grid label,.en-ai-route-card label,.en-ai-full{display:grid;gap:6px;color:var(--en-muted,#9a9a9a)}.en-ai-grid input,.en-ai-grid select,.en-ai-route-card input,.en-ai-route-card select,.en-ai-full textarea{width:100%;min-height:38px;padding:0 12px;border:1px solid var(--en-border,rgba(255,255,255,.14));border-radius:12px;background:var(--en-card,#292929);color:var(--en-text,#f4f4f4)}.en-ai-full textarea{padding:10px 12px;resize:vertical}.en-ai-actions,.en-ai-route-summary{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.en-ai-route-summary span{border:1px solid var(--en-border,rgba(255,255,255,.14));border-radius:999px;padding:4px 10px;color:var(--en-muted,#9a9a9a)}.en-ai-actions button{border:1px solid var(--en-border,rgba(255,255,255,.14));border-radius:12px;background:var(--en-card,#292929);color:var(--en-text,#f4f4f4);min-height:34px;padding:0 14px}.en-ai-actions button.active{border-color:#4caf5c;color:#c9f6d0;background:rgba(76,175,92,.12)}.en-ai-actions span{color:var(--en-muted,#9a9a9a)}pre{max-height:260px;overflow:auto;padding:12px;border-radius:12px;background:rgba(0,0,0,.25);white-space:pre-wrap;font-size:12px}@media(max-width:760px){.en-ai-provider-header{grid-template-columns:1fr}.en-ai-grid{grid-template-columns:1fr}}
</style>
