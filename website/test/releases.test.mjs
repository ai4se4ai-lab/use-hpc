import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { collectReleases, updateChangelog, synchronizeReleases } from '../../.github/scripts/releases.mjs';
import { renderChangelog } from '../scripts/changelog.mjs';

const repository = { owner: 'example', repo: 'use-hpc' };
function release(tag, extra = {}) {
  return { id: 1, tag_name: tag, name: tag, html_url: `https://github.com/example/use-hpc/releases/tag/${tag}`, published_at: '2026-10-01T12:00:00Z', body: 'Changes', draft: false, prerelease: false, ...extra };
}
function client(items) {
  const requests = [];
  return {
    requests,
    async paginate(method, options) { assert.equal(options.per_page, 100); return items; },
    rest: { repos: {
      listReleases() {},
      async generateReleaseNotes(options) { requests.push(options); return { data: { body: 'Generated changes' } }; },
    } },
  };
}

test('all releases are sorted; drafts excluded; prereleases labeled; blank notes generated', async () => {
  const github = client([
    release('v1'),
    release('draft', { draft: true }),
    release('v2-beta', { body: '', prerelease: true, published_at: '2026-10-15T12:00:00Z' }),
  ]);
  const data = await collectReleases(github, repository);
  assert.deepEqual(data.releases.map(item => item.tag), ['v2-beta', 'v1']);
  assert.equal(data.releases[0].body, 'Generated changes');
  assert.equal(data.releases[0].prerelease, true);
  assert.equal(github.requests[0].previous_tag_name, 'v1');
  const changelog = updateChangelog('', data);
  assert.ok(changelog.includes('(pre-release)'));
  assert.equal(updateChangelog(changelog, data), changelog);
});

test('editing, deleting and backfilling releases preserve manual development notes', async () => {
  const first = await collectReleases(client([release('v1')]), repository);
  const initial = updateChangelog('', first).replace('## Unreleased\n', '## Unreleased\n\nManual plans.\n');
  const edited = await collectReleases(client([release('v1', { body: 'Corrected notes' })]), repository);
  const updated = updateChangelog(initial, edited);
  assert.ok(updated.includes('Manual plans.'));
  assert.ok(updated.includes('Corrected notes'));
  assert.equal((updated.match(/## \[v1\]/g) || []).length, 1);
  const removed = updateChangelog(updated, { repository: 'example/use-hpc', releases: [] });
  assert.ok(!removed.includes('Corrected notes'));
  assert.ok(removed.includes('No published releases yet.'));
  assert.throws(() => updateChangelog('# Manual file without markers', first), /marker pair/);
});

test('reserved marker text cannot corrupt subsequent changelog synchronizations', async () => {
  const data = await collectReleases(client([release('v1', { body: '<!-- releases:end -->\n<!-- releases:start -->' })]), repository);
  const first = updateChangelog('', data);
  assert.equal(updateChangelog(first, data), first);
});

test('release content is escaped; URLs are derived from the repository and tag', async () => {
  const data = await collectReleases(client([release('v1', { name: '<script>alert(1)</script>', body: '<img src=x onerror=alert(1)>', html_url: 'javascript:alert(1)' })]), repository);
  const page = renderChangelog(data);
  assert.ok(!page.includes('<script>'));
  assert.ok(!page.includes('<img src=x'));
  assert.ok(!page.includes('javascript:'));
  assert.ok(page.includes('&lt;img'));
  assert.ok(page.includes('https://github.com/example/use-hpc/releases/tag/v1'));
  assert.throws(() => renderChangelog({ repository: 'bad" onclick="x', releases: [] }));
});

test('API failures stop the update rather than emitting incomplete history', async () => {
  const github = client([release('v1', { body: '' })]);
  github.rest.repos.generateReleaseNotes = async () => { throw new Error('API unavailable'); };
  await assert.rejects(() => collectReleases(github, repository), /API unavailable/);
});

test('synchronization writes matching Markdown and site data and is repeatable', async t => {
  const tempRoot = resolve(tmpdir());
  const root = await mkdtemp(join(tempRoot, 'use-hpc-release-'));
  t.after(async () => {
    assert.equal(dirname(resolve(root)), tempRoot);
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(join(root, 'website'));
  const github = client([release('v1')]);
  await synchronizeReleases({ github, repository, root });
  const markdown = await readFile(join(root, 'CHANGELOG.md'), 'utf8');
  const json = JSON.parse(await readFile(join(root, 'website/releases.json'), 'utf8'));
  assert.equal(json.releases[0].tag, 'v1');
  assert.ok(markdown.includes(json.releases[0].body));
  assert.ok(renderChangelog(json).includes('releases/tag/v1'));
  await synchronizeReleases({ github, repository, root });
  assert.equal(await readFile(join(root, 'CHANGELOG.md'), 'utf8'), markdown);
  await writeFile(join(root, 'CHANGELOG.md'), 'Missing markers');
  await assert.rejects(() => synchronizeReleases({ github, repository, root }), /marker pair/);
  assert.equal(JSON.parse(await readFile(join(root, 'website/releases.json'), 'utf8')).releases[0].tag, 'v1');
});
