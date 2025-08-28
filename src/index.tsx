import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './routes/App';
import reportWebVitals from './reportWebVitals';
import { HashRouter } from 'react-router-dom';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import { processQueue } from './utils/queue';
import { loadDay, saveDay } from './utils/storage';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);

// Register PWA service worker for offline
serviceWorkerRegistration.register({
  onSuccess: () => {},
  onUpdate: () => {}
});

// Listen SW postMessage
navigator.serviceWorker?.addEventListener('message', (event: MessageEvent) => {
  if (event.data?.type === 'BG_SYNC_TRIGGER') {
    processQueue(loadDay, (date) => {
      const rec = loadDay(date); rec.sent = true; saveDay(rec);
    });
  }
});

// Retry on online
window.addEventListener('online', () => {
  processQueue(loadDay, (date) => {
    const rec = loadDay(date); rec.sent = true; saveDay(rec);
  });
});


reportWebVitals();
