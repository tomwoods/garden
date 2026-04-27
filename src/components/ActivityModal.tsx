import React, { useState, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { AdditionalInfoMenu } from './AdditionalInfoMenu';
import { LearningSourceInput, readCache, writeCache } from './LearningSourceInput';
import { AutocompleteInput, readAutocompleteCache, writeAutocompleteCache } from './AutocompleteInput';
import { SupabaseService } from '../lib/supabaseService';
import type { Plant } from '../lib/database';

const BASIC_ACTIVITY_CACHE_KEY = 'basic_activity_cache';
const PRESET_BASIC_ACTIVITIES = [
  { value: "children's class", label: "Children's class" },
  { value: 'prayer meeting', label: 'Prayer meeting' },
  { value: 'pre-youth group', label: 'Pre-youth group' },
  { value: 'study circle', label: 'Study circle' },
];

interface ActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  plantName: string;
  plantId: string;
  activityType: 'tending' | 'watering' | 'sunlight' | 'fruit' | 'pruning' | 'companion';
  editingItem?: any;
  allPlants?: Plant[];
  onSubmit: (data: any) => Promise<void>;
}

export const ActivityModal: React.FC<ActivityModalProps> = ({
  isOpen,
  onClose,
  plantName,
  plantId,
  activityType,
  editingItem,
  allPlants = [],
  onSubmit
}) => {
  const [formData, setFormData] = useState<any>({});
  const [additionalInfo, setAdditionalInfo] = useState<any>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [showDateTimeField, setShowDateTimeField] = useState(false);
  const [customDateTime, setCustomDateTime] = useState<number>(Date.now());
  const [showDateTimeMenu, setShowDateTimeMenu] = useState(false);
  const [learningSources, setLearningSources] = useState<Array<{ id: string; text: string; count: number }>>([]);
  const [isBasicActivity, setIsBasicActivity] = useState(false);
  const [basicActivityType, setBasicActivityType] = useState('');
  const [basicActivityOther, setBasicActivityOther] = useState('');
  const [basicActivities, setBasicActivities] = useState<Array<{ id: string; text: string; count: number }>>([]);

  useEffect(() => {
    if (isOpen && activityType === 'watering') {
      const cached = readCache();
      if (cached.length > 0) {
        setLearningSources(cached);
      }
      SupabaseService.fetchTop200LearningSources().then((fresh) => {
        if (fresh.length > 0) {
          setLearningSources(fresh);
          writeCache(fresh);
        }
      });
    }
    if (isOpen && activityType === 'fruit') {
      const cached = readAutocompleteCache(BASIC_ACTIVITY_CACHE_KEY);
      if (cached.length > 0) setBasicActivities(cached);
      SupabaseService.fetchTop200BasicActivities().then((fresh) => {
        if (fresh.length > 0) {
          setBasicActivities(fresh);
          writeAutocompleteCache(BASIC_ACTIVITY_CACHE_KEY, fresh);
        }
      });
    }
  }, [isOpen, activityType]);

  useEffect(() => {
    if (isOpen) {
      if (editingItem) {
        // Pre-populate form with editing data
        const predefinedTypes = ['conversation', 'coffee', 'meal', 'call', 'message', 'activity'];
        const isCustomType = activityType === 'tending' && !predefinedTypes.includes(editingItem.type);

        setFormData({
          ...editingItem,
          type: isCustomType ? editingItem.type : editingItem.type || 'conversation'
        });
        setShowCustomInput(isCustomType);

        // Parse additional_info if it exists
        if (editingItem.additional_info) {
          try {
            setAdditionalInfo(JSON.parse(editingItem.additional_info));
          } catch (error) {
            console.error('Failed to parse additional_info:', error);
            setAdditionalInfo({});
          }
        } else {
          setAdditionalInfo({});
        }
      } else {
        // Reset form for new activity
        const defaultData: any = {
          type: activityType === 'tending' ? 'conversation' : '',
          summary: '',
          source: '',
          progress_description: '',
          topic: '',
          description: '',
          difficulty: 'easy',
          relationship_descriptor: '',
          plant_b_id: ''
        };
        setFormData(defaultData);
        setAdditionalInfo({});
        setShowCustomInput(false);
      }
      // Reset datetime fields when modal opens
      setShowDateTimeField(false);
      setCustomDateTime(Date.now());
      setShowDateTimeMenu(false);
      // Reset basic activity fields
      if (activityType === 'fruit' && editingItem?.basic_activity) {
        const presetValues = PRESET_BASIC_ACTIVITIES.map(p => p.value);
        if (presetValues.includes(editingItem.basic_activity)) {
          setIsBasicActivity(true);
          setBasicActivityType(editingItem.basic_activity);
          setBasicActivityOther('');
        } else {
          setIsBasicActivity(true);
          setBasicActivityType('other');
          setBasicActivityOther(editingItem.basic_activity);
        }
      } else {
        setIsBasicActivity(false);
        setBasicActivityType('');
        setBasicActivityOther('');
      }
    }
  }, [isOpen, editingItem, activityType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const additionalInfoJson = Object.keys(additionalInfo).length > 0
        ? JSON.stringify(additionalInfo)
        : undefined;

      let resolvedBasicActivity: string | undefined;
      if (activityType === 'fruit' && isBasicActivity) {
        resolvedBasicActivity = basicActivityType === 'other'
          ? basicActivityOther.trim() || undefined
          : basicActivityType || undefined;
      }

      const submitData = {
        ...formData,
        ...(activityType === 'fruit' ? { basic_activity: resolvedBasicActivity || null } : {}),
        additional_info: additionalInfoJson,
        datetime: showDateTimeField ? customDateTime : Date.now()
      };

      if (editingItem) {
        await onSubmit({ ...submitData, id: editingItem.id });
      } else {
        await onSubmit(submitData);
      }

      if (activityType === 'watering' && submitData.source?.trim()) {
        const userId = localStorage.getItem('user_id') || '';
        SupabaseService.upsertLearningSource(submitData.source.trim(), userId);
      }

      if (activityType === 'fruit' && basicActivityType === 'other' && basicActivityOther.trim()) {
        const userId = localStorage.getItem('user_id') || '';
        SupabaseService.upsertBasicActivity(basicActivityOther.trim(), userId);
      }

      onClose();
    } catch (error) {
      console.error('Failed to save activity:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: any) => {
    if (field === 'type' && activityType === 'tending') {
      if (value === 'other') {
        setShowCustomInput(true);
        setFormData((prev: any) => ({ ...prev, [field]: '' }));
      } else {
        setShowCustomInput(false);
        setFormData((prev: any) => ({ ...prev, [field]: value }));
      }
    } else {
      setFormData((prev: any) => ({ ...prev, [field]: value }));
    }
  };

  // Convert timestamp to datetime-local format (YYYY-MM-DDTHH:mm)
  const timestampToDateTimeLocal = (timestamp: number): string => {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  // Convert datetime-local format to timestamp
  const dateTimeLocalToTimestamp = (dateTimeLocal: string): number => {
    return new Date(dateTimeLocal).getTime();
  };

  const handleSetDateTime = () => {
    setShowDateTimeField(true);
  };

  if (!isOpen) return null;

  const getActivityConfig = () => {
    const configs = {
      tending: { title: 'Tend', emoji: '🪴', description: 'Log an interaction or connection' },
      watering: { title: 'Water', emoji: '🚿', description: 'Record shared learning or study' },
      sunlight: { title: 'Sunlight', emoji: '☀️', description: 'Record prayers for this soul' },
      fruit: { title: 'Fruit', emoji: '🍎', description: 'Record acts of service or teaching' },
      pruning: { title: 'Pruning Event', emoji: '✂️', description: 'Record struggles and difficulties' },
      companion: { title: 'Companion', emoji: '🤝', description: 'Record relationships with other plants' }
    };
    return configs[activityType];
  };

  const config = getActivityConfig();

  // Show datetime menu for all activity types except companion
  const showDateTimeButton = activityType !== 'companion';

  const renderFormFields = () => {
    const dateTimeField = showDateTimeField && (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Date & Time
        </label>
        <input
          type="datetime-local"
          value={timestampToDateTimeLocal(customDateTime)}
          onChange={(e) => setCustomDateTime(dateTimeLocalToTimestamp(e.target.value))}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
        />
      </div>
    );

    switch (activityType) {
      case 'tending':
        return (
          <>
            {dateTimeField}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type of interaction *
              </label>
              {!showCustomInput ? (
                <select
                  value={formData.type || 'conversation'}
                  onChange={(e) => handleChange('type', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                  required
                >
                  <option value="conversation">Conversation</option>
                  <option value="coffee">Coffee/Tea</option>
                  <option value="meal">Shared meal</option>
                  <option value="call">Phone call</option>
                  <option value="message">Text/Message</option>
                  <option value="activity">Activity together</option>
                  <option value="other">Other</option>
                </select>
              ) : (
                <input
                  type="text"
                  value={formData.type || ''}
                  onChange={(e) => setFormData((prev: any) => ({ ...prev, type: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                  placeholder="Enter custom interaction type"
                  required
                />
              )}
              {showCustomInput && (
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomInput(false);
                    setFormData((prev: any) => ({ ...prev, type: 'conversation' }));
                  }}
                  className="mt-2 text-sm text-gray-600 hover:text-gray-800 underline"
                >
                  ← Back to options
                </button>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Summary
              </label>
              <textarea
                value={formData.summary || ''}
                onChange={(e) => handleChange('summary', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors resize-none"
                rows={3}
                placeholder="What did you talk about or do together?"
              />
            </div>
          </>
        );

      case 'watering':
        return (
          <>
            {dateTimeField}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Source of learning *
              </label>
              <LearningSourceInput
                value={formData.source || ''}
                onChange={(v) => handleChange('source', v)}
                sources={learningSources}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Progress description
              </label>
              <textarea
                value={formData.progress_description || ''}
                onChange={(e) => handleChange('progress_description', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors resize-none"
                rows={3}
                placeholder="What did you learn or study together?"
              />
            </div>
          </>
        );

      case 'sunlight':
        return (
          <>
            {dateTimeField}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Prayer topic *
              </label>
            <textarea
              value={formData.topic || ''}
              onChange={(e) => handleChange('topic', e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition-colors resize-none"
              rows={3}
              placeholder="What did you pray for regarding this soul?"
              required
            />
            </div>
          </>
        );

      case 'fruit':
        return (
          <>
            {dateTimeField}
            <div className="flex items-center gap-2">
              <input
                id="is-basic-activity"
                type="checkbox"
                checked={isBasicActivity}
                onChange={(e) => {
                  setIsBasicActivity(e.target.checked);
                  if (!e.target.checked) {
                    setBasicActivityType('');
                    setBasicActivityOther('');
                  }
                }}
                className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer"
              />
              <label htmlFor="is-basic-activity" className="text-sm font-medium text-gray-700 cursor-pointer select-none">
                Is basic activity?
              </label>
            </div>
            {isBasicActivity && (
              <div>
                <select
                  value={basicActivityType}
                  onChange={(e) => {
                    setBasicActivityType(e.target.value);
                    setBasicActivityOther('');
                  }}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent transition-colors"
                >
                  <option value="">Select activity type...</option>
                  {PRESET_BASIC_ACTIVITIES.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                  <option value="other">Other</option>
                </select>
              </div>
            )}
            {isBasicActivity && basicActivityType === 'other' && (
              <div>
                <AutocompleteInput
                  value={basicActivityOther}
                  onChange={setBasicActivityOther}
                  values={basicActivities}
                  placeholder="Enter basic activity type..."
                  accentColor="red"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description of service or teaching *
              </label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => handleChange('description', e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent transition-colors resize-none"
              rows={3}
              placeholder="Describe the act of service or teaching this soul performed..."
              required
            />
            </div>
          </>
        );

      case 'pruning':
        return (
          <>
            {dateTimeField}
            <input
              type="hidden"
              value="easy"
              onChange={(e) => handleChange('difficulty', e.target.value)}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                value={formData.description || ''}
                onChange={(e) => handleChange('description', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors resize-none"
                rows={3}
                placeholder="Describe the struggle or difficulty..."
              />
            </div>
          </>
        );

      case 'companion':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Related plant *
              </label>
              <select
                value={formData.plant_b_id || ''}
                onChange={(e) => handleChange('plant_b_id', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
                required
              >
                <option value="">Select a plant...</option>
                {allPlants.filter(p => p.id !== plantId).map(plant => (
                  <option key={plant.id} value={plant.id}>{plant.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Relationship *
              </label>
              <input
                type="text"
                value={formData.relationship_descriptor || ''}
                onChange={(e) => handleChange('relationship_descriptor', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
                placeholder="e.g., siblings, friends, colleagues..."
                required
              />
            </div>
          </>
        );

      default:
        return null;
    }
  };

  const isFormValid = () => {
    switch (activityType) {
      case 'tending':
        return formData.type;
      case 'watering':
        return formData.source;
      case 'sunlight':
        return formData.topic;
      case 'fruit':
        return formData.description;
      case 'pruning':
        return formData.description;
      case 'companion':
        return formData.plant_b_id && formData.relationship_descriptor;
      default:
        return false;
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-green-100">
              <span className="text-xl">{config.emoji}</span>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {editingItem ? 'Edit' : 'Add'} {config.title}
              </h2>
              <p className="text-sm text-gray-600">
                {config.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 relative">
            {showDateTimeButton && (
              <>
                <button
                  type="button"
                  onClick={() => setShowDateTimeMenu(!showDateTimeMenu)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                </button>
                {showDateTimeMenu && (
                  <AdditionalInfoMenu
                    mode="datetime"
                    onSetDateTime={handleSetDateTime}
                    onClose={() => setShowDateTimeMenu(false)}
                  />
                )}
              </>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {renderFormFields()}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isFormValid() || isSubmitting}
              className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-xl font-medium transition-colors"
            >
              {isSubmitting ? 'Saving...' : (editingItem ? 'Update' : 'Save')}
            </button>
          </div>
        </form>
      </div>
      </div>
    </>
  );
};