import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { renderChangelog } from './changelog.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(`${root}dist`, { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.js', 'favicon.svg', 'releases.json', 'THIRD_PARTY_NOTICES.txt']) {
  await copyFile(`${root}${file}`, `${root}dist/${file}`);
}
const releases = JSON.parse(await readFile(`${root}releases.json`, 'utf8'));
await writeFile(`${root}dist/changelog.html`, renderChangelog(releases));
await copyFile(new URL('../../CHANGELOG.md', import.meta.url), `${root}dist/CHANGELOG.md`);
await writeFile(`${root}dist/.nojekyll`, '');
console.log('Built static website in website/dist/');
