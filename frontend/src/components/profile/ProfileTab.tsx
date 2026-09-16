import React, { useId } from 'react';
import { 
  User, 
  Phone, 
  Briefcase, 
  Building2, 
  Globe, 
  ShieldCheck, 
  Check 
} from 'lucide-react';

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80',
];

const ROLES = [
  { value: 'recruiter', label: 'Recruiter', description: 'Manages candidate pipelines, AI screening, and recruitment workflows' },
  { value: 'employer', label: 'Employer', description: 'Resume ATS scoring and benchmarks' },
];

export interface ProfileTabProps {
  fullName: string;
  setFullName: (val: string) => void;
  phone: string;
  setPhone: (val: string) => void;
  role: string;
  setRole: (val: string) => void;
  companyName: string;
  setCompanyName: (val: string) => void;
  companyWebsite: string;
  setCompanyWebsite: (val: string) => void;
  avatarUrl: string;
  setAvatarUrl: (val: string) => void;
  userEmail?: string;
  onSave: (e: React.FormEvent) => void;
}

export const ProfileTab: React.FC<ProfileTabProps> = ({
  fullName,
  setFullName,
  phone,
  setPhone,
  role,
  setRole,
  companyName,
  setCompanyName,
  companyWebsite,
  setCompanyWebsite,
  avatarUrl,
  setAvatarUrl,
  userEmail,
  onSave,
}) => {
  const nameId = useId();
  const phoneId = useId();
  const companyId = useId();
  const websiteId = useId();
  const avatarId = useId();

  return (
    <form id="profile-form" onSubmit={onSave} className="space-y-5">
      {/* Avatar & Quick Identity */}
      <div className="flex items-center gap-4 p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
        <div className="relative group">
          <div className="w-16 h-16 rounded-full overflow-hidden bg-indigo-100 flex items-center justify-center text-brand-primary font-bold text-xl border-2 border-white shadow-md">
            {avatarUrl ? (
              <img src={avatarUrl} alt={fullName || 'Avatar'} className="w-full h-full object-cover" />
            ) : (
              <span>{(fullName || userEmail || 'U').charAt(0).toUpperCase()}</span>
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-slate-900 truncate">
              {fullName || 'Recruiter'}
            </span>
            <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Verified
            </span>
          </div>
          <p className="text-xs text-slate-500 truncate mt-0.5">{userEmail}</p>

          {/* Preset Avatar Selection */}
          <div className="flex items-center gap-1.5 mt-2">
            <span className="text-[11px] text-slate-400">Presets:</span>
            {PRESET_AVATARS.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setAvatarUrl(p)}
                className={`w-5 h-5 rounded-full overflow-hidden border transition-transform hover:scale-115 ${
                  avatarUrl === p ? 'border-brand-primary ring-2 ring-indigo-200' : 'border-slate-200'
                }`}
                title={`Select Avatar ${idx + 1}`}
              >
                <img src={p} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
            {avatarUrl && (
              <button
                type="button"
                onClick={() => setAvatarUrl('')}
                className="text-[10px] text-rose-500 hover:underline ml-1 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Profile Inputs Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor={nameId} className="block text-xs font-semibold text-slate-700 mb-1.5">
            Full Name <span className="text-rose-500">*</span>
          </label>
          <div className="relative flex items-center">
            <User className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
            <input
              id={nameId}
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Sarah Jenkins"
              required
              className="w-full pl-9 pr-3 py-2 text-sm text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-brand-primary"
            />
          </div>
        </div>

        <div>
          <label htmlFor={phoneId} className="block text-xs font-semibold text-slate-700 mb-1.5">
            Phone Number
          </label>
          <div className="relative flex items-center">
            <Phone className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
            <input
              id={phoneId}
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (555) 234-5678"
              className="w-full pl-9 pr-3 py-2 text-sm text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-brand-primary"
            />
          </div>
        </div>
      </div>

      {/* Role Selection */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
          Job Title / Recruiter Role
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ROLES.map((r) => (
            <div
              key={r.value}
              onClick={() => setRole(r.value)}
              className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-1 ${
                role === r.value
                  ? 'border-brand-primary bg-indigo-50/50 shadow-xs ring-1 ring-indigo-200'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-brand-primary" />
                  {r.label}
                </span>
                {role === r.value && <Check className="w-4 h-4 text-brand-primary" />}
              </div>
              <span className="text-[11px] text-slate-500 leading-snug">{r.description}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Company & Organization Details */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5" /> Company Information
        </h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={companyId} className="block text-xs font-semibold text-slate-700 mb-1">
              Company Name
            </label>
            <input
              id={companyId}
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Acme Tech Inc."
              className="w-full px-3 py-2 text-sm text-slate-800 bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-brand-primary"
            />
          </div>

          <div>
            <label htmlFor={websiteId} className="block text-xs font-semibold text-slate-700 mb-1">
              Company Website
            </label>
            <div className="relative flex items-center">
              <Globe className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
              <input
                id={websiteId}
                type="url"
                value={companyWebsite}
                onChange={(e) => setCompanyWebsite(e.target.value)}
                placeholder="https://acme.com"
                className="w-full pl-9 pr-3 py-2 text-sm text-slate-800 bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-brand-primary"
              />
            </div>
          </div>
        </div>

        <div>
          <label htmlFor={avatarId} className="block text-xs font-semibold text-slate-700 mb-1">
            Custom Avatar Image URL
          </label>
          <input
            id={avatarId}
            type="url"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://example.com/avatar.png"
            className="w-full px-3 py-2 text-sm text-slate-800 bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-brand-primary"
          />
        </div>
      </div>
    </form>
  );
};
