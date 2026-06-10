import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RAPIDAPI_KEY  = Deno.env.get('RAPIDAPI_KEY') ?? '4f5231439dmshc22c83b5cde5ef3p1d9c86jsn739feb141fa8'
const RAPIDAPI_HOST = 'wc26-live-football-api.p.rapidapi.com'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  const res = await fetch(`https://${RAPIDAPI_HOST}/scorers`, {
    headers: { 'x-rapidapi-host': RAPIDAPI_HOST, 'x-rapidapi-key': RAPIDAPI_KEY },
  })
  if (!res.ok) return json({ error: 'API error', status: res.status }, 502)

  const payload = await res.json()
  return json(payload)
})
