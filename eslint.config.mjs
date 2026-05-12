import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
    globalIgnores([
        'dist',
        'node_modules',
        '**/bundle.js',
        '*.json',
        'data',
        'tmp',
    ]),

    {
        files: ['**/*.ts'],
        extends: [
            js.configs.recommended,
            tseslint.configs.recommended,
        ],
        languageOptions: {
            globals: globals.browser,
        },
        rules: {
            ...prettier.rules,

            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/consistent-indexed-object-style': 'off',
            '@typescript-eslint/no-unused-vars': ['warn', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
            }],
            'no-unused-vars': 'off',
        },
    },

    {
        files: ['server/**/*.ts'],
        languageOptions: {
            globals: globals.node,
        },
    },

    {
        files: ['tests/**/*.ts'],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.browser,
            },
        },
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
        },
    },
]);
