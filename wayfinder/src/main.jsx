import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { WayfinderProvider } from './context/WayfinderContext.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <WayfinderProvider>
        <App />
      </WayfinderProvider>
    </AuthProvider>
  </StrictMode>,
);
