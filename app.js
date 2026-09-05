import { supabase } from './supabase-client.js';
import { esc, timeAgo, timeLeft, ICONS } from './helpers.js';
// Catatan: tab "Chat" saat ini tampilan saja (belum ada tabel/backend pesan di Supabase).
// Dipakai untuk mulai obrolan dari daftar teman mutual; kirim pesan sungguhan
// butuh tabel `messages` + realtime, belum dibuat.

const root = document.getElementById('instants-root');

let state = {
  booting: true,
  user: null,
  profile: null,
  authMode: 'signin',
  authError: '',
  authLoading: false,
  tab: 'beranda', // beranda | kamera | profil
  stream: null,
  capturedImage: null,
  caption: '',
  facing: 'user',
  flashOn: false,
  flashing: false,
  posting: false,
  feed: [],
  friends: [],
  pendingOut: [],
  followers: [],
  following: [],
  pengikutBaru: [],
  myInstants: [],
  searchQuery: '',
  searchResult: null,
  searchError: '',
  searching: false,
  profilView: 'main', // main | pengikut | diikuti
  viewerInstant: null,
  storyQueue: [],
  storyIndex: 0,
  toast: '',
  shielded: false,
  cameraError: '',
};

function setState(patch) {
  Object.assign(state, patch);
  render();
}

function showToast(msg) {
  setState({ toast: msg });
  setTimeout(() => setState({ toast: '' }), 2200);
}

// ---------------- INIT ----------------
async function init() {
  render(); // tampilkan loading segera
  try {
    const { data } = await supabase.auth.getUser();
    if (data && data.user) {
      state.user = data.user;
      await loadProfile();
    }
    state.booting = false;
    render();
    setupPrivacyShield();
    if (state.user) startPolling();
  } catch (e) {
    root.innerHTML = `<div class="center-loading" style="flex-direction:column;gap:8px;padding:24px;text-align:center">
      <div>Gagal memuat aplikasi</div>
      <div style="font-size:11px;color:var(--danger)">${esc(e.message || String(e))}</div>
    </div>`;
  }
}

function setupPrivacyShield() {
  document.addEventListener('visibilitychange', () => {
    setState({ shielded: document.hidden && !!state.viewerInstant });
  });
  window.addEventListener('blur', () => {
    if (state.viewerInstant) setState({ shielded: true });
  });
  window.addEventListener('focus', () => {
    if (state.shielded) setState({ shielded: false });
  });
  document.addEventListener('contextmenu', (e) => {
    if (root.contains(e.target)) e.preventDefault();
  });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'PrintScreen') || (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key))) {
      setState({ shielded: true });
      setTimeout(() => setState({ shielded: false }), 1200);
    }
  });
}

let pollHandle = null;
function startPolling() {
  if (pollHandle) clearInterval(pollHandle);
  loadFeed();
  loadFriends();
  loadMyInstants();
  pollHandle = setInterval(() => loadFeed(), 15000);
}

// ---------------- AUTH ----------------
async function loadProfile() {
  const { data } = await supabase.from('profiles').select('*').eq('id', state.user.id).maybeSingle();
  state.profile = data;
}

async function handleAuthSubmit(username, email, password) {
  setState({ authLoading: true, authError: '' });
  try {
    if (state.authMode === 'signup') {
      if (!username || username.length < 3) throw new Error('Username minimal 3 karakter');
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { data: { username: username.toLowerCase(), display_name: username } }
      });
      if (error) throw error;
      if (!data.session) {
        // Proyek ini mewajibkan konfirmasi email sebelum sesi dibuat.
        setState({
          authLoading: false,
          authMode: 'signin',
          authError: 'Akun dibuat. Cek email kamu untuk konfirmasi, lalu masuk di sini.',
        });
        return;
      }
      state.user = data.user;
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      state.user = data.user;
    }
    await loadProfile();
    setState({ authLoading: false, tab: 'beranda' });
    startPolling();
  } catch (e) {
    setState({ authLoading: false, authError: e.message || 'Terjadi kesalahan' });
  }
}

async function handleSignOut() {
  if (pollHandle) clearInterval(pollHandle);
  stopCamera();
  await supabase.auth.signOut();
  setState({ user: null, profile: null, feed: [], friends: [], followers: [], following: [], searchResult: null, searchQuery: '', profilView: 'main', tab: 'beranda' });
}

