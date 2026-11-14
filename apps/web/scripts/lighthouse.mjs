/**
 * Lighthouse over the built app, served as GitHub Pages serves it.
 *
 *   npm run lighthouse
 *
 * Runs after a build, in two passes. Every address, and the not-found page, must score a hundred
 * for accessibility. Then the start, a page about one thing and the not-found page are measured as
 * a phone on a slow network loads them on a first visit: each must score at least ninety for
 * performance, paint its largest content within the time a visit counts as good, shift its layout
 * no more than that either, and carry no more script or style than its budget. Every page loads
 * the one script the build writes, so those three stand for the rest, and the pass stays within
 * the job's time. One trace on a shared machine can be slow for reasons of its own, so a page that
 * misses on performance is measured twice more and judged on the middle of the three.
 *
 * Lighthouse will not audit a page that answers with a 404, so the not-found page is audited at
 * its own file, which is served as any file is.
 */
import { chromium } from '@playwright/test';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';

import { NOT_FOUND_FILE, ROUTES } from '../src/routes.ts';
import { serve } from './serve.mjs';

const PORT = 4182;

/** The lowest performance score a page may have. */
const PERFORMANCE = 0.9;
/** The largest paint, in milliseconds, within which a visit counts as good. */
const LARGEST_PAINT_MS = 2500;
/** The layout shift past which a visit no longer counts as good. */
const LAYOUT_SHIFT = 0.1;
/** The most script and style a page may carry, in bytes sent over the network. */
/** Script is what the build sends today, near 72 KB, with room for the screens to come. */
const BUDGET = { Script: 120_000, Stylesheet: 30_000 };
/** How many traces a page that misses is judged on. */
const TRACES = 3;

const NOT_FOUND = `/${NOT_FOUND_FILE}`;
/** Every page, for accessibility. */
const PAGES = [...ROUTES.map(({ path }) => path), NOT_FOUND];
/**
 * The pages measured for performance: the website's pages, with their photograph and serif, a
 * page about one thing, and the not-found page.
 */
const MEASURED = ['/', '/install/', '/about/', '/game/', NOT_FOUND];

/** What a report measures of one visit. */
const measureOf = (report) => {
    const requests = report.audits['network-requests']?.details?.items ?? [];
    const bytes = (type) =>
        requests
            .filter((request) => request.resourceType === type)
            .reduce((sum, request) => sum + (request.transferSize ?? 0), 0);
    return {
        accessibility: report.categories['accessibility']?.score ?? 0,
        performance: report.categories['performance']?.score ?? 0,
        paint: report.audits['largest-contentful-paint']?.numericValue ?? Number.POSITIVE_INFINITY,
        shift: report.audits['cumulative-layout-shift']?.numericValue ?? Number.POSITIVE_INFINITY,
        script: bytes('Script'),
        style: bytes('Stylesheet'),
        findings: (report.categories['accessibility']?.auditRefs ?? []).flatMap((ref) => {
            const audit = report.audits[ref.id];
            return audit && audit.score !== null && audit.score < 1 ? [audit.id] : [];
        }),
    };
};

/** Each timing's middle value across the traces, so one slow trace does not decide. */
const middle = (measures) => {
    const of = (pick) => {
        const sorted = measures.map(pick).sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)];
    };
    const [first] = measures;
    return {
        ...first,
        performance: of((m) => m.performance),
        paint: of((m) => m.paint),
        shift: of((m) => m.shift),
    };
};

/** What a page misses of the gate, each in a few words, or nothing when it passes. */
const missed = (m) => [
    ...(m.accessibility < 1
        ? [`accessibility ${Math.round(m.accessibility * 100)} (${m.findings.join(', ')})`]
        : []),
    ...(m.performance < PERFORMANCE ? [`performance ${Math.round(m.performance * 100)}`] : []),
    ...(m.paint > LARGEST_PAINT_MS ? [`largest paint ${Math.round(m.paint)} ms`] : []),
    ...(m.shift > LAYOUT_SHIFT ? [`layout shift ${m.shift.toFixed(3)}`] : []),
    ...(m.script > BUDGET.Script ? [`script ${m.script} bytes`] : []),
    ...(m.style > BUDGET.Stylesheet ? [`style ${m.style} bytes`] : []),
];

const timing = (m) => [
    ...(m.performance < PERFORMANCE ? ['performance'] : []),
    ...(m.paint > LARGEST_PAINT_MS ? ['paint'] : []),
    ...(m.shift > LAYOUT_SHIFT ? ['shift'] : []),
];

const server = await serve(PORT);
const chrome = await launch({
    chromePath: chromium.executablePath(),
    chromeFlags: ['--headless=new', '--no-sandbox'],
});
const failures = [];

/** One Lighthouse run of the categories given, read as a measure. */
const run = async (path, categories) => {
    const url = `${server.origin}${path}`;
    const result = await lighthouse(url, {
        port: chrome.port,
        onlyCategories: categories,
        output: 'json',
        logLevel: 'error',
    });
    if (!result) throw new Error(`Lighthouse returned nothing for ${url}`);
    if (result.lhr.runtimeError) throw new Error(`${path}: ${result.lhr.runtimeError.message}`);
    return measureOf(result.lhr);
};

try {
    for (const path of PAGES) {
        const { accessibility, findings } = await run(path, ['accessibility']);
        const detail = findings.length > 0 ? `, ${findings.join(', ')}` : '';
        console.log(`${path}: accessibility ${Math.round(accessibility * 100)}${detail}`);
        if (accessibility < 1)
            failures.push(`${path} (accessibility ${Math.round(accessibility * 100)}${detail})`);
    }
    for (const path of MEASURED) {
        const measures = [await run(path, ['performance'])];
        // A page that misses is traced until there are three, and judged on the middle one.
        if (timing(measures[0]).length > 0)
            while (measures.length < TRACES) measures.push(await run(path, ['performance']));
        const judged = middle(measures);
        console.log(
            `${path} on a first visit: performance ${Math.round(judged.performance * 100)}, largest paint ${Math.round(judged.paint)} ms, layout shift ${judged.shift.toFixed(3)}, script ${judged.script} bytes, style ${judged.style} bytes${measures.length > 1 ? `, the middle of ${measures.length}` : ''}`
        );
        const misses = missed({ ...judged, accessibility: 1 });
        if (misses.length > 0) failures.push(`${path} (${misses.join(', ')})`);
    }
} finally {
    await server.stop();
    try {
        chrome.kill();
    } catch {
        // Chrome was already gone.
    }
}

if (failures.length > 0) {
    console.error(`Short of the gate: ${failures.join(', ')}`);
    process.exit(1);
}
console.log('Every page meets the gate.');
