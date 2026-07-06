const $ = id => document.getElementById(id);
const out = $('out');
const show = (type,msg) => { out.className='out show '+type; out.textContent=msg; };
const api = (token,method) => `https://api.telegram.org/bot${encodeURIComponent(token)}/${method}`;

/* ---------- Tema terang/gelap ---------- */
const THEME_KEY='tgb_theme';
function applyTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  $('theme').textContent = t==='dark' ? '🌙' : '☀️';
}
applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
$('theme').addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme')==='dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next); applyTheme(next);
});

/* ---------- Jam realtime (HH:MM:SS) ---------- */
(function startClock(){
  const el=$('clockTime');
  // Selalu pakai waktu Jakarta (WIB) apa pun zona waktu perangkat
  const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jakarta',hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});
  function tick(){ el.textContent=fmt.format(new Date()); }
  tick(); setInterval(tick, 1000);
})();

/* ---------- Simpan token & chat ID ---------- */
const SAVE_KEY='tgb_creds';
(function restore(){
  try{
    const s = JSON.parse(localStorage.getItem(SAVE_KEY)||'null');
    if(s){ $('token').value=s.token||''; $('chat').value=s.chat||''; $('remember').checked=true; }
  }catch(e){}
})();
function persistCreds(){
  if($('remember').checked){
    localStorage.setItem(SAVE_KEY, JSON.stringify({token:$('token').value.trim(), chat:$('chat').value.trim()}));
  }else{
    localStorage.removeItem(SAVE_KEY);
  }
}
$('remember').addEventListener('change', persistCreds);
$('token').addEventListener('input', () => { persistCreds(); renderGroups(); renderContacts(); });
$('chat').addEventListener('input', persistCreds);

/* ---------- Sembunyikan/Perlihatkan token ---------- */
// Default: token terlihat (bukan password). Tombol mata menutupinya jadi titik.
$('toggleToken').addEventListener('click', () => {
  const inp=$('token'), btn=$('toggleToken');
  const hidden = inp.type==='password';
  inp.type = hidden ? 'text' : 'password';
  btn.textContent = hidden ? '🙈' : '👁';
  btn.setAttribute('aria-label', hidden ? 'Sembunyikan token' : 'Perlihatkan token');
});

/* ---------- Toggle tipe & label ---------- */
const FILE_LABELS={photo:'Pilih Foto', document:'Pilih Dokumen', video:'Pilih Video'};
const FILE_ACCEPT={photo:'image/*', document:'', video:'video/*'};
function refreshType(){
  const t=$('type').value, isFile=t!=='text';
  $('urlWrap').classList.toggle('hidden', !isFile);
  if(isFile){ $('urlLabel').textContent=FILE_LABELS[t]; $('file').setAttribute('accept', FILE_ACCEPT[t]); }
  $('textLabel').textContent = isFile ? 'Caption (opsional)' : 'Pesan';
  $('text').placeholder = isFile ? 'Caption (boleh kosong)...' : 'Tulis pesan di sini...';
  updateCounter();
}
$('type').addEventListener('change', refreshType);

/* ---------- Char counter (limit Telegram) ---------- */
function updateCounter(){
  const limit = $('type').value==='text' ? 4096 : 1024;
  const len = $('text').value.length;
  const c=$('counter'); c.textContent = `${len} / ${limit}`;
  c.classList.toggle('over', len>limit);
}
$('text').addEventListener('input', updateCounter);

/* ---------- Cek Bot (getMe) ---------- */
$('check').addEventListener('click', async () => {
  const token = $('token').value.trim();
  if(!token){ return show('err','Isi bot token dulu.'); }
  const btn = $('check'); btn.disabled = true; btn.textContent = '...';
  try{
    const data = await (await fetch(api(token,'getMe'))).json();
    if(data.ok){
      const b = data.result;
      $('botAv').textContent = (b.first_name||'B').charAt(0).toUpperCase();
      $('botName').textContent = b.first_name || 'Bot';
      $('botUser').textContent = '@'+b.username+' · id '+b.id;
      $('botcard').classList.add('show');
      show('ok','✅ Token valid. Mengambil grup & pengguna...');
      // Setelah token valid, langsung tarik daftar chat → grup & pengguna otomatis tampil (mode silent)
      fetchChats({silent:true});
    }else{
      $('botcard').classList.remove('show');
      show('err',`❌ Token tidak valid (${data.error_code}): ${data.description}`);
    }
  }catch(e){ show('err','❌ Error jaringan: '+e.message); }
  finally{ btn.disabled=false; btn.textContent='Cek Bot'; }
});