// ---------------- FRIENDS ----------------
async function loadFriends() {
  const uid = state.user.id;
  const [{ data: followingRows, error: followingErr }, { data: followerRows, error: followerErr }] = await Promise.all([
    supabase.from('follows').select('followee_id, profiles!follows_followee_id_fkey(username, display_name)').eq('follower_id', uid),
    supabase.from('follows').select('follower_id, profiles!follows_follower_id_fkey(username, display_name)').eq('followee_id', uid),
  ]);
  if (followingErr || followerErr) {
    showToast((followingErr || followerErr).message);
    return;
  }
  const following = (followingRows || []).map(f => ({ id: f.followee_id, username: f.profiles?.username, display_name: f.profiles?.display_name }));
  const followers = (followerRows || []).map(f => ({ id: f.follower_id, username: f.profiles?.username, display_name: f.profiles?.display_name }));
  const followingIds = new Set(following.map(f => f.id));
  const followerIds = new Set(followers.map(f => f.id));

  const friends = following.filter(f => followerIds.has(f.id));       // saling follow -> teman
  const pendingOut = following.filter(f => !followerIds.has(f.id));    // saya follow, belum follow balik
  const pengikutBaru = followers.filter(f => !followingIds.has(f.id)); // follow saya, belum saya follow balik

  setState({ friends, pendingOut, followers, following, pengikutBaru });
}

// Status relasi saya terhadap user lain: 'teman' | 'mengikuti' | 'pengikut' | 'none'
function relationOf(targetId) {
  const isFollowing = state.following.some(f => f.id === targetId);
  const isFollower = state.followers.some(f => f.id === targetId);
  if (isFollowing && isFollower) return 'teman';
  if (isFollowing) return 'mengikuti';
  if (isFollower) return 'pengikut';
  return 'none';
}

async function handleFollow(targetId) {
  const { error } = await supabase.from('follows').insert({ follower_id: state.user.id, followee_id: targetId });
  if (error && !error.message.includes('duplicate')) {
    showToast(error.message);
    return;
  }
  const wasFollower = state.followers.some(f => f.id === targetId);
  showToast(wasFollower ? 'Sekarang jadi teman mutual!' : 'Diikuti');
  await loadFriends();
  refreshSearchResult();
}

async function handleUnfollow(targetId) {
  const { error } = await supabase.from('follows').delete().eq('follower_id', state.user.id).eq('followee_id', targetId);
  if (error) {
    showToast(error.message);
    return;
  }
  showToast('Berhenti mengikuti');
  await loadFriends();
  refreshSearchResult();
}

async function handleRemoveFollower(targetId) {
  const { error } = await supabase.from('follows').delete().eq('follower_id', targetId).eq('followee_id', state.user.id);
  if (error) {
    showToast(error.message);
    return;
  }
  showToast('Pengikut dihapus');
  await loadFriends();
  refreshSearchResult();
}

// Sinkronkan tombol relasi di hasil pencarian setelah follow/unfollow/hapus
function refreshSearchResult() {
  if (state.searchResult) setState({ searchResult: { ...state.searchResult } });
}

async function handleSearchUser() {
  const uname = state.searchQuery.trim().toLowerCase();
  if (!uname) return;
  if (state.profile && uname === state.profile.username) {
    setState({ searchError: 'Itu username kamu sendiri', searchResult: null });
    return;
  }
  setState({ searching: true, searchError: '', searchResult: null });
  const { data: target, error: findErr } = await supabase.from('profiles').select('id, username, display_name').eq('username', uname).maybeSingle();
  if (findErr || !target) {
    setState({ searching: false, searchError: 'Username tidak ditemukan' });
    return;
  }
  setState({ searching: false, searchError: '', searchResult: target });
}


// ---------------- CAMERA ----------------
let cameraStarting = false;
async function startCamera() {
  if (cameraStarting || state.stream) return;
  cameraStarting = true;
  stopCamera();
  state.cameraError = '';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: state.facing }, audio: false });
    state.stream = stream;
    render();
    const video = document.getElementById('camera-video');
    if (video) { video.srcObject = stream; await video.play().catch(() => {}); }
  } catch (e) {
    setState({ cameraError: e.message || 'Tidak bisa akses kamera' });
  }
  cameraStarting = false;
}

async function flipCamera() {
  if (cameraStarting) return;
  const nextFacing = state.facing === 'user' ? 'environment' : 'user';
  stopCamera();
  setState({ facing: nextFacing, cameraError: '' });
  await startCamera();
}

function toggleFlash() {
  setState({ flashOn: !state.flashOn });
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
  }
}

// Rasio ini harus sama persis dengan CSS .camera-frame { aspect-ratio: 1 / 1.05 }
// supaya apa yang terlihat di preview = apa yang benar-benar tersimpan.
const CAPTURE_ASPECT = 1 / 1.05;

