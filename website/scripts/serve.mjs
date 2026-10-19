import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { renderChangelog } from './changelog.mjs';
const root = new URL('../', import.meta.url);
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
  ['/CHANGELOG.md', ['../CHANGELOG.md', 'text/markdown; charset=utf-8']],
  ['/THIRD_PARTY_NOTICES.txt', ['THIRD_PARTY_NOTICES.txt', 'text/plain; charset=utf-8']],
]);
const port = Number(process.env.PORT || 4321);
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/changelog.html') {
    try {
      const releases = JSON.parse(await readFile(new URL('releases.json', root), 'utf8'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(renderChangelog(releases));
    } catch { res.writeHead(500); res.end('Unable to render release history'); }
    return;
  }
  const entry = files.get(pathname);
  if (!entry) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const data = await readFile(fileURLToPath(new URL(entry[0], root)));
    res.writeHead(200, { 'Content-Type': entry[1], 'Cache-Control': 'no-store' });
    res.end(data);
  } catch { res.writeHead(500); res.end('Unable to read site file'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Local: http://localhost:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
