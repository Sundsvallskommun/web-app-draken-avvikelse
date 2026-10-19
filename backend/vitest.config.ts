import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Absolute path to src/, used to build the alias table below.
const src = fileURLToPath(new URL('./src', import.meta.url));

// tsconfig.json defines these path aliases but has no `baseUrl`, so vite-tsconfig-paths
// can't synthesize them. Mirror them explicitly here instead. Order: the specific
// prefixes never overlap with `@/`, but keep `@/` last regardless.
const alias = [
  { find: /^@config$/, replacement: `${src}/config` },
  { find: /^@controllers\//, replacement: `${src}/controllers/` },
  { find: /^@dtos\//, replacement: `${src}/dtos/` },
  { find: /^@exceptions\//, replacement: `${src}/exceptions/` },
  { find: /^@interfaces\//, replacement: `${src}/interfaces/` },
  { find: /^@middlewares\//, replacement: `${src}/middlewares/` },
  { find: /^@models\//, replacement: `${src}/models/` },
  { find: /^@services\//, replacement: `${src}/services/` },
  { find: /^@utils\//, replacement: `${src}/utils/` },
  { find: /^@\//, replacement: `${src}/` },
];

export default defineConfig({
  // Vite 8's native transform (Oxc/esbuild) does not emit decorator metadata,
  // which routing-controllers/class-validator rely on. Disable it and let SWC
  // handle the TypeScript transform instead.
  oxc: false,
  esbuild: false,
  resolve: {
    // Vite's native tsconfig-paths resolution mis-handles this project's mappings;
    // the explicit alias table above is used instead.
    tsconfigPaths: false,
    alias,
  },
  plugins: [
    swc.vite({
      // Ignore the project's .swcrc (it targets the production build.swc output —
      // es2017/CJS — and would rewrite aliases). Test transform config lives here.
      swcrc: false,
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2022',
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    // `toOffsetDateTime` formats with a numeric UTC offset, so date-range filter
    // assertions depend on the machine timezone. Pin it so CI and local agree.
    env: { TZ: 'Europe/Stockholm' },
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/data-contracts/**',
        'src/**/*.{test,spec}.ts',
        'src/tests/helpers/**',
        'src/types/**',
        'src/swagger-typescript-api.ts',
      ],
    },
  },
});
