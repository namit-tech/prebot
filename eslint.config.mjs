import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default [
  {
    // These ignores must be in their own object at the top
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/assets/**',
      'assets/**',
      '**/www/**',
      '**/android/**',
      '**/backend/**',
      '**/*.bat',
      '**/*.ps1',
      '**/*.sh',
      '**/*.json',
      '**/*.md'
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2020,
        ...globals.node,
        electronAPI: 'readonly',
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      'react/prop-types': 'off',
      'no-unused-vars': 'warn',
      'react/react-in-jsx-scope': 'off',
      'no-undef': 'warn',
      'no-control-regex': 'off',
      'no-empty': 'off',
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'react/no-unescaped-entities': 'warn',
      'react/display-name': 'warn',
      'no-case-declarations': 'warn',
      'no-extra-semi': 'warn',
      'no-useless-catch': 'off',
      'no-extra-boolean-cast': 'off',
      'no-regex-spaces': 'off',
      'no-unused-labels': 'off',
      'no-prototype-builtins': 'off',
      'no-use-before-define': 'off',
      'react/no-deprecated': 'warn',
      'react/no-find-dom-node': 'warn',
      'react/no-is-mounted': 'warn',
      'react/no-render-return-value': 'warn',
      'react-hooks/set-state-in-effect': 'off'
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
];
