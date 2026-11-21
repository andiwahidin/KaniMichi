import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

registerSW({
  immediate: true,
  onOfflineReady() {
    // Offline assets and curriculum data cached cleanly by Service Worker
  },
});

createRoot(document.getElementById('root')!).render(<App />);
