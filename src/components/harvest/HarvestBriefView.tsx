import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, FileText, Download, Loader2, X, AlertCircle, Plus } from 'lucide-react';
import { mergeReports, computeAll } from '../../lib/collectivePulseService';
import { HarvestBriefDocument } from './HarvestBriefDocument';
import type { HarvestReport } from '../../lib/harvestService';
import type { CollectivePulse } from '../../lib/collectivePulseService';

interface LoadedReport {
  name: string;
  report: HarvestReport;
}

function validateReport(obj: unknown): obj is HarvestReport {
  if (typeof obj !== 'object' || obj === null) return false;
  const r = obj as Record<string, unknown>;
  return (
    typeof r.schema_version === 'number' &&
    typeof r.generated_at === 'number' &&
    typeof r.date_range === 'object' &&
    Array.isArray(r.plants) &&
    Array.isArray(r.tendings) &&
    Array.isArray(r.waterings) &&
    Array.isArray(r.sunlight) &&
    Array.isArray(r.fruits) &&
    Array.isArray(r.prunings) &&
    Array.isArray(r.plots)
  );
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatFileDate(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const HarvestBriefView: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const briefRef = useRef<HTMLDivElement>(null);
  const previewWrapperRef = useRef<HTMLDivElement>(null);
  const [loadedReports, setLoadedReports] = useState<LoadedReport[]>([]);
  const [pulse, setPulse] = useState<CollectivePulse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [coordinatorName, setCoordinatorName] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewScale, setPreviewScale] = useState(1);

  useEffect(() => {
    if (!pulse) return;
    const el = previewWrapperRef.current;
    if (!el) return;
    const observe = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        setPreviewScale(Math.min(1, w / 794));
      }
    });
    observe.observe(el);
    return () => observe.disconnect();
  }, [pulse]);

  const processFiles = useCallback(async (files: FileList | File[]) => {
    setError(null);
    const newReports: LoadedReport[] = [];

    for (const file of Array.from(files)) {
      if (!file.name.endsWith('.json')) {
        setError(`"${file.name}" is not a JSON file. Please use files exported from the harvest report.`);
        continue;
      }

      try {
        const text = await file.text();
        const parsed = JSON.parse(text);

        if (!validateReport(parsed)) {
          setError(`"${file.name}" does not appear to be a valid harvest report.`);
          continue;
        }

        const existing = loadedReports.find(r => r.name === file.name);
        if (!existing) {
          newReports.push({ name: file.name, report: parsed as HarvestReport });
        }
      } catch {
        setError(`Could not read "${file.name}". The file may be corrupted.`);
      }
    }

    if (newReports.length > 0) {
      const all = [...loadedReports, ...newReports];
      setLoadedReports(all);
      const merged = mergeReports(all.map(r => r.report));
      setPulse(computeAll(merged));
    }
  }, [loadedReports]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const removeReport = (name: string) => {
    const remaining = loadedReports.filter(r => r.name !== name);
    setLoadedReports(remaining);
    if (remaining.length > 0) {
      const merged = mergeReports(remaining.map(r => r.report));
      setPulse(computeAll(merged));
    } else {
      setPulse(null);
    }
  };

  const handleDownloadPdf = async () => {
    if (!briefRef.current || !pulse) return;
    setIsGenerating(true);

    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      const scaleWrapper = briefRef.current.parentElement as HTMLElement | null;
      const savedTransform = scaleWrapper?.style.transform ?? '';
      const savedOrigin = scaleWrapper?.style.transformOrigin ?? '';
      if (scaleWrapper) {
        scaleWrapper.style.transform = 'none';
        scaleWrapper.style.transformOrigin = 'unset';
      }

      const canvas = await html2canvas(briefRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: 794,
      });

      if (scaleWrapper) {
        scaleWrapper.style.transform = savedTransform;
        scaleWrapper.style.transformOrigin = savedOrigin;
      }

      const A4_WIDTH_MM = 210;
      const A4_HEIGHT_MM = 297;
      const imgWidthMm = A4_WIDTH_MM;
      const imgHeightMm = (canvas.height * A4_WIDTH_MM) / canvas.width;

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      let yOffset = 0;
      let pageHeightPx = (A4_HEIGHT_MM / A4_WIDTH_MM) * canvas.width;

      while (yOffset < canvas.height) {
        if (yOffset > 0) {
          pdf.addPage();
        }

        const sliceHeight = Math.min(pageHeightPx, canvas.height - yOffset);
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeight;
        const ctx = pageCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(canvas, 0, -yOffset);
        }

        const sliceHeightMm = (sliceHeight / canvas.width) * A4_WIDTH_MM;
        pdf.addImage(pageCanvas.toDataURL('image/png'), 'PNG', 0, 0, imgWidthMm, sliceHeightMm);
        yOffset += pageHeightPx;
      }

      const filename = `harvest-brief-${formatFileDate(pulse.dateRange.to)}.pdf`;
      pdf.save(filename);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      <header className="bg-white shadow-sm border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/settings')}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <FileText className="w-5 h-5 text-green-700" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">Harvest Brief</h1>
                  <p className="text-xs text-gray-500">Collective care patterns report</p>
                </div>
              </div>
            </div>
            {pulse && (
              <button
                onClick={handleDownloadPdf}
                disabled={isGenerating}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {isGenerating ? 'Generating…' : 'Download PDF'}
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-200 cursor-pointer
            ${isDragging
              ? 'border-green-500 bg-green-50 scale-[1.01]'
              : 'border-gray-300 bg-white hover:border-green-400 hover:bg-green-50/30'
            }`}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <Upload className={`w-10 h-10 mx-auto mb-3 transition-colors ${isDragging ? 'text-green-600' : 'text-gray-400'}`} />
          <p className="text-base font-medium text-gray-700 mb-1">
            {loadedReports.length === 0 ? 'Drop harvest reports here' : 'Add more reports'}
          </p>
          <p className="text-sm text-gray-500">
            Drag and drop <code className="text-xs bg-gray-100 px-1 rounded">garden-harvest-*.json</code> files, or click to browse
          </p>
          <p className="text-xs text-gray-400 mt-2">Multiple files will be merged into one brief</p>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {loadedReports.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700">
                Loaded Reports ({loadedReports.length})
              </h2>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 text-xs text-green-700 hover:text-green-800 font-medium"
              >
                <Plus className="w-3 h-3" />
                Add more
              </button>
            </div>
            <div className="space-y-2">
              {loadedReports.map(r => (
                <div
                  key={r.name}
                  className="flex items-center justify-between bg-white rounded-xl border border-gray-100 px-4 py-2.5 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-gray-800 truncate max-w-[240px]">{r.name}</div>
                      <div className="text-xs text-gray-400">
                        {formatDate(r.report.date_range.from)} — {formatDate(r.report.date_range.to)} ·{' '}
                        {r.report.plants.length} soul{r.report.plants.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => removeReport(r.name)}
                    className="p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {pulse && (
          <div className="mt-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Coordinator name <span className="text-gray-400 font-normal">(optional — appears on printed brief)</span>
              </label>
              <input
                type="text"
                value={coordinatorName}
                onChange={e => setCoordinatorName(e.target.value)}
                placeholder="e.g. the Institute coordinator"
                className="w-full max-w-sm px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
              />
            </div>
          </div>
        )}

        {pulse && (
          <div className="mt-6 space-y-1">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">Brief Preview</h2>
              {pulse && (
              <button
                onClick={handleDownloadPdf}
                disabled={isGenerating}
                className="flex mb-2 items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {isGenerating ? 'Generating…' : 'Download PDF'}
              </button>
            )}
            </div>
            <div
              ref={previewWrapperRef}
              className="w-full overflow-hidden rounded-2xl border border-gray-200 shadow-md bg-gray-100"
              style={{ height: `${794 * previewScale}px`, display: 'flex', justifyContent: 'center' }}
            >
              <div
                style={{
                  transform: `scale(${previewScale})`,
                  transformOrigin: 'top center',
                  width: '794px',
                  flexShrink: 0,
                }}
              >
                <div ref={briefRef}>
                  <HarvestBriefDocument
                    pulse={pulse}
                    reportCount={loadedReports.length}
                    coordinatorName={coordinatorName || undefined}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {loadedReports.length === 0 && (
          <div className="mt-10 text-center">
            <div className="inline-block bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5 max-w-md">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">How this works</h3>
              <ol className="text-sm text-gray-500 text-left space-y-2 list-decimal list-inside">
                <li>Each gardener exports their harvest report from Settings</li>
                <li>Reports are shared with the group coordinator</li>
                <li>The coordinator loads all reports here</li>
                <li>A collective brief is generated — no names, no private details</li>
                <li>Download as PDF to share with the community</li>
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
