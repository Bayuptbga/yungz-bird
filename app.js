import { supabase } from './supabase-client.js';
import { esc, timeAgo, timeLeft, ICONS } from './helpers.js';

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
  audience: 'mutuals',
  facing: 'user',
  flashOn: false,
  flashing: false,
  audienceMenuOpen: false,
  posting: false,
  feed: [],
  friends: [],
  pendingOut: [],
  myInstants: [],
  addFriendInput: '',
  friendError: '',
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
  setState({ user: null, profile: null, feed: [], friends: [], tab: 'beranda' });
}

// ---------------- FRIENDS ----------------
async function loadFriends() {
  const uid = state.user.id;
  const { data: following } = await supabase.from('follows').select('followee_id, profiles!follows_followee_id_fkey(username, display_name)').eq('follower_id', uid);
  const { data: followers } = await supabase.from('follows').select('follower_id').eq('followee_id', uid);
  const followerIds = new Set((followers || []).map(f => f.follower_id));
  const mutuals = [];
  const pendingOut = [];
  (following || []).forEach(f => {
    const entry = { id: f.followee_id, username: f.profiles?.username, display_name: f.profiles?.display_name };
    if (followerIds.has(f.followee_id)) mutuals.push(entry);
    else pendingOut.push(entry);
  });
  setState({ friends: mutuals, pendingOut });
}

async function handleAddFriend() {
  const uname = state.addFriendInput.trim().toLowerCase();
  if (!uname) return;
  if (uname === state.profile.username) {
    setState({ friendError: 'Tidak bisa menambah diri sendiri' });
    return;
  }
  const { data: target, error: findErr } = await supabase.from('profiles').select('id, username').eq('username', uname).maybeSingle();
  if (findErr || !target) {
    setState({ friendError: 'Username tidak ditemukan' });
    return;
  }
  const { error } = await supabase.from('follows').insert({ follower_id: state.user.id, followee_id: target.id });
  if (error && !error.message.includes('duplicate')) {
    setState({ friendError: error.message });
    return;
  }
  setState({ addFriendInput: '', friendError: '' });
  showToast('Ditambahkan. Mutual jika mereka follow balik.');
  loadFriends();
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
  setState({ tab: 'beranda', capturedImage: null, caption: '', cameraError: '', audienceMenuOpen: false });
  loadFeed();
}

async function handlePost() {
  if (state.posting) return;
  if (!state.capturedImage) return;
  setState({ posting: true });
  const { error } = await supabase.from('instants').insert({
    author_id: state.user.id,
    caption: state.caption.trim(),
    image_data: state.capturedImage,
    audience: state.audience,
  });
  setState({ posting: false });
  if (error) {
    showToast('Gagal mengirim: ' + error.message);
    return;
  }
  setState({ capturedImage: null, caption: '', tab: 'beranda' });
  showToast('Instant terkirim! Hilang dalam 24 jam.');
  loadFeed();
  loadMyInstants();
}

// ---------------- FEED (Beranda) ----------------
async function loadFeed() {
  if (!state.profile) return;
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('instants')
    .select('id, caption, image_data, created_at, expires_at, audience, author_id, profiles!instants_author_id_fkey(username, display_name)')
    .neq('author_id', state.user.id)
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false });
  if (error) return;
  const { data: viewedRows } = await supabase.from('instant_views').select('instant_id').eq('viewer_id', state.user.id);
  const viewedSet = new Set((viewedRows || []).map(v => v.instant_id));
  const feed = (data || []).map(row => ({ ...row, viewed: viewedSet.has(row.id) }));
  setState({ feed });
}

async function openStory(id, own) {
  const queue = own ? buildOwnStoryQueue() : buildFriendsStoryQueue();
  let idx = queue.findIndex(q => q.id === id);
  if (idx < 0) return;
  setState({ storyQueue: queue, storyIndex: idx, viewerInstant: queue[idx] });
  markStoryViewed(queue[idx]);
}

