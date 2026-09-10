import React from "react";
import { View, Text } from "react-native";
import { ShieldCheck } from "lucide-react-native";
import { COLORS } from "@/constants/theme";

interface PasswordMeterProps {
  password?: string;
}

export function getPasswordStrength(pass: string = "") {
  if (!pass) return { score: 0, label: "", color: "bg-slate-200" };
  let score = 0;
  if (pass.length >= 8) score++;
  if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score++;
  if (/[0-9]/.test(pass)) score++;
  if (/[^A-Za-z0-9]/.test(pass)) score++;

  if (score <= 1) return { score: 1, label: "Weak", color: "bg-rose-500", textColor: "text-rose-600" };
  if (score === 2) return { score: 2, label: "Fair", color: "bg-amber-500", textColor: "text-amber-600" };
  if (score === 3) return { score: 3, label: "Good", color: "bg-blue-500", textColor: "text-blue-600" };
  return { score: 4, label: "Strong", color: "bg-emerald-500", textColor: "text-emerald-600" };
}

export default function PasswordMeter({ password = "" }: PasswordMeterProps) {
  if (!password) return null;

  const strength = getPasswordStrength(password);

  return (
    <View className="mt-2 mb-1">
      <View className="flex-row items-center justify-between mb-1.5">
        <Text className="font-sans text-xs text-muted">Password strength</Text>
        <Text className={`font-sans-bold text-xs ${strength.textColor}`}>
          {strength.label}
        </Text>
      </View>

      <View className="flex-row gap-1.5 h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
        {[1, 2, 3, 4].map((step) => {
          const isActive = strength.score >= step;
          return (
            <View
              key={step}
              className={`flex-1 rounded-full ${
                isActive ? strength.color : "bg-transparent"
              }`}
            />
          );
        })}
      </View>

      {strength.score >= 4 && (
        <View className="flex-row items-center mt-1.5">
          <ShieldCheck size={12} color={COLORS.statusShortlist} />
          <Text className="font-sans text-[11px] text-emerald-700 ml-1">
            Excellent password strength
          </Text>
        </View>
      )}
    </View>
  );
}
