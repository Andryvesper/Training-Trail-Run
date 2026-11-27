import js from '@eslint/js';
import globals from 'globals';

export default [
    { ignores: ['node_modules/', 'vendor/', 'css/', 'supabase/functions/'] },
    js.configs.recommended,
    {
        files: ['js/**/*.js', 'sw.js', 'config.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: { ...globals.browser, ...globals.serviceworker }
        }
    },
    {
        files: ['tests/**/*.js', 'e2e/**/*.mjs', 'eslint.config.js', 'tailwind.config.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: { ...globals.node, ...globals.browser }
        }
    },
    {
        rules: {
            'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
            eqeqeq: ['error', 'smart'],
            'no-var': 'error',
            'prefer-const': 'error'
        }
    }
];
