import { useEffect, useMemo, useState } from 'react';

/**
 * Colour-mode helpers for the viewer (UI-LIGHT-MODE-LM10-1).
 *
 * The choice itself (Light / Dark / System, cookie + localStorage) belongs to the design-system kit
 * (`useColorMode`, `ThemeMenu`, the head script). What lives here is what the kit does not give a host:
 * the scheme that is ON SCREEN (the kit's hook does not see an embed host's `?theme=` override, which is
 * applied straight to <html>), and the one switch for the graph package.
 *
 * GRAPH_FOLLOWS_MODE: `@smartmemory/graph` takes `theme.mode` and, since UI-LIGHT-MODE-LM1-1 (graph 58fab96), draws
 * its canvas and chrome in both modes. ON since UI-LIGHT-MODE-LM10-FU-1 (it was false while the graph was dark-only);
 * everything below reads it. Set it false to pin the graph dark again.
 */
export const GRAPH_FOLLOWS_MODE = true;

/** Class that re-scopes graph-hosted chrome (toolbar buttons, the ask pane edge) to the dark palette while the graph is dark-only. */
export const GRAPH_SCOPE_CLASS = GRAPH_FOLLOWS_MODE ? '' : 'dark';

/** `theme` prop for GraphExplorer: undefined keeps the graph's own dark default. */
export function graphTheme(scheme, follows = GRAPH_FOLLOWS_MODE) {
  return follows ? { mode: scheme === 'light' ? 'light' : 'dark' } : undefined;
}

/** 'light' when <html> carries the light class, else 'dark' (the kit's head script, ThemeMenu and the embed override all write that class). */
export function appliedScheme(root) {
  return root.classList.contains('light') ? 'light' : 'dark';
}

/** The scheme on screen, live: follows any change to the class on <html>. */
export function useAppliedScheme() {
  const [scheme, setScheme] = useState(() => appliedScheme(document.documentElement));
  useEffect(() => {
    const root = document.documentElement;
    const update = () => setScheme(appliedScheme(root));
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return scheme;
}

/** Memoised `theme` prop for GraphExplorer. */
export function useGraphTheme() {
  const scheme = useAppliedScheme();
  return useMemo(() => graphTheme(scheme), [scheme]);
}
