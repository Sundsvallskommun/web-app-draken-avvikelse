import { preset } from '@sk-web-gui/core';
import { Config } from 'tailwindcss/types/config';

export default {
  mode: 'jit',
  content: [
    './node_modules/@sk-web-gui/*/dist/**/*.js',
    // Investigation UI schemas contain the same static design tokens as TSX and must be included in generated CSS.
    './src/**/*.{js,ts,jsx,tsx,json}',
  ],
  safelist: ['text-error-surface-primary', 'text-vattjom-surface-primary', 'text-warning-surface-primary'],
  darkMode: 'class', // or 'media' or 'class'
  theme: {
    extend: {
      maxWidth: {
        content: 'var(--sk-spacing-max-content)',
        errand: '1080px',
      },
    },
  },
  presets: [preset()],
} satisfies Config;
