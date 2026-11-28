// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    chmodSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { repositoryFiles } from './repository.mjs';

/*
 * What the workflows promise that only reading them can hold: every action pinned to the commit
 * it was reviewed at, no checkout that leaves the token in the repository, read access to the
 * repository by default, and the pull request's title and body checked by the prose check's
 * command from the tarball the lockfile names, checked against its hash, with nothing installed.
 */

/** Every workflow file git holds or would add, by its path. */
const workflows = repositoryFiles(import.meta.url, (path) =>
    /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path)
);

/** The steps of a workflow, each as its text from its dash to the next step or job. */
const stepsOf = (text: string): string[] =>
    text
        .split(/\n(?= *- (?:name|uses|run):)/)
        .filter((step) => /^ *- (?:name|uses|run):/.test(step));

describe('the workflows', () => {
    it('are found', () => {
        expect([...workflows.keys()].sort()).toEqual([
            '.github/workflows/ci.yml',
            '.github/workflows/message.yml',
        ]);
    });

    it('grant only read access to the repository by default, in every workflow', () => {
        expect(
            [...workflows]
                .filter(([, text]) => !/^permissions:\n {4}contents: read\n(?! )/m.test(text))
                .map(([path]) => path)
        ).toEqual([]);
    });

    it('pin every action to a full commit, in every workflow', () => {
        const unpinned = [...workflows].flatMap(([path, text]) =>
            [...text.matchAll(/^\s+(?:- )?uses: (\S+)/gm)]
                .map((match) => match[1] ?? '')
                .filter((use) => !use.startsWith('./') && !/@[0-9a-f]{40}$/.test(use))
                .map((use) => `${path} ${use}`)
        );
        expect(unpinned).toEqual([]);
        for (const [path, text] of workflows) expect(text, path).toMatch(/uses: \S+@[0-9a-f]{40}/);
    });

    it('check out without keeping the token in the repository, in every workflow', () => {
        const keeping = [...workflows].flatMap(([path, text]) =>
            stepsOf(text)
                .filter((step) => /uses: actions\/checkout@/.test(step))
                .filter((step) => !/^\s+persist-credentials: false$/m.test(step))
                .map(() => path)
        );
        expect(keeping).toEqual([]);
        for (const [path, text] of workflows)
            expect(text, path).toMatch(/uses: actions\/checkout@/);
    });
});

/**
 * The lines of a workflow's `run:` block that holds `needle`, as the shell receives them, with the
 * block's own indent taken off.
 */
const runBlockWith = (text: string, needle: string): string => {
    const lines = text.split('\n');
    const at = lines.findIndex((line) => line.includes(needle));
    let start = at;
    while (start > 0 && !/^\s*(?:- )?run: \|\s*$/.test(lines[start] ?? '')) start -= 1;
    const indent = /^(\s*)/.exec(lines[start + 1] ?? '')?.[1] ?? '';
    const body: string[] = [];
    for (const line of lines.slice(start + 1)) {
        if (line.trim() !== '' && !line.startsWith(indent)) break;
        body.push(line.slice(indent.length));
    }
    return at < 0 ? '' : body.join('\n');
};

/**
 * Every `run:` value in a workflow, a block's lines joined, so a test can read what reaches the
 * shell and nothing else. A block's lines sit deeper than its key, and the key of a `- run:`
 * step sits two places past the dash.
 */
const runsIn = (text: string): string[] => {
    const lines = text.split('\n');
    return lines.flatMap((line, at) => {
        const match = /^(\s*)(- )?run:\s*(.*)$/.exec(line);
        if (!match) return [];
        const [, indent = '', dash = '', value = ''] = match;
        if (!/^[|>][-+0-9]*\s*$/.test(value)) return [value];
        const base = indent.length + dash.length;
        const body: string[] = [];
        for (const next of lines.slice(at + 1)) {
            if (next.trim() !== '' && (/^(\s*)/.exec(next)?.[1]?.length ?? 0) <= base) break;
            body.push(next);
        }
        return [body.join('\n')];
    });
};