/* ---------- Ambil daftar chat (getUpdates) ---------- */
// Tombol darurat: hapus webhook lalu ulang Ambil Chat (dibuat dinamis, di bawah kotak status)
function showWebhookFix(token){
  let fix = document.getElementById('whFix');
  if(!fix){
    fix = document.createElement('button');
    fix.id='whFix'; fix.className='ghost'; fix.style.marginTop='10px';
    out.after(fix);
  }
  fix.textContent='🧹 Hapus Webhook & Ambil Chat Lagi';
  fix.classList.remove('hidden');
  fix.onclick = async () => {
    if(!confirm('Hapus webhook bot ini?\n\nKalau bot-mu memakai webhook untuk operasi normal (mis. backend produksi), pengiriman ke server itu akan BERHENTI sampai kamu set ulang webhook-nya. Lanjutkan?')) return;
    fix.disabled=true; const t=fix.textContent; fix.textContent='Menghapus webhook...';
    try{
      // drop_pending_updates=false: pertahankan update tertahan supaya bisa dibaca getUpdates
      const d = await (await fetch(api(token,'deleteWebhook')+'?drop_pending_updates=false')).json();
      if(d.ok){ fix.classList.add('hidden'); $('loadChats').click(); }
      else show('err',`❌ Gagal hapus webhook (${d.error_code}): ${d.description}`);
    }catch(e){ show('err','❌ Error jaringan: '+e.message); }
    finally{ fix.disabled=false; fix.textContent=t; }
  };
}

// silent=true → dipanggil otomatis (mis. dari Cek Bot): tetap rekam & render grup/user,
// tapi jangan munculkan error berisik "update kosong" dan jangan timpa pesan sukses token.
async function fetchChats({silent=false}={}){
  const token = $('token').value.trim();
  if(!token){ if(!silent) show('err','Isi bot token dulu.'); return; }
  const btn=$('loadChats'); btn.disabled=true; btn.textContent='...';
  const whBtn=document.getElementById('whFix'); if(whBtn) whBtn.classList.add('hidden');
  try{
    // 1) Cek webhook dulu — kalau aktif, getUpdates PASTI tak terbaca (update diarahkan ke webhook).
    let wh=null;
    try{ wh = await (await fetch(api(token,'getWebhookInfo'))).json(); }catch(e){}
    if(wh && wh.ok && wh.result && wh.result.url){
      const pend = wh.result.pending_update_count ? `Ada ${wh.result.pending_update_count} update tertahan. ` : '';
      show('err', `⚠️ Webhook aktif → ${wh.result.url}\nSelama webhook aktif, Telegram mengarahkan semua update ke sana, bukan ke getUpdates, jadi daftar chat tak bisa dibaca dari sini. ${pend}Hapus webhook dulu untuk mengambil chat id.`);
      showWebhookFix(token);
      return;
    }
    // 2) Ambil hingga 100 update TERBARU secara non-destruktif (offset negatif tidak meng-confirm/menghapus),
    //    jadi tombol ini bisa diklik berkali-kali tanpa mengosongkan antrean update.
    const seen=new Map(); let total=0;
    const data = await (await fetch(api(token,'getUpdates')+'?limit=100&timeout=0&offset=-100')).json();
    if(!data.ok){
      if(data.error_code===409){ // webhook ternyata masih aktif
        show('err','⚠️ Webhook masih aktif. Hapus dulu untuk membaca chat.');
        showWebhookFix(token); return;
      }
      return show('err',`❌ getUpdates gagal (${data.error_code}): ${data.description}`);
    }
    for(const u of data.result){
      const msg = u.message||u.edited_message||u.channel_post||u.my_chat_member;
      const c = msg && msg.chat;
      if(!c) continue;
      // Rekam ke pelacak kumulatif (grup / pengguna) — best-effort dari update yang terlihat
      trackChat(c, msg.date, u.my_chat_member);
      const preview = msg.text || msg.caption ||
        (msg.photo?'📷 Foto':msg.document?'📄 Dokumen':msg.video?'🎬 Video':
         msg.voice?'🎤 Pesan suara':msg.sticker?'🎨 Stiker':msg.location?'📍 Lokasi':'pesan');
      // kumpulkan SEMUA pesan per chat (bukan cuma yang terakhir)
      let entry = seen.get(c.id);
      if(!entry){ entry = {chat:c, msgs:[]}; seen.set(c.id, entry); }
      entry.chat = c; // pakai info chat terbaru
      entry.msgs.push({text:preview, date:msg.date});
      total++;
    }
    renderGroups(); renderContacts();
    const list=$('picklist'); list.innerHTML='';
    if(seen.size===0){
      list.classList.remove('show');
      if(silent){
        // Dipanggil dari Cek Bot: jangan berisik. Tampilkan info ringkas + arahkan ke data tersimpan.
        const nG=Object.keys(loadStore(GROUP_KEY())).length, nU=Object.keys(loadStore(CONTACT_KEY())).length;
        show('ok', `✅ Token valid.\nBelum ada update baru. Menampilkan data tersimpan: ${nG} grup · ${nU} pengguna.\n(Grup/user baru muncul setelah ada pesan masuk — minta user kirim /start lalu klik "Ambil Chat".)`);
      }else{
        show('err',
          'Kotak update masih kosong. Penyebab umum:\n'+
          '• User belum pernah kirim pesan/ /start ke bot, ATAU\n'+
          '• Pesannya sudah kedaluwarsa (>24 jam) atau sudah terkonsumsi polling lain.\n'+
          'Solusi: minta user kirim /start atau pesan apa pun ke bot SEKARANG, lalu klik "Ambil Chat" lagi.\n'+
          'Alternatif: isi Chat ID manual. Untuk DM bot↔user, chat id = user id (cek via @userinfobot).');
      }
      return;
    }
    const fmtWhen = d => d ? new Date(d*1000).toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
    for(const e of seen.values()){
      const c=e.chat;
      const name = c.title || [c.first_name,c.last_name].filter(Boolean).join(' ') || c.username || 'Chat';
      const msgsHtml = e.msgs.map(m => {
        const when = fmtWhen(m.date);
        return `<small class="msgline">🗨️ ${esc(m.text)}${when?' <span class="msgtime">'+when+'</span>':''}</small>`;
      }).join('');
      const item=document.createElement('button');
      item.className='pickitem';
      item.innerHTML=`<div class="pa">${(name[0]||'?').toUpperCase()}</div>
        <div style="min-width:0">
          <b>${esc(name)} <span class="msgcount">${e.msgs.length} pesan</span></b>
          <small style="display:block">id ${c.id}${c.username?' · @'+esc(c.username):''} · ${c.type}</small>
          <div class="msgs">${msgsHtml}</div>
        </div>`;
      item.addEventListener('click', () => {
        $('chat').value = c.id; persistCreds();
        list.classList.remove('show');
        show('ok', `Chat dipilih: ${name} (${c.id})`);
      });
      list.appendChild(item);
    }
    list.classList.add('show');
    const nG=Object.keys(loadStore(GROUP_KEY())).length, nU=Object.keys(loadStore(CONTACT_KEY())).length;
    show('ok', `${silent?'✅ Token valid. ':''}Ditemukan ${seen.size} chat dari ${total} update — ${nG} grup · ${nU} pengguna terekam. Klik salah satu untuk memilih.`);
  }catch(e){ if(!silent) show('err','❌ Error jaringan: '+e.message); }
  finally{ btn.disabled=false; btn.textContent='Ambil Chat'; }
}
$('loadChats').addEventListener('click', () => fetchChats({silent:false}));

