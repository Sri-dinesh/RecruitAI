import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { showAppModal } from "@/context/ModalContext";
import {
  Mail,
  Send,
  Sparkles,
  Check,
  RotateCcw,
  FileText,
  User,
} from "lucide-react-native";
import { useRecruit } from "@/context/RecruitContext";
import { fetchWithAuth } from "@/lib/apiClient";
import { COLORS } from "@/constants/theme";
import { selectionHaptic, successHaptic, warningHaptic } from "@/lib/haptics";

type Tone = "Professional" | "Casual" | "Direct";
type TemplateType = "invite" | "offer" | "followup" | "reject";

export const EmailDrafter: React.FC = () => {
  const { candidates, jd, setMessages, isBlindHiring } = useRecruit();

  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [tone, setTone] = useState<Tone>("Professional");
  const [activeTemplate, setActiveTemplate] = useState<TemplateType>("invite");
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);

  // Selected candidate to auto-populate
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("");

  const populateTemplate = (
    tmpl: TemplateType,
    candName: string,
    roleTitle: string,
    selectedTone: Tone
  ) => {
    const role = roleTitle || "Software Engineer";
    const name = candName || "Candidate";

    if (tmpl === "invite") {
      setSubject(`Interview Invitation: ${role} at RecruitAI`);
      if (selectedTone === "Casual") {
        setBody(
          `Hi ${name},\n\nThanks for chatting with us! We were really impressed by your profile and would love to jump on a quick 30-minute chat to discuss the ${role} role.\n\nLet us know which time works best for you from the scheduled slots!\n\nBest,\nRecruiting Team`
        );
      } else if (selectedTone === "Direct") {
        setBody(
          `Hello ${name},\n\nYour background aligns well with our requirements for the ${role} position. We invite you to an initial 30-minute technical interview.\n\nPlease confirm your availability for one of the upcoming slots.\n\nRegards,\nRecruitAI Hiring Team`
        );
      } else {
        setBody(
          `Dear ${name},\n\nThank you for your interest in the ${role} position at RecruitAI. After reviewing your qualifications and experience, we would like to invite you to participate in an initial interview.\n\nPlease let us know if the proposed schedule aligns with your calendar.\n\nSincerely,\nRecruiting & Talent Acquisition`
        );
      }
    } else if (tmpl === "offer") {
      setSubject(`Job Offer: ${role} at RecruitAI`);
      setBody(
        `Dear ${name},\n\nWe are thrilled to extend an official offer of employment for the position of ${role} at RecruitAI! Our entire team was deeply impressed by your technical expertise, track record, and problem-solving skills.\n\nPlease find the preliminary terms outlined below. We look forward to welcoming you to the team.\n\nWarm regards,\nRecruitAI Leadership`
      );
    } else if (tmpl === "followup") {
      setSubject(`Following up regarding your application for ${role}`);
      setBody(
        `Hi ${name},\n\nHope your week is going well! Just following up regarding your application for the ${role} position. We are finalizing our review of candidate evaluations and will share an update shortly.\n\nBest regards,\nRecruiting Team`
      );
    } else if (tmpl === "reject") {
      setSubject(`Application Update: ${role} at RecruitAI`);
      setBody(
        `Dear ${name},\n\nThank you for taking the time to speak with our team regarding the ${role} position. While your experience is impressive, we have decided to move forward with other candidates whose backgrounds more closely align with our current immediate priorities.\n\nWe wish you all the best in your continued job search.\n\nSincerely,\nRecruitAI Talent Acquisition`
      );
    }
  };

  // When candidate or template changes, populate template
  useEffect(() => {
    const cand = candidates.find((c) => c.candidate_id === selectedCandidateId) || candidates[0];
    if (cand) {
      setRecipient(cand.email || "candidate@example.com");
      populateTemplate(
        activeTemplate,
        cand.name,
        jd?.role || "Target Role",
        tone
      );
    } else {
      populateTemplate(
        activeTemplate,
        "Candidate",
        jd?.role || "Target Role",
        tone
      );
    }
  }, [selectedCandidateId, activeTemplate, tone, candidates, jd]);

  const handleSelectCandidate = (candId: string) => {
    selectionHaptic();
    setSelectedCandidateId(candId);
  };

  const handleSelectTone = (newTone: Tone) => {
    selectionHaptic();
    setTone(newTone);
  };

  const handleSelectTemplate = (tmpl: TemplateType) => {
    selectionHaptic();
    setActiveTemplate(tmpl);
  };

  const handleSendEmail = async () => {
    if (!recipient.trim() || !body.trim()) {
      showAppModal({
        title: "Incomplete Email",
        message: "Please provide a recipient email and message body.",
        type: "warning",
      });
      return;
    }

    setIsSending(true);
    setSendSuccess(false);

    try {
      const fullDraft = `Subject: ${subject}\n\n${body}`;
      const res = await fetchWithAuth("/api/email/send", {
        method: "POST",
        body: JSON.stringify({
          recipient_email: recipient.trim(),
          email_draft: fullDraft,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to dispatch email.");
      }

      successHaptic();
      setSendSuccess(true);

      // Notify Co-Pilot chat
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `✉️ **Outreach Email Dispatched**: Successfully sent *"${subject}"* to \`${recipient}\`.`,
        },
      ]);

      showAppModal({
        title: "Email Sent",
        message: `Successfully sent outreach to ${recipient}.`,
        type: "success",
      });
      setTimeout(() => setSendSuccess(false), 3000);
    } catch (err: any) {
      console.error("[EmailDrafter] Send error:", err);
      showAppModal({
        title: "Send Failed",
        message: err.message || "Failed to send email via SMTP.",
        type: "error",
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <View className="py-2 px-4">
      {/* Candidate Quick Selector */}
      {candidates.length > 0 && (
        <View className="mb-3">
          <Text className="font-sans-bold text-xs text-foreground uppercase tracking-wider mb-2">
            Select Candidate
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {candidates.map((c, idx) => {
              const isSelected =
                (selectedCandidateId || candidates[0]?.candidate_id) ===
                c.candidate_id;
              const displayName = isBlindHiring
                ? `Cand #${idx + 1}`
                : c.name.split(" ")[0];

              return (
                <TouchableOpacity
                  key={c.candidate_id || idx}
                  onPress={() => handleSelectCandidate(c.candidate_id)}
                  activeOpacity={0.7}
                  className={`flex-row items-center px-3 py-1.5 rounded-[6px] border ${
                    isSelected
                      ? "bg-accent border-accent"
                      : "bg-white border-border"
                  }`}
                >
                  <Text
                    className={`font-sans-bold text-xs ${
                      isSelected ? "text-white" : "text-foreground"
                    }`}
                  >
                    {displayName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Template Shortcuts */}
      <View className="mb-3">
        <Text className="font-sans-bold text-xs text-foreground uppercase tracking-wider mb-2">
          Correspondence Template
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6 }}
        >
          {[
            { key: "invite" as TemplateType, label: "Interview Invite" },
            { key: "offer" as TemplateType, label: "Job Offer" },
            { key: "followup" as TemplateType, label: "Follow-up" },
            { key: "reject" as TemplateType, label: "Rejection" },
          ].map((tmpl) => {
            const isActive = activeTemplate === tmpl.key;
            return (
              <TouchableOpacity
                key={tmpl.key}
                onPress={() => handleSelectTemplate(tmpl.key)}
                activeOpacity={0.7}
                className={`px-3 py-1.5 rounded-[6px] border ${
                  isActive
                    ? "bg-slate-800 border-slate-800"
                    : "bg-white border-border"
                }`}
              >
                <Text
                  className={`font-sans-bold text-[11px] ${
                    isActive ? "text-white" : "text-slate-700"
                  }`}
                >
                  {tmpl.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Tone Selector Pills */}
      <View className="mb-3">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="font-sans-bold text-xs text-foreground uppercase tracking-wider">
            Communication Tone
          </Text>
          <View className="flex-row items-center">
            <Sparkles size={11} color={COLORS.brandPrimary} />
            <Text className="font-sans text-[10px] text-brand-primary ml-1">
              AI Adjusted
            </Text>
          </View>
        </View>
        <View className="flex-row gap-2">
          {(["Professional", "Casual", "Direct"] as Tone[]).map((t) => {
            const isSelected = tone === t;
            return (
              <TouchableOpacity
                key={t}
                onPress={() => handleSelectTone(t)}
                activeOpacity={0.7}
                className={`flex-1 py-1.5 rounded-[6px] items-center border ${
                  isSelected
                    ? "bg-indigo-50 border-brand-primary"
                    : "bg-white border-border"
                }`}
              >
                <Text
                  className={`font-sans-bold text-xs ${
                    isSelected ? "text-brand-primary" : "text-muted"
                  }`}
                >
                  {t}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Email Form Fields */}
      <View className="bg-white border border-border rounded-[6px] p-4 shadow-xs mb-4">
        {/* Recipient */}
        <View className="mb-3">
          <Text className="font-sans-bold text-[11px] text-muted mb-1 uppercase tracking-wider">
            Recipient Email
          </Text>
          <TextInput
            value={recipient}
            onChangeText={setRecipient}
            placeholder="candidate@example.com"
            placeholderTextColor="#94A3B8"
            keyboardType="email-address"
            autoCapitalize="none"
            className="bg-[#F8F6F2] border border-border rounded-[6px] px-3 py-2 font-sans text-xs text-foreground"
          />
        </View>

        {/* Subject */}
        <View className="mb-3">
          <Text className="font-sans-bold text-[11px] text-muted mb-1 uppercase tracking-wider">
            Subject Line
          </Text>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="Subject line..."
            placeholderTextColor="#94A3B8"
            className="bg-[#F8F6F2] border border-border rounded-[6px] px-3 py-2 font-sans-medium text-xs text-foreground"
          />
        </View>

        {/* Body Editor */}
        <View className="mb-4">
          <Text className="font-sans-bold text-[11px] text-muted mb-1 uppercase tracking-wider">
            Message Body
          </Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Compose your email message..."
            placeholderTextColor="#94A3B8"
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            className="bg-[#F8F6F2] border border-border rounded-[6px] p-3 font-sans text-xs text-foreground min-h-[140px] leading-relaxed"
          />
        </View>

        {/* Send Action */}
        <TouchableOpacity
          onPress={handleSendEmail}
          disabled={isSending}
          activeOpacity={0.8}
          className={`flex-row items-center justify-center py-2.5 rounded-[6px] ${
            sendSuccess ? "bg-emerald-600" : "bg-brand-primary"
          }`}
        >
          {isSending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : sendSuccess ? (
            <>
              <Check size={16} color="#FFFFFF" />
              <Text className="font-sans-bold text-xs text-white ml-2">
                Outreach Sent!
              </Text>
            </>
          ) : (
            <>
              <Send size={15} color="#FFFFFF" />
              <Text className="font-sans-bold text-xs text-white ml-2">
                Send Outreach Email
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default EmailDrafter;
