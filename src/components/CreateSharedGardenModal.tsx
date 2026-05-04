import React, { useState } from 'react';
import { X, Leaf, Download } from 'lucide-react';
import { createSharedGarden, downloadGardenKeyFile } from '../lib/sharedGardenSyncService';

interface CreateSharedGardenModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
    userId: string;
    signingPrivateKey: string;
  };
  onCreated: (gardenId: string) => void;
}

export const CreateSharedGardenModal: React.FC<CreateSharedGardenModalProps> = ({
  isOpen,
  onClose,
  user,
  onCreated,
}) => {
  const [gardenName, setGardenName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [step, setStep] = useState<'form' | 'creating' | 'done'>('form');
  const [createdGardenId, setCreatedGardenId] = useState('');
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!gardenName.trim() || !displayName.trim()) return;
    setError('');
    setStep('creating');

    try {
      const result = await createSharedGarden(gardenName.trim(), displayName.trim(), user);
      if (!result) {
        setError('Could not create the shared garden. Please try again.');
        setStep('form');
        return;
      }
      setCreatedGardenId(result.gardenId);
      setStep('done');
    } catch {
      setError('Something went wrong. Please try again.');
      setStep('form');
    }
  };

  const handleDownloadKey = () => {
    downloadGardenKeyFile(createdGardenId);
  };

  const handleFinish = () => {
    onCreated(createdGardenId);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-green-100 rounded-full flex items-center justify-center">
              <Leaf className="w-4 h-4 text-green-700" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">New Shared Garden</h2>
              <p className="text-xs text-gray-500">A garden tended together</p>
            </div>
          </div>
          {step !== 'creating' && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="px-6 py-5">
          {step === 'form' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Garden name</label>
                <input
                  type="text"
                  value={gardenName}
                  onChange={e => setGardenName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors text-sm"
                  placeholder="e.g. Ruhi Study Circle"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Your name in this garden</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors text-sm"
                  placeholder="How others will see you"
                />
                <p className="text-xs text-gray-400 mt-1">Visible to all members of this garden.</p>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!gardenName.trim() || !displayName.trim()}
                  className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl font-medium transition-colors text-sm"
                >
                  Create garden
                </button>
              </div>
            </div>
          )}

          {step === 'creating' && (
            <div className="flex flex-col items-center py-8 gap-3">
              <div className="w-10 h-10 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500">Preparing your shared garden...</p>
            </div>
          )}

          {step === 'done' && (
            <div className="space-y-4">
              <div className="bg-green-50 rounded-xl p-4 text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Leaf className="w-6 h-6 text-green-700" />
                </div>
                <p className="font-medium text-green-900 text-sm">{gardenName} is ready</p>
                <p className="text-xs text-green-700 mt-1">Save your garden key to restore access later.</p>
              </div>

              <button
                onClick={handleDownloadKey}
                className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium py-2.5 px-4 rounded-xl transition-colors text-sm"
              >
                <Download className="w-4 h-4" />
                Download garden key
              </button>

              <button
                onClick={handleFinish}
                className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 px-4 rounded-xl transition-colors text-sm"
              >
                Open garden
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
