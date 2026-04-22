import React, { useState, useEffect, useRef } from 'react';
import { X, Download, Sun, Search, Check, Key, Tractor, Users } from 'lucide-react';
import type { Plant } from '../lib/database';

interface SlidingMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onDownloadGardenKey: () => void;
  plants: Plant[];
  onBulkSunlight: (plantIds: string[], topic: string) => Promise<void>;
}

export const SlidingMenu: React.FC<SlidingMenuProps> = ({
  isOpen,
  onClose,
  onDownloadGardenKey,
  plants,
  onBulkSunlight
}) => {
  const [activeView, setActiveView] = useState<'menu' | 'bulk-sunlight'>('menu');
  const [bulkSunlightData, setBulkSunlightData] = useState({
    topic: '',
    selectedPlantIds: new Set<string>(),
    filter: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
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

  // Reset state when menu closes
  useEffect(() => {
    if (!isOpen) {
      setActiveView('menu');
      setBulkSunlightData({
        topic: '',
        selectedPlantIds: new Set<string>(),
        filter: ''
      });
    }
  }, [isOpen]);

  const handleGardenKeyClick = () => {
    onDownloadGardenKey();
    onClose();
  };

  const handleBulkSunlightClick = () => {
    setActiveView('bulk-sunlight');
  };

  const handleBackToMenu = () => {
    setActiveView('menu');
  };

  const handlePlantToggle = (plantId: string) => {
    setBulkSunlightData(prev => {
      const newSelected = new Set(prev.selectedPlantIds);
      if (newSelected.has(plantId)) {
        newSelected.delete(plantId);
      } else {
        newSelected.add(plantId);
      }
      return { ...prev, selectedPlantIds: newSelected };
    });
  };

  const handleFilterChange = (filter: string) => {
    setBulkSunlightData(prev => ({ ...prev, filter }));
  };

  const handleTopicChange = (topic: string) => {
    setBulkSunlightData(prev => ({ ...prev, topic }));
  };

  const handleBulkSunlightSubmit = async () => {
    if (!bulkSunlightData.topic.trim() || bulkSunlightData.selectedPlantIds.size === 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onBulkSunlight(Array.from(bulkSunlightData.selectedPlantIds), bulkSunlightData.topic.trim());
      onClose();
    } catch (error) {
      console.error('Failed to add bulk sunlight:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredPlants = plants.filter(plant =>
    plant.name.toLowerCase().includes(bulkSunlightData.filter.toLowerCase())
  );

  const isFormValid = bulkSunlightData.topic.trim() && bulkSunlightData.selectedPlantIds.size > 0;

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-40" />
      
      {/* Sliding Menu */}
      <div
        ref={menuRef}
        className={`fixed top-0 right-0 h-full w-80 bg-white shadow-xl z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {activeView === 'menu' ? (
          // Main Menu
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Garden Menu</h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 p-6">
              <div className="space-y-2">
                <button
                  onClick={handleBulkSunlightClick}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 rounded-xl transition-colors"
                >
                  <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                    <Sun className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">Sunlight for several plants</div>
                    <div className="text-sm text-gray-600">Add prayer for multiple plants</div>
                  </div>
                </button>
                
                <button
                  onClick={() => {
                    onClose();
                    window.location.pathname = '/plots';
                  }}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 rounded-xl transition-colors"
                >
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <img src="/plots_icon.svg" alt="Plots" className="w-5 h-5" style={{ filter: 'invert(25%) sepia(85%) saturate(1500%) hue-rotate(90deg) brightness(95%) contrast(105%)' }} />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">Manage Plots</div>
                    <div className="text-sm text-gray-600">Group plants and log bulk activities</div>
                  </div>
                </button>
                
                <button
                  onClick={() => {
                    onClose();
                    window.location.pathname = '/settings';
                  }}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 rounded-xl transition-colors"
                >
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <Tractor className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">Settings</div>
                    <div className="text-sm text-gray-600">App preferences and options</div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        ) : (
          // Bulk Sunlight View
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleBackToMenu}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-2">
                  <Sun className="w-5 h-5 text-yellow-600" />
                  <h2 className="text-lg font-semibold text-gray-900">Sunlight</h2>
                </div>
              </div>
            </div>
            
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="space-y-6">
                {/* Topic Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Prayer topic *
                  </label>
                  <textarea
                    value={bulkSunlightData.topic}
                    onChange={(e) => handleTopicChange(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition-colors resize-none"
                    rows={3}
                    placeholder="What was the prayer for?"
                  />
                </div>

                {/* Plant Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select plants ({bulkSunlightData.selectedPlantIds.size} selected)
                  </label>
                  
                  {/* Filter Input */}
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={bulkSunlightData.filter}
                      onChange={(e) => handleFilterChange(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition-colors"
                      placeholder="Filter plants..."
                    />
                  </div>

                  {/* Plant List */}
                  <div className="border border-gray-200 rounded-xl max-h-64 overflow-y-auto">
                    {filteredPlants.length === 0 ? (
                      <div className="p-4 text-center text-gray-500">
                        {bulkSunlightData.filter ? 'No plants match your filter' : 'No plants available'}
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {filteredPlants.map((plant) => (
                          <button
                            key={plant.id}
                            onClick={() => handlePlantToggle(plant.id)}
                            className={`w-full p-3 text-left hover:bg-gray-50 transition-colors flex items-center gap-3 ${
                              bulkSunlightData.selectedPlantIds.has(plant.id) ? 'bg-yellow-50' : ''
                            }`}
                          >
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                              bulkSunlightData.selectedPlantIds.has(plant.id)
                                ? 'bg-yellow-500 border-yellow-500'
                                : 'border-gray-300'
                            }`}>
                              {bulkSunlightData.selectedPlantIds.has(plant.id) && (
                                <Check className="w-3 h-3 text-white" />
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-lg">🌱</span>
                              <span className="font-medium text-gray-900">{plant.name}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="p-6 border-t border-gray-200">
              <div className="flex gap-3">
                <button
                  onClick={handleBackToMenu}
                  className="flex-1 px-4 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkSunlightSubmit}
                  disabled={!isFormValid || isSubmitting}
                  className="flex-1 px-4 py-3 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-300 text-white rounded-xl font-medium transition-colors"
                >
                  {isSubmitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};