Deno.serve(() =>
  new Response(JSON.stringify({ error: 'This Edge Function has moved to /api/upload/gcs.' }), {
    status: 410,
    headers: { 'Content-Type': 'application/json' },
  }),
)
