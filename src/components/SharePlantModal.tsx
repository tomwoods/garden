import React, { useState, useEffect, useRef } from 'react';
import { X, Share2, Download, Users, Eye, Pencil, Copy, Check, QrCode, Leaf, TreePine } from 'lucide-react';
import QRCode from 'qrcode';
import type { Plant } from '../lib/database';
import { DatabaseService, addSharedPlantRef, getSharedPlantRefs } from '../lib/database';
import {
  generateEphemeralRSAKeyPair,
  encryptWithPublicKey,
  exportCryptoKey,
} from '../lib/cryptoService';
import { generateRSAKeyPair } from '../lib/cryptoService';
import { createSharedPlant, createShareClaim } from '../lib/sharedBackupService';
import { getSharedGardenRefs } from '../lib/sharedGardenDatabase';
import { linkPlantToSharedGarden } from '../lib/plantLinkService';

interface SharePlantModalProps {
  isOpen: boolean;
  onClose: () => void;
  plant: Plant;
  user: {
    userId: string;
    publicKey: string;
    privateKey: string;
    signingPublicKey: string;
    signingPrivateKey: string;
  };
}

type Tab = 'contact' | 'share' | 'garden';
type ShareMode = 'view' | 'co-edit';
type ShareStep = 'configure' | 'generating' | 'ready';

