import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Copy, Share2, Phone, User, FileText } from 'lucide-react';
import { PhoneLink } from './PhoneLink';
import { parseAgeInfoFromPlant, resolveEffectiveAge } from '../lib/harvestService';
import type { Plant } from '../lib/database';

interface PlotExportListViewProps {
  plotName: string;
  plants: Plant[];
  onClose: () => void;
}

export const PlotExportListView: React.FC<PlotExportListViewProps> = ({
  plotName,
  plants,
  onClose,
}) => {
  const { t } = useTranslation('garden_shared');
  const [copied, setCopied] = useState(false);

  const enrichedPlants = useMemo(() => {
    return plants.map(p => {
      const ageInfo = parseAgeInfoFromPlant(p);
      let ageLabel: string | null = null;
      if (ageInfo) {
        const age = resolveEffectiveAge(ageInfo);
        if (age < 21) ageLabel = t('ageYears', { age });
        else ageLabel = t('plotExport.adult');
      }
      return { plant: p, ageLabel };
    });
  }, [plants, t]);

  const buildPlainString = (): string => {
    const header = `${plotName}\n${t('plotExport.memberCount', { count: plants.length })}\n\n`;
    const body = enrichedPlants.map(({ plant, ageLabel }) => {
      const lines = [plant.name];
      if (ageLabel) lines.push(`  ${t('plotExport.ageLabel')}: ${ageLabel}`);
      if (plant.phone) lines.push(`  ${t('plotExport.phoneLabel')}: ${plant.phone}`);
      if (plant.description) lines.push(`  ${t('plotExport.descriptionLabel')}: ${plant.description}`);
      return lines.join('\n');
    }).join('\n\n');
    return header + body;
  };

  const buildRichHtml = (): string => {
    const cards = enrichedPlants.map(({ plant, ageLabel }) => {
      const fields: string[] = [];
      if (ageLabel) {
        fields.push(`<tr><td style="padding:2px 8px 2px 0;color:#6b7280;font-size:13px;white-space:nowrap;">${t('plotExport.ageLabel')}</td><td style="padding:2px 0;color:#374151;font-size:13px;">${ageLabel}</td></tr>`);
      }
      if (plant.phone) {
        fields.push(`<tr><td style="padding:2px 8px 2px 0;color:#6b7280;font-size:13px;white-space:nowrap;">${t('plotExport.phoneLabel')}</td><td style="padding:2px 0;color:#374151;font-size:13px;">${plant.phone}</td></tr>`);
      }
      if (plant.description) {
        fields.push(`<tr><td style="padding:2px 8px 2px 0;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top;">${t('plotExport.descriptionLabel')}</td><td style="padding:2px 0;color:#374151;font-size:13px;">${plant.description}</td></tr>`);
      }
      return `<div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:12px;background:#ffffff;">
<h3 style="margin:0 0 10px 0;font-size:16px;font-weight:600;color:#111827;">${plant.name}</h3>
<table style="border-collapse:collapse;">${fields.join('')}</table>
</div>`;
    }).join('');
    return `<h2 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 4px 0;">${plotName}</h2>
<p style="margin:0 0 16px 0;font-size:14px;color:#6b7280;">${t('plotExport.memberCount', { count: plants.length })}</p>
${cards}`;
  };

  const handleCopy = async () => {
    try {
      const html = buildRichHtml();
      const plain = buildPlainString();
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        }),
      ]);
    } catch {
      await navigator.clipboard.writeText(buildPlainString());
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    const text = buildPlainString();
    if (navigator.share) {
      await navigator.share({ title: plotName, text });
    } else {
      handleCopy();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 flex-shrink-0">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4 text-green-700" />
            </div>
            <div className="min-w-0">
              <h1 className="font-semibold text-gray-900 text-base truncate">{plotName}</h1>
              <p className="text-xs text-gray-500">{t('plotExport.memberCount', { count: plants.length })}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 transition-colors"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">{t('plotExport.share')}</span>
            </button>
            <button
              onClick={handleCopy}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                copied ? 'bg-green-600 text-white' : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              <Copy className="w-4 h-4" />
              <span className="hidden sm:inline">{copied ? t('plotExport.copied') : t('plotExport.copy')}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Plant list */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-3">
          {enrichedPlants.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-sm text-gray-400">{t('plotExport.noPlants')}</p>
            </div>
          ) : (
            enrichedPlants.map(({ plant, ageLabel }) => (
              <div
                key={plant.id}
                className="bg-white rounded-2xl border border-gray-100 p-5"
              >
                <h3 className="text-base font-semibold text-gray-900 mb-3">{plant.name}</h3>
                <div className="space-y-2">
                  {ageLabel && (
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="text-xs text-gray-500 w-20">{t('plotExport.ageLabel')}</span>
                      <span className="text-sm text-gray-700">{ageLabel}</span>
                    </div>
                  )}
                  {plant.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="text-xs text-gray-500 w-20">{t('plotExport.phoneLabel')}</span>
                      <PhoneLink
                        phone={plant.phone}
                        className="text-sm text-blue-600 hover:text-blue-700 hover:underline transition-colors"
                        iconClassName="w-3 h-3"
                      />
                    </div>
                  )}
                  {plant.description && (
                    <div className="flex items-start gap-2">
                      <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                      <span className="text-xs text-gray-500 w-20 flex-shrink-0">{t('plotExport.descriptionLabel')}</span>
                      <span className="text-sm text-gray-700 leading-relaxed">{plant.description}</span>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
