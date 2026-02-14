import { useState, useCallback, useMemo, useRef, useEffect } from 'react';

export default function SearchBar({ elements, onSearch, onNodeSelect }) {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  // All nodes for searching
  const nodes = useMemo(
    () => elements.filter((e) => e.group === 'nodes'),
    [elements]
  );

  // Search results (debounced)
  const [results, setResults] = useState([]);

  const doSearch = useCallback(
    (q) => {
      if (!q.trim()) {
        setResults([]);
        onSearch([]);
        return;
      }
      const lower = q.toLowerCase();
      const matched = nodes
        .filter((n) => {
          const label = (n.data.label || '').toLowerCase();
          const content = (n.data.content || '').toLowerCase();
          const type = (n.data.type || '').toLowerCase();
          const id = (n.data.id || '').toLowerCase();
          return label.includes(lower) || content.includes(lower) || type.includes(lower) || id.includes(lower);
        })
        .slice(0, 20);
      setResults(matched);
      onSearch(matched.map((n) => n.data.id));
    },
    [nodes, onSearch]
  );

  const handleChange = useCallback(
    (e) => {
      const val = e.target.value;
      setQuery(val);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => doSearch(val), 200);
    },
    [doSearch]
  );

  const handleClear = useCallback(() => {
    setQuery('');
    setResults([]);
    onSearch([]);
    inputRef.current?.focus();
  }, [onSearch]);

  const handleSelect = useCallback(
    (id) => {
      onNodeSelect(id);
      setIsFocused(false);
    },
    [onNodeSelect]
  );

  // Keyboard shortcut: Cmd/Ctrl+K to focus search
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        inputRef.current?.blur();
        setIsFocused(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4">
      {/* Results dropdown (above the search bar) */}
      {isFocused && results.length > 0 && (
        <div className="mb-2 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl max-h-60 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.data.id}
              onClick={() => handleSelect(r.data.id)}
              className="block w-full text-left px-3 py-2 hover:bg-slate-700 transition-colors border-b border-slate-700/50 last:border-b-0"
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: r.data.type ? undefined : '#94a3b8' }}
                />
                <span className="text-sm text-slate-200 truncate">{r.data.label}</span>
                <span className="text-xs text-slate-500 capitalize shrink-0">{r.data.type}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
          <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          placeholder="Search nodes... (Cmd+K)"
          className="w-full bg-slate-800/95 backdrop-blur border border-slate-600 rounded-lg pl-10 pr-16 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-2xl"
        />
        <div className="absolute inset-y-0 right-2 flex items-center gap-1">
          {query && (
            <button onClick={handleClear} className="p-1 text-slate-500 hover:text-slate-300 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          {!query && (
            <kbd className="text-[10px] text-slate-500 bg-slate-700 rounded px-1.5 py-0.5 border border-slate-600">
              {navigator.platform?.includes('Mac') ? 'Cmd' : 'Ctrl'}+K
            </kbd>
          )}
        </div>
      </div>

      {/* Result count */}
      {query && (
        <div className="text-center mt-1 text-xs text-slate-500">
          {results.length} {results.length === 1 ? 'match' : 'matches'}
        </div>
      )}
    </div>
  );
}
