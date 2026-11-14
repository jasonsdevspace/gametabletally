import { expect, smallTargets, test } from './support.js';

/*
 * The target size check, on pages written for each part of WCAG 2.5.8, so the check that runs
 * beside the axe audit on every page is itself held to the rule.
 */

const page = (body: string) =>
    `<!doctype html><html lang="en"><head><style>body{margin:0;font:16px/1.2 sans-serif}a,button{margin:0;padding:0;border:0}</style></head><body>${body}</body></html>`;

test('flags two small links side by side', async ({ page: tab }) => {
    await tab.setContent(
        page(
            '<nav><a href="/a" style="display:inline-block;width:16px;height:16px">A</a><a href="/b" style="display:inline-block;width:16px;height:16px">B</a></nav>'
        )
    );
    expect(await smallTargets(tab)).toEqual(['A', 'B']);
});

test('flags a small button flush against a large one', async ({ page: tab }) => {
    await tab.setContent(
        page(
            '<div style="display:flex"><button style="width:16px;height:16px">x</button><button style="width:200px;height:40px">Save</button></div>'
        )
    );
    expect(await smallTargets(tab)).toEqual(['x']);
});

test('passes a small target whose circle clears every other target', async ({ page: tab }) => {
    await tab.setContent(
        page(
            '<button style="width:16px;height:16px">x</button><button style="width:16px;height:16px;margin-left:40px">y</button>'
        )
    );
    expect(await smallTargets(tab)).toEqual([]);
});

test('leaves out a link within a sentence', async ({ page: tab }) => {
    await tab.setContent(
        page(
            '<p style="width:200px">Read the <a href="/a">first</a> and <a href="/b">next</a> pages.</p>'
        )
    );
    expect(await smallTargets(tab)).toEqual([]);
});

test('passes over a link hidden until it has focus', async ({ page: tab }) => {
    await tab.setContent(
        page(
            '<a href="#main" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Skip</a><button style="width:20px;height:20px">x</button>'
        )
    );
    expect(await smallTargets(tab)).toEqual([]);
});
