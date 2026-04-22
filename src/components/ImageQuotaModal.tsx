import React from 'react';
import { X, Image as ImageIcon, Info } from 'lucide-react';
import { uploadService } from '../lib/uploadService';

interface ImageQuotaModalProps {
  onClose: () => void;
}

export const ImageQuotaModal: React.FC<ImageQuotaModalProps> = ({ onClose }) => {
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
            <h2 className="text-xl font-semibold text-gray-900">Image Quota</h2>
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
              <span className="text-sm font-medium text-gray-700">Images</span>
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
                <p className="font-medium mb-2">About Images</p>
                <ul className="space-y-1 text-xs">
                  <li>• One image per plant</li>
                  <li>• Maximum {quotaInfo.maxImages} images total</li>
                  <li>• Images are encrypted before leaving your device</li>
                  <li>• Thumbnails are cached locally; full images are fetched on demand</li>
                  <li>• Delete a plant image to free up quota</li>
                </ul>
              </div>
            </div>
          </div>

          {quotaInfo.hasReachedLimit && (
            <div className="p-4 bg-orange-50 rounded-xl border border-orange-200">
              <div className="flex items-start gap-3">
                <ImageIcon className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-orange-900 mb-1">Quota Reached</p>
                  <p className="text-xs text-orange-700">
                    You have reached the maximum number of images. Delete an existing image to add a new one.
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
          Close
        </button>
      </div>
    </div>
  );
};
