import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { SmartMemoryProvider } from '@smartmemory/sdk-js/react';
import './index.css';
import App from './App';

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

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
