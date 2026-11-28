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

import { beforeAll, describe, expect, it } from 'vitest';

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
                .filter(
                    ([, text]) => !/^permissions:\n {4}contents: read\n(?! {4}[\w-]+:)/m.test(text)
                )
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

/** How far a line is indented. */
const indentOf = (line: string): number => line.length - line.trimStart().length;

/** Where a step key sits: its indent, and two more past a dash that opens the step. */
const keyIndentOf = (line: string): number => indentOf(line) + (/^\s*- /.test(line) ? 2 : 0);

/** The lines after `start` that sit deeper than `base`, blank lines among them. */
const linesUnder = (lines: readonly string[], start: number, base: number): string[] => {
    const body: string[] = [];
    for (const line of lines.slice(start + 1)) {
        if (line.trim() !== '' && indentOf(line) <= base) break;
        body.push(line);
    }
    return body;
};

/** The `run:` block key above line `at`, in the same step, or -1 when that step has none. */
const runKeyAbove = (lines: readonly string[], at: number): number => {
    for (let start = at; start >= 0; start -= 1) {
        const line = lines[start] ?? '';
        if (/^\s*(?:- )?run: [|>][-+0-9]*\s*$/.test(line)) return start;
        if (start < at && /^\s*- /.test(line)) return -1;
    }
    return -1;
};

/**
 * The lines of the `run:` block in the step that holds `needle`, as the shell receives them, with
 * the block's own indent taken off, or nothing when no block in that step holds it.
 */
const runBlockWith = (text: string, needle: string): string => {
    const lines = text.split('\n');
    const start = runKeyAbove(
        lines,
        lines.findIndex((line) => line.includes(needle))
    );
    if (start < 0) return '';
    const block = linesUnder(lines, start, keyIndentOf(lines[start] ?? ''));
    const indent = Math.min(...block.filter((line) => line.trim() !== '').map(indentOf));
    return block.map((line) => line.slice(indent)).join('\n');
};

/**
 * Every `run:` value in a workflow, and every `script:` input, which an `actions/github-script`
 * step runs, so a test can read what reaches a shell or a script and nothing else. A block's lines,
 * and a plain or quoted value's continuation lines, sit deeper than its key, and the key of a
 * `- run:` step sits two places past the dash.
 */
const runsIn = (text: string): string[] => {
    const lines = text.split('\n');
    return lines.flatMap((line, at) => {
        const value = /^\s*(?:- )?(?:run|script):\s*(.*)$/.exec(line)?.[1];
        if (value === undefined) return [];
        const first = /^[|>][-+0-9]*\s*$/.test(value) ? '' : value;
        return [[first, ...linesUnder(lines, at, keyIndentOf(line))].join('\n').trim()];
    });
};

