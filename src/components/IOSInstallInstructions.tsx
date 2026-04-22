import React from 'react';
import { X, Share } from 'lucide-react';

interface IOSInstallInstructionsProps {
  isOpen: boolean;
  onClose: () => void;
}

export const IOSInstallInstructions: React.FC<IOSInstallInstructionsProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-md w-full shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-6 rounded-t-3xl sm:rounded-t-2xl">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Install Garden</h2>
              <p className="text-green-100 text-sm">Add to your home screen</p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <p className="text-gray-700">
            To install Garden on your iOS device, follow these steps:
          </p>

          {/* Step 1 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-green-100 text-green-700 rounded-full flex items-center justify-center font-bold">
              1
            </div>
            <div className="flex-1">
              <p className="text-gray-900 font-medium mb-2">Tap the Share button</p>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center gap-3">
                <Share className="w-5 h-5 text-blue-600" />
                <span className="text-sm text-gray-600">
                  Look for the share icon in your browser's toolbar (usually at the bottom or top)
                </span>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-green-100 text-green-700 rounded-full flex items-center justify-center font-bold">
              2
            </div>
            <div className="flex-1">
              <p className="text-gray-900 font-medium mb-2">Select "Add to Home Screen"</p>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <span className="text-sm text-gray-600">
                  Scroll through the share menu options and tap "Add to Home Screen"
                </span>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-green-100 text-green-700 rounded-full flex items-center justify-center font-bold">
              3
            </div>
            <div className="flex-1">
              <p className="text-gray-900 font-medium mb-2">Confirm installation</p>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <span className="text-sm text-gray-600">
                  Tap "Add" in the top-right corner to complete the installation
                </span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              Got It
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
