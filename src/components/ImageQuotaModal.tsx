import React from 'react';
import { useTranslation } from 'react-i18next';
import { X, Image as ImageIcon, Info } from 'lucide-react';
import { uploadService } from '../lib/uploadService';

interface ImageQuotaModalProps {
  onClose: () => void;
}

export const ImageQuotaModal: React.FC<ImageQuotaModalProps> = ({ onClose }) => {
  const { t } = useTranslation('modals');
  const quotaInfo = uploadService.getQuotaInfo();
  const percentageUsed = (quotaInfo.imagesUsed / quotaInfo.maxImages) * 100;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <ImageIcon className="w-5 h-5 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">{t('imageQuota.title')}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">{t('imageQuota.images')}</span>
              <span className="text-sm text-gray-600">
                {quotaInfo.imagesUsed} / {quotaInfo.maxImages}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  quotaInfo.hasReachedLimit
                    ? 'bg-red-500'
                    : percentageUsed >= 70
                    ? 'bg-orange-500'
                    : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(percentageUsed, 100)}%` }}
              />
            </div>
          </div>

          <div className="p-4 bg-green-50 rounded-xl">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-gray-700">
                <p className="font-medium mb-2">{t('imageQuota.aboutTitle')}</p>
                <ul className="space-y-1 text-xs">
                  <li>• {t('imageQuota.onePerPlant')}</li>
                  <li>• {t('imageQuota.maxImages', { max: quotaInfo.maxImages })}</li>
                  <li>• {t('imageQuota.encrypted')}</li>
                  <li>• {t('imageQuota.cached')}</li>
                  <li>• {t('imageQuota.deleteToFree')}</li>
                </ul>
              </div>
            </div>
          </div>

          {quotaInfo.hasReachedLimit && (
            <div className="p-4 bg-orange-50 rounded-xl border border-orange-200">
              <div className="flex items-start gap-3">
                <ImageIcon className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-orange-900 mb-1">{t('imageQuota.quotaReachedTitle')}</p>
                  <p className="text-xs text-orange-700">
                    {t('imageQuota.quotaReachedDesc')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium transition-colors"
        >
          {t('imageQuota.closeBtn')}
        </button>
      </div>
    </div>
  );
};
