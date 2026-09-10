import React, { useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import {
  Briefcase,
  ChevronDown,
  ChevronUp,
  UploadCloud,
  MapPin,
  Clock,
  DollarSign,
  FileCheck,
} from "lucide-react-native";
import { COLORS } from "@/constants/theme";
import { selectionHaptic } from "@/lib/haptics";
import type { JobDescription } from "@/types/schema";

interface ActiveJdCardProps {
  jd: JobDescription | null;
  onUploadJd: () => void;
  isUploading?: boolean;
}

export const ActiveJdCard: React.FC<ActiveJdCardProps> = ({
  jd,
  onUploadJd,
  isUploading = false,
}) => {
  const [expanded, setExpanded] = useState(false);

  const toggleExpand = () => {
    selectionHaptic();
    setExpanded((prev) => !prev);
  };

  if (!jd) {
    return (
      <View className="bg-white border border-border rounded-[6px] p-4 mx-4 mt-3 shadow-xs">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center flex-1 mr-3">
            <View className="w-9 h-9 rounded-full bg-slate-100 items-center justify-center mr-3">
              <Briefcase size={18} color={COLORS.brandPrimary} />
            </View>
            <View className="flex-1">
              <Text className="font-serif-bold text-sm text-foreground">
                No Active Job Description
              </Text>
              <Text className="font-sans text-[11px] text-muted mt-0.5">
                Upload a JD to match candidates and score skills
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={onUploadJd}
            disabled={isUploading}
            activeOpacity={0.7}
            className="flex-row items-center bg-accent px-3 py-1.5 rounded-[6px]"
          >
            {isUploading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <UploadCloud size={14} color="#FFFFFF" />
                <Text className="font-sans-bold text-xs text-white ml-1.5">
                  Upload JD
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View className="bg-white border border-border rounded-[6px] p-4 mx-4 mt-3 shadow-xs">
      {/* Header Bar */}
      <View className="flex-row items-start justify-between">
        <TouchableOpacity
          onPress={toggleExpand}
          activeOpacity={0.7}
          className="flex-row items-center flex-1 mr-2"
        >
          <View className="w-8 h-8 rounded-[6px] bg-emerald-50 border border-emerald-200 items-center justify-center mr-2.5">
            <FileCheck size={16} color={COLORS.statusShortlist} />
          </View>
          <View className="flex-1">
            <View className="flex-row items-center flex-wrap gap-1.5">
              <Text
                className="font-serif-bold text-sm text-foreground"
                numberOfLines={1}
              >
                {jd.role || "Target Role"}
              </Text>
              <View className="bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                <Text className="font-sans-bold text-[9px] text-emerald-800">
                  Active JD
                </Text>
              </View>
            </View>

            <View className="flex-row items-center gap-3 mt-1">
              <View className="flex-row items-center">
                <Clock size={11} color={COLORS.muted} />
                <Text className="font-sans text-[11px] text-muted ml-1">
                  {jd.experience_years}+ yrs exp
                </Text>
              </View>

              {jd.location ? (
                <View className="flex-row items-center">
                  <MapPin size={11} color={COLORS.muted} />
                  <Text className="font-sans text-[11px] text-muted ml-1" numberOfLines={1}>
                    {jd.location}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </TouchableOpacity>

        <View className="flex-row items-center gap-1">
          <TouchableOpacity
            onPress={onUploadJd}
            disabled={isUploading}
            activeOpacity={0.7}
            className="p-1.5 rounded-[4px] bg-slate-50 border border-border"
          >
            {isUploading ? (
              <ActivityIndicator size="small" color={COLORS.brandPrimary} />
            ) : (
              <UploadCloud size={14} color={COLORS.brandPrimary} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={toggleExpand}
            activeOpacity={0.7}
            className="p-1.5 rounded-[4px] bg-slate-50 border border-border ml-1"
          >
            {expanded ? (
              <ChevronUp size={14} color={COLORS.muted} />
            ) : (
              <ChevronDown size={14} color={COLORS.muted} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Collapsed view summary preview */}
      {!expanded && jd.required_skills && jd.required_skills.length > 0 && (
        <View className="flex-row flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-slate-100">
          {jd.required_skills.slice(0, 4).map((skill, idx) => (
            <View
              key={idx}
              className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-[4px]"
            >
              <Text className="font-sans text-[10px] text-slate-700">{skill}</Text>
            </View>
          ))}
          {jd.required_skills.length > 4 && (
            <TouchableOpacity onPress={toggleExpand}>
              <Text className="font-sans-bold text-[10px] text-accent mt-0.5">
                +{jd.required_skills.length - 4} more
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Expanded View */}
      {expanded && (
        <View className="mt-3 pt-3 border-t border-slate-100">
          {jd.salary_range && (
            <View className="flex-row items-center mb-2.5">
              <DollarSign size={13} color={COLORS.statusShortlist} />
              <Text className="font-sans-bold text-xs text-foreground ml-1">
                Salary Range:{" "}
                <Text className="font-sans text-muted">{jd.salary_range}</Text>
              </Text>
            </View>
          )}

          {/* Required Skills */}
          {jd.required_skills && jd.required_skills.length > 0 && (
            <View className="mb-3">
              <Text className="font-sans-bold text-[11px] text-foreground mb-1.5">
                Required Skills ({jd.required_skills.length})
              </Text>
              <View className="flex-row flex-wrap gap-1.5">
                {jd.required_skills.map((skill, idx) => (
                  <View
                    key={idx}
                    className="bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-[4px]"
                  >
                    <Text className="font-sans text-xs text-slate-800">{skill}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Nice-to-Have Skills */}
          {jd.nice_to_have && jd.nice_to_have.length > 0 && (
            <View className="mb-3">
              <Text className="font-sans-bold text-[11px] text-muted mb-1.5">
                Nice to Have
              </Text>
              <View className="flex-row flex-wrap gap-1.5">
                {jd.nice_to_have.map((skill, idx) => (
                  <View
                    key={idx}
                    className="bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-[4px]"
                  >
                    <Text className="font-sans text-xs text-indigo-700">{skill}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Responsibilities */}
          {jd.responsibilities && jd.responsibilities.length > 0 && (
            <View className="mb-3">
              <Text className="font-sans-bold text-[11px] text-foreground mb-1">
                Core Responsibilities
              </Text>
              {jd.responsibilities.slice(0, 4).map((resp, idx) => (
                <View key={idx} className="flex-row items-start mt-1">
                  <Text className="text-muted mr-1.5 text-xs">•</Text>
                  <Text className="font-sans text-xs text-muted flex-1 leading-4">
                    {resp}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Re-upload Action */}
          <View className="flex-row justify-end mt-1 pt-2 border-t border-slate-100">
            <TouchableOpacity
              onPress={onUploadJd}
              disabled={isUploading}
              activeOpacity={0.7}
              className="flex-row items-center px-3 py-1.5 rounded-[6px] bg-slate-50 border border-border"
            >
              <UploadCloud size={13} color={COLORS.brandPrimary} />
              <Text className="font-sans-bold text-xs text-brand-primary ml-1.5">
                Update / Re-upload JD
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

export default ActiveJdCard;
