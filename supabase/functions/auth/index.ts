Deno.serve(() =>
  new Response(JSON.stringify({ error: 'This Edge Function has moved to the backend API.' }), {
    status: 410,
    headers: { 'Content-Type': 'application/json' },
  }),
)
