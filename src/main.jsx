import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { SmartMemoryProvider } from '@smartmemory/sdk-js/react';
import './index.css';
import App from './App';
import EmbeddedApp from './EmbeddedApp';
import { PostHogProvider } from 'posthog-js/react';
import { createAnalyticsConfig } from '@smartmemory/sdk-js/react/analytics';

// FEAT-6 (discord-bot) Activity build — when VITE_ALLOW_EMBEDDED=true and the
// URL carries Discord's launch params, skip the Clerk SSO flow and boot
// straight into the Activity claim handshake. Returning false keeps the
// default behavior intact for all other deployments (viewer.smartmemory.ai etc).
function shouldRunEmbedded() {
  if (import.meta.env.VITE_ALLOW_EMBEDDED !== 'true') return false;
  const p = new URLSearchParams(window.location.search);
  return p.has('guild_id') && p.has('channel_id');
}

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// PostHog (Project A). Gated on the key; tags every event with app:'viewer'.
// No identify() here — viewer fetches no user profile, and PostHog's
// cross-subdomain cookie already carries the identity set in web/studio within
// the same project. Pageviews come from history_change autocapture.
const posthogKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
const analyticsConfig = createAnalyticsConfig({
  app: 'viewer',
  apiKey: posthogKey,
  apiHost: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
});
export function withPostHog(children, config = analyticsConfig) {
  if (!config.apiKey) return children;
  return (
    <PostHogProvider
      apiKey={config.apiKey}
      options={config.options}
    >
      {children}
    </PostHogProvider>
  );
}

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

const rootElement = document.getElementById('root');

if (shouldRunEmbedded()) {
  // Activity mode: no Clerk, no SmartMemoryProvider SSO. Auth lives in the
  // HttpOnly session cookie issued by discord-bot's /api/graph/claim.
  createRoot(rootElement).render(
    <StrictMode>
      <EmbeddedApp />
    </StrictMode>
  );
} else {
  createRoot(rootElement).render(
    <StrictMode>
      {withPostHog(
        <ClerkProvider
          publishableKey={clerkPublishableKey}
          signInFallbackRedirectUrl="/"
          signUpFallbackRedirectUrl="/"
        >
          <SmartMemoryProvider mode="sso" apiBaseUrl={import.meta.env.VITE_API_URL}>
            <App />
          </SmartMemoryProvider>
        </ClerkProvider>
      )}
    </StrictMode>
  );
}
