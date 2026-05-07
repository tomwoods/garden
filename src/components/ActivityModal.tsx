import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Plus } from 'lucide-react';
import { AdditionalInfoMenu } from './AdditionalInfoMenu';
import { LearningSourceInput, readCache, writeCache } from './LearningSourceInput';
import { AutocompleteInput, readAutocompleteCache, writeAutocompleteCache } from './AutocompleteInput';
import { SupabaseService } from '../lib/supabaseService';
import type { Plant } from '../lib/database';

const BASIC_ACTIVITY_CACHE_KEY = 'basic_activity_cache';
const PRESET_BASIC_ACTIVITIES = [
  { value: "children's class", labelKey: 'activity.basicActivityTypes.childrenClass' },
  { value: 'prayer meeting', labelKey: 'activity.basicActivityTypes.prayerMeeting' },
  { value: 'pre-youth group', labelKey: 'activity.basicActivityTypes.preYouth' },
  { value: 'study circle', labelKey: 'activity.basicActivityTypes.studyCircle' },
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
  const { t } = useTranslation('modals');
  const basicActivityOtherInputRef = useRef<HTMLInputElement>(null);

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
      let resolvedOtherText = '';
      if (activityType === 'fruit' && isBasicActivity) {
        if (basicActivityType === 'other') {
          const domValue = basicActivityOtherInputRef.current?.value ?? '';
          resolvedOtherText = (domValue || basicActivityOther).trim();
          resolvedBasicActivity = resolvedOtherText || undefined;
        } else {
          resolvedBasicActivity = basicActivityType || undefined;
        }
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

      if (activityType === 'fruit' && basicActivityType === 'other' && resolvedOtherText) {
        const userId = localStorage.getItem('user_id') || '';
        SupabaseService.upsertBasicActivity(resolvedOtherText, userId);
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
      tending: { title: 'Tend', emoji: '🪴', description: t('activity.tendingDesc') },
      watering: { title: 'Water', emoji: '🚿', description: t('activity.wateringDesc') },
      sunlight: { title: 'Sunlight', emoji: '☀️', description: t('activity.sunlightDesc') },
      fruit: { title: 'Fruit', emoji: '🍎', description: t('activity.fruitDesc') },
      pruning: { title: 'Pruning Event', emoji: '✂️', description: t('activity.pruningDesc') },
      companion: { title: 'Companion', emoji: '🤝', description: t('activity.companionDesc') }
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
          {t('activity.dateTime')}
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
                {t('activity.interactionTypeRequired')}
              </label>
              {!showCustomInput ? (
                <select
                  value={formData.type || 'conversation'}
                  onChange={(e) => handleChange('type', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                  required
                >
                  <option value="conversation">{t('activity.interactionTypes.conversation')}</option>
                  <option value="coffee">{t('activity.interactionTypes.coffee')}</option>
                  <option value="meal">{t('activity.interactionTypes.meal')}</option>
                  <option value="call">{t('activity.interactionTypes.call')}</option>
                  <option value="message">{t('activity.interactionTypes.message')}</option>
                  <option value="activity">{t('activity.interactionTypes.activity')}</option>
                  <option value="other">{t('activity.interactionTypes.other')}</option>
                </select>
              ) : (
                <input
                  type="text"
                  value={formData.type || ''}
                  onChange={(e) => setFormData((prev: any) => ({ ...prev, type: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                  placeholder={t('activity.interactionTypes.customPlaceholder')}
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
                  {t('activity.interactionTypes.backToOptions')}
                </button>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('activity.summary')}
              </label>
              <textarea
                value={formData.summary || ''}
                onChange={(e) => handleChange('summary', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors resize-none"
                rows={3}
                placeholder={t('activity.summaryPlaceholder')}
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
                {t('activity.learningSourceRequired')}
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
                {t('activity.progressDesc')}
              </label>
              <textarea
                value={formData.progress_description || ''}
                onChange={(e) => handleChange('progress_description', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors resize-none"
                rows={3}
                placeholder={t('activity.progressPlaceholder')}
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
                {t('activity.prayerTopicRequired')}
              </label>
            <textarea
              value={formData.topic || ''}
              onChange={(e) => handleChange('topic', e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition-colors resize-none"
              rows={3}
              placeholder={t('activity.prayerTopicPlaceholder')}
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
                {t('activity.isBasicActivity')}
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
                  <option value="">{t('activity.basicActivityTypes.selectPlaceholder')}</option>
                  {PRESET_BASIC_ACTIVITIES.map(opt => (
                    <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
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
                  required
                  inputRef={basicActivityOtherInputRef}
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('activity.serviceDescRequired')}
              </label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => handleChange('description', e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent transition-colors resize-none"
              rows={3}
              placeholder={t('activity.serviceDescPlaceholder')}
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
                {t('activity.pruningDescLabel')}
              </label>
              <textarea
                value={formData.description || ''}
                onChange={(e) => handleChange('description', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors resize-none"
                rows={3}
                placeholder={t('activity.pruningDescPlaceholder')}
              />
            </div>
          </>
        );

      case 'companion':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('activity.relatedPlantRequired')}
              </label>
              <select
                value={formData.plant_b_id || ''}
                onChange={(e) => handleChange('plant_b_id', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
                required
              >
                <option value="">{t('activity.selectPlant')}</option>
                {allPlants.filter(p => p.id !== plantId).map(plant => (
                  <option key={plant.id} value={plant.id}>{plant.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('activity.relationshipRequired')}
              </label>
              <input
                type="text"
                value={formData.relationship_descriptor || ''}
                onChange={(e) => handleChange('relationship_descriptor', e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
                placeholder={t('activity.relationshipPlaceholder')}
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
      case 'fruit': {
        if (!formData.description) return false;
        if (isBasicActivity) {
          if (!basicActivityType) return false;
          if (basicActivityType === 'other') {
            const domValue = basicActivityOtherInputRef.current?.value ?? '';
            if (!(domValue || basicActivityOther).trim()) return false;
          }
        }
        return true;
      }
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
                {editingItem ? t('activity.editTitle', { type: config.title }) : t('activity.addTitle', { type: config.title })}
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
              {t('activity.cancelBtn')}
            </button>
            <button
              type="submit"
              disabled={!isFormValid() || isSubmitting}
              className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-xl font-medium transition-colors"
            >
              {isSubmitting ? t('activity.savingBtn') : (editingItem ? t('activity.updateBtn') : t('activity.saveBtn'))}
            </button>
          </div>
        </form>
      </div>
      </div>
    </>
  );
};