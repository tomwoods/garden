import React, { useRef, useEffect } from 'react';
import { Calendar, MapPin, Camera, Milestone } from 'lucide-react';

interface AdditionalInfoMenuProps {
  onSetDateTime?: () => void;
  onAddLocation?: () => void;
  onAddImage?: () => void;
  onSetAge?: () => void;
  hasLocation?: boolean;
  hasImages?: boolean;
  hasAge?: boolean;
  onClose?: () => void;
  mode?: 'datetime' | 'location' | 'all';
}

export const AdditionalInfoMenu: React.FC<AdditionalInfoMenuProps> = ({
  onSetDateTime,
  onAddLocation,
  onAddImage,
  onSetAge,
  hasLocation = false,
  hasImages = false,
  hasAge = false,
  onClose,
  mode = 'datetime'
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose?.();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleDateTimeClick = () => {
    onSetDateTime?.();
    onClose?.();
  };

  const handleLocationClick = () => {
    onAddLocation?.();
    onClose?.();
  };

  const handleImageClick = () => {
    onAddImage?.();
    onClose?.();
  };

  const handleAgeClick = () => {
    onSetAge?.();
    onClose?.();
  };

  return (
    <div className="absolute right-0 top-10 bg-white rounded-lg shadow-lg border border-gray-200 py-2 min-w-[160px] z-10" ref={menuRef}>
      {mode === 'datetime' && (
        <button
          type="button"
          onClick={handleDateTimeClick}
          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
        >
          <Calendar className="w-4 h-4" />
          Set date/time
        </button>
      )}
      {(mode === 'location' || mode === 'all') && (
        <button
          type="button"
          onClick={handleLocationClick}
          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
        >
          <MapPin className="w-4 h-4" />
          {hasLocation ? 'Edit location' : 'Add location'}
        </button>
      )}
      {mode === 'all' && (
        <button
          type="button"
          onClick={handleAgeClick}
          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
        >
          <Milestone className="w-4 h-4" />
          {hasAge ? 'Edit age' : 'Add age'}
        </button>
      )}
      {mode === 'all' && (
        <button
          type="button"
          onClick={handleImageClick}
          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
        >
          <Camera className="w-4 h-4" />
          {hasImages ? 'View images' : 'Add image'}
        </button>
      )}
    </div>
  );
};
