import nextConfig from 'eslint-config-next/core-web-vitals';
import eslintConfigPrettier from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';

export default [
  ...nextConfig,
  {
    ignores: ['src/**/data-contracts/**'],
  },
  eslintConfigPrettier,
  {
    plugins: {
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
    },
    rules: {
      'unused-imports/no-unused-imports': 'error',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
  },
  // Playwright-sviten lintas för det som faktiskt kan gå sönder i den, inte för stilregler.
  // Importsortering och react-hooks är avstängda här: den förra skulle kräva en normalisering
  // av hela e2e-trädet som inte hör hemma i samma ändring, den senare tolkar Playwrights
  // fixture-callback `use` som en React-hook.
  {
    files: ['e2e/**/*.ts'],
    rules: {
      'simple-import-sort/imports': 'off',
      'simple-import-sort/exports': 'off',
      'react-hooks/rules-of-hooks': 'off',
      // sk-web-gui renderar både Modal och useConfirm-dialogen som article.sk-modal-dialog;
      // dialogen skiljs bara av klassen sk-dialog. En selektor som inte skiljer dem åt matchar
      // två element så snart båda är monterade och fälls av Playwrights strict mode — vilket
      // ger tester som växlar mellan grönt och rött utan att koden ändrats. Använd MODAL_DIALOG
      // respektive CONFIRM_DIALOG från e2e/utils/modal.ts.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/sk-modal-dialog(?![-\\w])/]',
          message:
            'Använd MODAL_DIALOG eller CONFIRM_DIALOG från e2e/utils/modal.ts — rå sk-modal-dialog matchar både modalen och bekräftelsedialogen.',
        },
        {
          selector: 'TemplateElement[value.raw=/sk-modal-dialog(?![-\\w])/]',
          message:
            'Använd MODAL_DIALOG eller CONFIRM_DIALOG från e2e/utils/modal.ts — rå sk-modal-dialog matchar både modalen och bekräftelsedialogen.',
        },
      ],
    },
  },
  {
    // Modulen som definierar selektorerna måste förstås få skriva ut dem.
    files: ['e2e/utils/modal.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
];
