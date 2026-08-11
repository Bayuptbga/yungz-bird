(function(){
  const SUPABASE_URL = 'https://ahaojtuqxfmaysniyxei.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoYW9qdHVxeGZtYXlzbml5eGVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NDc4MTYsImV4cCI6MjEwMjAyMzgxNn0.e5u-wpLnNkIMm_f5nla4jfBUqPYKT6iEuDEr-tXJEVs';
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
  const nameInput = document.getElementById('nameInput');
  const nameError = document.getElementById('nameError');

  nameInput.value = localStorage.getItem('flappy_player_name') || '';

  let W, H, DPR;
  function resize(){
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = stage.clientWidth;
    H = stage.clientHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    ctx.setTransform(DPR,0,0,DPR,0,0);
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
    for(let i=0;i<5;i++){
      particles.push({
        x: bird.x - 10, y: bird.y + 6,
        vx: -80 - Math.random()*60, vy: (Math.random()-0.5)*60,
        life: 0.4, age:0
      });
    }
  }

  function startGame(){
    const name = nameInput.value.trim();
    if(!name){
      nameError.classList.remove('hidden');
      nameInput.focus();
      return;
    }
    nameError.classList.add('hidden');
    localStorage.setItem('flappy_player_name', name);

    reset();
    state = 'playing';
    startScreen.classList.add('hidden');
    overScreen.classList.add('hidden');
  }

  async function saveScore(name, finalScore){
    saveStatus.textContent = 'Menyimpan skor...';
    try{
      const { error } = await supabase.from('scores').insert({
        player_name: name,
        score: finalScore
      });
      saveStatus.textContent = error ? 'Gagal menyimpan skor' : 'Skor tersimpan';
    }catch(err){
      saveStatus.textContent = 'Gagal menyimpan skor';
    }
  }

  function endGame(){
    state = 'over';
    if(score > best){
      best = score;
      localStorage.setItem('flappy_best', String(best));
    }
    scoreLine.textContent = 'Skor: ' + score;
    bestLine.textContent = 'Terbaik: ' + best;
    overScreen.classList.remove('hidden');

    const playerName = localStorage.getItem('flappy_player_name') || 'Anon';
    saveScore(playerName, score);
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
  }

  nameInput.addEventListener('keydown', (e)=>{ e.stopPropagation(); });
  nameInput.addEventListener('pointerdown', (e)=>{ e.stopPropagation(); });
  nameInput.addEventListener('keyup', (e)=>{
    if(e.key === 'Enter') startGame();
  });

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
    pipeSpeed = 165 + Math.min(elapsed*2.2, 70);
    gapSize = Math.max(PIPE_GAP_BASE - elapsed*1.1, 132);

    bird.vy += GRAVITY * dt;
    bird.y += bird.vy * dt;
    bird.rot = Math.max(-0.5, Math.min(1.3, bird.vy/500));

    pipeTimer -= dt;
    if(pipeTimer <= 0){
      spawnPipe();
      pipeTimer = 1.45;
    }

    for(let i=pipes.length-1;i>=0;i--){
      const p = pipes[i];
      p.x -= pipeSpeed*dt;

      if(!p.passed && p.x + PIPE_W < bird.x){
        p.passed = true;
        score++;
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
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0, '#2b1055');
    g.addColorStop(0.45, '#7b2d6e');
    g.addColorStop(0.8, '#ff7a59');
    g.addColorStop(1, '#ffb570');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,W,H);

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#ffd27a';
    ctx.beginPath();
    ctx.arc(W*0.76, H*0.28, 46, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#1a1023';
    for(let i=0;i<3;i++){
      const bx = ((W*0.2*i + W*0.1) - groundOffset*0.15*(i+1)) % (W+200) - 100;
      drawHillSilhouette(bx, H-GROUND_H, 180+i*40, 90+i*20);
    }
    ctx.restore();
  }

  function drawHillSilhouette(cx, baseY, w, h){
    ctx.beginPath();
    ctx.moveTo(cx-w/2, baseY);
    ctx.quadraticCurveTo(cx, baseY-h, cx+w/2, baseY);
    ctx.closePath();
    ctx.fill();
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