function generateVCard(plant: Plant, thumbnailBase64?: string): string {
  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${plant.name}`,
  ];
  if (plant.phone) lines.push(`TEL;TYPE=CELL:${plant.phone}`);
  if (plant.email) lines.push(`EMAIL:${plant.email}`);
  if (plant.description) {
    // Escape commas, semicolons and newlines per vCard spec
    const escaped = plant.description
      .replace(/\\/g, '\\\\')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;')
      .replace(/\n/g, '\\n');
    lines.push(`NOTE:${escaped}`);
  }
  if (thumbnailBase64) {
    // Strip the data URL prefix if present
    const base64 = thumbnailBase64.includes(',') ? thumbnailBase64.split(',')[1] : thumbnailBase64;
    lines.push(`PHOTO;ENCODING=b;TYPE=JPEG:${base64}`);
  }
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

export const SharePlantModal: React.FC<SharePlantModalProps> = ({
  isOpen,
  onClose,
  plant,
  user,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('contact');
  const [shareMode, setShareMode] = useState<ShareMode>('view');
  const [shareStep, setShareStep] = useState<ShareStep>('configure');
  const [shareUrl, setShareUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [gardenRefs, setGardenRefs] = useState(() => getSharedGardenRefs());
  const [selectedGardenId, setSelectedGardenId] = useState('');
  const [gardenLinkStep, setGardenLinkStep] = useState<'select' | 'linking' | 'done'>('select');
  const [gardenLinkError, setGardenLinkError] = useState('');

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setActiveTab('contact');
      setShareStep('configure');
      setShareUrl('');
      setQrDataUrl('');
      setError('');
      setCopied(false);
      const refs = getSharedGardenRefs();
      setGardenRefs(refs);
      setSelectedGardenId(refs.length > 0 ? refs[0].gardenId : '');
      setGardenLinkStep('select');
      setGardenLinkError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleVCardDownload = async () => {
    // Try to get cached thumbnail
    const images = DatabaseService.getImagesForPlant(plant.id);
    let thumbnailBase64: string | undefined;
    if (images.length > 0) {
      // images[0] is already a data URL — extract base64
      const dataUrl = images[0];
      thumbnailBase64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    }

    const vcf = generateVCard(plant, thumbnailBase64);
    const blob = new Blob([vcf], { type: 'text/vcard' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${plant.name.replace(/\s+/g, '_')}.vcf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleGenerateShareLink = async () => {
    setError('');
    setShareStep('generating');

    try {
      // Check if this plant is already shared — if so, reuse existing plant key
      const existingRef = getSharedPlantRefs().find(r => r.plantId === plant.id && r.ownedByMe);

      let plantPublicKeyBase64: string;
      let plantPrivateKeyBase64: string;
      let sharedPlantId: string;

      if (existingRef) {
        // Reuse existing plant keys
        const storedPriv = localStorage.getItem(`plant_priv_${plant.id}`);
        if (!storedPriv) {
          setError('Plant key missing. Please re-share from scratch.');
          setShareStep('configure');
          return;
        }
        plantPrivateKeyBase64 = storedPriv;
        plantPublicKeyBase64 = existingRef.plantPublicKeyBase64;
        sharedPlantId = existingRef.sharedPlantId;
      } else {
        // Generate a new plant-specific RSA key pair
        const plantKeyPair = await generateRSAKeyPair();
        plantPublicKeyBase64 = await exportCryptoKey(plantKeyPair.encryptionKeys.publicKey, 'spki');
        plantPrivateKeyBase64 = await exportCryptoKey(plantKeyPair.encryptionKeys.privateKey, 'pkcs8');

        // Store plant private key locally
        localStorage.setItem(`plant_priv_${plant.id}`, plantPrivateKeyBase64);

        // Upload the initial encrypted snapshot to Supabase
        const result = await createSharedPlant(plant.id, shareMode, plantPublicKeyBase64, user);
        if (!result) {
          setError('Could not create shared record. Please try again.');
          setShareStep('configure');
          return;
        }
        sharedPlantId = result.sharedPlantId;

        // Register as owner in shared refs
        addSharedPlantRef({
          plantId: plant.id,
          sharedPlantId,
          role: 'owner',
          ownedByMe: true,
          plantPublicKeyBase64,
        });
      }

      // Generate ephemeral handshake key pair
      const ephemeral = await generateEphemeralRSAKeyPair();

      // Encrypt the plant private key with the ephemeral public key
      const encryptedPlantKey = JSON.stringify(
        await encryptWithPublicKey(plantPrivateKeyBase64, ephemeral.publicKeyBase64)
      );

      // Store the encrypted plant key in share_claims via edge function
      const claimResult = await createShareClaim(
        sharedPlantId,
        encryptedPlantKey,
        shareMode === 'co-edit' ? 'co-edit' : 'view',
        user
      );

      if (!claimResult) {
        setError('Could not create share claim. Please try again.');
        setShareStep('configure');
        return;
      }

      // Build the share URL — temp private key goes in fragment (never sent to server)
      const baseUrl = `${window.location.origin}/receive-plant-share/${plant.id}`;
      const fragment = `gate=${claimResult.shortCode}&key=${encodeURIComponent(ephemeral.privateKeyBase64)}`;
      const fullUrl = `${baseUrl}#${fragment}`;
      setShareUrl(fullUrl);

      // Generate QR code
      const dataUrl = await QRCode.toDataURL(fullUrl, {
        width: 240,
        margin: 2,
        color: { dark: '#166534', light: '#f0fdf4' },
      });
      setQrDataUrl(dataUrl);

      setShareStep('ready');
    } catch (err) {
      console.error('Share link generation failed:', err);
      setError('Something went wrong. Please try again.');
      setShareStep('configure');
    }
  };

  const shareText = `I want to share a plant with you. To add it to your garden, please visit this link:\n\n${shareUrl}`;

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyUrl = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLinkToGarden = async () => {
    if (!selectedGardenId) return;
    setGardenLinkError('');
    setGardenLinkStep('linking');
    try {
      const ref = gardenRefs.find(r => r.gardenId === selectedGardenId);
      const displayName = ref?.myDisplayName ?? '';
      await linkPlantToSharedGarden(plant.id, selectedGardenId, user.userId, displayName);
      setGardenLinkStep('done');
    } catch {
      setGardenLinkError('Could not add to garden. Please try again.');
      setGardenLinkStep('select');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-green-100 rounded-full flex items-center justify-center">
              <Share2 className="w-4 h-4 text-green-700" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Share {plant.name}</h2>
              <p className="text-xs text-gray-500">Choose how to share this plant</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => setActiveTab('contact')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'contact'
                ? 'text-green-700 border-b-2 border-green-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Export Contact
          </button>
          <button
            onClick={() => setActiveTab('share')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'share'
                ? 'text-green-700 border-b-2 border-green-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Share with Gardener
          </button>
          {gardenRefs.length > 0 && (
            <button
              onClick={() => setActiveTab('garden')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                activeTab === 'garden'
                  ? 'text-green-700 border-b-2 border-green-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Add to Garden
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-5">

          {/* Export Contact Tab */}
          {activeTab === 'contact' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 leading-relaxed">
                Download a vCard contact file with {plant.name}'s name, phone, email, and notes.
                Activity records are not included.
              </p>
              <div className="bg-green-50 rounded-xl p-4 flex items-start gap-3">
                <Leaf className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-green-800">
                  The contact file can be imported into any phone's contacts app or address book.
                </p>
              </div>
              <button
                onClick={handleVCardDownload}
                className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-xl transition-colors"
              >
                <Download className="w-4 h-4" />
                Download .vcf contact
              </button>
            </div>
          )}

          {/* Add to Shared Garden Tab */}
          {activeTab === 'garden' && (
            <div className="space-y-4">
              {gardenLinkStep === 'select' && (
                <>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Copy {plant.name}'s profile to a shared garden so others can tend together. Your activity records stay private.
                  </p>
                  <div className="space-y-2">
                    {gardenRefs.map(ref => (
                      <button
                        key={ref.gardenId}
                        onClick={() => setSelectedGardenId(ref.gardenId)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-colors ${
                          selectedGardenId === ref.gardenId
                            ? 'border-green-500 bg-green-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          selectedGardenId === ref.gardenId ? 'bg-green-200' : 'bg-gray-100'
                        }`}>
                          <TreePine className={`w-4 h-4 ${selectedGardenId === ref.gardenId ? 'text-green-700' : 'text-gray-500'}`} />
                        </div>
                        <div>
                          <p className={`text-sm font-medium ${selectedGardenId === ref.gardenId ? 'text-green-900' : 'text-gray-800'}`}>
                            {ref.gardenName}
                          </p>
                          {ref.disconnected && (
                            <p className="text-xs text-amber-600">Disconnected</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                  {gardenLinkError && (
                    <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{gardenLinkError}</p>
                  )}
                  <button
                    onClick={handleLinkToGarden}
                    disabled={!selectedGardenId}
                    className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium py-3 px-4 rounded-xl transition-colors"
                  >
                    <TreePine className="w-4 h-4" />
                    Add to shared garden
                  </button>
                </>
              )}

              {gardenLinkStep === 'linking' && (
                <div className="flex flex-col items-center py-8 gap-3">
                  <div className="w-10 h-10 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-gray-500">Adding to garden...</p>
                </div>
              )}

              {gardenLinkStep === 'done' && (
                <div className="space-y-4">
                  <div className="bg-green-50 rounded-xl p-4 text-center">
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <TreePine className="w-6 h-6 text-green-700" />
                    </div>
                    <p className="font-medium text-green-900 text-sm">{plant.name} added to the garden</p>
                    <p className="text-xs text-green-700 mt-1">Profile copied. Your activities remain private.</p>
                  </div>
                  <button
                    onClick={onClose}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 rounded-xl transition-colors text-sm"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Share with Gardener Tab */}
          {activeTab === 'share' && (
            <div className="space-y-4">

              {shareStep === 'configure' && (
                <>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Share {plant.name} with another gardener using a secure, end-to-end encrypted link.
                    The link expires in 7 days if unclaimed.
                  </p>

                  {/* Permission selector */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      Permission
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setShareMode('view')}
                        className={`flex items-center gap-2 p-3 rounded-xl border-2 text-left transition-colors ${
                          shareMode === 'view'
                            ? 'border-green-500 bg-green-50 text-green-800'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        <Eye className="w-4 h-4 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium">View only</p>
                          <p className="text-xs opacity-70">Can see, not tend</p>
                        </div>
                      </button>
                      <button
                        onClick={() => setShareMode('co-edit')}
                        className={`flex items-center gap-2 p-3 rounded-xl border-2 text-left transition-colors ${
                          shareMode === 'co-edit'
                            ? 'border-green-500 bg-green-50 text-green-800'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        <Pencil className="w-4 h-4 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium">Can tend</p>
                          <p className="text-xs opacity-70">Full co-care access</p>
                        </div>
                      </button>
                    </div>
                  </div>

                  {error && (
                    <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
                  )}

                  <button
                    onClick={handleGenerateShareLink}
                    className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-xl transition-colors"
                  >
                    <Users className="w-4 h-4" />
                    Generate share link
                  </button>
                </>
              )}

              {shareStep === 'generating' && (
                <div className="flex flex-col items-center py-8 gap-3">
                  <div className="w-10 h-10 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-gray-500">Preparing secure link...</p>
                </div>
              )}

              {shareStep === 'ready' && (
                <div className="space-y-4">
                  {/* QR Code */}
                  {qrDataUrl && (
                    <div className="flex justify-center">
                      <div className="bg-green-50 rounded-2xl p-4 inline-block">
                        <img src={qrDataUrl} alt="Share QR code" className="w-48 h-48 rounded-xl" />
                      </div>
                    </div>
                  )}

                  {/* Share text */}
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-500 mb-1">Share message</p>
                    <p className="text-sm text-gray-700 leading-relaxed break-all">{shareText}</p>
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
                      onClick={handleCopyLink}
                      className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 px-3 rounded-xl transition-colors text-sm"
                    >
                      <Share2 className="w-4 h-4" />
                      Copy message
                    </button>
                  </div>

                  <p className="text-xs text-gray-400 text-center">
                    This link expires in 7 days if unclaimed.
                  </p>

                  <button
                    onClick={() => {
                      setShareStep('configure');
                      setShareUrl('');
                      setQrDataUrl('');
                    }}
                    className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors py-1"
                  >
                    Generate a new link
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
