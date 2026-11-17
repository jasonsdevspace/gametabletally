import type { ReactNode } from 'react';

/**
 * An icon, the kit's: one em of the text around it, or the tab bar's size there, stroked in the
 * text's color and hidden from a screen reader, since the words beside it or the button's own name
 * say what it is.
 */
export const Icon = ({ children }: { readonly children: ReactNode }) => (
    <svg className="dk-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {children}
    </svg>
);
