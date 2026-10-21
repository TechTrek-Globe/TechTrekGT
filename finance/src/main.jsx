import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Auto-reload on dynamic import / chunk preload failure (e.g. post-deployment or network glitch)
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    const lastReload = Number(sessionStorage.getItem('last_vite_preload_reload') || 0);
    const now = Date.now();
    if (now - lastReload > 10000) {
      sessionStorage.setItem('last_vite_preload_reload', String(now));
      window.location.reload();
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

