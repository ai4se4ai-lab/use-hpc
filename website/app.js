export const agents = Object.freeze({
  codex: { name: 'Codex', global: '~/.agents/skills/use-hpc', project: '.agents/skills/use-hpc' },
  'claude-code': { name: 'Claude Code', global: '~/.claude/skills/use-hpc', project: '.claude/skills/use-hpc' },
  opencode: { name: 'OpenCode', global: '~/.config/opencode/skills/use-hpc', project: '.agents/skills/use-hpc' },
  cursor: { name: 'Cursor', global: '~/.cursor/skills/use-hpc', project: '.agents/skills/use-hpc' },
  'github-copilot': { name: 'GitHub Copilot', global: '~/.copilot/skills/use-hpc', project: '.agents/skills/use-hpc' },
});
export function installCommand(agent, scope = 'global') {
  if (!Object.hasOwn(agents, agent)) throw new Error('Unknown agent');
  if (!['global', 'project'].includes(scope)) throw new Error('Unknown scope');
  return `npx -y skills add ai4se4ai-lab/use-hpc --skill use-hpc --agent ${agent}${scope === 'global' ? ' --global' : ''} --copy --yes`;
}
const stages = {
  setup: ['Start with a sound foundation.', 'Prepare data and models inside an allocated GPU job. Verification and a preflight run gate the experiment matrix.', 'setup → afterok → main'],
  main: ['Distribute the experiment matrix.', 'Give each model × dataset cell its own array task. Set concurrency limits and resource requests to fit the cluster and the actual workload.', 'main[cell] → needs / produces'],
  followup: ['Keep each cell moving.', 'Use aftercorr and matrix_from to start a cell’s followup when its matching main task finishes, without waiting for the entire array.', 'main[cell] → aftercorr → followup[cell]'],
  collect: ['Bring the evidence home.', 'Run analysis and collection after the upstream jobs end. Preserve the ledger, tables, figures, GPU records, and manifest on persistent storage; inspect completeness for failed cells.', 'main + followup → afterany → collect'],
};

if (typeof document !== 'undefined') {
  const $ = id => document.getElementById(id);
  let selected = 'codex';
  const tabs = [...document.querySelectorAll('[data-agent]')];
  const status = $('copy-status');
  let revision = 0;
  function renderAgent(agent, focus = false) {
    selected = agent;
    revision++;
    status.textContent = '';
    tabs.forEach(tab => {
      const active = tab.dataset.agent === agent;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && focus) tab.focus();
    });
    const scope = $('install-scope').value;
    $('agent-command').textContent = installCommand(agent, scope);
    $('install-comment').textContent = `# Install use-hpc for ${agents[agent].name}`;
    $('install-path').textContent = `Installs to ${agents[agent][scope]}`;
    $('install-code').setAttribute('aria-labelledby', `tab-${agent}`);
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => renderAgent(tab.dataset.agent));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (i + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      renderAgent(tabs[next].dataset.agent, true);
    });
  });
  $('install-scope').addEventListener('change', () => renderAgent(selected));
  // A blocked clipboard still leaves the exact command selectable in the page.
  document.querySelectorAll('[data-copy]').forEach(button => {
    button.addEventListener('click', async () => {
      const kind = button.dataset.copy;
      const source = kind === 'agent' ? $('agent-command') : document.querySelector(kind === 'hero' ? '.hero-command code' : '.ask blockquote');
      const text = source.textContent.trim();
      const current = revision;
      let ok = false;
      try { await navigator.clipboard.writeText(text); ok = true; } catch {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(source);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      if (current === revision) status.textContent = ok ? 'Copied to clipboard.' : 'Clipboard unavailable. Text selected — use Ctrl+C or ⌘C to copy.';
    });
  });
  const theme = $('theme-toggle');
  function applyTheme(value) {
    document.documentElement.dataset.theme = value;
    theme.setAttribute('aria-label', `Switch to ${value === 'dark' ? 'light' : 'dark'} theme`);
    document.querySelector('meta[name="theme-color"]').content = value === 'dark' ? '#07080a' : '#f5f6f3';
  }
  let saved;
  try { saved = localStorage.getItem('use-hpc-theme'); } catch { /* Storage is optional. */ }
  applyTheme(['light', 'dark'].includes(saved) ? saved : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  theme.addEventListener('click', () => {
    const value = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(value);
    try { localStorage.setItem('use-hpc-theme', value); } catch { /* Storage is optional. */ }
  });
  document.querySelectorAll('[data-stage]').forEach(button => button.addEventListener('click', () => {
    const stage = button.dataset.stage;
    document.querySelectorAll('[data-stage]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    document.querySelectorAll('[data-node]').forEach(node => node.classList.toggle('selected', node.dataset.node === stage));
    [$('stage-title').textContent, $('stage-description').textContent, $('stage-contract').textContent] = stages[stage];
  }));
  renderAgent(selected);
}
