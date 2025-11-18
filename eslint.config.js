import js from '@eslint/js';
import globals from 'globals';
import prettierConfig from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  {
    ignores: [
      'node_modules/',
      'lapdata_motec/',
      'lapdata_tt/',
      'ld_to_csv/',
      'g61-view.jpg',
      'bugs/**'
    ]
  },
  {
    files: ['js/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      'no-console': ['warn', { allow: ['error'] }]
    }
  },
  {
    files: ['tools/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.node
      }
    },
    rules: {
      'no-console': 'off'
    }
  },
  prettierConfig
];
