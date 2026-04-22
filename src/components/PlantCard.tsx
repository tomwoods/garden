import React, { useEffect, useState, useRef } from 'react';
import { Calendar, Phone, Mail, MoreHorizontal, CalendarPlus, Trash2, Heart, Leaf, CreditCard as Edit, MapPin } from 'lucide-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import isToday from 'dayjs/plugin/isToday';
import isTomorrow from 'dayjs/plugin/isTomorrow';
import isYesterday from 'dayjs/plugin/isYesterday';
import type { Plant } from '../lib/database';
import { DatabaseService } from '../lib/database';
import { PlantImageViewer } from './PlantImageViewer';

function getViewerUser() {
  const gardenKey = localStorage.getItem('garden-key');
  if (!gardenKey) return null;
  try {
    const parsed = JSON.parse(gardenKey);
    return {
      userId: parsed.userId,
      privateKey: parsed.privateKey,
      signingPrivateKey: parsed.signingPrivateKey,
    };
  } catch {
    return null;
  }
}

// Extend dayjs with plugins
dayjs.extend(relativeTime);
dayjs.extend(isToday);
dayjs.extend(isTomorrow);
dayjs.extend(isYesterday);

interface PlantCardProps {
  plant: Plant;
  urgency: number;
  urgencyColor: string;
  getPlantState: (plant: Plant) => Promise<any>;
  onTend: () => void;
  onWater: () => void;
  onViewDetails: () => void;
  onRemove: () => void;
  onShowConfirmation: (plantId: string, plantName: string) => void;
  onScheduleCare: (plantId: string, plantName: string) => void;
  onEditPlant: (plantId: string) => void;
  onShowMap?: (location: { lat: number; lng: number }) => void;
  imageRefreshKey?: number;
}

