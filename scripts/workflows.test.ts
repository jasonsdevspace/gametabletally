// @vitest-environment node
import { describe, expect, it } from 'vitest';

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
                .filter(([, text]) => !/^permissions:\n {4}contents: read\n/m.test(text))
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

    it("run the commit message check from the lockfile's own tarball, checked against its hash, with nothing installed", () => {
        const message = workflows.get('.github/workflows/message.yml') ?? '';
        const step = stepsOf(message).find((text) => /check-commit-message/.test(text)) ?? '';
        const order = [
            "p.resolved + ' ' + p.integrity",
            'https://registry.npmjs.org/@jasonsdevspace/prose-check/-/prose-check-*.tgz) ;;',
            'openssl dgst -sha512 -binary',
            'does not match the lockfile\'s hash"',
            'exit 1',
            'node "$RUNNER_TEMP/prose-check/package/bin/check-commit-message.mjs" --as-is',
        ];
        let from = 0;
        const missing = order.filter((text) => {
            const at = step.indexOf(text, from);
            if (at < 0) return true;
            from = at + text.length;
            return false;
        });
        expect(missing).toEqual([]);
        expect(message).not.toMatch(/\bnpm (?:exec|x)\b|\bnpx\b/);
    });
});
