import { useStatus } from '@jasonsdevspace/design-kit/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { render, screen, waitFor } from './render.testing.js';

/*
 * The screens' fields and status lines are the kit's, so none of the app's screens writes the
 * markup of either by hand, and what a screen says goes through the kit's status line.
 */

const sources = import.meta.glob<string>(['./*.tsx', '!./*.test.tsx', '!./*.testing.tsx'], {
    eager: true,
    query: '?raw',
    import: 'default',
});

const Speaker = ({ words }: { readonly words: string }) => {
    const say = useStatus();
    return (
        <button
            type="button"
            onClick={() => {
                say(words);
            }}
        >
            Say
        </button>
    );
};

describe("the screens' fields and status lines", () => {
    it('are drawn by the kit, never written by hand', () => {
        expect(Object.keys(sources).length).toBeGreaterThan(5);
        const written = Object.entries(sources).flatMap(([file, source]) =>
            [
                ...source.matchAll(
                    /className="dk-(?:field(?:-action|-label|-error)?|input)"|role="status"/g
                ),
            ].map(([found]) => `${file}: ${found}`)
        );
        expect(written).toEqual([]);
    });

    it('say their words on the kit status line, a moment after they are told', async () => {
        render(<Speaker words="Ann added." />);
        const line = screen.getByRole('status');
        expect(line).toHaveTextContent('');
        screen.getByRole('button', { name: 'Say' }).click();
        await waitFor(() => {
            expect(line).toHaveTextContent('Ann added.');
        });
    });

    it('leaves no timer running once a screen that spoke is taken away', async () => {
        vi.useFakeTimers();
        const { unmount } = render(<Speaker words="Ann added." />);
        screen.getByRole('button', { name: 'Say' }).click();
        vi.advanceTimersByTime(150);
        unmount();
        await Promise.resolve();
        expect(vi.getTimerCount()).toBe(0);
    });
});

afterEach(() => {
    vi.useRealTimers();
});
