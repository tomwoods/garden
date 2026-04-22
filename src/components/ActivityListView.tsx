import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CreditCard as Edit, Trash2, Plus } from 'lucide-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import isToday from 'dayjs/plugin/isToday';
import isYesterday from 'dayjs/plugin/isYesterday';
import { DatabaseService, type Plant, type Tending, type Watering, type Sunlight, type Fruit, type Pruning, type Companion } from '../lib/database';
import { ActivityModal } from './ActivityModal';
import { ConfirmationModal } from './ConfirmationModal';
import { ToastContainer } from './ToastContainer';
import { useToast } from '../hooks/useToast';

dayjs.extend(relativeTime);
dayjs.extend(isToday);
dayjs.extend(isYesterday);

type ActivityType = 'tending' | 'watering' | 'sunlight' | 'fruit' | 'pruning' | 'companion';

export const ActivityListView: React.FC = () => {
  const { plantId, activityType } = useParams<{ plantId: string; activityType: ActivityType }>();
  const navigate = useNavigate();
  const [plant, setPlant] = useState<Plant | null>(null);
  const [allPlants, setAllPlants] = useState<Plant[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activityModal, setActivityModal] = useState<{
    isOpen: boolean;
    editingItem?: any;
  }>({
    isOpen: false
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

  const { toasts, success, error, removeToast } = useToast();

  useEffect(() => {
    if (plantId && activityType) {
      loadData();
    }
  }, [plantId, activityType]);

  const loadData = async () => {
    if (!plantId || !activityType) return;
    
    setIsLoading(true);
    try {
      const [plantData, allPlantsData, activitiesData] = await Promise.all([
        DatabaseService.getPlant(plantId),
        DatabaseService.getAllPlants(),
        loadActivities(plantId, activityType)
      ]);

      if (!plantData) {
        navigate('/');
        return;
      }

      setPlant(plantData);
      setAllPlants(allPlantsData);
      setActivities(activitiesData);
    } catch (error) {
      console.error('Failed to load data:', error);
      navigate('/');
    } finally {
      setIsLoading(false);
    }
  };

  const loadActivities = async (plantId: string, type: ActivityType) => {
    switch (type) {
      case 'tending':
        return await DatabaseService.getTendingsForPlant(plantId);
      case 'watering':
        return await DatabaseService.getWateringsForPlant(plantId);
      case 'sunlight':
        return await DatabaseService.getSunlightForPlant(plantId);
      case 'fruit':
        return await DatabaseService.getFruitsForPlant(plantId);
      case 'pruning':
        return await DatabaseService.getPruningsForPlant(plantId);
      case 'companion':
        return await DatabaseService.getCompanionsForPlant(plantId);
      default:
        return [];
    }
  };

  const getActivityConfig = () => {
    const configs = {
      tending: {
        emoji: '🪴',
        title: 'Tending',
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
        buttonColor: 'bg-green-600 hover:bg-green-700'
      },
      watering: {
        emoji: '🚿',
        title: 'Watering',
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
        buttonColor: 'bg-blue-600 hover:bg-blue-700'
      },
      sunlight: {
        emoji: '☀️',
        title: 'Sunlight',
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-50',
        borderColor: 'border-yellow-200',
        buttonColor: 'bg-yellow-600 hover:bg-yellow-700'
      },
      fruit: {
        emoji: '🍎',
        title: 'Fruit',
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        buttonColor: 'bg-red-600 hover:bg-red-700'
      },
      pruning: {
        emoji: '✂️',
        title: 'Pruning Event',
        color: 'text-purple-600',
        bgColor: 'bg-purple-50',
        borderColor: 'border-purple-200',
        buttonColor: 'bg-purple-600 hover:bg-purple-700'
      },
      companion: {
        emoji: '🤝',
        title: 'Companions',
        color: 'text-indigo-600',
        bgColor: 'bg-indigo-50',
        borderColor: 'border-indigo-200',
        buttonColor: 'bg-indigo-600 hover:bg-indigo-700'
      }
    };
    return configs[activityType as keyof typeof configs];
  };

  const formatDateTime = (timestamp: number) => {
    const date = dayjs(timestamp);
    const now = dayjs();
    
    if (date.isToday()) return `Today at ${date.format('h:mm A')}`;
    if (date.isYesterday()) return `Yesterday at ${date.format('h:mm A')}`;
    
    const diffDays = now.diff(date, 'day');
    if (diffDays < 7) return `${diffDays} days ago`;
    
    if (date.year() === now.year()) {
      return date.format('MMM D');
    } else {
      return date.format('MMM D, YYYY');
    }
  };

  const handleAddActivity = () => {
    setActivityModal({
      isOpen: true,
      editingItem: undefined
    });
  };

  const handleEditActivity = (item: any) => {
    setActivityModal({
      isOpen: true,
      editingItem: item
    });
  };

  const handleDeleteActivity = (item: any) => {
    const config = getActivityConfig();
    setConfirmationModal({
      isOpen: true,
      title: `Delete ${config.title}`,
      message: `Are you sure you want to delete this ${activityType} activity? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          switch (activityType) {
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
          
          success('Activity deleted', `${config.title} activity has been removed`);
          await loadData();
        } catch (error) {
          console.error('Failed to delete activity:', error);
          error('Failed to delete activity', 'Please try again');
        }
      }
    });
  };

  const handleActivitySubmit = async (data: any) => {
    try {
      if (activityModal.editingItem) {
        // Update existing activity
        switch (activityType) {
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
        success('Activity updated', `${getActivityConfig().title} has been updated`);
      } else {
        // Add new activity
        switch (activityType) {
          case 'tending':
            await DatabaseService.addTending({
              plant_id: plantId!,
              datetime: Date.now(),
              type: data.type,
              summary: data.summary || ''
            });
            break;
          case 'watering':
            await DatabaseService.addWatering({
              plant_id: plantId!,
              datetime: Date.now(),
              source: data.source,
              progress_description: data.progress_description || ''
            });
            break;
          case 'sunlight':
            await DatabaseService.addSunlight({
              plant_id: plantId!,
              datetime: Date.now(),
              topic: data.topic
            });
            break;
          case 'fruit':
            await DatabaseService.addFruit({
              plant_id: plantId!,
              datetime: Date.now(),
              description: data.description
            });
            break;
          case 'pruning':
            await DatabaseService.addPruning({
              plant_id: plantId!,
              datetime: Date.now(),
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
        success('Activity added', `${getActivityConfig().title} has been recorded`);
      }
      
      await loadData();
    } catch (error) {
      console.error('Failed to save activity:', error);
      error('Failed to save activity', 'Please try again');
    }
  };

  const renderActivityContent = (item: any) => {
    switch (activityType) {
      case 'tending':
        return (
          <div>
            <div className="font-medium text-gray-900 mb-1">
              {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
            </div>
            {item.summary && (
              <div className="text-gray-600 text-sm">
                {item.summary}
              </div>
            )}
          </div>
        );
      
      case 'watering':
        return (
          <div>
            <div className="font-medium text-gray-900 mb-1">
              {item.source}
            </div>
            {item.progress_description && (
              <div className="text-gray-600 text-sm">
                {item.progress_description}
              </div>
            )}
          </div>
        );
      
      case 'sunlight':
        return (
          <div className="text-gray-900">
            {item.topic}
          </div>
        );
      
      case 'fruit':
        return (
          <div className="text-gray-900">
            {item.description}
          </div>
        );
      
      case 'pruning':
        return (
          <div>
            <div className="font-medium text-gray-900 mb-1">
              {item.difficulty.charAt(0).toUpperCase() + item.difficulty.slice(1)} difficulty
            </div>
            {item.description && (
              <div className="text-gray-600 text-sm">
                {item.description}
              </div>
            )}
          </div>
        );
      
      case 'companion':
        return (
          <div className="text-gray-900">
            <span className="font-medium">{item.relationship_descriptor}</span> with{' '}
            <span className="font-medium">
              {allPlants.find(p => p.id === (item.plant_b_id === plantId ? item.plant_a_id : item.plant_b_id))?.name || 'Unknown plant'}
            </span>
          </div>
        );
      
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 animate-spin">
            <span className="text-4xl">🌱</span>
          </div>
          <p className="text-gray-600">Loading activities...</p>
        </div>
      </div>
    );
  }

  if (!plant || !activityType) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Activity not found</p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 text-green-600 hover:text-green-700 font-medium"
          >
            Return to Garden
          </button>
        </div>
      </div>
    );
  }

  const config = getActivityConfig();

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(`/plants/${plantId}`)}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 ${config.bgColor} rounded-full flex items-center justify-center`}>
                <span className="text-xl">{config.emoji}</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {config.title} for {plant.name}
                </h1>
                <p className="text-sm text-gray-600">
                  {activities.length} {activities.length === 1 ? 'entry' : 'entries'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {/* Section Header */}
          <div className={`${config.bgColor} ${config.borderColor} border-b px-6 py-4`}>
            <div className="flex items-center justify-between">
              <h2 className={`text-lg font-semibold ${config.color}`}>
                All {config.title} Activities
              </h2>
              <button
                onClick={handleAddActivity}
                className={`${config.buttonColor} text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2`}
              >
                <Plus className="w-4 h-4" />
                Add {config.title}
              </button>
            </div>
          </div>

          {/* Activities List */}
          {activities.length === 0 ? (
            <div className="p-8 text-center">
              <div className={`w-16 h-16 ${config.bgColor} rounded-full flex items-center justify-center mx-auto mb-4`}>
                <span className="text-2xl">{config.emoji}</span>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No {config.title} Activities Yet
              </h3>
              <p className="text-gray-600 mb-6 max-w-md mx-auto">
                Start recording {config.title.toLowerCase()} activities to track your relationship with {plant.name}.
              </p>
              <button
                onClick={handleAddActivity}
                className={`${config.buttonColor} text-white px-6 py-3 rounded-xl font-medium transition-colors flex items-center gap-2 mx-auto`}
              >
                <Plus className="w-5 h-5" />
                Add First {config.title}
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {activities.map((item) => (
                <div key={item.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      {activityType !== 'companion' && (
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-medium text-gray-500">
                            {formatDateTime(item.datetime)}
                          </span>
                        </div>
                      )}
                      {renderActivityContent(item)}
                    </div>
                    <div className="flex items-center gap-1 ml-4">
                      <button
                        onClick={() => handleEditActivity(item)}
                        className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteActivity(item)}
                        className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      <ActivityModal
        isOpen={activityModal.isOpen}
        onClose={() => setActivityModal({ isOpen: false })}
        plantName={plant.name}
        plantId={plant.id}
        activityType={activityType!}
        editingItem={activityModal.editingItem}
        allPlants={allPlants}
        onSubmit={handleActivitySubmit}
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

      <ToastContainer
        toasts={toasts}
        onRemoveToast={removeToast}
      />
    </div>
  );
};