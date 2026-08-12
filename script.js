(function(){
  const SUPABASE_URL = 'https://ahaojtuqxfmaysniyxei.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoYW9qdHVxeGZtYXlzbml5eGVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NDc4MTYsImV4cCI6MjEwMjAyMzgxNn0.e5u-wpLnNkIMm_f5nla4jfBUqPYKT6iEuDEr-tXJEVs';
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const audioCtx = AudioContextClass ? new AudioContextClass() : null;
  const soundBuffers = {};
  const soundVolumes = { flap: 0.6, score: 0.6, hit: 0.6 };
  
  const soundFiles = { flap: 'sounds/flap.mp3', score: 'sounds/score.mp3', hit: 'sounds/hit.mp3' };

  async function loadSound(name, url){
    if(!audioCtx) return;
    try{
      const res = await fetch(url);
      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      soundBuffers[name] = audioBuffer;
    }catch(err){}
  }
  Object.entries(soundFiles).forEach(([name, url]) => loadSound(name, url));

  function unlockAudio(){ if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{}); }
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);
  window.addEventListener('touchstart', unlockAudio, { passive: true });

  function playSound(name){
    if(!audioCtx) return;
    const buffer = soundBuffers[name];
    if(!buffer) return;
    if(audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
    try{
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = soundVolumes[name] ?? 0.6;
      source.connect(gainNode).connect(audioCtx.destination);
      source.start(0);
    }catch(err){}
  }

  // --- SISTEM TOKO (MENGGUNAKAN DATA DARI skin.js) ---
  const skinsData = window.SKINS_DATA || [];

  let flappyCoins = 0; let unlockedSkins = ['default']; let activeSkinId = 'default'; let activeSkin = skinsData[0];
  let currentUser = localStorage.getItem('flappy_username') || null;
  let currentPasswordHash = localStorage.getItem('flappy_pwhash') || null;

  const shopBtn = document.getElementById('shopBtn'); const shopScreen = document.getElementById('shopScreen');
  const shopCloseBtn = document.getElementById('shopCloseBtn'); const shopCoinsDisplay = document.getElementById('shopCoinsDisplay');
  const skinListEl = document.getElementById('skinList'); const coinsGainedEl = document.getElementById('coinsGained');
  const shopSaveStatus = document.getElementById('shopSaveStatus'); const profileCoins = document.getElementById('profileCoins');

  function updateLocalState(coins, skinsStr, active){
    flappyCoins = coins;
    try{ unlockedSkins = JSON.parse(skinsStr); if(!Array.isArray(unlockedSkins)) unlockedSkins = ['default']; }catch(e){ unlockedSkins = ['default']; }
    activeSkinId = active || 'default'; activeSkin = skinsData.find(s => s.id === activeSkinId) || skinsData[0];
    localStorage.setItem('flappy_coins', flappyCoins); localStorage.setItem('flappy_skins', JSON.stringify(unlockedSkins)); localStorage.setItem('flappy_active_skin', activeSkinId);
  }

  updateLocalState( Number(localStorage.getItem('flappy_coins') || 0), localStorage.getItem('flappy_skins') || '["default"]', localStorage.getItem('flappy_active_skin') || 'default' );

  function renderShop(){
    shopCoinsDisplay.textContent = 'Koin: ' + flappyCoins;
    skinListEl.innerHTML = skinsData.map(skin => {
      const isUnlocked = unlockedSkins.includes(skin.id); const isSelected = activeSkinId === skin.id;
      let btnHtml = '';
      if(isSelected){ btnHtml = `<button class="btn btnSmall btnSelected" disabled>DIPAKAI</button>`; }
      else if(isUnlocked){ btnHtml = `<button class="btn btnSmall btnSecondary" onclick="window.selectSkin('${skin.id}')">PAKAI</button>`; }
      else {
        const canAfford = flappyCoins >= skin.price; const opacity = canAfford ? '1' : '0.5'; const pointer = canAfford ? 'auto' : 'none';
        btnHtml = `<button class="btn btnSmall" onclick="window.buySkin('${skin.id}', ${skin.price})" style="opacity:${opacity}; pointer-events:${pointer}">${skin.price} Koin</button>`;
      }
      return `<div class="skinItem"><canvas class="skinPreviewCanvas" id="preview-${skin.id}" width="48" height="48"></canvas><div class="skinInfo"><p class="skinName">${skin.name}</p>${!isUnlocked ? `<p class="skinPrice">Harga: ${skin.price} Koin</p>` : `<p class="skinPrice">Sudah Terbuka</p>`}</div><div class="skinAction">${btnHtml}</div></div>`;
    }).join('');
  }

  function drawShopPreviews() {
      skinsData.forEach(skin => {
          const c = document.getElementById(`preview-${skin.id}`);
          if(c) {
              const cCtx = c.getContext('2d');
              cCtx.clearRect(0,0,48,48);
              if(window.drawBirdSkin) {
                  window.drawBirdSkin(cCtx, {x:24, y:28, rot:0}, skin, false);
              }
          }
      });
  }

  async function syncShopDataToServer(){
    if(!currentUser || !currentPasswordHash) return;
    try{ await supabase.rpc('update_shop_data', { p_username: currentUser, p_password_hash: currentPasswordHash, p_coins: flappyCoins, p_skins: JSON.stringify(unlockedSkins), p_active_skin: activeSkinId }); }catch(err){}
  }

  window.buySkin = async function(id, price){
    if(flappyCoins >= price){
      if(!currentUser){ shopSaveStatus.textContent = "Login dulu untuk membeli skin!"; shopSaveStatus.style.color = "#ff6b6b"; shopSaveStatus.style.display = "block"; setTimeout(() => shopSaveStatus.style.display = "none", 3000); return; }
      flappyCoins -= price; unlockedSkins.push(id); updateLocalState(flappyCoins, JSON.stringify(unlockedSkins), id); renderShop(); draw();
      shopSaveStatus.textContent = "Membeli & menyimpan..."; shopSaveStatus.style.color = "#5fc084"; shopSaveStatus.style.display = "block";
      await syncShopDataToServer();
      shopSaveStatus.textContent = "Skin tersimpan!"; setTimeout(() => shopSaveStatus.style.display = "none", 2000);
    }
  };
  window.selectSkin = async function(id){ updateLocalState(flappyCoins, JSON.stringify(unlockedSkins), id); renderShop(); draw(); if(currentUser) { syncShopDataToServer(); } };
  shopBtn.addEventListener('click', (e) => { e.stopPropagation(); if(!currentUser){ shopSaveStatus.textContent = "Mode Tamu. Login untuk simpan permanen."; shopSaveStatus.style.color = "#ffd27a"; shopSaveStatus.style.display = "block"; } renderShop(); shopScreen.classList.remove('hidden'); });
  shopCloseBtn.addEventListener('click', () => { shopScreen.classList.add('hidden'); shopSaveStatus.style.display = "none"; });

  // --- UI & AUTH ---
  const canvas = document.getElementById('game'); const ctx = canvas.getContext('2d'); const stage = document.getElementById('stage');
  const hud = document.getElementById('hud'); const startScreen = document.getElementById('startScreen'); const overScreen = document.getElementById('overScreen');
  const startBtn = document.getElementById('startBtn'); const retryBtn = document.getElementById('retryBtn'); const homeBtn = document.getElementById('homeBtn');
  const scoreLine = document.getElementById('scoreLine'); const bestLine = document.getElementById('bestLine'); const saveStatus = document.getElementById('saveStatus');
  const leaderboardList = document.getElementById('leaderboardList'); const authBar = document.getElementById('authBar'); const settingsBtn = document.getElementById('settingsBtn');
  const loginBtn = document.getElementById('loginBtn'); const startUserInfo = document.getElementById('startUserInfo'); const startUsername = document.getElementById('startUsername');
  const startUserBest = document.getElementById('startUserBest'); const profileScreen = document.getElementById('profileScreen'); const profileCloseBtn = document.getElementById('profileCloseBtn');
  const profileUsername = document.getElementById('profileUsername'); const profileBest = document.getElementById('profileBest'); const resetScoreBtn = document.getElementById('resetScoreBtn');
  const profileLogoutBtn = document.getElementById('profileLogoutBtn'); const loginScreen = document.getElementById('loginScreen'); const loginCloseBtn = document.getElementById('loginCloseBtn');
  const loginUsernameInput = document.getElementById('loginUsername'); const loginPasswordInput = document.getElementById('loginPassword'); const loginSubmitBtn = document.getElementById('loginSubmitBtn');
  const loginError = document.getElementById('loginError'); const overTitle = document.getElementById('overTitle');
  
  const vsMenuBtn = document.getElementById('vsMenuBtn'); const vsWaitingScreen = document.getElementById('vsWaitingScreen');
  const vsStatusText = document.getElementById('vsStatusText'); const cancelVsBtn = document.getElementById('cancelVsBtn');
  const vsStatusHUD = document.getElementById('vsStatusHUD'); const spectateEndBtn = document.getElementById('spectateEndBtn');
  const vsLoaderPulse = document.getElementById('vsLoaderPulse');
  
  const vsMenuScreen = document.getElementById('vsMenuScreen');
  const vsJoinScreen = document.getElementById('vsJoinScreen');
  const inputRoomCode = document.getElementById('inputRoomCode');
  const joinError = document.getElementById('joinError');

  function updateAuthUI(){
    if(currentUser){ loginBtn.classList.add('hidden'); startUserInfo.classList.remove('hidden'); startUsername.textContent = currentUser; startUserBest.textContent = 'Terbaik: ' + best; }
    else { loginBtn.classList.remove('hidden'); startUserInfo.classList.add('hidden'); }
  }
  settingsBtn.addEventListener('click', (e) => { e.stopPropagation(); if(currentUser){ openProfile(); }else{ loginError.classList.add('hidden'); loginScreen.classList.remove('hidden'); } });

  async function fetchBestScore(username){
    if(!currentPasswordHash) return null;
    try{ const { data, error } = await supabase.rpc('get_my_best', { p_username: username, p_password_hash: currentPasswordHash }); if(error) return null; return data; }catch(err){ return null; }
  }
  async function fetchShopData(username){
    if(!currentPasswordHash) return null;
    try{ const { data, error } = await supabase.rpc('get_shop_data', { p_username: username, p_password_hash: currentPasswordHash }); if(error || !data || data.length === 0) return null; return data[0]; }catch(err){ return null; }
  }
  async function syncDataFromServer(username){
    const serverBest = await fetchBestScore(username);
    if(serverBest !== null){ best = serverBest; localStorage.setItem('flappy_best', String(best)); bestLine.textContent = 'Terbaik: ' + best; if(startUserBest) startUserBest.textContent = 'Terbaik: ' + best; }
    const shopData = await fetchShopData(username);
    if(shopData !== null){ updateLocalState(shopData.coins || 0, shopData.unlocked_skins || '["default"]', shopData.active_skin || 'default'); draw(); }
  }
  async function sha256Hex(text){ const enc = new TextEncoder().encode(text); const buf = await crypto.subtle.digest('SHA-256', enc); return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join(''); }

  async function handleLoginSubmit(){
    const username = loginUsernameInput.value.trim(); const password = loginPasswordInput.value; loginError.classList.add('hidden');
    if(!username || !password){ loginError.textContent = 'Isi username & password dulu ya!'; loginError.classList.remove('hidden'); return; }
    loginSubmitBtn.disabled = true; loginSubmitBtn.textContent = 'MEMPROSES...';
    try{
      const passwordHash = await sha256Hex(password);
      const { data, error } = await supabase.rpc('auth_login', { p_username: username, p_password_hash: passwordHash });
      if(error){ loginError.textContent = error.message && error.message.includes('invalid_password') ? 'Password salah' : 'Gagal terhubung ke server'; loginError.classList.remove('hidden'); return; }
      const row = Array.isArray(data) ? data[0] : data; currentUser = username; currentPasswordHash = passwordHash;
      localStorage.setItem('flappy_username', username); localStorage.setItem('flappy_pwhash', passwordHash);
      best = row && row.best_score != null ? row.best_score : 0; localStorage.setItem('flappy_best', String(best)); bestLine.textContent = 'Terbaik: ' + best;
      updateAuthUI(); loginScreen.classList.add('hidden'); loginUsernameInput.value = ''; loginPasswordInput.value = '';
      await syncDataFromServer(currentUser);
    }catch(err){ loginError.textContent = 'Terjadi kesalahan'; loginError.classList.remove('hidden'); }finally{ loginSubmitBtn.disabled = false; loginSubmitBtn.textContent = 'MASUK'; }
  }
  loginBtn.addEventListener('click', () => { loginError.classList.add('hidden'); loginScreen.classList.remove('hidden'); });
  loginCloseBtn.addEventListener('click', () => { loginScreen.classList.add('hidden'); }); loginSubmitBtn.addEventListener('click', handleLoginSubmit);

  async function openProfile(){
    if(!currentUser) return; cancelResetConfirm(); profileUsername.textContent = currentUser; profileBest.textContent = 'Skor Terbaik: ' + best; profileCoins.textContent = 'Koin: ' + flappyCoins; profileScreen.classList.remove('hidden');
    await syncDataFromServer(currentUser); profileBest.textContent = 'Skor Terbaik: ' + best; profileCoins.textContent = 'Koin: ' + flappyCoins;
  }
  profileCloseBtn.addEventListener('click', () => { cancelResetConfirm(); profileScreen.classList.add('hidden'); });
  profileLogoutBtn.addEventListener('click', () => {
    cancelResetConfirm(); currentUser = null; currentPasswordHash = null; localStorage.removeItem('flappy_username'); localStorage.removeItem('flappy_pwhash'); localStorage.removeItem('flappy_best');
    best = 0; bestLine.textContent = 'Terbaik: ' + best; updateLocalState(0, '["default"]', 'default'); updateAuthUI(); profileScreen.classList.add('hidden'); draw();
  });

  let confirmingReset = false; let resetConfirmTimer = null;
  function cancelResetConfirm(){ confirmingReset = false; clearTimeout(resetConfirmTimer); resetScoreBtn.textContent = 'RESET SKOR'; resetScoreBtn.classList.remove('confirming'); }
  async function resetScore(){
    if(!currentUser) return; resetScoreBtn.disabled = true; resetScoreBtn.classList.remove('confirming'); resetScoreBtn.textContent = 'MERESET...';
    try{
      const { error } = await supabase.rpc('reset_score', { p_username: currentUser, p_password_hash: currentPasswordHash });
      if(error){ profileBest.textContent = 'Gagal reset skor'; }else{
        best = 0; localStorage.setItem('flappy_best', '0'); bestLine.textContent = 'Terbaik: ' + best; if(startUserBest) startUserBest.textContent = 'Terbaik: ' + best; profileBest.textContent = 'Skor Terbaik: ' + best; loadLeaderboard();
      }
    }catch(err){ profileBest.textContent = 'Gagal reset skor'; }finally{ resetScoreBtn.disabled = false; resetScoreBtn.textContent = 'RESET SKOR'; confirmingReset = false; }
  }
  resetScoreBtn.addEventListener('click', () => { if(!confirmingReset){ confirmingReset = true; resetScoreBtn.textContent = 'YAKIN? TAP LAGI'; resetScoreBtn.classList.add('confirming'); clearTimeout(resetConfirmTimer); resetConfirmTimer = setTimeout(cancelResetConfirm, 3500); }else{ clearTimeout(resetConfirmTimer); resetScore(); } });
  
  const inputs = [loginUsernameInput, loginPasswordInput, inputRoomCode];
  inputs.forEach(el => {
      el.addEventListener('keydown', (e)=>{ e.stopPropagation(); if(e.key === 'Enter') { if(el === inputRoomCode) document.getElementById('btnSubmitJoin').click(); else handleLoginSubmit(); } });
      el.addEventListener('pointerdown', (e)=>{ e.stopPropagation(); });
  });

  async function loadLeaderboard(){
    try{
      const { data, error } = await supabase.rpc('get_leaderboard', { p_limit: 3 });
      if(error || !data || data.length === 0){ leaderboardList.innerHTML = '<li class="lbEmpty">Belum ada skor</li>'; return; }
      leaderboardList.innerHTML = data.map((row, i) => `<li><span class="lbNameWrap"><span class="lbRank">${i+1}.</span><span class="lbName">${escapeHtml(row.player_name)}</span></span><span class="lbScore">${row.score}</span></li>`).join('');
    }catch(err){ leaderboardList.innerHTML = '<li class="lbEmpty">Gagal memuat</li>'; }
  }
  function escapeHtml(str){ const div = document.createElement('div'); div.textContent = str; return div.innerHTML; }
  loadLeaderboard();

  // --- MULTIPLAYER LOGIC (VS MODE) ---
  let isVSMode = false;
  let vsRoomId = null;
  let vsChannel = null;
  let isHost = false;
  let syncTimer = 0;
  
  let opponentDead = false;
  let opponentScore = 0;
  
  const myPlayerId = Math.random().toString(36).substring(2, 10);
  let currentSeed = 1;
  function prng() {
      if(!isVSMode) return Math.random(); 
      let t = currentSeed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  let ghostBird = { active: false, x: 0, yRatio: 0, rot: 0, skinId: 'default' };

  vsMenuBtn.addEventListener('click', () => {
      if (!currentUser) { alert("Silakan Login terlebih dahulu untuk bermain VS Mode!"); return; }
      startScreen.classList.add('hidden');
      vsMenuScreen.classList.remove('hidden');
  });
  document.getElementById('btnBackVsMenu').addEventListener('click', () => { vsMenuScreen.classList.add('hidden'); startScreen.classList.remove('hidden'); });
  document.getElementById('btnRandomVS').addEventListener('click', () => { vsMenuScreen.classList.add('hidden'); startVSMatchmaking('random'); });
  document.getElementById('btnCreatePrivateVS').addEventListener('click', () => { vsMenuScreen.classList.add('hidden'); startVSMatchmaking('create_private'); });
  document.getElementById('btnJoinPrivateVS').addEventListener('click', () => { 
      vsMenuScreen.classList.add('hidden'); vsJoinScreen.classList.remove('hidden'); 
      inputRoomCode.value = ''; joinError.classList.add('hidden');
  });
  document.getElementById('btnBackJoin').addEventListener('click', () => { vsJoinScreen.classList.add('hidden'); vsMenuScreen.classList.remove('hidden'); });
  document.getElementById('btnSubmitJoin').addEventListener('click', () => {
      const code = inputRoomCode.value.trim().toUpperCase();
      if(!code) return;
      vsJoinScreen.classList.add('hidden');
      startVSMatchmaking('join_private', code);
  });

  async function startVSMatchmaking(mode, code = null) {
      isVSMode = true;
      vsWaitingScreen.classList.remove('hidden');
      vsStatusText.style.fontSize = "12px"; vsStatusText.style.color = "var(--cream)"; 
      vsLoaderPulse.classList.remove('hidden');

      try {
          if (mode === 'random') {
              vsStatusText.innerHTML = "Mencari ruangan acak...<br><span style='font-size:9px;opacity:0.7'>(Random Match)</span>";
              const { data, error } = await supabase.from('rooms').select('*').eq('status', 'waiting').is('room_code', null).limit(1);
              
              if (data && data.length > 0) {
                  vsRoomId = data[0].id; isHost = false; currentSeed = data[0].pipe_seed; 
                  vsStatusText.textContent = `Room ketemu! Menghubungkan ke ${data[0].player1_username}...`;
                  await supabase.from('rooms').update({ player2_username: currentUser, status: 'playing' }).eq('id', vsRoomId);
                  setupRealtime();
              } else {
                  isHost = true; currentSeed = Math.floor(Math.random() * 999999);
                  const { data: newRoom, error: insErr } = await supabase.from('rooms').insert([{ player1_username: currentUser, pipe_seed: currentSeed }]).select();
                  if(newRoom && newRoom.length > 0) {
                      vsRoomId = newRoom[0].id; vsStatusText.textContent = "Room dibuat! Menunggu lawan acak..."; setupRealtime();
                  } else { throw new Error("Gagal membuat room"); }
              }
          } 
          else if (mode === 'create_private') {
              const newCode = Math.random().toString(36).substring(2, 7).toUpperCase();
              isHost = true; currentSeed = Math.floor(Math.random() * 999999);
              
              vsStatusText.innerHTML = `MABAR PRIVATE<br><br><span style="font-size:32px; color:#ffd27a; font-weight:bold; letter-spacing:4px; text-shadow:2px 2px 0 var(--ink);">${newCode}</span><br><br>Berikan kode ini ke temanmu...`;
              vsLoaderPulse.classList.add('hidden');

              const { data: newRoom, error: insErr } = await supabase.from('rooms').insert([{ 
                  player1_username: currentUser, pipe_seed: currentSeed, room_code: newCode 
              }]).select();
              
              if(newRoom && newRoom.length > 0) {
                  vsRoomId = newRoom[0].id; setupRealtime();
              } else { throw new Error("Gagal membuat room"); }
          }
          else if (mode === 'join_private') {
              vsStatusText.textContent = `Mencari room ${code}...`;
              const { data, error } = await supabase.from('rooms').select('*').eq('status', 'waiting').eq('room_code', code).limit(1);
              
              if (data && data.length > 0) {
                  vsRoomId = data[0].id; isHost = false; currentSeed = data[0].pipe_seed;
                  vsStatusText.textContent = `Room ketemu! Menghubungkan ke ${data[0].player1_username}...`;
                  await supabase.from('rooms').update({ player2_username: currentUser, status: 'playing' }).eq('id', vsRoomId);
                  setupRealtime();
              } else {
                  cleanUpVS();
                  vsWaitingScreen.classList.add('hidden');
                  vsJoinScreen.classList.remove('hidden');
                  joinError.textContent = "Kode tidak ditemukan atau room penuh!";
                  joinError.classList.remove('hidden');
              }
          }
      } catch (err) {
          vsStatusText.textContent = "Terjadi kesalahan koneksi."; setTimeout(() => { goHome(); }, 2000);
      }
  }

  function startVSCountdown() {
      let count = 3;
      vsLoaderPulse.classList.add('hidden');
      vsStatusText.style.fontSize = "36px"; vsStatusText.style.fontWeight = "bold"; vsStatusText.style.color = "#ffd27a"; vsStatusText.textContent = count;
      playSound('score'); 
      let iv = setInterval(() => {
          count--;
          if(count > 0) { vsStatusText.textContent = count; playSound('score'); } 
          else { clearInterval(iv); vsStatusText.textContent = "GO!"; playSound('flap'); setTimeout(() => startGameVS(), 400); }
      }, 1000);
  }

  function setupRealtime() {
      vsChannel = supabase.channel('room_' + vsRoomId, { config: { broadcast: { self: false } } });
      vsChannel.on('broadcast', { event: 'sync' }, (payload) => {
          const data = payload.payload || {};
          if(data.id === myPlayerId) return; 
          ghostBird.active = true; ghostBird.yRatio = data.yRatio; ghostBird.rot = data.rot; ghostBird.skinId = data.skinId;
          opponentScore = data.score || opponentScore;
          
          if(state === 'spectating') {
              vsStatusHUD.textContent = "MENONTON LAWAN... (Skor Dia: " + opponentScore + ")";
          }
      });
      vsChannel.on('broadcast', { event: 'dead' }, (payload) => {
          const data = payload.payload || {};
          if(data.id === myPlayerId) return; 
          
          opponentDead = true;
          opponentScore = data.score || opponentScore;
          
          if (state === 'playing') {
              vsStatusHUD.textContent = "Lawan Gugur! (Skor: " + opponentScore + ")";
              vsStatusHUD.style.color = "#ff6b6b";
          } else if (state === 'spectating') {
              resolveVSMatch(score, opponentScore);
          }
      });
      vsChannel.on('broadcast', { event: 'start' }, () => { if(!isHost) startVSCountdown(); });
      vsChannel.subscribe((status) => { if (status === 'SUBSCRIBED') { if (!isHost) { vsChannel.send({ type: 'broadcast', event: 'ready', payload: {} }); } } });
      if (isHost) { vsChannel.on('broadcast', { event: 'ready' }, () => { vsChannel.send({ type: 'broadcast', event: 'start', payload: {} }); startVSCountdown(); }); }
  }

  function startGameVS() {
      currentSeed = isHost ? currentSeed : currentSeed; 
      resize(); reset(); state = 'playing';
      ghostBird = { active: false, x: W*0.32, yRatio: 0.42, rot: 0, skinId: 'default' };
      vsWaitingScreen.classList.add('hidden');
      hud.classList.remove('hidden'); authBar.classList.add('hidden');
      
      vsStatusHUD.textContent = "Lawan Aktif";
      vsStatusHUD.style.color = "#ffd27a";
      vsStatusHUD.classList.remove('hidden');
  }

  function resolveVSMatch(myScore, oppScore) {
      state = 'over';
      spectateEndBtn.classList.add('hidden');
      vsStatusHUD.classList.add('hidden');
      
      if (myScore > oppScore) {
          overTitle.innerHTML = "LAWAN MATI!<br>KAMU MENANG!";
          overTitle.style.color = "#5fc084"; 
          finalizeMatch(100); 
      } else if (myScore < oppScore) {
          overTitle.innerHTML = "KAMU KALAH :(";
          overTitle.style.color = "#ff6b6b";
          finalizeMatch(0);
      } else {
          overTitle.innerHTML = "SERI / DRAW!";
          overTitle.style.color = "#ffd27a"; 
          finalizeMatch(50); 
      }
  }

  function finalizeMatch(reward) {
      if (reward > 0) {
          flappyCoins += reward;
          updateLocalState(flappyCoins, JSON.stringify(unlockedSkins), activeSkinId);
          coinsGainedEl.textContent = `+${reward} Koin`;
          coinsGainedEl.classList.remove('hidden');
      } else {
          coinsGainedEl.classList.add('hidden');
      }
      
      if(score > best){ best = score; localStorage.setItem('flappy_best', String(best)); }
      scoreLine.textContent = (isVSMode ? 'Skor Akhir VS: ' : 'Skor: ') + score; 
      bestLine.textContent = 'Terbaik: ' + best;
      
      overScreen.classList.remove('hidden'); hud.classList.add('hidden'); authBar.classList.remove('hidden');
      
      if(currentUser){ 
          saveScoreAndCoinsToServer(currentUser, score, reward); 
      } else {
          saveStatus.textContent = 'Login untuk simpan permanen';
      }
      setTimeout(() => cleanUpVS(), 1000);
  }

  function cleanUpVS() {
      if (vsChannel) { vsChannel.unsubscribe(); vsChannel = null; }
      isVSMode = false; ghostBird.active = false;
      vsStatusText.style.fontSize = "12px"; vsStatusText.style.color = "var(--cream)";
      vsStatusHUD.classList.add('hidden'); spectateEndBtn.classList.add('hidden');
  }

  spectateEndBtn.addEventListener('click', () => {
      if(state === 'spectating') {
          resolveVSMatch(score, 999999); 
      }
  });

  cancelVsBtn.addEventListener('click', () => {
      cleanUpVS();
      if(isHost && vsRoomId) { supabase.from('rooms').delete().eq('id', vsRoomId).then(); }
      goHome();
  });

  // --- RENDERING & FISIKA ---
  let skyGradient = null;
  function buildSkyGradient(){
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0, '#1e3c72'); 
    g.addColorStop(0.4, '#2a5298'); 
    g.addColorStop(0.7, '#ff7e5f'); 
    g.addColorStop(1, '#feb47b'); 
    skyGradient = g;
  }

  let W, H, DPR;
  let dynamicGravity, dynamicFlap, dynamicGap, dynamicGroundH;
  function resize(){
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = stage.clientWidth; H = stage.clientHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    ctx.setTransform(DPR,0,0,DPR,0,0);
    buildSkyGradient();

    const hRatio = Math.max(0.6, Math.min(H / 650, 1.4)); 
    dynamicGravity = 1500 * hRatio; dynamicFlap = -430 * Math.sqrt(hRatio); 
    dynamicGap = Math.max(140, 190 * hRatio); dynamicGroundH = Math.max(60, H * 0.1); 
  }
  window.addEventListener('resize', resize); resize();

  const PIPE_W = 68; const BIRD_R = 15;
  let state = 'start'; 
  let bird, pipes, enemies, score, best, elapsed, pipeTimer, groundOffset, bgOffset, particles, pipeSpeed, gapSize, lastGapRatio;

  best = Number(localStorage.getItem('flappy_best') || 0); bestLine.textContent = 'Terbaik: ' + best;
  updateAuthUI(); if(currentUser){ syncDataFromServer(currentUser); }

  function reset(){
    bird = { x: W*0.32, y: H*0.42, vy: 0, rot: 0 }; pipes = []; particles = []; enemies = [];
    score = 0; elapsed = 0; pipeTimer = 0; groundOffset = 0; bgOffset = 0;
    pipeSpeed = 165; gapSize = dynamicGap; lastGapRatio = null;
    opponentDead = false; opponentScore = 0;
    hud.textContent = '0';
    vsStatusHUD.classList.add('hidden'); spectateEndBtn.classList.add('hidden');
  }
  reset();

  // ALGORTIMA PIPA DINAMIS LEBIH BERSAHABAT (70% Normal)
  function spawnPipe(){
    let centerRatio;
    if(lastGapRatio === null){ centerRatio = 0.2 + prng() * 0.5; } 
    else {
        const lo = Math.max(0.15, lastGapRatio - 0.25); const hi = Math.min(0.75, lastGapRatio + 0.25);
        centerRatio = lo + prng() * (hi - lo);
    }
    lastGapRatio = centerRatio; let centerY = centerRatio * H; 

    const speedLevel = Math.floor(score / 100); 
    const currentGapSize = Math.max(dynamicGap - Math.floor(score / 50) * 7, 120);

    let pType = 'normal';
    let roll = prng();
    
    // Probabilitas rintangan diperkecil: 70% Normal, 10% Menyempit, 10% Maju-Mundur, 10% Naik-Turun
    if (roll < 0.10) pType = 'chomping'; 
    else if (roll < 0.20) pType = 'moving_x';
    else if (roll < 0.30) pType = 'moving_y'; 
    else pType = 'normal';

    pipes.push({
      x: W + PIPE_W, 
      gapY: centerY, baseGapY: centerY, 
      baseGapSize: currentGapSize, gapSize: currentGapSize, 
      passed: false,
      type: pType, phaseOffset: prng() * Math.PI * 2, speed: 1.5 + prng() * 1.5, xOffset: 0,
      minY: 70, maxY: H - dynamicGroundH - 70
    });
    
    // Probabilitas musuh diperkecil jadi 10% saja
    const enemyChance = 0.10;
    if (prng() < enemyChance) {
        enemies.push({
            x: W + PIPE_W + 150 + prng() * 200,
            yBase: 100 + prng() * (H - dynamicGroundH - 200),
            y: 0,
            speed: pipeSpeed * (1.2 + prng() * 0.5), 
            sinOffset: prng() * Math.PI * 2
        });
    }
  }

  function flap(){
    if(state === 'start'){ startGameSolo(); return; }
    if(state !== 'playing') return;
    bird.vy = dynamicFlap; playSound('flap');
    for(let i=0;i<5;i++){ particles.push({ x: bird.x - 10, y: bird.y + 6, vx: -80 - Math.random()*60, vy: (Math.random()-0.5)*60, life: 0.4, age:0 }); }
  }

  function startGameSolo(){
    isVSMode = false; currentSeed = Math.random() * 999999; 
    resize(); reset(); state = 'playing';
    startScreen.classList.add('hidden'); overScreen.classList.add('hidden');
    hud.classList.remove('hidden'); authBar.classList.add('hidden');
  }

  async function saveScoreAndCoinsToServer(name, finalScore, finalCoins){
    if(!currentPasswordHash) return;
    saveStatus.textContent = 'Menyimpan...';
    try{
      await supabase.rpc('submit_score', { p_username: name, p_password_hash: currentPasswordHash, p_score: finalScore });
      if (finalCoins > 0) { await supabase.rpc('add_coins', { p_username: name, p_password_hash: currentPasswordHash, p_added_coins: finalCoins }); }
      saveStatus.textContent = 'Data tersimpan'; loadLeaderboard();
    }catch(err){ saveStatus.textContent = 'Gagal menyimpan'; }
  }

  function endGame(){
    if(state === 'spectating' || state === 'over') return;
    playSound('hit');
    
    if (isVSMode && vsChannel) {
        vsChannel.send({ type: 'broadcast', event: 'dead', payload: { id: myPlayerId, score: score } });
        
        if (opponentDead) {
            resolveVSMatch(score, opponentScore);
        } else {
            state = 'spectating';
            vsStatusHUD.textContent = "MENONTON LAWAN... (Skor Dia: " + opponentScore + ")";
            vsStatusHUD.style.color = "#7ad2ff"; 
            spectateEndBtn.classList.remove('hidden');
        }
    } else {
        state = 'over';
        overTitle.innerHTML = "GAME OVER";
        overTitle.style.color = "#ffd27a"; 
        finalizeMatch(score);
    }
  }

  canvas.addEventListener('pointerdown', (e)=>{ e.preventDefault(); flap(); }, {passive: false});
  canvas.addEventListener('touchstart', (e)=>{ e.preventDefault(); }, {passive: false});
  window.addEventListener('keydown', (e)=>{ if(e.code === 'Space' || e.code === 'ArrowUp'){ e.preventDefault(); flap(); } });
  
  function goHome(){
    cleanUpVS(); reset(); state = 'start';
    overScreen.classList.add('hidden'); startScreen.classList.remove('hidden'); vsWaitingScreen.classList.add('hidden');
    vsMenuScreen.classList.add('hidden'); vsJoinScreen.classList.add('hidden');
    hud.classList.add('hidden'); authBar.classList.remove('hidden'); loadLeaderboard();
  }

  startBtn.addEventListener('click', startGameSolo);
  retryBtn.addEventListener('click', () => { if(isVSMode){ startScreen.classList.add('hidden'); vsMenuScreen.classList.remove('hidden'); } else { startGameSolo(); } });
  homeBtn.addEventListener('click', goHome);

  function circleRectCollide(cx, cy, r, rx, ry, rw, rh){
    const nx = Math.max(rx, Math.min(cx, rx+rw)); const ny = Math.max(ry, Math.min(cy, ry+rh));
    const dx = cx - nx, dy = cy - ny; return (dx*dx + dy*dy) < r*r;
  }

  let last = performance.now();
  function loop(now){
    const dt = Math.min((now - last)/1000, 1/30);
    last = now; update(dt); draw();
    if(!shopScreen.classList.contains('hidden')) { drawShopPreviews(); }
    requestAnimationFrame(loop);
  }

  function update(dt){
    if(state !== 'playing' && state !== 'spectating') return;

    const scrollDelta = pipeSpeed * dt;
    groundOffset -= scrollDelta; if(groundOffset < -40) groundOffset += 40;
    bgOffset -= scrollDelta; if(bgOffset < -100000) bgOffset += 100000;

    for(let i=particles.length-1;i>=0;i--){
      const p = particles[i]; p.age += dt; p.x += p.vx*dt; p.y += p.vy*dt;
      if(p.age > p.life) particles.splice(i,1);
    }
    
    if(isVSMode && vsChannel && state === 'playing') {
        syncTimer -= dt;
        if(syncTimer <= 0) {
            syncTimer = 0.05; 
            vsChannel.send({
                type: 'broadcast', event: 'sync',
                payload: { id: myPlayerId, yRatio: bird.y / H, rot: bird.rot, skinId: activeSkinId, score: score } 
            });
        }
    }

    elapsed += dt;
    const speedLevel = Math.floor(score / 100); pipeSpeed = 165 + Math.min(speedLevel * 11, 110);
    
    bird.vy += dynamicGravity * dt; bird.y += bird.vy * dt; bird.rot = Math.max(-0.5, Math.min(1.3, bird.vy/500));
    
    if(bird.y + BIRD_R > H - dynamicGroundH){ 
        bird.y = H - dynamicGroundH - BIRD_R; 
        if (state === 'playing') endGame(); 
    }
    if(bird.y - BIRD_R < 0){ bird.y = BIRD_R; bird.vy = 0; }

    pipeTimer -= dt; if(pipeTimer <= 0){ spawnPipe(); pipeTimer = 239 / pipeSpeed; }

    // Update Pipa Dinamis
    for(let i=pipes.length-1;i>=0;i--){
      const p = pipes[i]; p.x -= pipeSpeed*dt;
      
      // LOGIKA PIPA BERGERAK (NAIK TURUN, MAJU MUNDUR, MENYEMPIT)
      if(p.type === 'moving_y') {
          p.gapY = p.baseGapY + Math.sin(elapsed * p.speed + p.phaseOffset) * (H * 0.15); // Naik turun 15% dari tinggi layar
      } else if(p.type === 'moving_x') {
          p.xOffset = Math.sin(elapsed * p.speed + p.phaseOffset) * 45; // Maju mundur
      } else if(p.type === 'chomping') {
          // Menyempit hingga tersisa 45% dari celah asli
          p.gapSize = p.baseGapSize - Math.abs(Math.sin(elapsed * p.speed + p.phaseOffset)) * (p.baseGapSize * 0.55);
      }

      const drawX = p.x + p.xOffset;
      if(!p.passed && p.x + PIPE_W < bird.x){ 
          p.passed = true; 
          if(state === 'playing'){
              score++; playSound('score'); hud.textContent = String(score); 
          }
      }
      
      const topH = p.gapY - p.gapSize/2; const botY = p.gapY + p.gapSize/2; const botH = H - dynamicGroundH - botY;
      if(state === 'playing'){
          if(circleRectCollide(bird.x, bird.y, BIRD_R-3, drawX, 0, PIPE_W, topH) || circleRectCollide(bird.x, bird.y, BIRD_R-3, drawX, botY, PIPE_W, botH)){ endGame(); }
      }
      
      // Hapus pipa yang sudah lewat jauh (diperlebar sedikit batasnya karena xOffset)
      if(p.x < -PIPE_W * 2) pipes.splice(i,1);
    }
    
    for(let i=enemies.length-1; i>=0; i--){
      const e = enemies[i];
      e.x -= e.speed * dt;
      e.y = e.yBase + Math.sin(e.x * 0.015 + e.sinOffset) * 40;
      
      if(state === 'playing') {
          let dx = bird.x - e.x; let dy = bird.y - e.y;
          if(dx*dx + dy*dy < 450) { endGame(); }
      }
      if(e.x < -50) enemies.splice(i, 1);
    }
  }

  function drawSky(){
    ctx.fillStyle = skyGradient; ctx.fillRect(0,0,W,H);
    ctx.save(); ctx.globalAlpha = 0.9; ctx.fillStyle = '#ffd27a';
    ctx.beginPath(); ctx.arc(W*0.76, H*0.28, 46, 0, Math.PI*2); ctx.fill(); ctx.restore();
    drawMountainsFar(); drawMountainsNear();
  }
  function mod(n, m){ return ((n % m) + m) % m; }
  function drawMountainsFar(){
    const baseY = H - dynamicGroundH; const tileW = 240; const offset = mod(bgOffset * 0.07, tileW);
    ctx.save(); ctx.globalAlpha = 0.55; ctx.fillStyle = '#2c3e50'; 
    for(let x = -tileW*2 + offset; x < W + tileW; x += tileW){ drawMountainPeak(x + tileW*0.28, baseY, tileW*0.62, 120); drawMountainPeak(x + tileW*0.78, baseY, tileW*0.58, 95); }
    ctx.restore();
  }
  function drawMountainsNear(){
    const baseY = H - dynamicGroundH; const tileW = 200; const offset = mod(bgOffset * 0.15, tileW);
    ctx.save(); ctx.globalAlpha = 0.8; ctx.fillStyle = '#1a252f'; 
    for(let x = -tileW*2 + offset; x < W + tileW; x += tileW){ drawMountainPeak(x + tileW*0.3, baseY, tileW*0.72, 160, true); }
    ctx.restore();
  }
  function drawMountainPeak(cx, baseY, w, h, withSnow){
    ctx.beginPath(); ctx.moveTo(cx - w/2, baseY); ctx.lineTo(cx - w*0.1, baseY - h); ctx.lineTo(cx + w*0.06, baseY - h*0.8); ctx.lineTo(cx + w/2, baseY); ctx.closePath(); ctx.fill();
  }
  function drawPipes(){
    for(const p of pipes){
      const topH = p.gapY - p.gapSize/2; const botY = p.gapY + p.gapSize/2; const botH = H - dynamicGroundH - botY;
      const drawX = p.x + (p.xOffset || 0);
      drawPipeSegment(drawX, 0, PIPE_W, topH, true); drawPipeSegment(drawX, botY, PIPE_W, botH, false);
    }
  }
  
  function drawPipeSegment(x, y, w, h, isTop){
    if (h < 0) return; 
    const capH = 26;

    const capY = isTop ? y + h - capH : y;
    const bodyY = isTop ? y : y + capH;
    const bodyH = h - capH;

    // Batang Tiang Utama (Kayu)
    ctx.fillStyle = '#5e3a23'; 
    ctx.fillRect(x, bodyY, w, bodyH);
    
    // Serat Kayu vertikal
    ctx.fillStyle = '#3d2414';
    ctx.fillRect(x + 12, bodyY, 5, bodyH); 
    ctx.fillRect(x + 30, bodyY, 8, bodyH); 
    ctx.fillRect(x + 50, bodyY, 4, bodyH);

    // Kepala Tiang Kayu (Cap)
    ctx.fillStyle = '#4a2e1f'; 
    ctx.fillRect(x - 5, capY, w + 10, capH);
    ctx.fillStyle = '#7a4e32'; 
    ctx.fillRect(x - 5, isTop ? capY + capH - 6 : capY, w + 10, 6);
    
    // Paku Dermaga
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(x + 8, capY + 14, 3, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w - 8, capY + 14, 3, 0, Math.PI*2); ctx.fill();
  }

  function drawEnemies() {
      const enemySkin = { id: 'enemy', type: 'normal', acc: 'zombie', colors: { body: '#1a1a1a', belly: '#333333', wing: '#000000', beak: '#e53935' } };
      for(const e of enemies) {
          ctx.save();
          ctx.translate(e.x, e.y);
          ctx.scale(-0.7, 0.7); 
          let eRot = Math.sin(e.x * 0.05) * 0.3; 
          if(window.drawBirdSkin) {
              window.drawBirdSkin(ctx, {x:0, y:0, rot:eRot}, enemySkin, false);
          }
          ctx.restore();
      }
  }
  
  function drawGround(){
    const y = H - dynamicGroundH; 
    ctx.fillStyle = '#2c1e16'; ctx.fillRect(0, y, W, dynamicGroundH); 
    ctx.fillStyle = '#4a3324'; ctx.fillRect(0, y, W, 10); 
    ctx.fillStyle = '#1c120c';
    for(let x = groundOffset; x < W; x += 40){ ctx.fillRect(x, y+10, 20, 6); }
  }
  
  function drawParticles(){
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for(const p of particles){ const a = 1 - p.age/p.life; ctx.globalAlpha = Math.max(a,0); ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI*2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  
  function draw(){
    drawSky(); drawPipes(); drawEnemies(); drawParticles(); 
    
    if(isVSMode && ghostBird.active && (state === 'playing' || state === 'spectating')) {
        ghostBird.x = bird.x;
        ghostBird.y = ghostBird.yRatio * H; 
        const ghostSkin = window.SKINS_DATA.find(s => s.id === ghostBird.skinId) || window.SKINS_DATA[0];
        
        const isGhostTransparent = state === 'playing'; 
        if(window.drawBirdSkin) window.drawBirdSkin(ctx, ghostBird, ghostSkin, isGhostTransparent);
    }
    
    if(window.drawBirdSkin) window.drawBirdSkin(ctx, bird, activeSkin, false);
    
    drawGround();
  }

  requestAnimationFrame(loop);
})();
