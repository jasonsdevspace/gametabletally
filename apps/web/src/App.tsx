import { GAMES } from '@gametabletally/scoring';

/** The page a visitor starts on: the games the app keeps score for, by name. */
export const App = () => (
    <main>
        <h1>Game Table Tally</h1>
        <h2 id="games">Games</h2>
        <ul aria-labelledby="games">
            {GAMES.map((game) => (
                <li key={game.id}>{game.name}</li>
            ))}
        </ul>
    </main>
);