function esc(s){ return String(s).replace(/[&<>"]/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }

/* ---------- Bangun payload ---------- */
function buildRequest(){
  const type=$('type').value, mode=$('mode').value, chat=$('chat').value.trim();
  const text=$('text').value;
  const btnText=$('btnText').value.trim(), btnUrl=$('btnUrl').value.trim();
  const methods={text:'sendMessage', photo:'sendPhoto', document:'sendDocument', video:'sendVideo'};
  const fileKey={photo:'photo', document:'document', video:'video'};
  const method=methods[type];
  const markup = (btnText && btnUrl) ? {inline_keyboard:[[{text:btnText, url:btnUrl}]]} : null;
  if(type==='text'){
    const payload={chat_id:chat, text};
    if(mode) payload.parse_mode=mode;
    if(markup) payload.reply_markup=markup;
    return {method, json:payload};
  }
  return {method, chat, mode, text, markup, file:$('file').files[0], fileKey:fileKey[type]};
}
// Bangun opsi fetch baru tiap kirim (body FormData tidak bisa dipakai ulang)
function fetchOptions(req){
  if(req.json){
    return {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(req.json)};
  }
  const fd=new FormData();
  fd.append('chat_id', req.chat);
  fd.append(req.fileKey, req.file, req.file.name);
  if(req.text.trim()) fd.append('caption', req.text);
  if(req.mode) fd.append('parse_mode', req.mode);
  if(req.markup) fd.append('reply_markup', JSON.stringify(req.markup));
  return {method:'POST', body:fd};
}

/* ---------- Pratinjau ---------- */
$('previewBtn').addEventListener('click', () => {
  const p=$('preview'), b=$('bubble');
  if(p.classList.contains('show')){ p.classList.remove('show'); return; }
  const type=$('type').value, text=$('text').value, file=$('file').files[0];
  const btnText=$('btnText').value.trim(), btnUrl=$('btnUrl').value.trim();
  let html='';
  if(type==='photo' && file) html+=`<img src="${URL.createObjectURL(file)}" alt="foto" onerror="this.style.display='none'">`;
  if(type==='video' && file) html+=`<div class="file"><div class="fi">🎬</div><small>${esc(file.name)}</small></div>`;
  if(type==='document' && file) html+=`<div class="file"><div class="fi">📄</div><small>${esc(file.name)}</small></div>`;
  const body = text.trim() ? esc(text) : (type==='text' ? '<i style="opacity:.7">(pesan kosong)</i>' : '');
  html+=body;
  if(btnText && btnUrl) html+=`<div class="btns"><div class="ib">${esc(btnText)} ↗</div></div>`;
  b.innerHTML=html || '<i style="opacity:.7">(kosong)</i>';
  p.classList.add('show');
});

/* ---------- Riwayat ---------- */
const HIST_KEY='tgb_history';
const TYPE_ICON={text:'💬', photo:'🖼️', document:'📄', video:'🎬'};
function loadHist(){ try{ return JSON.parse(localStorage.getItem(HIST_KEY)||'[]'); }catch(e){ return []; } }
function saveHist(h){ localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(0,20))); }
function addHist(entry){ const h=loadHist(); h.unshift(entry); saveHist(h); renderHist(); }
function renderHist(){
  const h=loadHist(), el=$('histlist');
  if(h.length===0){ el.innerHTML='<div class="histempty">Belum ada pengiriman.</div>'; return; }
  el.innerHTML='';
  for(const e of h){
    const badgeCls = e.fail===0 ? 'ok' : (e.ok===0 ? 'err' : 'mix');
    const badge = e.fail===0 ? `${e.ok} ✓` : `${e.ok}✓ ${e.fail}✕`;
    const d=new Date(e.time);
    const when = d.toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    const div=document.createElement('div'); div.className='histitem';
    div.innerHTML=`<div class="hi">${TYPE_ICON[e.type]||'💬'}</div>
      <div class="ht"><b>${esc(e.chat)}</b><small>${e.count} pesan · ${when}</small></div>
      <span class="badge ${badgeCls}">${badge}</span>`;
    el.appendChild(div);
  }
}
$('clearHist').addEventListener('click', () => { localStorage.removeItem(HIST_KEY); renderHist(); });
renderHist();

/* ---------- Pelacak grup & pengguna (kumulatif, best-effort) ---------- */
// Bot API tak menyediakan daftar grup/pengguna penuh. Kita akumulasi sendiri dari
// setiap chat yang terlihat di getUpdates + event my_chat_member (bot ditambah/dikeluarkan).
// Kunci penyimpanan dipisah PER-BOT (berdasarkan id token, bagian sebelum ':'),
// jadi daftar grup/pengguna yang tampil hanya milik token yang sedang diisi.
const GROUP_PREFIX='tgb_groups', CONTACT_PREFIX='tgb_contacts';
const botId = () => ($('token').value.trim().split(':')[0] || '_none');
const GROUP_KEY = () => `${GROUP_PREFIX}_${botId()}`;
const CONTACT_KEY = () => `${CONTACT_PREFIX}_${botId()}`;
const GROUP_TYPES=new Set(['group','supergroup','channel']);
const loadStore = k => { try{ return JSON.parse(localStorage.getItem(k)||'{}'); }catch(e){ return {}; } };
const saveStore = (k,o) => localStorage.setItem(k, JSON.stringify(o));
function chatName(c){
  return c.title || [c.first_name,c.last_name].filter(Boolean).join(' ') || c.username || 'Tanpa nama';
}
// Catat satu chat yang terlihat. `mcm` = objek my_chat_member kalau update ini soal status bot.
function trackChat(c, date, mcm){
  const when = (date||0)*1000;
  if(GROUP_TYPES.has(c.type)){
    const g=loadStore(GROUP_KEY());
    const prev=g[c.id]||{firstSeen:when||undefined};
    // Status keanggotaan bot dari my_chat_member (kalau ada), kalau tidak anggap masih member
    let member=prev.member!==false;
    if(mcm && mcm.new_chat_member){
      const st=mcm.new_chat_member.status;
      member = !(st==='left' || st==='kicked');
    }
    g[c.id]={
      id:c.id, name:chatName(c), type:c.type,
      username:c.username||'', member,
      firstSeen:prev.firstSeen||when||undefined,
      lastSeen:Math.max(prev.lastSeen||0, when||0)||undefined,
    };
    saveStore(GROUP_KEY(),g);
  }else if(c.type==='private'){
    const u=loadStore(CONTACT_KEY());
    const prev=u[c.id]||{count:0, firstSeen:when||undefined};
    u[c.id]={
      id:c.id, name:chatName(c), username:c.username||'',
      count:(prev.count||0)+1,
      firstSeen:prev.firstSeen||when||undefined,
      lastSeen:Math.max(prev.lastSeen||0, when||0)||undefined,
    };
    saveStore(CONTACT_KEY(),u);
  }
}
const fmtDate = ms => ms ? new Date(ms).toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
const byLastSeen = (a,b) => (b.lastSeen||0)-(a.lastSeen||0);
const GTYPE_ICON={group:'👥', supergroup:'👥', channel:'📢'};

function renderGroups(){
  const g=Object.values(loadStore(GROUP_KEY())).sort(byLastSeen), el=$('grouplist');
  if(g.length===0){ el.innerHTML='<div class="histempty">Belum ada grup terekam.</div>'; return; }
  el.innerHTML='';
  for(const e of g){
    const badgeCls=e.member?'ok':'gone', badge=e.member?'anggota':'keluar';
    const div=document.createElement('div'); div.className='histitem';
    div.innerHTML=`<div class="hi">${GTYPE_ICON[e.type]||'👥'}</div>
      <div class="ht"><b>${esc(e.name)}</b><small>id ${e.id}${e.username?' · @'+esc(e.username):''} · ${e.type} · terlihat ${fmtDate(e.lastSeen)}</small></div>
      <span class="badge ${badgeCls}">${badge}</span>`;
    const pick=document.createElement('button'); pick.className='pick'; pick.textContent='Pilih';
    pick.addEventListener('click', () => { $('chat').value=e.id; persistCreds(); show('ok',`Target di-set ke grup: ${e.name} (${e.id})`); });
    div.appendChild(pick);
    el.appendChild(div);
  }
}
function renderContacts(){
  const u=Object.values(loadStore(CONTACT_KEY())).sort(byLastSeen), el=$('contactlist');
  if(u.length===0){ el.innerHTML='<div class="histempty">Belum ada pengguna terekam.</div>'; return; }
  el.innerHTML='';
  for(const e of u){
    const div=document.createElement('div'); div.className='histitem';
    div.innerHTML=`<div class="hi">👤</div>
      <div class="ht"><b>${esc(e.name)}</b><small>id ${e.id}${e.username?' · @'+esc(e.username):''} · ${e.count}× · terakhir ${fmtDate(e.lastSeen)}</small></div>`;
    const pick=document.createElement('button'); pick.className='pick'; pick.textContent='Pilih';
    pick.addEventListener('click', () => { $('chat').value=e.id; persistCreds(); show('ok',`Target di-set ke: ${e.name} (${e.id})`); });
    div.appendChild(pick);
    el.appendChild(div);
  }
}
$('clearGroups').addEventListener('click', () => { if(confirm('Hapus semua rekaman grup untuk token ini?')){ localStorage.removeItem(GROUP_KEY()); renderGroups(); } });
$('clearContacts').addEventListener('click', () => { if(confirm('Hapus semua rekaman pengguna untuk token ini?')){ localStorage.removeItem(CONTACT_KEY()); renderContacts(); } });
renderGroups(); renderContacts();

/* ---------- Kirim ---------- */
// State pengiriman + jeda yang bisa diinterupsi (agar Stop responsif walau jeda panjang)
let sending=false, stopFlag=false, wakeSleep=null;
function interruptibleSleep(ms){
  return new Promise(resolve=>{
    if(stopFlag) return resolve();
    const t=setTimeout(()=>{ wakeSleep=null; resolve(); }, ms);
    wakeSleep=()=>{ clearTimeout(t); wakeSleep=null; resolve(); }; // dipanggil Stop
  });
}
function fmtDur(ms){
  const s=Math.round(ms/1000);
  if(s<60) return s+' dtk';
  const m=Math.floor(s/60), ss=s%60;
  if(m<60) return m+'m'+(ss?' '+ss+'d':'');
  const h=Math.floor(m/60), mm=m%60;
  return h+'j'+(mm?' '+mm+'m':'');
}

// Mode aktif: 'count' (jumlah pesan) atau 'hours' (durasi jam)
function currentMode(){ return $('modeHours').classList.contains('active') ? 'hours' : 'count'; }
const MIN_HOURS_DELAY=250; // jeda minimal di mode durasi agar aman dari rate limit
const MODE_DELAY={count:250, hours:1000}; // default jeda per mode (ms): Jumlah 0,25 dtk · Durasi 1 dtk
function readDelay(){ let d=parseInt($('delay').value,10); return (!Number.isFinite(d)||d<0)?0:d; }

function setMode(m){
  const prev=currentMode();
  $('modeCount').classList.toggle('active', m==='count');
  $('modeHours').classList.toggle('active', m==='hours');
  // Ganti ke default jeda mode tujuan, tapi hormati nilai yang sudah diubah manual
  const d=readDelay();
  if(d===0 || d===MODE_DELAY[prev]) $('delay').value=MODE_DELAY[m];
  else if(m==='hours' && d<MIN_HOURS_DELAY) $('delay').value=MODE_DELAY.hours;
  updateModeUI();
}
$('modeCount').addEventListener('click', () => setMode('count'));
$('modeHours').addEventListener('click', () => setMode('hours'));

// Tampilkan field & hint sesuai mode
function updateModeUI(){
  const mode=currentMode();
  $('countWrap').classList.toggle('hidden', mode!=='count');
  $('hoursWrap').classList.toggle('hidden', mode!=='hours');
  const hint=$('sendHint'), d=readDelay();
  if(mode==='hours'){
    const hours=parseInt($('hours').value,10)||1;
    if(d>=MIN_HOURS_DELAY){
      const est=Math.floor(hours*3600*1000/d)+1;
      hint.textContent=`Mode Durasi: kirim tiap ${fmtDur(d)} selama ${hours} jam → ~${est} pesan. Berhenti saat durasi habis / Stop. 💾 Aman di-refresh (teks & file) — lanjut otomatis.`;
    }else{
      hint.textContent=`Mode Durasi: isi "Jeda (ms)" minimal ${MIN_HOURS_DELAY} (mis. 1000 = tiap 1 detik). Bot mengirim berulang selama durasi dipilih.`;
    }
  }else{
    hint.textContent='Mode Jumlah: kirim tepat sejumlah pesan, dengan jeda antar pesan supaya tidak kena rate limit.';
  }
}
$('hours').addEventListener('change', updateModeUI);
$('count').addEventListener('input', updateModeUI);
$('delay').addEventListener('input', updateModeUI);

$('stop').addEventListener('click', () => {
  if(!sending) return;
  stopFlag=true;
  $('stop').disabled=true; $('stop').textContent='Menghentikan...';
  if(wakeSleep) wakeSleep(); // bangunkan jeda yang sedang berjalan → berhenti seketika
});

/* ---------- Job durasi persisten (tahan refresh) ---------- */
// Disimpan di localStorage tiap pesan, lalu otomatis dilanjutkan saat halaman dimuat lagi.
// Hanya tipe Teks yang bisa dilanjutkan (objek File tak bisa disimpan).
const JOB_KEY='tgb_dur_job';
const saveJob = j => localStorage.setItem(JOB_KEY, JSON.stringify(j));
const loadJob = () => { try{ return JSON.parse(localStorage.getItem(JOB_KEY)||'null'); }catch(e){ return null; } };
const clearJob = () => localStorage.removeItem(JOB_KEY);

// File job durasi disimpan di IndexedDB (localStorage tak bisa menyimpan File/Blob).
function idbOpen(){
  return new Promise((res,rej)=>{
    const r=indexedDB.open('tgb_files',1);
    r.onupgradeneeded=()=>r.result.createObjectStore('f');
    r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);
  });
}
async function idbPut(key,val){ const db=await idbOpen(); return new Promise((res,rej)=>{const t=db.transaction('f','readwrite'); t.objectStore('f').put(val,key); t.oncomplete=()=>res(); t.onerror=()=>rej(t.error);}); }
async function idbGet(key){ const db=await idbOpen(); return new Promise((res,rej)=>{const t=db.transaction('f','readonly'); const q=t.objectStore('f').get(key); q.onsuccess=()=>res(q.result); q.onerror=()=>rej(q.error);}); }
async function idbDel(key){ const db=await idbOpen(); return new Promise((res)=>{const t=db.transaction('f','readwrite'); t.objectStore('f').delete(key); t.oncomplete=()=>res(); t.onerror=()=>res();}); }

