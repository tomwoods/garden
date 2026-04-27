import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Heart, Plus, MoreHorizontal, CreditCard as Edit, Trash2, CalendarPlus, Phone, Mail, MapPin } from 'lucide-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import isToday from 'dayjs/plugin/isToday';
import isTomorrow from 'dayjs/plugin/isTomorrow';
import isYesterday from 'dayjs/plugin/isYesterday';
import { DatabaseService, type Plant, type Tending, type Watering, type Sunlight, type Fruit, type Pruning, type Companion, type Bud, type Notching, type Capability } from '../lib/database';
import { ActivityModal } from './ActivityModal';
import { BranchesModal, type BranchesSubType } from './BranchesModal';
import { ConfirmationModal } from './ConfirmationModal';
import { ToastContainer } from './ToastContainer';
import { PlantImageViewer } from './PlantImageViewer';
import { EditPlantModal } from './EditPlantModal';
import { ScheduleCareModal } from './ScheduleCareModal';
import { useToast } from '../hooks/useToast';

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

interface ActivityItem {
  id: string;
  type: 'tending' | 'watering' | 'sunlight' | 'fruit' | 'pruning' | 'companion';
  datetime: number;
  data: any;
}

export const PlantDetailView: React.FC = () => {
  const { plantId } = useParams<{ plantId: string }>();
  const navigate = useNavigate();
  const [plant, setPlant] = useState<Plant | null>(null);
  const [scheduledEvents, setScheduledEvents] = useState<ScheduledEvent[]>([]);
  const [plantState, setPlantState] = useState<any>(null);
  const [activities, setActivities] = useState<{
    tending: Tending[];
    watering: Watering[];
    sunlight: Sunlight[];
    fruit: Fruit[];
    pruning: Pruning[];
    companion: Companion[];
  }>({
    tending: [],
    watering: [],
    sunlight: [],
    fruit: [],
    pruning: [],
    companion: []
  });
  const [branchesData, setBranchesData] = useState<{
    buds: Bud[];
    notchings: Notching[];
    capabilities: Capability[];
  }>({ buds: [], notchings: [], capabilities: [] });
  const [branchesModal, setBranchesModal] = useState<{
    isOpen: boolean;
    subType: BranchesSubType;
    editingItem?: any;
  }>({ isOpen: false, subType: 'bud' });
  const [allPlants, setAllPlants] = useState<Plant[]>([]);
  const [plantImages, setPlantImages] = useState<string[]>([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activityModal, setActivityModal] = useState<{
    isOpen: boolean;
    type: 'tending' | 'watering' | 'sunlight' | 'fruit' | 'pruning' | 'companion';
    editingItem?: any;
  }>({
    isOpen: false,
    type: 'tending'
  });
  const [confirmationModal, setConfirmationModal] = useState<{
    isOpen: boolean;
    onConfirm: () => void;
    title: string;
    message: string;
  }>({
    isOpen: false,
    onConfirm: () => {},
    title: '',
    message: ''
  });
  const [editPlantModal, setEditPlantModal] = useState<{
    isOpen: boolean;
    plant: Plant | null;
  }>({ isOpen: false, plant: null });
  const [scheduleCareModal, setScheduleCareModal] = useState<{
    isOpen: boolean;
    plantName: string;
  }>({ isOpen: false, plantName: '' });
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const { toasts, success, error, removeToast } = useToast();

  useEffect(() => {
    if (plantId) {
      loadPlantData();
    }
  }, [plantId]);

  useEffect(() => {
    if (!plantId) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.plantId === plantId) {
        setPlantImages(DatabaseService.getImagesForPlant(plantId).slice(0, 1));
      }
    };
    window.addEventListener('plant-image-synced', handler);
    return () => window.removeEventListener('plant-image-synced', handler);
  }, [plantId]);

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

  useEffect(() => {
    const loadPlantState = async () => {
      if (!plant) return;
      
      try {
        const now = Date.now();
        
        // Calculate care frequency in milliseconds
        const careFrequencyInMs = plant.care_frequency_unit === 'weeks' 
          ? plant.care_frequency_multiplier * 7 * 24 * 60 * 60 * 1000
          : plant.care_frequency_multiplier * 24 * 60 * 60 * 1000;
        
        // Get latest activity timestamps
        const [lastTending, lastWatering, lastSunlight, fruits] = await Promise.all([
          DatabaseService.getLatestTendingForPlant(plant.id),
          DatabaseService.getLatestWateringForPlant(plant.id),
          DatabaseService.getLatestSunlightForPlant(plant.id),
          DatabaseService.getFruitsForPlant(plant.id)
        ]);
        
        const hasFruit = fruits.length > 0;
        
        // Calculate urgency for each care type
        const calculateUrgency = (lastActivityTime: number | null): 'healthy' | 'mild' | 'severe' => {
          if (!lastActivityTime) return 'severe'; // No activity recorded
          
          const msSinceLastActivity = now - lastActivityTime;
          const ratio = msSinceLastActivity / careFrequencyInMs;
          
          if (ratio <= 1) return 'healthy';
          if (ratio <= 3) return 'mild';
          return 'severe';
        };
        
        const tendingUrgency = calculateUrgency(lastTending);
        const wateringUrgency = calculateUrgency(lastWatering);
        const sunlightUrgency = calculateUrgency(lastSunlight);
        
        // Calculate days since creation
        const daysSinceCreation = Math.floor((now - plant.created_at) / (1000 * 60 * 60 * 24));
        
        // Determine growth stage
        let growthStage = 'seed';
        if (daysSinceCreation >= 90) {
          growthStage = 'bush';
        } else if (daysSinceCreation >= 7) {
          growthStage = 'shoot';
        }
        
        setPlantState({
          growthStage,
          hasFruit,
          fruitCount: 0,
          tendingUrgency,
          wateringUrgency,
          sunlightUrgency
        });
      } catch (error) {
        console.error('Failed to load plant state:', error);
        setPlantState({
          growthStage: 'seed',
          hasFruit: false,
          fruitCount: 0,
          tendingUrgency: 'healthy',
          wateringUrgency: 'healthy',
          sunlightUrgency: 'healthy'
        });
      }
    };
    
    loadPlantState();
  }, [plant]);
  const loadPlantData = async () => {
    if (!plantId) return;
    
    setIsLoading(true);
    try {
      const [plantData, allPlantsData, tendings, waterings, sunlight, fruits, prunings, companions, scheduledEvents, buds, notchings, capabilities] = await Promise.all([
        DatabaseService.getPlant(plantId),
        DatabaseService.getAllPlants(),
        DatabaseService.getTendingsForPlant(plantId),
        DatabaseService.getWateringsForPlant(plantId),
        DatabaseService.getSunlightForPlant(plantId),
        DatabaseService.getFruitsForPlant(plantId),
        DatabaseService.getPruningsForPlant(plantId),
        DatabaseService.getCompanionsForPlant(plantId),
        DatabaseService.getScheduledEventsForPlant(plantId),
        DatabaseService.getBudsForPlant(plantId),
        DatabaseService.getNotchingsForPlant(plantId),
        DatabaseService.getCapabilitiesForPlant(plantId)
      ]);

      if (!plantData) {
        navigate('/');
        return;
      }

      setPlant(plantData);
      setAllPlants(allPlantsData);
      setScheduledEvents(scheduledEvents);
      setPlantImages(DatabaseService.getImagesForPlant(plantId).slice(0, 1));
      setActivities({
        tending: tendings,
        watering: waterings,
        sunlight: sunlight,
        fruit: fruits,
        pruning: prunings,
        companion: companions
      });
      setBranchesData({ buds, notchings, capabilities });
    } catch (error) {
      console.error('Failed to load plant data:', error);
      navigate('/');
    } finally {
      setIsLoading(false);
    }
  };

  const handleActivitySubmit = async (data: any) => {
    try {
      if (activityModal.editingItem) {
        // Update existing activity
        switch (activityModal.type) {
          case 'tending':
            await DatabaseService.updateTending(activityModal.editingItem.id, {
              type: data.type,
              summary: data.summary || ''
            });
            break;
          case 'watering':
            await DatabaseService.updateWatering(activityModal.editingItem.id, {
              source: data.source,
              progress_description: data.progress_description || ''
            });
            break;
          case 'sunlight':
            await DatabaseService.updateSunlight(activityModal.editingItem.id, {
              topic: data.topic
            });
            break;
          case 'fruit':
            await DatabaseService.updateFruit(activityModal.editingItem.id, {
              description: data.description
            });
            break;
          case 'pruning':
            await DatabaseService.updatePruning(activityModal.editingItem.id, {
              difficulty: data.difficulty,
              description: data.description || ''
            });
            break;
          case 'companion':
            await DatabaseService.updateCompanion(activityModal.editingItem.id, {
              relationship_descriptor: data.relationship_descriptor,
              plant_b_id: data.plant_b_id
            });
            break;
        }
        success('Activity updated', `${getActivityConfig(activityModal.type).title} has been updated`);
      } else {
        // Add new activity
        const timestamp = data.datetime || Date.now();
        switch (activityModal.type) {
          case 'tending':
            await DatabaseService.addTending({
              plant_id: plantId!,
              datetime: timestamp,
              type: data.type,
              summary: data.summary || ''
            });
            break;
          case 'watering':
            await DatabaseService.addWatering({
              plant_id: plantId!,
              datetime: timestamp,
              source: data.source,
              progress_description: data.progress_description || ''
            });
            break;
          case 'sunlight':
            await DatabaseService.addSunlight({
              plant_id: plantId!,
              datetime: timestamp,
              topic: data.topic
            });
            break;
          case 'fruit':
            await DatabaseService.addFruit({
              plant_id: plantId!,
              datetime: timestamp,
              description: data.description
            });
            break;
          case 'pruning':
            await DatabaseService.addPruning({
              plant_id: plantId!,
              datetime: timestamp,
              difficulty: data.difficulty,
              description: data.description || ''
            });
            break;
          case 'companion':
            await DatabaseService.addCompanion({
              plant_a_id: plantId!,
              relationship_descriptor: data.relationship_descriptor,
              plant_b_id: data.plant_b_id
            });
            break;
        }
        success('Activity added', `${getActivityConfig(activityModal.type).title} has been recorded`);
      }
      
      await loadPlantData();
    } catch (error) {
      console.error('Failed to save activity:', error);
      error('Failed to save activity', 'Please try again');
    }
  };

  const handleBack = () => {
    navigate('/');
  };

  const getLocation = (): { lat: number; lng: number } | null => {
    if (!plant?.additional_info) return null;
    try {
      const additionalInfo = JSON.parse(plant.additional_info);
      return additionalInfo.location || null;
    } catch {
      return null;
    }
  };

  const handleEditPlant = () => {
    setShowMenu(false);
    if (plant) setEditPlantModal({ isOpen: true, plant });
  };

  const handleScheduleCare = () => {
    setShowMenu(false);
    if (plant) setScheduleCareModal({ isOpen: true, plantName: plant.name });
  };

  const handleRemovePlant = () => {
    setShowMenu(false);
    if (!plant) return;
    setConfirmationModal({
      isOpen: true,
      title: 'Remove plant',
      message: `Are you sure you want to remove ${plant.name}? This cannot be undone.`,
      onConfirm: async () => {
        try {
          await DatabaseService.removePlant(plant.id);
          success('Plant removed', `${plant.name} has been removed from your garden`);
          navigate('/');
        } catch {
          error('Failed to remove plant', 'Please try again');
        }
      }
    });
  };

  const handleUpdatePlant = async (plantId: string, updates: {
    name: string;
    phone?: string;
    description?: string;
    care_frequency_multiplier: number;
    care_frequency_unit: 'days' | 'weeks';
    additional_info?: string;
  }) => {
    try {
      await DatabaseService.updatePlant(plantId, updates);
      await loadPlantData();
      success('Plant updated', 'Plant details have been changed');
    } catch {
      error('Failed to update plant', 'Please try again');
    }
  };

  const handleScheduleSubmit = async (data: { scheduledDate: number; description?: string }) => {
    if (!plant) return;
    try {
      await DatabaseService.addScheduledEvent({
        plant_id: plant.id,
        event_type: 'tending',
        scheduled_date: data.scheduledDate,
        description: data.description
      });
      await DatabaseService.updatePlantNextScheduledCare(plant.id, data.scheduledDate);
      await loadPlantData();
      success('Care scheduled', `Reminder set for ${plant.name}`);
    } catch {
      error('Failed to schedule care', 'Please try again');
    }
  };

  const formatRelativeTime = (timestamp: number) => {
    const date = dayjs(timestamp);
    if (date.isToday()) return 'Today';
    if (date.isYesterday()) return 'Yesterday';
    return date.fromNow();
  };

  const getPlantDisplay = () => {
    if (!plantState || !plant) return { svgPath: '/src/assets/up_to_2_days.svg', filter: '' };
    
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

  const formatScheduledTime = (timestamp: number) => {
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

  const getActivityConfig = (type: string) => {
    const configs = {
      tending: {
        emoji: '🪴',
        title: 'Tending',
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        emptyMessage: 'True friendship is a bond that transcends superficial differences and endures through tests and trials. It is nurtured through acts of kindness, empathy, and understanding.'
      },
      watering: {
        emoji: '🚿',
        title: 'Watering',
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        emptyMessage: 'The Water for these trees is the living water of the sacred Words uttered by the Beloved of the world. Among them are upright character, virtuous deeds and a goodly utterance. Report here any time you study the Sacred Writings with this soul.'
      },
      sunlight: {
        emoji: '☀️',
        title: 'Sunlight',
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-50',
        emptyMessage: 'Pray in behalf of the inhabitants of that city and beg for them the light of supreme guidance, that spirits may be illumined and hearts may be gladdened by the glad-tidings of God.'
      },
      fruit: {
        emoji: '🍎',
        title: 'Fruit',
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        emptyMessage: 'Man is like unto a tree. If he be adorned with fruit, he hath been and will ever be worthy of praise and commendation. Among them are upright character, virtuous deeds and a goodly utterance. Share here any acts of teaching or service that this soul arises to offer.'
      },
      pruning: {
        emoji: '✂️',
        title: 'Pruning Event',
        color: 'text-purple-600',
        bgColor: 'bg-purple-50',
        emptyMessage: 'The more difficulties one sees in the world the more perfect one becomes. The more you cut the branches of a tree the higher and stronger it grows. Note here struggles and difficulties this blessed soul goes through for your future prayers and reference.'
      },
      companion: {
        emoji: '🤝',
        title: 'Companions',
        color: 'text-indigo-600',
        bgColor: 'bg-indigo-50',
        emptyMessage: 'Record here any relationship between your plants, such as them being family or being friends.'
      }
    };
    return configs[type as keyof typeof configs];
  };

  const handleAddActivity = (type: 'tending' | 'watering' | 'sunlight' | 'fruit' | 'pruning' | 'companion') => {
    setActivityModal({
      isOpen: true,
      type,
      editingItem: undefined
    });
  };

  const handleEditActivity = (type: 'tending' | 'watering' | 'sunlight' | 'fruit' | 'pruning' | 'companion', item: any) => {
    setActivityModal({
      isOpen: true,
      type,
      editingItem: item
    });
  };

  const handleOpenBranchesModal = (subType: BranchesSubType, editingItem?: any) => {
    setBranchesModal({ isOpen: true, subType, editingItem });
  };

  const handleBranchesSubmit = async (subType: BranchesSubType, data: any) => {
    if (!plantId) return;
    if (branchesModal.editingItem) {
      if (subType === 'bud') await DatabaseService.updateBud(branchesModal.editingItem.id, { text: data.text });
      else if (subType === 'notching') await DatabaseService.updateNotching(branchesModal.editingItem.id, data);
      else if (subType === 'capability') await DatabaseService.updateCapability(branchesModal.editingItem.id, { text: data.text });
    } else {
      if (subType === 'bud') await DatabaseService.addBud({ plant_id: plantId, text: data.text, created_at: Date.now() });
      else if (subType === 'notching') await DatabaseService.addNotching({ plant_id: plantId, ...data });
      else if (subType === 'capability') await DatabaseService.addCapability({ plant_id: plantId, text: data.text, created_at: Date.now() });
    }
    await loadPlantData();
  };

  const handleDeleteBranchItem = (subType: BranchesSubType, item: any) => {
    const labels: Record<BranchesSubType, string> = { bud: 'Bud', notching: 'Notching', capability: 'Capability' };
    setConfirmationModal({
      isOpen: true,
      title: `Delete ${labels[subType]}`,
      message: `Are you sure you want to delete this ${labels[subType].toLowerCase()}? This action cannot be undone.`,
      onConfirm: async () => {
        if (subType === 'bud') await DatabaseService.deleteBud(item.id);
        else if (subType === 'notching') await DatabaseService.deleteNotching(item.id);
        else if (subType === 'capability') await DatabaseService.deleteCapability(item.id);
        await loadPlantData();
      }
    });
  };

  const handleDeleteActivity = (type: string, item: any) => {
    setConfirmationModal({
      isOpen: true,
      title: `Delete ${getActivityConfig(type).title}`,
      message: `Are you sure you want to delete this ${type} activity? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          switch (type) {
            case 'tending':
              await DatabaseService.deleteTending(item.id);
              break;
            case 'watering':
              await DatabaseService.deleteWatering(item.id);
              break;
            case 'sunlight':
              await DatabaseService.deleteSunlight(item.id);
              break;
            case 'fruit':
              await DatabaseService.deleteFruit(item.id);
              break;
            case 'pruning':
              await DatabaseService.deletePruning(item.id);
              break;
            case 'companion':
              await DatabaseService.deleteCompanion(item.id);
              break;
          }
          
          success('Activity deleted', `${getActivityConfig(type).title} activity has been removed`);
          await loadPlantData();
        } catch (error) {
          console.error('Failed to delete activity:', error);
          error('Failed to delete activity', 'Please try again');
        }
      }
    });
  };

  const handleSeeMore = (type: string) => {
    navigate(`/plants/${plantId}/activities/${type}`);
  };

  const getUpcomingScheduledCareDescription = () => {
    if (!plant) return null;
    
    // Filter events where the scheduled date is more recent than the last care date
    const relevantEvents = scheduledEvents.filter(event => 
      event.scheduled_date > plant.last_cared_for
    );
    
    if (relevantEvents.length === 0) return null;
    
    // Sort by scheduled_date to get the most recent one
    const nextEvent = relevantEvents.sort((a, b) => b.scheduled_date - a.scheduled_date)[0];
    
    return nextEvent.description;
  };

  const renderActivitySection = (type: 'tending' | 'watering' | 'sunlight' | 'fruit' | 'pruning' | 'companion') => {
    const config = getActivityConfig(type);
    const items = activities[type];
    const hasItems = items && items.length > 0;
    const showSeeMore = type === 'companion' ? items.length > 10 : items.length > 1;
    const displayItems = type === 'companion' ? items.slice(0, 10) : items.slice(0, 1);

    return (
      <div key={type} className={`bg-white rounded-xl border border-gray-100 p-6${type === 'sunlight' ? ' md:col-span-2' : ''}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 ${config.bgColor} rounded-full flex items-center justify-center`}>
              <span className="text-xl">{config.emoji}</span>
            </div>
            <h3 className={`text-lg font-semibold ${config.color}`}>
              {config.title}
            </h3>
          </div>
          <button
            onClick={() => handleAddActivity(type)}
            className={`p-2 ${config.bgColor} hover:opacity-80 rounded-lg transition-colors`}
          >
            <Plus className={`w-4 h-4 ${config.color}`} />
          </button>
        </div>

        {!hasItems ? (
          <div className="text-gray-600 text-sm leading-relaxed italic">
            {config.emptyMessage}
          </div>
        ) : (
          <div className="space-y-3">
            {displayItems.map((item: any) => (
              <div key={item.id} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  {type !== 'companion' && (
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-900">
                        {formatRelativeTime(item.datetime)}
                      </span>
                    </div>
                  )}
                  <div className="text-sm text-gray-600">
                    {type === 'tending' && (
                      <span>{item.type}: {item.summary || 'No summary'}</span>
                    )}
                    {type === 'watering' && (
                      <span>{item.source}: {item.progress_description || 'No description'}</span>
                    )}
                    {type === 'sunlight' && (
                      <span>{item.topic}</span>
                    )}
                    {type === 'fruit' && (
                      <>
                        {item.basic_activity && (
                          <span className="block font-medium text-amber-700 capitalize mb-0.5">
                            {item.basic_activity}
                          </span>
                        )}
                        <span>{item.description}</span>
                      </>
                    )}
                    {type === 'pruning' && (
                      <span>{item.description || 'No description'}</span>
                    )}
                    {type === 'companion' && (
                      <span>
                        {item.relationship_descriptor} with{' '}
                        {allPlants.find(p => p.id === (item.plant_b_id === plantId ? item.plant_a_id : item.plant_b_id))?.name || 'Unknown plant'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEditActivity(type, item)}
                    className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteActivity(type, item)}
                    className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            
            {showSeeMore && (
              <button
                onClick={() => handleSeeMore(type)}
                className={`w-full py-2 ${config.color} hover:opacity-80 text-sm font-medium transition-colors`}
              >
                See more ({items.length - displayItems.length} more)
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderBranchesCard = () => {
    const { buds, notchings, capabilities } = branchesData;
    const hasAny = buds.length > 0 || notchings.length > 0 || capabilities.length > 0;
    const showMoreNotchings = notchings.length > 1;

    return (
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        {/* Card Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-50 rounded-full flex items-center justify-center">
              <span className="text-xl">🌿</span>
            </div>
            <h3 className="text-lg font-semibold text-amber-700">Branches</h3>
          </div>
        </div>

        {!hasAny && (
          <p className="text-gray-500 text-sm italic leading-relaxed">
            If we sow the seed, a mighty tree appears from it. The virtues of the seed are revealed in the tree; it puts forth branches, leaves, blossoms, and produces fruits. All these virtues were hidden and potential in the seed. Use Notches to track progress in the systematic effort to enhance capacity for service.
          </p>
        )}

        {/* BUDS STRIP */}
        <div className="mb-4 mt-4">
          <button
            onClick={() => handleOpenBranchesModal('bud')}
            className="w-full flex items-center justify-between mb-2 -mx-1 px-1 py-1 rounded-lg hover:bg-amber-50 active:bg-amber-100 transition-colors"
          >
            <span className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Buds</span>
            {buds.length === 0 && (
              <span className="text-xs text-gray-400 italic flex-1 mx-3 text-left">Potentialities or Interests</span>
            )}
            <span className="p-1 bg-amber-50 rounded-lg">
              <Plus className="w-3.5 h-3.5 text-amber-600" />
            </span>
          </button>
          {buds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {buds.map(bud => (
                <div
                  key={bud.id}
                  className="group flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm font-medium"
                >
                  <span>{bud.text}</span>
                  <div className="hidden group-hover:flex items-center gap-0.5 ml-1">
                    <button
                      onClick={() => handleOpenBranchesModal('bud', bud)}
                      className="text-amber-600 hover:text-amber-800 transition-colors"
                    >
                      <Edit className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleDeleteBranchItem('bud', bud)}
                      className="text-amber-600 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* NOTCHINGS */}
        <div className="mb-4">
          <button
            onClick={() => handleOpenBranchesModal('notching')}
            className="w-full flex items-center justify-between mb-2 -mx-1 px-1 py-1 rounded-lg hover:bg-amber-50 active:bg-amber-100 transition-colors"
          >
            <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Notching</span>
            {notchings.length === 0 && (
              <span className="text-xs text-gray-400 italic flex-1 mx-3 text-left">Studies to develop capacity</span>
            )}
            <span className="p-1 bg-amber-50 rounded-lg">
              <Plus className="w-3.5 h-3.5 text-amber-700" />
            </span>
          </button>
          {notchings.length > 0 && (
            <div className="space-y-2">
              {notchings.slice(0, 1).map(n => (
                <div key={n.id} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <div className="text-xs text-gray-500 mb-0.5">{formatRelativeTime(n.datetime)}</div>
                    <div className="text-sm font-medium text-gray-800">
                      {n.book.replace('ruhi_', 'Ruhi Book ').replace(/_/g, ' ')} &mdash; U{n.start_unit}S{n.start_section} to U{n.end_unit}S{n.end_section}
                    </div>
                    <div className="text-xs text-amber-600 mt-0.5">about {n.sections_studied} {n.sections_studied === 1 ? 'section' : 'sections'}</div>
                    {n.progress_description && (
                      <div className="text-xs text-gray-500 mt-1 line-clamp-2">{n.progress_description}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={() => handleOpenBranchesModal('notching', n)}
                      className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteBranchItem('notching', n)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {showMoreNotchings && (
                <button
                  onClick={() => handleSeeMore('notching')}
                  className="w-full py-2 text-amber-700 hover:opacity-80 text-sm font-medium transition-colors"
                >
                  See more ({notchings.length - 1} more)
                </button>
              )}
            </div>
          )}
        </div>

        {/* CAPABILITIES STRIP */}
        <div>
          <button
            onClick={() => handleOpenBranchesModal('capability')}
            className="w-full flex items-center justify-between mb-2 -mx-1 px-1 py-1 rounded-lg hover:bg-emerald-50 active:bg-emerald-100 transition-colors"
          >
            <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Flowers</span>
            {capabilities.length === 0 && (
              <span className="text-xs text-gray-400 italic flex-1 mx-3 text-left">Proven or developed capabilities</span>
            )}
            <span className="p-1 bg-emerald-50 rounded-lg">
              <Plus className="w-3.5 h-3.5 text-emerald-600" />
            </span>
          </button>
          {capabilities.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {capabilities.map(cap => (
                <div
                  key={cap.id}
                  className="group flex items-center gap-1 px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-sm font-medium"
                >
                  <span>{cap.text}</span>
                  <div className="hidden group-hover:flex items-center gap-0.5 ml-1">
                    <button
                      onClick={() => handleOpenBranchesModal('capability', cap)}
                      className="text-emerald-600 hover:text-emerald-800 transition-colors"
                    >
                      <Edit className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleDeleteBranchItem('capability', cap)}
                      className="text-emerald-600 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 animate-spin">
            <span className="text-4xl">🌱</span>
          </div>
          <p className="text-gray-600">Loading plant details...</p>
        </div>
      </div>
    );
  }

  if (!plant) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Plant not found</p>
          <button
            onClick={handleBack}
            className="mt-4 text-green-600 hover:text-green-700 font-medium"
          >
            Return to Garden
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-start gap-4">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors mt-1 flex-shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="relative flex-shrink-0 mt-1">
                {plantState && (
                  <>
                    <img
                      src={getPlantDisplay().svgPath}
                      alt="Plant growth stage"
                      className="w-12 h-12 transition-all duration-300"
                    />
                    {getPlantDisplay().overlayClass && (
                      <div
                        className={`absolute inset-0 w-12 h-12 pointer-events-none transition-opacity duration-300 ${getPlantDisplay().overlayClass}`}
                      />
                    )}
                  </>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-bold text-gray-900">{plant.name}</h1>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-gray-400" />
                    <span className="text-gray-600">
                      Next care: {formatScheduledTime(plant.next_scheduled_care)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Heart className="w-3 h-3 text-gray-400" />
                    <span className="text-gray-600">
                      Last cared: {formatRelativeTime(plant.last_cared_for)}
                    </span>
                  </div>
                </div>
                {getUpcomingScheduledCareDescription() && (
                  <span className="text-sm text-gray-800">
                    {getUpcomingScheduledCareDescription()}
                  </span>
                )}
                {(plant.email || plant.phone || getLocation()) && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-gray-600">
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
                        >
                          {plant.phone}
                        </a>
                      </div>
                    )}
                    {getLocation() && (
                      <div className="flex items-center gap-1 text-green-600">
                        <MapPin className="w-3 h-3" />
                        <span>Location set</span>
                      </div>
                    )}
                  </div>
                )}
                {plant.description && (
                  <div className="mt-2 p-3 bg-gray-50 rounded-xl">
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {plant.description}
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {plantImages.length > 0 && (
                <div
                  className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 hover:border-green-400 cursor-pointer transition-colors duration-200"
                  onClick={() => setSelectedImageIndex(0)}
                >
                  <img
                    src={plantImages[0]}
                    alt={plant.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                >
                  <MoreHorizontal className="w-5 h-5" />
                </button>
                {showMenu && (
                  <div className="absolute right-0 top-8 bg-white rounded-lg shadow-lg border border-gray-200 py-2 min-w-[160px] z-10">
                    <button
                      onClick={handleScheduleCare}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <CalendarPlus className="w-4 h-4" />
                      Schedule care
                    </button>
                    <button
                      onClick={handleEditPlant}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Edit className="w-4 h-4" />
                      Change
                    </button>
                    <button
                      onClick={handleRemovePlant}
                      className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Remove plant
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="grid gap-6 md:grid-cols-2">
          {renderActivitySection('sunlight')}
          {(['tending', 'watering'] as const).map(type => renderActivitySection(type))}
          {renderBranchesCard()}
          {(['fruit', 'pruning', 'companion'] as const).map(type => renderActivitySection(type))}
        </div>
      </main>

      {/* Modals */}
      <ActivityModal
        isOpen={activityModal.isOpen}
        onClose={() => setActivityModal(prev => ({ ...prev, isOpen: false }))}
        plantName={plant.name}
        plantId={plant.id}
        activityType={activityModal.type}
        editingItem={activityModal.editingItem}
        allPlants={allPlants}
        onSubmit={handleActivitySubmit}
      />

      <BranchesModal
        isOpen={branchesModal.isOpen}
        onClose={() => setBranchesModal(prev => ({ ...prev, isOpen: false }))}
        subType={branchesModal.subType}
        plantName={plant.name}
        plantId={plant.id}
        editingItem={branchesModal.editingItem}
        lastNotching={branchesData.notchings[0]}
        onSubmit={handleBranchesSubmit}
      />

      <ConfirmationModal
        isOpen={confirmationModal.isOpen}
        onClose={() => setConfirmationModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmationModal.onConfirm}
        title={confirmationModal.title}
        message={confirmationModal.message}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />

      <EditPlantModal
        isOpen={editPlantModal.isOpen}
        onClose={() => setEditPlantModal({ isOpen: false, plant: null })}
        plant={editPlantModal.plant}
        onUpdate={handleUpdatePlant}
      />

      <ScheduleCareModal
        isOpen={scheduleCareModal.isOpen}
        onClose={() => setScheduleCareModal(prev => ({ ...prev, isOpen: false }))}
        plantName={scheduleCareModal.plantName}
        onSchedule={handleScheduleSubmit}
      />

      <ToastContainer
        toasts={toasts}
        onRemoveToast={removeToast}
      />

      {selectedImageIndex !== null && plantImages.length > 0 && (() => {
        const viewerUser = getViewerUser();
        return viewerUser ? (
          <PlantImageViewer
            thumbnailUrl={plantImages[0]}
            plantId={plant?.id ?? ''}
            user={viewerUser}
            onClose={() => setSelectedImageIndex(null)}
          />
        ) : null;
      })()}
    </div>
  );
};