import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyBackupPrompt } from './KeyBackupPrompt';
import { PlantCard } from './PlantCard';
import { AddPlantModal } from './AddPlantModal';
import { EditPlantModal } from './EditPlantModal';
import { ActivityModal } from './ActivityModal';
import { ConfirmationModal } from './ConfirmationModal';
import { ScheduleCareModal } from './ScheduleCareModal';
import { SlidingMenu } from './SlidingMenu';
import { ToastContainer } from './ToastContainer';
import { MapOverlay } from './MapOverlay';
import { DatabaseService, type Plant } from '../lib/database';
import { uploadService } from '../lib/uploadService';
import { useToast } from '../hooks/useToast';
import { Plus, Leaf, Settings, Search, X } from 'lucide-react';
import { Bug } from 'lucide-react';
import { SowingSeasonBanner } from './SowingSeasonBanner';

export const GardenView: React.FC = () => {
  const navigate = useNavigate();
  const [plants, setPlants] = useState<Plant[]>([]);
  const [filteredPlants, setFilteredPlants] = useState<Plant[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearchOverlay, setShowSearchOverlay] = useState(false);
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);
  const [debugQuery, setDebugQuery] = useState('SELECT * FROM plants');
  const [showAddPlant, setShowAddPlant] = useState(false);
  const [showSlidingMenu, setShowSlidingMenu] = useState(false);

  // Handle URL query parameter for plant navigation from notifications
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const plantIdFromUrl = params.get('plant');
    if (plantIdFromUrl) {
      navigate(`/plants/${plantIdFromUrl}`);
      // Clear the query parameter
      window.history.replaceState({}, '', '/');
    }
  }, [navigate]);
  const [editPlantModal, setEditPlantModal] = useState<{
    isOpen: boolean;
    plant: Plant | null;
  }>({
    isOpen: false,
    plant: null
  });
  const [imageRefreshKey, setImageRefreshKey] = useState(0);
  const [scheduleCareModal, setScheduleCareModal] = useState<{
    isOpen: boolean;
    plantId: string;
    plantName: string;
  }>({
    isOpen: false,
    plantId: '',
    plantName: ''
  });
  const [confirmationModal, setConfirmationModal] = useState<{
    isOpen: boolean;
    plantId: string;
    plantName: string;
  }>({
    isOpen: false,
    plantId: '',
    plantName: ''
  });
  const [activityModal, setActivityModal] = useState<{
    isOpen: boolean;
    plantId: string;
    plantName: string;
    type: 'tending' | 'watering';
  }>({
    isOpen: false,
    plantId: '',
    plantName: '',
    type: 'tending'
  });
  const [mapModal, setMapModal] = useState<{
    isOpen: boolean;
    location: { lat: number; lng: number } | null;
    plantName: string;
  }>({
    isOpen: false,
    location: null,
    plantName: ''
  });

  const { toasts, success, error, removeToast } = useToast();

  useEffect(() => {
    loadPlants();
  }, []);

  // Filter plants based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredPlants(plants);
    } else {
      const filtered = plants.filter(plant => 
        plant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (plant.phone && plant.phone.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (plant.description && plant.description.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      setFilteredPlants(filtered);
    }
  }, [plants, searchTerm]);

  const loadPlants = async () => {
    try {
      const allPlants = await DatabaseService.getAllPlants();
      console.log("all plants", allPlants)
      setPlants(Array.isArray(allPlants) ? allPlants : []);
      console.log(`Loaded ${allPlants.length} plants from storage`);
    } catch (error) {
      console.error('Failed to load plants:', error);
      setPlants([]);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowSearchOverlay(false);
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    setShowSearchOverlay(false);
  };

  const handleDebugSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!debugQuery.trim()) return;
    
    try {
      console.log('🐛 Executing AlaSQL query:', debugQuery);
      const result = alasql(debugQuery);
      console.log('🐛 Query result:', result);
      setShowDebugOverlay(false);
      setDebugQuery('SELECT * FROM plants');
    } catch (error) {
      console.error('🐛 Query error:', error);
    }
  };

  const downloadGardenKey = () => {
    // Get the actual user data from localStorage
    const storedUser = localStorage.getItem('garden-key');
    if (!storedUser) {
      error('No garden key found', 'Please create a new garden first');
      return;
    }
    
    const userData = JSON.parse(storedUser);
    const gardenKeyData = {
      ...userData,
      created: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(gardenKeyData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `garden-key-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleBulkSunlight = async (plantIds: string[], topic: string) => {
    try {
      // Add sunlight entry for each selected plant
      await Promise.all(
        plantIds.map(plantId =>
          DatabaseService.addSunlight({
            plant_id: plantId,
            datetime: Date.now(),
            topic
          })
        )
      );
      
      await loadPlants();
      success('Sunlight added', `Prayer added for ${plantIds.length} plants`);
    } catch (error) {
      console.error('Failed to add bulk sunlight:', error);
      error('Failed to add sunlight', 'Please try again');
    }
  };
  const addPlant = async (plantData: {
    name: string;
    phone?: string;
    description?: string;
    care_frequency_multiplier: number;
    care_frequency_unit: 'days' | 'weeks';
    next_scheduled_care?: number;
    last_cared_for?: number;
    additional_info?: string;
  }, images?: string[]) => {
    try {
      console.log('Adding plant:', plantData);
      const newPlant = await DatabaseService.addPlant(plantData);
      console.log('Plant added successfully:', newPlant);

      if (images && images.length > 0) {
        await uploadService.queueUpload(newPlant.id, plantData.name, images[0]);
      }

      await loadPlants();
      success('Plant added', `${plantData.name} has been planted in your garden`);
      console.log('Plants reloaded, current count:', plants.length);
    } catch (error) {
      console.error('Failed to add plant:', error);
      error('Failed to add plant', 'Please try again');
      throw error;
    }
  };

  const removePlant = async (plantId: string) => {
    const plant = plants.find(p => p.id === plantId);
    try {
      await DatabaseService.removePlant(plantId);
      await loadPlants();
      success('Plant removed', `${plant?.name || 'Plant'} has been removed from your garden`);
    } catch (error) {
      console.error('Failed to remove plant:', error);
      error('Failed to remove plant', 'Please try again');
    }
  };

  const addTending = async (plantId: string, type: string, summary?: string) => {
    const plant = plants.find(p => p.id === plantId);
    try {
      await DatabaseService.addTending({
        plant_id: plantId,
        datetime: Date.now(),
        type,
        summary: summary || ''
      });
      await loadPlants();
      success('Tending logged', `Recorded ${type} with ${plant?.name || 'plant'}`);
    } catch (error) {
      console.error('Failed to add tending:', error);
      error('Failed to log tending', 'Please try again');
      throw error;
    }
  };

  const addWatering = async (plantId: string, source: string, progressDescription?: string) => {
    const plant = plants.find(p => p.id === plantId);
    try {
      await DatabaseService.addWatering({
        plant_id: plantId,
        datetime: Date.now(),
        source,
        progress_description: progressDescription || ''
      });
      await loadPlants();
      success('Watering logged', `Recorded learning session with ${plant?.name || 'plant'}`);
    } catch (error) {
      console.error('Failed to add watering:', error);
      error('Failed to log watering', 'Please try again');
      throw error;
    }
  };

  const getPlantUrgency = (plant: Plant): number => {
    const daysSinceInteraction = Math.floor((Date.now() - plant.last_interaction) / (1000 * 60 * 60 * 24));
    return daysSinceInteraction;
  };

  const getUrgencyColor = (urgency: number): string => {
    if (urgency <= 3) return 'text-green-600';
    if (urgency <= 7) return 'text-yellow-600';
    if (urgency <= 14) return 'text-orange-600';
    return 'text-red-600';
  };

  const getPlantState = async (plant: Plant) => {
    const now = Date.now();
    const plantAge = now - plant.created_at;
    const daysSinceCreation = Math.floor(plantAge / (1000 * 60 * 60 * 24));
    
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
    
    // Determine growth stage
    let growthStage = 'seed';
    if (daysSinceCreation >= 90) {
      growthStage = 'bush';
    } else if (daysSinceCreation >= 7) {
      growthStage = 'shoot';
    }
    
    return {
      growthStage,
      hasFruit,
      fruitCount: 0,
      tendingUrgency,
      wateringUrgency,
      sunlightUrgency
    };
  };

  const handleActivitySubmit = async (data: any) => {
    try {
      switch (activityModal.type) {
        case 'tending':
          await addTending(activityModal.plantId, data.type, data.summary);
          break;
        case 'watering':
          await addWatering(activityModal.plantId, data.source, data.progressDescription);
          break;
      }
    } catch (error) {
      console.error('Failed to save activity:', error);
    }
  };

  const handleTendPlant = (plantId: string, plantName: string) => {
    setActivityModal({
      isOpen: true,
      plantId,
      plantName,
      type: 'tending'
    });
  };

  const handleWaterPlant = (plantId: string, plantName: string) => {
    setActivityModal({
      isOpen: true,
      plantId,
      plantName,
      type: 'watering'
    });
  };

  const handleShowConfirmation = (plantId: string, plantName: string) => {
    setConfirmationModal({
      isOpen: true,
      plantId,
      plantName
    });
  };

  const handleConfirmRemove = () => {
    removePlant(confirmationModal.plantId);
    setConfirmationModal(prev => ({ ...prev, isOpen: false }));
  };

  const handleViewDetails = (plantId: string) => {
    navigate(`/plants/${plantId}`);
  };

  const handleScheduleCare = (plantId: string, plantName: string) => {
    setScheduleCareModal({
      isOpen: true,
      plantId,
      plantName
    });
  };

  const handleScheduleSubmit = async (data: { scheduledDate: number; description?: string }) => {
    try {
      // Add scheduled event
      await DatabaseService.addScheduledEvent({
        plant_id: scheduleCareModal.plantId,
        event_type: 'tending',
        scheduled_date: data.scheduledDate,
        description: data.description
      });

      // Update plant's next_scheduled_care
      const plant = plants.find(p => p.id === scheduleCareModal.plantId);
      if (plant) {
        await DatabaseService.updatePlantNextScheduledCare(scheduleCareModal.plantId, data.scheduledDate);
      }

      await loadPlants();
      success('Care scheduled', `Reminder set for ${scheduleCareModal.plantName}`);
    } catch (error) {
      console.error('Failed to schedule care:', error);
      error('Failed to schedule care', 'Please try again');
    }
  };

  const handleEditPlant = (plantId: string) => {
    const plant = plants.find(p => p.id === plantId);
    if (plant) {
      setEditPlantModal({
        isOpen: true,
        plant
      });
    }
  };

  const handleUpdatePlant = async (plantId: string, updates: {
    name: string;
    phone?: string;
    description?: string;
    care_frequency_multiplier: number;
    care_frequency_unit: 'days' | 'weeks';
    next_scheduled_care?: number;
    additional_info?: string;
  }) => {
    try {
      await DatabaseService.updatePlant(plantId, updates);
      await loadPlants();
      success('Plant updated', 'Plant details have been changed');
    } catch (error) {
      console.error('Failed to update plant:', error);
      error('Failed to update plant', 'Please try again');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <Leaf className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">My Garden</h1>
                <p className="text-sm text-gray-600">
                  {searchTerm ? (
                    <>
                      {filteredPlants.length} of {plants.length} plants
                      {searchTerm && (
                        <span className="ml-2">
                          matching "{searchTerm}"
                          <button
                            onClick={handleClearSearch}
                            className="ml-1 text-green-600 hover:text-green-700 underline"
                          >
                            clear
                          </button>
                        </span>
                      )}
                    </>
                  ) : (
                    <>{`${plants.length} ${plants.length === 1 ? 'plant' : 'plants'} growing`}</>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {import.meta.env.DEV && (
                <button
                  onClick={() => setShowDebugOverlay(true)}
                  className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Debug Query"
                >
                  <Bug className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={() => setShowSearchOverlay(true)}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <Search className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowSlidingMenu(true)}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <SowingSeasonBanner />

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Backup Prompt */}
        <KeyBackupPrompt onDownloadGardenKey={downloadGardenKey} />

        {/* Empty State */}
        {filteredPlants.length === 0 ? (
          searchTerm ? (
            <div className="text-center py-16">
              <div className="w-24 h-24 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
                <Search className="w-12 h-12 text-gray-400" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">No plants found</h2>
              <p className="text-gray-600 mb-8 max-w-md mx-auto">
                No plants match your search for "{searchTerm}". Try a different search term.
              </p>
              <button
                onClick={handleClearSearch}
                className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
              >
                Clear Search
              </button>
            </div>
          ) : plants.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-24 h-24 mx-auto mb-6 bg-green-100 rounded-full flex items-center justify-center">
              <span className="text-4xl">🌱</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Your garden awaits</h2>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              Begin nurturing relationships by planting your first seed. 
              Each person in your life can grow and flourish with care.
            </p>
            <button
              onClick={() => setShowAddPlant(true)}
              className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
            >
              <Plus className="w-5 h-5" />
              Sow Your First Seed
            </button>
          </div>
          ) : null
        ) : (
          <>
            {/* Plants Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredPlants.map((plant) => (
                <PlantCard
                  key={plant.id}
                  plant={plant}
                  urgency={getPlantUrgency(plant)}
                  urgencyColor={getUrgencyColor(getPlantUrgency(plant))}
                  getPlantState={getPlantState}
                  onTend={() => handleTendPlant(plant.id, plant.name)}
                  onWater={() => handleWaterPlant(plant.id, plant.name)}
                  onViewDetails={() => handleViewDetails(plant.id)}
                  onRemove={() => removePlant(plant.id)}
                  onShowConfirmation={handleShowConfirmation}
                  onScheduleCare={handleScheduleCare}
                  onEditPlant={handleEditPlant}
                  onShowMap={(location) => setMapModal({ isOpen: true, location, plantName: plant.name })}
                  imageRefreshKey={imageRefreshKey}
                />
              ))}
            </div>

            {/* Floating Action Button */}
            <button
              onClick={() => setShowAddPlant(true)}
              className="fixed bottom-6 right-6 w-14 h-14 bg-green-600 hover:bg-green-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center"
            >
              <Plus className="w-6 h-6" />
            </button>
          </>
        )}
      </main>

      {/* Modals */}
      <AddPlantModal
        isOpen={showAddPlant}
        onClose={() => setShowAddPlant(false)}
        onAdd={addPlant}
      />

      <EditPlantModal
        isOpen={editPlantModal.isOpen}
        onClose={() => {
          setEditPlantModal({ isOpen: false, plant: null });
          setImageRefreshKey(k => k + 1);
        }}
        plant={editPlantModal.plant}
        onUpdate={handleUpdatePlant}
      />

      <ActivityModal
        isOpen={activityModal.isOpen}
        onClose={() => setActivityModal(prev => ({ ...prev, isOpen: false }))}
        plantName={activityModal.plantName}
        activityType={activityModal.type}
        onSubmit={handleActivitySubmit}
      />

      <ConfirmationModal
        isOpen={confirmationModal.isOpen}
        onClose={() => setConfirmationModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={handleConfirmRemove}
        title="Remove Plant"
        message={`Are you sure you want to remove ${confirmationModal.plantName} from your garden? This action cannot be undone.`}
        confirmText="Remove Plant"
        cancelText="Keep Plant"
        type="danger"
      />

      <ScheduleCareModal
        isOpen={scheduleCareModal.isOpen}
        onClose={() => setScheduleCareModal(prev => ({ ...prev, isOpen: false }))}
        plantName={scheduleCareModal.plantName}
        onSchedule={handleScheduleSubmit}
      />

      <SlidingMenu
        isOpen={showSlidingMenu}
        onClose={() => setShowSlidingMenu(false)}
        onDownloadGardenKey={downloadGardenKey}
        plants={plants}
        onBulkSunlight={handleBulkSunlight}
      />
      
      {/* Search Overlay */}
      {showSearchOverlay && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <Search className="w-5 h-5 text-green-600" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900">Search Plants</h2>
              </div>
              <button
                onClick={() => setShowSearchOverlay(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Form */}
            <form onSubmit={handleSearchSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Search by name, phone, or description
                </label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                  placeholder="Enter search term..."
                  autoFocus
                />
              </div>
              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowSearchOverlay(false)}
                  className="flex-1 px-4 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium transition-colors"
                >
                  Search
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Debug Query Overlay */}
      {showDebugOverlay && import.meta.env.DEV && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <Bug className="w-5 h-5 text-red-600" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900">Debug Query</h2>
              </div>
              <button
                onClick={() => setShowDebugOverlay(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleDebugSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  AlaSQL Query
                </label>
                <textarea
                  value={debugQuery}
                  onChange={(e) => setDebugQuery(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent transition-colors resize-none font-mono text-sm"
                  rows={4}
                  placeholder="SELECT * FROM plants"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Results will be logged to the console
                </p>
              </div>
              
              {/* Quick Query Buttons */}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setDebugQuery('SELECT * FROM plants')}
                  className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded-lg transition-colors"
                >
                  All Plants
                </button>
                <button
                  type="button"
                  onClick={() => setDebugQuery('SHOW TABLES')}
                  className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded-lg transition-colors"
                >
                  Show Tables
                </button>
                <button
                  type="button"
                  onClick={() => setDebugQuery('SELECT * FROM tendings ORDER BY datetime DESC LIMIT 10')}
                  className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded-lg transition-colors"
                >
                  Recent Tendings
                </button>
              </div>
              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowDebugOverlay(false)}
                  className="flex-1 px-4 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors"
                >
                  Execute Query
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Map Overlay */}
      {mapModal.isOpen && mapModal.location && (
        <MapOverlay
          location={mapModal.location}
          plantName={mapModal.plantName}
          onClose={() => setMapModal({ isOpen: false, location: null, plantName: '' })}
        />
      )}

      <ToastContainer
        toasts={toasts}
        onRemoveToast={removeToast}
      />
    </div>
  );
};