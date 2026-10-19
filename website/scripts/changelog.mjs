export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

export function renderChangelog(data) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(data.repository) || !Array.isArray(data.releases)) throw new Error('Invalid release data');
  const repository = `https://github.com/${data.repository}`;
  const entries = data.releases.map(release => {
    const date = new Date(release.publishedAt);
    if (!Number.isFinite(date.valueOf()) || typeof release.tag !== 'string' || typeof release.body !== 'string') throw new Error('Invalid release entry');
    const url = `${repository}/releases/tag/${encodeURIComponent(release.tag)}`;
    return `<article class="release-entry"><span class="kicker">${escapeHtml(date.toISOString().slice(0, 10))}${release.prerelease ? ' · PRE-RELEASE' : ''}</span><h2><a href="${escapeHtml(url)}">${escapeHtml(release.name || release.tag)} ↗</a></h2><div class="release-notes">${escapeHtml(release.body)}</div><a class="text-link" href="${escapeHtml(url)}">Read this release on GitHub ↗</a></article>`;
  }).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Release history and updates for the use-hpc agent skill."><title>Changelog — use-hpc</title><link rel="icon" href="./favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="./styles.css"></head>
<body><a class="skip" href="#main">Skip to content</a><header class="nav"><a class="brand" href="./index.html"><img src="./favicon.svg" width="30" height="30" alt="">use-hpc</a><nav aria-label="Main navigation"><a href="./index.html#quickstart">Quick start</a><a href="./CHANGELOG.md">Markdown ↓</a><a href="${repository}/releases">GitHub Releases ↗</a></nav></header>
<main id="main" class="container section changelog"><span class="kicker">RELEASE HISTORY</span><h1>What’s <em>new.</em></h1><p class="changelog-intro">Published releases, synchronized from GitHub. Release notes are shown as authored; follow a release link for its formatted notes and downloads.</p>
${entries || `<p class="release-entry">No published releases yet. <a href="${repository}/releases">View releases on GitHub ↗</a></p>`}
</main><footer class="container"><a class="brand" href="./index.html">use-hpc</a><p>By ai4se4ai-lab · Release history</p><a href="${repository}">GitHub ↗</a></footer></body></html>\n`;
}
