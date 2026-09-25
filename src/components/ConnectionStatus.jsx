import { useEffect, useState } from 'react';

/** Authenticated transport health; a successful public /health probe cannot clear it. */
export default function ConnectionStatus({ connection, terminalError }) {
  const [snapshot, setSnapshot] = useState(() => connection.snapshot);
  useEffect(() => connection.subscribe(setSnapshot), [connection]);
  const message = terminalError || (snapshot.status === 'signed_out'
    ? 'Your session ended. Sign in again.'
    : snapshot.status === 'reconnecting' ? 'Reconnecting to SmartMemory…' : null);
  if (!message) return null;
  return (
    <div role="status" aria-live="polite" title={snapshot.reason || undefined}
      className="fixed top-0 left-0 right-0 z-[100] bg-red-900/90 border-b border-red-700 px-4 py-1.5 text-center text-red-200 text-xs">
      {message}
    </div>
  );
}