export const PlantCard: React.FC<PlantCardProps> = ({
  plant,
  urgency,
  urgencyColor,
  getPlantState,
  onTend,
  onWater,
  onViewDetails,
  onRemove,
  onShowConfirmation,
  onScheduleCare,
  onEditPlant,
  onShowMap,
  imageRefreshKey
}) => {
  const [plantState, setPlantState] = useState<any>(null);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [plantImages, setPlantImages] = useState<string[]>([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);

  // Parse additional_info to get location
  const getLocation = (): { lat: number; lng: number } | null => {
    if (!plant.additional_info) return null;
    try {
      const additionalInfo = JSON.parse(plant.additional_info);
      return additionalInfo.location || null;
    } catch {
      return null;
    }
  };

  const location = getLocation();

  useEffect(() => {
    const loadPlantState = async () => {
      try {
        const state = await getPlantState(plant);
        setPlantState(state);
      } catch (error) {
        console.error('Failed to load plant state:', error);
        setPlantState({
          growthStage: 'seed',
          healthState: 'healthy',
          hasFruit: false
        });
      }
    };
    loadPlantState();

    const images = DatabaseService.getImagesForPlant(plant.id);
    setPlantImages(images.slice(0, 1));
  }, [plant, getPlantState, imageRefreshKey]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.plantId === plant.id) {
        const images = DatabaseService.getImagesForPlant(plant.id);
        setPlantImages(images.slice(0, 1));
      }
    };
    window.addEventListener('plant-image-synced', handler);
    return () => window.removeEventListener('plant-image-synced', handler);
  }, [plant.id]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  const formatLastInteraction = (timestamp: number) => {
    const date = dayjs(timestamp);
    if (date.isToday()) return 'Today';
    if (date.isYesterday()) return 'Yesterday';
    return date.fromNow();
  };

  const formatNextScheduledCare = (timestamp: number) => {
    const date = dayjs(timestamp);
    const now = dayjs();
    
    if (date.isToday()) return 'Today';
    if (date.isTomorrow()) return 'Tomorrow';
    
    if (date.isBefore(now, 'day')) {
      // Overdue
      const diffDays = now.diff(date, 'day');
      return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} overdue`;
    } else {
      // Future
      const diffDays = date.diff(now, 'day');
      return `In ${diffDays} ${diffDays === 1 ? 'day' : 'days'}`;
    }
  };

  const formatLastCaredFor = (timestamp: number) => {
    const date = dayjs(timestamp);
    if (date.isToday()) return 'Today';
    if (date.isYesterday()) return 'Yesterday';
    return date.fromNow();
  };

  const getPlantDisplay = () => {
    if (!plantState) return { svgPath: '/src/assets/up_to_2_days.svg', filter: '' };
    
    // Calculate days since creation
    const now = Date.now();
    const daysSinceCreation = Math.floor((now - plant.created_at) / (1000 * 60 * 60 * 24));
    
    let svgPath = '/up_to_2_days.svg';
    
    // Determine base SVG based on age
    if (daysSinceCreation <= 2) {
      svgPath = '/up_to_2_days.svg';
    } else if (daysSinceCreation <= 7) {
      svgPath = '/up_to_7_days.svg';
    } else if (daysSinceCreation <= 21) {
      svgPath = '/up_to_21_days.svg';
    } else if (daysSinceCreation <= 600) {
      svgPath = plantState.hasFruit ? '/up_to_600_days_with_fruit.svg' : '/up_to_600_days.svg';
    } else {
      svgPath = plantState.hasFruit ? '/over_600_days_with_fruit.svg' : '/over_600_days.svg';
    }
    
    // Determine overlay based on priority: Tending > Watering > Sunlight
    let overlayClass = '';
    
    // Priority 1: Tending urgency (dirt overlay)
    if (plantState.tendingUrgency === 'severe') {
      overlayClass = 'dirt-severe';
    } else if (plantState.tendingUrgency === 'mild') {
      overlayClass = 'dirt-mild';
    }
    // Priority 2: Watering urgency (brown overlay)
    else if (plantState.wateringUrgency === 'severe') {
      overlayClass = 'brown-severe';
    } else if (plantState.wateringUrgency === 'mild') {
      overlayClass = 'brown-mild';
    }
    // Priority 3: Sunlight urgency (yellow overlay)
    else if (plantState.sunlightUrgency === 'severe') {
      overlayClass = 'yellow-severe';
    } else if (plantState.sunlightUrgency === 'mild') {
      overlayClass = 'yellow-mild';
    }
    
    return { svgPath, overlayClass };
  };

  const plantDisplay = getPlantDisplay();

  const handleScheduleCare = () => {
    setShowMenu(false);
    onScheduleCare(plant.id, plant.name);
  };

  const handleRemovePlant = () => {
    setShowMenu(false);
    onShowConfirmation(plant.id, plant.name);
  };

  const handleEditPlant = () => {
    setShowMenu(false);
    onEditPlant(plant.id);
  };

  const handleViewDetails = () => {
    setShowMenu(false);
    onViewDetails();
  };

  return (
    <>
      <div
        className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow duration-200 relative cursor-pointer"
        onClick={handleViewDetails}
      >
      {/* Header */}
      <div className="flex items-start justify-between mb-4 gap-4">
        <div className="flex gap-4">
          <div className="flex flex-col gap-3">
            <div className="relative flex-shrink-0">
              {/* Plant SVG */}
              <img
                src={plantDisplay.svgPath}
                alt="Plant growth stage"
                className="w-8 h-8 transition-all duration-300"
              />
              {/* Overlay for care urgency */}
              {plantDisplay.overlayClass && (
                <div
                  className={`absolute inset-0 w-8 h-8 pointer-events-none transition-opacity duration-300 ${plantDisplay.overlayClass}`}
                />
              )}
            </div>
          </div>
          {plantImages.length > 0 && (
            <div
              className="w-20 h-20 rounded-lg overflow-hidden border border-gray-200 hover:border-green-400 cursor-pointer transition-colors duration-200 flex-shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedImageIndex(0);
              }}
            >
              <img
                src={plantImages[0]}
                alt={plant.name}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div>
            <h3 className="font-semibold text-gray-900 text-lg">{plant.name}</h3>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-gray-400" />
                <span className={`font-medium ${urgencyColor}`}>
                  {formatNextScheduledCare(plant.next_scheduled_care)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Heart className="w-3 h-3 text-gray-400" />
                <span className="text-gray-500">
                  {formatLastCaredFor(plant.last_cared_for)}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="relative" ref={menuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
          
          {/* Dropdown Menu */}
          {showMenu && (
            <div className="absolute right-0 top-8 bg-white rounded-lg shadow-lg border border-gray-200 py-2 min-w-[160px] z-10">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleViewDetails();
                }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <Leaf className="w-4 h-4" />
                Details
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleScheduleCare();
                }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <CalendarPlus className="w-4 h-4" />
                Schedule care
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleEditPlant();
                }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <Edit className="w-4 h-4" />
                Change
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemovePlant();
                }}
                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Remove plant
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Contact Info */}
      {(plant.email || plant.phone || location) && (
        <div className="flex gap-4 mb-4 text-sm text-gray-600">
          {plant.email && (
            <div className="flex items-center gap-1">
              <Mail className="w-3 h-3" />
              <span className="truncate">{plant.email}</span>
            </div>
          )}
          {plant.phone && (
            <div className="flex items-center gap-1">
              <Phone className="w-3 h-3" />
              <a
                href={`tel:${plant.phone}`}
                className="text-blue-600 hover:text-blue-700 hover:underline transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                {plant.phone}
              </a>
            </div>
          )}
          {location && onShowMap && (
            <button
              className="flex items-center gap-1 text-green-600 hover:text-green-700 hover:underline transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onShowMap(location);
              }}
            >
              <MapPin className="w-3 h-3" />
              <span>Location</span>
            </button>
          )}
        </div>
      )}

      {/* Action Buttons */}
      {/* Description */}
      {plant.description && (
        <div className="mb-4 p-3 bg-gray-50 rounded-xl">
          <p className="text-sm text-gray-700 leading-relaxed">
            {plant.description}
          </p>
        </div>
      )}

<div className="flex gap-2">
        <button
          className="flex-1 bg-green-50 hover:bg-green-100 text-green-700 font-medium py-2.5 px-4 rounded-xl transition-colors duration-200 text-sm"
          onClick={(e) => {
            e.stopPropagation();
            onTend();
          }}
        >
          🪴 Tend
        </button>
        <button
          className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium py-2.5 px-4 rounded-xl transition-colors duration-200 text-sm"
          onClick={(e) => {
            e.stopPropagation();
            onWater();
          }}
        >
          🚿 Water
        </button>
      </div>
    </div>

    {selectedImageIndex !== null && plantImages.length > 0 && (() => {
      const viewerUser = getViewerUser();
      return viewerUser ? (
        <PlantImageViewer
          thumbnailUrl={plantImages[0]}
          plantId={plant.id}
          user={viewerUser}
          onClose={() => setSelectedImageIndex(null)}
        />
      ) : null;
    })()}
    </>
  );
};