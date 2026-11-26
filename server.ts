import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const MEGAPLAY_ENC_KEY = 'i?LMTAx0Q6,:}50U';
const MEGAPLAY_ENC_IV = "W0;27ToaUpl_P%'c";

interface BuzzServerEntry {
  ref: string;
  k?: string;
  name?: string;
  lang?: string | null;
  flag?: string | null;
}

interface BuzzQPayload {
  type?: string;
  id?: string | number;
  s?: number;
  e?: number;
  t?: string;
  ssr?: {
    status?: string;
    more?: boolean;
    servers?: BuzzServerEntry[];
  };
}

export interface ResolvedBackendServer {
  id: string;
  name: string;
  tag: string;
  note: string;
  flagCode: string;
  sources: {
    id: string;
    label: string;
    quality: string;
    kind: 'hls' | 'mp4';
    url: string;
    note?: string;
    serverName: string;
    serverTag: string;
    flagCode: string;
  }[];
}

function isAllowedHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function buildHlsProxyUrl(targetUrl: string, refererUrl: string): string {
  return `/api/streams/hls?url=${encodeURIComponent(targetUrl)}&ref=${encodeURIComponent(refererUrl)}`;
}

function buildSegProxyUrl(targetUrl: string, refererUrl: string): string {
  return `/api/streams/seg?url=${encodeURIComponent(targetUrl)}&ref=${encodeURIComponent(refererUrl)}`;
}

function extractBalancedJsonObject(source: string, markerRegex: RegExp): string | null {
  const match = markerRegex.exec(source);
  if (!match) return null;
  const startIdx = source.indexOf('{', match.index);
  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIdx; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIdx, i + 1);
      }
    }
  }
  return null;
}

function cleanBuzzServerName(
  rawName: string | undefined,
  rawLang: string | null | undefined,
  idx: number,
): {
  name: string;
  note: string;
  flagCode: string;
} {
  const raw = (rawName || `Server ${idx + 1}`).replace(/^Server\s+/i, '').trim();
  const [codePart, langPart] = raw.split('-');
  const code = (codePart || raw).trim();
  const explicitLang = (rawLang || '').trim();
  const hyphenLang = (langPart || '').trim();
  const lang =
    explicitLang ||
    hyphenLang ||
    (code.toLowerCase() === 'english' ? 'English' : '');

  const lower = lang.toLowerCase();
  let flagCode = 'us';
  if (lower.includes('hindi') || lower.includes('indian')) flagCode = 'in';
  else if (lower.includes('french')) flagCode = 'fr';
  else if (lower.includes('german')) flagCode = 'de';
  else if (lower.includes('spanish') || lower.includes('latino')) flagCode = 'mx';
  else if (lower.includes('russian')) flagCode = 'ru';
  else if (lower.includes('italian')) flagCode = 'it';
  else if (lower.includes('portuguese')) flagCode = 'br';
  else if (lower.includes('arabic')) flagCode = 'sa';
  else if (lower.includes('turkish')) flagCode = 'tr';

  const note = lang
    ? lang.toLowerCase().includes('audio')
      ? lang
      : `${lang} audio`
    : 'Original audio';

  return {
    name: code || `Node ${idx + 1}`,
    note,
    flagCode,
  };
}

