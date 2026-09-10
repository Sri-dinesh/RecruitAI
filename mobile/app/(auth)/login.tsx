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
import { COLORS } from "@/constants/theme";
import { selectionHaptic, warningHaptic, successHaptic } from "@/lib/haptics";

export default function LoginScreen() {
  const router = useRouter();
  const { loginWithEmail, loginWithGoogle } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");

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

  const handleLogin = async () => {
    setError("");
    if (!email.trim() || !password) {
      warningHaptic();
      setError("Please enter both email and password.");
      triggerShake();
      return;
    }

    setLoading(true);
    try {
      const { error: loginErr } = await loginWithEmail(email, password);
      if (loginErr) {
        warningHaptic();
        setError(loginErr.message || "Invalid email or password.");
        triggerShake();
      } else {
        successHaptic();
        router.replace("/");
      }
    } catch (err: any) {
      warningHaptic();
      setError(err?.message || "An unexpected error occurred.");
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setGoogleLoading(true);
    try {
      const { error: gErr } = await loginWithGoogle();
      if (gErr) {
        setError(gErr.message || "Failed to sign in with Google.");
        triggerShake();
      } else {
        successHaptic();
        router.replace("/");
      }
    } catch (err: any) {
      setError(err?.message || "Google sign in error.");
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
            <View className="flex-1 bg-white py-2 rounded-[5px] items-center shadow-xs">
              <Text className="font-sans-bold text-xs text-brand-dark">
                Sign In
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                selectionHaptic();
                router.replace("/(auth)/signup");
              }}
              className="flex-1 py-2 items-center"
            >
              <Text className="font-sans-medium text-xs text-muted">
                Create Account
              </Text>
            </TouchableOpacity>
          </View>

          {/* Title & Subtitle */}
          <View className="mt-4 mb-6">
            <Text className="font-serif text-2xl text-foreground">
              Welcome back
            </Text>
            <Text className="font-sans text-xs text-muted mt-1">
              Enter your recruiter credentials to access candidate pipelines.
            </Text>
          </View>

          {/* Google OAuth Button */}
          <TouchableOpacity
            onPress={handleGoogleLogin}
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
                  Continue with Google
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Or Divider */}
          <View className="flex-row items-center my-3">
            <View className="flex-1 h-[1px] bg-slate-200" />
            <Text className="font-sans text-[11px] text-muted px-3 uppercase tracking-wider">
              or continue with email
            </Text>
            <View className="flex-1 h-[1px] bg-slate-200" />
          </View>

          {/* Error Alert Box with Shake Animation */}
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

          {/* Form Fields */}
          <View className="space-y-4 my-2">
            {/* Work Email */}
            <View>
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

            {/* Password */}
            <View className="mt-3">
              <View className="flex-row items-center justify-between mb-1.5">
                <Text className="font-sans-medium text-xs text-foreground">
                  Password
                </Text>
                <TouchableOpacity
                  onPress={() => router.push("/(auth)/forgot-password")}
                >
                  <Text className="font-sans text-xs text-brand-primary">
                    Forgot password?
                  </Text>
                </TouchableOpacity>
              </View>
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
                  placeholder="••••••••"
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
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
            className="w-full bg-accent rounded-[6px] py-3.5 px-4 flex-row items-center justify-center mt-6 shadow-sm"
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Text className="font-sans-bold text-sm text-white mr-2">
                  Sign In to Workspace
                </Text>
                <ArrowRight size={16} color="#FFFFFF" />
              </>
            )}
          </TouchableOpacity>

          {/* Footer Security Badge */}
          <View className="flex-row items-center justify-center mt-10">
            <ShieldCheck size={13} color={COLORS.statusShortlist} />
            <Text className="font-sans text-xs text-muted ml-1.5">
              Encrypted Session Storage (Keychain / Keystore)
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
