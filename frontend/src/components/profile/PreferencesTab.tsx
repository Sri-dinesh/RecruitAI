import React from 'react';
import { 
  FileText, 
  FileSpreadsheet, 
  FileCode 
} from 'lucide-react';

export interface PreferencesTabProps {
  blindModeDefault: boolean;
  setBlindModeDefault: (val: boolean) => void;
  autoRubric: boolean;
  setAutoRubric: (val: boolean) => void;
  matchThreshold: number;
  setMatchThreshold: (val: number) => void;
  defaultExportFormat: 'pdf' | 'csv' | 'json';
  setDefaultExportFormat: (val: 'pdf' | 'csv' | 'json') => void;
  onSave: (e: React.FormEvent) => void;
}

export const PreferencesTab: React.FC<PreferencesTabProps> = ({
  blindModeDefault,
  setBlindModeDefault,
  autoRubric,
  setAutoRubric,
  matchThreshold,
  setMatchThreshold,
  defaultExportFormat,
  setDefaultExportFormat,
  onSave,
}) => {
  return (
    <form id="profile-form" onSubmit={onSave} className="space-y-4">
      {/* Blind Mode Toggle */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-900">
              {blindModeDefault ? 'Blind Mode (Enabled)' : 'Standard Mode (Default)'}
            </span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
              blindModeDefault
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-slate-50 text-slate-600 border-slate-200'
            }`}>
              {blindModeDefault ? 'Anti-Bias Masking' : 'Standard Default'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            {blindModeDefault
              ? 'Automatically redact candidate names and demographics before scoring.'
              : 'Standard Mode displays full candidate profiles and contact details by default.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setBlindModeDefault(!blindModeDefault)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            blindModeDefault ? 'bg-brand-primary' : 'bg-slate-200'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
              blindModeDefault ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Auto Rubric Generator */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-900">Auto-Generate Evaluation Rubrics</span>
            <span className="text-[10px] bg-indigo-50 text-brand-primary font-semibold px-2 py-0.5 rounded-full border border-indigo-100">
              LangGraph
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            When you upload a Job Description, automatically decompose it into 5-pillar evaluation rubrics with hard and soft skill requirements.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAutoRubric(!autoRubric)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            autoRubric ? 'bg-brand-primary' : 'bg-slate-200'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
              autoRubric ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Default Candidate Match Threshold */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2.5">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-bold text-slate-900">Candidate Match Highlight Threshold</span>
            <p className="text-xs text-slate-500 mt-0.5">Highlight top-fit candidates exceeding this rubric percentage score.</p>
          </div>
          <span className="font-mono text-sm font-bold text-brand-primary bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100">
            {matchThreshold}%
          </span>
        </div>

        <div className="flex items-center gap-2 pt-1">
          {[60, 70, 75, 80, 85, 90].map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => setMatchThreshold(val)}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                matchThreshold === val
                  ? 'bg-brand-primary text-white border-brand-primary shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {val}%
            </button>
          ))}
        </div>
      </div>

      {/* Default Export Format */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2">
        <span className="text-sm font-bold text-slate-900">Default ATS Export Format</span>
        <p className="text-xs text-slate-500">Choose preferred candidate evaluation download format.</p>
        <div className="grid grid-cols-3 gap-2 pt-1">
          {[
            { id: 'pdf', label: 'PDF Summary', icon: FileText },
            { id: 'csv', label: 'CSV Spreadsheet', icon: FileSpreadsheet },
            { id: 'json', label: 'JSON Payload', icon: FileCode },
          ].map((fmt) => {
            const Icon = fmt.icon;
            const isSelected = defaultExportFormat === fmt.id;
            return (
              <button
                key={fmt.id}
                type="button"
                onClick={() => setDefaultExportFormat(fmt.id as any)}
                className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-brand-primary text-white border-brand-primary shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{fmt.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </form>
  );
};