async function captureFrame() {
  const video = document.getElementById('camera-video');
  if (!video || !video.videoWidth) return;
  if (state.flashOn) {
    setState({ flashing: true });
    await new Promise(r => setTimeout(r, 160));
  }
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const sourceAspect = vw / vh;

  // Crop tengah video (meniru object-fit: cover) supaya rasio hasil
  // capture sama persis dengan rasio yang terlihat di preview.
  let cropW, cropH, sx, sy;
  if (sourceAspect > CAPTURE_ASPECT) {
    cropH = vh;
    cropW = cropH * CAPTURE_ASPECT;
    sx = (vw - cropW) / 2;
    sy = 0;
  } else {
    cropW = vw;
    cropH = cropW / CAPTURE_ASPECT;
    sx = 0;
    sy = (vh - cropH) / 2;
  }

  const canvas = document.createElement('canvas');
  const maxW = 720;
  const scale = Math.min(1, maxW / cropW);
  canvas.width = cropW * scale;
  canvas.height = cropH * scale;
  const ctx = canvas.getContext('2d');
  if (state.facing === 'user') {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.62);
  stopCamera();
  setState({ capturedImage: dataUrl, flashing: false });
}

function retake() {
  setState({ capturedImage: null });
  startCamera();
}

function exitCamera() {
  stopCamera();
  setState({ tab: 'beranda', capturedImage: null, caption: '', cameraError: '' });
  loadFeed();
}

async function handlePost() {
  if (state.posting) return;
  if (!state.capturedImage) return;
  setState({ posting: true });

  // Foto disimpan sebagai file di Supabase Storage (bucket privat
  // 'instant-photos'), bukan base64 di kolom database, biar hemat storage.
  const instantId = crypto.randomUUID();
  const path = `${state.user.id}/${instantId}.jpg`;
  const blob = await (await fetch(state.capturedImage)).blob();

  const { error: uploadError } = await supabase.storage
    .from('instant-photos')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false });

  if (uploadError) {
    setState({ posting: false });
    showToast('Gagal upload foto: ' + uploadError.message);
    return;
  }

  const { error } = await supabase.from('instants').insert({
    id: instantId,
    author_id: state.user.id,
    caption: state.caption.trim(),
    image_path: path,
  });
  setState({ posting: false });
  if (error) {
    // Insert row gagal: hapus lagi file yang sudah terlanjur ke-upload
    // supaya tidak jadi sampah storage yang tak terpakai.
    await supabase.storage.from('instant-photos').remove([path]);
    showToast('Gagal mengirim: ' + error.message);
    return;
  }
  setState({ capturedImage: null, caption: '', tab: 'beranda' });
  showToast('Instant terkirim! Hilang dalam 24 jam.');
  loadFeed();
  loadMyInstants();
}

// Ubah image_path (baris baru) jadi signed URL yang bisa dipakai di <img src>.
// Baris lama yang masih punya image_data (base64 legacy) dibiarkan apa adanya.
async function resolveImages(rows) {
  const toSign = rows.filter(r => r.image_path && !r.image_data);
  await Promise.all(toSign.map(async (r) => {
    const { data, error } = await supabase.storage
      .from('instant-photos')
      .createSignedUrl(r.image_path, 3600);
    if (!error && data) r.image_data = data.signedUrl;
  }));
  return rows;
}

// ---------------- FEED (Beranda) ----------------
async function loadFeed() {
  if (!state.profile) return;
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('instants')
    .select('id, caption, image_data, image_path, created_at, expires_at, author_id, profiles!instants_author_id_fkey(username, display_name)')
    .neq('author_id', state.user.id)
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false });
  if (error) return;
  const { data: viewedRows } = await supabase.from('instant_views').select('instant_id').eq('viewer_id', state.user.id);
  const viewedSet = new Set((viewedRows || []).map(v => v.instant_id));
  const feed = (data || []).map(row => ({ ...row, viewed: viewedSet.has(row.id) }));
  await resolveImages(feed);
  setState({ feed });
}

async function openStory(id, own) {
  const queue = own ? buildOwnStoryQueue() : buildFriendsStoryQueue();
  let idx = queue.findIndex(q => q.id === id);
  if (idx < 0) {
    if (!own) showToast('Instant ini sudah kamu lihat sebelumnya');
    return;
  }
  setState({ storyQueue: queue, storyIndex: idx, viewerInstant: queue[idx] });
  markStoryViewed(queue[idx]);
}

