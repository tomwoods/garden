import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Sun, Users, LayoutGrid } from 'lucide-react';

interface SharedGardenSlidingMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onBulkSunlight: () => void;
  onPlots: () => void;
  onGardeners: () => void;
  isDisconnected: boolean;
}

export const SharedGardenSlidingMenu: React.FC<SharedGardenSlidingMenuProps> = ({
  isOpen,
  onClose,
  onBulkSunlight,
  onPlots,
  onGardeners,
  isDisconnected,
}) => {
  const { t } = useTranslation('garden_shared');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 z-40" />

      <div
        ref={menuRef}
        className="fixed top-0 right-0 h-full w-80 bg-white shadow-xl z-50 transform transition-transform duration-300 ease-in-out translate-x-0 flex flex-col"
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{t('menu.title')}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 p-6">
          <div className="space-y-2">
            {!isDisconnected && (
              <button
                onClick={() => handleAction(onBulkSunlight)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 rounded-xl transition-colors"
              >
                <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                  <Sun className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <div className="font-medium text-gray-900">{t('menu.sunlightSeveral')}</div>
                  <div className="text-sm text-gray-600">{t('menu.sunlightSeveralDesc')}</div>
                </div>
              </button>
            )}

            <button
              onClick={() => handleAction(onPlots)}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 rounded-xl transition-colors"
            >
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <LayoutGrid className="w-5 h-5 text-green-700" />
              </div>
              <div>
                <div className="font-medium text-gray-900">{t('menu.managePlots')}</div>
                <div className="text-sm text-gray-600">{t('menu.managePlotsDesc')}</div>
              </div>
            </button>

            <button
              onClick={() => handleAction(onGardeners)}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 rounded-xl transition-colors"
            >
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="font-medium text-gray-900">{t('menu.gardeners')}</div>
                <div className="text-sm text-gray-600">{t('menu.gardenersDesc')}</div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
