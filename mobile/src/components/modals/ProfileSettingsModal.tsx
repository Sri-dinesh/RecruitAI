import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import {
  X,
  User,
  Sliders,
  Shield,
  Activity,
  CheckCircle2,
  AlertCircle,
  Lock,
  Building,
  Globe,
  Phone,
  Mail,
  Eye,
  EyeOff,
  Sparkles,
  Download,
  Trash2,
  LogOut,
  Copy,
  Check,
  Save,
  KeyRound,
  Wifi,
  ChevronRight,
} from "lucide-react-native";
import { useAuth, UserProfile } from "@/context/AuthContext";
import { useRecruit } from "@/context/RecruitContext";
import { useAppModal } from "@/context/ModalContext";
import { downloadAndShareUserData } from "@/lib/fileExport";
import { fetchWithAuth, getBackendUrl } from "@/lib/apiClient";
import { COLORS } from "@/constants/theme";
import { selectionHaptic, successHaptic, warningHaptic, impactHaptic } from "@/lib/haptics";

export type SettingsTab = "profile" | "preferences" | "security" | "diagnostics";

interface ProfileSettingsModalProps {
  initialTab?: SettingsTab;
  onClose?: () => void;
}

const MATCH_THRESHOLDS = [50, 60, 70, 75, 80, 85, 90, 95];

