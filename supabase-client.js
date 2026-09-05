import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://kuocqeaolhinzvrrdfti.supabase.co';
const SUPABASE_KEY = 'sb_publishable__eHAiIrB-pERNeb42dJpqg_yE6pcSyv';

// Sesi disimpan di localStorage browser supaya reload halaman tidak logout.
// (Catatan: kalau file ini dijalankan di dalam preview artifact Claude, localStorage
// dibatasi dan baris ini otomatis fallback ke sesi in-memory oleh library Supabase.)
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});