// Jalankan/ lanjutkan job durasi sampai endTime tercapai atau Stop.
// req: {method, json} untuk teks, atau {method, chat, file, ...} untuk file (tak persist).
async function runDurationJob(job, req){
  const btn=$('send'), stopBtn=$('stop');
  sending=true; stopFlag=false;
  btn.disabled=true;
  stopBtn.classList.remove('hidden'); stopBtn.disabled=false; stopBtn.textContent='⏹ Stop';
  const timeLeft = () => job.endTime - Date.now();

  while(true){
    if(stopFlag) break;
    if(timeLeft()<=0) break;
    job.sent=(job.sent||0)+1;
    btn.textContent=`Mengirim ${job.sent}...`;
    show('ok', `Mode Durasi ${job.hours} jam — pesan ke-${job.sent}...\n✅ Sukses: ${job.ok}   ❌ Gagal: ${job.fail}\n⏳ Sisa waktu ~${fmtDur(Math.max(0,timeLeft()))}${job.persist?'\n💾 Aman di-refresh — akan lanjut otomatis.':''}`);
    try{
      const data = await (await fetch(api(job.token,req.method), fetchOptions(req))).json();
      if(data.ok){ job.ok++; } else { job.fail++; job.lastErr=`(${data.error_code}) ${data.description}`; }
    }catch(e){ job.fail++; job.lastErr='jaringan: '+e.message; }
    if(job.persist) saveJob(job);
    if(stopFlag) break;
    const wait=Math.min(job.delay, timeLeft());
    if(wait<=0) break;
    await interruptibleSleep(wait);
  }

  const stopped=stopFlag, attempted=job.ok+job.fail;
  const resType = fail0(job) ? 'ok' : (job.ok===0 ? 'err' : 'ok');
  let msg = stopped
    ? `Dihentikan — ${attempted} pesan diproses (durasi ${job.hours} jam).\n✅ Terkirim: ${job.ok}   ❌ Gagal: ${job.fail}`
    : `Selesai — ${attempted} pesan (durasi ${job.hours} jam).\n✅ Terkirim: ${job.ok}   ❌ Gagal: ${job.fail}`;
  if(job.fail>0) msg+=`\nError terakhir: ${job.lastErr}`;
  show(stopped ? 'err' : resType, (stopped?'⏹ ':(job.fail===0?'✅ ':'⚠️ '))+msg);

  if(job.persist){ clearJob(); if(job.hasFile) idbDel('dur'); }
  sending=false; stopFlag=false; wakeSleep=null;
  stopBtn.classList.add('hidden'); btn.disabled=false; btn.textContent='Kirim Pesan';
  if(attempted>0) addHist({time:Date.now(), type:job.type, chat:job.chat, count:attempted, ok:job.ok, fail:job.fail});
}
const fail0 = j => j.fail===0;

