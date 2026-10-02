import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { META_POLICY } from './src/main/security/content-security-policy.mjs';

// main sends the renderer's Content-Security-Policy as a header, the dev server's relaxed one included,
// so index.html needs no policy of its own. The build carries the production policy in a meta tag
// as well, as a fallback should the page ever load without the header.
export function contentSecurityPolicyMeta() {
    return {
        name: 'jswallet:content-security-policy-meta',
        apply: 'build',
        transformIndexHtml: () => [{
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: META_POLICY },
            // A policy applies only to what comes after it, so it goes first, before Vite's scripts
            injectTo: 'head-prepend',
        }],
    };
}

// https://vitejs.dev/config
export default defineConfig({
    plugins: [react(), contentSecurityPolicyMeta()],
});
