'use client';

import { useState, useEffect, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth, UserProfile, UserPreferences } from '@/context/AuthContext';
import { 
  User, 
  Building2, 
  Globe, 
  Phone, 
  Mail, 
  ShieldCheck, 
  Sparkles, 
  Sliders, 
  Bell, 
  Lock, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  Check, 
  X, 
  Save, 
  LogOut,
  FileSpreadsheet,
  FileText,
  FileCode,
  Volume2,
  VolumeX,
  RefreshCw,
  Briefcase
} from 'lucide-react';

export type ProfileTab = 'profile' | 'preferences' | 'notifications' | 'security';

export interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: ProfileTab;
}

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

export default function ProfileModal({ isOpen, onClose, initialTab = 'profile' }: ProfileModalProps) {
  const { user, profile, updateProfile, updatePassword, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<ProfileTab>(initialTab);

  // Form states initialized from user / profile
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('recruiter');
  const [companyName, setCompanyName] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  // Preferences states
  const [blindModeDefault, setBlindModeDefault] = useState(true);
  const [autoRubric, setAutoRubric] = useState(true);
  const [matchThreshold, setMatchThreshold] = useState(75);
  const [defaultExportFormat, setDefaultExportFormat] = useState<'pdf' | 'csv' | 'json'>('pdf');
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system');

  // Notifications states
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [digestFrequency, setDigestFrequency] = useState<'instant' | 'daily' | 'weekly' | 'off'>('instant');
  const [soundEffects, setSoundEffects] = useState(true);

  // Security password state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // General form feedback
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [copiedId, setCopiedId] = useState(false);

  // Unique accessible IDs
  const nameId = useId();
  const phoneId = useId();
  const companyId = useId();
  const websiteId = useId();
  const avatarId = useId();

  // Populate local form fields when modal opens or profile loads
  useEffect(() => {
    if (isOpen) {
      setFullName(profile?.full_name || user?.user_metadata?.full_name || '');
      setPhone(profile?.phone || '');
      setRole(profile?.role || 'recruiter');
      setCompanyName(profile?.company_name || '');
      setCompanyWebsite(profile?.company_website || '');
      setAvatarUrl(profile?.avatar_url || user?.user_metadata?.avatar_url || '');

      const prefs: UserPreferences = profile?.preferences || {};
      setBlindModeDefault(prefs.blind_mode_default !== false);
      setAutoRubric(prefs.auto_rubric !== false);
      setMatchThreshold(Number(prefs.match_threshold) || 75);
      setDefaultExportFormat((prefs.default_export_format as any) || 'pdf');
      setTheme((prefs.theme as any) || 'system');

      setEmailAlerts(prefs.email_alerts !== false);
      setDigestFrequency((prefs.digest_frequency as any) || 'instant');
      setSoundEffects(prefs.sound_effects !== false);

      setSaveSuccess(false);
      setSaveError('');
      setPasswordSuccess('');
      setPasswordError('');
      setNewPassword('');
      setConfirmPassword('');
    }
  }, [isOpen, profile, user]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Copy User UUID
  const handleCopyId = () => {
    if (user?.id) {
      navigator.clipboard.writeText(user.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  // Save all profile and preference modifications
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    setSaveError('');

    const updatedPreferences: UserPreferences = {
      ...(profile?.preferences || {}),
      blind_mode_default: blindModeDefault,
      auto_rubric: autoRubric,
      match_threshold: matchThreshold,
      default_export_format: defaultExportFormat,
      theme,
      email_alerts: emailAlerts,
      digest_frequency: digestFrequency,
      sound_effects: soundEffects,
    };

    const updates: Partial<UserProfile> = {
      full_name: fullName.trim(),
      phone: phone.trim() || null,
      role,
      company_name: companyName.trim() || null,
      company_website: companyWebsite.trim() || null,
      avatar_url: avatarUrl.trim() || null,
      preferences: updatedPreferences,
    };

    const { error } = await updateProfile(updates);

    setSaving(false);
    if (error) {
      setSaveError(error.message || 'Failed to update profile. Please try again.');
    } else {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  // Update password in security tab
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setPasswordLoading(true);
    const { error } = await updatePassword(newPassword);
    setPasswordLoading(false);

    if (error) {
      setPasswordError(error.message || 'Failed to update password.');
    } else {
      setPasswordSuccess('Password successfully updated!');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(''), 4000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 15 }}
        transition={{ type: 'spring', damping: 26, stiffness: 350 }}
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-brand-primary">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold text-slate-900 tracking-tight">Account & Profile Settings</h2>
              <p className="text-xs text-slate-500">Manage your recruiter identity, screening preferences, and security</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modern Segmented Tab Switcher with Spring Glide Physics */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200">
          <div className="flex bg-slate-200/70 p-1 rounded-xl relative gap-1">
            {[
              { id: 'profile', label: 'Profile & Info', icon: User },
              { id: 'preferences', label: 'AI & Screening', icon: Sliders },
              { id: 'notifications', label: 'Notifications', icon: Bell },
              { id: 'security', label: 'Security & Auth', icon: Lock },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as ProfileTab)}
                  className={`flex-1 relative py-2 px-3 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer z-10 select-none ${
                    isActive ? 'text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeProfileTabPill"
                      transition={{ type: 'spring', damping: 26, stiffness: 380 }}
                      className="absolute inset-0 bg-white rounded-lg shadow-sm border border-slate-200/80 -z-10"
                    />
                  )}
                  <Icon className={`w-3.5 h-3.5 transition-colors ${isActive ? 'text-brand-primary' : 'text-slate-400'}`} />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Modal Body: Animated Tab Content Transition */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-50/30">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10, scale: 0.995 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.995 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* TAB 1: PROFILE & COMPANY */}
              {activeTab === 'profile' && (
            <form id="profile-form" onSubmit={handleSaveProfile} className="space-y-5">
              {/* Avatar & Quick Identity */}
              <div className="flex items-center gap-4 p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
                <div className="relative group">
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-indigo-100 flex items-center justify-center text-brand-primary font-bold text-xl border-2 border-white shadow-md">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={fullName || 'Avatar'} className="w-full h-full object-cover" />
                    ) : (
                      <span>{(fullName || user?.email || 'U').charAt(0).toUpperCase()}</span>
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
                  <p className="text-xs text-slate-500 truncate mt-0.5">{user?.email}</p>

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
          )}

          {/* TAB 2: AI & SCREENING PREFERENCES */}
          {activeTab === 'preferences' && (
            <form id="profile-form" onSubmit={handleSaveProfile} className="space-y-4">
              {/* Blind Mode Toggle */}
              <div className="p-4 rounded-xl bg-white border border-slate-200 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">Blind Mode by Default</span>
                    <span className="text-[10px] bg-amber-50 text-amber-800 font-semibold px-2 py-0.5 rounded-full border border-amber-200">
                      Anti-Bias
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Automatically redact candidate names, demographic indicators, photos, and graduation dates before generating semantic scores.
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
          )}

          {/* TAB 3: NOTIFICATIONS */}
          {activeTab === 'notifications' && (
            <form id="profile-form" onSubmit={handleSaveProfile} className="space-y-4">
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
          )}

          {/* TAB 4: SECURITY & AUTH */}
          {activeTab === 'security' && (
            <div className="space-y-5">
              {/* Change Password Form */}
              <form onSubmit={handleUpdatePassword} className="p-4 rounded-xl bg-white border border-slate-200 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" /> Change Account Password
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">New Password</label>
                    <div className="relative flex items-center">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Min 8 characters"
                        minLength={8}
                        className="w-full px-3 py-2 text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-100 pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm New Password</label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat new password"
                      minLength={8}
                      className="w-full px-3 py-2 text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                </div>

                <AnimatePresence>
                  {passwordError && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2 flex items-center gap-2"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{passwordError}</span>
                    </motion.div>
                  )}
                  {passwordSuccess && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{passwordSuccess}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={passwordLoading || newPassword.length < 8}
                    className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    {passwordLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                    <span>Update Password</span>
                  </button>
                </div>
              </form>

              {/* Account UUID & Diagnostics */}
              <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Account Identity</h3>
                
                <div className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 font-mono">USER_ID (UUID)</span>
                    <span className="font-mono text-slate-700 text-xs font-semibold">{user?.id || 'offline_dev'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyId}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-md transition-colors cursor-pointer"
                    title="Copy UUID"
                  >
                    {copiedId ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500 pt-1">
                  <div>
                    <span className="text-slate-400 block">Signed In As</span>
                    <span className="font-semibold text-slate-700">{user?.email}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Row-Level Security</span>
                    <span className="font-semibold text-emerald-600">Active (Tenant Isolated)</span>
                  </div>
                </div>
              </div>

              {/* Danger Zone: Sign Out */}
              <div className="pt-2 flex justify-between items-center border-t border-slate-200">
                <span className="text-xs text-slate-500">End your active session on this device</span>
                <button
                  type="button"
                  onClick={logout}
                  className="px-3.5 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Modal Footer (Save / Feedback) - Visible for Profile, Preferences, and Notifications tabs */}
        {activeTab !== 'security' && (
          <div className="px-6 py-4 border-t border-slate-200 bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AnimatePresence>
                {saveSuccess && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Profile saved successfully!</span>
                  </motion.div>
                )}
                {saveError && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-xs font-semibold text-rose-700 flex items-center gap-1.5 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200"
                  >
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{saveError}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-200 text-slate-600 text-xs font-semibold rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                form="profile-form"
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-brand-primary text-white text-xs font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
