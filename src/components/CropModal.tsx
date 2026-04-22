import React, { useRef, useState } from 'react';
import { FixedCropper, FixedCropperRef } from 'react-advanced-cropper';
import 'react-advanced-cropper/dist/style.css';
import { X, ZoomIn, ZoomOut, Check } from 'lucide-react';

interface CropModalProps {
  imageSrc: string;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}

export const CropModal: React.FC<CropModalProps> = ({ imageSrc, onConfirm, onCancel }) => {
  const cropperRef = useRef<FixedCropperRef>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleZoom = (direction: 'in' | 'out') => {
    if (!cropperRef.current) return;
    cropperRef.current.zoomImage(direction === 'in' ? 1.2 : 1 / 1.2, { transitions: true });
  };

  const handleConfirm = () => {
    if (!cropperRef.current) return;
    const canvas = cropperRef.current.getCanvas({ width: 720, height: 720 });
    if (!canvas) return;

    setIsProcessing(true);
    canvas.toBlob(
      (blob) => {
        setIsProcessing(false);
        if (blob) onConfirm(blob);
      },
      'image/jpeg',
      0.85
    );
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-80 p-4">
      <div className="flex flex-col w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl bg-gray-900">
        <div className="flex items-center justify-between px-5 py-4">
          <span className="text-sm text-gray-300">Drag to reposition · Pinch to zoom</span>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-white transition-colors p-1 rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative bg-black" style={{ height: '80vw', maxHeight: '380px' }}>
          <FixedCropper
            ref={cropperRef}
            src={imageSrc}
            stencilSize={({ boundary }) => ({
              width: Math.min(boundary.width, boundary.height) - 40,
              height: Math.min(boundary.width, boundary.height) - 40,
            })}
            stencilProps={{
              handlers: false,
              lines: false,
              movable: false,
              resizable: false,
            }}
            className="w-full h-full"
          />
        </div>

        <div className="flex items-center justify-between px-5 py-4 gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleZoom('out')}
              className="p-2.5 rounded-full bg-gray-700 hover:bg-gray-600 text-white transition-colors"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleZoom('in')}
              className="p-2.5 rounded-full bg-gray-700 hover:bg-gray-600 text-white transition-colors"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={handleConfirm}
            disabled={isProcessing}
            className="flex items-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-green-800 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors text-sm"
          >
            <Check className="w-4 h-4" />
            {isProcessing ? 'Saving...' : 'Use Photo'}
          </button>
        </div>
      </div>
    </div>
  );
};
