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
import { Mail, ArrowRight, ChevronLeft, KeyRound, CheckCircle2, AlertCircle } from "lucide-react-native";
import { useAuth } from "@/context/AuthContext";
import { COLORS } from "@/constants/theme";
import { selectionHaptic, warningHaptic, successHaptic } from "@/lib/haptics";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { resetPasswordForEmail } = useAuth();

  const [email, setEmail] = useState("");
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    let timer: any;
    if (cooldown > 0) {
      timer = setTimeout(() => setCooldown((prev) => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleReset = async () => {
    setError("");
    if (!email.trim() || !email.includes("@")) {
      warningHaptic();
      setError("Please enter a valid work email address.");
      return;
    }

    if (cooldown > 0) return;

    setLoading(true);
    try {
      const { error: resetErr } = await resetPasswordForEmail(email);
      if (resetErr) {
        warningHaptic();
        setError(resetErr.message || "Failed to send reset link.");
      } else {
        successHaptic();
        setSuccess(true);
        setCooldown(60);
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
          contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 16 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Navigation */}
          <View className="flex-row items-center justify-between mb-4">
            <TouchableOpacity
              onPress={() => router.back()}
              className="flex-row items-center py-1 -ml-1"
            >
              <ChevronLeft size={20} color={COLORS.muted} />
              <Text className="font-sans-medium text-xs text-muted ml-0.5">
                Back to Sign In
              </Text>
            </TouchableOpacity>
            <Text className="font-serif-bold text-xl text-foreground">
              RecruitAI<Text className="text-brand-emerald">.</Text>
            </Text>
          </View>

          {/* Icon Badge */}
          <View className="w-12 h-12 bg-white border border-border rounded-[6px] items-center justify-center mt-4 mb-3 shadow-xs">
            <KeyRound size={22} color={COLORS.brandPrimary} />
          </View>

          {/* Title & Description */}
          <View className="mb-6">
            <Text className="font-serif text-2xl text-foreground">
              Reset your password
            </Text>
            <Text className="font-sans text-xs text-muted mt-1 leading-relaxed">
              Enter the work email associated with your recruiter account and we'll dispatch a secure recovery link.
            </Text>
          </View>

          {/* Success Message Card */}
          {success ? (
            <View className="bg-emerald-50 border border-emerald-200 rounded-[6px] p-4 mb-4">
              <View className="flex-row items-center mb-1.5">
                <CheckCircle2 size={16} color={COLORS.statusShortlist} />
                <Text className="font-sans-bold text-xs text-emerald-800 ml-1.5">
                  Reset link dispatched
                </Text>
              </View>
              <Text className="font-sans text-xs text-emerald-700 leading-relaxed">
                If an account exists for {email}, a recovery link has been delivered to your inbox. Tap the link in that email to reset your password.
              </Text>
            </View>
          ) : null}

          {/* Error Message */}
          {error ? (
            <View className="flex-row items-center bg-rose-50 border border-rose-200 rounded-[6px] p-3 mb-4">
              <AlertCircle size={16} color={COLORS.statusReject} />
              <Text className="font-sans text-xs text-rose-800 ml-2 flex-1">
                {error}
              </Text>
            </View>
          ) : null}

          {/* Email Input */}
          <View className="my-2">
            <Text className="font-sans-medium text-xs text-foreground mb-1.5">
              Work Email
            </Text>
            <View
              className={`flex-row items-center bg-white rounded-[6px] px-3 py-2.5 ${
                focusedInput === "email"
                  ? "border-2 border-accent"
                  : "border border-border"
              }`}
            >
              <Mail
                size={16}
                color={focusedInput === "email" ? COLORS.brandPrimary : COLORS.muted}
              />
              <TextInput
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocusedInput("email")}
                onBlur={() => setFocusedInput(null)}
                placeholder="name@company.com"
                placeholderTextColor={COLORS.mutedLight}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                className="flex-1 font-sans text-sm text-foreground ml-2.5 p-0"
              />
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            onPress={handleReset}
            disabled={loading || cooldown > 0}
            activeOpacity={0.85}
            className={`w-full rounded-[6px] py-3.5 px-4 flex-row items-center justify-center mt-6 shadow-sm ${
              cooldown > 0 ? "bg-slate-300" : "bg-accent"
            }`}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : cooldown > 0 ? (
              <Text className="font-sans-medium text-xs text-slate-700">
                Resend link in {cooldown}s
              </Text>
            ) : (
              <>
                <Text className="font-sans-bold text-sm text-white mr-2">
                  Send Recovery Link
                </Text>
                <ArrowRight size={16} color="#FFFFFF" />
              </>
            )}
          </TouchableOpacity>

          {/* Return link */}
          <TouchableOpacity
            onPress={() => router.replace("/(auth)/login")}
            className="items-center mt-6 py-2"
          >
            <Text className="font-sans-medium text-xs text-brand-primary">
              Return to Sign In
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
