import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { WayfinderProvider } from './context/WayfinderContext.jsx';
import { SettingsProvider } from './context/SettingsContext.jsx';
import './index.css';

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
