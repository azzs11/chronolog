import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element in index.html');

// `VITE_DEMO=true npm run build:demo` builds the backend-free, playground-only site. The choice is
// made at build time, so the demo does not ship the dashboard's charts or socket client.
const isDemo = import.meta.env.VITE_DEMO === 'true';
const load = isDemo ? import('./DemoApp') : import('./App');

load.then(({ default: Root }) => {
  ReactDOM.createRoot(container).render(
    <React.StrictMode>
      <Root />
    </React.StrictMode>,
  );
});
