'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth, UserProfile, UserPreferences } from '@/context/AuthContext';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { 
  User, 
  Sparkles, 
  Sliders, 
  Bell, 
  Lock, 
  X, 
  Save, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';
import { ProfileTab } from './profile/ProfileTab';
import { PreferencesTab } from './profile/PreferencesTab';
import { NotificationsTab } from './profile/NotificationsTab';
import { SecurityTab } from './profile/SecurityTab';

export type ProfileTabType = 'profile' | 'preferences' | 'notifications' | 'security';

export interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: ProfileTabType;
}

export default function ProfileModal({ isOpen, onClose, initialTab = 'profile' }: ProfileModalProps) {
  const { user, profile, updateProfile, updatePassword, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<ProfileTabType>(initialTab);

  // Profile fields state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('recruiter');
  const [companyName, setCompanyName] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  // Preferences state
  const [blindModeDefault, setBlindModeDefault] = useState(true);
  const [autoRubric, setAutoRubric] = useState(true);
  const [matchThreshold, setMatchThreshold] = useState(75);
  const [defaultExportFormat, setDefaultExportFormat] = useState<'pdf' | 'csv' | 'json'>('pdf');

  // Notifications state
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [digestFrequency, setDigestFrequency] = useState<'instant' | 'daily' | 'weekly' | 'off'>('instant');
  const [soundEffects, setSoundEffects] = useState(true);

  // Feedback states
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Hydrate fields from user / profile on open
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

      setEmailAlerts(prefs.email_alerts !== false);
      setDigestFrequency((prefs.digest_frequency as any) || 'instant');
      setSoundEffects(prefs.sound_effects !== false);

      setSaveSuccess(false);
      setSaveError('');
    }
  }, [isOpen, profile, user]);

  const modalRef = useRef<HTMLDivElement>(null);

  useFocusTrap(modalRef, {
    isActive: isOpen,
    onEscape: onClose,
    autoFocus: true,
  });

  // Centralized Profile Save handler
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    setSaveSuccess(false);

    const updatedPreferences: UserPreferences = {
      ...(profile?.preferences || {}),
      blind_mode_default: blindModeDefault,
      auto_rubric: autoRubric,
      match_threshold: matchThreshold,
      default_export_format: defaultExportFormat,
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

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      aria-describedby="profile-modal-desc"
    >
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
      />

      {/* Modal Dialog Card */}
      <motion.div
        ref={modalRef}
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10 flex flex-col max-h-[90vh] outline-none"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 id="profile-modal-title" className="text-base font-bold text-slate-900">Account &amp; System Preferences</h2>
              <p id="profile-modal-desc" className="text-xs text-slate-500">Manage your recruiter identity, screening thresholds, and security</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            aria-label="Close profile settings modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Segmented Tab Navigation with Spring Glide */}
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
                  onClick={() => setActiveTab(tab.id as ProfileTabType)}
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

        {/* Modal Body: Animated Tab Transition to Decomposed Subcomponents (ARCH-8) */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-50/30">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10, scale: 0.995 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.995 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              {activeTab === 'profile' && (
                <ProfileTab
                  fullName={fullName}
                  setFullName={setFullName}
                  phone={phone}
                  setPhone={setPhone}
                  role={role}
                  setRole={setRole}
                  companyName={companyName}
                  setCompanyName={setCompanyName}
                  companyWebsite={companyWebsite}
                  setCompanyWebsite={setCompanyWebsite}
                  avatarUrl={avatarUrl}
                  setAvatarUrl={setAvatarUrl}
                  userEmail={user?.email}
                  onSave={handleSaveProfile}
                />
              )}

              {activeTab === 'preferences' && (
                <PreferencesTab
                  blindModeDefault={blindModeDefault}
                  setBlindModeDefault={setBlindModeDefault}
                  autoRubric={autoRubric}
                  setAutoRubric={setAutoRubric}
                  matchThreshold={matchThreshold}
                  setMatchThreshold={setMatchThreshold}
                  defaultExportFormat={defaultExportFormat}
                  setDefaultExportFormat={setDefaultExportFormat}
                  onSave={handleSaveProfile}
                />
              )}

              {activeTab === 'notifications' && (
                <NotificationsTab
                  emailAlerts={emailAlerts}
                  setEmailAlerts={setEmailAlerts}
                  digestFrequency={digestFrequency}
                  setDigestFrequency={setDigestFrequency}
                  soundEffects={soundEffects}
                  setSoundEffects={setSoundEffects}
                  onSave={handleSaveProfile}
                />
              )}

              {activeTab === 'security' && (
                <SecurityTab
                  userId={user?.id}
                  userEmail={user?.email}
                  onUpdatePassword={updatePassword}
                  onLogout={logout}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Modal Footer (Save & Feedback) */}
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
