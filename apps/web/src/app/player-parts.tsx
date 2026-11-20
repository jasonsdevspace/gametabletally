import { Button, InputField, useBusy, useFormRefusal } from '@jasonsdevspace/design-kit/react';
import {
    type FormEvent,
    type RefObject,
    useEffect,
    useRef,
    useState,
    useSyncExternalStore,
} from 'react';

import { refusalOf, type Store } from '../store/store.js';
import { PLAYERS_CHANGED } from './players.js';
import { cleanName } from './seats.js';

/*
 * What the screens that name players share: the longest name, a way to tell the prerender from the
 * running screen, the saved players as read, and the form a new player's name is typed in.
 */

/** The longest name a player can be given, which fits a seat's row and a table of scores. */
export const NAME_LENGTH = 30;

/**
 * The saved players as `readWith` reads them, such as with how many games each has played, read
 * once the screen is running and again when a player is put back from a toast, and why they could
 * not be read, if so, with Try again reading them afresh. Only the latest read is drawn, so one
 * that is answered late never draws over a newer one. `readWith` is the same across renders.
 */
export const usePlayersRead = <Read,>(
    open: () => Promise<Store>,
    unreadWords: string,
    readWith: (open: () => Promise<Store>) => Promise<Read>
) => {
    const [read, setRead] = useState<Read | null>(null);
    const [unread, setUnread] = useState('');
    // Each Try again reads afresh.
    const [attempts, setAttempts] = useState(0);
    useEffect(() => {
        let latest = 0;
        let left = false;
        const again = () => {
            latest += 1;
            const asked = latest;
            readWith(open).then(
                (found) => {
                    if (left || asked !== latest) return;
                    setRead(found);
                    setUnread('');
                },
                (error: unknown) => {
                    if (!left && asked === latest) setUnread(refusalOf(error) ?? unreadWords);
                }
            );
        };
        again();
        window.addEventListener(PLAYERS_CHANGED, again);
        return () => {
            left = true;
            window.removeEventListener(PLAYERS_CHANGED, again);
        };
    }, [open, unreadWords, readWith, attempts]);
    const tryAgain = () => {
        setUnread('');
        setAttempts((count) => count + 1);
    };
    return { read, setRead, unread, tryAgain };
};

const subscribeToNothing = () => () => undefined;

/**
 * Whether the screen is running in the browser past its first draw: false in the prerender and
 * while the browser takes the prerendered page over, so the two are the same page, and true after.
 */
export const useRunning = (): boolean =>
    useSyncExternalStore(
        subscribeToNothing,
        () => true,
        () => false
    );

/**
 * The form a new player's name is typed in: the kit's field, with its button as the field's
 * action. `onAdd` takes the name and resolves to why it could not, which is drawn as the field's
 * error, or null once it is taken. A refused name is refused through the kit's form, which moves
 * focus to the field once its error is drawn, or says the error on the status line where focus is
 * in the field already. The Add button is the kit's busy button while a name is saved, so a second
 * press, or Enter, saves nothing twice.
 */
export const AddByName = ({
    field,
    onAdd,
}: {
    readonly field?: RefObject<HTMLInputElement | null>;
    readonly onAdd: (typed: string) => Promise<string | null>;
}) => {
    const own = useRef<HTMLInputElement>(null);
    const input = field ?? own;
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [adding, setAdding] = useState(false);
    const addButton = useBusy<HTMLButtonElement>();
    const [form, refuse] = useFormRefusal<HTMLFormElement>({
        invalid: (failures) => {
            setError(failures[0]?.words ?? '');
        },
    });
    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setAdding(true);
        try {
            const refused = await onAdd(cleanName(name));
            setError(refused ?? '');
            if (refused === null) setName('');
            else refuse();
        } finally {
            setAdding(false);
        }
    };
    return (
        <form ref={form} onSubmit={(event) => void submit(event)}>
            <InputField
                ref={input}
                id="new-player"
                label="A new player's name"
                error={error}
                autoComplete="off"
                autoCapitalize="words"
                enterKeyHint="done"
                maxLength={NAME_LENGTH}
                value={name}
                onChange={(event) => {
                    setName(event.currentTarget.value);
                    setError('');
                }}
                action={
                    <Button
                        ref={addButton}
                        type="submit"
                        busy={adding ? 'Adding the player.' : false}
                    >
                        Add
                    </Button>
                }
            />
        </form>
    );
};
