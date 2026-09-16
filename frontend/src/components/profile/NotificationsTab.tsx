import React from 'react';
import { 
  Mail, 
  Volume2, 
  VolumeX 
} from 'lucide-react';

export interface NotificationsTabProps {
  emailAlerts: boolean;
  setEmailAlerts: (val: boolean) => void;
  digestFrequency: 'instant' | 'daily' | 'weekly' | 'off';
  setDigestFrequency: (val: 'instant' | 'daily' | 'weekly' | 'off') => void;
  soundEffects: boolean;
  setSoundEffects: (val: boolean) => void;
  onSave: (e: React.FormEvent) => void;
}

export const NotificationsTab: React.FC<NotificationsTabProps> = ({
  emailAlerts,
  setEmailAlerts,
  digestFrequency,
  setDigestFrequency,
  soundEffects,
  setSoundEffects,
  onSave,
}) => {
  return (
    <form id="profile-form" onSubmit={onSave} className="space-y-4">
      {/* Email Alerts */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-900">Email Alerts on High-Score Matches</span>
            <Mail className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Receive instant email notifications whenever an uploaded resume achieves &gt;90% match against active positions.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEmailAlerts(!emailAlerts)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            emailAlerts ? 'bg-brand-primary' : 'bg-slate-200'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
              emailAlerts ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Digest Frequency */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2">
        <span className="text-sm font-bold text-slate-900">Talent Pipeline Digest Frequency</span>
        <p className="text-xs text-slate-500">Summary reports sent to your email.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          {[
            { id: 'instant', label: 'Real-time' },
            { id: 'daily', label: 'Daily Digest' },
            { id: 'weekly', label: 'Weekly' },
            { id: 'off', label: 'Muted' },
          ].map((freq) => (
            <button
              key={freq.id}
              type="button"
              onClick={() => setDigestFrequency(freq.id as any)}
              className={`py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                digestFrequency === freq.id
                  ? 'bg-brand-primary text-white border-brand-primary shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {freq.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sound Effects */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-900">UI Audio & Haptic Feedback</span>
            {soundEffects ? <Volume2 className="w-4 h-4 text-emerald-600" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
          </div>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Play gentle completion tones when candidate evaluation pipelines and ATS exports finish.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSoundEffects(!soundEffects)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            soundEffects ? 'bg-brand-primary' : 'bg-slate-200'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
              soundEffects ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </form>
  );
};
