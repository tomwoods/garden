import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, FileText, Download, Copy, Share2, ChevronLeft, Loader } from 'lucide-react';
import dayjs from 'dayjs';
import type { Plant } from '../lib/database';
import {
  buildPlainTextReport,
  generateSharedGardenHarvest,
  downloadHarvestReport,
  type PlainTextReport,
} from '../lib/activityReportService';

type ReportFormat = 'plain_text' | 'harvest';

interface Props {
  gardenId: string;
  plants: Plant[];
  onClose: () => void;
}

function defaultFrom(): string {
  return dayjs().subtract(30, 'day').startOf('day').format('YYYY-MM-DDTHH:mm');
}

function defaultTo(): string {
  return dayjs().endOf('day').format('YYYY-MM-DDTHH:mm');
}

export const ActivityReportModal: React.FC<Props> = ({ gardenId, plants, onClose }) => {
  const { t } = useTranslation('garden_shared');

  const [format, setFormat] = useState<ReportFormat>('plain_text');
  const [fromValue, setFromValue] = useState(defaultFrom);
  const [toValue, setToValue] = useState(defaultTo);
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState<PlainTextReport | null>(null);
  const [copied, setCopied] = useState(false);

  const reportRef = useRef<HTMLDivElement>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const fromMs = new Date(fromValue).getTime();
      const toMs = new Date(toValue).getTime();

      if (format === 'harvest') {
        const harvestReport = generateSharedGardenHarvest(gardenId, fromMs, toMs, plants);
        downloadHarvestReport(harvestReport);
        onClose();
        return;
      }

      const result = await buildPlainTextReport(gardenId, fromMs, toMs, plants, t);
      setReport(result);
    } finally {
      setGenerating(false);
    }
  };

  const buildPlainString = (): string => {
    if (!report) return '';
    return report.map(day => {
      const lines = [day.dateLabel, ...day.paragraphs.map(p => p.text)];
      return lines.join('\n');
    }).join('\n\n');
  };

  const buildRichHtml = (): string => {
    if (!report) return '';
    return report.map(day => {
      const paras = day.paragraphs.map(p => `<p style="margin:0 0 6px 0;font-size:14px;color:#374151;">${p.text}</p>`).join('');
      return `<h2 style="font-size:18px;font-weight:700;margin:0 0 8px 0;color:#111827;">${day.dateLabel}</h2>${paras}`;
    }).join('<br>');
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
      await navigator.share({ text });
    }
  };

  const handleBack = () => {
    setReport(null);
    setCopied(false);
  };

  const isOutputView = report !== null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100 flex-shrink-0">
        {isOutputView ? (
          <button onClick={handleBack} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
            <ChevronLeft className="w-5 h-5" />
          </button>
        ) : (
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
            <X className="w-5 h-5" />
          </button>
        )}
        <div className="flex items-center gap-2 flex-1">
          <div className="w-7 h-7 bg-green-100 rounded-lg flex items-center justify-center">
            <FileText className="w-4 h-4 text-green-700" />
          </div>
          <h1 className="font-semibold text-gray-900 text-base">{t('activityReport.title')}</h1>
        </div>
        {isOutputView && (
          <div className="flex items-center gap-2">
            {typeof navigator.share === 'function' && (
              <button
                onClick={handleShare}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 transition-colors"
              >
                <Share2 className="w-4 h-4" />
                {t('activityReport.share')}
              </button>
            )}
            <button
              onClick={handleCopy}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                copied
                  ? 'bg-green-600 text-white'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              <Copy className="w-4 h-4" />
              {copied ? t('activityReport.copied') : t('activityReport.copy')}
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      {isOutputView ? (
        <div className="flex-1 overflow-y-auto">
          {report!.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-400 text-sm">{t('activityReport.noResults')}</p>
            </div>
          ) : (
            <div ref={reportRef} className="max-w-2xl mx-auto px-6 py-6 space-y-8">
              {report!.map(day => (
                <div key={day.dateKey}>
                  <h2 className="text-lg font-bold text-gray-900 mb-3 pb-2 border-b border-gray-100">
                    {day.dateLabel}
                  </h2>
                  <div className="space-y-3">
                    {day.paragraphs.map((p, i) => (
                      <p key={i} className="text-sm text-gray-700 leading-relaxed">
                        {p.text}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-lg mx-auto px-6 py-6 space-y-6">
            {/* Format selector */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">{t('activityReport.format')}</label>
              <div className="flex gap-2">
                {(['plain_text', 'harvest'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium border transition-colors ${
                      format === f
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {f === 'plain_text' ? t('activityReport.formatPlainText') : t('activityReport.formatHarvest')}
                  </button>
                ))}
              </div>
              {format === 'harvest' && (
                <p className="text-xs text-gray-400 leading-relaxed">
                  {t('activityReport.harvestNote')}
                </p>
              )}
            </div>

            {/* Date range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">{t('activityReport.from')}</label>
                <input
                  type="datetime-local"
                  value={fromValue}
                  onChange={e => setFromValue(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">{t('activityReport.to')}</label>
                <input
                  type="datetime-local"
                  value={toValue}
                  onChange={e => setToValue(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Generate */}
            <button
              onClick={handleGenerate}
              disabled={generating || !fromValue || !toValue}
              className="w-full py-3 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generating ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  {t('activityReport.generating')}
                </>
              ) : (
                <>
                  {format === 'harvest' ? <Download className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                  {t('activityReport.generateButton')}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
