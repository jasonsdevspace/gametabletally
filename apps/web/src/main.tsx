import './styles/app.css';

import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';

import { App } from './App.js';
import { registerWorker } from './register.js';

const root = document.getElementById('root');
// A page without the element would stay blank with nothing said, so it says why.
if (!root) throw new Error('The page has no element with the id "root" to draw the app in.');
const app = (
    <StrictMode>
        <App />
    </StrictMode>
);
// A built page holds its screen already, which the app takes over. The dev server's does not.
if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
registerWorker();
