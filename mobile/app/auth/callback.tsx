import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";
import { COLORS } from "@/constants/theme";

export default function AuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const handleUrl = async () => {
      try {
        const url = await Linking.getInitialURL();
        if (!url) {
          router.replace("/");
          return;
        }

        // Parse hash fragment or query params
        // e.g. recruitai://auth/callback#access_token=...&refresh_token=...&type=recovery
        const parsedUrl = new URL(url);
        let hashParams = new URLSearchParams(parsedUrl.hash.replace(/^#/, ""));
        let queryParams = new URLSearchParams(parsedUrl.search);

        const accessToken = hashParams.get("access_token") || queryParams.get("access_token") || (params.access_token as string);
        const refreshToken = hashParams.get("refresh_token") || queryParams.get("refresh_token") || (params.refresh_token as string);
        const type = hashParams.get("type") || queryParams.get("type") || (params.type as string);

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            setErrorMsg(error.message);
            return;
          }

          if (type === "recovery") {
            router.replace("/(auth)/reset-password");
          } else {
            router.replace("/");
          }
        } else {
          // If no token, return to welcome
          router.replace("/(auth)/welcome");
        }
      } catch (err: any) {
        console.warn("[AuthCallback] Error parsing auth redirect:", err);
        setErrorMsg(err?.message || "Failed to process authentication link.");
      }
    };

    handleUrl();
  }, [params]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: COLORS.background,
        justifyContent: "center",
        alignItems: "center",
        padding: 24,
      }}
    >
      {errorMsg ? (
        <View style={{ alignItems: "center" }}>
          <Text style={{ color: COLORS.statusReject, fontSize: 14, textAlign: "center" }}>
            {errorMsg}
          </Text>
        </View>
      ) : (
        <View style={{ alignItems: "center" }}>
          <ActivityIndicator size="large" color={COLORS.brandPrimary} />
          <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 12 }}>
            Verifying recruiter session...
          </Text>
        </View>
      )}
    </View>
  );
}
