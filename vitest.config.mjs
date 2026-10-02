import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Component tests (test/*.test.jsx) switch to jsdom with a // @vitest-environment jsdom comment
        // and import test/support/antd-dom.js
        environment: 'node',
        include: ['test/**/*.test.{js,jsx}'],
    },
});
