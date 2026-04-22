import React, { useState, useRef, useEffect } from 'react';
import { X, Camera, Trash2, AlertCircle, RefreshCw } from 'lucide-react';
import { uploadService } from '../lib/uploadService';
import { DatabaseService } from '../lib/database';
import { useToast } from '../hooks/useToast';
import { ImageQuotaModal } from './ImageQuotaModal';
import { CropModal } from './CropModal';

interface PlantImageCaptureProps {
  plantId: string | null;
  plantName: string;
  image: string | null;
  onImageChange: (image: string | null) => void;
  onClose: () => void;
}

type CaptureState =
  | { status: 'idle' }
  | { status: 'processing' }
  | { status: 'cropping'; file: File; dataUrl: string }
  | { status: 'error'; message: string; lastFiles: FileList };

export const PlantImageCapture: React.FC<PlantImageCaptureProps> = ({
  plantId,
  plantName,
  image,
  onImageChange,
  onClose,
}) => {
  const [captureState, setCaptureState] = useState<CaptureState>({ status: 'idle' });
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addToast } = useToast();

  const [quotaInfo, setQuotaInfo] = useState(() => uploadService.getQuotaInfo());

  useEffect(() => {
    setQuotaInfo(uploadService.getQuotaInfo());
  }, [image]);

  const blobToDataUrl = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (reader.result) resolve(reader.result as string);
        else reject(new Error('FileReader produced empty result'));
      };
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.readAsDataURL(blob);
    });

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) resolve(e.target.result as string);
        else reject(new Error('Failed to read file'));
      };
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.readAsDataURL(file);
    });

  const finishProcessing = async (dataUrl: string) => {
    onImageChange(dataUrl);
    setCaptureState({ status: 'idle' });

    if (plantId) {
      try {
        await uploadService.queueUpload(plantId, plantName, dataUrl);
        addToast('Image queued for upload', 'success');
      } catch (queueErr) {
        console.error('[PlantImageCapture] Upload queue failed:', queueErr);
        addToast('Image saved locally but upload failed', 'error');
      }
    }
  };

  const handleCropConfirm = async (blob: Blob) => {
    if (captureState.status !== 'cropping') return;
    setCaptureState({ status: 'processing' });
    try {
      const dataUrl = await blobToDataUrl(blob);
      await finishProcessing(dataUrl);
    } catch (err) {
      console.error('[PlantImageCapture] Blob conversion failed:', err);
      addToast('Could not process image — try a different photo', 'error');
      setCaptureState({ status: 'idle' });
    }
  };

  const handleCropCancel = () => {
    setCaptureState({ status: 'idle' });
  };

  const handleImageCapture = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    setErrorDetail(null);
    const file = files[0];
    setCaptureState({ status: 'processing' });
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setCaptureState({ status: 'cropping', file, dataUrl });
    } catch (err) {
      console.error('[PlantImageCapture] Failed to read image:', err);
      addToast('Could not load image', 'error');
      setCaptureState({ status: 'idle' });
    }
  };

  const handleRetry = async () => {
    if (captureState.status !== 'error') return;
    await handleImageCapture({ target: { files: captureState.lastFiles } } as any);
  };

  const handleDismissError = () => {
    setCaptureState({ status: 'idle' });
    setErrorDetail(null);
  };

  const handleDeleteImage = async () => {
    if (!plantId) return;
    await DatabaseService.deleteImageLocally(plantId, 0);
    await DatabaseService.updatePlantImageId(plantId, null);
    uploadService.deleteImageFromServer(plantId);
    onImageChange(null);
    setQuotaInfo(uploadService.getQuotaInfo());
  };

  const isProcessing = captureState.status === 'processing';
  const hasError = captureState.status === 'error';
  const isCropping = captureState.status === 'cropping';

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[70vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between p-6 border-b">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Plant Image</h2>
              <p className="text-sm text-gray-500 mt-1">{plantName}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {quotaInfo.imagesUsed >= Math.floor(quotaInfo.maxImages * 0.85) && (
              <div className="mb-4 p-4 bg-blue-50 rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className={`w-5 h-5 ${quotaInfo.hasReachedLimit ? 'text-orange-600' : 'text-amber-500'}`} />
                    <span className="text-sm font-medium text-gray-900">
                      {quotaInfo.imagesUsed} / {quotaInfo.maxImages} images used
                    </span>
                  </div>
                  <button
                    onClick={() => setShowQuotaModal(true)}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    Details
                  </button>
                </div>
                {quotaInfo.hasReachedLimit && (
                  <p className="text-xs text-orange-700 mt-2">
                    Limit reached. Delete an image to add a new one.
                  </p>
                )}
              </div>
            )}

            {hasError && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-red-800">Processing failed</p>
                    {errorDetail && (
                      <p className="text-xs text-red-600 mt-1 break-words">{errorDetail}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleRetry}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Retry
                  </button>
                  <button
                    onClick={handleDismissError}
                    className="px-3 py-1.5 text-red-700 hover:text-red-900 text-xs font-medium rounded-lg border border-red-300 hover:border-red-400 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-col items-center gap-4">
              {image ? (
                <div className="relative group">
                  <img
                    src={image}
                    alt="Plant"
                    className="w-32 h-32 object-cover rounded-lg border border-gray-200"
                  />
                  <button
                    onClick={handleDeleteImage}
                    className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                !quotaInfo.hasReachedLimit && (
                  <button
                    onClick={() => {
                      if (!isProcessing && !isCropping) {
                        fileInputRef.current?.click();
                      }
                    }}
                    disabled={isProcessing || isCropping}
                    className="w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg hover:border-green-500 hover:bg-green-50 transition-colors flex flex-col items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="w-6 h-6 text-green-500 animate-spin" />
                        <span className="text-xs text-gray-600">Processing...</span>
                      </>
                    ) : (
                      <>
                        <Camera className="w-6 h-6 text-gray-400" />
                        <span className="text-xs text-gray-600">Add Image</span>
                      </>
                    )}
                  </button>
                )
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageCapture}
              className="hidden"
            />
          </div>

          <div className="p-6 border-t">
            <button
              onClick={onClose}
              className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>

      {isCropping && captureState.status === 'cropping' && (
        <CropModal
          imageSrc={captureState.dataUrl}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}

      {showQuotaModal && (
        <ImageQuotaModal
          onClose={() => setShowQuotaModal(false)}
        />
      )}
    </>
  );
};