// ---------------- INSTANT MILIK SENDIRI (Profil) ----------------
async function loadMyInstants() {
  if (!state.user) return;
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('instants')
    .select('id, caption, image_data, image_path, created_at, expires_at')
    .eq('author_id', state.user.id)
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false });
  if (error) return;
  const ids = (data || []).map(d => d.id);
  let viewCounts = {};
  if (ids.length) {
    const { data: views } = await supabase.from('instant_views').select('instant_id').in('instant_id', ids);
    (views || []).forEach(v => { viewCounts[v.instant_id] = (viewCounts[v.instant_id] || 0) + 1; });
  }
  const myInstants = (data || []).map(d => ({ ...d, viewCount: viewCounts[d.id] || 0 }));
  await resolveImages(myInstants);
  setState({ myInstants });
}

// ---------------- STORY QUEUE (instan saya dan teman terpisah, tidak digabung) ----------------
function groupFeedByAuthor(items) {
  const map = new Map();
  const order = [];
  items.forEach(item => {
    const key = item.author_id;
    if (!map.has(key)) { map.set(key, []); order.push(key); }
    map.get(key).push(item);
  });
  return order.map(key => ({ authorId: key, items: map.get(key) }));
}

function buildOwnStoryQueue() {
  return state.myInstants.map(m => ({ ...m, own: true }));
}

function buildFriendsStoryQueue() {
  const unviewedGroups = groupFeedByAuthor(state.feed.filter(f => !f.viewed));
  return unviewedGroups.flatMap(g => g.items.map(f => ({ ...f, own: false })));
}

async function markStoryViewed(item) {
  if (!item || item.own || item.viewed) return;
  await supabase.from('instant_views').insert({ instant_id: item.id, viewer_id: state.user.id });
  loadFeed();
}

function storyNext() {
  const nextIndex = state.storyIndex + 1;
  if (nextIndex >= state.storyQueue.length) {
    closeViewer();
    showToast('Semua Instant sudah kamu lihat');
    return;
  }
  const item = state.storyQueue[nextIndex];
  setState({ storyIndex: nextIndex, viewerInstant: item, shielded: false });
  markStoryViewed(item);
}

function storyPrev() {
  if (!state.viewerInstant.own) {
    showToast('Instant cuma bisa dilihat sekali');
    return;
  }
  const prevIndex = state.storyIndex - 1;
  if (prevIndex < 0) return;
  setState({ storyIndex: prevIndex, viewerInstant: state.storyQueue[prevIndex], shielded: false });
}

function closeViewer() {
  setState({ viewerInstant: null, shielded: false, storyQueue: [], storyIndex: 0 });
}

async function sendReaction(kind, content) {
  if (!state.viewerInstant) return;
  await supabase.from('instant_reactions').insert({
    instant_id: state.viewerInstant.id,
    responder_id: state.user.id,
    kind, content
  });
  showToast(kind === 'emoji' ? 'Reaksi terkirim' : 'Balasan terkirim');
}

// ---------------- RENDER ----------------
function render() {
  if (state.booting) {
    root.innerHTML = `<div class="center-loading">MEMUAT&hellip;</div>`;
    return;
  }
  if (!state.user || !state.profile) {
    renderAuth();
    return;
  }
  renderApp();
  if (state.tab === 'kamera') {
    attachCameraHandlers();
  } else {
    attachAppHandlers();
  }
}

function renderAuth() {
  const isSignup = state.authMode === 'signup';
  root.innerHTML = `
    <div class="auth-screen">
      <div class="auth-hero">
        <span class="hud-label">&#9679; REC &middot; UNFILTERED</span>
        <h1>Instants,<br/>versi kamu.</h1>
        <p>Bagikan momen spontan ke teman dekat. Tanpa edit, sekali lihat, hilang dalam 24 jam.</p>
      </div>
      <div class="auth-field" ${isSignup ? '' : 'style="display:none"'}>
        <label>USERNAME</label>
        <input id="f-username" type="text" placeholder="cth: rara.p" autocomplete="off" />
      </div>
      <div class="auth-field">
        <label>EMAIL</label>
        <input id="f-email" type="email" placeholder="kamu@email.com" autocomplete="email" />
      </div>
      <div class="auth-field">
        <label>PASSWORD</label>
        <input id="f-password" type="password" placeholder="Minimal 6 karakter" autocomplete="current-password" />
      </div>
      ${state.authError ? `<div class="auth-error">${esc(state.authError)}</div>` : ''}
      <button class="btn btn-primary btn-full" id="auth-submit" ${state.authLoading ? 'disabled' : ''}>
        ${state.authLoading ? 'MEMPROSES...' : (isSignup ? 'Buat akun' : 'Masuk')}
      </button>
      <div class="auth-switch">
        ${isSignup ? 'Sudah punya akun?' : 'Belum punya akun?'}
        <button id="auth-toggle">${isSignup ? 'Masuk' : 'Daftar'}</button>
      </div>
    </div>
  `;
  document.getElementById('auth-toggle').onclick = () => setState({ authMode: isSignup ? 'signin' : 'signup', authError: '' });
  document.getElementById('auth-submit').onclick = () => {
    const username = document.getElementById('f-username') ? document.getElementById('f-username').value.trim() : '';
    const email = document.getElementById('f-email').value.trim();
    const password = document.getElementById('f-password').value;
    if (!email || !password) { setState({ authError: 'Isi email dan password' }); return; }
    handleAuthSubmit(username, email, password);
  };
}

