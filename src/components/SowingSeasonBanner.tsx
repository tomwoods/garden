import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSowingSeasonStatus } from '../lib/sowingSeasonService';

const DISMISSED_KEY = 'sowing-season-approaching-dismissed';

export const SowingSeasonBanner: React.FC = () => {
  const { t } = useTranslation('garden');
  const [status] = useState(() => getSowingSeasonStatus());
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (status.state === 'approaching') {
      const stored = localStorage.getItem(DISMISSED_KEY);
      setDismissed(stored === 'true');
    }
    if (status.state === 'active') {
      localStorage.removeItem(DISMISSED_KEY);
    }
  }, [status.state]);

  if (status.state === 'dormant') return null;

  if (status.state === 'approaching') {
    if (dismissed) return null;
    return (
      <div className="flex items-center justify-between px-4 py-2 text-xs text-green-700 bg-green-50 border-b border-green-100">
        <span>
          {t('sowingSeasonStartsSoon', { count: status.daysUntilStart })}
        </span>
        <button
          onClick={() => {
            localStorage.setItem(DISMISSED_KEY, 'true');
            setDismissed(true);
          }}
          className="ml-4 text-green-500 hover:text-green-700 transition-colors"
          aria-label="Dismiss"
        >
          &times;
        </button>
      </div>
    );
  }

  if (status.state === 'active') {
    return (
      <div className="px-4 py-2 text-xs text-green-700 bg-green-50 border-b border-green-100">
        {t('sowingSeasonActive', { count: status.daysRemaining })}
      </div>
    );
  }

  return null;
};
