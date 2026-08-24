import React, { useState, useEffect } from 'react';
import { X, Trash2, Loader } from 'lucide-react';
import { fetchSharedLargeImage } from '../lib/sharedImageSync';
import type { SharedGardenRef } from '../lib/sharedGardenDatabase';

interface SharedImageViewerProps {
  thumbnailUrl: string;
  ref_: SharedGardenRef;
  plantId: string;
  user: { userId: string; signingPrivateKey: string };
  onClose: () => void;
  onDelete?: () => void;
}

export const SharedPlantImageViewer: React.FC<SharedImageViewerProps> = ({
  thumbnailUrl,
  ref_,
  plantId,
  user,
  onClose,
  onDelete,
}) => {
  const [displayUrl, setDisplayUrl] = useState<string>(thumbnailUrl);
  const [isLoadingLarge, setIsLoadingLarge] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingLarge(true);
    setDisplayUrl(thumbnailUrl);

    fetchSharedLargeImage(ref_, plantId, user).then((largeUrl) => {
      if (!cancelled && largeUrl) {
        setDisplayUrl(largeUrl);
      }
      if (!cancelled) setIsLoadingLarge(false);
    });

    return () => { cancelled = true; };
  }, [plantId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center z-50"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-10"
      >
        <X className="w-8 h-8" />
      </button>

      {onDelete && (
        <button
          onClick={onDelete}
          className="absolute top-4 right-16 text-white hover:text-red-400 transition-colors z-10"
        >
          <Trash2 className="w-8 h-8" />
        </button>
      )}

      {isLoadingLarge && (
        <div className="absolute top-4 left-4 z-10">
          <Loader className="w-6 h-6 text-white animate-spin" />
        </div>
      )}

      <div className="max-w-6xl max-h-[90vh] w-full h-full flex items-center justify-center p-4">
        <img
          src={displayUrl}
          alt="Plant"
          className="max-w-full max-h-full object-contain"
        />
      </div>
    </div>
  );
};
