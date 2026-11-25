import './styles/app.css';
import './styles/website.css';
import './styles/screens.css';
// Heard from the first moment on every page, since the browser can offer to install the app, or
// report it installed, before any screen is drawn and wherever the visitor is.
import './website/install-prompt.js';

import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';

import { countVisits } from './analytics.js';
import { App } from './App.js';
import { registerWorker } from './register.js';
import { routeAt } from './routes.js';
import { loadScreen } from './screens.js';

const root = document.getElementById('root');
// A page without the element would stay blank with nothing said, so it says why.
if (!root) throw new Error('The page has no element with the id "root" to draw the app in.');
const app = (
    <StrictMode>
        <App />
    </StrictMode>
);
const route = routeAt(location.pathname);
// The page's own screen is loaded first, which the build has the browser fetch beside this script,
// so the app takes over a page already whole. A built page holds its screen already, which the app
// takes over. The dev server's does not. A screen that does not load is said by the screen's
// boundary as the app draws.
void loadScreen(route)
    .catch(() => undefined)
    .then(() => {
        if (root.hasChildNodes()) hydrateRoot(root, app);
        else createRoot(root).render(app);
    });
registerWorker();
// Once the page has loaded, so the tracker never competes with the page's first draw.
window.addEventListener('load', () => void countVisits());
