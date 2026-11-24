/** A small player page served at /web so any browser on the same Wi-Fi can watch shared folders without installing anything. */
export const WEB_PLAYER = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OnePlay</title>
<style>
:root{color-scheme:dark light}body{margin:0;font:16px system-ui,sans-serif;background:#111;color:#f2f2f2}
header{padding:14px 16px;font-weight:600;display:flex;gap:10px;align-items:center}main{padding:0 16px 24px;max-width:900px;margin:auto}
input,button{font:inherit;padding:10px 12px;border-radius:10px;border:1px solid #444;background:#1c1c1e;color:inherit}button{cursor:pointer}
.row{display:flex;gap:8px;margin:8px 0}.row input{flex:1}.item{display:block;width:100%;text-align:left;margin:6px 0}
video{width:100%;max-height:70vh;background:#000;border-radius:12px}small{opacity:.7}.err{color:#ff6b6b}
</style></head><body>
<header>OnePlay <small id="host"></small></header><main id="app"></main>
<script>
const $=document.getElementById('app');let token=localStorage.getItem('oneplay.web.token')||'';
const api=async(p,o={})=>{const r=await fetch(p+(p.includes('?')?'&':'?')+'t='+encodeURIComponent(token),o);if(r.status===401){token='';localStorage.removeItem('oneplay.web.token');pairView();throw new Error('Not paired');}if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||r.status);return r.json();};
const el=(h)=>{const d=document.createElement('div');d.innerHTML=h;return d};
function pairView(msg){$.replaceChildren(el('<p>Enter the 6-digit code shown in OnePlay on the computer (Wi-Fi button).</p><div class="row"><input id="c" inputmode="numeric" maxlength="6" placeholder="Pairing code"><button id="go">Connect</button></div><p class="err" id="e"></p>'));
if(msg)document.getElementById('e').textContent=msg;
document.getElementById('go').onclick=async()=>{try{const r=await fetch('/api/pair',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:document.getElementById('c').value.trim()})});const j=await r.json();if(!r.ok)throw new Error(j.error||'Failed');token=j.token;localStorage.setItem('oneplay.web.token',token);library();}catch(e){document.getElementById('e').textContent=e.message;}};}
async function library(){try{const l=await api('/api/library');const w=el('<div></div>');
if(!l.folders.length)w.innerHTML='<p>No folders are shared yet. Add one in OnePlay on the computer.</p>';
for(const f of l.folders){const b=document.createElement('button');b.className='item';b.textContent=f.name+'  ('+f.items.length+')';b.onclick=()=>folder(f);w.appendChild(b);}
$.replaceChildren(w);}catch(e){if(token)$.textContent=e.message;}}
function folder(f){const w=el('<div><button id="back">← Folders</button><h3></h3><div id="v"></div></div>');w.querySelector('h3').textContent=f.name;w.querySelector('#back').onclick=library;
for(const it of f.items){const b=document.createElement('button');b.className='item';b.textContent=it.name;b.onclick=()=>play(it,w);w.appendChild(b);}$.replaceChildren(w);}
function play(it,w){const v=w.querySelector('#v');const audio=/\\.(mp3|flac|wav|aac|ogg|opus|m4a)$/i.test(it.name);const m=document.createElement(audio?'audio':'video');m.controls=true;m.autoplay=true;m.style.width='100%';m.src='/file/'+it.id+'?t='+encodeURIComponent(token);
const note=document.createElement('small');note.textContent='If it will not play, this browser may not support the format. MP4 (H.264) works everywhere.';m.onerror=()=>{note.className='err';};v.replaceChildren(m,note);v.scrollIntoView();}
document.getElementById('host').textContent=location.host;token?library():pairView();
</script></body></html>`;
