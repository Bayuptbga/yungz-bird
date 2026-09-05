import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://kuocqeaolhinzvrrdfti.supabase.co';
const SUPABASE_KEY = 'sb_publishable__eHAiIrB-pERNeb42dJpqg_yE6pcSyv';

// Sesi disimpan di memori saja (bukan localStorage) karena keterbatasan lingkungan artifact.
// Efeknya: reload halaman = perlu login ulang. Ini sengaja, bukan bug.
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false }
});
