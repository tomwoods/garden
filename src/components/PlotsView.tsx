import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Users } from 'lucide-react';
import { PlotCard } from './PlotCard';
import { AddEditPlotModal } from './AddEditPlotModal';
import { ToastContainer } from './ToastContainer';
import { DatabaseService, type PlotWithMembers } from '../lib/database';
import { useToast } from '../hooks/useToast';

export const PlotsView: React.FC = () => {
  const navigate = useNavigate();
  const [plots, setPlots] = useState<PlotWithMembers[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddPlotModal, setShowAddPlotModal] = useState(false);
  const { toasts, success, error, removeToast } = useToast();

  useEffect(() => {
    loadPlots();
  }, []);

  const loadPlots = async () => {
    setIsLoading(true);
    try {
      const allPlots = await DatabaseService.getPlots();
      const plotsWithMembers = await Promise.all(
        allPlots.map(async (plot) => {
          const plotWithMembers = await DatabaseService.getPlotWithMembers(plot.id);
          return plotWithMembers!;
        })
      );
      setPlots(plotsWithMembers);
    } catch (err) {
      console.error('Failed to load plots:', err);
      error('Failed to load plots', 'Please try again');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    navigate('/');
  };

  const handleCreatePlot = async (plotData: { name: string; description?: string }) => {
    try {
      await DatabaseService.createPlot(plotData);
      await loadPlots();
      success('Plot created', `${plotData.name} has been created`);
    } catch (err) {
      console.error('Failed to create plot:', err);
      error('Failed to create plot', 'Please try again');
    }
  };

  const handlePlotClick = (plotId: string) => {
    navigate(`/plots/${plotId}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 animate-spin">
            <img src="/plots_icon.svg" alt="Loading plots" className="w-16 h-16" style={{ filter: 'invert(25%) sepia(85%) saturate(1500%) hue-rotate(90deg) brightness(95%) contrast(105%)' }} />
          </div>
          <p className="text-gray-600">Loading plots...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <img src="/plots_icon.svg" alt="Plots" className="w-6 h-6" style={{ filter: 'invert(25%) sepia(85%) saturate(1500%) hue-rotate(90deg) brightness(95%) contrast(105%)' }} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Manage Plots</h1>
                <p className="text-sm text-gray-600">
                  {plots.length} {plots.length === 1 ? 'plot' : 'plots'} created
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {plots.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-24 h-24 mx-auto mb-6 bg-green-100 rounded-full flex items-center justify-center">
              <img src="/plots_icon.svg" alt="No plots" className="w-12 h-12" style={{ filter: 'invert(25%) sepia(85%) saturate(1500%) hue-rotate(90deg) brightness(95%) contrast(105%)' }} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No plots yet</h2>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              Create your first plot to group plants together and log activities for multiple plants at once.
            </p>
            <button
              onClick={() => setShowAddPlotModal(true)}
              className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
            >
              <Plus className="w-5 h-5" />
              Create First Plot
            </button>
          </div>
        ) : (
          <>
            {/* Plots Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {plots.map((plot) => (
                <PlotCard
                  key={plot.id}
                  plot={plot}
                  onClick={() => handlePlotClick(plot.id)}
                />
              ))}
            </div>

            {/* Floating Action Button */}
            <button
              onClick={() => setShowAddPlotModal(true)}
              className="fixed bottom-6 right-6 w-14 h-14 bg-green-600 hover:bg-green-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center"
            >
              <Plus className="w-6 h-6" />
            </button>
          </>
        )}
      </main>

      {/* Modals */}
      <AddEditPlotModal
        isOpen={showAddPlotModal}
        onClose={() => setShowAddPlotModal(false)}
        onSave={handleCreatePlot}
      />

      <ToastContainer
        toasts={toasts}
        onRemoveToast={removeToast}
      />
    </div>
  );
};