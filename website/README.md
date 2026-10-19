# use-hpc website

A static landing page adapted from [Archify's website](https://github.com/tt-a1i/archify/tree/main/website), with use-hpc content and installation instructions for Codex, Claude Code, OpenCode, Cursor, and GitHub Copilot. This is an independently maintained adaptation, not an Archify product.

## Develop and verify

Requires Node.js 20 or later. No dependencies, package installation, or external font service is required.

```bash
cd website
npm run dev
# Open http://localhost:4321
npm test
npm run build
```

The build writes `dist/` and uses relative asset URLs, so it works under a GitHub Pages repository path. The local preview server binds to loopback. Set `PORT` to change the default 4321.

The agent selector supports arrow keys, Home, and End. Global/project scope updates the command and destination. Clipboard failures select the original text for manual copying. Themes persist locally when storage is available. The pipeline graph and audit output are illustrative; this website never connects to Slurm or submits jobs.

Install commands use the [skills CLI's documented agent identifiers and options](https://github.com/vercel-labs/skills#supported-agents). They reference this repository's existing name, `ai4se4ai-lab/use-hpc-claude-skill`; the name does not imply a Claude runtime dependency. The local skill folder is `plugins/use-hpc/skills/use-hpc`. Current agent skill support and terminal/file permissions are prerequisites. See also [Codex skills](https://developers.openai.com/codex/skills).

## Deploy

The production URL for this repository is `https://ai4se4ai-lab.github.io/use-hpc-claude-skill/` (unless a custom domain is configured). The root README links to it. The link becomes live after a successful deployment.

One-time setup:

1. Merge/commit the site and workflows onto the default branch (`main`).
2. Enable **Settings → Pages → Build and deployment → Source → GitHub Actions**. If the `github-pages` environment restricts deployment branches/tags, allow release tags as well as the default branch; release events execute with a tag ref.
3. Permit GitHub Actions to write repository contents so the synchronization job can commit generated files. If branch rules require PRs, allow the automation actor to push these updates or adjust the rules before using this direct-commit workflow. Push rejections fail the workflow rather than silently losing the changelog update.
4. For the repository About panel, set its **Website** field to the Pages URL. To manage it automatically after deployments, add a repository secret named `SITE_ADMIN_TOKEN`: a fine-grained token limited to this repository with **Administration: write**. The normal `GITHUB_TOKEN` generally cannot edit this setting. Only the post-deployment About update uses this optional token. An unavailable permission produces a warning; a successful website deployment is retained.
5. Run **Release website and changelog** once from Actions for the initial deployment and release-history synchronization. After that, publishing a GitHub Release triggers the workflow automatically. Include pre-releases when you want to announce previews; drafts are not listed or deployed.

The release workflow runs for `published`, `edited`, `deleted`, and `unpublished` events. It paginates through all published releases, keeps pre-release labels, and sorts by publication time. It uses authored release notes; when notes are empty, it requests GitHub-generated notes. Removing/unpublishing a release removes its generated entry. Repeated runs do not duplicate entries. A manual run repairs or backfills history without publishing a new release.

`CHANGELOG.md` is generated only between `releases:start` and `releases:end` markers; keep hand-written development notes outside that section. `website/releases.json` is fully generated. Do not edit generated release entries: edit the GitHub Release instead. Both files are committed to the default branch before building. The site always deploys current default-branch website code at that recorded commit, including when notes for an old release are edited; it does not revert the site to the old tag. This is a release-driven website deployment, not a tool-package release creator.

CI checks every pull request and push to `main` without deploying. Production releases and manual deployments are serialized, and tests/build checks must pass before publishing. The production build includes `changelog.html`, `releases.json` and a downloadable `CHANGELOG.md`; the development server renders the same changelog page. The live changelog does not need GitHub API access or tokens in the visitor's browser.

If releases are published by another workflow using `GITHUB_TOKEN`, GitHub suppresses the resulting release-event workflow. Use a GitHub App token/PAT for that publishing step or explicitly dispatch this workflow using the API after creating the release. See [GitHub's workflow triggering rules](https://docs.github.com/en/actions/how-tos/writing-workflows/choosing-when-your-workflow-runs/triggering-a-workflow#triggering-a-workflow-from-a-workflow).

For another static host, run `npm run build` in `website/` and publish `website/dist/`.

The design attribution and MIT terms are in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt) and copied into the build output. Product copy, the stage preview and install controls are specific to use-hpc. No Archify diagram renderer, gallery, analytics, video, or claims about Archify features are included.
