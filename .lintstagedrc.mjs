import path from 'path';

// Auto-generated API clients (swagger-typescript-api) are never hand-edited and opt out of
// eslint/tsc via their header banner, so we skip formatting/linting them too. Keeping them out
// of prettier also stops the quote churn between the generator (double quotes) and the repo style.
const isGenerated = (file) => file.split(path.sep).join('/').includes('/data-contracts/');

const tasksFor = (pkg) => (files) => {
  const cwd = path.resolve(pkg);
  const relativePaths = files
    .filter((file) => !isGenerated(file))
    .map((file) => path.relative(cwd, file).split(path.sep).join('/'));
  if (relativePaths.length === 0) return [];
  const joined = relativePaths.join(' ');
  return [
    `yarn --cwd ${pkg} prettier --write ${joined}`,
    `yarn --cwd ${pkg} eslint --no-error-on-unmatched-pattern --fix --max-warnings=0 ${joined}`,
  ];
};

export default {
  'frontend/src/**/*.{ts,tsx,mjs}': tasksFor('frontend'),
  'backend/src/**/*.ts': tasksFor('backend'),
};
