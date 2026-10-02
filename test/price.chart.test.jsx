// @vitest-environment jsdom
import fs from 'fs';
import path from 'path';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { App } from 'antd';

import './support/antd-dom';
import StatsContent from '../src/stats.content.component';

/**
 * The grid lines of the price chart must stay on the labels its axes show. recharts 3's CartesianGrid picks
 * its own ticks and measures their labels in the page's font size (16px), while the axes measure them in the
 * font they render in (antd's 14px), so StatsContent draws its grid at the axes' ticks (jswallet-2cb.10).
 * jsdom has no layout, so this file gives the chart a size and the labels a width that depends on their font.
 */

// window.jswallet, which src/preload.js exposes in the app
const jswallet = vi.hoisted(() => ({
    getPriceChart: vi.fn(),
}));

vi.mock('../src/jswallet', () => ({ default: jswallet }));

// 31 daily prices recorded from blockchain.info (see test/network.test.js), as src/main/network.js passes them on
const chart = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'mempool', 'market-price.json'), 'utf8'));
const PRICES = chart.values.map(({ x, y }) => ({ time: x, price: y }));

const HEIGHT = 300;
let chartWidth;

// antd 6 sets font-size: var(--ant-font-size), which jsdom's getComputedStyle hands back unresolved where a
// browser computes pixels. The axes read their labels' font size there and measure the labels in it.
const { getComputedStyle } = window;
const fontSizeOf = (element) => {
    const style = getComputedStyle(element);
    const variable = /^var\((--[\w-]+)\)$/.exec(style.fontSize);
    const size = variable ? style.getPropertyValue(variable[1]) : style.fontSize;
    // An undefined variable makes the declaration invalid at computed-value time, and font-size then inherits
    return size || fontSizeOf(element.parentElement);
};
window.getComputedStyle = (element) => new Proxy(getComputedStyle(element), {
    get(style, property) {
        if (property === 'fontSize') return fontSizeOf(element);
        const value = Reflect.get(style, property);
        return typeof value === 'function' ? value.bind(style) : value;
    },
});

// The responsive chart reads its size from its wrapper and follows it with a ResizeObserver
const observers = new Set();
window.ResizeObserver = class {
    constructor(callback) {
        this.callback = callback;
    }

    observe(target) {
        this.target = target;
        observers.add(this);
    }

    unobserve() {}

    disconnect() {
        observers.delete(this);
    }
};

const resizeChart = (width) => act(() => {
    chartWidth = width;
    [...observers]
        .filter(({ target }) => target.classList.contains('recharts-wrapper'))
        .forEach(({ callback, target }) => callback([{ target, contentRect: target.getBoundingClientRect() }]));
});

// Text gets 0.6em per character and a line height of 1.2em, at the element's font size
const textSize = (element) => {
    const fontSize = parseFloat(window.getComputedStyle(element).fontSize);
    return { width: element.textContent.length * 0.6 * fontSize, height: 1.2 * fontSize };
};

const { getBoundingClientRect } = Element.prototype;

beforeEach(() => {
    chartWidth = 800;
    jswallet.getPriceChart.mockReset();
    jswallet.getPriceChart.mockResolvedValue(PRICES);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
        if (this.classList.contains('recharts-wrapper')) {
            return DOMRect.fromRect({ width: chartWidth, height: HEIGHT });
        }
        // recharts measures label text in a hidden span
        if (this.id === 'recharts_measurement_span') return DOMRect.fromRect(textSize(this));
        return getBoundingClientRect.call(this);
    });
});

// Where the axis' tick marks are, and the grid's lines across it
const tickMarks = (axis) => Array.from(
    document.querySelectorAll(`.recharts-${axis}Axis-tick-lines .recharts-cartesian-axis-tick-line`),
    (mark) => Number(mark.getAttribute(`${axis}1`)),
);
const gridLines = (axis) => Array.from(
    document.querySelectorAll(`.recharts-cartesian-grid-${axis === 'x' ? 'vertical' : 'horizontal'} line`),
    (line) => Number(line.getAttribute(`${axis}1`)),
);

// The axis' labels, each with the stretch of the axis it covers: centered on its tick, unless recharts moved it
// inward to keep it inside the chart
const tickLabels = (axis) => Array.from(
    document.querySelectorAll(`.recharts-${axis}Axis-tick-labels .recharts-cartesian-axis-tick-value`),
    (label) => {
        const center = Number(label.getAttribute(axis));
        const { width, height } = textSize(label);
        const half = (axis === 'x' ? width : height) / 2;
        return { text: label.textContent, from: center - half, to: center + half };
    },
);

// The labels that have no grid line under them
const unlined = (axis) => {
    const lines = gridLines(axis);
    return tickLabels(axis)
        .filter(({ from, to }, i) => !(lines[i] >= from && lines[i] <= to))
        .map(({ text }) => text);
};

const expectGridOnTicks = (axis) => {
    expect(tickLabels(axis).length).toBeGreaterThan(1);
    expect(tickMarks(axis)).toHaveLength(tickLabels(axis).length);
    expect(gridLines(axis)).toEqual(tickMarks(axis));
    expect(unlined(axis)).toEqual([]);
};

// As src/app.jsx shows it, inside antd's App (src/renderer.jsx), whose font the axis labels render in
const renderChart = async () => {
    render(<App><StatsContent /></App>);
    await waitFor(() => expect(tickLabels('x')).not.toEqual([]));
};

// The no-warnings check is antd-dom's: recharts warns, for one, when the chart has no size
describe('StatsContent price chart', () => {

    it('loads 90 days of prices', async () => {
        await renderChart();

        expect(jswallet.getPriceChart).toHaveBeenCalledWith('90days');
    });

    it('draws a vertical grid line at each date the X axis shows', async () => {
        await renderChart();

        // The axis leaves out dates whose labels would overlap: the grid has to leave out the same ones
        expect(tickLabels('x').length).toBeLessThan(PRICES.length);
        expectGridOnTicks('x');
    });

    it('draws a horizontal grid line at each price the Y axis shows', async () => {
        await renderChart();

        expectGridOnTicks('y');
    });

    it('keeps the vertical lines on the dates when the chart narrows', async () => {
        await renderChart();
        const wide = tickLabels('x');

        await resizeChart(400);

        expect(tickLabels('x').length).toBeLessThan(wide.length);
        expectGridOnTicks('x');
    });
});
