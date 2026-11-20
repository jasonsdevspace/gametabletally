import { moveFocus } from '@jasonsdevspace/design-kit/controls';
import { Button, Callout } from '@jasonsdevspace/design-kit/react';

/*
 * What went wrong, as the kit's danger callout, read at once. It is drawn only once there is a
 * failure, as an alert put on the page with its words is read in every screen reader the app
 * supports, and so a screen with nothing wrong keeps its layout and shows no empty box where a
 * browser cannot hide one. Where trying again can help, as a read that failed, Try again sits in
 * the callout's actions, as the kit's reference draws it, so the alert reads the failure and never
 * the button. The callout goes as it tries again, so focus goes to the screen's main region, which
 * its title names, rather than to nothing. The request is the kit's `moveFocus`, made apart from
 * this callout, since a hook's request would be called off as the callout leaves the page.
 */

/** A failure's words on the danger ground, said first as an error, or nothing when there are none. */
export const Failure = ({
    words,
    onTryAgain,
}: {
    readonly words: string | null;
    /** Tries again what failed, for a failure that trying again can help. */
    readonly onTryAgain?: (() => void) | undefined;
}) => {
    if (words === null || words === '') return null;
    const again =
        onTryAgain === undefined ? undefined : (
            <Button
                onClick={() => {
                    onTryAgain();
                    moveFocus('main');
                }}
            >
                Try again
            </Button>
        );
    return (
        <Callout tone="danger" live="alert" actions={again}>
            {words}
        </Callout>
    );
};
