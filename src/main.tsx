import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

// Safely catch any unhandled promise rejections or errors to prevent iframe crashes
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.warn('Unhandled promise rejection caught safely:', event.reason);
  });
  window.addEventListener('error', (event) => {
    console.warn('Unhandled script or DOM error caught safely:', event.error || event.message);
    if (event.message === 'Script error.' || !event.message) {
      event.preventDefault();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);


