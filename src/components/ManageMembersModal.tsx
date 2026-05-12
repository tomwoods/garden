import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Users, UserPlus } from 'lucide-react';
import { PlantSelectorChecklist } from './PlantSelectorChecklist';
import { AddPlantModal } from './AddPlantModal';
import type { Plant } from '../lib/database';

interface ManageMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  plotName: string;
  allPlants: Plant[];
  currentMemberIds: string[];
  onSave: (selectedPlantIds: string[]) => Promise<void>;
  onCreatePlant?: (plantData: {
    name: string;
    phone?: string;
    description?: string;
    care_frequency_multiplier: number;
    care_frequency_unit: 'days' | 'weeks';
    additional_info?: string;
  }, images?: string[]) => Promise<Plant>;
}

export const ManageMembersModal: React.FC<ManageMembersModalProps> = ({
  isOpen,
  onClose,
  plotName,
  allPlants,
  currentMemberIds,
  onSave,
  onCreatePlant
}) => {
  const { t } = useTranslation('modals');
  const [selectedPlantIds, setSelectedPlantIds] = useState<Set<string>>(new Set());
  const [localPlants, setLocalPlants] = useState<Plant[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddPlant, setShowAddPlant] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedPlantIds(new Set(currentMemberIds));
      setLocalPlants(allPlants);
    }
  }, [isOpen, currentMemberIds, allPlants]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSave(Array.from(selectedPlantIds));
      onClose();
    } catch (error) {
      console.error('Failed to update plot members:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreatePlant = async (plantData: {
    name: string;
    phone?: string;
    description?: string;
    care_frequency_multiplier: number;
    care_frequency_unit: 'days' | 'weeks';
    additional_info?: string;
  }, images?: string[]) => {
    if (!onCreatePlant) return;
    const newPlant = await onCreatePlant(plantData, images);
    setLocalPlants(prev => [...prev, newPlant]);
    setSelectedPlantIds(prev => new Set([...prev, newPlant.id]));
    setShowAddPlant(false);
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <Users className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {t('manageMembers.title')}
                </h2>
                <p className="text-sm text-gray-600">
                  {t('manageMembers.subtitle', { plotName })}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <PlantSelectorChecklist
              plants={localPlants}
              selectedPlantIds={selectedPlantIds}
              onSelectionChange={setSelectedPlantIds}
            />

            {onCreatePlant && (
              <button
                type="button"
                onClick={() => setShowAddPlant(true)}
                className="flex items-center gap-2 text-sm text-green-600 hover:text-green-700 font-medium transition-colors py-1"
              >
                <UserPlus className="w-4 h-4" />
                {t('manageMembers.addNewPlant')}
              </button>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-green-600 hover:text-green-700 font-medium"
              >
                {t('manageMembers.cancelBtn')}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-xl font-medium transition-colors"
              >
                {isSubmitting ? t('manageMembers.savingBtn') : t('manageMembers.updateBtn')}
              </button>
            </div>
          </form>
        </div>
      </div>

      {onCreatePlant && (
        <AddPlantModal
          isOpen={showAddPlant}
          onClose={() => setShowAddPlant(false)}
          onAdd={handleCreatePlant}
        />
      )}
    </>
  );
};