function renderApp() {
  if (state.tab === 'kamera') {
    root.innerHTML = `
      ${renderKamera()}
      ${state.viewerInstant ? renderViewer() : ''}
    `;
    return;
  }
  const feedUnviewedCount = state.feed.filter(f => !f.viewed).length;
  root.innerHTML = `
    <div class="topbar"><div class="wordmark">instants<span>.</span></div></div>
    <div class="screen">
      ${state.tab === 'beranda' ? renderBeranda() : ''}
      ${state.tab === 'chat' ? renderChat() : ''}
      ${state.tab === 'cari' ? renderCari() : ''}
      ${state.tab === 'profil' ? renderProfil() : ''}
    </div>
    <div class="bottom-nav">
      <button class="nav-item ${state.tab === 'beranda' ? 'active' : ''}" data-tab="beranda">
        <span class="nav-icon-wrap">
          ${ICONS.home}
          ${feedUnviewedCount ? `<span class="nav-badge">${feedUnviewedCount}</span>` : ''}
        </span>
        <span>Beranda</span>
      </button>
      <button class="nav-item ${state.tab === 'chat' ? 'active' : ''}" data-tab="chat">
        <span class="nav-icon-wrap">${ICONS.chat}</span>
        <span>Chat</span>
      </button>
      <button class="nav-item ${state.tab === 'cari' ? 'active' : ''}" data-tab="cari">
        <span class="nav-icon-wrap">${ICONS.search}</span>
        <span>Cari</span>
      </button>
      <button class="nav-item ${state.tab === 'profil' ? 'active' : ''}" data-tab="profil">
        <span class="nav-icon-wrap">${ICONS.profile}</span>
        <span>Profil</span>
      </button>
    </div>
    ${state.tab === 'beranda' ? `<button class="fab-camera" data-tab="kamera" aria-label="Buat Instant baru">${ICONS.plus}</button>` : ''}
    ${state.viewerInstant ? renderViewer() : ''}
  `;
}

function renderKamera() {
  const frameInner = state.capturedImage
    ? `<img class="captured" src="${state.capturedImage}" />`
    : state.cameraError
      ? `<div class="camera-error">
           <span class="hud-label" style="color:var(--danger)">KAMERA TIDAK TERSEDIA</span>
           <span>${esc(state.cameraError)}</span>
           <button class="btn btn-primary" id="camera-retry-btn">Coba lagi</button>
         </div>`
      : state.stream
        ? `<video id="camera-video" class="${state.facing === 'user' ? 'mirror' : ''}" autoplay playsinline muted></video>`
        : `<div class="center-loading" style="height:100%">Menyiapkan kamera&hellip;</div>`;

  return `
    <div class="camera-immersive">
      <div class="camera-topbar">
        <button class="icon-btn" id="camera-close-btn">&times;</button>
        <span class="camera-title">${state.capturedImage ? 'Pratinjau' : 'Instan baru'}</span>
        <span style="width:36px"></span>
      </div>
      <div class="camera-stage">
        <div class="camera-frame">
          ${frameInner}
          ${state.flashing ? '<div class="camera-flash-overlay"></div>' : ''}
        </div>
      </div>
      ${state.capturedImage ? `
        <div class="caption-bar">
          <input id="caption-input" type="text" placeholder="Tulis caption (opsional)..." value="${esc(state.caption)}" maxlength="140" />
          <div class="hint">Opsional &middot; tidak bisa diedit lagi setelah dikirim</div>
        </div>
      ` : ''}
      <div class="capture-controls">
        ${state.capturedImage ? `
          <button class="btn" id="retake-btn">Ambil ulang</button>
          <button class="btn btn-primary" id="send-btn" ${state.posting ? 'disabled' : ''}>${state.posting ? 'Mengirim...' : 'Kirim'}</button>
        ` : `
          <button class="icon-btn ${state.flashOn ? 'active' : ''}" id="flash-toggle-btn" title="Flash layar">&#9889;</button>
          <button class="shutter-btn" id="shutter-btn" ${!state.stream ? 'disabled' : ''}></button>
          <button class="icon-btn" id="flip-camera-btn" title="Ganti kamera">&#8635;</button>
        `}
      </div>
    </div>
  `;
}

