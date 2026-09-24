import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Lock, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  CheckCircle2, 
  RefreshCw, 
  Copy, 
  Check, 
  LogOut,
  Download,
  Trash2,
  Activity,
  Wifi,
  Shield
} from 'lucide-react';
import { fetchWithAuth } from '@/lib/apiClient';

export interface SecurityTabProps {
  userId?: string;
  userEmail?: string;
  onUpdatePassword: (password: string) => Promise<{ error: Error | null }>;
  onLogout: () => Promise<void>;
}

export const SecurityTab: React.FC<SecurityTabProps> = ({
  userId,
  userEmail,
  onUpdatePassword,
  onLogout,
}) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);

  const handleCopyId = () => {
    if (userId) {
      navigator.clipboard.writeText(userId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const handleExportGdpr = async () => {
    setExporting(true);
    try {
      const res = await fetchWithAuth('/api/privacy/user/export');
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recruitai_gdpr_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirm('GDPR Art.17 — This will permanently purge all campaigns, candidates, evaluations and your account. Irreversible. Continue?')) return;
    if (!confirm('Final confirmation: type OK to proceed — this cannot be undone.')) return;
    setDeleting(true);
    try {
      const res = await fetchWithAuth('/api/privacy/user/account', { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail || `Deletion failed (${res.status})`);
      }
      await onLogout();
    } catch (e: any) {
      alert(e.message || 'Deletion failed');
    } finally {
      setDeleting(false);
    }
  };

  const handlePing = async () => {
    setPinging(true);
    const start = Date.now();
    try {
      const res = await fetchWithAuth('/api/health');
      if (!res.ok) throw new Error('Health check failed');
      setLatency(Date.now() - start);
    } catch {
      setLatency(null);
    } finally {
      setPinging(false);
    }
  };

  const handleSubmitPassword = async (e: React.FormEvent) => {
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
    const { error } = await onUpdatePassword(newPassword);
    setPasswordLoading(false);

    if (error) {
      setPasswordError(error.message || 'Failed to update password.');
    } else {
      setPasswordSuccess('Password updated successfully.');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(''), 4000);
    }
  };

  return (
    <div className="space-y-5">
      {/* Change Password Form */}
      <form onSubmit={handleSubmitPassword} className="p-4 rounded-xl bg-white border border-slate-200 space-y-3">
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
            <span className="font-mono text-slate-700 text-xs font-semibold">{userId || 'offline_dev'}</span>
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
            <span className="font-semibold text-slate-700">{userEmail}</span>
          </div>
          <div>
            <span className="text-slate-400 block">Row-Level Security</span>
            <span className="font-semibold text-emerald-600">Active (Tenant Isolated)</span>
          </div>
        </div>
      </div>

      {/* GDPR Compliance — parity with mobile Security & GDPR tab */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5" /> GDPR & Privacy Compliance
        </h3>
        <button
          type="button"
          onClick={handleExportGdpr}
          disabled={exporting}
          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between hover:bg-slate-100 transition disabled:opacity-50"
        >
          <span className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Download className="w-4 h-4 text-indigo-600" /> Export Personal Data (Art.15/20)
          </span>
          {exporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" /> : <span className="text-xs text-slate-400">JSON</span>}
        </button>
        <button
          type="button"
          onClick={handleDeleteAccount}
          disabled={deleting}
          className="w-full p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between hover:bg-rose-100 transition disabled:opacity-50"
        >
          <span className="flex items-center gap-2 text-xs font-bold text-rose-700">
            <Trash2 className="w-4 h-4" /> Delete Account & Purge Data (Art.17)
          </span>
          {deleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-rose-600" /> : <span className="text-[10px] text-rose-500">Irreversible</span>}
        </button>
      </div>

      {/* Diagnostics — parity with mobile System tab */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5" /> System Health & Diagnostics
        </h3>
        <div className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-slate-50 border border-slate-100">
          <span className="font-semibold text-slate-700 flex items-center gap-1.5"><Wifi className="w-3.5 h-3.5 text-emerald-600" /> Backend</span>
          <span className="font-mono text-[11px] text-slate-500 truncate max-w-[180px]">{process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Latency</span>
          <span className="flex items-center gap-2">
            {latency !== null && <span className="font-mono text-xs font-bold text-indigo-600">{latency} ms</span>}
            <button type="button" onClick={handlePing} disabled={pinging} className="px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold hover:bg-slate-200 disabled:opacity-50">
              {pinging ? 'Pinging...' : 'Ping Server'}
            </button>
          </span>
        </div>
      </div>

      {/* Danger Zone: Sign Out */}
      <div className="pt-2 flex justify-between items-center border-t border-slate-200">
        <span className="text-xs text-slate-500">End your active session on this device</span>
        <button
          type="button"
          onClick={onLogout}
          className="px-3.5 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
};
