import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const PRODUCTION_SCRIPT_SRC = "script-src 'self'";

// The Fast Refresh preamble that @vitejs/plugin-react injects into index.html is an
// inline script, so the dev server alone relaxes the production script-src policy.
export function devContentSecurityPolicy() {
    return {
        name: 'jswallet:dev-content-security-policy',
        apply: 'serve',
        transformIndexHtml(html) {
            if (!html.includes(PRODUCTION_SCRIPT_SRC)) {
                throw new Error(`index.html must declare the Content-Security-Policy "${PRODUCTION_SCRIPT_SRC}"`);
            }
            return html.replace(PRODUCTION_SCRIPT_SRC, `${PRODUCTION_SCRIPT_SRC} 'unsafe-inline'`);
        },
    };
}

// https://vitejs.dev/config
export default defineConfig({
    plugins: [react(), devContentSecurityPolicy()],
    define: {
        // draft-js, which antd 3 bundles for its Mention component, reads Node's `global`.
        global: 'globalThis',
    },
    resolve: {
        alias: [
            // antd 3 registers every export of this CommonJS module as an icon, but Vite's
            // interop adds a `default` export that is not one. The ES entry exports only the
            // icons. Remove with antd 3 (jswallet-2cb.9).
            { find: /^@ant-design\/icons\/lib\/dist$/, replacement: '@ant-design/icons/lib/index.es.js' },
        ],
    },
});