function renderBeranda() {
  const myBlock = `
    <span class="section-label">INSTAN SAYA</span>
    ${state.myInstants.length ? renderMyInstantsStack() : `<div class="feed-empty" style="padding:16px"><span class="hud-label">BELUM ADA INSTAN AKTIF</span>Instan yang kamu kirim akan muncul di sini sampai 24 jam.</div>`}
    <div class="feed-divider"><span>INSTAN TEMAN</span></div>
  `;
  const groups = groupFeedByAuthor(state.feed).filter(group => group.items.some(i => !i.viewed));
  if (!groups.length) {
    return `${myBlock}<div class="feed-empty"><span class="hud-label">FEED KOSONG</span>Belum ada Instant dari teman mutual kamu. Ajak mereka lewat tab Kontak.</div>`;
  }
  return `${myBlock}<div class="feed-grid">${groups.map(group => {
    const items = group.items; // terbaru duluan (mengikuti urutan feed)
    const top = items[0];
    const username = top.profiles?.username || 'user';
    const peekCount = Math.min(items.length - 1, 2);
    return `
      <div class="instant-card-deck" data-open-user="${group.authorId}">
        ${Array.from({ length: peekCount }).map((_, i) => `<div class="instant-card-peek" style="--i:${peekCount - i}"></div>`).join('')}
        <div class="instant-card unviewed">
          <div class="instant-card-photo"><img src="${top.image_data}" /></div>
          <div class="instant-card-scrim"></div>
          ${items.length > 1 ? `<span class="instant-card-count">${items.length} FOTO</span>` : ''}
          <span class="instant-card-badge">BARU</span><span class="instant-card-hint">KETUK&nbsp;UNTUK&nbsp;LIHAT</span>
          <div class="instant-card-info">
            <div class="who">@${esc(username)}</div>
            <div class="when">${timeLeft(top.expires_at)}</div>
          </div>
        </div>
      </div>
    `;
  }).join('')}</div>`;
}

// Tombol relasi gaya Instagram: Ikuti / Mengikuti / Teman, atau grup (Ikuti Balik + Hapus) untuk pengikut
function renderFollowBtn(targetId) {
  const rel = relationOf(targetId);
  if (rel === 'teman') {
    return `<button class="btn btn-friend btn-sm" data-unfollow="${targetId}">Teman</button>`;
  }
  if (rel === 'mengikuti') {
    return `<button class="btn btn-ghost btn-sm" data-unfollow="${targetId}">Mengikuti</button>`;
  }
  if (rel === 'pengikut') {
    return `
      <div class="follow-btn-group">
        <button class="btn btn-primary btn-sm" data-follow="${targetId}">Ikuti Balik</button>
        <button class="btn btn-ghost btn-sm" data-remove-follower="${targetId}">Hapus</button>
      </div>
    `;
  }
  return `<button class="btn btn-primary btn-sm" data-follow="${targetId}">Ikuti</button>`;
}

function renderProfil() {
  if (state.profilView === 'main') {
    return `
      <div class="profil-header">
        <div class="avatar-lg">${esc((state.profile.username || '?')[0].toUpperCase())}</div>
        <div class="profil-uname">@${esc(state.profile.username)}</div>
        <div class="profil-stats">
          <button class="profil-stat" data-profil-view="pengikut">
            <span class="num">${state.followers.length}</span><span class="label">Pengikut</span>
          </button>
          <button class="profil-stat" data-profil-view="diikuti">
            <span class="num">${state.following.length}</span><span class="label">Diikuti</span>
          </button>
        </div>
        <button class="btn btn-ghost" id="signout-btn">Keluar</button>
      </div>
    `;
  }

  const isPengikut = state.profilView === 'pengikut';
  const list = isPengikut ? state.followers : state.following;
  const title = isPengikut ? 'Pengikut' : 'Diikuti';
  const emptyMsg = isPengikut
    ? 'Belum ada yang mengikuti kamu. Bagikan username kamu supaya orang lain bisa follow.'
    : 'Kamu belum mengikuti siapa pun. Cari username di tab Cari untuk mulai follow.';

  return `
    <div class="profil-list-header">
      <button class="back-btn" data-profil-view="main">&larr;</button>
      <span class="section-label" style="padding:0">${title.toUpperCase()} (${list.length})</span>
    </div>
    ${list.length ? list.map(f => `
      <div class="friend-row">
        <div class="avatar">${esc((f.username || '?')[0].toUpperCase())}</div>
        <div class="uname">@${esc(f.username)}</div>
        ${renderFollowBtn(f.id)}
      </div>
    `).join('') : `<div class="feed-empty" style="padding:24px"><span class="hud-label">KOSONG</span>${emptyMsg}</div>`}
  `;
}