$('send').addEventListener('click', async () => {
  if(sending) return;
  const token=$('token').value.trim(), chat=$('chat').value.trim();
  const type=$('type').value, file=$('file').files[0], text=$('text').value;
  const mode=currentMode();
  const delay=readDelay();

  if(!token){ return show('err','Bot token belum diisi.'); }
  if(!chat){  return show('err','Chat ID belum diisi.'); }
  if(type!=='text' && !file){ return show('err','File belum dipilih.'); }
  if(type==='text' && !text.trim()){ return show('err','Pesan masih kosong.'); }

  const req = buildRequest();

  /* ----- Mode Durasi (jam): jalankan sebagai job persisten ----- */
  if(mode==='hours'){
    if(delay<MIN_HOURS_DELAY){
      return show('err',`Mode Durasi butuh "Jeda (ms)" minimal ${MIN_HOURS_DELAY} (mis. 1000 = tiap 1 detik) supaya tidak kena flood limit Telegram.`);
    }
    const hours=parseInt($('hours').value,10)||1;
    const now=Date.now();
    const isText = type==='text' && !!req.json;
    const job={
      token, chat, type, hours, delay, method:req.method,
      json: isText ? req.json : null,
      hasFile: !isText,
      fileMeta: isText ? null : {fileKey:req.fileKey, text:req.text||'', mode:req.mode, markup:req.markup},
      startTime:now, endTime:now+hours*3600*1000,
      ok:0, fail:0, sent:0, lastErr:'', persist:true
    };
    try{
      if(job.hasFile) await idbPut('dur', req.file); // simpan file agar bisa lanjut setelah refresh
      saveJob(job);
    }catch(e){
      job.persist=false; // mis. file terlalu besar / kuota penuh → jalan tanpa resume
      show('ok','⚠️ File tak bisa disimpan untuk resume (mungkin terlalu besar) — pengiriman tetap jalan, tapi jangan refresh/tutup tab.');
    }
    await runDurationJob(job, req);
    return;
  }

  /* ----- Mode Jumlah: kirim tepat N pesan ----- */
  let count=parseInt($('count').value,10);
  if(!Number.isFinite(count) || count<1) count=1;
  const btn=$('send'), stopBtn=$('stop');
  sending=true; stopFlag=false;
  btn.disabled=true;
  stopBtn.classList.remove('hidden'); stopBtn.disabled=false; stopBtn.textContent='⏹ Stop';
  let ok=0, fail=0, lastErr='';

  for(let i=1;i<=count;i++){
    if(stopFlag) break;
    btn.textContent=`Mengirim ${i}/${count}...`;
    let prog=`Mengirim pesan ${i} dari ${count}...\n✅ Sukses: ${ok}   ❌ Gagal: ${fail}`;
    if(delay>0 && i<count) prog+=`\n⏱ Jeda ${fmtDur(delay)} · sisa ~${fmtDur(delay*(count-i))}`;
    show('ok', prog);
    try{
      const data = await (await fetch(api(token,req.method), fetchOptions(req))).json();
      if(data.ok){ ok++; } else { fail++; lastErr=`(${data.error_code}) ${data.description}`; }
    }catch(e){ fail++; lastErr='jaringan: '+e.message; }
    if(stopFlag) break;
    if(i<count) await interruptibleSleep(delay);
  }

  const stopped=stopFlag, attempted=ok+fail;
  const resType = fail===0 ? 'ok' : (ok===0 ? 'err' : 'ok');
  let msg = stopped
    ? `Dihentikan — ${attempted} dari ${count} pesan diproses.\n✅ Terkirim: ${ok}   ❌ Gagal: ${fail}`
    : `Selesai — total ${count} pesan.\n✅ Terkirim: ${ok}   ❌ Gagal: ${fail}`;
  if(fail>0) msg+=`\nError terakhir: ${lastErr}`;
  show(stopped ? 'err' : resType, (stopped?'⏹ ':(fail===0?'✅ ':'⚠️ '))+msg);

  sending=false; stopFlag=false; wakeSleep=null;
  stopBtn.classList.add('hidden'); btn.disabled=false; btn.textContent='Kirim Pesan';
  if(attempted>0) addHist({time:Date.now(), type, chat, count:attempted, ok, fail});
});

