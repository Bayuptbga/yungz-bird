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
  addFriendInput: '',
  friendError: '',
  viewerInstant: null,
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

async function captureFrame() {
  const video = document.getElementById('camera-video');
  if (!video || !video.videoWidth) return;
  if (state.flashOn) {
    setState({ flashing: true });
    await new Promise(r => setTimeout(r, 160));
  }
  const canvas = document.createElement('canvas');
  const maxW = 720;
  const scale = Math.min(1, maxW / video.videoWidth);
  canvas.width = video.videoWidth * scale;
  canvas.height = video.videoHeight * scale;
  const ctx = canvas.getContext('2d');
  if (state.facing === 'user') {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
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
  if (!state.capturedImage || !state.caption.trim()) {
    showToast('Tulis caption dulu sebelum kirim');
    return;
  }
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

async function openInstant(instant) {
  if (instant.viewed) {
    showToast('Instant ini sudah kamu lihat sebelumnya');
    return;
  }
  setState({ viewerInstant: instant });
  if (instant.author_id && instant.author_id !== state.user.id) {
    await supabase.from('instant_views').insert({ instant_id: instant.id, viewer_id: state.user.id });
    loadFeed();
  }
}

function closeViewer() {
  setState({ viewerInstant: null, shielded: false });
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
          <input id="caption-input" type="text" placeholder="Tulis caption sebelum kirim..." value="${esc(state.caption)}" maxlength="140" />
          <div class="hint">Wajib diisi &middot; tidak bisa diedit lagi setelah dikirim</div>
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
  return state.feed.map(item => `
    <div class="instant-row ${item.viewed ? 'viewed' : ''}" data-open="${item.id}">
      <img class="thumb" src="${item.image_data}" />
      <div class="meta">
        <div class="who">@${esc(item.profiles?.username || 'user')}</div>
        <div class="cap">${esc(item.caption)}</div>
        <div class="when">${timeAgo(item.created_at)} lalu &middot; ${timeLeft(item.expires_at)}</div>
      </div>
      ${!item.viewed ? '<span class="badge">BARU</span>' : ''}
    </div>
  `).join('');
}

function renderProfil() {
  return `
    <div class="profil-header">
      <div class="avatar-lg">${esc((state.profile.username || '?')[0].toUpperCase())}</div>
      <div class="profil-uname">@${esc(state.profile.username)}</div>
      <button class="btn btn-ghost" id="signout-btn">Keluar</button>
    </div>
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

function renderViewer() {
  const it = state.viewerInstant;
  return `
    <div class="viewer-overlay">
      <div class="viewer-top">
        <span class="hud-label">@${esc(it.profiles ? it.profiles.username : state.profile.username)}</span>
        <button class="btn btn-ghost" id="close-viewer">Tutup &#10005;</button>
      </div>
      ${state.shielded ? `<div class="privacy-shield">KONTEN DISEMBUNYIKAN<br/>saat aplikasi tidak aktif</div>` : `<img src="${it.image_data}" />`}
      <div class="viewer-caption">${esc(it.caption)}</div>
      <div class="viewer-reactions">
        ${['❤️', '😂', '😮', '🔥', '👀'].map(e => `<button class="emoji-btn" data-emoji="${e}">${e}</button>`).join('')}
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
        if (tab === 'profil') loadFriends();
      }
    };
  });

  root.querySelectorAll('[data-open]').forEach(el => {
    el.onclick = () => {
      const id = el.getAttribute('data-open');
      const item = state.feed.find(f => f.id === id);
      if (item) openInstant(item);
    };
  });

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

  root.querySelectorAll('.emoji-btn').forEach(el => {
    el.onclick = () => sendReaction('emoji', el.getAttribute('data-emoji'));
  });
}

init();