/** A workflow's text without its comment lines, so a word in a comment is not taken for a key. */
const uncommented = (text: string): string => text.replace(/^\s*#.*$/gm, '');

/** Each `npx`, `npm exec` or `npm x` on a line that could fetch a package rather than run one installed. */
const fetchingRuns = (line: string): string[] => [
    ...[...line.matchAll(/\bnpx\b(?! --no-install\b)/g)].map(() => line),
    ...[...line.matchAll(/\bnpm (?:exec|x)\b((?:\s+-\S+)*)/g)]
        .filter((match) => !/\s--no(?:-install)?\b/.test(match[1] ?? ''))
        .map(() => line),
];

describe("the message workflow's check", () => {
    const message = workflows.get('.github/workflows/message.yml') ?? '';
    const script = runBlockWith(message, 'check-commit-message.mjs');
    let work = '';
    let version = '';
    let tarball = '';
    let integrity = '';
    let registry = '';

    beforeAll(() => {
        work = mkdtempSync(join(tmpdir(), 'message-check-'));
        const removeWork = () => rmSync(work, { recursive: true, force: true });
        try {
            pack();
        } catch (error) {
            removeWork();
            throw error;
        }
        return removeWork;
    });

    /** Packs the installed prose check into the work folder and records what the lockfile would. */
    const pack = () => {
        const installed = fileURLToPath(
            new URL('../node_modules/@jasonsdevspace/prose-check', import.meta.url)
        );
        const manifest: unknown = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
        version =
            typeof manifest === 'object' &&
            manifest !== null &&
            'version' in manifest &&
            typeof manifest.version === 'string'
                ? manifest.version
                : '';
        execFileSync('npm', ['pack', '--ignore-scripts', '--pack-destination', work, installed], {
            stdio: 'ignore',
        });
        tarball = join(work, readdirSync(work).find((name) => name.endsWith('.tgz')) ?? '');
        integrity = `sha512-${createHash('sha512').update(readFileSync(tarball)).digest('base64')}`;
        registry = `https://registry.npmjs.org/@jasonsdevspace/prose-check/-/prose-check-${version}.tgz`;
    };

    /** One case of the step: a lockfile entry's fields over the real ones, a title, a body and an author. */
    interface Case {
        readonly entry?: Readonly<Record<string, string>> | null;
        readonly title?: string;
        readonly body?: string;
        readonly author?: string;
    }

    /**
     * How the step ends for a lockfile entry, a title, a body and an author, run as GitHub runs a
     * step, with `curl` replaced by one that serves the packed prose check whatever address it is
     * given. An entry of `null` leaves the prose check out of the lockfile.
     */
    const ends = (given: Case = {}) => {
        const { entry, title, body, author } = {
            entry: {},
            title: 'Check each pull request title',
            body: 'A plain body.',
            author: 'someone',
            ...given,
        };
        const dir = mkdtempSync(join(work, 'case-'));
        const bin = join(dir, 'bin');
        const temp = join(dir, 'temp');
        mkdirSync(bin);
        mkdirSync(temp);
        const packages =
            entry === null
                ? {}
                : {
                      'node_modules/@jasonsdevspace/prose-check': {
                          version,
                          resolved: registry,
                          integrity,
                          ...entry,
                      },
                  };
        writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({ packages }));
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
                    BODY: body,
                    AUTHOR: author,
                },
            }
        );
        return { status, output: `${stdout}${stderr}` };
    };

    it('passes a plain title and body from the tarball the lockfile names, installing nothing', () => {
        expect(script).not.toBe('');
        expect(ends().status).toBe(0);
        expect(uncommented(message)).not.toMatch(/\bnpx\b|\bnpm (?:exec|x|ci|install|i|add)\b/);
    });

    it('refuses a title that breaks a prose rule, naming the rule', () => {
        const refused = ends({ title: `Check each title ${String.fromCodePoint(0x2014)} twice` });
        expect(refused.status).toBe(1);
        expect(refused.output).toContain('em dash');
    });

    it("holds only Dependabot's title to the rules, since its body quotes release notes", () => {
        expect(
            ends({
                author: 'dependabot[bot]',
                body: `Release notes ${String.fromCodePoint(0x2014)} written elsewhere.`,
            }).status
        ).toBe(0);
    });

    it('refuses a tarball whose hash is not the one the lockfile records', () => {
        const refused = ends({ entry: { integrity: `${integrity.slice(0, -6)}AAAAA=` } });
        expect(refused.status).toBe(1);
        expect(refused.output).toContain("does not match the lockfile's hash");
    });

    it('refuses an address that is not the registry address of the version the lockfile names', () => {
        for (const resolved of [
            'https://example.com/prose-check.tgz',
            `${registry.slice(0, -4)}/../../../../evil/-/evil-1.0.0.tgz`,
        ]) {
            const refused = ends({ entry: { resolved } });
            expect(refused.status, resolved).toBe(1);
            expect(refused.output, resolved).toContain('outside the npm registry');
        }
        const crafted = 'x/../../../evil/-/evil-1.0.0';
        expect(
            ends({
                entry: {
                    version: crafted,
                    resolved: `https://registry.npmjs.org/@jasonsdevspace/prose-check/-/prose-check-${crafted}.tgz`,
                },
            }).status
        ).toBe(1);
    });

    it('stops on a lockfile that names no version of the prose check, or leaves it out', () => {
        const unnamed = ends({ entry: { version: '' } });
        expect(unnamed.status).toBe(1);
        expect(unnamed.output).toContain('names no version of the prose check');
        expect(ends({ entry: null }).status).not.toBe(0);
    });
});

