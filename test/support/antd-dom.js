import { afterEach, beforeEach, expect, vi } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

/**
 * For test files that render antd components under // @vitest-environment jsdom.
 * Adds what antd reads from the browser and jsdom lacks, unmounts after each test (Testing Library
 * cleans up on its own only with Vitest's globals), and fails a test that logs a warning or an error,
 * such as React's act() warnings or antd's deprecation notices.
 */

// The findBy queries and waitFor give up after 1 second by default, little on a busy machine
configure({ asyncUtilTimeout: 3000 });

// antd's responsive observer (Grid, Table) subscribes to media queries
window.matchMedia ??= (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
});

// rc-util measures the scrollbar with getComputedStyle(element, '::-webkit-scrollbar'), which jsdom
// does not implement and reports on its virtual console. The element's own style is enough here.
const { getComputedStyle } = window;
window.getComputedStyle = (element) => getComputedStyle(element);

let warnings;

beforeEach(() => {
    warnings = [vi.spyOn(console, 'error'), vi.spyOn(console, 'warn')];
});

afterEach(() => {
    cleanup();
    const logged = warnings.flatMap((spy) => spy.mock.calls.map((args) => args.join(' ')));
    vi.restoreAllMocks();
    expect(logged).toEqual([]);
});