export const ProfileSettingsModal: React.FC<ProfileSettingsModalProps> = ({
  initialTab = "profile",
  onClose,
}) => {
  const router = useRouter();
  const { user, profile, updateProfile, updatePassword, logout } = useAuth();
  const { isBlindHiring, toggleBlindHiring, setIsBlindHiring, apiConnected, checkApiHealth } = useRecruit();
  const { showModal } = useAppModal();

  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  // Profile fields state
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("recruiter");

  // Preferences state
  const [matchThreshold, setMatchThreshold] = useState(75);
  const [autoRubric, setAutoRubric] = useState(true);
  const [defaultExportFormat, setDefaultExportFormat] = useState<"pdf" | "csv">("pdf");
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [soundEffects, setSoundEffects] = useState(true);
  const [digestFrequency, setDigestFrequency] = useState<"instant" | "daily" | "weekly">("instant");
  const [themeMode, setThemeMode] = useState<"system" | "light" | "dark">("system");

  // Security fields
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [copiedUuid, setCopiedUuid] = useState(false);

  // Loading & Feedback
  const [savingProfile, setSavingProfile] = useState(false);
  const [updatingPass, setUpdatingPass] = useState(false);
  const [exportingGdpr, setExportingGdpr] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [pingingApi, setPingingApi] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  // Hydrate fields from profile
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || user?.user_metadata?.full_name || "");
      setCompanyName(profile.company_name || "");
      setCompanyWebsite(profile.company_website || "");
      setPhone(profile.phone || "");
      setRole(profile.role || "recruiter");

      const prefs = profile.preferences || {};
      setMatchThreshold(Number(prefs.match_threshold) || 75);
      setAutoRubric(prefs.auto_rubric !== false);
      setDefaultExportFormat(prefs.default_export_format === "csv" ? "csv" : "pdf");
      setEmailAlerts(prefs.email_alerts !== false);
      setSoundEffects(prefs.sound_effects !== false);
      setDigestFrequency((prefs.digest_frequency as any) || "instant");
      setThemeMode((prefs.theme as any) || "system");
    } else if (user) {
      setFullName(user.user_metadata?.full_name || "");
    }
  }, [profile, user]);

  const handleClose = () => {
    selectionHaptic();
    if (onClose) {
      onClose();
    } else {
      router.back();
    }
  };

  // Profile Save
  const handleSaveProfile = async () => {
    selectionHaptic();
    setSavingProfile(true);
    try {
      const { error } = await updateProfile({
        full_name: fullName.trim(),
        company_name: companyName.trim(),
        company_website: companyWebsite.trim(),
        phone: phone.trim(),
        role: role as any,
      });
      if (error) throw error;
      successHaptic();
      showModal({
        type: "success",
        title: "Profile Updated",
        message: "Your recruiter profile details have been saved successfully.",
      });
    } catch (err: any) {
      warningHaptic();
      showModal({
        type: "error",
        title: "Update Failed",
        message: err.message || "Failed to update profile.",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  // Preferences Save
  const handleSavePreferences = async () => {
    selectionHaptic();
    setSavingProfile(true);
    try {
      const { error } = await updateProfile({
        preferences: {
          blind_mode_default: isBlindHiring,
          match_threshold: matchThreshold,
          auto_rubric: autoRubric,
          default_export_format: defaultExportFormat,
          email_alerts: emailAlerts,
          sound_effects: soundEffects,
          digest_frequency: digestFrequency,
          theme: themeMode,
        },
      });
      if (error) throw error;
      successHaptic();
      showModal({
        type: "success",
        title: "Preferences Saved",
        message: "Your recruitment and AI calibration preferences are synchronized.",
      });
    } catch (err: any) {
      warningHaptic();
      showModal({
        type: "error",
        title: "Preferences Error",
        message: err.message || "Failed to save preferences.",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  // Change Password
  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      warningHaptic();
      showModal({
        type: "warning",
        title: "Password Too Short",
        message: "New password must be at least 8 characters long.",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      warningHaptic();
      showModal({
        type: "warning",
        title: "Password Mismatch",
        message: "Confirm password does not match new password.",
      });
      return;
    }

    selectionHaptic();
    setUpdatingPass(true);
    try {
      const { error } = await updatePassword(newPassword);
      if (error) throw error;
      successHaptic();
      setNewPassword("");
      setConfirmPassword("");
      showModal({
        type: "success",
        title: "Password Changed",
        message: "Your account password has been updated securely.",
      });
    } catch (err: any) {
      warningHaptic();
      showModal({
        type: "error",
        title: "Update Failed",
        message: err.message || "Failed to change password.",
      });
    } finally {
      setUpdatingPass(false);
    }
  };

  // Copy User ID (UUID)
  const handleCopyUuid = async () => {
    if (!user?.id) return;
    await Clipboard.setStringAsync(user.id);
    selectionHaptic();
    setCopiedUuid(true);
    setTimeout(() => setCopiedUuid(false), 2000);
  };

  // GDPR Data Export (Art. 15 / 20)
  const handleExportGdprData = async () => {
    selectionHaptic();
    setExportingGdpr(true);
    try {
      await downloadAndShareUserData();
      successHaptic();
    } catch (err: any) {
      warningHaptic();
      showModal({
        type: "error",
        title: "Export Failed",
        message: err.message || "Failed to compile personal data export.",
      });
    } finally {
      setExportingGdpr(false);
    }
  };

  // GDPR Account Erasure (Art. 17)
  const handleDeleteAccount = () => {
    warningHaptic();
    Alert.alert(
      "Delete Account & Erase Data?",
      "Under GDPR Art. 17 (Right to Erasure), this will permanently purge all your hiring campaigns, candidate evaluations, resume chunks, and user account records.\n\nThis action is irreversible.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Permanently Delete",
          style: "destructive",
          onPress: async () => {
            setDeletingAccount(true);
            try {
              const res = await fetchWithAuth("/api/privacy/user/account", {
                method: "DELETE",
              });
              if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || "Account deletion failed.");
              }
              impactHaptic();
              await logout();
              handleClose();
            } catch (err: any) {
              warningHaptic();
              showModal({
                type: "error",
                title: "Deletion Failed",
                message: err.message || "Could not delete account.",
              });
            } finally {
              setDeletingAccount(false);
            }
          },
        },
      ]
    );
  };

  // Sign Out
  const handleLogout = () => {
    selectionHaptic();
    Alert.alert("Sign Out", "Are you sure you want to log out of RecruitAI on this device?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await logout();
          handleClose();
        },
      },
    ]);
  };

  // Diagnostics Ping
  const handleTestLatency = async () => {
    selectionHaptic();
    setPingingApi(true);
    const start = Date.now();
    try {
      await checkApiHealth();
      setLatencyMs(Date.now() - start);
      successHaptic();
    } catch {
      setLatencyMs(null);
    } finally {
      setPingingApi(false);
    }
  };

  const userInitial = (profile?.full_name || user?.email || "U")[0].toUpperCase();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
    >
      {/* Modal Top Bar */}
      <View className="bg-white border-b border-border px-4 pt-3 pb-3 flex-row items-center justify-between shadow-xs">
        <View className="flex-row items-center">
          <View className="w-8 h-8 rounded-full bg-[#1B2A4A] items-center justify-center mr-2.5">
            <Text className="font-sans-bold text-xs text-white">{userInitial}</Text>
          </View>
          <View>
            <Text className="font-serif-bold text-base text-foreground">
              Profile & Settings
            </Text>
            <Text className="font-sans text-[11px] text-muted">
              {profile?.email || user?.email || "Recruiter Workspace"}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={handleClose}
          activeOpacity={0.7}
          className="p-1.5 rounded-full bg-[#F8F6F2] border border-border"
          accessibilityLabel="Close Settings"
        >
          <X size={18} color={COLORS.muted} />
        </TouchableOpacity>
      </View>

      {/* 4-Tab Navigation Segment Switcher */}
      <View className="bg-white border-b border-border px-3 py-2">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexDirection: "row", gap: 6 }}
        >
          <TouchableOpacity
            onPress={() => {
              selectionHaptic();
              setActiveTab("profile");
            }}
            activeOpacity={0.7}
            className={`flex-row items-center px-3 py-1.5 rounded-[6px] border ${
              activeTab === "profile"
                ? "bg-[#1B2A4A] border-[#1B2A4A]"
                : "bg-slate-50 border-border"
            }`}
          >
            <User size={13} color={activeTab === "profile" ? "#FFFFFF" : COLORS.muted} />
            <Text
              className={`font-sans-bold text-xs ml-1.5 ${
                activeTab === "profile" ? "text-white" : "text-slate-700"
              }`}
            >
              Profile
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              selectionHaptic();
              setActiveTab("preferences");
            }}
            activeOpacity={0.7}
            className={`flex-row items-center px-3 py-1.5 rounded-[6px] border ${
              activeTab === "preferences"
                ? "bg-[#1B2A4A] border-[#1B2A4A]"
                : "bg-slate-50 border-border"
            }`}
          >
            <Sliders size={13} color={activeTab === "preferences" ? "#FFFFFF" : COLORS.muted} />
            <Text
              className={`font-sans-bold text-xs ml-1.5 ${
                activeTab === "preferences" ? "text-white" : "text-slate-700"
              }`}
            >
              Preferences
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              selectionHaptic();
              setActiveTab("security");
            }}
            activeOpacity={0.7}
            className={`flex-row items-center px-3 py-1.5 rounded-[6px] border ${
              activeTab === "security"
                ? "bg-[#1B2A4A] border-[#1B2A4A]"
                : "bg-slate-50 border-border"
            }`}
          >
            <Shield size={13} color={activeTab === "security" ? "#FFFFFF" : COLORS.muted} />
            <Text
              className={`font-sans-bold text-xs ml-1.5 ${
                activeTab === "security" ? "text-white" : "text-slate-700"
              }`}
            >
              Security & GDPR
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              selectionHaptic();
              setActiveTab("diagnostics");
            }}
            activeOpacity={0.7}
            className={`flex-row items-center px-3 py-1.5 rounded-[6px] border ${
              activeTab === "diagnostics"
                ? "bg-[#1B2A4A] border-[#1B2A4A]"
                : "bg-slate-50 border-border"
            }`}
          >
            <Activity size={13} color={activeTab === "diagnostics" ? "#FFFFFF" : COLORS.muted} />
            <Text
              className={`font-sans-bold text-xs ml-1.5 ${
                activeTab === "diagnostics" ? "text-white" : "text-slate-700"
              }`}
            >
              System
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Main Tab Content */}
      <ScrollView
        className="flex-1 px-4 py-3"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── TAB 1: PROFILE ────────────────────────────────────────── */}
        {activeTab === "profile" && (
          <View className="gap-3">
            {/* User Identity Card */}
            <View className="bg-white border border-border rounded-[6px] p-4 flex-row items-center justify-between shadow-xs">
              <View className="flex-row items-center flex-1 mr-2">
                <View className="w-12 h-12 rounded-full bg-[#1B2A4A] items-center justify-center mr-3 border border-slate-700">
                  <Text className="font-serif-bold text-lg text-white">{userInitial}</Text>
                </View>
                <View className="flex-1">
                  <Text className="font-serif-bold text-base text-foreground" numberOfLines={1}>
                    {fullName || "Recruiter"}
                  </Text>
                  <Text className="font-sans text-xs text-muted mt-0.5" numberOfLines={1}>
                    {profile?.email || user?.email}
                  </Text>
                </View>
              </View>
              <View className="bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded">
                <Text className="font-sans-bold text-[10px] text-emerald-800 uppercase">
                  {role === "employer" ? "Hiring Manager" : "Lead Recruiter"}
                </Text>
              </View>
            </View>

            {/* Inputs Card */}
            <View className="bg-white border border-border rounded-[6px] p-4 gap-3 shadow-xs">
              <Text className="font-sans-bold text-xs text-muted uppercase tracking-wider">
                Recruiter Information
              </Text>

              {/* Full Name */}
              <View>
                <Text className="font-sans-medium text-xs text-foreground mb-1">Full Name</Text>
                <View className="flex-row items-center bg-[#F8F6F2] border border-border rounded-[6px] px-3 py-2">
                  <User size={14} color={COLORS.muted} />
                  <TextInput
                    value={fullName}
                    onChangeText={setFullName}
                    placeholder="e.g., Alexandra Chen"
                    className="flex-1 font-sans text-xs text-foreground ml-2 p-0"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>

              {/* Email (Read Only) */}
              <View>
                <Text className="font-sans-medium text-xs text-foreground mb-1">
                  Verified Email (Read-Only)
                </Text>
                <View className="flex-row items-center bg-slate-100 border border-border rounded-[6px] px-3 py-2 opacity-80">
                  <Mail size={14} color={COLORS.muted} />
                  <Text className="flex-1 font-sans text-xs text-slate-700 ml-2">
                    {profile?.email || user?.email}
                  </Text>
                  <Lock size={12} color={COLORS.muted} />
                </View>
              </View>

              {/* Company Name */}
              <View>
                <Text className="font-sans-medium text-xs text-foreground mb-1">Organization / Agency</Text>
                <View className="flex-row items-center bg-[#F8F6F2] border border-border rounded-[6px] px-3 py-2">
                  <Building size={14} color={COLORS.muted} />
                  <TextInput
                    value={companyName}
                    onChangeText={setCompanyName}
                    placeholder="e.g., Acme Talent Labs"
                    className="flex-1 font-sans text-xs text-foreground ml-2 p-0"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>

              {/* Company Website */}
              <View>
                <Text className="font-sans-medium text-xs text-foreground mb-1">Company Website</Text>
                <View className="flex-row items-center bg-[#F8F6F2] border border-border rounded-[6px] px-3 py-2">
                  <Globe size={14} color={COLORS.muted} />
                  <TextInput
                    value={companyWebsite}
                    onChangeText={setCompanyWebsite}
                    placeholder="https://acme.com"
                    autoCapitalize="none"
                    keyboardType="url"
                    className="flex-1 font-sans text-xs text-foreground ml-2 p-0"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>

              {/* Phone */}
              <View>
                <Text className="font-sans-medium text-xs text-foreground mb-1">Phone Number</Text>
                <View className="flex-row items-center bg-[#F8F6F2] border border-border rounded-[6px] px-3 py-2">
                  <Phone size={14} color={COLORS.muted} />
                  <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="+1 (555) 019-2834"
                    keyboardType="phone-pad"
                    className="flex-1 font-sans text-xs text-foreground ml-2 p-0"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>

              {/* Workspace Role Selector */}
              <View>
                <Text className="font-sans-medium text-xs text-foreground mb-1.5">Workspace Role</Text>
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => {
                      selectionHaptic();
                      setRole("recruiter");
                    }}
                    activeOpacity={0.7}
                    className={`flex-1 py-2 rounded-[6px] border items-center ${
                      role === "recruiter"
                        ? "bg-[#1B2A4A] border-[#1B2A4A]"
                        : "bg-[#F8F6F2] border-border"
                    }`}
                  >
                    <Text
                      className={`font-sans-bold text-xs ${
                        role === "recruiter" ? "text-white" : "text-foreground"
                      }`}
                    >
                      Lead Recruiter
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      selectionHaptic();
                      setRole("employer");
                    }}
                    activeOpacity={0.7}
                    className={`flex-1 py-2 rounded-[6px] border items-center ${
                      role === "employer"
                        ? "bg-[#1B2A4A] border-[#1B2A4A]"
                        : "bg-[#F8F6F2] border-border"
                    }`}
                  >
                    <Text
                      className={`font-sans-bold text-xs ${
                        role === "employer" ? "text-white" : "text-foreground"
                      }`}
                    >
                      Hiring Manager
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Save Button */}
              <TouchableOpacity
                onPress={handleSaveProfile}
                disabled={savingProfile}
                activeOpacity={0.7}
                className="bg-brand-primary py-2.5 rounded-[6px] flex-row items-center justify-center mt-1 shadow-xs"
              >
                {savingProfile ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Save size={14} color="#FFFFFF" />
                    <Text className="font-sans-bold text-xs text-white ml-1.5">
                      Save Profile Changes
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ─── TAB 2: PREFERENCES ────────────────────────────────────── */}
        {activeTab === "preferences" && (
          <View className="gap-3">
            {/* Bias Evaluation Mode (Standard vs Blind) */}
            <View className="bg-white border border-border rounded-[6px] p-4 shadow-xs">
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center flex-1 mr-2">
                  {isBlindHiring ? (
                    <EyeOff size={16} color="#D97706" />
                  ) : (
                    <Eye size={16} color={COLORS.muted} />
                  )}
                  <View className="ml-2 flex-1">
                    <Text className="font-serif-bold text-sm text-foreground">
                      {isBlindHiring ? "Blind Hiring Mode (Active)" : "Standard Mode (Default)"}
                    </Text>
                    <Text className="font-sans text-[11px] text-muted">
                      {isBlindHiring
                        ? "Candidate names and demographic PII are redacted across cards, compare, and reports."
                        : "Candidate names, emails, and full identities are visible by default."}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={isBlindHiring}
                  onValueChange={() => {
                    toggleBlindHiring();
                  }}
                  trackColor={{ false: "#CBD5E1", true: "#D97706" }}
                  thumbColor="#FFFFFF"
                />
              </View>
              <View className="bg-slate-50 p-2.5 rounded border border-slate-100 flex-row items-center mt-1">
                <Shield size={12} color={COLORS.muted} />
                <Text className="font-sans text-[10px] text-muted ml-1.5 flex-1">
                  Manual persistence guaranteed: mode will not reset on reload or profile refresh.
                </Text>
              </View>
            </View>

            {/* Candidate Match Threshold */}
            <View className="bg-white border border-border rounded-[6px] p-4 shadow-xs">
              <View className="flex-row items-center justify-between mb-1.5">
                <Text className="font-serif-bold text-sm text-foreground">
                  Minimum Match Threshold
                </Text>
                <Text className="font-sans-bold text-xs text-brand-primary">
                  {matchThreshold}% Fit
                </Text>
              </View>
              <Text className="font-sans text-[11px] text-muted mb-3">
                Candidates scoring at or above this score are automatically flagged for recruiter review.
              </Text>

              <View className="flex-row flex-wrap gap-2">
                {MATCH_THRESHOLDS.map((val) => (
                  <TouchableOpacity
                    key={val}
                    onPress={() => {
                      selectionHaptic();
                      setMatchThreshold(val);
                    }}
                    activeOpacity={0.7}
                    className={`px-3 py-1.5 rounded-[4px] border ${
                      matchThreshold === val
                        ? "bg-[#1B2A4A] border-[#1B2A4A]"
                        : "bg-[#F8F6F2] border-border"
                    }`}
                  >
                    <Text
                      className={`font-sans-bold text-xs ${
                        matchThreshold === val ? "text-white" : "text-foreground"
                      }`}
                    >
                      {val}%
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Auto-Rubric & AI Calibration */}
            <View className="bg-white border border-border rounded-[6px] p-4 shadow-xs gap-3">
              <Text className="font-sans-bold text-xs text-muted uppercase tracking-wider">
                Autonomous AI Calibration
              </Text>

              {/* Auto Rubric */}
              <View className="flex-row items-center justify-between">
                <View className="flex-1 mr-2">
                  <Text className="font-sans-bold text-xs text-foreground">
                    Auto-Generate 5-Pillar Rubrics
                  </Text>
                  <Text className="font-sans text-[11px] text-muted">
                    LangGraph multi-agent supervisor automatically calibrates scoring rubrics from JDs.
                  </Text>
                </View>
                <Switch
                  value={autoRubric}
                  onValueChange={(val) => {
                    selectionHaptic();
                    setAutoRubric(val);
                  }}
                  trackColor={{ false: "#CBD5E1", true: COLORS.brandPrimary }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View className="h-[1px] bg-border my-0.5" />

              {/* Default Export Format */}
              <View>
                <Text className="font-sans-bold text-xs text-foreground mb-1.5">
                  Default Dossier Export Format
                </Text>
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => {
                      selectionHaptic();
                      setDefaultExportFormat("pdf");
                    }}
                    activeOpacity={0.7}
                    className={`flex-1 py-1.5 rounded border items-center ${
                      defaultExportFormat === "pdf"
                        ? "bg-[#1B2A4A] border-[#1B2A4A]"
                        : "bg-[#F8F6F2] border-border"
                    }`}
                  >
                    <Text
                      className={`font-sans-bold text-xs ${
                        defaultExportFormat === "pdf" ? "text-white" : "text-foreground"
                      }`}
                    >
                      Executive PDF Dossier
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      selectionHaptic();
                      setDefaultExportFormat("csv");
                    }}
                    activeOpacity={0.7}
                    className={`flex-1 py-1.5 rounded border items-center ${
                      defaultExportFormat === "csv"
                        ? "bg-[#1B2A4A] border-[#1B2A4A]"
                        : "bg-[#F8F6F2] border-border"
                    }`}
                  >
                    <Text
                      className={`font-sans-bold text-xs ${
                        defaultExportFormat === "csv" ? "text-white" : "text-foreground"
                      }`}
                    >
                      ATS CSV / JSON
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Notifications & Haptics */}
            <View className="bg-white border border-border rounded-[6px] p-4 shadow-xs gap-3">
              <Text className="font-sans-bold text-xs text-muted uppercase tracking-wider">
                Notifications & Tactile Feedback
              </Text>

              {/* Email Alerts */}
              <View className="flex-row items-center justify-between">
                <View className="flex-1 mr-2">
                  <Text className="font-sans-bold text-xs text-foreground">Email Notifications</Text>
                  <Text className="font-sans text-[11px] text-muted">
                    Receive email digests on new candidate shortlists and booked interviews.
                  </Text>
                </View>
                <Switch
                  value={emailAlerts}
                  onValueChange={(val) => {
                    selectionHaptic();
                    setEmailAlerts(val);
                  }}
                  trackColor={{ false: "#CBD5E1", true: COLORS.brandPrimary }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View className="h-[1px] bg-border my-0.5" />

              {/* Haptic Feedback */}
              <View className="flex-row items-center justify-between">
                <View className="flex-1 mr-2">
                  <Text className="font-sans-bold text-xs text-foreground">Tactile Haptics</Text>
                  <Text className="font-sans text-[11px] text-muted">
                    Vibrational haptic pulses during status changes and interview confirmations.
                  </Text>
                </View>
                <Switch
                  value={soundEffects}
                  onValueChange={(val) => {
                    selectionHaptic();
                    setSoundEffects(val);
                  }}
                  trackColor={{ false: "#CBD5E1", true: COLORS.brandPrimary }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>

            {/* Save Preferences Button */}
            <TouchableOpacity
              onPress={handleSavePreferences}
              disabled={savingProfile}
              activeOpacity={0.7}
              className="bg-brand-primary py-2.5 rounded-[6px] flex-row items-center justify-center shadow-xs"
            >
              {savingProfile ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Save size={14} color="#FFFFFF" />
                  <Text className="font-sans-bold text-xs text-white ml-1.5">
                    Save All Preferences
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ─── TAB 3: SECURITY & GDPR ────────────────────────────────── */}
        {activeTab === "security" && (
          <View className="gap-3">
            {/* Account Identity Card */}
            <View className="bg-white border border-border rounded-[6px] p-4 shadow-xs gap-2.5">
              <Text className="font-sans-bold text-xs text-muted uppercase tracking-wider">
                Account Identity & Tenant Security
              </Text>

              {/* UUID with Copy */}
              <View className="bg-[#F8F6F2] p-2.5 rounded-[6px] border border-border flex-row items-center justify-between">
                <View className="flex-1 mr-2">
                  <Text className="font-mono text-[10px] text-muted">TENANT USER_ID (UUID)</Text>
                  <Text className="font-mono text-xs text-foreground" numberOfLines={1}>
                    {user?.id || "offline_dev_user"}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={handleCopyUuid}
                  activeOpacity={0.7}
                  className="p-1.5 rounded bg-white border border-border"
                >
                  {copiedUuid ? (
                    <Check size={14} color="#059669" />
                  ) : (
                    <Copy size={14} color={COLORS.muted} />
                  )}
                </TouchableOpacity>
              </View>

              <View className="flex-row items-center justify-between pt-1">
                <Text className="font-sans text-xs text-muted">Row-Level Security (RLS)</Text>
                <View className="flex-row items-center bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  <CheckCircle2 size={11} color="#059669" />
                  <Text className="font-sans-bold text-[10px] text-emerald-800 ml-1">
                    Enforced (Isolated)
                  </Text>
                </View>
              </View>
            </View>

            {/* Change Password Form */}
            <View className="bg-white border border-border rounded-[6px] p-4 shadow-xs gap-3">
              <View className="flex-row items-center">
                <KeyRound size={15} color={COLORS.brandPrimary} />
                <Text className="font-serif-bold text-sm text-foreground ml-1.5">
                  Change Password
                </Text>
              </View>

              {/* New Password */}
              <View>
                <Text className="font-sans-medium text-xs text-foreground mb-1">New Password</Text>
                <View className="flex-row items-center bg-[#F8F6F2] border border-border rounded-[6px] px-3 py-2">
                  <Lock size={14} color={COLORS.muted} />
                  <TextInput
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="Minimum 8 characters"
                    secureTextEntry={!showPassword}
                    className="flex-1 font-sans text-xs text-foreground ml-2 p-0"
                    placeholderTextColor="#94A3B8"
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    activeOpacity={0.7}
                  >
                    {showPassword ? (
                      <EyeOff size={14} color={COLORS.muted} />
                    ) : (
                      <Eye size={14} color={COLORS.muted} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confirm Password */}
              <View>
                <Text className="font-sans-medium text-xs text-foreground mb-1">Confirm Password</Text>
                <View className="flex-row items-center bg-[#F8F6F2] border border-border rounded-[6px] px-3 py-2">
                  <Lock size={14} color={COLORS.muted} />
                  <TextInput
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Re-enter new password"
                    secureTextEntry={!showPassword}
                    className="flex-1 font-sans text-xs text-foreground ml-2 p-0"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>

              <TouchableOpacity
                onPress={handleChangePassword}
                disabled={updatingPass || newPassword.length < 8}
                activeOpacity={0.7}
                className="bg-[#1B2A4A] py-2 rounded-[6px] flex-row items-center justify-center shadow-xs disabled:opacity-50"
              >
                {updatingPass ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text className="font-sans-bold text-xs text-white">Update Password</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* GDPR Compliance Actions */}
            <View className="bg-white border border-border rounded-[6px] p-4 shadow-xs gap-3">
              <Text className="font-sans-bold text-xs text-muted uppercase tracking-wider">
                GDPR & Privacy Compliance
              </Text>

              {/* GDPR Export */}
              <TouchableOpacity
                onPress={handleExportGdprData}
                disabled={exportingGdpr}
                activeOpacity={0.7}
                className="p-3 bg-[#F8F6F2] border border-border rounded-[6px] flex-row items-center justify-between"
              >
                <View className="flex-row items-center flex-1 mr-2">
                  <Download size={16} color={COLORS.brandPrimary} />
                  <View className="ml-2.5 flex-1">
                    <Text className="font-sans-bold text-xs text-foreground">
                      Export Personal Data (GDPR Art. 15 / 20)
                    </Text>
                    <Text className="font-sans text-[11px] text-muted">
                      Download confidential JSON archive of your profile and campaign records.
                    </Text>
                  </View>
                </View>
                {exportingGdpr ? (
                  <ActivityIndicator size="small" color={COLORS.brandPrimary} />
                ) : (
                  <ChevronRight size={14} color={COLORS.muted} />
                )}
              </TouchableOpacity>

              {/* GDPR Delete Account */}
              <TouchableOpacity
                onPress={handleDeleteAccount}
                disabled={deletingAccount}
                activeOpacity={0.7}
                className="p-3 bg-rose-50 border border-rose-200 rounded-[6px] flex-row items-center justify-between"
              >
                <View className="flex-row items-center flex-1 mr-2">
                  <Trash2 size={16} color="#E11D48" />
                  <View className="ml-2.5 flex-1">
                    <Text className="font-sans-bold text-xs text-rose-800">
                      Delete Account & Purge Data (Art. 17)
                    </Text>
                    <Text className="font-sans text-[11px] text-rose-700/80">
                      Irreversibly erase your recruiter profile, candidate rubrics, and sessions.
                    </Text>
                  </View>
                </View>
                {deletingAccount ? (
                  <ActivityIndicator size="small" color="#E11D48" />
                ) : (
                  <ChevronRight size={14} color="#E11D48" />
                )}
              </TouchableOpacity>
            </View>

            {/* Sign Out Action */}
            <TouchableOpacity
              onPress={handleLogout}
              activeOpacity={0.7}
              className="bg-white border border-rose-200 py-2.5 rounded-[6px] flex-row items-center justify-center shadow-xs"
            >
              <LogOut size={14} color="#E11D48" />
              <Text className="font-sans-bold text-xs text-rose-600 ml-1.5">
                Sign Out of RecruitAI
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ─── TAB 4: SYSTEM & DIAGNOSTICS ───────────────────────────── */}
        {activeTab === "diagnostics" && (
          <View className="gap-3">
            <View className="bg-white border border-border rounded-[6px] p-4 shadow-xs gap-3">
              <View className="flex-row items-center justify-between">
                <Text className="font-serif-bold text-sm text-foreground">
                  System Health & Connectivity
                </Text>
                <TouchableOpacity
                  onPress={handleTestLatency}
                  disabled={pingingApi}
                  activeOpacity={0.7}
                  className="bg-slate-100 border border-border px-2.5 py-1 rounded flex-row items-center"
                >
                  {pingingApi ? (
                    <ActivityIndicator size="small" color={COLORS.brandPrimary} />
                  ) : (
                    <Text className="font-sans-bold text-[10px] text-brand-primary">Ping Server</Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Status Row */}
              <View className="flex-row items-center justify-between p-2.5 bg-[#F8F6F2] rounded border border-border">
                <View className="flex-row items-center">
                  <View
                    className={`w-2.5 h-2.5 rounded-full mr-2 ${
                      apiConnected ? "bg-emerald-500" : "bg-rose-500"
                    }`}
                  />
                  <Text className="font-sans-bold text-xs text-foreground">API Status</Text>
                </View>
                <Text
                  className={`font-sans-bold text-xs ${
                    apiConnected ? "text-emerald-700" : "text-rose-600"
                  }`}
                >
                  {apiConnected ? "CONNECTED" : "OFFLINE"}
                </Text>
              </View>

              {/* Latency */}
              {latencyMs !== null && (
                <View className="flex-row items-center justify-between p-2.5 bg-[#F8F6F2] rounded border border-border">
                  <Text className="font-sans-medium text-xs text-foreground">Round-Trip Latency</Text>
                  <Text className="font-mono text-xs font-bold text-brand-primary">
                    {latencyMs} ms
                  </Text>
                </View>
              )}

              {/* Backend URL */}
              <View className="p-2.5 bg-[#F8F6F2] rounded border border-border">
                <Text className="font-mono text-[10px] text-muted mb-0.5">ACTIVE BACKEND ENDPOINT</Text>
                <Text className="font-mono text-xs text-foreground" numberOfLines={1}>
                  {getBackendUrl()}
                </Text>
              </View>

              {/* App Version */}
              <View className="flex-row items-center justify-between p-2.5 bg-[#F8F6F2] rounded border border-border">
                <Text className="font-sans-medium text-xs text-foreground">Application Build</Text>
                <Text className="font-mono text-xs font-bold text-muted">v1.0.0 (Parity Verified)</Text>
              </View>

              {/* Engine */}
              <View className="flex-row items-center justify-between p-2.5 bg-[#F8F6F2] rounded border border-border">
                <Text className="font-sans-medium text-xs text-foreground">AI Orchestration</Text>
                <Text className="font-sans-bold text-xs text-brand-primary">LangGraph Multi-Agent</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default ProfileSettingsModal;