describe('what reaches a script', () => {
    /** message.yml's text. */
    const message = () => workflows.get('.github/workflows/message.yml') ?? '';

    it('passes no pull request or event text into a script, only through env', () => {
        const pasted = [...workflows].flatMap(([path, text]) =>
            runsIn(uncommented(text))
                .filter((run) =>
                    /\$\{\{(?:(?!\}\})[\s\S])*?\bgithub\.(?:event\b|head_ref)/.test(run)
                )
                .map(() => path)
        );
        expect(pasted).toEqual([]);
        expect(runsIn(message()).length).toBeGreaterThan(0);
    });

    it('runs on no trigger that hands a pull request a privileged token', () => {
        expect(
            [...workflows]
                .filter(([, text]) =>
                    /^on:.*\b(?:pull_request_target|workflow_run)\b|^\s+(?:- *)?(?:pull_request_target|workflow_run)\s*(?::|$)/m.test(
                        uncommented(text)
                    )
                )
                .map(([path]) => path)
        ).toEqual([]);
    });

    it('finds event text in a script however it is written, and a privileged trigger however it is named', () => {
        const pasted = (yaml: string) =>
            runsIn(yaml).some((run) =>
                /\$\{\{(?:(?!\}\})[\s\S])*?\bgithub\.(?:event\b|head_ref)/.test(run)
            );
        expect(pasted('      - run: echo "${{ github.event.pull_request.title }}"\n')).toBe(true);
        expect(pasted('      - run: |\n          printf %s "${{ toJSON(github.event) }}"\n')).toBe(
            true
        );
        expect(
            pasted('      - run: echo start &&\n          echo "${{ github.head_ref }}"\n')
        ).toBe(true);
        expect(
            pasted(
                "      - uses: actions/github-script@v8\n        with:\n          script: |\n            core.info('${{ format('{0}', github.event.issue.title) }}')\n"
            )
        ).toBe(true);
        expect(
            pasted(
                '      - run: echo "$TITLE"\n        env:\n          TITLE: ${{ github.event.pull_request.title }}\n'
            )
        ).toBe(false);
        for (const on of [
            'on: pull_request_target\n',
            'on: [push, workflow_run]\n',
            'on:\n    - pull_request_target\n',
            'on:\n    workflow_run:\n        workflows: [CI]\n',
        ])
            expect(
                /^on:.*\b(?:pull_request_target|workflow_run)\b|^\s+(?:- *)?(?:pull_request_target|workflow_run)\s*(?::|$)/m.test(
                    on
                ),
                on
            ).toBe(true);
    });
});

describe('the git hooks', () => {
    const hooks = repositoryFiles(import.meta.url, (path) => /^\.husky\/[^/_][^/]*$/.test(path));

    it('run npx, npm exec and npm x only on what is installed, so a hook in a checkout without dependencies fetches nothing', () => {
        expect(hooks.size).toBeGreaterThan(0);
        const fetching = [...hooks].flatMap(([path, text]) =>
            text.split('\n').flatMap((line) => fetchingRuns(line).map(() => `${path}: ${line}`))
        );
        expect(fetching).toEqual([]);
    });

    it('find every call that could fetch, however many share a line', () => {
        expect(fetchingRuns('npx --no-install lint-staged')).toEqual([]);
        expect(fetchingRuns('npx --no-install a && npx b')).toHaveLength(1);
        expect(fetchingRuns('npm exec foo')).toHaveLength(1);
        expect(fetchingRuns('npm x --no foo')).toEqual([]);
        expect(fetchingRuns('npm exec --no-install -- foo')).toEqual([]);
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

    it('run npx, npm exec and npm x only on what is installed, so nothing is fetched to run', () => {
        expect(lines.flatMap(fetchingRuns)).toEqual([]);
    });

    it('give every job a name of its own, a named image and a time limit', () => {
        for (const [path, text] of workflows) expect(jobsIn(text).length, path).toBeGreaterThan(0);
        const jobs = [...workflows].flatMap(([path, text]) =>
            jobsIn(text).map(([id, body]) => ({ path, id, body }))
        );
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
