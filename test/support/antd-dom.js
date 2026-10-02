import {
    afterAll, afterEach, beforeEach, expect, vi,
} from 'vitest';
import { cleanup, configure } from '@testing-library/react';

/**
 * For test files that render antd components under // @vitest-environment jsdom.
 * Adds what antd reads from the browser and jsdom lacks, gives the tests and their waits more time,
 * unmounts after each test (Testing Library cleans up on its own only with Vitest's globals), lets
 * antd's last timers run before jsdom goes away, and fails a test that logs a warning or an error, such
 * as React's act() warnings or antd's deprecation notices.
 */

// The findBy queries and waitFor give up after 1 second by default and Vitest's tests after 5, too
// little on a busy machine: with other test runs at a load of about 40 on 10 cores, the first antd
// render in a file and user.type into antd forms made single waits take over 3 seconds and a test
// over 5 (jswallet-2si)
configure({ asyncUtilTimeout: 10000 });
vi.setConfig({ testTimeout: 20000 });

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

// antd's Form debounces a field's errors with timers of up to 10 ms (useDebounce, through useDelayState
// of @rc-component/util) that unmounting does not cancel. When a file's last test changes a field's
// errors, such a timer can fire after Vitest has torn jsdom down: React reads window.event for the update
// it would drop anyway, throws 'window is not defined' and Vitest reports an unhandled error although
// every test passed (jswallet-a6n). Node runs timers in the order they expire, so one wait per file that
// ends later than theirs lets them run while the window is still there.
afterAll(() => new Promise((resolve) => { setTimeout(resolve, 20); }));
