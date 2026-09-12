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
  Image,
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
  User,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  ChevronLeft,
} from "lucide-react-native";
import { useAuth } from "@/context/AuthContext";
import { COLORS } from "@/constants/theme";
import { selectionHaptic, warningHaptic, successHaptic } from "@/lib/haptics";
import PasswordMeter, { getPasswordStrength } from "@/components/common/PasswordMeter";

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
      setError("Please enter your full name.");
      triggerShake();
      return;
    }

    if (!email.trim()) {
      warningHaptic();
      setError("Please enter a valid work email.");
      triggerShake();
      return;
    }

    const strength = getPasswordStrength(password);
    if (strength.score < 2) {
      warningHaptic();
      setError("Please choose a stronger password (minimum 8 characters).");
      triggerShake();
      return;
    }

    setLoading(true);
    try {
      const { error: signupErr } = await signupWithEmail(email, password, fullName);
      if (signupErr) {
        warningHaptic();
        setError(signupErr.message || "Failed to create account.");
        triggerShake();
      } else {
        successHaptic();
        setSuccess("Account created successfully! Check your email to confirm or sign in.");
        setTimeout(() => {
          router.replace("/(auth)/login");
        }, 2000);
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
        router.replace("/(app)/(tabs)");
      }
    } catch (err: any) {
      setError(err?.message || "Google signup error.");
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Top Bar Navigation */}
          <View className="flex-row items-center justify-between pt-2 pb-4">
            <TouchableOpacity
              onPress={() => {
                selectionHaptic();
                router.back();
              }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              className="w-9 h-9 rounded-full bg-white border border-border items-center justify-center"
            >
              <ChevronLeft size={18} color={COLORS.foreground} />
            </TouchableOpacity>

            <View className="flex-row items-center">
              <Image
                source={require("@/../assets/logo-mark.png")}
                style={{ width: 22, height: 22, resizeMode: "contain", marginRight: 6 }}
              />
              <Text className="font-serif-bold text-lg text-foreground">
                RecruitAI<Text className="text-brand-emerald">.</Text>
              </Text>
            </View>

            <View className="w-9" />
          </View>

          {/* Segmented Switcher: Sign In vs Create Account */}
          <View className="flex-row bg-slate-200/80 p-1 rounded-[8px] my-4">
            <TouchableOpacity
              onPress={() => {
                selectionHaptic();
                router.replace("/(auth)/login");
              }}
              activeOpacity={0.7}
              className="flex-1 py-2 rounded-[6px] items-center"
            >
              <Text className="font-sans-medium text-xs text-muted">
                Sign In
              </Text>
            </TouchableOpacity>

            <View className="flex-1 bg-white py-2 rounded-[6px] items-center">
              <Text className="font-sans-bold text-xs text-foreground">
                Create Account
              </Text>
            </View>
          </View>

          {/* Editorial Header */}
          <View className="my-2">
            <Text className="font-serif-bold text-2xl text-foreground">
              Create your account
            </Text>
            <Text className="font-sans text-xs text-muted mt-1 leading-relaxed">
              Start screening candidates, generating rubrics, and booking interviews.
            </Text>
          </View>

          {/* Google OAuth Button */}
          <TouchableOpacity
            onPress={handleGoogleSignup}
            disabled={googleLoading}
            activeOpacity={0.8}
            className="w-full bg-white border border-border rounded-[6px] py-3 px-4 flex-row items-center justify-center my-3"
          >
            {googleLoading ? (
              <ActivityIndicator size="small" color={COLORS.brandPrimary} />
            ) : (
              <>
                <View className="w-4 h-4 rounded-full bg-red-500 items-center justify-center mr-2">
                  <Text className="text-[10px] font-bold text-white">G</Text>
                </View>
                <Text className="font-sans-bold text-xs text-foreground">
                  Sign up with Google
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Or Divider */}
          <View className="flex-row items-center my-3">
            <View className="flex-1 h-[1px] bg-slate-200" />
            <Text className="font-sans text-[11px] text-muted px-3 uppercase tracking-wider">
              or register with work email
            </Text>
            <View className="flex-1 h-[1px] bg-slate-200" />
          </View>

          {/* Error / Success Notifications */}
          {error ? (
            <Animated.View
              style={[
                shakeStyle,
                {
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "#FFF1F2",
                  borderColor: "#FECDD3",
                  borderWidth: 1,
                  borderRadius: 6,
                  padding: 12,
                  marginVertical: 8,
                },
              ]}
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
                className={`flex-row items-center bg-white rounded-[6px] px-3 py-2.5 ${
                  focusedInput === "fullName"
                    ? "border-2 border-accent"
                    : "border border-border"
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

            {/* Password with Strength Meter */}
            <View className="mt-3">
              <Text className="font-sans-medium text-xs text-foreground mb-1.5">
                Password
              </Text>
              <View
                className={`flex-row items-center bg-white rounded-[6px] px-3 py-2.5 ${
                  focusedInput === "password"
                    ? "border-2 border-accent"
                    : "border border-border"
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
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {showPassword ? (
                    <EyeOff size={16} color={COLORS.muted} />
                  ) : (
                    <Eye size={16} color={COLORS.muted} />
                  )}
                </TouchableOpacity>
              </View>

              {/* Dynamic Password Strength Meter */}
              <PasswordMeter password={password} />
            </View>
          </View>

          {/* Submit CTA */}
          <TouchableOpacity
            onPress={handleSignup}
            disabled={loading}
            activeOpacity={0.85}
            className="w-full bg-accent rounded-[6px] py-3.5 px-4 flex-row items-center justify-center mt-6"
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Text className="font-sans-bold text-sm text-white mr-2">
                  Create Free Account
                </Text>
                <ArrowRight size={16} color="#FFFFFF" />
              </>
            )}
          </TouchableOpacity>

          {/* Terms footnote */}
          <Text className="font-sans text-[11px] text-muted text-center mt-4 leading-relaxed">
            By creating an account, you agree to RecruitAI's recruitment terms and privacy policies.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
