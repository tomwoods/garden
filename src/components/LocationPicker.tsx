import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import { LatLng } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Loader2, X } from 'lucide-react';

// Fix for default markers in react-leaflet
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.divIcon({
  html: `<div style="background-color: #ef4444; width: 25px; height: 25px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 2px solid #fff;"></div>`,
  iconSize: [25, 25],
  iconAnchor: [12, 24],
});

L.Marker.prototype.options.icon = DefaultIcon;

interface LocationData {
  lat: number;
  lng: number;
}

interface LocationPickerProps {
  location?: LocationData;
  onLocationChange: (location: LocationData | null) => void;
  onClose: () => void;
}

function MapController({ center, zoom }: { center: LatLng | null; zoom: number }) {
  const map = useMap();
  
  useEffect(() => {
    if (center) {
      map.setView(center, zoom);
    }
  }, [map, center, zoom]);
  
  return null;
}

function LocationMarker({ position, onPositionChange }: { 
  position: LatLng; 
  onPositionChange: (position: LatLng) => void;
}) {
  useMapEvents({
    click(e) {
      onPositionChange(e.latlng);
    },
  });

  return <Marker position={position} />;
}

export const LocationPicker: React.FC<LocationPickerProps> = ({
  location,
  onLocationChange,
  onClose
}) => {
  const [currentLocation, setCurrentLocation] = useState<LatLng | null>(null);
  const [mapCenter, setMapCenter] = useState<LatLng | null>(null);
  const [mapZoom, setMapZoom] = useState(13);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (location) {
      const existingLocation = new LatLng(location.lat, location.lng);
      setCurrentLocation(existingLocation);
      setMapCenter(existingLocation);
      setMapZoom(18);
    }
  }, [location]);

  const getCurrentLocation = async () => {
    setIsLoading(true);
    setError(null);

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser');
      setIsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const newLocation = new LatLng(
          position.coords.latitude,
          position.coords.longitude
        );
        setCurrentLocation(newLocation);
        setMapCenter(newLocation);
        setMapZoom(18); // Maximum zoom level
        setIsLoading(false);
      },
      (error) => {
        setError('Unable to retrieve your location');
        setIsLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  };

  const handlePositionChange = (newPosition: LatLng) => {
    setCurrentLocation(newPosition);
  };

  const handleSave = () => {
    if (currentLocation) {
      onLocationChange({
        lat: currentLocation.lat,
        lng: currentLocation.lng
      });
    }
    onClose();
  };

  const handleRemove = () => {
    onLocationChange(null);
    onClose();
  };

  const defaultCenter = currentLocation || new LatLng(40.7128, -74.0060); // Default to NYC

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <MapPin className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">{location ? 'Edit Location' : 'Add Location'}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Controls */}
          <div className="mb-4 flex gap-3">
            <button
              onClick={getCurrentLocation}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg font-medium transition-colors"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <MapPin className="w-4 h-4" />
              )}
              {isLoading ? 'Getting location...' : 'Use current location'}
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* Map */}
          <div className="h-64 rounded-xl overflow-hidden border border-gray-200 mb-4">
            <MapContainer
              center={defaultCenter}
              zoom={mapZoom}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapController center={mapCenter} zoom={mapZoom} />
              {currentLocation && (
                <LocationMarker
                  position={currentLocation}
                  onPositionChange={handlePositionChange}
                />
              )}
            </MapContainer>
          </div>

          {/* Location Info */}
          {currentLocation && (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                <strong>Latitude:</strong> {currentLocation.lat.toFixed(6)}
              </p>
              <p className="text-sm text-gray-600">
                <strong>Longitude:</strong> {currentLocation.lng.toFixed(6)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Click on the map to adjust the location
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors"
            >
              Cancel
            </button>
            {location && (
              <button
                onClick={handleRemove}
                className="px-4 py-3 text-red-600 bg-red-50 hover:bg-red-100 rounded-xl font-medium transition-colors"
              >
                Remove
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={!currentLocation}
              className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-xl font-medium transition-colors"
            >
              Save Location
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};