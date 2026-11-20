import { StatusProvider } from '@jasonsdevspace/design-kit/react';
import { render as draw, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';

export * from '@testing-library/react';

/**
 * Draws a screen as the app does, under the status line every screen speaks on, so a screen drawn
 * alone in a test says its words where the app's would.
 */
export const render = (ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) =>
    draw(ui, { wrapper: StatusProvider, ...options });

/** The status line every screen speaks on, apart from the toast's own. */
export const appLine = (): HTMLElement => {
    const line = Array.from(document.querySelectorAll<HTMLElement>('[role="status"]')).find(
        (one) => one.closest('.dk-app-toast') === null
    );
    if (line === undefined) throw new Error('The status line is not on the page.');
    return line;
};
