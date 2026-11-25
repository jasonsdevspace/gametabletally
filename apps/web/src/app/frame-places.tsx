import type { ShowToast } from '@jasonsdevspace/design-kit/controls';
import { createContext, type ReactNode, useContext, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

/*
 * The frame's places a screen draws into: its one toast and its dock. They are apart from the
 * frame itself, so a screen that uses them never pulls the frame's code into its own file, and the
 * frame is loaded once, with the app's first screen.
 */

/** What a screen outside the frame is given: a toast that shows nothing. */
export const ToastContext = createContext<ShowToast>(() => () => undefined);

/** The function a screen shows a toast with, in the frame's one place for it. */
export const useToast = (): ShowToast => useContext(ToastContext);

/** Where a screen draws its main button: the frame's dock, and a way to say a screen holds it. */
interface DockPlace {
    readonly element: HTMLElement | null;
    /**
     * Marks the dock as held while a screen's dock is drawn, and returns the function that lets it
     * go.
     */
    readonly hold: () => () => void;
}

export const DockContext = createContext<DockPlace>({ element: null, hold: () => () => undefined });

/**
 * A screen's main button, or two, drawn in the frame's dock under the thumb, which the screen
 * keeps in its own state like anything in its body. The dock is in the frame, so a screen's
 * dock is drawn into it once the frame is on the page, and never in the prerender, where nothing
 * on a screen for keeping score works yet.
 */
export const Dock = ({ children }: { readonly children: ReactNode }) => {
    const { element, hold } = useContext(DockContext);
    useLayoutEffect(hold, [hold]);
    return element ? createPortal(children, element) : null;
};