async function resolveFromBuzzHost(
  host: string,
  mediaType: 'movie' | 'tv',
  lookupId: string,
  season: number,
  episode: number,
): Promise<ResolvedBackendServer[]> {
  const embedPath =
    mediaType === 'tv'
      ? `/embed/tv/${encodeURIComponent(lookupId)}/${season}/${episode}`
      : `/embed/movie/${encodeURIComponent(lookupId)}`;
  const embedUrl = `${host}${embedPath}`;

  const htmlRes = await fetch(embedUrl, {
    headers: {
      'User-Agent': BROWSER_UA,
      Referer: 'https://www.2embed.cc/',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(7000),
  });
  if (!htmlRes.ok) return [];
  const html = await htmlRes.text();

  const qRaw = extractBalancedJsonObject(html, /(?:var|let|const|window\.)\s*Q\s*=\s*\{/);
  if (!qRaw) return [];

  let qData: BuzzQPayload;
  try {
    qData = JSON.parse(qRaw) as BuzzQPayload;
  } catch {
    return [];
  }

  let servers = [...(qData.ssr?.servers || [])];
  const token = qData.t || '';

  if (servers.length === 0 || qData.ssr?.more) {
    try {
      const qType = qData.type || mediaType;
      const qId = String(qData.id || lookupId);
      const qS = qData.s ?? (mediaType === 'tv' ? season : 0);
      const qE = qData.e ?? (mediaType === 'tv' ? episode : 0);
      const sourcesUrl = `${host}/pl/api.php?a=sources&type=${encodeURIComponent(
        qType,
      )}&id=${encodeURIComponent(qId)}&s=${qS}&e=${qE}${
        token ? `&t=${encodeURIComponent(token)}` : ''
      }&pf=1`;

      const srcRes = await fetch(sourcesUrl, {
        headers: {
          'User-Agent': BROWSER_UA,
          Referer: embedUrl,
        },
        signal: AbortSignal.timeout(6500),
      });
      if (srcRes.ok) {
        const srcJson = (await srcRes.json()) as { servers?: BuzzServerEntry[] };
        const extra = srcJson.servers || [];
        if (extra.length > 0) {
          const seenKeys = new Set(
            servers.map((s) => `${(s.name || '').trim().toLowerCase()}|${(s.lang || '').trim().toLowerCase()}`),
          );
          for (const entry of extra) {
            const key = `${(entry.name || '').trim().toLowerCase()}|${(entry.lang || '').trim().toLowerCase()}`;
            if (entry.ref && !seenKeys.has(key)) {
              seenKeys.add(key);
              servers.push(entry);
            }
          }
          if (servers.length === 0) servers = extra;
        }
      }
    } catch {
      // Ignore fallback source error
    }
  }

  if (servers.length === 0) return [];

  const resolved = await Promise.all(
    servers.map(async (srv, idx): Promise<ResolvedBackendServer | null> => {
      if (!srv.ref) return null;
      try {
        const playUrl = `${host}/pl/api.php?a=play&ref=${encodeURIComponent(srv.ref)}${
          token ? `&t=${encodeURIComponent(token)}` : ''
        }`;
        const playRes = await fetch(playUrl, {
          headers: {
            'User-Agent': BROWSER_UA,
            Referer: embedUrl,
          },
          signal: AbortSignal.timeout(6000),
        });
        if (!playRes.ok) return null;
        const playJson = (await playRes.json()) as { url?: string; type?: string };
        if (!playJson.url) return null;

        const absStreamUrl = new URL(playJson.url, host).toString();
        const isHls =
          playJson.type === 'hls' ||
          absStreamUrl.includes('.m3u8') ||
          absStreamUrl.includes('/_stream');

        // Verify the stream endpoint responds with valid #EXTM3U (for HLS) or HTTP 200
        if (isHls) {
          const checkRes = await fetch(absStreamUrl, {
            headers: {
              'User-Agent': BROWSER_UA,
              Referer: embedUrl,
            },
            signal: AbortSignal.timeout(5500),
          });
          if (!checkRes.ok) return null;
          const body = await checkRes.text();
          if (!body.includes('#EXTM3U')) return null;
        }

        const meta = cleanBuzzServerName(srv.name, srv.lang, idx);
        const tag = `${host.includes('videm') ? 'videm' : 'buzz'}-${meta.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${idx}`;
        const proxiedUrl = isHls
          ? buildHlsProxyUrl(absStreamUrl, embedUrl)
          : buildSegProxyUrl(absStreamUrl, embedUrl);

        return {
          id: tag,
          name: meta.name,
          tag,
          note: meta.note,
          flagCode: srv.flag || meta.flagCode,
          sources: [
            {
              id: `${tag}-auto`,
              label: `${meta.name} · Auto`,
              quality: 'Auto',
              kind: isHls ? 'hls' : 'mp4',
              url: proxiedUrl,
              note: meta.note,
              serverName: meta.name,
              serverTag: tag,
              flagCode: srv.flag || meta.flagCode,
            },
          ],
        };
      } catch {
        return null;
      }
    }),
  );

  return resolved.filter((s): s is ResolvedBackendServer => s !== null);
}

function decryptMegaplayEnc(enc: string): { file?: string } {
  const key = Buffer.alloc(32);
  Buffer.from(MEGAPLAY_ENC_KEY, 'utf8').copy(key);
  const iv = Buffer.alloc(16);
  Buffer.from(MEGAPLAY_ENC_IV, 'utf8').copy(iv);

  const b64 = enc.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64.padEnd(4 * Math.ceil(b64.length / 4), '=');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(padded, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  return JSON.parse(decrypted) as { file?: string };
}

function rewriteM3u8Manifest(manifest: string, baseUrl: string, refererUrl: string): string {
  const base = new URL(baseUrl);
  const lines = manifest.split(/\r?\n/);
  const out: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      out.push(line);
      continue;
    }

    if (trimmed.startsWith('#')) {
      const isPlaylistTag =
        trimmed.startsWith('#EXT-X-MEDIA:') ||
        trimmed.startsWith('#EXT-X-I-FRAME-STREAM-INF:');
      const rewrittenTag = line.replace(/URI="([^"]+)"/g, (_match, rawUri: string) => {
        try {
          const abs = new URL(rawUri, base).toString();
          const proxied =
            isPlaylistTag || abs.includes('.m3u8')
              ? buildHlsProxyUrl(abs, refererUrl)
              : buildSegProxyUrl(abs, refererUrl);
          return `URI="${proxied}"`;
        } catch {
          return `URI="${rawUri}"`;
        }
      });
      out.push(rewrittenTag);
      continue;
    }

    try {
      const abs = new URL(trimmed, base).toString();
      const prevLine = i > 0 ? lines[i - 1].trim() : '';
      const isChildPlaylist =
        prevLine.startsWith('#EXT-X-STREAM-INF') ||
        abs.includes('.m3u8') ||
        abs.includes('/_stream');

      out.push(
        isChildPlaylist
          ? buildHlsProxyUrl(abs, refererUrl)
          : buildSegProxyUrl(abs, refererUrl),
      );
    } catch {
      out.push(line);
    }
  }

  return out.join('\n');
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  // Resolve Movie / TV direct HLS servers
  app.get('/api/streams/resolve', async (req: Request, res: Response) => {
    try {
      const type = String(req.query.type || 'movie') === 'tv' ? 'tv' : 'movie';
      const tmdbId = String(req.query.tmdbId || '').trim();
      const imdbId = String(req.query.imdbId || '').trim();
      const season = Number(req.query.season || 1) || 1;
      const episode = Number(req.query.episode || 1) || 1;

      if (!tmdbId && !imdbId) {
        res.status(400).json({ error: 'Missing tmdbId or imdbId', servers: [] });
        return;
      }

      const idCandidates = [tmdbId, imdbId].filter(Boolean);
      let servers: ResolvedBackendServer[] = [];

      for (const lookupId of idCandidates) {
        servers = await resolveFromBuzzHost('https://vidsrc.buzz', type, lookupId, season, episode);
        if (servers.length > 0) break;
      }

      if (servers.length === 0) {
        for (const lookupId of idCandidates) {
          servers = await resolveFromBuzzHost('https://videm.buzz', type, lookupId, season, episode);
          if (servers.length > 0) break;
        }
      }

      // Prioritize English first, then Original/untagged, then dubbed languages.
      // Within the same language tier, prefer HLS (universal compatibility) over MKV/MP4.
      const languageTier = (srv: ResolvedBackendServer) => {
        const note = srv.note.toLowerCase();
        const name = srv.name.toLowerCase();
        if (note.includes('english') || name === 'english') return 0;
        if (note.includes('original') && srv.flagCode === 'us') return 1;
        return 2;
      };

      servers.sort((a, b) => {
        const tierDiff = languageTier(a) - languageTier(b);
        if (tierDiff !== 0) return tierDiff;
        const aHls = a.sources[0]?.kind === 'hls' ? 0 : 1;
        const bHls = b.sources[0]?.kind === 'hls' ? 0 : 1;
        return aHls - bHls;
      });

      res.json({ servers });
    } catch (err) {
      res.status(500).json({
        error: (err as Error)?.message || 'Failed to resolve stream',
        servers: [],
      });
    }
  });

  // Resolve Anime direct HLS streams via anime.vidy.st + megaplay.buzz AES decrypt
  app.get('/api/streams/anime', async (req: Request, res: Response) => {
    try {
      const serverIds = String(req.query.serverIds || '').trim();
      const audio = String(req.query.audio || 'sub').toLowerCase() === 'dub' ? 'dub' : 'sub';

      if (!serverIds) {
        res.json({ sources: [], subtitles: [] });
        return;
      }

      const srvRes = await fetch(
        `https://anime.vidy.st/api/servers?ids=${encodeURIComponent(serverIds)}`,
        { signal: AbortSignal.timeout(6000) },
      );
      if (!srvRes.ok) {
        res.json({ sources: [], subtitles: [] });
        return;
      }

      const srvJson = (await srvRes.json()) as {
        results?: { type?: string; link_id?: string; name?: string; serverName?: string }[];
      };

      const allEntries = (srvJson.results || []).filter((r) => Boolean(r.link_id));
      const matching = allEntries.filter(
        (r) => !r.type || r.type.toLowerCase() === audio,
      );
      const candidates = matching.length > 0 ? matching : allEntries;

      const sources: {
        id: string;
        label: string;
        quality: string;
        kind: 'hls' | 'mp4';
        url: string;
        note?: string;
        serverName: string;
        serverTag: string;
        flagCode: string;
      }[] = [];
      const subtitles: {
        id: string;
        language: string;
        langCode: string;
        url: string;
        type: 'vtt' | 'srt';
        server: 'stream';
      }[] = [];

      const settled = await Promise.all(
        candidates.slice(0, 4).map(async (entry, i) => {
          if (!entry.link_id) return null;
          try {
            const stRes = await fetch(
              `https://anime.vidy.st/api/stream?id=${encodeURIComponent(entry.link_id)}`,
              { signal: AbortSignal.timeout(6000) },
            );
            if (!stRes.ok) return null;
            const stJson = (await stRes.json()) as { results?: { url?: string | null } };
            const embedUrl = stJson.results?.url;
            if (!embedUrl) return null;

            const srvLabel = entry.name || entry.serverName || `Server ${i + 1}`;
            const tag = `anime-${srvLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${i}`;

            if (embedUrl.includes('.m3u8') || embedUrl.includes('.mp4')) {
              const isHls = embedUrl.includes('.m3u8');
              return {
                source: {
                  id: tag,
                  label: `${srvLabel} (${audio.toUpperCase()})`,
                  quality: 'Auto',
                  kind: isHls ? ('hls' as const) : ('mp4' as const),
                  url: isHls
                    ? buildHlsProxyUrl(embedUrl, 'https://anime.vidy.st/')
                    : buildSegProxyUrl(embedUrl, 'https://anime.vidy.st/'),
                  note: `${audio.toUpperCase()} audio`,
                  serverName: srvLabel,
                  serverTag: tag,
                  flagCode: 'us',
                },
                tracks: [] as typeof subtitles,
              };
            }

            if (embedUrl.includes('megaplay')) {
              const mpHtmlRes = await fetch(embedUrl, {
                headers: {
                  'User-Agent': BROWSER_UA,
                  Referer: 'https://anime.vidy.st/',
                },
                signal: AbortSignal.timeout(6000),
              });
              if (!mpHtmlRes.ok) return null;
              const mpHtml = await mpHtmlRes.text();
              const idMatch = mpHtml.match(/data-id=["']([^"']+)["']/);
              if (!idMatch?.[1]) return null;

              const origin = new URL(embedUrl).origin;
              const srcRes = await fetch(
                `${origin}/stream/getSources?id=${encodeURIComponent(idMatch[1])}`,
                {
                  headers: {
                    'User-Agent': BROWSER_UA,
                    'X-Requested-With': 'XMLHttpRequest',
                    Referer: embedUrl,
                  },
                  signal: AbortSignal.timeout(6000),
                },
              );
              if (!srcRes.ok) return null;
              const srcData = (await srcRes.json()) as {
                enc?: string;
                sources?: { file?: string }[];
                tracks?: { file?: string; label?: string; kind?: string }[];
              };

              let masterUrl = srcData.sources?.[0]?.file || '';
              if (!masterUrl && srcData.enc) {
                try {
                  const decoded = decryptMegaplayEnc(srcData.enc);
                  if (decoded.file) masterUrl = decoded.file;
                } catch {
                  // Ignore decrypt failure
                }
              }

              if (masterUrl) {
                const tracks: typeof subtitles = [];
                for (const tr of srcData.tracks || []) {
                  if (!tr.file || tr.kind === 'thumbnails') continue;
                  const lang = tr.label || 'English';
                  tracks.push({
                    id: `mp-sub-${i}-${tracks.length}`,
                    language: lang,
                    langCode: lang.slice(0, 2).toLowerCase(),
                    url: tr.file,
                    type: tr.file.toLowerCase().includes('.vtt') ? 'vtt' : 'srt',
                    server: 'stream',
                  });
                }
                return {
                  source: {
                    id: tag,
                    label: `${srvLabel} (${audio.toUpperCase()})`,
                    quality: '1080p',
                    kind: 'hls' as const,
                    url: buildHlsProxyUrl(masterUrl, `${origin}/`),
                    note: `${audio.toUpperCase()} audio`,
                    serverName: srvLabel,
                    serverTag: tag,
                    flagCode: 'us',
                  },
                  tracks,
                };
              }
            }
          } catch {
            // Try next anime server
          }
          return null;
        }),
      );

      for (const entry of settled) {
        if (!entry) continue;
        sources.push(entry.source);
        if (subtitles.length === 0 && entry.tracks.length > 0) {
          subtitles.push(...entry.tracks);
        }
      }

      res.json({ sources, subtitles });
    } catch (err) {
      res.status(500).json({
        error: (err as Error)?.message || 'Failed to resolve anime stream',
        sources: [],
        subtitles: [],
      });
    }
  });

  // HLS Playlist Proxy (rewrites relative & external segment/child playlist URIs)
  app.get('/api/streams/hls', async (req: Request, res: Response) => {
    try {
      const targetUrl = String(req.query.url || '');
      const ref = String(req.query.ref || '');
      if (!isAllowedHttpUrl(targetUrl)) {
        res.status(400).send('Invalid URL');
        return;
      }

      const refUrl = isAllowedHttpUrl(ref) ? ref : new URL(targetUrl).origin + '/';
      const upstream = await fetch(targetUrl, {
        headers: {
          'User-Agent': BROWSER_UA,
          Referer: refUrl,
          Origin: new URL(refUrl).origin,
        },
        signal: AbortSignal.timeout(12000),
      });

      if (!upstream.ok) {
        res.status(upstream.status).send(`Upstream HTTP ${upstream.status}`);
        return;
      }

      const manifest = await upstream.text();
      const rewritten = rewriteM3u8Manifest(manifest, upstream.url || targetUrl, refUrl);

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.send(rewritten);
    } catch (err) {
      res.status(502).send((err as Error)?.message || 'HLS proxy failed');
    }
  });

  // Segment & Binary Media Proxy
  app.get('/api/streams/seg', async (req: Request, res: Response) => {
    try {
      const targetUrl = String(req.query.url || '');
      const ref = String(req.query.ref || '');
      if (!isAllowedHttpUrl(targetUrl)) {
        res.status(400).send('Invalid URL');
        return;
      }

      const refUrl = isAllowedHttpUrl(ref) ? ref : new URL(targetUrl).origin + '/';
      const reqHeaders: Record<string, string> = {
        'User-Agent': BROWSER_UA,
        Referer: refUrl,
        Origin: new URL(refUrl).origin,
      };
      if (typeof req.headers.range === 'string') {
        reqHeaders.Range = req.headers.range;
      }

      const upstream = await fetch(targetUrl, {
        headers: reqHeaders,
        signal: AbortSignal.timeout(20000),
      });

      if (!upstream.ok && upstream.status !== 206) {
        res.status(upstream.status).send(`Segment HTTP ${upstream.status}`);
        return;
      }

      const needsStrip = /ibyteimg\.com|tiktokcdn\.com|ipstatp\.com|yoot\.akirax\.buzz/i.test(
        targetUrl,
      );

      res.status(upstream.status);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=300');

      const ct = upstream.headers.get('content-type') || '';
      // vidsrc.buzz & anime CDNs disguise MPEG-TS segments with .jpg / image/* headers
      const finalCt =
        needsStrip || ct.startsWith('image/') || targetUrl.includes('.jpg')
          ? 'video/mp2t'
          : ct || 'application/octet-stream';
      res.setHeader('Content-Type', finalCt);

      if (needsStrip) {
        const rawBuf = Buffer.from(await upstream.arrayBuffer());
        const outBuf = rawBuf.length > 252 ? rawBuf.subarray(252) : rawBuf;
        res.setHeader('Content-Length', String(outBuf.length));
        res.send(outBuf);
        return;
      }

      const cl = upstream.headers.get('content-length');
      if (cl) res.setHeader('Content-Length', cl);
      const cr = upstream.headers.get('content-range');
      if (cr) res.setHeader('Content-Range', cr);
      const ar = upstream.headers.get('accept-ranges');
      if (ar) res.setHeader('Accept-Ranges', ar);

      if (!upstream.body) {
        res.end();
        return;
      }

      const nodeStream = Readable.fromWeb(
        upstream.body as unknown as Parameters<typeof Readable.fromWeb>[0],
      );
      nodeStream.on('error', () => {
        if (!res.headersSent) res.status(502);
        res.end();
      });
      res.on('close', () => {
        nodeStream.destroy();
      });
      nodeStream.pipe(res);
    } catch (err) {
      if (!res.headersSent) {
        res.status(502).send((err as Error)?.message || 'Segment proxy failed');
      }
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.use((_req, res) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Build not found');
      }
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Moviesx server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
