import { Callout } from '@jasonsdevspace/design-kit/react';

/*
 * What went wrong, as the kit's danger callout, read at once. It is drawn only once there is a
 * failure, as an alert put on the page with its words is read in every screen reader the app
 * supports, and so a screen with nothing wrong keeps its layout and shows no empty box where a
 * browser cannot hide one.
 */

/** A failure's words on the danger ground, said first as an error, or nothing when there are none. */
export const Failure = ({ words }: { readonly words: string | null }) =>
    words === null || words === '' ? null : (
        <Callout tone="danger" live="alert">
            {words}
        </Callout>
    );
