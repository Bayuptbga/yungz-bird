// Menyimpan semua data skin dan logika gambarnya
window.SKINS_DATA = [
  // --- SKIN BASIC (WARNA) ---
  { id: 'default', name: 'Si Kuning', price: 0, type: 'normal', colors: { body: '#ff9f3f', belly: '#ffd27a', wing: '#e8823a', beak: '#ff6b3f' } },
  { id: 'blue', name: 'Si Biru', price: 100, type: 'normal', colors: { body: '#3fa3ff', belly: '#7ad2ff', wing: '#3a8ee8', beak: '#ffc13f' } },
  { id: 'red', name: 'Si Merah', price: 150, type: 'normal', colors: { body: '#ff3f3f', belly: '#ff7a7a', wing: '#e83a3a', beak: '#ffc13f' } },
  { id: 'green', name: 'Si Hijau', price: 150, type: 'normal', colors: { body: '#4caf50', belly: '#a5d6a7', wing: '#388e3c', beak: '#ffb300' } },
  { id: 'pink', name: 'Si Imut', price: 200, type: 'normal', colors: { body: '#ff6699', belly: '#ffb3cc', wing: '#d84b7a', beak: '#ffc13f' } },
  { id: 'dark', name: 'Si Gelap', price: 300, type: 'normal', colors: { body: '#444444', belly: '#777777', wing: '#222222', beak: '#ff4444' } },
  
  // --- SKIN THEMATIC (DENGAN AKSESORIS) ---
  { id: 'garuda', name: 'Garuda Nusantara', price: 500, type: 'normal', acc: 'headband', colors: { body: '#ffffff', belly: '#e0e0e0', wing: '#ff0000', beak: '#ffc13f' } },
  { id: 'nelayan', name: 'Nelayan Pesisir', price: 600, type: 'normal', acc: 'caping', colors: { body: '#8c5a35', belly: '#d4a373', wing: '#5c3a21', beak: '#ffc13f' } },
  { id: 'dj', name: 'DJ Breakbeat', price: 800, type: 'normal', acc: 'headphone', colors: { body: '#9c27b0', belly: '#e1bee7', wing: '#7b1fa2', beak: '#ffeb3b' } },
  { id: 'striker', name: 'Striker Bintang', price: 1000, type: 'normal', acc: 'striker', colors: { body: '#e53935', belly: '#ffffff', wing: '#b71c1c', beak: '#ffb300' } },
  { id: 'zombie', name: 'Zombird', price: 1200, type: 'normal', acc: 'zombie', colors: { body: '#689f38', belly: '#33691e', wing: '#1b5e20', beak: '#5d4037' } },
  
  // --- SKIN SPESIAL (BEDA BENTUK) ---
  { id: 'cyborg', name: 'Robo-X', price: 1500, type: 'cyborg', colors: { body: '#546e7a', belly: '#78909c', wing: '#37474f', beak: '#ffb300', eye: '#00e5ff' } },
  { id: 'golden', name: 'Sultan Emas', price: 3000, type: 'normal', acc: 'crown', colors: { body: '#ffea00', belly: '#fff59d', wing: '#fbc02d', beak: '#ff8f00' } }
];

