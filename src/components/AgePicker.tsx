import React, { useState } from 'react';
import { X, Milestone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AgeInfo } from '../lib/harvestService';

interface AgePickerProps {
  ageInfo?: AgeInfo;
  onAgeChange: (ageInfo: AgeInfo | null) => void;
  onClose: () => void;
}

export const AgePicker: React.FC<AgePickerProps> = ({ ageInfo, onAgeChange, onClose }) => {
  const { t } = useTranslation('modals');
  const hasExisting = !!ageInfo;
  const [isOver21, setIsOver21] = useState(ageInfo ? ageInfo.is_over_21 : true);
  const [ageInput, setAgeInput] = useState(
    ageInfo && !ageInfo.is_over_21 ? String(ageInfo.age) : ''
  );

  const handleSave = () => {
    if (isOver21) {
      onAgeChange({ age: 0, timestamp_age_poll: Date.now(), is_over_21: true });
    } else {
      const parsed = parseInt(ageInput, 10);
      if (isNaN(parsed) || parsed < 0 || parsed > 120) return;
      onAgeChange({ age: parsed, timestamp_age_poll: Date.now(), is_over_21: false });
    }
    onClose();
  };

  const handleRemove = () => {
    onAgeChange(null);
    onClose();
  };

  const canSave = isOver21 || (ageInput.trim() !== '' && !isNaN(parseInt(ageInput, 10)));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <Milestone className="w-5 h-5 text-green-700" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">{t('agePicker.title')}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isOver21}
              onChange={(e) => {
                setIsOver21(e.target.checked);
                if (e.target.checked) setAgeInput('');
              }}
              className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            <span className="text-sm font-medium text-gray-700">{t('agePicker.olderThan21')}</span>
          </label>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('agePicker.currentAge')}
            </label>
            <input
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              min="0"
              max="120"
              value={ageInput}
              disabled={isOver21}
              onChange={(e) => setAgeInput(e.target.value)}
              placeholder={t('agePicker.enterAge')}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
            />
            {!isOver21 && (
              <p className="text-xs text-gray-500 mt-1.5">
                {t('agePicker.ageHint')}
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors text-sm"
            >
              {t('cancel', { ns: 'common' })}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-xl font-medium transition-colors text-sm"
            >
              {t('save', { ns: 'common' })}
            </button>
          </div>

          {hasExisting && (
            <button
              type="button"
              onClick={handleRemove}
              className="w-full text-sm text-red-500 hover:text-red-700 transition-colors py-1"
            >
              {t('agePicker.removeAge')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