// ---------------- INSTANT MILIK SENDIRI (Profil) ----------------
async function loadMyInstants() {
  if (!state.user) return;
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('instants')
    .select('id, caption, image_data, created_at, expires_at, audience')
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
  const groups = groupFeedByAuthor(state.feed);
  return groups.flatMap(g => g.items.map(f => ({ ...f, own: false })));
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
      ${state.toast ? `<div class="toast">${esc(state.toast)}</div>` : ''}
    `;
    return;
  }
  const feedUnviewedCount = state.feed.filter(f => !f.viewed).length;
  root.innerHTML = `
    <div class="topbar"><div class="wordmark">instants<span>.</span></div></div>
    <div class="screen">
      ${state.tab === 'beranda' ? renderBeranda() : ''}
      ${state.tab === 'profil' ? renderProfil() : ''}
    </div>
    <div class="bottom-nav">
      <button class="nav-item ${state.tab === 'beranda' ? 'active' : ''}" data-tab="beranda">
        ${feedUnviewedCount ? '<span class="dot"></span>' : ''}
        ${ICONS.home}
        <span>Beranda</span>
      </button>
      <button class="nav-item nav-item-camera" data-tab="kamera">
        ${ICONS.camera}
      </button>
      <button class="nav-item ${state.tab === 'profil' ? 'active' : ''}" data-tab="profil">
        ${ICONS.profile}
        <span>Profil</span>
      </button>
    </div>
    ${state.viewerInstant ? renderViewer() : ''}
    ${state.toast ? `<div class="toast">${esc(state.toast)}</div>` : ''}
  `;
}

function renderKamera() {
  const audienceLabel = state.audience === 'mutuals' ? 'Teman' : 'Teman Dekat';

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
      ` : `
        <div class="caption-bar">
          <div class="hint">Tanpa filter, tanpa edit &mdash; ambil apa adanya. Kamera tidak bisa upload dari galeri.</div>
        </div>
      `}
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
      ${!state.capturedImage ? `
        <div class="audience-select">
          <button class="audience-pill" id="audience-pill"><span class="pill-dot"></span>${esc(audienceLabel)}<span class="chev">&#8964;</span></button>
          ${state.audienceMenuOpen ? `
            <div class="audience-menu">
              <button data-aud="mutuals">Teman</button>
              <button data-aud="close_friends">Teman Dekat</button>
            </div>
          ` : ''}
        </div>
      ` : ''}
    </div>
  `;
}

function renderBeranda() {
  if (!state.feed.length) {
    return `<div class="feed-empty"><span class="hud-label">FEED KOSONG</span>Belum ada Instant dari teman mutual kamu. Ajak mereka lewat tab Profil.</div>`;
  }
  const groups = groupFeedByAuthor(state.feed);
  return groups.map(group => {
    const items = group.items; // terbaru duluan (mengikuti urutan feed)
    const top = items[0];
    const hasUnviewed = items.some(i => !i.viewed);
    const peekCount = Math.min(items.length - 1, 3);
    const username = top.profiles?.username || 'user';
    return `
      <div class="instant-stack ${hasUnviewed ? '' : 'viewed'}" data-open-user="${group.authorId}">
        <div class="mystack-deck">
          ${Array.from({ length: peekCount }).map((_, i) => `<div class="mystack-peek" style="--i:${peekCount - i}"></div>`).join('')}
          <img class="mystack-top" src="${top.image_data}" />
          ${items.length > 1 ? `<span class="mystack-count">${items.length}</span>` : ''}
        </div>
        <div class="meta">
          <div class="who">@${esc(username)}</div>
          <div class="when">${timeAgo(top.created_at)} lalu &middot; ${timeLeft(top.expires_at)}</div>
        </div>
        ${hasUnviewed ? '<span class="badge">BARU</span>' : ''}
      </div>
    `;
  }).join('');
}

function renderProfil() {
  return `
    <div class="profil-header">
      <div class="avatar-lg">${esc((state.profile.username || '?')[0].toUpperCase())}</div>
      <div class="profil-uname">@${esc(state.profile.username)}</div>
      <button class="btn btn-ghost" id="signout-btn">Keluar</button>
    </div>
    <span class="section-label">INSTANT AKTIF SAYA</span>
    ${state.myInstants.length ? renderMyInstantsStack() : `<div class="feed-empty" style="padding:20px"><span class="hud-label">BELUM ADA INSTANT AKTIF</span>Instant yang kamu kirim akan muncul di sini sampai 24 jam.</div>`}
    <div class="profil-hint" style="padding-top:14px">
      Bagikan username ini ke teman supaya mereka bisa follow balik dan jadi mutual.
    </div>
    <span class="section-label">TAMBAH TEMAN</span>
    <div class="add-friend-bar">
      <input id="add-friend-input" type="text" placeholder="Username teman" value="${esc(state.addFriendInput)}" />
      <button class="btn btn-primary" id="add-friend-btn">Tambah</button>
    </div>
    ${state.friendError ? `<div class="auth-error" style="padding:0 16px 10px">${esc(state.friendError)}</div>` : ''}
    <span class="section-label">TEMAN MUTUAL</span>
    ${state.friends.length ? state.friends.map(f => `
      <div class="friend-row">
        <div class="avatar">${esc((f.username || '?')[0].toUpperCase())}</div>
        <div class="uname">@${esc(f.username)}</div>
        <div class="status">MUTUAL</div>
      </div>
    `).join('') : `<div class="feed-empty" style="padding:24px"><span class="hud-label">BELUM ADA TEMAN</span>Tambahkan username teman untuk mulai berbagi Instant.</div>`}
    ${state.pendingOut.length ? `
      <span class="section-label">MENUNGGU FOLLOW BALIK</span>
      ${state.pendingOut.map(f => `
        <div class="friend-row">
          <div class="avatar">${esc((f.username || '?')[0].toUpperCase())}</div>
          <div class="uname">@${esc(f.username)}</div>
          <div class="status">PENDING</div>
        </div>
      `).join('')}
    ` : ''}
  `;
}

function renderMyInstantsStack() {
  const items = state.myInstants; // sudah terurut: terbaru duluan
  const top = items[0];
  const totalViews = items.reduce((sum, i) => sum + (i.viewCount || 0), 0);
  const peekCount = Math.min(items.length - 1, 3);
  return `
    <div class="mystack" data-open-stack>
      <div class="mystack-deck">
        ${Array.from({ length: peekCount }).map((_, i) => `<div class="mystack-peek" style="--i:${peekCount - i}"></div>`).join('')}
        <img class="mystack-top" src="${top.image_data}" />
        ${items.length > 1 ? `<span class="mystack-count">${items.length}</span>` : ''}
      </div>
      <div class="meta">
        ${top.caption ? `<div class="cap">${esc(top.caption)}</div>` : ''}
        <div class="when">${timeLeft(top.expires_at)} &middot; dilihat ${totalViews} kali total</div>
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
      <div class="story-progress">
        ${queue.map((_, i) => `<span class="story-seg ${i < idx ? 'done' : ''} ${i === idx ? 'current' : ''}"></span>`).join('')}
      </div>
      <div class="viewer-top">
        <span class="hud-label">${it.own ? 'Instant kamu' : '@' + esc(it.profiles ? it.profiles.username : state.profile.username)}</span>
        <button class="btn btn-ghost" id="close-viewer">Tutup &#10005;</button>
      </div>
      <div class="viewer-stage">
        ${Array.from({ length: peekCount }).map((_, i) => {
          const depth = i + 1;
          const peekItem = queue[idx + depth];
          const dir = depth % 2 === 0 ? -1 : 1;
          const rot = dir * (4 + depth * 3);
          const bg = peekItem ? peekItem.image_data : '';
          return `<div class="story-peek" style="--i:${depth}; --rot:${rot}deg; background-image:url('${bg}')"></div>`;
        }).join('')}
        <div class="viewer-card">
          ${state.shielded ? `<div class="privacy-shield">KONTEN DISEMBUNYIKAN<br/>saat aplikasi tidak aktif</div>` : `
            <div class="viewer-card-bg" style="background-image:url('${it.image_data}')"></div>
            <img class="viewer-card-fg" src="${it.image_data}" />
          `}
          <button class="story-tap story-tap-prev" id="story-prev" aria-label="Sebelumnya"></button>
          <button class="story-tap story-tap-next" id="story-next" aria-label="Selanjutnya"></button>
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
        if (tab === 'beranda') loadFeed();
        if (tab === 'profil') { loadFriends(); loadMyInstants(); }
      }
    };
  });

  root.querySelectorAll('[data-open-user]').forEach(el => {
    el.onclick = () => {
      const authorId = el.getAttribute('data-open-user');
      const group = state.feed.filter(f => f.author_id === authorId);
      if (!group.length) return;
      const firstUnviewed = group.find(f => !f.viewed);
      openStory((firstUnviewed || group[0]).id, false);
    };
  });

  const stackEl = root.querySelector('[data-open-stack]');
  if (stackEl) stackEl.onclick = () => openStory(state.myInstants[0].id, true);

  const signoutBtn = document.getElementById('signout-btn');
  if (signoutBtn) signoutBtn.onclick = handleSignOut;

  const addFriendInput = document.getElementById('add-friend-input');
  if (addFriendInput) {
    addFriendInput.oninput = (e) => { state.addFriendInput = e.target.value; };
  }
  const addFriendBtn = document.getElementById('add-friend-btn');
  if (addFriendBtn) addFriendBtn.onclick = handleAddFriend;

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

  const audiencePill = document.getElementById('audience-pill');
  if (audiencePill) audiencePill.onclick = () => setState({ audienceMenuOpen: !state.audienceMenuOpen });
  root.querySelectorAll('.audience-menu [data-aud]').forEach(el => {
    el.onclick = () => setState({ audience: el.getAttribute('data-aud'), audienceMenuOpen: false });
  });

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
