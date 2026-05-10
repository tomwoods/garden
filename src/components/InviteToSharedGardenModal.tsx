import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Users, Copy, Check, Share2, ExternalLink } from 'lucide-react';
import QRCode from 'qrcode';
import { createGardenInvite } from '../lib/sharedGardenSyncService';
import dayjs from 'dayjs';

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

async function copyRichLink(url: string, linkText: string, plainText: string): Promise<void> {
  try {
    const html = `<a href="${url}">${linkText}</a>`;
    const item = new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([plainText], { type: 'text/plain' }),
    });
    await navigator.clipboard.write([item]);
  } catch {
    await navigator.clipboard.writeText(plainText);
  }
}

export const InviteToSharedGardenModal: React.FC<InviteToSharedGardenModalProps> = ({
  isOpen,
  onClose,
  gardenId,
  gardenName,
  user,
}) => {
  const { t } = useTranslation('modals');
  const [inviteeName, setInviteeName] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [inviteUrl, setInviteUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [error, setError] = useState('');
  const expiryDate = dayjs().add(7, 'day').format('MMM D');

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

  const linkLabel = `Join "${gardenName}"`;
  const plainMessage = `You have been invited to join the "${gardenName}" shared garden. To join, open this link:\n\n${inviteUrl}`;
  const htmlMessage = `You have been invited to join the <strong>${gardenName}</strong> shared garden. To join, open this link: <a href="${inviteUrl}">Join "${gardenName}"</a>`;

  const handleCopyUrl = async () => {
    await copyRichLink(inviteUrl, linkLabel, inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyMessage = async () => {
    await copyRichLink(inviteUrl, linkLabel, plainMessage);
    // Also try writing the rich message version
    try {
      const item = new ClipboardItem({
        'text/html': new Blob([htmlMessage], { type: 'text/html' }),
        'text/plain': new Blob([plainMessage], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
    } catch {
      await navigator.clipboard.writeText(plainMessage);
    }
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 2000);
  };

  const handleNativeShare = async () => {
    try {
      await navigator.share({ title: linkLabel, text: plainMessage, url: inviteUrl });
    } catch {
      // User cancelled or API not available — fall back to copy
      await handleCopyMessage();
    }
  };

  const handleReset = () => {
    setStep('form');
    setInviteeName('');
    setInviteUrl('');
    setQrDataUrl('');
    setError('');
    setCopiedLink(false);
    setCopiedMessage(false);
  };

  if (!isOpen) return null;

  const canNativeShare = typeof navigator.share === 'function';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[90vh]">
        {/* Header — fixed */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-green-100 rounded-full flex items-center justify-center">
              <Users className="w-4 h-4 text-green-700" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">{t('inviteToSharedGarden.title')}</h2>
              <p className="text-xs text-gray-500">{t('inviteToSharedGarden.subtitle', { gardenName })}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="px-6 py-5 overflow-y-auto">
          {step === 'form' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 leading-relaxed">
                {t('inviteToSharedGarden.intro')}
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('inviteToSharedGarden.nameLabel')}
                </label>
                <input
                  type="text"
                  value={inviteeName}
                  onChange={e => setInviteeName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors text-sm"
                  placeholder={t('inviteToSharedGarden.namePlaceholder')}
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
                  {t('inviteToSharedGarden.cancelBtn')}
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={!inviteeName.trim()}
                  className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl font-medium transition-colors text-sm"
                >
                  {t('inviteToSharedGarden.generateBtn')}
                </button>
              </div>
            </div>
          )}

          {step === 'generating' && (
            <div className="flex flex-col items-center py-8 gap-3">
              <div className="w-10 h-10 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500">{t('inviteToSharedGarden.generating')}</p>
            </div>
          )}

          {step === 'ready' && (
            <div className="space-y-4">
              {/* QR code — always visible at top */}
              {qrDataUrl && (
                <div className="flex flex-col items-center gap-2">
                  <div className="bg-green-50 rounded-2xl p-4 inline-block">
                    <img src={qrDataUrl} alt="Invite QR code" className="w-48 h-48 rounded-xl" />
                  </div>
                  <p className="text-xs text-gray-500">{t('inviteToSharedGarden.invitationFor', { name: inviteeName })}</p>
                </div>
              )}

              {/* Link preview — shows a clean hyperlink label, not the raw URL */}
              <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-green-600 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 mb-0.5">{t('inviteToSharedGarden.shareMessage')}</p>
                  <p className="text-sm font-medium text-green-700 truncate">{linkLabel}</p>
                </div>
              </div>

              {/* Action buttons */}
              {canNativeShare ? (
                <div className="space-y-2">
                  <button
                    onClick={handleNativeShare}
                    className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 px-3 rounded-xl transition-colors text-sm"
                  >
                    <Share2 className="w-4 h-4" />
                    {t('inviteToSharedGarden.copyMessage')}
                  </button>
                  <button
                    onClick={handleCopyUrl}
                    className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium py-2.5 px-3 rounded-xl transition-colors text-sm"
                  >
                    {copiedLink ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    {copiedLink ? t('inviteToSharedGarden.copied') : t('inviteToSharedGarden.copyLink')}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleCopyUrl}
                    className="flex items-center justify-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium py-2.5 px-3 rounded-xl transition-colors text-sm"
                  >
                    {copiedLink ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    {copiedLink ? t('inviteToSharedGarden.copied') : t('inviteToSharedGarden.copyLink')}
                  </button>
                  <button
                    onClick={handleCopyMessage}
                    className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 px-3 rounded-xl transition-colors text-sm"
                  >
                    {copiedMessage ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                    {copiedMessage ? t('inviteToSharedGarden.copied') : t('inviteToSharedGarden.copyMessage')}
                  </button>
                </div>
              )}

              <p className="text-xs text-gray-400 text-center">
                {t('inviteToSharedGarden.linkExpiry')} {expiryDate}
              </p>

              <button
                onClick={handleReset}
                className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors py-1"
              >
                {t('inviteToSharedGarden.inviteAnother')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
