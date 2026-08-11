(function(){
  const SUPABASE_URL = 'https://ahaojtuqxfmaysniyxei.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoYW9qdHVxeGZtYXlzbml5eGVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NDc4MTYsImV4cCI6MjEwMjAyMzgxNn0.e5u-wpLnNkIMm_f5nla4jfBUqPYKT6iEuDEr-tXJEVs';
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const lbMoreBtn = document.getElementById('lbMoreBtn');
  const lbBackBtn = document.getElementById('lbBackBtn');
  const lbFullScreen = document.getElementById('lbFullScreen');
  const lbFullList = document.getElementById('lbFullList');
  const startScreen = document.getElementById('startScreen');

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function rankClass(i){
    if(i === 0) return 'lbTop1';
    if(i === 1) return 'lbTop2';
    if(i === 2) return 'lbTop3';
    return '';
  }

  async function loadFullLeaderboard(){
    lbFullList.innerHTML = '<li class="lbStatusText" style="width:100%;list-style:none;">Memuat...</li>';
    try{
      const { data, error } = await supabase
        .from('scores')
        .select('player_name,score')
        .order('score', { ascending:false })
        .limit(100);

      if(error){
        lbFullList.innerHTML = '<li class="lbStatusText" style="width:100%;list-style:none;">Gagal memuat leaderboard</li>';
        return;
      }

      if(!data || data.length === 0){
        lbFullList.innerHTML = '<li class="lbStatusText" style="width:100%;list-style:none;">Belum ada skor</li>';
        return;
      }

      lbFullList.innerHTML = data.map((row, i) => `
        <li class="${rankClass(i)}">
          <span class="lbRank">${i+1}.</span>
          <span class="lbName">${escapeHtml(row.player_name || 'Anon')}</span>
          <span class="lbScore">${row.score}</span>
        </li>
      `).join('');
    }catch(err){
      lbFullList.innerHTML = '<li class="lbStatusText" style="width:100%;list-style:none;">Gagal memuat leaderboard</li>';
    }
  }

  if(lbMoreBtn){
    lbMoreBtn.addEventListener('click', () => {
      startScreen.classList.add('hidden');
      lbFullScreen.classList.remove('hidden');
      loadFullLeaderboard();
    });
  }

  if(lbBackBtn){
    lbBackBtn.addEventListener('click', () => {
      lbFullScreen.classList.add('hidden');
      startScreen.classList.remove('hidden');
    });
  }
})();
