import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Check } from 'lucide-react';
import type { Plant } from '../lib/database';

interface PlantSelectorChecklistProps {
  plants: Plant[];
  selectedPlantIds: Set<string>;
  onSelectionChange: (selectedIds: Set<string>) => void;
}

export const PlantSelectorChecklist: React.FC<PlantSelectorChecklistProps> = ({
  plants,
  selectedPlantIds,
  onSelectionChange
}) => {
  const { t } = useTranslation('modals');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredPlants = plants.filter(plant =>
    plant.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handlePlantToggle = (plantId: string) => {
    const newSelected = new Set(selectedPlantIds);
    if (newSelected.has(plantId)) {
      newSelected.delete(plantId);
    } else {
      newSelected.add(plantId);
    }
    onSelectionChange(newSelected);
  };

  const handleSelectAll = () => {
    const allIds = new Set(filteredPlants.map(p => p.id));
    onSelectionChange(allIds);
  };

  const handleSelectNone = () => {
    onSelectionChange(new Set());
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <label className="block text-sm font-medium text-gray-700">
          {t('plantSelector.label', { selected: selectedPlantIds.size, total: plants.length })}
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSelectAll}
            className="text-xs text-green-600 hover:text-green-700 font-medium"
          >
            {t('plantSelector.selectAll')}
          </button>
          <span className="text-xs text-gray-400">|</span>
          <button
            type="button"
            onClick={handleSelectNone}
            className="text-xs text-gray-600 hover:text-gray-700 font-medium"
          >
            {t('plantSelector.selectNone')}
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
          placeholder={t('plantSelector.searchPlaceholder')}
        />
      </div>

      {/* Plant List */}
      <div className="border border-gray-200 rounded-xl max-h-64 overflow-y-auto">
        {filteredPlants.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            {searchTerm ? t('plantSelector.noMatch') : t('plantSelector.empty')}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredPlants.map((plant) => (
              <button
                key={plant.id}
                type="button"
                onClick={() => handlePlantToggle(plant.id)}
                className={`w-full p-3 text-left hover:bg-gray-50 transition-colors flex items-center gap-3 ${
                  selectedPlantIds.has(plant.id) ? 'bg-green-50' : ''
                }`}
              >
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                  selectedPlantIds.has(plant.id)
                    ? 'bg-green-500 border-green-500'
                    : 'border-gray-300'
                }`}>
                  {selectedPlantIds.has(plant.id) && (
                    <Check className="w-3 h-3 text-white" />
                  )}
                </div>
                <span className="font-medium text-gray-900">{plant.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
