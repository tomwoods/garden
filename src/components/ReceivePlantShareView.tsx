import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Leaf, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import { DatabaseService, addSharedPlantRef } from '../lib/database';
import { decryptWithECDHKey } from '../lib/cryptoService';
import { claimPlantShare, pullSharedPlantPreview } from '../lib/sharedBackupService';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from './ToastContainer';

type Step = 'loading' | 'preview' | 'adding' | 'done' | 'error';

export const ReceivePlantShareView: React.FC = () => {
  const { plantId } = useParams<{ plantId: string }>();
  const navigate = useNavigate();
  const { toasts, success, error: showError, removeToast } = useToast();

  const [step, setStep] = useState<Step>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [plantName, setPlantName] = useState('');
  const [plantDescription, setPlantDescription] = useState('');
  const [shareMode, setShareMode] = useState<'view' | 'co-edit'>('view');

  // State kept in refs to avoid re-running effect on re-render
  const [pendingData, setPendingData] = useState<{
    sharedPlantId: string;
    plantPrivateKeyBase64: string;
    plantPublicKeyBase64: string;
    shareMode: string;
  } | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        // 1. Parse the URL fragment — never sent to the server
        const fragment = window.location.hash.slice(1); // strip #
        const params = new URLSearchParams(fragment);
        const shortCode = params.get('gate');
        const ephemeralPrivKeyBase64 = params.get('key');

        if (!shortCode || !ephemeralPrivKeyBase64 || !plantId) {
          setErrorMessage('This link appears to be incomplete or has already been used.');
          setStep('error');
          return;
        }

        // 2. Clear the fragment from browser history so the ephemeral key is not visible
        history.replaceState(null, '', window.location.pathname);

        // 3. Load the local user
        const gardenKey = localStorage.getItem('garden-key');
        if (!gardenKey) {
          setErrorMessage('Please open your garden first before following a share link.');
          setStep('error');
          return;
        }
        const user = JSON.parse(gardenKey);

        // 4. Claim the share — this identifies Gardener B and returns the encrypted plant key
        const claimed = await claimPlantShare(shortCode, user);
        if (!claimed) {
          setErrorMessage('This share link has expired or has already been used.');
          setStep('error');
          return;
        }

        // 5. Decrypt the plant private key using the ephemeral ECDH key from the URL fragment (local-only)
        const encryptedPlantKey = JSON.parse(claimed.encryptedPlantKey);
        const plantPrivateKeyBase64 = await decryptWithECDHKey(encryptedPlantKey, decodeURIComponent(ephemeralPrivKeyBase64));

        // 6. Pull the shared plant snapshot to preview
        const shareObj = await pullSharedPlantPreview(claimed.sharedPlantId, plantPrivateKeyBase64, user);
        if (!shareObj) {
          setErrorMessage('Could not retrieve the shared plant. Please ask the sender to try again.');
          setStep('error');
          return;
        }

        const { snapshot } = shareObj;
        setPlantName(snapshot.plant.name);
        setPlantDescription(snapshot.plant.description || '');
        setShareMode(claimed.mode === 'co-edit' ? 'co-edit' : 'view');

        // We need the plant public key to store in the ref — fetch from shared_plants via supabase client
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const spRes = await fetch(
          `${supabaseUrl}/rest/v1/shared_plants?id=eq.${claimed.sharedPlantId}&select=plant_public_key`,
          { headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` } }
        );
        const spData = await spRes.json();
        const plantPublicKeyBase64 = spData?.[0]?.plant_public_key ?? '';

        setPendingData({
          sharedPlantId: claimed.sharedPlantId,
          plantPrivateKeyBase64,
          plantPublicKeyBase64,
          shareMode: claimed.mode,
        });
        setStep('preview');
      } catch (err) {
        console.error('Receive plant share error:', err);
        setErrorMessage('Something went wrong. Please ask the sender to generate a new link.');
        setStep('error');
      }
    };

    run();
  }, [plantId]);

  const handleConfirm = async () => {
    if (!pendingData || !plantId) return;
    setStep('adding');

    try {
      // Pull a fresh copy to apply
      const gardenKey = localStorage.getItem('garden-key');
      if (!gardenKey) throw new Error('No garden key');
      const user = JSON.parse(gardenKey);

      const shareObj = await pullSharedPlantPreview(
        pendingData.sharedPlantId,
        pendingData.plantPrivateKeyBase64,
        user
      );
      if (!shareObj) throw new Error('Could not pull plant data');

      // Apply the snapshot to local DB
      await DatabaseService.applyPlantSnapshot(shareObj.snapshot);

      // Store the plant private key
      localStorage.setItem(`plant_priv_${plantId}`, pendingData.plantPrivateKeyBase64);

      // Register the shared plant ref
      addSharedPlantRef({
        plantId,
        sharedPlantId: pendingData.sharedPlantId,
        role: pendingData.shareMode === 'co-edit' ? 'co-tender' : 'viewer',
        ownedByMe: false,
        plantPublicKeyBase64: pendingData.plantPublicKeyBase64,
      });

      // Tag the plant as shared in additional_info
      const plant = await DatabaseService.getPlant(plantId);
      if (plant) {
        let info: Record<string, unknown> = {};
        try { if (plant.additional_info) info = JSON.parse(plant.additional_info); } catch {}
        info.is_shared = true;
        info.share_role = pendingData.shareMode === 'co-edit' ? 'co-tender' : 'viewer';
        await DatabaseService.updatePlant(plantId, { additional_info: JSON.stringify(info) });
      }

      success('Plant added', `${shareObj.snapshot.plant.name} has been planted in your garden`);
      setStep('done');

      setTimeout(() => navigate('/'), 1800);
    } catch (err) {
      console.error('Failed to add shared plant:', err);
      showError('Could not add plant', 'Please try again.');
      setStep('preview');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">

        {step === 'loading' && (
          <div className="flex flex-col items-center py-8 gap-4">
            <div className="w-12 h-12 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">Verifying share link...</p>
          </div>
        )}

        {step === 'preview' && (
          <>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <Leaf className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-gray-900">You've been invited</h1>
                <p className="text-xs text-gray-500">
                  {shareMode === 'co-edit' ? 'Co-tend this plant' : 'View this plant'}
                </p>
              </div>
            </div>

            <div className="bg-green-50 rounded-xl p-4 mb-5">
              <p className="font-semibold text-gray-900 text-lg">{plantName}</p>
              {plantDescription && (
                <p className="text-sm text-gray-600 mt-1 leading-relaxed">{plantDescription}</p>
              )}
              <span className={`inline-block mt-3 text-xs font-medium px-2 py-0.5 rounded-full ${
                shareMode === 'co-edit'
                  ? 'bg-green-200 text-green-800'
                  : 'bg-gray-200 text-gray-600'
              }`}>
                {shareMode === 'co-edit' ? 'Can tend' : 'View only'}
              </span>
            </div>

            <p className="text-xs text-gray-500 mb-5 leading-relaxed">
              Adding this plant will sync it to your garden. Your activities will be visible to
              others with access to this shared plant.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => navigate('/')}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Decline
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 px-4 py-2.5 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
              >
                Add to garden
              </button>
            </div>
          </>
        )}

        {step === 'adding' && (
          <div className="flex flex-col items-center py-8 gap-4">
            <div className="w-12 h-12 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">Planting in your garden...</p>
          </div>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center py-8 gap-4">
            <CheckCircle className="w-14 h-14 text-green-500" />
            <p className="text-base font-semibold text-gray-900">{plantName} has been planted</p>
            <p className="text-sm text-gray-500">Returning to your garden...</p>
          </div>
        )}

        {step === 'error' && (
          <div className="flex flex-col items-center py-6 gap-4">
            <AlertCircle className="w-12 h-12 text-red-400" />
            <p className="text-sm text-gray-700 text-center leading-relaxed">{errorMessage}</p>
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 text-sm text-green-700 hover:text-green-800 font-medium transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Return to garden
            </button>
          </div>
        )}
      </div>

      <ToastContainer toasts={toasts} onRemoveToast={removeToast} />
    </div>
  );
};
