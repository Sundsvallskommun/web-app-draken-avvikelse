const fs = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');

const safeGitCommand = (args) => {
  const result = spawnSync('git', args, { encoding: 'utf-8', shell: false });
  if (result.status !== 0) {
    throw new Error(`Git command failed: git ${args.join(' ')}\n${result.stderr}`);
  }
  return result.stdout.trim();
};

const frontendPath = path.resolve(__dirname, '../frontend');
const outputPath = path.join(frontendPath, 'public', 'deploy-info.json');

const commit = safeGitCommand(['rev-parse', 'HEAD']);
const branch = safeGitCommand(['rev-parse', '--abbrev-ref', 'HEAD']);
const updatedAt = new Date().toISOString();

let repoUrl = safeGitCommand(['remote', 'get-url', 'origin']);

// Konvertera ev. SSH till HTTPS
if (repoUrl.startsWith('git@')) {
  const match = repoUrl.match(/^git@([^:]+):(.+)\.git$/);
  if (match) {
    const [, host, repoPath] = match;
    repoUrl = `https://${host}/${repoPath}`;
  }
} else if (repoUrl.endsWith('.git')) {
  repoUrl = repoUrl.replace(/\.git$/, '');
}

const content = {
  commit,
  branch,
  updatedAt,
  commitUrl: `${repoUrl}/commit/${commit}`
};

fs.writeFileSync(outputPath, JSON.stringify(content, null, 2));
