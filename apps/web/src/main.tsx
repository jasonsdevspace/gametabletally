import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';

const root = document.getElementById('root');
// A page without the element would stay blank with nothing said, so it says why.
if (!root) throw new Error('The page has no element with the id "root" to draw the app in.');
createRoot(root).render(
    <StrictMode>
        <App />
    </StrictMode>
);
