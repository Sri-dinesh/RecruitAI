import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  KeyRound,
} from "lucide-react-native";
import { useAuth } from "@/context/AuthContext";
import PasswordMeter from "@/components/common/PasswordMeter";
import { COLORS } from "@/constants/theme";
import { warningHaptic, successHaptic } from "@/lib/haptics";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { updatePassword } = useAuth();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    let timer: any;
    if (success && countdown > 0) {
      timer = setTimeout(() => setCountdown((prev) => prev - 1), 1000);
    } else if (success && countdown === 0) {
      router.replace("/");
    }
    return () => clearTimeout(timer);
  }, [success, countdown, router]);

  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  const handleReset = async () => {
    setError("");

    if (password.length < 8) {
      warningHaptic();
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      warningHaptic();
      setError("Passwords do not match. Please ensure both fields are identical.");
      return;
    }

    setLoading(true);
    try {
      const { error: updateErr } = await updatePassword(password);
      if (updateErr) {
        warningHaptic();
        setError(updateErr.message || "Failed to update password.");
      } else {
        successHaptic();
        setSuccess(true);
      }
    } catch (err: any) {
      warningHaptic();
      setError(err?.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 20 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View className="items-center mb-6">
            <Text className="font-serif-bold text-2xl text-foreground">
              RecruitAI<Text className="text-brand-emerald">.</Text>
            </Text>
          </View>

          {/* Success Screen */}
          {success ? (
            <View className="bg-white border border-border rounded-[6px] p-6 items-center text-center shadow-sm my-6">
              <View className="w-14 h-14 bg-emerald-50 rounded-full items-center justify-center border border-emerald-200 mb-3">
                <CheckCircle2 size={32} color={COLORS.statusShortlist} />
              </View>
              <Text className="font-serif text-2xl text-foreground text-center">
                Password Reset Complete
              </Text>
              <Text className="font-sans text-xs text-muted text-center mt-2 leading-relaxed">
                Your recruiter password has been updated securely. Redirecting you in{" "}
                <Text className="font-sans-bold text-foreground">{countdown}s</Text>...
              </Text>

              <TouchableOpacity
                onPress={() => router.replace("/")}
                activeOpacity={0.85}
                className="w-full bg-accent rounded-[6px] py-3.5 px-4 flex-row items-center justify-center mt-6 shadow-sm"
              >
                <Text className="font-sans-bold text-sm text-white mr-2">
                  Go to Workspace Now
                </Text>
                <ArrowRight size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ) : (
            <View className="bg-white border border-border rounded-[6px] p-6 shadow-sm">
              {/* Icon & Title */}
              <View className="items-center mb-5">
                <View className="w-10 h-10 bg-slate-100 rounded-full items-center justify-center border border-border mb-2.5">
                  <KeyRound size={18} color={COLORS.brandPrimary} />
                </View>
                <Text className="font-serif text-2xl text-foreground">
                  Set new password
                </Text>
                <Text className="font-sans text-xs text-muted mt-1 text-center">
                  Choose a secure password of at least 8 characters.
                </Text>
              </View>

              {/* Error Alert */}
              {error ? (
                <View className="flex-row items-center bg-rose-50 border border-rose-200 rounded-[6px] p-3 mb-4">
                  <AlertCircle size={16} color={COLORS.statusReject} />
                  <Text className="font-sans text-xs text-rose-800 ml-2 flex-1">
                    {error}
                  </Text>
                </View>
              ) : null}

              {/* Form Fields */}
              <View className="space-y-4">
                {/* New Password */}
                <View>
                  <Text className="font-sans-medium text-xs text-foreground mb-1.5">
                    New Password
                  </Text>
                  <View
                    className={`flex-row items-center bg-white border rounded-[6px] px-3 py-2.5 ${
                      focusedInput === "password"
                        ? "border-accent ring-1 ring-accent"
                        : "border-border"
                    }`}
                  >
                    <Lock
                      size={16}
                      color={focusedInput === "password" ? COLORS.brandPrimary : COLORS.muted}
                    />
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      onFocus={() => setFocusedInput("password")}
                      onBlur={() => setFocusedInput(null)}
                      placeholder="Minimum 8 characters"
                      placeholderTextColor={COLORS.mutedLight}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      className="flex-1 font-sans text-sm text-foreground ml-2.5 p-0"
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      {showPassword ? (
                        <EyeOff size={16} color={COLORS.muted} />
                      ) : (
                        <Eye size={16} color={COLORS.muted} />
                      )}
                    </TouchableOpacity>
                  </View>

                  <PasswordMeter password={password} />
                </View>

                {/* Confirm Password */}
                <View className="mt-3">
                  <Text className="font-sans-medium text-xs text-foreground mb-1.5">
                    Confirm New Password
                  </Text>
                  <View
                    className={`flex-row items-center bg-white border rounded-[6px] px-3 py-2.5 ${
                      focusedInput === "confirmPassword"
                        ? "border-accent ring-1 ring-accent"
                        : passwordsMismatch
                        ? "border-rose-400 bg-rose-50/20"
                        : passwordsMatch
                        ? "border-emerald-400 bg-emerald-50/20"
                        : "border-border"
                    }`}
                  >
                    <Lock
                      size={16}
                      color={
                        focusedInput === "confirmPassword"
                          ? COLORS.brandPrimary
                          : COLORS.muted
                      }
                    />
                    <TextInput
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      onFocus={() => setFocusedInput("confirmPassword")}
                      onBlur={() => setFocusedInput(null)}
                      placeholder="Re-enter new password"
                      placeholderTextColor={COLORS.mutedLight}
                      secureTextEntry={!showConfirmPassword}
                      autoCapitalize="none"
                      className="flex-1 font-sans text-sm text-foreground ml-2.5 p-0"
                    />
                    <TouchableOpacity
                      onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      {showConfirmPassword ? (
                        <EyeOff size={16} color={COLORS.muted} />
                      ) : (
                        <Eye size={16} color={COLORS.muted} />
                      )}
                    </TouchableOpacity>
                  </View>

                  {passwordsMatch && (
                    <Text className="font-sans text-[11px] text-emerald-700 mt-1">
                      ✓ Passwords match
                    </Text>
                  )}
                  {passwordsMismatch && (
                    <Text className="font-sans text-[11px] text-rose-600 mt-1">
                      ✕ Passwords do not match
                    </Text>
                  )}
                </View>
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                onPress={handleReset}
                disabled={loading || password.length < 8 || passwordsMismatch}
                activeOpacity={0.85}
                className="w-full bg-accent rounded-[6px] py-3.5 px-4 flex-row items-center justify-center mt-6 shadow-sm disabled:opacity-60"
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Text className="font-sans-bold text-sm text-white mr-2">
                      Update Password & Sign In
                    </Text>
                    <ArrowRight size={16} color="#FFFFFF" />
                  </>
                )}
              </TouchableOpacity>

              {/* Security Trust Footnote */}
              <View className="flex-row items-center justify-center mt-6 pt-4 border-t border-slate-100">
                <ShieldCheck size={13} color={COLORS.statusShortlist} />
                <Text className="font-sans text-xs text-muted ml-1.5">
                  Protected by Supabase Auth PKCE Cryptography
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
