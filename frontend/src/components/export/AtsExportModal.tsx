'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileDown, FileText, FileCode, X, Download, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { fetchWithAuth } from '@/lib/apiClient';
import { ATSExportData, convertAtsToCsv, downloadAtsFile } from '@/lib/atsExport';
import { useRecruitment } from '@/context/RecruitmentContext';

interface AtsExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AtsExportModal({ isOpen, onClose }: AtsExportModalProps) {
  const { activeSessionId } = useRecruitment();
  const [format, setFormat] = useState<'json' | 'csv'>('json');
  const [data, setData] = useState<ATSExportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchExport = async (fmt: 'json' | 'csv') => {
    if (!activeSessionId) {
      setError('No active hiring campaign — create or select a session first.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/export/ats', {
        method: 'POST',
        body: JSON.stringify({ format: fmt, session_id: activeSessionId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail || `Export failed (${res.status})`);
      }
      // Backend returns JSON for json format, or JSON-wrapped CSV? Handle both
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('text/csv')) {
        const csvText = await res.text();
        // Wrap as ATSExportData for preview
        setData({
          format: 'csv',
          evaluations_count: csvText.split('\n').length - 1,
          export_timestamp: new Date().toISOString(),
          evaluations: {} as any,
        });
        // Store csv text for direct download
        (setData as any)._rawCsv = csvText;
      } else {
        const j = (await res.json()) as ATSExportData;
        setData(j);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to fetch ATS export');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchExport(format);
    } else {
      setData(null);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleSwitchFormat = (fmt: 'json' | 'csv') => {
    setFormat(fmt);
    fetchExport(fmt);
  };

  const handleDownload = () => {
    if (!data) return;
    // If CSV raw present (backend returned text/csv), download it directly
    const rawCsv = (data as any)._rawCsv as string | undefined;
    if (format === 'csv' && rawCsv) {
      const blob = new Blob([rawCsv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ats_export_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }
    downloadAtsFile(data, format);
  };

  const preview = data
    ? format === 'json'
      ? JSON.stringify(data, null, 2).slice(0, 4000)
      : convertAtsToCsv(data).slice(0, 4000)
    : '';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10 flex flex-col max-h-[90vh]"
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
              <FileDown className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">ATS Export — Greenhouse / Lever / Workday</h2>
              <p className="text-xs text-slate-500">Validated JSON or CSV with rubric scores and status</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          {[
            { id: 'json', label: 'JSON Payload', icon: FileCode },
            { id: 'csv', label: 'CSV Spreadsheet', icon: FileText },
          ].map((opt) => {
            const Icon = opt.icon;
            const active = format === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => handleSwitchFormat(opt.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {opt.label}
              </button>
            );
          })}
          <span className="ml-auto text-xs text-slate-500">
            {data ? `${data.evaluations_count} candidates` : loading ? 'Loading...' : ''}
          </span>
        </div>

        <div className="flex-1 overflow-auto p-6 bg-slate-50/30 custom-scrollbar">
          {loading && (
            <div className="flex items-center justify-center py-16 gap-2 text-slate-500 text-sm">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Fetching ATS payload...
            </div>
          )}
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-3 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {!loading && !error && data && (
            <>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Preview ({format.toUpperCase()})</div>
                <pre className="text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-xl p-3 overflow-auto max-h-64 custom-scrollbar font-mono leading-relaxed">
                  {preview}
                  {preview.length >= 4000 && '\n... truncated preview — download full file'}
                </pre>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Validated Pydantic schema — ready for Greenhouse / Lever / Workday import.
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-600 text-xs font-semibold rounded-xl hover:bg-slate-50 cursor-pointer">
            Close
          </button>
          <button
            onClick={handleDownload}
            disabled={!data || loading}
            className="px-5 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Download {format.toUpperCase()}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
