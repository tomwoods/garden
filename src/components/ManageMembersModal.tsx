import React, { useState, useEffect } from 'react';
import { X, Users } from 'lucide-react';
import { PlantSelectorChecklist } from './PlantSelectorChecklist';
import type { Plant } from '../lib/database';

interface ManageMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  plotName: string;
  allPlants: Plant[];
  currentMemberIds: string[];
  onSave: (selectedPlantIds: string[]) => Promise<void>;
}

export const ManageMembersModal: React.FC<ManageMembersModalProps> = ({
  isOpen,
  onClose,
  plotName,
  allPlants,
  currentMemberIds,
  onSave
}) => {
  const [selectedPlantIds, setSelectedPlantIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedPlantIds(new Set(currentMemberIds));
    }
  }, [isOpen, currentMemberIds]);

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <img src="/plots_icon.svg" alt="Manage Members" className="w-5 h-5" style={{ filter: 'invert(25%) sepia(85%) saturate(1500%) hue-rotate(90deg) brightness(95%) contrast(105%)' }} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Manage Members
              </h2>
              <p className="text-sm text-gray-600">
                Add or remove plants from {plotName}
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
            plants={allPlants}
            selectedPlantIds={selectedPlantIds}
            onSelectionChange={setSelectedPlantIds}
          />

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-green-600 hover:text-green-700 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-xl font-medium transition-colors"
            >
              {isSubmitting ? 'Saving...' : 'Update Members'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};