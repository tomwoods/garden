import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '../lib/i18n';

interface LanguageSwitcherProps {
  variant?: 'compact' | 'full';
  className?: string;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  variant = 'compact',
  className = '',
}) => {
  const { i18n } = useTranslation();

  const current = SUPPORTED_LANGUAGES.find(l => l.code === i18n.language)
    ?? SUPPORTED_LANGUAGES[0];

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    i18n.changeLanguage(e.target.value);
  };

  if (variant === 'full') {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <Globe className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <div className="flex-1">
          <select
            value={current.code}
            onChange={handleChange}
            className="w-full bg-transparent text-gray-700 text-sm focus:outline-none cursor-pointer"
            aria-label="Select language"
          >
            {SUPPORTED_LANGUAGES.map(lang => (
              <option key={lang.code} value={lang.code}>
                {lang.nativeLabel}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative inline-flex items-center gap-1.5 ${className}`}>
      <Globe className="w-4 h-4 text-gray-500" />
      <select
        value={current.code}
        onChange={handleChange}
        className="appearance-none bg-transparent text-sm text-gray-600 font-medium pr-4 focus:outline-none cursor-pointer"
        aria-label="Select language"
      >
        {SUPPORTED_LANGUAGES.map(lang => (
          <option key={lang.code} value={lang.code}>
            {lang.nativeLabel}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
    </div>
  );
};
