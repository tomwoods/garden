import React, { useState } from 'react';
import { X, Users, Copy, Check, Share2 } from 'lucide-react';
import QRCode from 'qrcode';
import { createGardenInvite } from '../lib/sharedGardenSyncService';

interface InviteToSharedGardenModalProps {
  isOpen: boolean;
  onClose: () => void;
  gardenId: string;
  gardenName: string;
  user: {
    userId: string;
    signingPrivateKey: string;
  };
}

type Step = 'form' | 'generating' | 'ready';

export const InviteToSharedGardenModal: React.FC<InviteToSharedGardenModalProps> = ({
  isOpen,
  onClose,
  gardenId,
  gardenName,
  user,
}) => {
  const [inviteeName, setInviteeName] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [inviteUrl, setInviteUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    if (!inviteeName.trim()) return;
    setError('');
    setStep('generating');

    try {
      const result = await createGardenInvite(gardenId, inviteeName.trim(), user);
      if (!result) {
        setError('Could not create the invitation. Please try again.');
        setStep('form');
        return;
      }

      setInviteUrl(result.inviteUrl);

      const dataUrl = await QRCode.toDataURL(result.inviteUrl, {
        width: 240,
        margin: 2,
        color: { dark: '#166534', light: '#f0fdf4' },
      });
      setQrDataUrl(dataUrl);
      setStep('ready');
    } catch {
      setError('Something went wrong. Please try again.');
      setStep('form');
    }
  };

  const shareText = `You have been invited to join the "${gardenName}" shared garden. To join, open this link:\n\n${inviteUrl}`;

  const handleCopyUrl = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyMessage = async () => {
    await navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setStep('form');
    setInviteeName('');
    setInviteUrl('');
    setQrDataUrl('');
    setError('');
    setCopied(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-green-100 rounded-full flex items-center justify-center">
              <Users className="w-4 h-4 text-green-700" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Invite Gardener</h2>
              <p className="text-xs text-gray-500">to {gardenName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5">
          {step === 'form' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 leading-relaxed">
                Generate a personal invitation link for a specific gardener. The link expires in 7 days.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Gardener's name or nickname
                </label>
                <input
                  type="text"
                  value={inviteeName}
                  onChange={e => setInviteeName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors text-sm"
                  placeholder="How they'll appear to others"
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleGenerate(); }}
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={!inviteeName.trim()}
                  className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl font-medium transition-colors text-sm"
                >
                  Generate link
                </button>
              </div>
            </div>
          )}

          {step === 'generating' && (
            <div className="flex flex-col items-center py-8 gap-3">
              <div className="w-10 h-10 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500">Preparing secure link...</p>
            </div>
          )}

          {step === 'ready' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500 text-center">Invitation for <span className="font-medium text-gray-700">{inviteeName}</span></p>

              {qrDataUrl && (
                <div className="flex justify-center">
                  <div className="bg-green-50 rounded-2xl p-4 inline-block">
                    <img src={qrDataUrl} alt="Invite QR code" className="w-48 h-48 rounded-xl" />
                  </div>
                </div>
              )}

              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1">Share message</p>
                <p className="text-xs text-gray-700 leading-relaxed break-all">{shareText}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleCopyUrl}
                  className="flex items-center justify-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium py-2.5 px-3 rounded-xl transition-colors text-sm"
                >
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  Copy link
                </button>
                <button
                  onClick={handleCopyMessage}
                  className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 px-3 rounded-xl transition-colors text-sm"
                >
                  <Share2 className="w-4 h-4" />
                  Copy message
                </button>
              </div>

              <p className="text-xs text-gray-400 text-center">Expires in 7 days if unclaimed.</p>

              <button
                onClick={handleReset}
                className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors py-1"
              >
                Invite another gardener
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
