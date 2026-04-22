import React, { useRef } from 'react';
import { Sprout, Upload, Leaf } from 'lucide-react';

interface WelcomeScreenProps {
  onCreateGarden: () => void;
  onRestoreGardenKey: (file: File) => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onCreateGarden,
  onRestoreGardenKey
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleRestoreClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onRestoreGardenKey(file);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        {/* Garden Icon */}
        <div className="mb-8">
          <div className="w-20 h-20 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-4">
            <Sprout className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Welcome to Garden</h1>
          <p className="text-gray-600 leading-relaxed">
            A private space to nurture and tend to your relationships. 
            Your garden grows through care, attention, and love.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-4">
          <button
            onClick={onCreateGarden}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-4 px-6 rounded-xl transition-colors duration-200 flex items-center justify-center gap-3"
          >
            <Leaf className="w-5 h-5" />
            Plant Your First Seed
          </button>
          
          <button
            onClick={handleRestoreClick}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-4 px-6 rounded-xl transition-colors duration-200 flex items-center justify-center gap-3"
          >
            <Upload className="w-5 h-5" />
            Open Garden with Key File
          </button>
        </div>

        {/* Privacy Note */}
        <div className="mt-8 p-4 bg-green-50 rounded-xl">
          <p className="text-sm text-green-800">
            <span className="font-semibold">🔒 Private & Secure:</span> Your garden data is encrypted 
            and stored locally. Your garden key contains your encryption keys.
          </p>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </div>
  );
};