import { Button, InputField } from '@jasonsdevspace/design-kit/react';
import {
    type FormEvent,
    type RefObject,
    useEffect,
    useRef,
    useState,
    useSyncExternalStore,
} from 'react';

import { refusalOf, type Store } from '../store/store.js';
import { PLAYERS_CHANGED, type PlayersRead, readPlayers } from './players.js';
import { cleanName } from './seats.js';

/*
 * What the screens that name players share: the longest name, a way to tell the prerender from the
 * running screen, the saved players as read, and the form a new player's name is typed in.
 */

/** The longest name a player can be given, which fits a seat's row and a table of scores. */
export const NAME_LENGTH = 30;

/**
 * The saved players and how many games each has played, read once the screen is running and again
 * when a player is put back from a toast, and why they could not be read, if so. Only the latest
 * read is drawn, so one that is answered late never draws over a newer one.
 */
export const usePlayersRead = (open: () => Promise<Store>, unreadWords: string) => {
    const [read, setRead] = useState<PlayersRead | null>(null);
    const [unread, setUnread] = useState('');
    useEffect(() => {
        let latest = 0;
        let left = false;
        const again = () => {
            latest += 1;
            const asked = latest;
            readPlayers(open).then(
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
    }, [open, unreadWords]);
    return { read, setRead, unread };
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
 * error, or null once it is taken. A name refused from the Add button moves focus to the field
 * once its error is drawn, so a screen reader says its label, that it is invalid and the error
 * together, as the kit's reference asks of a refused submit. One refused by Enter in the field,
 * where focus already is and moving it says nothing, is said on the status line instead.
 */
export const AddByName = ({
    field,
    onAdd,
    say,
}: {
    readonly field?: RefObject<HTMLInputElement | null>;
    readonly onAdd: (typed: string) => Promise<string | null>;
    /** Says a refusal on the screen's status line, since the kit's field error is not live. */
    readonly say: (words: string) => void;
}) => {
    const own = useRef<HTMLInputElement>(null);
    const input = field ?? own;
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    // Counts the refusals, so focus moves after each one is drawn, the same words twice included.
    const [refusals, setRefusals] = useState(0);
    useEffect(() => {
        if (refusals > 0) input.current?.focus();
    }, [refusals, input]);
    // Set while a name is being saved, so a second press does not save it twice.
    const adding = useRef(false);
    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (adding.current) return;
        adding.current = true;
        try {
            const refused = await onAdd(cleanName(name));
            setError(refused ?? '');
            if (refused === null) setName('');
            else if (document.activeElement === input.current) say(refused);
            else setRefusals((count) => count + 1);
        } finally {
            adding.current = false;
        }
    };
    return (
        <form noValidate onSubmit={(event) => void submit(event)}>
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
                action={<Button type="submit">Add</Button>}
            />
        </form>
    );
};
