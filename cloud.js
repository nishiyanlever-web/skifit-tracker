'use strict';
/* SkiFit cloud sync: per-record reconciliation, tombstones, Supabase email OTP, optional server-side AI. */
(()=>{
const core=window.SkiFitCore, STORAGE='skifit-cloud-v2';
const clone=x=>JSON.parse(JSON.stringify(x));
const key=(kind,obj)=>kind==='daily'?`daily:${obj.date}`:`workout:${obj.id}`;
const seedDailyIds=new Set();
const seedWorkIds=[];
const now=()=>new Date().toISOString();
const empty=()=>({url:'',anon:'',session:null,email:'',pending:{},tombstones:{},base:null,status:'未設定',lastSync:null,auto:false});
let config;try{config={...empty(),...JSON.parse(localStorage.getItem(STORAGE)||'{}')}}catch{config=empty()}
const save=()=>localStorage.setItem(STORAGE,JSON.stringify(config));
const initial=()=>{const d=core.getData();let changed=false;d.workouts.forEach((w,i)=>{if(!w.id){w.id=seedWorkIds[i]||crypto.randomUUID();changed=true}});if(changed)core.replaceData(d);return clone(d)};
let previous=initial();
let busy=false, timer=null;
const normalized=(d)=>({daily:(d.daily||[]).map(x=>clone(x)),workouts:(d.workouts||[]).map(x=>clone(x))});
const index=d=>{const m=new Map();for(const kind of ['daily','workouts'])for(const obj of d[kind]||[]){const type=kind==='daily'?'daily':'workout';m.set(key(type,obj),{kind:type,payload:obj})}return m};
const updateStatus=s=>{config.status=s;save();const el=document.getElementById('cloudStatus');if(el)el.textContent=s};
const host=()=>config.url.replace(/\/+$/,'');
const validHost=()=>{try{const u=new URL(host());return u.protocol==='https:'&&/^[a-z0-9-]+\.supabase\.co$/.test(u.hostname)}catch{return false}};
const headers=(auth=true)=>({'apikey':config.anon,'Content-Type':'application/json',...(auth&&config.session?{'Authorization':`Bearer ${config.session.access_token}`}:{})});
async function request(path,opts={},auth=true){if(!validHost()||!config.anon)throw Error('Supabase URLと公開キーを設定してください');const res=await fetch(host()+path,{...opts,headers:{...headers(auth),...(opts.headers||{})}});let out;try{out=await res.json()}catch{out={}}if(!res.ok)throw Error(out.msg||out.message||out.error_description||out.error||`HTTP ${res.status}`);return out}
async function token(){if(!config.session)throw Error('ログインしてください');if(Date.now()<config.session.expires_at*1000-120000)return config.session.access_token;if(!config.session.refresh_token)throw Error('ログインし直してください');const x=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:config.session.refresh_token})},false);config.session={...x,expires_at:Math.floor(Date.now()/1000)+x.expires_in};save();return config.session.access_token}
async function user(){await token();return await request('/auth/v1/user')}
async function login(email){if(!validHost())throw Error('SupabaseのプロジェクトURLを設定してください');await request('/auth/v1/otp',{method:'POST',body:JSON.stringify({email,create_user:true,gotrue:true,redirect_to:location.origin+location.pathname})},false);config.email=email;save();updateStatus('確認メールを送信しました。メールのリンクから戻ってください。')}
function authCallback(){const hash=new URLSearchParams(location.hash.slice(1));if(hash.has('access_token')&&hash.has('refresh_token')){config.session={access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),expires_at:Math.floor(Date.now()/1000)+Number(hash.get('expires_in')||3600)};config.auto=true;save();history.replaceState(null,'',location.pathname+location.search);updateStatus('ログイン済み・同期準備中');setTimeout(()=>sync().catch(()=>{}),300)}else if(hash.has('error_description')){updateStatus('認証エラー: '+hash.get('error_description'));history.replaceState(null,'',location.pathname+location.search)}}
function onPersist(current){const before=index(previous),after=index(current);const stamp=now();for(const [id,entry]of after){const old=before.get(id);if(!old||JSON.stringify(old)!==JSON.stringify(entry)){config.pending[id]={...entry,updated_at:stamp,deleted:false};delete config.tombstones[id]}}
for(const [id,entry]of before)if(!after.has(id)){config.pending[id]={...entry,updated_at:stamp,deleted:true};config.tombstones[id]=stamp}
previous=clone(current);save();schedule()}
function schedule(){clearTimeout(timer);if(config.auto&&config.session&&navigator.onLine)timer=setTimeout(()=>sync().catch(()=>{}),1800)}
function merge(remote){const local=index(core.getData()),out=new Map(remote.map(r=>[r.id,r]));const pending=config.pending;
// A new device with untouched built-in sample data must not resurrect cloud-deleted seed entries.
for(const [id,entry]of local){if(!out.has(id)&&!config.tombstones[id]&&!pending[id]){if(remote.length===0||!(id.startsWith('workout:seed-')||(id.startsWith('daily:')&&seedDailyIds.has(id.slice(6))))){pending[id]={...entry,updated_at:now(),deleted:false}}}}
for(const [id,entry]of Object.entries(pending)){const r=out.get(id);if(!r||entry.updated_at>r.updated_at)out.set(id,{id,...entry});else delete pending[id]}
const result={daily:[],workouts:[]};for(const r of out.values()){if(r.deleted)continue;if(r.kind==='daily')result.daily.push(r.payload);else if(r.kind==='workout')result.workouts.push(r.payload)}
result.daily.sort((a,b)=>a.date.localeCompare(b.date));result.workouts.sort((a,b)=>a.date.localeCompare(b.date));return result}
async function sync(){if(busy||!config.session||!config.auto||!navigator.onLine)return;busy=true;updateStatus('同期中…');try{const me=await user();const remote=await request('/rest/v1/records?select=id,kind,payload,updated_at,deleted&limit=10000');
const merged=merge(remote);core.replaceData(merged);previous=clone(merged);
const batch=Object.entries(config.pending).map(([id,r])=>({id,user_id:me.id,kind:r.kind,payload:r.payload,updated_at:r.updated_at,deleted:r.deleted}));
if(batch.length){await request('/rest/v1/records?on_conflict=user_id,id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(batch)});for(const r of batch){if(config.pending[r.id]?.updated_at===r.updated_at)delete config.pending[r.id]}}
config.lastSync=now();updateStatus('同期済み：'+new Date(config.lastSync).toLocaleString('ja-JP'));save();
}catch(e){updateStatus('同期失敗：'+e.message);throw e}finally{busy=false}}
function statusText(){return config.session?`ログイン中（${config.email||'メール認証'}）`:'未ログイン'}
function settingsHTML(){const e=core.escape;return `<section class="panel"><h2>☁ クラウド自動同期</h2><p class="muted">Supabaseの無料枠などを利用し、iPhone・PC間で日次ログとトレーニング記録を同期します。初期設定とメール認証が必要です。</p><div class="field"><label>Supabase Project URL</label><input id="cloudUrl" placeholder="https://xxxxx.supabase.co" value="${e(config.url)}"></div><div class="field"><label>Supabase 公開キー（anon / publishable）</label><input id="cloudAnon" placeholder="sb_publishable_... または eyJ..." value="${e(config.anon)}"></div><div class="actions"><button class="secondary" id="cloudSave">接続設定を保存</button></div><hr style="border:0;border-top:1px solid #e5edf3;margin:18px 0"><div class="field"><label>ログイン用メールアドレス</label><input type="email" id="cloudEmail" autocomplete="email" placeholder="you@example.com" value="${e(config.email)}"></div><p class="muted">${e(statusText())}</p><div class="actions"><button class="primary" id="cloudLogin">メールでログイン</button><button class="secondary" id="cloudSync">今すぐ同期</button><button class="danger" id="cloudLogout">ログアウト</button></div><div class="field"><label style="display:flex;align-items:center;gap:8px"><input id="cloudAuto" type="checkbox" style="width:auto" ${config.auto?'checked':''}>変更時・起動時に自動同期する</label></div><div class="warning" id="cloudStatus">${e(config.status)}</div><p class="muted">同期にはHTTPS接続が必要です。複数端末で同じ記録を同時編集した場合、更新時刻の新しい変更を優先します。削除も同期されます。同期エラー時は端末に記録が残り、次回再試行します。</p></section>`}
function bindSettings(){const el=id=>document.getElementById(id);if(!el('cloudSave'))return;el('cloudSave').onclick=()=>{const u=el('cloudUrl').value.trim(),a=el('cloudAnon').value.trim();if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(u)||!a){alert('正しいSupabase URLと公開キーを入力してください');return}config.url=u;config.anon=a;save();updateStatus('設定を保存しました')};el('cloudLogin').onclick=async()=>{try{await login(el('cloudEmail').value.trim());alert('メール内のログインリンクを開いてください')}catch(e){alert(e.message)}};el('cloudSync').onclick=async()=>{if(!config.session){alert('ログインしてください');return}config.auto=true;save();try{await sync()}catch(e){alert(e.message)}};el('cloudLogout').onclick=async()=>{config.session=null;config.auto=false;save();updateStatus('ログアウトしました。端末内の記録は残ります');core.render()};el('cloudAuto').onchange=e=>{config.auto=e.target.checked;save();if(config.auto)sync().catch(()=>{})}}
function summary(){const d=core.getData();const daily=[...d.daily].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,21);const workouts=[...d.workouts].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,12);return {goal:'スキーに向けた筋力・持久力・回復の改善。個別の症状はユーザーが必要に応じてChatGPTへ伝える。',daily,workouts}}
function prompt(){return 'あなたは安全性に配慮するスキー向け筋力・持久力コーチです。次の記録から①最近の負荷と回復②次回DAY A/B/Cの推奨と具体的なセット③注意すべき症状④不足データを日本語で簡潔に分析してください。未記録値は推測しないでください。\n'+JSON.stringify(summary(),null,2)}
function coachHTML(){return `<section class="panel"><h2>🤖 ChatGPT連携</h2><p>直近21件の日次ログと12件のトレーニングをまとめて分析できます。</p><p class="muted">分析用データをコピーしてChatGPTに貼り付けます。ChatGPTの会話へ自動送信されることはありません。OpenAI APIは使用しないため、API利用料金は発生しません。</p><div class="actions"><button class="primary" id="copyPrompt">分析用データをコピー</button><button class="secondary" id="openChat">ChatGPTを開く</button></div><div class="warning">運動・体調データの送信内容を確認してください。医療診断の代替にはなりません。</div></section>`}
function bindCoach(){document.getElementById('copyPrompt').onclick=async()=>{try{await navigator.clipboard.writeText(prompt());alert('コピーしました。ChatGPTに貼り付けてください')}catch{const t=document.createElement('textarea');t.value=prompt();document.body.appendChild(t);t.select();document.execCommand('copy');t.remove();alert('コピーしました')}};document.getElementById('openChat').onclick=()=>window.open('https://chatgpt.com/','_blank','noopener')}
window.SkiFitCloud={onPersist,sync,settingsHTML,bindSettings,coachHTML,bindCoach};authCallback();window.addEventListener('online',()=>sync().catch(()=>{}));document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync().catch(()=>{})});if(config.session&&config.auto)setTimeout(()=>sync().catch(()=>{}),400);
})();
