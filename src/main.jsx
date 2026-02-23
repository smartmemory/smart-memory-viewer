import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { SmartMemoryProvider } from '@smartmemory/sdk-js/react';
import './index.css';
import App from './App';

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  void navigator.serviceWorker
    .getRegistrations()
    .then(async (registrations) => {
      await Promise.all(
        registrations.map(async (registration) => {
          const removed = await registration.unregister();
          if (removed) {
            console.debug('[SW] Unregistered stale service worker in development');
          }
        }),
      );
    })
    .catch((error) => {
      console.warn('[SW] Failed to clean stale service workers in development', error);
    });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
    >
      <SmartMemoryProvider mode="sso" apiBaseUrl={import.meta.env.VITE_API_URL}>
        <App />
      </SmartMemoryProvider>
    </ClerkProvider>
  </StrictMode>
);