window.drawBirdSkin = function(ctx, b, skinConfig, isGhostTransparent) {
    const BIRD_R = 15;
    ctx.save(); 
    ctx.translate(b.x, b.y); 
    ctx.rotate(b.rot);
    
    if(isGhostTransparent) {
        ctx.globalAlpha = 0.15; 
    } else {
        ctx.globalAlpha = 1.0; 
        // Efek glow khusus untuk Sultan Emas
        if(skinConfig.id === 'golden') {
            ctx.shadowColor = '#ffea00';
            ctx.shadowBlur = 15;
        }
    }

    const c = skinConfig.colors;
    const type = skinConfig.type || 'normal';
    const acc = skinConfig.acc || null;
    const wingFlap = Math.sin(performance.now()/80) * 6;

    if (type === 'cyborg') {
        // TAMPILAN CYBORG (KOTAK)
        ctx.fillStyle = c.body; 
        ctx.fillRect(-BIRD_R, -BIRD_R*0.85, BIRD_R*2, BIRD_R*1.7);
        
        ctx.fillStyle = c.belly; 
        ctx.fillRect(-BIRD_R+2, 2, BIRD_R*1.6, BIRD_R*0.8);
        
        ctx.fillStyle = c.wing; 
        ctx.fillRect(-8, 2+wingFlap*0.3, BIRD_R*1.2, BIRD_R*0.7);
        
        // Paruh Kotak
        ctx.fillStyle = c.beak; 
        ctx.fillRect(BIRD_R-2, -2, 12, 8);
        
        // Mata Laser
        ctx.fillStyle = '#111';
        ctx.fillRect(2, -8, 10, 8);
        ctx.fillStyle = c.eye || '#ff0000';
        ctx.shadowColor = c.eye || '#ff0000';
        ctx.shadowBlur = 10;
        ctx.fillRect(4, -6, 6, 4);
        ctx.shadowBlur = 0; // Reset
    } 
    else {
        // TAMPILAN NORMAL (BULAT OVAL)
        ctx.fillStyle = c.body; ctx.beginPath(); ctx.ellipse(0,0, BIRD_R, BIRD_R*0.85, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = c.belly; ctx.beginPath(); ctx.ellipse(-2,3, BIRD_R*0.6, BIRD_R*0.5, 0, 0, Math.PI*2); ctx.fill();
        
        ctx.fillStyle = c.wing; ctx.beginPath(); ctx.ellipse(-4, 2+wingFlap*0.3, BIRD_R*0.55, BIRD_R*0.35, -0.3, 0, Math.PI*2); ctx.fill();
        
        ctx.fillStyle = c.beak; ctx.beginPath(); ctx.moveTo(BIRD_R-2, -2); ctx.lineTo(BIRD_R+10, 2); ctx.lineTo(BIRD_R-2, 6); ctx.closePath(); ctx.fill();
        
        // Mata
        if (acc === 'zombie') {
            // Mata Zombie (X)
            ctx.strokeStyle = '#1a1023'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(4,-6); ctx.lineTo(8,-2); ctx.moveTo(8,-6); ctx.lineTo(4,-2); ctx.stroke();
        } else if (acc === 'headphone') {
            // Kacamata Hitam DJ
            ctx.fillStyle = '#111'; ctx.fillRect(2, -7, 12, 6);
        } else {
            ctx.fillStyle = '#1a1023'; ctx.beginPath(); ctx.arc(6, -4, 2.4, 0, Math.PI*2); ctx.fill();
        }
    }

    // --- AKSESORIS TAMBAHAN ---
    ctx.shadowBlur = 0; // Pastikan shadow mati untuk aksesoris
    if (acc === 'headband' || acc === 'striker') {
        // Ikat Kepala Merah Putih
        ctx.fillStyle = '#ff0000'; ctx.fillRect(-BIRD_R*0.8, -BIRD_R*0.8, BIRD_R*1.6, 4);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(-BIRD_R*0.8, -BIRD_R*0.8 + 4, BIRD_R*1.6, 4);
        // Tali ikat kepala berkibar di belakang
        ctx.fillStyle = '#ff0000'; ctx.fillRect(-BIRD_R-6, -BIRD_R*0.6 + wingFlap*0.2, 8, 3);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(-BIRD_R-6, -BIRD_R*0.6 + 3 + wingFlap*0.2, 8, 3);
    }
    
    if (acc === 'caping') {
        // Topi Nelayan (Caping)
        ctx.fillStyle = '#d4a373';
        ctx.beginPath(); ctx.moveTo(0, -BIRD_R - 8); ctx.lineTo(BIRD_R+4, -BIRD_R + 2); ctx.lineTo(-BIRD_R-4, -BIRD_R + 2); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#8c5a35'; ctx.lineWidth = 1; ctx.stroke();
    }
    
    if (acc === 'headphone') {
        // Headphone DJ
        ctx.strokeStyle = '#333'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, -2, BIRD_R*0.9, Math.PI, 0); ctx.stroke();
        ctx.fillStyle = '#ffeb3b';
        ctx.beginPath(); ctx.ellipse(BIRD_R-2, -2, 4, 6, 0, 0, Math.PI*2); ctx.fill(); // Kanan
        ctx.beginPath(); ctx.ellipse(-BIRD_R+2, -2, 4, 6, 0, 0, Math.PI*2); ctx.fill(); // Kiri
    }
    
    if (acc === 'crown') {
        // Mahkota Sultan
        ctx.fillStyle = '#ffb300';
        ctx.beginPath(); ctx.moveTo(-6, -BIRD_R + 2); ctx.lineTo(-8, -BIRD_R - 6); ctx.lineTo(-2, -BIRD_R - 2); ctx.lineTo(0, -BIRD_R - 8); ctx.lineTo(2, -BIRD_R - 2); ctx.lineTo(8, -BIRD_R - 6); ctx.lineTo(6, -BIRD_R + 2); ctx.closePath(); ctx.fill();
    }

    ctx.restore();
};
