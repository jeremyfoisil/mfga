import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = "https://sazupuqxwrnvgzsdxkjg.supabase.co"
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhenVwdXF4d3Judmd6c2R4a2pnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNzc1MTEsImV4cCI6MjA5NDg1MzUxMX0.j2vQhrzFDDoaMV9i6CDIvF_9vpenDSFZ5julcjfXIBE"

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON)
