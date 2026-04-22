import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { X, ExternalLink, Navigation } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icons in React Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface MapOverlayProps {
  location: { lat: number; lng: number };
  plantName?: string;
  onClose: () => void;
}

export const MapOverlay: React.FC<MapOverlayProps> = ({
  location,
  plantName,
  onClose
}) => {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const openGoogleMaps = () => {
    const url = `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`;
    window.open(url, '_blank');
  };

  const openWaze = () => {
    const url = `https://waze.com/ul?ll=${location.lat},${location.lng}&navigate=yes`;
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[9999]">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl h-[600px] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Navigation className="w-5 h-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              {plantName ? `Location: ${plantName}` : 'Location'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Map Container */}
        <div className="flex-1 relative">
          <MapContainer
            center={[location.lat, location.lng]}
            zoom={15}
            style={{ height: '100%', width: '100%' }}
            className="z-0"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker position={[location.lat, location.lng]}>
              <Popup>
                {plantName ? (
                  <div className="text-center">
                    <p className="font-semibold">{plantName}</p>
                    <p className="text-xs text-gray-600">
                      {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                    </p>
                  </div>
                ) : (
                  <div className="text-xs text-gray-600">
                    {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                  </div>
                )}
              </Popup>
            </Marker>
          </MapContainer>
        </div>

        {/* Share Buttons */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <p className="text-sm text-gray-600 mb-3">Open in navigation app:</p>
          <div className="flex gap-3">
            <button
              onClick={openGoogleMaps}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl font-medium text-gray-700 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Google Maps
            </button>
            <button
              onClick={openWaze}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
            >
              <Navigation className="w-4 h-4" />
              Waze
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-3 text-center">
            Coordinates: {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
          </p>
        </div>
      </div>
    </div>
  );
};
