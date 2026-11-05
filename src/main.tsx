import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { demanderStockagePersistant } from './db/base';
import { FournisseurAuth } from './hooks/useAuth';
import './index.css';

// Service worker : mise à jour automatique ; l'application démarre sans réseau grâce au précache.
registerSW({ immediate: true });
void demanderStockagePersistant();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FournisseurAuth>
      <App />
    </FournisseurAuth>
  </StrictMode>,
);
