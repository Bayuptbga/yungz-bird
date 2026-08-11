(function(){
  const SUPABASE_URL = 'https://ahaojtuqxfmaysniyxei.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoYW9qdHVxeGZtYXlzbml5eGVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NDc4MTYsImV4cCI6MjEwMjAyMzgxNn0.e5u-wpLnNkIMm_f5nla4jfBUqPYKT6iEuDEr-tXJEVs';
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // --- Sistem suara pakai Web Audio API ---
  // (Sebelumnya pakai new Audio() + cloneNode() untuk tiap play, tapi itu bikin
  // browser fetch ulang file MP3 dari server SETIAP KALI suara dibunyikan.
  // Saat flap cepat-cepat, request numpuk -> suara telat/patah/kadang gak keluar.
  // Solusi: decode semua suara sekali di awal jadi AudioBuffer di memori,
  // lalu tiap play tinggal diputar dari memori -> instan & bisa overlap mulus.)
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const audioCtx = AudioContextClass ? new AudioContextClass() : null;
  const soundBuffers = {};
  const soundVolumes = { flap: 0.6, score: 0.6, hit: 0.6 };
  const soundFiles = {
    flap: 'sounds/flap.mp3',
    score: 'sounds/score.mp3',
    hit: 'sounds/hit.mp3'
  };

  async function loadSound(name, url){
    if(!audioCtx) return;
    try{
      const res = await fetch(url);
      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      soundBuffers[name] = audioBuffer;
    }catch(err){
      console.warn('Gagal memuat suara "' + name + '":', err);
    }
  }
  Object.entries(soundFiles).forEach(([name, url]) => loadSound(name, url));

  // Browser (terutama mobile) mengunci AudioContext sampai ada interaksi user.
  // "Buka kunci" di sentuhan/klik/keydown pertama supaya suara langsung siap.
  function unlockAudio(){
    if(audioCtx && audioCtx.state === 'suspended'){
      audioCtx.resume().catch(()=>{});
    }
  }
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);
  window.addEventListener('touchstart', unlockAudio, { passive: true });

  function playSound(name){
    if(!audioCtx) return;
    const buffer = soundBuffers[name];
    if(!buffer) return; // belum selesai dimuat, lewati diam-diam
    if(audioCtx.state === 'suspended'){
      audioCtx.resume().catch(()=>{});
    }
    try{
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = soundVolumes[name] ?? 0.6;
      source.connect(gainNode).connect(audioCtx.destination);
      source.start(0);
    }catch(err){
      // abaikan kegagalan play tunggal, jangan sampai crash game
    }
  }

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const stage = document.getElementById('stage');
  const hud = document.getElementById('hud');
  const startScreen = document.getElementById('startScreen');
  const overScreen = document.getElementById('overScreen');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const homeBtn = document.getElementById('homeBtn');
  const scoreLine = document.getElementById('scoreLine');
  const bestLine = document.getElementById('bestLine');
  const saveStatus = document.getElementById('saveStatus');
  const leaderboardList = document.getElementById('leaderboardList');

  const authBar = document.getElementById('authBar');
  const settingsBtn = document.getElementById('settingsBtn');
  const loginBtn = document.getElementById('loginBtn');
  const startUserInfo = document.getElementById('startUserInfo');
  const startUsername = document.getElementById('startUsername');
  const startUserBest = document.getElementById('startUserBest');
  const profileScreen = document.getElementById('profileScreen');
  const profileCloseBtn = document.getElementById('profileCloseBtn');
  const profileUsername = document.getElementById('profileUsername');
  const profileBest = document.getElementById('profileBest');
  const profileLogoutBtn = document.getElementById('profileLogoutBtn');
  const loginScreen = document.getElementById('loginScreen');
  const loginCloseBtn = document.getElementById('loginCloseBtn');
  const loginUsernameInput = document.getElementById('loginUsername');
  const loginPasswordInput = document.getElementById('loginPassword');
  const loginSubmitBtn = document.getElementById('loginSubmitBtn');
  const loginError = document.getElementById('loginError');

  let currentUser = localStorage.getItem('flappy_username') || null;

  function updateAuthUI(){
    if(currentUser){
      loginBtn.classList.add('hidden');
      startUserInfo.classList.remove('hidden');
      startUsername.textContent = currentUser;
      startUserBest.textContent = 'Terbaik: ' + best;
    }else{
      loginBtn.classList.remove('hidden');
      startUserInfo.classList.add('hidden');
    }
  }
  // updateAuthUI() dipanggil setelah variabel `best` diinisialisasi di bawah

  settingsBtn.addEventListener('click', () => {
    if(currentUser){
      openProfile();
    }else{
      loginError.classList.add('hidden');
      loginScreen.classList.remove('hidden');
    }
  });

  async function fetchBestScore(username){
    try{
      const { data, error } = await supabase
        .from('scores')
        .select('score')
        .eq('player_name', username)
        .maybeSingle();
      if(error || !data) return null;
      return data.score;
    }catch(err){
      return null;
    }
  }

  async function syncBestFromServer(username){
    const serverBest = await fetchBestScore(username);
    if(serverBest !== null){
      best = serverBest;
      localStorage.setItem('flappy_best', String(best));
      bestLine.textContent = 'Terbaik: ' + best;
      if(startUserBest) startUserBest.textContent = 'Terbaik: ' + best;
    }
  }

  async function sha256Hex(text){
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  async function handleLoginSubmit(){
    const username = loginUsernameInput.value.trim();
    const password = loginPasswordInput.value;
    loginError.classList.add('hidden');

    if(!username || !password){
      loginError.textContent = 'Isi username & password dulu ya!';
      loginError.classList.remove('hidden');
      return;
    }

    loginSubmitBtn.disabled = true;
    loginSubmitBtn.textContent = 'MEMPROSES...';

    try{
      const passwordHash = await sha256Hex(password);

      const { data: existingUser, error: fetchErr } = await supabase
        .from('users')
        .select('username,password_hash')
        .eq('username', username)
        .maybeSingle();

      if(fetchErr){
        loginError.textContent = 'Gagal terhubung ke server';
        loginError.classList.remove('hidden');
        return;
      }

      if(existingUser){
        if(existingUser.password_hash !== passwordHash){
          loginError.textContent = 'Password salah';
          loginError.classList.remove('hidden');
          return;
        }
      }else{
        const { error: insertErr } = await supabase
          .from('users')
          .insert({ username, password_hash: passwordHash });
        if(insertErr){
          loginError.textContent = 'Gagal mendaftar, coba username lain';
          loginError.classList.remove('hidden');
          return;
        }
      }

      currentUser = username;
      localStorage.setItem('flappy_username', username);
      updateAuthUI();
      loginScreen.classList.add('hidden');
      loginUsernameInput.value = '';
      loginPasswordInput.value = '';
      await syncBestFromServer(currentUser);
    }catch(err){
      loginError.textContent = 'Terjadi kesalahan';
      loginError.classList.remove('hidden');
    }finally{
      loginSubmitBtn.disabled = false;
      loginSubmitBtn.textContent = 'MASUK';
    }
  }

  loginBtn.addEventListener('click', () => {
    loginError.classList.add('hidden');
    loginScreen.classList.remove('hidden');
  });
  loginCloseBtn.addEventListener('click', () => {
    loginScreen.classList.add('hidden');
  });
  loginSubmitBtn.addEventListener('click', handleLoginSubmit);

  async function openProfile(){
    if(!currentUser) return;
    profileUsername.textContent = currentUser;
    profileBest.textContent = 'Skor Terbaik: ' + best;
    profileScreen.classList.remove('hidden');
    await syncBestFromServer(currentUser);
    profileBest.textContent = 'Skor Terbaik: ' + best;
  }
  profileCloseBtn.addEventListener('click', () => {
    profileScreen.classList.add('hidden');
  });
  profileLogoutBtn.addEventListener('click', () => {
    currentUser = null;
    localStorage.removeItem('flappy_username');
    localStorage.removeItem('flappy_best');
    best = 0;
    bestLine.textContent = 'Terbaik: ' + best;
    updateAuthUI();
    profileScreen.classList.add('hidden');
  });

  loginUsernameInput.addEventListener('keydown', (e)=>{ e.stopPropagation(); });
  loginUsernameInput.addEventListener('pointerdown', (e)=>{ e.stopPropagation(); });
  loginPasswordInput.addEventListener('pointerdown', (e)=>{ e.stopPropagation(); });
  loginPasswordInput.addEventListener('keydown', (e)=>{
    e.stopPropagation();
    if(e.key === 'Enter') handleLoginSubmit();
  });

  async function loadLeaderboard(){
    try{
      const { data, error } = await supabase
        .from('scores')
        .select('player_name,score')
        .order('score', { ascending:false })
        .limit(3);

      if(error || !data || data.length === 0){
        leaderboardList.innerHTML = '<li class="lbEmpty">Belum ada skor</li>';
        return;
      }

      leaderboardList.innerHTML = data.map((row, i) => `
        <li>
          <span class="lbNameWrap"><span class="lbRank">${i+1}.</span><span class="lbName">${escapeHtml(row.player_name)}</span></span>
          <span class="lbScore">${row.score}</span>
        </li>
      `).join('');
    }catch(err){
      leaderboardList.innerHTML = '<li class="lbEmpty">Gagal memuat</li>';
    }
  }

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  loadLeaderboard();

  let skyGradient = null;
  function buildSkyGradient(){
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0, '#2b1055');
    g.addColorStop(0.45, '#7b2d6e');
    g.addColorStop(0.8, '#ff7a59');
    g.addColorStop(1, '#ffb570');
    skyGradient = g;
  }

  let W, H, DPR;
  function resize(){
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = stage.clientWidth;
    H = stage.clientHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    ctx.setTransform(DPR,0,0,DPR,0,0);
    buildSkyGradient();
  }
  window.addEventListener('resize', resize);
  resize();

  const GRAVITY = 1500;
  const FLAP_V = -430;
  const PIPE_GAP_BASE = 190;
  const PIPE_W = 68;
  const BIRD_R = 15;
  const GROUND_H = 70;

  let state = 'start'; // start | playing | over
  let bird, pipes, score, best, elapsed, pipeTimer, groundOffset, particles, pipeSpeed, gapSize;

  best = Number(localStorage.getItem('flappy_best') || 0);
  bestLine.textContent = 'Terbaik: ' + best;
  updateAuthUI();
  if(currentUser){
    syncBestFromServer(currentUser);
  }

  function reset(){
    bird = { x: W*0.32, y: H*0.42, vy: 0, rot: 0 };
    pipes = [];
    particles = [];
    score = 0;
    elapsed = 0;
    pipeTimer = 0;
    groundOffset = 0;
    pipeSpeed = 165;
    gapSize = PIPE_GAP_BASE;
    hud.textContent = '0';
  }
  reset();

  function spawnPipe(){
    const margin = 70;
    const usable = H - GROUND_H - margin*2;
    const centerY = margin + Math.random()*usable;
    pipes.push({ x: W + PIPE_W, gapY: centerY, passed:false });
  }

  function flap(){
    if(state === 'start'){
      startGame();
      return;
    }
    if(state === 'over') return;
    bird.vy = FLAP_V;
    playSound('flap');
    for(let i=0;i<5;i++){
      particles.push({
        x: bird.x - 10, y: bird.y + 6,
        vx: -80 - Math.random()*60, vy: (Math.random()-0.5)*60,
        life: 0.4, age:0
      });
    }
  }

  function startGame(){
    reset();
    state = 'playing';
    startScreen.classList.add('hidden');
    overScreen.classList.add('hidden');
    hud.classList.remove('hidden');
    authBar.classList.add('hidden');
  }

  async function saveScore(name, finalScore){
    saveStatus.textContent = 'Menyimpan skor...';
    try{
      const { data: existing } = await supabase
        .from('scores')
        .select('score')
        .eq('player_name', name)
        .maybeSingle();

      if(existing && existing.score >= finalScore){
        saveStatus.textContent = 'Skor tidak lebih tinggi';
        loadLeaderboard();
        return;
      }

      const { error } = await supabase
        .from('scores')
        .upsert({ player_name: name, score: finalScore }, { onConflict: 'player_name' });

      saveStatus.textContent = error ? 'Gagal menyimpan skor' : 'Skor tersimpan';
      if(!error) loadLeaderboard();
    }catch(err){
      saveStatus.textContent = 'Gagal menyimpan skor';
    }
  }

  function endGame(){
    state = 'over';
    playSound('hit');
    if(score > best){
      best = score;
      localStorage.setItem('flappy_best', String(best));
    }
    scoreLine.textContent = 'Skor: ' + score;
    bestLine.textContent = 'Terbaik: ' + best;
    overScreen.classList.remove('hidden');
    hud.classList.add('hidden');
    authBar.classList.remove('hidden');

    if(currentUser){
      saveScore(currentUser, score);
    }else{
      saveStatus.textContent = 'Login untuk menyimpan skor';
    }
  }

  canvas.addEventListener('pointerdown', (e)=>{ e.preventDefault(); flap(); });
  window.addEventListener('keydown', (e)=>{
    if(e.code === 'Space' || e.code === 'ArrowUp'){
      e.preventDefault();
      flap();
    }
  });
  function goHome(){
    reset();
    state = 'start';
    overScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    hud.classList.add('hidden');
    authBar.classList.remove('hidden');
    loadLeaderboard();
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);
  homeBtn.addEventListener('click', goHome);

  function circleRectCollide(cx, cy, r, rx, ry, rw, rh){
    const nx = Math.max(rx, Math.min(cx, rx+rw));
    const ny = Math.max(ry, Math.min(cy, ry+rh));
    const dx = cx - nx, dy = cy - ny;
    return (dx*dx + dy*dy) < r*r;
  }

  let last = performance.now();
  function loop(now){
    const dt = Math.min((now - last)/1000, 1/30);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function update(dt){
    groundOffset -= (state === 'over' ? 0 : pipeSpeed) * dt;
    if(groundOffset < -40) groundOffset += 40;

    for(let i=particles.length-1;i>=0;i--){
      const p = particles[i];
      p.age += dt;
      p.x += p.vx*dt; p.y += p.vy*dt;
      if(p.age > p.life) particles.splice(i,1);
    }

    if(state !== 'playing') return;

    elapsed += dt;
    // Kesulitan naik bertahap tiap kelipatan 100 skor, dan baru mentok
    // (speed & gap maksimal) di skor 1000 (level 10).
    const level = Math.floor(score / 100);
    pipeSpeed = 165 + Math.min(level * 11, 110);
    gapSize = Math.max(PIPE_GAP_BASE - level * 7, 120);

    bird.vy += GRAVITY * dt;
    bird.y += bird.vy * dt;
    bird.rot = Math.max(-0.5, Math.min(1.3, bird.vy/500));

    pipeTimer -= dt;
    if(pipeTimer <= 0){
      spawnPipe();
      pipeTimer = 239 / pipeSpeed; // jaga jarak antar pipa tetap konsisten walau speed naik
    }

    for(let i=pipes.length-1;i>=0;i--){
      const p = pipes[i];
      p.x -= pipeSpeed*dt;

      if(!p.passed && p.x + PIPE_W < bird.x){
        p.passed = true;
        score++;
        playSound('score');
        hud.textContent = String(score);
      }

      const topH = p.gapY - gapSize/2;
      const botY = p.gapY + gapSize/2;
      const botH = H - GROUND_H - botY;

      if(circleRectCollide(bird.x, bird.y, BIRD_R-3, p.x, 0, PIPE_W, topH) ||
         circleRectCollide(bird.x, bird.y, BIRD_R-3, p.x, botY, PIPE_W, botH)){
        endGame();
      }

      if(p.x < -PIPE_W) pipes.splice(i,1);
    }

    if(bird.y + BIRD_R > H - GROUND_H){
      bird.y = H - GROUND_H - BIRD_R;
      endGame();
    }
    if(bird.y - BIRD_R < 0){
      bird.y = BIRD_R;
      bird.vy = 0;
    }
  }

  function drawSky(){
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0,0,W,H);

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#ffd27a';
    ctx.beginPath();
    ctx.arc(W*0.76, H*0.28, 46, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    drawMountainsFar();
    drawMountainsNear();
    drawHousingRow();
  }

  // Lapisan gunung paling jauh: gerak paling lambat (kesan paling jauh)
  function drawMountainsFar(){
    const baseY = H - GROUND_H;
    const tileW = 240;
    const offset = (groundOffset * 0.07) % tileW;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#3a2a55';
    for(let x = -tileW*2 + offset; x < W + tileW; x += tileW){
      drawMountainPeak(x + tileW*0.28, baseY, tileW*0.62, 120);
      drawMountainPeak(x + tileW*0.78, baseY, tileW*0.58, 95);
    }
    ctx.restore();
  }

  // Lapisan gunung dekat: sedikit lebih cepat & lebih tinggi, ada salju di puncak
  function drawMountainsNear(){
    const baseY = H - GROUND_H;
    const tileW = 200;
    const offset = (groundOffset * 0.15) % tileW;
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#221530';
    for(let x = -tileW*2 + offset; x < W + tileW; x += tileW){
      drawMountainPeak(x + tileW*0.3, baseY, tileW*0.72, 160, true);
    }
    ctx.restore();
  }

  function drawMountainPeak(cx, baseY, w, h, withSnow){
    ctx.beginPath();
    ctx.moveTo(cx - w/2, baseY);
    ctx.lineTo(cx - w*0.1, baseY - h);
    ctx.lineTo(cx + w*0.06, baseY - h*0.8);
    ctx.lineTo(cx + w/2, baseY);
    ctx.closePath();
    ctx.fill();

    if(withSnow){
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.moveTo(cx - w*0.1, baseY - h);
      ctx.lineTo(cx - w*0.02, baseY - h*0.86);
      ctx.lineTo(cx + w*0.06, baseY - h*0.8);
      ctx.lineTo(cx - w*0.01, baseY - h*0.82);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // Barisan rumah kecil paling depan, di atas garis tanah: gerak paling cepat
  // (kesan paling dekat) dengan jendela menyala.
  const housePalette = ['#3d2a4a', '#4a3358', '#33263f', '#432c52'];
  function drawHousingRow(){
    const baseY = H - GROUND_H;
    const tileW = 96;
    const offset = (groundOffset * 0.35) % tileW;
    ctx.save();
    ctx.globalAlpha = 0.95;
    let i = 0;
    for(let x = -tileW*2 + offset; x < W + tileW; x += tileW){
      const houseW = 42;
      const houseH = 30 + (i % 3) * 8;
      drawHouse(x + tileW*0.22, baseY, houseW, houseH, housePalette[i % housePalette.length]);
      i++;
    }
    ctx.restore();
  }

  function drawHouse(x, baseY, w, h, color){
    ctx.fillStyle = color;
    ctx.fillRect(x, baseY - h, w, h);

    ctx.beginPath();
    ctx.moveTo(x - 6, baseY - h);
    ctx.lineTo(x + w/2, baseY - h - 16);
    ctx.lineTo(x + w + 6, baseY - h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(255,210,120,0.7)';
    ctx.fillRect(x + w*0.18, baseY - h*0.6, 6, 6);
    ctx.fillRect(x + w*0.6, baseY - h*0.6, 6, 6);
  }

  function drawPipes(){
    for(const p of pipes){
      const topH = p.gapY - gapSize/2;
      const botY = p.gapY + gapSize/2;
      const botH = H - GROUND_H - botY;

      drawPipeSegment(p.x, 0, PIPE_W, topH, true);
      drawPipeSegment(p.x, botY, PIPE_W, botH, false);
    }
  }

  function drawPipeSegment(x, y, w, h, isTop){
    const capH = 26;
    ctx.fillStyle = '#2b6b41';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#3f8a5b';
    ctx.fillRect(x+6, y, w-16, h);
    ctx.fillStyle = '#5fc084';
    ctx.fillRect(x+6, y, 6, h);

    const capY = isTop ? y+h-capH : y;
    ctx.fillStyle = '#2b6b41';
    ctx.fillRect(x-5, capY, w+10, capH);
    ctx.fillStyle = '#4fae72';
    ctx.fillRect(x-5, capY, w+10, 6);
  }

  function drawGround(){
    const y = H - GROUND_H;
    ctx.fillStyle = '#4a2e1f';
    ctx.fillRect(0, y, W, GROUND_H);
    ctx.fillStyle = '#6b4229';
    ctx.fillRect(0, y, W, 10);
    ctx.fillStyle = '#5a3722';
    for(let x = groundOffset; x < W; x += 40){
      ctx.fillRect(x, y+10, 20, 6);
    }
  }

  function drawParticles(){
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for(const p of particles){
      const a = 1 - p.age/p.life;
      ctx.globalAlpha = Math.max(a,0);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawBird(){
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(bird.rot);

    ctx.fillStyle = '#ff9f3f';
    ctx.beginPath();
    ctx.ellipse(0,0, BIRD_R, BIRD_R*0.85, 0, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle = '#ffd27a';
    ctx.beginPath();
    ctx.ellipse(-2,3, BIRD_R*0.6, BIRD_R*0.5, 0, 0, Math.PI*2);
    ctx.fill();

    const wingFlap = Math.sin(performance.now()/80) * 6;
    ctx.fillStyle = '#e8823a';
    ctx.beginPath();
    ctx.ellipse(-4, 2+wingFlap*0.3, BIRD_R*0.55, BIRD_R*0.35, -0.3, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle = '#ff6b3f';
    ctx.beginPath();
    ctx.moveTo(BIRD_R-2, -2);
    ctx.lineTo(BIRD_R+10, 2);
    ctx.lineTo(BIRD_R-2, 6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#1a1023';
    ctx.beginPath();
    ctx.arc(6, -4, 2.4, 0, Math.PI*2);
    ctx.fill();

    ctx.restore();
  }

  function draw(){
    drawSky();
    drawPipes();
    drawParticles();
    drawBird();
    drawGround();
  }

  requestAnimationFrame(loop);
})();
