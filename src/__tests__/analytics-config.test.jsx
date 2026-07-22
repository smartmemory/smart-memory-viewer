import { readFileSync } from 'node:fs';
import React from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const { analyticsConfig, createAnalyticsConfig, renderRoot } = vi.hoisted(() => {
  const config = {
    apiKey: 'phc_test_viewer',
    options: {
      api_host: 'https://posthog.example.test',
      autocapture: false,
      capture_exceptions: true,
      capture_pageview: 'history_change',
      cross_subdomain_cookie: true,
      defaults: '2025-05-24',
      disable_session_recording: true,
    },
  };
  return {
    analyticsConfig: config,
    createAnalyticsConfig: vi.fn(() => config),
    renderRoot: vi.fn(),
  };
});

vi.mock('react-dom/client', () => ({
  createRoot: () => ({ render: renderRoot }),
}));
vi.mock('posthog-js', () => ({ default: {} }));
vi.mock('@smartmemory/sdk-js/react/analytics', () => ({ createAnalyticsConfig }));
vi.mock('@clerk/clerk-react', () => ({ ClerkProvider: ({ children }) => children }));
vi.mock('@smartmemory/sdk-js/react', () => ({ SmartMemoryProvider: ({ children }) => children }));
vi.mock('posthog-js/react', () => ({ PostHogProvider: ({ children }) => children }));
vi.mock('../App', () => ({ default: () => null }));
vi.mock('../EmbeddedApp', () => ({ default: () => null }));

let withPostHog;

beforeAll(async () => {
  vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'phc_test_viewer');
  vi.stubEnv('VITE_PUBLIC_POSTHOG_HOST', 'https://posthog.example.test');
  vi.stubEnv('VITE_ALLOW_EMBEDDED', 'false');
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('window', {
    location: {
      hostname: 'viewer.example.test',
      search: '',
    },
  });
  vi.stubGlobal('document', {
    getElementById: vi.fn(() => ({})),
  });

  ({ withPostHog } = await import('../main.jsx'));
});

describe('Viewer analytics configuration', () => {
  it('passes the strict shared options to PostHog', () => {
    const child = React.createElement('span');
    const wrapped = withPostHog(child);

    expect(createAnalyticsConfig).toHaveBeenCalledWith({
      app: 'viewer',
      apiKey: 'phc_test_viewer',
      apiHost: 'https://posthog.example.test',
    });
    expect(wrapped.props.apiKey).toBe('phc_test_viewer');
    expect(wrapped.props.options).toBe(analyticsConfig.options);
  });

  it('passes children through when the shared config is disabled', () => {
    const child = React.createElement('span');
    expect(withPostHog(child, { apiKey: null, options: {} })).toBe(child);
  });

  it('keeps Viewer anonymous with no identity or reset adapter mounted', () => {
    const source = readFileSync(new URL('../main.jsx', import.meta.url), 'utf8');
    expect(source).not.toMatch(/AnalyticsIdentity|resetAnalytics/);
  });
});
