import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import { configs, plugins } from 'eslint-config-airbnb-extended';
import globals from 'globals';

export default defineConfig([
    // Airbnb base + React, as in the eslint-config-airbnb-extended README (without its TypeScript and Next.js parts).
    { name: 'js/config', ...js.configs.recommended },
    plugins.stylistic,
    plugins.importX,
    ...configs.base.recommended,
    plugins.react,
    plugins.reactHooks,
    plugins.reactA11y,
    ...configs.react.recommended,

    // airbnb-extended pins parserOptions.ecmaVersion to 2018, which cannot parse the BigInt
    // literals in the wallet logic or the dynamic import() of the lazy tabs.
    {
        name: 'jswallet/parser',
        languageOptions: {
            parserOptions: { ecmaVersion: 'latest' },
        },
    },

    // Electron main process and the wallet logic run on Node.
    {
        name: 'jswallet/node',
        files: ['src/index.js', 'src/main/**'],
        languageOptions: {
            globals: globals.node,
        },
    },

    // The renderer is a browser bundle in a sandboxed, context-isolated window. It reaches the main
    // process only through window.jswallet (src/preload.js), so nothing it imports may need Node,
    // Electron or src/main. Shared modules in src/common follow the same rules.
    {
        name: 'jswallet/renderer-imports',
        files: ['src/**'],
        ignores: ['src/index.js', 'src/main/**', 'src/preload.js'],
        rules: {
            'import-x/no-nodejs-modules': 'error',
            'no-restricted-imports': ['error', {
                paths: [
                    { name: 'electron', message: 'The renderer reaches the main process through window.jswallet (src/jswallet.js).' },
                    { name: '@seald-io/nedb', message: 'The database is in the main process (src/main).' },
                ],
                patterns: [
                    { regex: '(^|/)main(/|$)', message: 'src/main runs in the main process; call it through window.jswallet (src/jswallet.js).' },
                ],
            }],
        },
    },

    // Sandboxed preloads can only load electron and a few polyfilled modules; Vite bundles the rest.
    {
        name: 'jswallet/preload-imports',
        files: ['src/preload.js'],
        rules: {
            'import-x/no-nodejs-modules': 'error',
            'no-restricted-imports': ['error', {
                patterns: [
                    { regex: '(^|/)main(/|$)', message: 'src/main runs in the main process; add an IPC channel instead.' },
                ],
            }],
        },
    },

    // React components run in the renderer.
    {
        name: 'jswallet/browser',
        files: ['**/*.jsx'],
        languageOptions: {
            globals: globals.browser,
            parserOptions: { ecmaFeatures: { jsx: true } },
        },
    },

    // Project overrides, ported from the old .eslintrc.
    {
        name: 'jswallet/rules',
        rules: {
            camelcase: 'off',
            'prefer-template': 'off',
            'no-param-reassign': 'off',
            'no-restricted-syntax': 'off',
            'no-return-assign': ['error', 'except-parens'],
            'object-shorthand': 'off',
            'no-shadow': 'off',
            'arrow-body-style': ['warn', 'never'],
            'no-underscore-dangle': ['error', { allowAfterThis: true, allow: ['__store'] }],
            'no-console': 'off',

            // SwitchCase: 0 was the default of the core indent rule; @stylistic defaults to 1.
            '@stylistic/indent': ['warn', 4, { SwitchCase: 0 }],
            '@stylistic/comma-dangle': 'off',
            '@stylistic/padded-blocks': 'off',
            '@stylistic/object-property-newline': 'off',
            '@stylistic/no-trailing-spaces': 'off',
            '@stylistic/max-len': ['warn', { code: 180 }],
            '@stylistic/no-multiple-empty-lines': 'off',
            '@stylistic/linebreak-style': 'off',
            '@stylistic/jsx-indent': 'off',
            '@stylistic/jsx-indent-props': 'off',
            '@stylistic/jsx-closing-bracket-location': 'off',
            '@stylistic/jsx-first-prop-new-line': 'off',
            // airbnb-extended still enforces JSX layout through eslint-plugin-react, so turn those off as well.
            'react/jsx-indent': 'off',
            'react/jsx-indent-props': 'off',
            'react/jsx-closing-bracket-location': 'off',
            'react/jsx-first-prop-new-line': 'off',

            'import-x/extensions': 'off',
            'import-x/no-extraneous-dependencies': 'off',
            'import-x/no-unresolved': ['error', { ignore: ['electron'] }],

            'react/prefer-stateless-function': 'off',
            'react/prop-types': 'off',
            'react/sort-comp': 'off',

            // Fixing these changes the rendered markup (<a> without href, a clickable <span>). jswallet-2cb.9
            // rewrites these components for React 19 and antd 6; turn them back to errors there.
            'jsx-a11y/anchor-is-valid': 'warn',
            'jsx-a11y/click-events-have-key-events': 'warn',
        },
    },
]);
