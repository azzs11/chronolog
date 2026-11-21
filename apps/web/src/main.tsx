import '@fontsource-variable/nunito';
import '@fontsource/mochiy-pop-one/latin-400.css'; // latin only: the Japanese subsets are 8 MB
import '@fontsource-variable/jetbrains-mono';
import './theme.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element in index.html');

// `VITE_DEMO=true npm run build:demo` builds the backend-free, playground-only site. The choice is
// made at build time, so the demo does not ship the dashboard's charts or socket client.
const isDemo = import.meta.env.VITE_DEMO === 'true';
const load = isDemo ? import('./DemoApp') : import('./app/AppRoutes');

load.then(({ default: Root }) => {
  ReactDOM.createRoot(container).render(
    <React.StrictMode>
      <BrowserRouter>
        <Root />
      </BrowserRouter>
    </React.StrictMode>,
  );
});
