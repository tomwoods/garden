import React, { useState, useEffect, useRef, useCallback } from 'react';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedValues {
  values: Array<{ id: string; text: string; count: number }>;
  fetchedAt: number;
}

export function readAutocompleteCache(cacheKey: string): Array<{ id: string; text: string; count: number }> {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return [];
    const parsed: CachedValues = JSON.parse(raw);
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return [];
    return parsed.values;
  } catch {
    return [];
  }
}

export function writeAutocompleteCache(
  cacheKey: string,
  values: Array<{ id: string; text: string; count: number }>
): void {
  try {
    const payload: CachedValues = { values, fetchedAt: Date.now() };
    localStorage.setItem(cacheKey, JSON.stringify(payload));
  } catch {
    // Storage quota exceeded — skip caching silently
  }
}

function rankSuggestions(
  values: Array<{ id: string; text: string; count: number }>,
  query: string
): Array<{ id: string; text: string; count: number }> {
  const q = query.toLowerCase();
  return values
    .filter((s) => s.text.toLowerCase().includes(q))
    .sort((a, b) => {
      const aText = a.text.toLowerCase();
      const bText = b.text.toLowerCase();
      const aStarts = aText.startsWith(q) ? 0 : 1;
      const bStarts = bText.startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return b.count - a.count;
    })
    .slice(0, 8);
}

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  values: Array<{ id: string; text: string; count: number }>;
  placeholder?: string;
  accentColor?: string; // tailwind color name e.g. 'blue', 'emerald'
  required?: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
}

export const AutocompleteInput: React.FC<AutocompleteInputProps> = ({
  value,
  onChange,
  values,
  placeholder = 'Start typing...',
  accentColor = 'blue',
  required,
  inputRef: externalInputRef
}) => {
  const [suggestions, setSuggestions] = useState<Array<{ id: string; text: string; count: number }>>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const internalInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef ?? internalInputRef;
  const listRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const computeSuggestions = useCallback(
    (q: string) => {
      if (!q.trim() || values.length === 0) {
        setSuggestions([]);
        setOpen(false);
        return;
      }
      const ranked = rankSuggestions(values, q);
      setSuggestions(ranked);
      setOpen(ranked.length > 0);
      setActiveIndex(-1);
    },
    [values]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange(v);
    computeSuggestions(v);
  };

  const selectSuggestion = (text: string) => {
    onChange(text);
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[activeIndex].text);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const item = listRef.current.children[activeIndex] as HTMLElement;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const focusRingClass = `focus:ring-${accentColor}-500`;
  const activeClass = `bg-${accentColor}-50 text-${accentColor}-900`;

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => value.trim() && computeSuggestions(value)}
        className={`w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 ${focusRingClass} focus:border-transparent transition-colors`}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
      />
      {open && (
        <ul
          ref={listRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              onMouseDown={() => selectSuggestion(s.text)}
              className={`px-4 py-2.5 cursor-pointer text-sm flex items-center justify-between gap-2 ${
                i === activeIndex ? activeClass : 'text-gray-800 hover:bg-gray-50'
              } ${i === 0 ? 'rounded-t-xl' : ''} ${i === suggestions.length - 1 ? 'rounded-b-xl' : ''}`}
            >
              <span className="truncate">{s.text}</span>
              <span className="text-xs text-gray-400 shrink-0">{s.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
