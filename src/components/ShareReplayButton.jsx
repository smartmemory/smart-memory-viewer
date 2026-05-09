import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Share-replay button. Surfaced in the viewer toolbar via `toolbarRightActions`
 * when a run has completed and the graph has at least one element. Clicking
 * copies a shareable URL of the form `<origin>/?run=<uuid>` to the clipboard.
 *
 * Hostname resolution: always uses `window.location.origin`. Production is
 * served at sanctuary.smartmemory.ai (per Caddy config); dev is whatever
 * Vite is bound to. Using `window.location.origin` keeps the share URL
 * identical to the page the user is currently viewing — which is exactly
 * what they want to share.
 *
 * No silent fallback: if `navigator.clipboard.writeText` is unavailable
 * (insecure context, ancient browser), the button drops into a manual
 * input + select-text pattern AND emits a console.warn, per project rule
 * `no-silent-degradation.md`.
 */
export default function ShareReplayButton({ runId }) {
  const [feedback, setFeedback] = useState(null); // 'copied' | 'fallback' | null
  const [fallbackUrl, setFallbackUrl] = useState(null);
  const fallbackInputRef = useRef(null);
  const dismissTimerRef = useRef(null);

  const buildUrl = useCallback(() => {
    return `${window.location.origin}/?run=${encodeURIComponent(runId)}`;
  }, [runId]);

  const handleCopy = useCallback(async () => {
    const url = buildUrl();
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        setFeedback('copied');
        return;
      } catch (err) {
        console.warn('[ShareReplayButton] navigator.clipboard.writeText failed; falling back to manual input', err);
        setFallbackUrl(url);
        setFeedback('fallback');
        return;
      }
    }
    console.warn('[ShareReplayButton] navigator.clipboard unavailable (insecure context?); falling back to manual input');
    setFallbackUrl(url);
    setFeedback('fallback');
  }, [buildUrl]);

  // Auto-dismiss the "copied" toast after 2s; keep the fallback until clicked-away.
  useEffect(() => {
    if (feedback !== 'copied') return;
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => setFeedback(null), 2000);
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [feedback]);

  // Auto-select the URL in the fallback input so the user can Cmd+C.
  useEffect(() => {
    if (feedback === 'fallback' && fallbackInputRef.current) {
      fallbackInputRef.current.focus();
      fallbackInputRef.current.select();
    }
  }, [feedback]);

  return (
    <div className="relative inline-flex items-center" data-testid="share-replay-root">
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Share this run"
        title="Share this run"
        data-testid="share-replay-button"
        data-run-id={runId}
        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors flex items-center gap-1"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          {/* link / chain icon */}
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
        </svg>
        <span className="text-xs hidden sm:inline">Share</span>
      </button>

      {feedback === 'copied' && (
        <div
          role="status"
          data-testid="share-replay-copied-toast"
          className="absolute right-0 top-full mt-1 z-50 bg-emerald-900/90 border border-emerald-700 text-emerald-200 px-2 py-1 rounded text-xs whitespace-nowrap shadow-lg"
        >
          Link copied
        </div>
      )}

      {feedback === 'fallback' && fallbackUrl && (
        <div
          role="dialog"
          aria-label="Copy share link"
          data-testid="share-replay-fallback"
          className="absolute right-0 top-full mt-1 z-50 bg-slate-800 border border-slate-600 rounded-lg p-2 shadow-xl flex items-center gap-2"
        >
          <input
            ref={fallbackInputRef}
            type="text"
            readOnly
            value={fallbackUrl}
            data-testid="share-replay-fallback-input"
            className="bg-slate-900 border border-slate-700 text-slate-100 text-xs rounded px-2 py-1 w-72 font-mono"
            onFocus={(e) => e.target.select()}
          />
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-200 text-xs px-1"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
