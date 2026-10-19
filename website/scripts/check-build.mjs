import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
const root = new URL('../dist/', import.meta.url);
for (const page of ['index.html', 'changelog.html']) {
  const html = await readFile(new URL(page, root), 'utf8');
  assert.ok(html.includes('<main'), `${page} has no main content`);
  for (const [, path] of html.matchAll(/(?:href|src)="\.\/([^"#]+)(?:#[^"]*)?"/g)) {
    assert.ok((await stat(new URL(path, root))).isFile(), `Missing asset: ${path}`);
  }
}
await stat(new URL('CHANGELOG.md', root));
console.log('Built homepage, changelog, local assets and Markdown download verified.');