/* ---------- Lanjutkan job durasi setelah refresh / buka ulang ---------- */
(async function resumeDurationJob(){
  const job=loadJob();
  if(!job){ return; }
  const now=Date.now();
  if(now>=job.endTime){
    // Durasi sudah habis saat tab tertutup → laporkan hasil terakhir lalu bersihkan
    const attempted=(job.ok||0)+(job.fail||0);
    if(attempted>0) addHist({time:now, type:job.type, chat:job.chat, count:attempted, ok:job.ok, fail:job.fail});
    show('ok', `⏹ Sesi durasi sebelumnya sudah berakhir.\n✅ Terkirim: ${job.ok||0}   ❌ Gagal: ${job.fail||0}`);
    clearJob(); if(job.hasFile) await idbDel('dur'); return;
  }
  // Rekonstruksi request: teks dari json, file dari IndexedDB
  let req;
  if(job.json){
    req={method:job.method, json:job.json};
  }else if(job.hasFile){
    const file=await idbGet('dur');
    if(!file){ clearJob(); show('err','⚠️ Sesi durasi (file) tak bisa dilanjutkan — file tidak tersimpan.'); return; }
    const fm=job.fileMeta||{};
    req={method:job.method, chat:job.chat, fileKey:fm.fileKey, text:fm.text||'', mode:fm.mode, markup:fm.markup, file};
  }else{ clearJob(); return; }
  // Pulihkan tampilan form lalu lanjutkan otomatis
  $('token').value=job.token||''; $('chat').value=job.chat||'';
  $('hours').value=job.hours||1; if(job.type){ $('type').value=job.type; refreshType(); }
  setMode('hours'); $('delay').value=job.delay; updateModeUI();
  show('ok', `▶️ Melanjutkan pengiriman durasi (sisa ~${fmtDur(job.endTime-now)}). Terkirim sejauh ini: ${job.ok||0}✓ ${job.fail||0}✕`);
  runDurationJob(job, req);
})();

