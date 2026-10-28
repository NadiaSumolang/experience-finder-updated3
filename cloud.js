import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const configured = /^https:\/\/[a-zA-Z0-9-]+\.supabase\.co$/.test(SUPABASE_URL) &&
  SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes('PASTE_');
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;
let session = null;
let authMode = 'login';
let currentCommentStory = null;
const PENDING_KEY='ef_pending'; // disimpan di sessionStorage agar tetap ada setelah redirect Google OAuth
const setPending=obj=>{try{sessionStorage.setItem(PENDING_KEY,JSON.stringify(obj));}catch{}};
const $c = id => document.getElementById(id);
const escapeHtml = value => { const d=document.createElement('div'); d.textContent=value ?? ''; return d.innerHTML; };
const showToastSafe = msg => window.showToast ? window.showToast(msg) : alert(msg);

function authMessage(message, error=false){ const el=$c('authMessage'); if(!el)return; el.textContent=message; el.classList.toggle('error',error); }
function setMode(mode){ authMode=mode; const signup=mode==='signup'; $c('authTitle').textContent=signup?'Buat ruang ceritamu.':'Senang bertemu kamu.'; $c('authSubtitle').textContent=signup?'Buat akun untuk membaca cerita lengkap, menyimpan pengalaman, dan berbagi cerita.':'Masuk untuk membaca cerita lengkap, menyimpan pengalaman, dan ikut berdiskusi.'; $c('authSubmit').textContent=signup?'Buat akun':'Masuk'; $c('authNameLabel').classList.toggle('hidden',!signup); $c('authName').required=signup; $c('authSwitchText').textContent=signup?'Sudah punya akun?':'Belum punya akun?'; $c('authSwitchButton').textContent=signup?'Masuk':'Daftar'; $c('forgotPasswordButton').classList.toggle('hidden',signup); authMessage(''); }
function openAuth(){ $c('profileMenu')?.classList.add('hidden'); $c('authModal').classList.remove('hidden'); setMode(authMode); if(!configured) authMessage('Konfigurasi Supabase belum diisi. Ikuti PETUNJUK-PENGATURAN.txt di dalam ZIP.',true); }
function closeAuth(){ $c('authModal')?.classList.add('hidden'); try{sessionStorage.removeItem(PENDING_KEY);}catch{} }
function toggleAuthMode(){ setMode(authMode==='login'?'signup':'login'); }
function toggleProfile(){ $c('profileMenu').classList.toggle('hidden'); }
function setUser(user){
  session=user ? {user} : null;
  $c('accountButton').classList.toggle('hidden',!!user);
  $c('profileButton').classList.toggle('hidden',!user);
  $c('profileMenu').classList.add('hidden');
  if(user){
    const name=user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Pengguna';
    $c('profileInitial').textContent=name.trim().charAt(0).toUpperCase();
    $c('profileName').textContent=name;
    $c('profileEmail').textContent=user.email||'';
    let pending=null; try{pending=JSON.parse(sessionStorage.getItem(PENDING_KEY)||'null');}catch{}
    closeAuth();
    if(pending){
      if(pending.type==='read' && typeof window.openDetail==='function') window.openDetail(pending.id);
      else if(pending.type==='share' && typeof window.showShare==='function') window.showShare();
    }
  } else if($c('sharePage') && !$c('sharePage').classList.contains('hidden')) {
    window.showHome?.(); // keluar dari akun saat di halaman buat cerita -> kembali ke beranda
  }
}
async function signInGoogle(){
  if(!configured){openAuth();return;}
  authMessage('Menghubungkan ke Google…');
  const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.href.split('#')[0]}});
  if(error)authMessage(error.message,true);
}
async function signOut(){ if(!supabase){setUser(null);return;} const {error}=await supabase.auth.signOut(); if(error)showToastSafe(error.message); else {setUser(null);showToastSafe('Kamu sudah keluar dari akun.');} }
async function submitAuth(event){
  event.preventDefault();
  if(!configured){authMessage('Supabase belum dikonfigurasi. Buka PETUNJUK-PENGATURAN.txt dan ikuti langkahnya.',true);return;}
  const email=$c('authEmail').value.trim(), password=$c('authPassword').value;
  const submit=$c('authSubmit'); submit.disabled=true; authMessage(authMode==='signup'?'Membuat akun…':'Memeriksa akun…');
  try{
    if(authMode==='signup'){
      const name=$c('authName').value.trim();
      const {data,error}=await supabase.auth.signUp({email,password,options:{data:{full_name:name},emailRedirectTo:window.location.href.split('#')[0]}});
      if(error)throw error;
      if(data.session){setUser(data.user);authMessage('Akun berhasil dibuat.');}else authMessage('Akun dibuat. Periksa email untuk konfirmasi, lalu masuk kembali.');
    }else{
      const {data,error}=await supabase.auth.signInWithPassword({email,password}); if(error)throw error; setUser(data.user); showToastSafe('Berhasil masuk. Selamat datang kembali!');
    }
  }catch(error){authMessage(error.message||'Terjadi kesalahan. Coba lagi.',true);}finally{submit.disabled=false;}
}
async function resetPassword(){
  if(!configured){authMessage('Konfigurasi Supabase belum diisi.',true);return;}
  const email=$c('authEmail').value.trim(); if(!email){authMessage('Isi email terlebih dahulu, lalu pilih lupa kata sandi.',true);return;}
  const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.href.split('#')[0]});
  authMessage(error?error.message:'Jika email terdaftar, tautan pemulihan akan dikirim ke email tersebut.',!!error);
}
async function loadCloudStories(){
  if(!configured)return;
  const {data,error}=await supabase.from('stories').select('*').order('created_at',{ascending:false}).limit(100);
  if(error){console.warn('Tidak dapat memuat cerita cloud:',error.message);return;}
  if(!data?.length)return;
  const local=window.experiences;
  if(!Array.isArray(local))return;
  data.forEach(row=>{
    const id=Number(row.story_key);
    if(!Number.isFinite(id)||local.some(x=>String(x.id)===String(id)))return;
    local.unshift({id,cloud:true,category:row.category,situation:row.situation,title:row.title,author:row.author_name||'Pengguna Experience Finder',role:'Pengguna',summary:row.happened,happened:row.happened,did:row.did,unexpected:row.unexpected||'',lesson:row.lesson,repeat:row.repeat||'',helpful:0,keywords:(`${row.category} ${row.situation}`).toLowerCase().split(/\s+/)});
  });
  window.renderCloudStories?.();
}
async function publishStory(item){
  if(!configured)return {ok:false,reason:'not-configured'};
  if(!session?.user)return {ok:false,reason:'login'};
  const payload={story_key:String(item.id),author_id:session.user.id,author_name:session.user.user_metadata?.full_name||session.user.user_metadata?.name||session.user.email?.split('@')[0]||'Pengguna',category:item.category,situation:item.situation,title:item.title,happened:item.happened,did:item.did,unexpected:item.unexpected||'',lesson:item.lesson,repeat:item.repeat||''};
  const {error}=await supabase.from('stories').insert(payload);
  if(error)return {ok:false,reason:error.message};
  return {ok:true};
}
function renderCommunity(storyId){
  const target=$c('detailContent'); if(!target)return;
  target.querySelector('.community-panel')?.remove();
  currentCommentStory=String(storyId);
  const panel=document.createElement('section'); panel.className='community-panel'; panel.innerHTML=`<h2>Obrolan cerita</h2><p class="community-intro">Punya pertanyaan atau pernah mengalami hal serupa? Mulai percakapan dengan tetap saling menghargai.</p><form class="comment-form" id="cloudCommentForm"><textarea id="cloudCommentInput" maxlength="1200" placeholder="Tulis komentar atau pertanyaanmu…" aria-label="Komentar atau pertanyaan"></textarea><button type="submit">Kirim komentar ↗</button></form><div id="cloudCommentList" class="comment-list"><div class="comment-empty">Memuat percakapan…</div></div>`;
  target.querySelector('.full-story')?.append(panel);
  const form=$c('cloudCommentForm'); form.addEventListener('submit',async e=>{e.preventDefault();await postComment(currentCommentStory);});
  loadComments(currentCommentStory);
}
async function loadComments(storyKey){
  const list=$c('cloudCommentList'); if(!list)return;
  if(!configured){list.innerHTML='<div class="comment-empty">Komentar online akan aktif setelah konfigurasi Supabase selesai. Untuk demo lokal, cerita contoh tetap bisa dibaca.</div>';return;}
  const {data,error}=await supabase.from('comments').select('id,story_key,author_id,author_name,body,created_at').eq('story_key',String(storyKey)).order('created_at',{ascending:true}).limit(100);
  if(error){list.innerHTML='<div class="comment-empty">Belum dapat memuat komentar. Pastikan SQL database sudah dijalankan.</div>';console.warn(error.message);return;}
  if(!data?.length){list.innerHTML='<div class="comment-empty">Belum ada komentar. Jadilah orang pertama yang memulai percakapan.</div>';return;}
  list.innerHTML=data.map(c=>`<article class="comment-item"><div class="comment-top"><span class="comment-avatar">${escapeHtml((c.author_name||'P').trim().charAt(0).toUpperCase())}</span><span class="comment-author"><strong>${escapeHtml(c.author_name||'Pengguna')}</strong><small>${new Date(c.created_at).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'})}</small></span></div><p class="comment-text">${escapeHtml(c.body)}</p>${session?.user?.id===c.author_id?`<button class="comment-delete" type="button" data-delete-comment="${c.id}">Hapus komentarku</button>`:''}</article>`).join('');
  list.querySelectorAll('[data-delete-comment]').forEach(btn=>btn.addEventListener('click',async()=>{const {error}=await supabase.from('comments').delete().eq('id',btn.dataset.deleteComment).eq('author_id',session.user.id);if(error)showToastSafe(error.message);else loadComments(storyKey);}));
}
async function postComment(storyKey){
  if(!configured){openAuth();authMessage('Komentar online memerlukan konfigurasi Supabase.',true);return;}
  if(!session?.user){openAuth();authMessage('Masuk terlebih dahulu untuk berkomentar.');return;}
  const input=$c('cloudCommentInput'), body=input?.value.trim(); if(!body)return;
  const button=$c('cloudCommentForm')?.querySelector('button'); if(button)button.disabled=true;
  const author_name=session.user.user_metadata?.full_name||session.user.user_metadata?.name||session.user.email?.split('@')[0]||'Pengguna';
  const {error}=await supabase.from('comments').insert({story_key:String(storyKey),author_id:session.user.id,author_name,body});
  if(button)button.disabled=false;
  if(error){showToastSafe('Komentar belum terkirim: '+error.message);return;}
  input.value='';await loadComments(storyKey);showToastSafe('Komentar berhasil dikirim.');
}
function requireLoginForRead(storyId){
  if(session?.user) return true;
  openAuth();
  setPending({type:'read',id:storyId});
  if(!configured){
    authMessage('Login belum aktif karena konfigurasi Supabase belum lengkap. Ikuti PETUNJUK-PENGATURAN.txt.',true);
  }else{
    authMessage('Masuk atau daftar dulu untuk membaca cerita lengkap. Setelah berhasil, kamu akan kembali ke cerita ini.');
  }
  return false;
}
function requireLoginForShare(){
  if(configured && session?.user) return true;
  openAuth();
  setPending({type:'share'});
  if(!configured) authMessage('Login belum aktif karena konfigurasi Supabase belum lengkap. Ikuti PETUNJUK-PENGATURAN.txt.',true);
  else authMessage('Masuk atau daftar dulu untuk membuat cerita. Setelah berhasil, kamu langsung diarahkan ke formulir cerita.');
  return false;
}

window.EFCloud={isConfigured:()=>configured,openAuth,closeAuth,toggleAuthMode,toggleProfile,signInGoogle,signOut,resetPassword,requireLoginForRead,requireLoginForShare,publishStory,renderCommunity,getUser:()=>session?.user||null};
$c('authForm')?.addEventListener('submit',submitAuth);
setMode('login');
if(!configured){$c('accountButton').title='Perlu konfigurasi Supabase untuk login sungguhan';}
if(supabase){
  supabase.auth.getSession().then(({data})=>{setUser(data.session?.user||null);loadCloudStories();});
  supabase.auth.onAuthStateChange((_event,newSession)=>{setUser(newSession?.user||null);if(newSession?.user)loadCloudStories();});
}
// Observe the existing story detail renderer without coupling the main UI code to Supabase.
const detailObserver=new MutationObserver(()=>{const detail=$c('detailContent');const heading=detail?.querySelector('.story-header h1');if(heading&&detail.querySelector('.full-story')&&!detail.querySelector('.community-panel')){const id=window.getCurrentStoryId?.();if(id!==null&&id!==undefined)renderCommunity(id);}});
const detailNode=$c('detailContent');if(detailNode)detailObserver.observe(detailNode,{childList:true,subtree:true});
