import fs from 'node:fs';
import { promisify } from 'node:util';

import { execFile } from 'child_process';
import path from 'path';

import { API_BASE_URL, APIS } from './config/index';

// `execFile` is callback-based and returns a (non-thenable) ChildProcess, so
// awaiting it directly does NOT wait for completion. Promisify it so the curl
// download is guaranteed to finish before we hand the swagger file to the
// generator. Using `execFile` (not `exec`) means arguments are passed without a
// shell, so paths and the base URL aren't re-interpreted by the shell.
const execFileAsync = promisify(execFile);

const PATH_TO_OUTPUT_DIR = path.resolve(process.cwd(), './src/data-contracts');

type Api = { name: string; version: string; generateDataContract?: boolean; dataContractName?: string };

/**
 * Download the OpenAPI spec for a single API and generate its data contracts.
 * Download and generation are sequenced so the generator never reads a
 * half-written (truncated) spec. The downloaded spec is deleted afterwards so
 * it never lingers next to the generated contracts.
 */
const generateForApi = async ({ name, version, dataContractName = name }: Api): Promise<void> => {
  const outputDir = `${PATH_TO_OUTPUT_DIR}/${dataContractName}`;

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const specPath = `${outputDir}/swagger.json`;

  try {
    // `--fail` makes curl exit non-zero on HTTP errors instead of writing an
    // error page to disk and having the generator choke on it later.
    await execFileAsync('curl', ['--fail', '--silent', '--show-error', '-o', specPath, `${API_BASE_URL}/${name}/${version}/api-docs`]);
    console.info(`- ${name} ${version}`);

    // Run the generator's JS entrypoint directly with the current Node binary
    // instead of going through `npx`. On Windows `npx` is a `.cmd` shim that
    // `execFile` can't spawn without a shell, and recent Node refuses to spawn
    // `.cmd`/`.bat` without `shell: true` for security. Invoking the `.mjs` CLI
    // via `process.execPath` is fully cross-platform and keeps `shell: false`.
    const generatorCli = path.resolve(process.cwd(), 'node_modules/swagger-typescript-api/dist/cli.mjs');

    const { stdout, stderr } = await execFileAsync(process.execPath, [
      generatorCli,
      'generate',
      '--path',
      specPath,
      '-o',
      outputDir,
      '--modular',
      '--no-client',
      '--extract-enums',
    ]);

    if (stdout) console.info(`Data-contract-generator: ${stdout}`);
    if (stderr) console.error(`stderr: ${stderr}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`error (${name} ${version}): ${message}`);
  } finally {
    // Remove the downloaded spec so it doesn't pollute the tree (it would
    // otherwise be picked up by tsc) — runs even if generation failed.
    fs.rmSync(specPath, { force: true });
  }
};

const main = async () => {
  console.info('Downloading and generating api-docs..');
  await Promise.all(APIS.filter(api => api.generateDataContract !== false).map(generateForApi));
};

main();