/* ---------- Tab / 2 laman ---------- */
function switchView(v){
  const send = v==='send';
  $('pageSend').classList.toggle('hidden', !send);
  $('pageJoin').classList.toggle('hidden', send);
  $('tabSend').classList.toggle('active', send);
  $('tabJoin').classList.toggle('active', !send);
  // Masuk tab Buka Grup → bawa token terbaru dari tab Kirim
  if(!send && $('token').value.trim()) $('jToken').value=$('token').value.trim();
}
$('tabSend').addEventListener('click', () => switchView('send'));
$('tabJoin').addEventListener('click', () => switchView('join'));

/* ---------- Buka Grup via ID ---------- */
const jout=$('jOut');
const jshow=(type,msg) => { jout.className='out show '+type; jout.textContent=msg; };
// Prefill token dari creds tersimpan
(function(){ try{ const s=JSON.parse(localStorage.getItem(SAVE_KEY)||'null'); if(s&&s.token) $('jToken').value=s.token; }catch(e){} })();

// id supergroup/channel privat: -100XXXXXXXXXX → id internal = XXXXXXXXXX (buang -100)
function internalId(id){ const m=String(id).trim().match(/^-100(\d+)$/); return m?m[1]:null; }

function jRenderLinks({name,type,memberInfo,links}){
  const res=$('jResult'); res.innerHTML='';
  if(name!==null && name!==undefined){
    const info=document.createElement('div'); info.className='ginfo';
    info.innerHTML=`<div class="pa">${esc((name[0]||'?').toUpperCase())}</div>
      <div style="min-width:0"><b>${esc(name)}</b><br>
      <span>${type?esc(type):'grup'}${memberInfo?' · '+esc(memberInfo):''}</span></div>`;
    res.appendChild(info);
  }
  for(const l of links){
    const row=document.createElement('div'); row.className='linkrow';
    row.innerHTML=`<div class="lk"><small>${esc(l.label)}</small><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.url)}</a></div>`;
    const act=document.createElement('div'); act.className='act';
    const copy=document.createElement('button'); copy.className='iconbtn'; copy.textContent='Salin';
    copy.addEventListener('click', async () => { try{ await navigator.clipboard.writeText(l.url); copy.textContent='Tersalin ✓'; setTimeout(()=>copy.textContent='Salin',1400);}catch(e){ copy.textContent='Gagal'; }});
    const goA=document.createElement('a'); goA.className='iconbtn go'; goA.textContent='Buka'; goA.href=l.url; goA.target='_blank'; goA.rel='noopener';
    act.appendChild(copy); act.appendChild(goA); row.appendChild(act); res.appendChild(row);
  }
  res.classList.add('show');
}

