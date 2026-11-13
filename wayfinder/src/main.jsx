import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { WayfinderProvider } from './context/WayfinderContext.jsx';
import { SettingsProvider } from './context/SettingsContext.jsx';
import './index.css';

const loadInterFont = () => {
  if (typeof document === 'undefined') return;
  const href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;900&display=swap';
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
};

if (typeof window !== 'undefined') {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => loadInterFont());
  } else {
    setTimeout(loadInterFont, 0);
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <SettingsProvider>
        <WayfinderProvider>
          <App />
        </WayfinderProvider>
      </SettingsProvider>
    </AuthProvider>
  </StrictMode>,
);
