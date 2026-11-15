import {
    type FormEvent,
    type RefObject,
    useCallback,
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
 * running screen, words said to a screen reader, the saved players as read, and the field a new
 * player's name is typed in.
 */

/** The longest name a player can be given, which fits a seat's row and a table of scores. */
export const NAME_LENGTH = 30;

/** Something said to a screen reader, counted so the same words said twice are heard twice. */
export interface Said {
    readonly words: string;
    readonly count: number;
}

/** The words to say to a screen reader, and the function that says the next. */
export const useSay = (): readonly [Said, (words: string) => void] => {
    const [said, setSaid] = useState<Said>({ words: '', count: 0 });
    const say = useCallback((words: string) => {
        setSaid((before) => ({ words, count: before.count + 1 }));
    }, []);
    return [said, say];
};

/**
 * A status line out of sight that says each message once it is set. Each is drawn in an element
 * of its own, so the same words said twice are heard twice.
 */
export const Announce = ({ said }: { readonly said: Said }) => (
    <p className="dk-visually-hidden" role="status">
        {said.words === '' ? null : <span key={said.count}>{said.words}</span>}
    </p>
);

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
 * The field a new player's name is typed in, with its button. `onAdd` takes the name and resolves
 * to why it could not, which is drawn as the field's error, or null once it is taken.
 */
export const AddByName = ({
    field,
    onAdd,
}: {
    readonly field?: RefObject<HTMLInputElement | null>;
    readonly onAdd: (typed: string) => Promise<string | null>;
}) => {
    const [name, setName] = useState('');
    const [error, setError] = useState('');
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
        } finally {
            adding.current = false;
        }
    };
    return (
        <form className="dk-field" noValidate onSubmit={(event) => void submit(event)}>
            <label className="dk-field-label" htmlFor="new-player">
                A new player&apos;s name
            </label>
            {error === '' ? null : (
                <p className="dk-field-error" id="new-player-error">
                    <span className="dk-visually-hidden">Error:</span> {error}
                </p>
            )}
            <div className="dk-field-action">
                <input
                    ref={field}
                    className="dk-input"
                    id="new-player"
                    autoComplete="off"
                    autoCapitalize="words"
                    enterKeyHint="done"
                    maxLength={NAME_LENGTH}
                    value={name}
                    aria-invalid={error === '' ? undefined : true}
                    aria-describedby={error === '' ? undefined : 'new-player-error'}
                    onChange={(event) => {
                        setName(event.currentTarget.value);
                        setError('');
                    }}
                />
                <button type="submit" className="dk-button">
                    Add
                </button>
            </div>
        </form>
    );
};