async function jBuildLink(){
  const raw=$('jChat').value.trim(), token=$('jToken').value.trim();
  $('jResult').classList.remove('show');
  if(!raw){ return jshow('err','Isi chat id atau @username dulu.'); }
  // @username / username publik → link publik (siapa pun bisa buka & join)
  const uname=raw.replace(/^@/,'');
  if(/^[a-zA-Z][\w]{3,}$/.test(uname) && !/^-?\d+$/.test(raw)){
    jshow('ok','✅ Link publik dibuat.');
    jRenderLinks({name:'@'+uname, type:'publik', links:[{label:'Link publik (bisa join)', url:'https://t.me/'+uname}]});
    return;
  }
  const btn=$('jGo'); btn.disabled=true; btn.textContent='...';
  try{
    const internal=internalId(raw), links=[];
    if(token){
      let data=null;
      try{ data=await (await fetch(api(token,'getChat')+'?chat_id='+encodeURIComponent(raw))).json(); }catch(e){}
      if(data && data.ok){
        const c=data.result;
        const name=c.title || [c.first_name,c.last_name].filter(Boolean).join(' ') || c.username || 'Grup';
        if(c.username) links.push({label:'Link publik (bisa join)', url:'https://t.me/'+c.username});
        if(c.invite_link) links.push({label:'Link undangan resmi (bisa join)', url:c.invite_link});
        if(internal) links.push({label:'Link grup (t.me)', url:'https://t.me/'+internal});
        if(links.length===0){ jshow('err','Grup ditemukan tapi tanpa username/invite link, dan id bukan -100… jadi tak ada link yang bisa dibuat.'); return; }
        jshow('ok','✅ Info grup diambil via bot.');
        jRenderLinks({name, type:c.type, memberInfo:'id '+c.id, links}); return;
      }
      if(data && !data.ok){
        if(!internal){ jshow('err',`getChat gagal (${data.error_code}): ${data.description}\nDan id bukan -100…. Pastikan bot sudah jadi anggota grup, atau pakai @username.`); return; }
        jshow('ok',`⚠️ getChat gagal (${data.error_code}) — bot mungkin belum jadi anggota. Link t.me dibuat langsung dari id.`);
        jRenderLinks({name:null, links:[{label:'Link grup (t.me)', url:'https://t.me/'+internal}]}); return;
      }
    }
    // Tanpa token → hanya bisa buat link t.me dari format -100…
    if(!internal){ jshow('err','Tanpa token, id harus format -100… (supergroup/channel) atau pakai @username. Untuk grup privat, isi Bot Token agar bisa ambil link undangan.'); return; }
    jshow('ok','✅ Link t.me dibuat dari id.');
    jRenderLinks({name:null, links:[{label:'Link grup (t.me)', url:'https://t.me/'+internal}]});
  }catch(e){ jshow('err','❌ Error: '+e.message); }
  finally{ btn.disabled=false; btn.textContent='Buat Link'; }
}
$('jGo').addEventListener('click', jBuildLink);
$('jChat').addEventListener('keydown', e => { if(e.key==='Enter') jBuildLink(); });

/* init */
refreshType();
updateModeUI();
