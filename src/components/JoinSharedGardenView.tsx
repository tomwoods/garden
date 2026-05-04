import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Leaf, Download, AlertTriangle } from 'lucide-react';
import { claimGardenInvite, downloadGardenKeyFile } from '../lib/sharedGardenSyncService';

function getUser() {
  try {
    const raw = localStorage.getItem('garden-key');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

type JoinStep = 'loading' | 'preview' | 'joining' | 'done' | 'error';

export const JoinSharedGardenView: React.FC = () => {
  const { gardenId: sharedGardenId } = useParams<{ gardenId: string }>();
  const navigate = useNavigate();
  const user = getUser();

  const [step, setStep] = useState<JoinStep>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [gardenName, setGardenName] = useState('');
  const [joinedGardenId, setJoinedGardenId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [shortCode, setShortCode] = useState('');
  const [ephemeralKey, setEphemeralKey] = useState('');

  useEffect(() => {
    // Parse the URL fragment — never sent to server
    const fragment = window.location.hash.slice(1);
    const params = new URLSearchParams(fragment);
    const gate = params.get('gate');
    const key = params.get('key');

    // Clear the fragment from browser history immediately
    window.history.replaceState({}, '', window.location.pathname + window.location.search);

    if (!gate || !key) {
      setErrorMessage('This invitation link is incomplete or has already been used.');
      setStep('error');
      return;
    }

    setShortCode(gate);
    setEphemeralKey(decodeURIComponent(key));
    setStep('preview');
  }, []);

  const handleJoin = async () => {
    if (!displayName.trim() || !shortCode || !ephemeralKey || !sharedGardenId || !user) return;
    setStep('joining');

    try {
      const result = await claimGardenInvite(
        sharedGardenId,
        shortCode,
        ephemeralKey,
        displayName.trim(),
        user
      );

      if (!result) {
        setErrorMessage('The invitation could not be claimed. It may have expired or already been used.');
        setStep('error');
        return;
      }

      setGardenName(result.gardenName);
      setJoinedGardenId(result.gardenId);
      setStep('done');
    } catch {
      setErrorMessage('Something went wrong while joining. Please try again.');
      setStep('error');
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">No garden yet</h2>
          <p className="text-sm text-gray-600 mb-4">You need a personal garden before joining a shared one.</p>
          <button
            onClick={() => navigate('/')}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 rounded-xl transition-colors text-sm"
          >
            Set up your garden
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="bg-green-600 px-6 py-6 text-center">
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <Leaf className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-lg font-semibold text-white">Join Shared Garden</h1>
          <p className="text-sm text-green-100 mt-1">You have been invited to tend together</p>
        </div>

        <div className="px-6 py-5">
          {step === 'loading' && (
            <div className="flex flex-col items-center py-8 gap-3">
              <div className="w-10 h-10 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500">Verifying invitation...</p>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 leading-relaxed">
                You have been invited to join a shared garden. Enter your name as it will appear to the other gardeners.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Your name in this garden</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors text-sm"
                  placeholder="How others will see you"
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleJoin(); }}
                />
              </div>
              <button
                onClick={handleJoin}
                disabled={!displayName.trim()}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium py-2.5 rounded-xl transition-colors text-sm"
              >
                Join garden
              </button>
              <button
                onClick={() => navigate('/')}
                className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors py-1"
              >
                Cancel
              </button>
            </div>
          )}

          {step === 'joining' && (
            <div className="flex flex-col items-center py-8 gap-3">
              <div className="w-10 h-10 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500">Joining garden...</p>
            </div>
          )}

          {step === 'done' && (
            <div className="space-y-4">
              <div className="bg-green-50 rounded-xl p-4 text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Leaf className="w-6 h-6 text-green-700" />
                </div>
                <p className="font-medium text-green-900 text-sm">Welcome to {gardenName}</p>
                <p className="text-xs text-green-700 mt-1">Save the garden key to restore your access on other devices.</p>
              </div>

              <button
                onClick={() => downloadGardenKeyFile(joinedGardenId)}
                className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium py-2.5 px-4 rounded-xl transition-colors text-sm"
              >
                <Download className="w-4 h-4" />
                Download garden key
              </button>

              <button
                onClick={() => navigate(`/shared-garden/${joinedGardenId}`)}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 rounded-xl transition-colors text-sm"
              >
                Open garden
              </button>
            </div>
          )}

          {step === 'error' && (
            <div className="space-y-4">
              <div className="bg-red-50 rounded-xl p-4 text-center">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <p className="text-sm text-red-800 leading-relaxed">{errorMessage}</p>
              </div>
              <button
                onClick={() => navigate('/')}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 rounded-xl transition-colors text-sm"
              >
                Go to my garden
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