describe("the message workflow's check", () => {
    const message = workflows.get('.github/workflows/message.yml') ?? '';
    const script = runBlockWith(message, 'check-commit-message.mjs');
    const installed = fileURLToPath(
        new URL('../node_modules/@jasonsdevspace/prose-check', import.meta.url)
    );
    const work = mkdtempSync(join(tmpdir(), 'message-check-'));
    const manifest: unknown = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
    const version =
        typeof manifest === 'object' &&
        manifest !== null &&
        'version' in manifest &&
        typeof manifest.version === 'string'
            ? manifest.version
            : '';
    execFileSync('npm', ['pack', '--ignore-scripts', '--pack-destination', work, installed], {
        stdio: 'ignore',
    });
    const tarball = join(work, readdirSync(work).find((name) => name.endsWith('.tgz')) ?? '');
    const integrity = `sha512-${createHash('sha512').update(readFileSync(tarball)).digest('base64')}`;
    const registry = `https://registry.npmjs.org/@jasonsdevspace/prose-check/-/prose-check-${version}.tgz`;
    afterAll(() => rmSync(work, { recursive: true, force: true }));

    /**
     * How the step ends for a lockfile entry and a title, run as GitHub runs a step, with `curl`
     * replaced by one that serves the packed prose check whatever address it is given.
     */
    const ends = ({
        resolved = registry,
        hash = integrity,
        named = version,
        title = 'Check each pull request title',
    } = {}) => {
        const dir = mkdtempSync(join(work, 'case-'));
        const bin = join(dir, 'bin');
        const temp = join(dir, 'temp');
        mkdirSync(bin);
        mkdirSync(temp);
        writeFileSync(
            join(dir, 'package-lock.json'),
            JSON.stringify({
                packages: {
                    'node_modules/@jasonsdevspace/prose-check': {
                        version: named,
                        resolved,
                        integrity: hash,
                    },
                },
            })
        );
        writeFileSync(
            join(bin, 'curl'),
            `#!/bin/bash\nwhile [ $# -gt 1 ]; do [ "$1" = --output ] && out=$2; shift; done\ncp "${tarball}" "$out"\n`
        );
        chmodSync(join(bin, 'curl'), 0o755);
        const { status, stdout, stderr } = spawnSync(
            'bash',
            ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script],
            {
                cwd: dir,
                encoding: 'utf8',
                env: {
                    PATH: `${bin}:${process.env['PATH'] ?? ''}`,
                    RUNNER_TEMP: temp,
                    TITLE: title,
                    BODY: 'A plain body.',
                    AUTHOR: 'someone',
                },
            }
        );
        return { status, output: `${stdout}${stderr}` };
    };

    it('passes a plain title and body from the tarball the lockfile names', () => {
        expect(script).not.toBe('');
        expect(ends().status).toBe(0);
    });

    it('refuses a title that breaks a prose rule, naming the rule', () => {
        const refused = ends({ title: `Check each title ${String.fromCodePoint(0x2014)} twice` });
        expect(refused.status).toBe(1);
        expect(refused.output).toContain('em dash');
    });

    it('refuses a tarball whose hash is not the one the lockfile records', () => {
        const refused = ends({ hash: `${integrity.slice(0, -6)}AAAAA=` });
        expect(refused.status).toBe(1);
        expect(refused.output).toContain("does not match the lockfile's hash");
    });

    it('refuses an address that is not the registry address of the version the lockfile names', () => {
        for (const resolved of [
            'https://example.com/prose-check.tgz',
            `https://registry.npmjs.org/@jasonsdevspace/prose-check/-/prose-check-${version}/../../../../evil/-/evil-1.0.0.tgz`,
        ]) {
            const refused = ends({ resolved });
            expect(refused.status, resolved).toBe(1);
            expect(refused.output, resolved).toContain('outside the npm registry');
        }
        const crafted = 'x/../../../evil/-/evil-1.0.0';
        expect(
            ends({
                named: crafted,
                resolved: `https://registry.npmjs.org/@jasonsdevspace/prose-check/-/prose-check-${crafted}.tgz`,
            }).status
        ).toBe(1);
    });
});

