/// <reference path="./types.d.ts" />
// The Worker: JSON API for online games, the MCP endpoint, and the static app.
// All game rules live in src/shared so the browser and the server cannot drift.

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
  DB: D1Database
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/api/health') {
      return json({ ok: true, app: 'scrabbleish', time: new Date().toISOString() })
    }

    if (url.pathname === '/api/' || url.pathname.startsWith('/api/')) {
      return json({ error: { code: 'not_found', message: 'No such endpoint.' } }, 404)
    }
    if (url.pathname.startsWith('/mcp')) {
      return new Response('Not found', { status: 404 })
    }

    return env.ASSETS.fetch(request)
  }
}