function renderCari() {
  const result = state.searchResult;
  return `
    <div class="profil-hint" style="padding:14px 16px 0">
      Cari username teman untuk mulai follow.
    </div>
    <div class="add-friend-bar">
      <input id="search-input" type="text" placeholder="Cari username" value="${esc(state.searchQuery)}" />
      <button class="btn btn-primary" id="search-btn" ${state.searching ? 'disabled' : ''}>${state.searching ? '...' : 'Cari'}</button>
    </div>
    ${state.searchError ? `<div class="auth-error" style="padding:0 16px 10px">${esc(state.searchError)}</div>` : ''}
    ${result ? `
      <span class="section-label">HASIL</span>
      <div class="friend-row">
        <div class="avatar">${esc((result.username || '?')[0].toUpperCase())}</div>
        <div class="uname">@${esc(result.username)}</div>
        ${renderFollowBtn(result.id)}
      </div>
    ` : ''}
  `;
}

// Placeholder: belum ada tabel/backend pesan di Supabase.
function renderChat() {
  return `<div class="feed-empty" style="padding:24px"><span class="hud-label">SEGERA HADIR</span>Fitur chat sedang dikembangkan.</div>`;
}

function renderMyInstantsStack() {
  const items = state.myInstants; // sudah terurut: terbaru duluan
  const top = items[0];
  const totalViews = items.reduce((sum, i) => sum + (i.viewCount || 0), 0);
  const peekCount = Math.min(items.length - 1, 2);
  return `
    <div class="mystack-hero-wrap" data-open-stack>
      <div class="mystack-hero-deck">
        ${Array.from({ length: peekCount }).map((_, i) => `<div class="mystack-hero-peek" style="--i:${peekCount - i}"></div>`).join('')}
        <div class="mystack-hero-frame">
          <img src="${top.image_data}" />
          <div class="instant-card-scrim"></div>
          ${items.length > 1 ? `<span class="mystack-hero-count">${items.length}</span>` : ''}
          <div class="mystack-hero-info">
            ${top.caption ? `<div class="cap">${esc(top.caption)}</div>` : ''}
            <div class="when">${timeLeft(top.expires_at)} &middot; dilihat ${totalViews} kali total</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderViewer() {
  const it = state.viewerInstant;
  const queue = state.storyQueue;
  const idx = state.storyIndex;
  const remaining = Math.max(0, queue.length - idx - 1);
  const peekCount = Math.min(remaining, 3);

  return `
    <div class="viewer-overlay">
      <div class="viewer-top">
        <span class="hud-label">${it.own ? 'Instant kamu' : '@' + esc(it.profiles ? it.profiles.username : state.profile.username)}</span>
        <button class="btn btn-ghost" id="close-viewer">Tutup &#10005;</button>
      </div>
      <div class="viewer-stage">
        <div class="viewer-square">
          ${Array.from({ length: peekCount }).map((_, i) => {
            const depth = i + 1;
            const peekItem = queue[idx + depth];
            const dir = depth % 2 === 0 ? -1 : 1;
            const rot = dir * (3 + depth * 2);
            const bg = peekItem ? peekItem.image_data : '';
            return `<div class="story-peek" style="--i:${depth}; --dir:${dir}; --rot:${rot}deg; background-image:url('${bg}')"></div>`;
          }).join('')}
          <div class="viewer-card">
            ${state.shielded ? `<div class="privacy-shield">KONTEN DISEMBUNYIKAN<br/>saat aplikasi tidak aktif</div>` : `
              <img class="viewer-card-fg" src="${it.image_data}" />
            `}
            <button class="story-tap story-tap-prev ${it.own ? '' : 'story-tap-disabled'}" id="story-prev" aria-label="Sebelumnya"></button>
            <button class="story-tap story-tap-next" id="story-next" aria-label="Selanjutnya"></button>
          </div>
        </div>
      </div>
      <div class="viewer-info">
        ${it.caption ? `<div class="viewer-caption">${esc(it.caption)}</div>` : ''}
        ${it.own
          ? `<div class="viewer-stats">Dilihat ${it.viewCount || 0} kali &middot; ${timeLeft(it.expires_at)}</div>`
          : `<div class="viewer-reactions">
               ${['❤️', '😂', '😮', '🔥', '👀'].map(e => `<button class="emoji-btn" data-emoji="${e}">${e}</button>`).join('')}
             </div>`}
      </div>
    </div>
  `;
}

function attachAppHandlers() {
  root.querySelectorAll('[data-tab]').forEach(el => {
    el.onclick = () => {
      const tab = el.getAttribute('data-tab');
      if (tab === 'kamera' && !state.capturedImage) {
        setState({ tab });
      } else {
        stopCamera();
        setState({ tab });
        if (tab === 'beranda') { loadFeed(); loadMyInstants(); }
        if (tab === 'cari') { setState({ searchQuery: '', searchResult: null, searchError: '' }); loadFriends(); }
        if (tab === 'profil') { setState({ profilView: 'main' }); loadFriends(); }
      }
    };
  });

  root.querySelectorAll('[data-open-user]').forEach(el => {
    el.onclick = () => {
      const authorId = el.getAttribute('data-open-user');
      const group = state.feed.filter(f => f.author_id === authorId);
      const firstUnviewed = group.find(f => !f.viewed);
      if (!firstUnviewed) {
        showToast('Instant ini sudah kamu lihat sebelumnya');
        return;
      }
      openStory(firstUnviewed.id, false);
    };
  });

  const stackEl = root.querySelector('[data-open-stack]');
  if (stackEl) stackEl.onclick = () => openStory(state.myInstants[0].id, true);

  const signoutBtn = document.getElementById('signout-btn');
  if (signoutBtn) signoutBtn.onclick = handleSignOut;

  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.oninput = (e) => { state.searchQuery = e.target.value; };
    searchInput.onkeydown = (e) => { if (e.key === 'Enter') handleSearchUser(); };
  }
  const searchBtn = document.getElementById('search-btn');
  if (searchBtn) searchBtn.onclick = handleSearchUser;

  root.querySelectorAll('[data-profil-view]').forEach(el => {
    el.onclick = () => setState({ profilView: el.getAttribute('data-profil-view') });
  });
  root.querySelectorAll('[data-follow]').forEach(el => {
    el.onclick = () => handleFollow(el.getAttribute('data-follow'));
  });
  root.querySelectorAll('[data-unfollow]').forEach(el => {
    el.onclick = () => handleUnfollow(el.getAttribute('data-unfollow'));
  });
  root.querySelectorAll('[data-remove-follower]').forEach(el => {
    el.onclick = () => handleRemoveFollower(el.getAttribute('data-remove-follower'));
  });

  attachViewerHandlers();
}

function attachCameraHandlers() {
  if (!state.stream && !state.capturedImage && !state.cameraError) {
    startCamera();
  }

  const closeBtn = document.getElementById('camera-close-btn');
  if (closeBtn) closeBtn.onclick = exitCamera;

  const cameraRetryBtn = document.getElementById('camera-retry-btn');
  if (cameraRetryBtn) cameraRetryBtn.onclick = () => { setState({ cameraError: '' }); startCamera(); };

  const shutterBtn = document.getElementById('shutter-btn');
  if (shutterBtn) shutterBtn.onclick = captureFrame;

  const flashBtn = document.getElementById('flash-toggle-btn');
  if (flashBtn) flashBtn.onclick = toggleFlash;

  const flipBtn = document.getElementById('flip-camera-btn');
  if (flipBtn) flipBtn.onclick = flipCamera;

  const captionInput = document.getElementById('caption-input');
  if (captionInput) {
    captionInput.oninput = (e) => { state.caption = e.target.value; };
    captionInput.focus();
  }

  const retakeBtn = document.getElementById('retake-btn');
  if (retakeBtn) retakeBtn.onclick = retake;
  const sendBtn = document.getElementById('send-btn');
  if (sendBtn) sendBtn.onclick = handlePost;

  attachViewerHandlers();
}

function attachViewerHandlers() {
  const closeBtn = document.getElementById('close-viewer');
  if (closeBtn) closeBtn.onclick = closeViewer;

  const prevBtn = document.getElementById('story-prev');
  if (prevBtn) prevBtn.onclick = storyPrev;
  const nextBtn = document.getElementById('story-next');
  if (nextBtn) nextBtn.onclick = storyNext;

  root.querySelectorAll('.emoji-btn').forEach(el => {
    el.onclick = () => sendReaction('emoji', el.getAttribute('data-emoji'));
  });
}

init();
