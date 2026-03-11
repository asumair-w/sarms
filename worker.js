/**
 * SPA fallback: serve index.html for any path that has no static asset.
 * Fixes 404 on refresh for /engineer/inventory, /admin/settings, etc.
 */
export default {
  async fetch(request, env) {
    if (!env.ASSETS) {
      return new Response('ASSETS not configured', { status: 500 });
    }
    const url = new URL(request.url);
    const response = await env.ASSETS.fetch(request);

    if (response.status === 404) {
      const base = url.origin;
      let indexResponse = await env.ASSETS.fetch(new Request(base + '/index.html', { method: 'GET' }));
      if (indexResponse.status === 404) {
        indexResponse = await env.ASSETS.fetch(new Request(base + '/', { method: 'GET' }));
      }
      if (indexResponse.ok) return indexResponse;
    }
    return response;
  },
};
