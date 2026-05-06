import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, X, Shield } from 'lucide-react';

interface KeyBackupPromptProps {
  onDownloadGardenKey: () => void;
}

export const KeyBackupPrompt: React.FC<KeyBackupPromptProps> = ({ onDownloadGardenKey }) => {
  const { t } = useTranslation('notifications');
  const [isDismissed, setIsDismissed] = useState(() => {
    // Check if prompt was dismissed OR if user restored from garden key
    return localStorage.getItem('garden-key-prompt-dismissed') === 'true' || 
           localStorage.getItem('garden-restored-from-key') === 'true';
  });

  const handleDismiss = () => {
    localStorage.setItem('garden-key-prompt-dismissed', 'true');
    setIsDismissed(true);
  };

  const handleDownloadKey = () => {
    onDownloadGardenKey();
    handleDismiss();
  };

  if (isDismissed) return null;

  return (
    <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mb-6 rounded-r-lg">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <Shield className="h-5 w-5 text-amber-400" />
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-amber-800">
            {t('keyBackupTitle')}
          </h3>
          <p className="mt-1 text-sm text-amber-700">
            {t('keyBackupMessage')}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleDownloadKey}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 text-sm font-medium rounded-md transition-colors"
            >
              <Download className="w-4 h-4" />
              {t('downloadKey')}
            </button>
            <button
              onClick={handleDismiss}
              className="inline-flex items-center px-3 py-1.5 text-amber-700 hover:text-amber-800 text-sm font-medium transition-colors"
            >
              {t('remindLater')}
            </button>
          </div>
        </div>
        <div className="flex-shrink-0 ml-4">
          <button
            onClick={handleDismiss}
            className="text-amber-400 hover:text-amber-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};