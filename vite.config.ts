import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function imdbResolveDevPlugin(): Plugin {
  return {
    name: 'cue-imdb-resolve-dev',
    configureServer(server) {
      server.middlewares.use('/api/imdb-resolve', async (req, res, next) => {
        try {
          let rawIds: unknown[] = [];
          if (req.method === 'GET') {
            const url = new URL(req.url || '/', 'http://localhost');
            rawIds = (url.searchParams.get('ids') || '').split(',');
          } else if (req.method === 'POST') {
            const chunks: Uint8Array[] = [];
            for await (const chunk of req) {
              chunks.push(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk);
            }
            const totalLen = chunks.reduce((acc, c) => acc + c.byteLength, 0);
            const merged = new Uint8Array(totalLen);
            let offset = 0;
            for (const c of chunks) {
              merged.set(c, offset);
              offset += c.byteLength;
            }
            const parsed = JSON.parse(new TextDecoder().decode(merged) || '{}') as {
              ids?: unknown;
            };
            rawIds = Array.isArray(parsed.ids) ? parsed.ids : [];
          } else if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            res.end();
            return;
          } else {
            next();
            return;
          }

          const seen = new Set<string>();
          const ids: string[] = [];
          for (const item of rawIds) {
            if (typeof item !== 'string') continue;
            const clean = item.trim().toLowerCase();
            if (!/^tt\d{5,12}$/.test(clean) || seen.has(clean)) continue;
            seen.add(clean);
            ids.push(clean);
            if (ids.length >= 40) break;
          }

          const items: Record<string, unknown> = {};
          const concurrency = 10;
          for (let i = 0; i < ids.length; i += concurrency) {
            const slice = ids.slice(i, i + concurrency);
            const settled = await Promise.all(
              slice.map(async (id) => {
                try {
                  const r = await fetch(`https://v3.sg.media-imdb.com/suggestion/x/${id}.json`, {
                    headers: { Accept: 'application/json' },
                    signal: AbortSignal.timeout(5000),
                  });
                  if (!r.ok) return [id, null] as const;
                  const data = (await r.json()) as {
                    d?: Array<{
                      id?: string;
                      l?: string;
                      q?: string;
                      qid?: string;
                      y?: number;
                      s?: string;
                      i?: { imageUrl?: string };
                    }>;
                  };
                  const entries = Array.isArray(data.d) ? data.d : [];
                  const match =
                    entries.find((e) => (e.id || '').toLowerCase() === id) ||
                    (entries[0] && (entries[0].id || '').toLowerCase() === id
                      ? entries[0]
                      : undefined);
                  if (!match?.l) return [id, null] as const;
                  return [
                    id,
                    {
                      id,
                      title: match.l.trim(),
                      qid: match.qid || '',
                      q: match.q || '',
                      year: typeof match.y === 'number' ? match.y : undefined,
                      posterUrl: match.i?.imageUrl || '',
                      cast: match.s || '',
                    },
                  ] as const;
                } catch {
                  return [id, null] as const;
                }
              })
            );
            for (const [id, info] of settled) {
              items[id] = info;
            }
          }

          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ items }));
        } catch {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 400;
          res.end(JSON.stringify({ items: {}, error: 'Bad request' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), imdbResolveDevPlugin()],
})