describe('what reaches a script', () => {
    it('passes no pull request or event text into a script, only through env', () => {
        const pasted = [...workflows].flatMap(([path, text]) =>
            runsIn(text)
                .filter((run) => /\$\{\{\s*github\.(?:event\.|head_ref)/.test(run))
                .map(() => path)
        );
        expect(pasted).toEqual([]);
        expect(runsIn(workflows.get('.github/workflows/message.yml') ?? '').length).toBeGreaterThan(
            0
        );
    });

    it('runs on no trigger that hands a pull request a privileged token', () => {
        expect(
            [...workflows]
                .filter(([, text]) =>
                    /^\s*(?:pull_request_target|workflow_run)\s*:|\[[^\]]*\b(?:pull_request_target|workflow_run)\b/m.test(
                        text.replace(/^\s*#.*$/gm, '')
                    )
                )
                .map(([path]) => path)
        ).toEqual([]);
    });

    it('finds pull request text pasted into a script, and a privileged trigger', () => {
        expect(runsIn('      - run: echo "${{ github.event.pull_request.title }}"\n')).toEqual([
            'echo "${{ github.event.pull_request.title }}"',
        ]);
        expect(
            runsIn('      - run: |\n          printf %s "${{ github.head_ref }}"\n        env:\n')
        ).toEqual(['          printf %s "${{ github.head_ref }}"']);
    });
});

describe('the git hooks', () => {
    const hooks = repositoryFiles(import.meta.url, (path) => /^\.husky\/[^/_][^/]*$/.test(path));

    it('run npx only on what is installed, so a hook in a checkout without dependencies fetches nothing', () => {
        expect(hooks.size).toBeGreaterThan(0);
        const fetching = [...hooks].flatMap(([path, text]) =>
            text
                .split('\n')
                .filter((line) => /\bnpx\b/.test(line) && !/\bnpx --no-install\b/.test(line))
                .map((line) => `${path}: ${line}`)
        );
        expect(fetching).toEqual([]);
    });
});

/** A workflow's jobs, by id, each with its lines. */
const jobsIn = (text: string): [string, string][] => {
    const start = /^jobs:\n/m.exec(text);
    if (!start) return [];
    return [
        ...text
            .slice(start.index + start[0].length)
            .matchAll(/^ {4}([\w-]+):\n((?: {8}.*\n|[ \t]*\n)*)/gm),
    ].map((match) => [match[1] ?? '', match[2] ?? '']);
};

describe('the jobs and what they run', () => {
    const lines = [...workflows].flatMap(([path, text]) =>
        runsIn(text).flatMap((run) => run.split('\n').map((line) => `${path}: ${line.trim()}`))
    );

    it('install dependencies without running their install scripts', () => {
        const installs = lines.filter((line) => /\bnpm (?:ci|install|i|add)\b/.test(line));
        expect(installs.length).toBeGreaterThan(0);
        expect(installs.filter((line) => !/--ignore-scripts\b/.test(line))).toEqual([]);
    });

    it('run npx only on what is installed, so nothing is fetched to run', () => {
        expect(
            lines.filter((line) => /\bnpx\b/.test(line) && !/\bnpx --no-install\b/.test(line))
        ).toEqual([]);
    });

    it('give every job a name of its own, a named image and a time limit', () => {
        const jobs = [...workflows].flatMap(([path, text]) =>
            jobsIn(text).map(([id, body]) => ({ path, id, body }))
        );
        expect(jobs.length).toBeGreaterThan(0);
        const problems = jobs.flatMap(({ path, id, body }) => {
            const name = /^ {8}name: *(.+?) *$/m.exec(body)?.[1] ?? '';
            const image = /^ {8}runs-on: *(\S+)/m.exec(body)?.[1] ?? '';
            return [
                ...(name === '' || name === id || !/\s/.test(name)
                    ? [`${path} ${id}: no name of its own`]
                    : []),
                ...(/^ubuntu-\d+\.\d+$/.test(image) ? [] : [`${path} ${id}: image ${image}`]),
                ...(/^ {8}timeout-minutes: *\d+/m.test(body)
                    ? []
                    : [`${path} ${id}: no time limit`]),
            ];
        });
        expect(problems).toEqual([]);
    });
});
