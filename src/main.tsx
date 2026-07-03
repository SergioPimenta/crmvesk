import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import { AuthProvider } from './contexts/AuthContext.tsx';
import { CrmDataProvider } from './contexts/CrmDataContext.tsx';
import { registerServiceWorker } from './utils/push';
import './index.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void registerServiceWorker().catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <CrmDataProvider>
          <App />
        </CrmDataProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
