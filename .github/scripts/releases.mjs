import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const START = '<!-- releases:start -->';
const END = '<!-- releases:end -->';
export const changelogHeader = `# Changelog\n\nPublished release history is synchronized automatically from GitHub Releases.\nKeep development notes above the generated section.\n\n## Unreleased\n\n`;

export async function collectReleases(github, repository) {
  const releases = (await github.paginate(github.rest.repos.listReleases, { ...repository, per_page: 100 }))
    .filter(release => !release.draft && release.published_at)
    .sort((a, b) => b.published_at.localeCompare(a.published_at) || b.id - a.id);
  const entries = [];
  for (const [index, release] of releases.entries()) {
    let body = (release.body || '').trim();
    if (!body) {
      const previous = releases[index + 1];
      const { data } = await github.rest.repos.generateReleaseNotes({
        ...repository,
        tag_name: release.tag_name,
        ...(previous ? { previous_tag_name: previous.tag_name } : {}),
      });
      body = data.body?.trim() || 'No release notes were provided.';
    }
    entries.push({
      tag: release.tag_name,
      name: release.name || release.tag_name,
      url: release.html_url,
      publishedAt: release.published_at,
      prerelease: Boolean(release.prerelease),
      body,
    });
  }
  return { repository: `${repository.owner}/${repository.repo}`, releases: entries };
}

function markdownLabel(value) {
  return value.replace(/[\r\n]+/g, ' ').replace(/[\\[\]]/g, '\\$&');
}

export function updateChangelog(existing, data) {
  const sections = data.releases.map(release => {
    // Escape reserved markers from release notes so reruns remain well-formed.
    const notes = release.body.replaceAll(START, '&lt;!-- releases:start --&gt;').replaceAll(END, '&lt;!-- releases:end --&gt;');
    const label = markdownLabel(release.name);
    const url = `https://github.com/${data.repository}/releases/tag/${encodeURIComponent(release.tag)}`;
    return `## [${label}](${url}) — ${release.publishedAt.slice(0, 10)}${release.prerelease ? ' (pre-release)' : ''}\n\n${notes}`;
  });
  const generated = `${START}\n\n${sections.join('\n\n') || 'No published releases yet.'}\n\n${END}`;
  if (!existing) return `${changelogHeader}${generated}\n`;
  const start = existing.indexOf(START);
  const end = existing.indexOf(END);
  if (start < 0 || end < start || existing.lastIndexOf(START) !== start || existing.lastIndexOf(END) !== end) {
    throw new Error('CHANGELOG.md must contain exactly one releases:start/releases:end marker pair.');
  }
  return existing.slice(0, start) + generated + existing.slice(end + END.length);
}

export async function synchronizeReleases({ github, repository, root }) {
  const data = await collectReleases(github, repository);
  const path = join(root, 'CHANGELOG.md');
  let current = '';
  try { current = await readFile(path, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const changelog = updateChangelog(current, data);
  await writeFile(path, changelog);
  await writeFile(join(root, 'website/releases.json'), `${JSON.stringify(data, null, 2)}\n`);
  return data;
}
