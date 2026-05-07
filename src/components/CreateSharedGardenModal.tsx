import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Leaf, Download, Upload, AlertCircle } from 'lucide-react';
import {
  createSharedGarden,
  downloadGardenKeyFile,
  restoreSharedGardenFromKeyFile,
  parseGardenKeyFile,
  type GardenKeyFileData,
} from '../lib/sharedGardenSyncService';
import { getSharedGardenRef } from '../lib/sharedGardenDatabase';

interface CreateSharedGardenModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
    userId: string;
    signingPrivateKey: string;
  };
  onCreated: (gardenId: string) => void;
}

type Tab = 'new' | 'restore';
type Step = 'form' | 'working' | 'done' | 'already-exists';

export const CreateSharedGardenModal: React.FC<CreateSharedGardenModalProps> = ({
  isOpen,
  onClose,
  user,
  onCreated,
}) => {
  const { t } = useTranslation('modals');
  const [tab, setTab] = useState<Tab>('new');

  // --- New garden state ---
  const [gardenName, setGardenName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [createStep, setCreateStep] = useState<Step>('form');
  const [createError, setCreateError] = useState('');
  const [createdGardenId, setCreatedGardenId] = useState('');
  const [createdGardenName, setCreatedGardenName] = useState('');

  // --- Restore state ---
  const [keyFile, setKeyFile] = useState<GardenKeyFileData | null>(null);
  const [restoreDisplayName, setRestoreDisplayName] = useState('');
  const [fileError, setFileError] = useState('');
  const [restoreStep, setRestoreStep] = useState<Step>('form');
  const [restoreError, setRestoreError] = useState('');
  const [restoredGardenId, setRestoredGardenId] = useState('');
  const [restoredGardenName, setRestoredGardenName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetAll = () => {
    setTab('new');
    setGardenName('');
    setDisplayName('');
    setCreateStep('form');
    setCreateError('');
    setCreatedGardenId('');
    setCreatedGardenName('');
    setKeyFile(null);
    setRestoreDisplayName('');
    setFileError('');
    setRestoreStep('form');
    setRestoreError('');
    setRestoredGardenId('');
    setRestoredGardenName('');
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  // ─── Create handlers ───────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!gardenName.trim() || !displayName.trim()) return;
    setCreateError('');
    setCreateStep('working');
    try {
      const result = await createSharedGarden(gardenName.trim(), displayName.trim(), user);
      if (!result) {
        setCreateError('Could not create the shared garden. Please try again.');
        setCreateStep('form');
        return;
      }
      setCreatedGardenId(result.gardenId);
      setCreatedGardenName(gardenName.trim());
      setCreateStep('done');
    } catch {
      setCreateError('Something went wrong. Please try again.');
      setCreateStep('form');
    }
  };

  // ─── Restore handlers ──────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError('');
    const reader = new FileReader();
    reader.onload = ev => {
      const parsed = parseGardenKeyFile(ev.target?.result as string);
      if (!parsed) {
        setFileError('This file does not look like a valid garden key file. Please choose the correct file.');
        setKeyFile(null);
        setRestoreDisplayName('');
      } else {
        setKeyFile(parsed);
        setRestoreDisplayName(parsed.myDisplayName);
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-selected after an error
    e.target.value = '';
  };

  const handleRestore = async () => {
    if (!keyFile) return;
    setRestoreError('');

    // Guard: already on this device
    const existing = getSharedGardenRef(keyFile.gardenId);
    if (existing) {
      setRestoredGardenId(keyFile.gardenId);
      setRestoredGardenName(existing.gardenName);
      setRestoreStep('already-exists');
      return;
    }

    const fileWithName: GardenKeyFileData = { ...keyFile, myDisplayName: restoreDisplayName.trim() || keyFile.myDisplayName };
    setRestoreStep('working');
    try {
      const result = await restoreSharedGardenFromKeyFile(fileWithName, user);
      if ('error' in result) {
        setRestoreError(result.error);
        setRestoreStep('form');
        return;
      }
      setRestoredGardenId(result.gardenId);
      setRestoredGardenName(result.gardenName);
      setRestoreStep('done');
    } catch {
      setRestoreError('Something went wrong while restoring. Please try again.');
      setRestoreStep('form');
    }
  };

  if (!isOpen) return null;

  const isWorking = (tab === 'new' && createStep === 'working') || (tab === 'restore' && restoreStep === 'working');

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
              <h2 className="text-base font-semibold text-gray-900">{t('createSharedGarden.title')}</h2>
              <p className="text-xs text-gray-500">{t('createSharedGarden.subtitle')}</p>
            </div>
          </div>
          {!isWorking && (
            <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Tab bar — only shown while on the form step */}
        {((tab === 'new' && createStep === 'form') || (tab === 'restore' && restoreStep === 'form')) && (
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setTab('new')}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                tab === 'new'
                  ? 'text-green-700 border-b-2 border-green-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t('createSharedGarden.newTab')}
            </button>
            <button
              onClick={() => setTab('restore')}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                tab === 'restore'
                  ? 'text-green-700 border-b-2 border-green-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t('createSharedGarden.restoreTab')}
            </button>
          </div>
        )}

        <div className="px-6 py-5">
          {/* ── NEW GARDEN ── */}
          {tab === 'new' && (
            <>
              {createStep === 'form' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('createSharedGarden.gardenNameLabel')}</label>
                    <input
                      type="text"
                      value={gardenName}
                      onChange={e => setGardenName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleCreate()}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors text-sm"
                      placeholder={t('createSharedGarden.gardenNamePlaceholder')}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('createSharedGarden.displayNameLabel')}</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleCreate()}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors text-sm"
                      placeholder={t('createSharedGarden.displayNamePlaceholder')}
                    />
                    <p className="text-xs text-gray-400 mt-1">{t('createSharedGarden.displayNameHint')}</p>
                  </div>
                  {createError && (
                    <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{createError}</p>
                  )}
                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={handleClose}
                      className="flex-1 px-4 py-2.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors text-sm"
                    >
                      {t('createSharedGarden.cancelBtn')}
                    </button>
                    <button
                      onClick={handleCreate}
                      disabled={!gardenName.trim() || !displayName.trim()}
                      className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl font-medium transition-colors text-sm"
                    >
                      {t('createSharedGarden.createBtn')}
                    </button>
                  </div>
                </div>
              )}

              {createStep === 'working' && (
                <div className="flex flex-col items-center py-8 gap-3">
                  <div className="w-10 h-10 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-gray-500">{t('createSharedGarden.creating')}</p>
                </div>
              )}

              {createStep === 'done' && (
                <div className="space-y-4">
                  <div className="bg-green-50 rounded-xl p-4 text-center">
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Leaf className="w-6 h-6 text-green-700" />
                    </div>
                    <p className="font-medium text-green-900 text-sm">{t('createSharedGarden.gardenReady', { name: createdGardenName })}</p>
                    <p className="text-xs text-green-700 mt-1">{t('createSharedGarden.saveKeyHint')}</p>
                  </div>
                  <button
                    onClick={() => downloadGardenKeyFile(createdGardenId)}
                    className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium py-2.5 px-4 rounded-xl transition-colors text-sm"
                  >
                    <Download className="w-4 h-4" />
                    {t('createSharedGarden.downloadKey')}
                  </button>
                  <button
                    onClick={() => { resetAll(); onCreated(createdGardenId); }}
                    className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 px-4 rounded-xl transition-colors text-sm"
                  >
                    {t('createSharedGarden.openGarden')}
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── RESTORE ── */}
          {tab === 'restore' && (
            <>
              {restoreStep === 'form' && (
                <div className="space-y-4">
                  <p className="text-xs text-gray-500 leading-relaxed">
                    {t('createSharedGarden.restoreHint')}
                  </p>

                  {/* File drop zone */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`w-full border-2 border-dashed rounded-xl p-5 text-center transition-colors ${
                      keyFile
                        ? 'border-green-400 bg-green-50'
                        : 'border-gray-200 hover:border-green-300 hover:bg-green-50/50'
                    }`}
                  >
                    {keyFile ? (
                      <>
                        <div className="w-9 h-9 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                          <Leaf className="w-4 h-4 text-green-700" />
                        </div>
                        <p className="text-sm font-medium text-green-800">{keyFile.gardenName}</p>
                        <p className="text-xs text-green-600 mt-0.5">{t('createSharedGarden.tapToChange')}</p>
                      </>
                    ) : (
                      <>
                        <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2">
                          <Upload className="w-4 h-4 text-gray-500" />
                        </div>
                        <p className="text-sm text-gray-600">{t('createSharedGarden.chooseFile')}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{t('createSharedGarden.chooseFileHint')}</p>
                      </>
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={handleFileChange}
                  />

                  {fileError && (
                    <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>{fileError}</span>
                    </div>
                  )}

                  {keyFile && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('createSharedGarden.restoreDisplayNameLabel')}</label>
                      <input
                        type="text"
                        value={restoreDisplayName}
                        onChange={e => setRestoreDisplayName(e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors text-sm"
                        placeholder={t('createSharedGarden.restoreDisplayNamePlaceholder')}
                      />
                      <p className="text-xs text-gray-400 mt-1">{t('createSharedGarden.restoreDisplayNameHint')}</p>
                    </div>
                  )}

                  {restoreError && (
                    <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>{restoreError}</span>
                    </div>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={handleClose}
                      className="flex-1 px-4 py-2.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors text-sm"
                    >
                      {t('createSharedGarden.cancelBtn')}
                    </button>
                    <button
                      onClick={handleRestore}
                      disabled={!keyFile || !restoreDisplayName.trim()}
                      className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl font-medium transition-colors text-sm"
                    >
                      {t('createSharedGarden.restoreBtn')}
                    </button>
                  </div>
                </div>
              )}

              {restoreStep === 'working' && (
                <div className="flex flex-col items-center py-8 gap-3">
                  <div className="w-10 h-10 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-gray-500">{t('createSharedGarden.restoring')}</p>
                </div>
              )}

              {restoreStep === 'done' && (
                <div className="space-y-4">
                  <div className="bg-green-50 rounded-xl p-4 text-center">
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Leaf className="w-6 h-6 text-green-700" />
                    </div>
                    <p className="font-medium text-green-900 text-sm">{t('createSharedGarden.gardenRestored', { name: restoredGardenName })}</p>
                    <p className="text-xs text-green-700 mt-1">{t('createSharedGarden.gardenRestoredDesc')}</p>
                  </div>
                  <button
                    onClick={() => { resetAll(); onCreated(restoredGardenId); }}
                    className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 px-4 rounded-xl transition-colors text-sm"
                  >
                    {t('createSharedGarden.openGarden')}
                  </button>
                </div>
              )}

              {restoreStep === 'already-exists' && (
                <div className="space-y-4">
                  <div className="bg-amber-50 rounded-xl p-4 text-center">
                    <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Leaf className="w-6 h-6 text-amber-700" />
                    </div>
                    <p className="font-medium text-amber-900 text-sm">{restoredGardenName}</p>
                    <p className="text-xs text-amber-700 mt-1">{t('createSharedGarden.alreadyExists')}</p>
                  </div>
                  <button
                    onClick={() => { resetAll(); onCreated(restoredGardenId); }}
                    className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 px-4 rounded-xl transition-colors text-sm"
                  >
                    {t('createSharedGarden.openGarden')}
                  </button>
                  <button
                    onClick={() => setRestoreStep('form')}
                    className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium py-2.5 px-4 rounded-xl transition-colors text-sm"
                  >
                    {t('createSharedGarden.chooseDifferent')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
