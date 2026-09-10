import React, { useState } from "react";
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
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  ChevronLeft,
} from "lucide-react-native";
import { useAuth } from "@/context/AuthContext";
import PasswordMeter from "@/components/common/PasswordMeter";
import { COLORS } from "@/constants/theme";
import { selectionHaptic, warningHaptic, successHaptic } from "@/lib/haptics";

export default function SignupScreen() {
  const router = useRouter();
  const { signupWithEmail, loginWithGoogle } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const shakeX = useSharedValue(0);

  const triggerShake = () => {
    shakeX.value = withSequence(
      withTiming(-10, { duration: 50 }),
      withTiming(10, { duration: 50 }),
      withTiming(-8, { duration: 50 }),
      withTiming(8, { duration: 50 }),
      withTiming(0, { duration: 50 })
    );
  };

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const handleSignup = async () => {
    setError("");
    setSuccess("");

    if (!fullName.trim()) {
      warningHaptic();
      setError("Please provide your full name.");
      triggerShake();
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      warningHaptic();
      setError("Please enter a valid work email address.");
      triggerShake();
      return;
    }
    if (password.length < 8) {
      warningHaptic();
      setError("Password must be at least 8 characters long.");
      triggerShake();
      return;
    }

    setLoading(true);
    try {
      const { error: signUpErr } = await signupWithEmail(email, password, fullName);
      if (signUpErr) {
        warningHaptic();
        setError(signUpErr.message || "Failed to create account.");
        triggerShake();
      } else {
        successHaptic();
        setSuccess("Account created successfully! Redirecting...");
        setTimeout(() => {
          router.replace("/");
        }, 1000);
      }
    } catch (err: any) {
      warningHaptic();
      setError(err?.message || "An unexpected error occurred.");
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setError("");
    setGoogleLoading(true);
    try {
      const { error: gErr } = await loginWithGoogle();
      if (gErr) {
        setError(gErr.message || "Google registration failed.");
        triggerShake();
      } else {
        successHaptic();
        router.replace("/");
      }
    } catch (err: any) {
      setError(err?.message || "Google registration error.");
    } finally {
      setGoogleLoading(false);
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
                Back
              </Text>
            </TouchableOpacity>
            <Text className="font-serif-bold text-xl text-foreground">
              RecruitAI<Text className="text-brand-emerald">.</Text>
            </Text>
          </View>

          {/* Segmented Tab Switcher */}
          <View className="flex-row bg-slate-200/70 p-1 rounded-[6px] my-3">
            <TouchableOpacity
              onPress={() => {
                selectionHaptic();
                router.replace("/(auth)/login");
              }}
              className="flex-1 py-2 items-center"
            >
              <Text className="font-sans-medium text-xs text-muted">
                Sign In
              </Text>
            </TouchableOpacity>
            <View className="flex-1 bg-white py-2 rounded-[5px] items-center shadow-xs">
              <Text className="font-sans-bold text-xs text-brand-dark">
                Create Account
              </Text>
            </View>
          </View>

          {/* Title & Subtitle */}
          <View className="mt-4 mb-5">
            <Text className="font-serif text-2xl text-foreground">
              Create your account
            </Text>
            <Text className="font-sans text-xs text-muted mt-1">
              Join leading recruiting teams hiring with agentic intelligence.
            </Text>
          </View>

          {/* Google OAuth Button */}
          <TouchableOpacity
            onPress={handleGoogleSignup}
            disabled={googleLoading}
            activeOpacity={0.7}
            className="w-full bg-white border border-border rounded-[6px] py-3 px-4 flex-row items-center justify-center mb-5 shadow-xs"
          >
            {googleLoading ? (
              <ActivityIndicator size="small" color={COLORS.brandPrimary} />
            ) : (
              <>
                <Text className="font-sans-bold text-sm text-[#4285F4] mr-2">
                  G
                </Text>
                <Text className="font-sans-medium text-xs text-foreground">
                  Sign up with Google
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Or Divider */}
          <View className="flex-row items-center my-2">
            <View className="flex-1 h-[1px] bg-slate-200" />
            <Text className="font-sans text-[11px] text-muted px-3 uppercase tracking-wider">
              or register with email
            </Text>
            <View className="flex-1 h-[1px] bg-slate-200" />
          </View>

          {/* Error / Success Notifications */}
          {error ? (
            <Animated.View
              style={shakeStyle}
              className="flex-row items-center bg-rose-50 border border-rose-200 rounded-[6px] p-3 my-2"
            >
              <AlertCircle size={16} color={COLORS.statusReject} />
              <Text className="font-sans text-xs text-rose-800 ml-2 flex-1">
                {error}
              </Text>
            </Animated.View>
          ) : null}

          {success ? (
            <View className="flex-row items-center bg-emerald-50 border border-emerald-200 rounded-[6px] p-3 my-2">
              <ShieldCheck size={16} color={COLORS.statusShortlist} />
              <Text className="font-sans text-xs text-emerald-800 ml-2 flex-1">
                {success}
              </Text>
            </View>
          ) : null}

          {/* Form Fields */}
          <View className="space-y-4 my-2">
            {/* Full Name */}
            <View>
              <Text className="font-sans-medium text-xs text-foreground mb-1.5">
                Full Name
              </Text>
              <View
                className={`flex-row items-center bg-white border rounded-[6px] px-3 py-2.5 ${
                  focusedInput === "fullName"
                    ? "border-accent ring-1 ring-accent"
                    : "border-border"
                }`}
              >
                <User
                  size={16}
                  color={focusedInput === "fullName" ? COLORS.brandPrimary : COLORS.muted}
                />
                <TextInput
                  value={fullName}
                  onChangeText={setFullName}
                  onFocus={() => setFocusedInput("fullName")}
                  onBlur={() => setFocusedInput(null)}
                  placeholder="Jane Recruiter"
                  placeholderTextColor={COLORS.mutedLight}
                  autoCapitalize="words"
                  className="flex-1 font-sans text-sm text-foreground ml-2.5 p-0"
                />
              </View>
            </View>

            {/* Work Email */}
            <View className="mt-3">
              <Text className="font-sans-medium text-xs text-foreground mb-1.5">
                Work Email
              </Text>
              <View
                className={`flex-row items-center bg-white border rounded-[6px] px-3 py-2.5 ${
                  focusedInput === "email"
                    ? "border-accent ring-1 ring-accent"
                    : "border-border"
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

            {/* Password with Strength Meter */}
            <View className="mt-3">
              <Text className="font-sans-medium text-xs text-foreground mb-1.5">
                Password
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
                  placeholder="At least 8 characters"
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
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            onPress={handleSignup}
            disabled={loading}
            activeOpacity={0.85}
            className="w-full bg-accent rounded-[6px] py-3.5 px-4 flex-row items-center justify-center mt-6 shadow-sm"
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Text className="font-sans-bold text-sm text-white mr-2">
                  Create Recruiter Account
                </Text>
                <ArrowRight size={16} color="#FFFFFF" />
              </>
            )}
          </TouchableOpacity>

          {/* Terms & Privacy */}
          <Text className="font-sans text-[11px] text-muted text-center mt-4 leading-relaxed">
            By creating an account, you agree to our Terms of Service and Privacy Policy.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
