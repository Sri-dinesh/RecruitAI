import { useState, useEffect, useCallback } from "react";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as SecureStore from "expo-secure-store";
import { fetchWithAuth } from "@/lib/apiClient";
import { selectionHaptic, successHaptic, warningHaptic } from "@/lib/haptics";
import type {
  AnalyticsSummary,
  PipelineStage,
  TimeSeriesPoint,
  MatchBucket,
  SkillDemand,
  HiringVelocity,
  JobSummaryRow,
  ActivityEvent,
  LookbackDays,
} from "@/types/analytics";

export function useAnalytics() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [pipeline, setPipeline] = useState<PipelineStage[]>([]);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesPoint[]>([]);
  const [matchDistribution, setMatchDistribution] = useState<MatchBucket[]>([]);
  const [topSkills, setTopSkills] = useState<SkillDemand[]>([]);
  const [velocity, setVelocity] = useState<HiringVelocity | null>(null);
  const [jobs, setJobs] = useState<JobSummaryRow[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [lookbackDays, setLookbackDays] = useState<LookbackDays>(30);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(
    async (days: LookbackDays = lookbackDays) => {
      setError(null);
      try {
        const [
          summaryRes,
          pipelineRes,
          timeSeriesRes,
          distRes,
          skillsRes,
          velocityRes,
          jobsRes,
          activityRes,
        ] = await Promise.all([
          fetchWithAuth("/api/analytics/summary").catch(() => null),
          fetchWithAuth("/api/analytics/pipeline").catch(() => null),
          fetchWithAuth(`/api/analytics/candidates-over-time?days=${days}`).catch(() => null),
          fetchWithAuth("/api/analytics/match-distribution").catch(() => null),
          fetchWithAuth("/api/analytics/top-skills?top_n=10").catch(() => null),
          fetchWithAuth("/api/analytics/hiring-velocity").catch(() => null),
          fetchWithAuth("/api/analytics/jobs-summary").catch(() => null),
          fetchWithAuth("/api/analytics/recent-activity?limit=20").catch(() => null),
        ]);

        let s = null, p = [], ts = [], md = [], sk = [], v = null, j = [], a = [];
        if (summaryRes?.ok) {
          s = await summaryRes.json();
          setSummary(s);
        }
        if (pipelineRes?.ok) {
          p = await pipelineRes.json();
          setPipeline(p || []);
        }
        if (timeSeriesRes?.ok) {
          ts = await timeSeriesRes.json();
          setTimeSeries(ts || []);
        }
        if (distRes?.ok) {
          md = await distRes.json();
          setMatchDistribution(md || []);
        }
        if (skillsRes?.ok) {
          sk = await skillsRes.json();
          setTopSkills(sk || []);
        }
        if (velocityRes?.ok) {
          v = await velocityRes.json();
          setVelocity(v);
        }
        if (jobsRes?.ok) {
          j = await jobsRes.json();
          setJobs(j || []);
        }
        if (activityRes?.ok) {
          a = await activityRes.json();
          setActivity(a || []);
        }

        if (summaryRes?.ok || pipelineRes?.ok) {
          SecureStore.setItemAsync(
            "recruitai_cached_analytics",
            JSON.stringify({
              summary: s,
              pipeline: p,
              timeSeries: ts,
              matchDistribution: md,
              topSkills: sk,
              velocity: v,
              jobs: j,
              activity: a,
              cachedAt: Date.now(),
            })
          ).catch(() => {});
        } else {
          // Attempt offline cache recovery
          const cached = await SecureStore.getItemAsync("recruitai_cached_analytics");
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed.summary) setSummary(parsed.summary);
            if (parsed.pipeline) setPipeline(parsed.pipeline);
            if (parsed.timeSeries) setTimeSeries(parsed.timeSeries);
            if (parsed.matchDistribution) setMatchDistribution(parsed.matchDistribution);
            if (parsed.topSkills) setTopSkills(parsed.topSkills);
            if (parsed.velocity) setVelocity(parsed.velocity);
            if (parsed.jobs) setJobs(parsed.jobs);
            if (parsed.activity) setActivity(parsed.activity);
          }
        }
      } catch (err: any) {
        console.error("[useAnalytics] Fetch error, attempting offline cache:", err);
        try {
          const cached = await SecureStore.getItemAsync("recruitai_cached_analytics");
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed.summary) setSummary(parsed.summary);
            if (parsed.pipeline) setPipeline(parsed.pipeline);
            if (parsed.timeSeries) setTimeSeries(parsed.timeSeries);
            if (parsed.matchDistribution) setMatchDistribution(parsed.matchDistribution);
            if (parsed.topSkills) setTopSkills(parsed.topSkills);
            if (parsed.velocity) setVelocity(parsed.velocity);
            if (parsed.jobs) setJobs(parsed.jobs);
            if (parsed.activity) setActivity(parsed.activity);
          }
        } catch {}
        setError(err.message || "Failed to load recruitment analytics.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [lookbackDays]
  );

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAnalytics(lookbackDays);
  }, [fetchAnalytics, lookbackDays]);

  const changeLookback = useCallback(
    async (days: LookbackDays) => {
      selectionHaptic();
      setLookbackDays(days);
      setLoading(true);
      await fetchAnalytics(days);
    },
    [fetchAnalytics]
  );

  const exportCsv = useCallback(async () => {
    try {
      selectionHaptic();
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        throw new Error("Sharing is not available on this platform.");
      }

      let csv = "RecruitAI Recruitment Intelligence Export\n\n";

      // 1. KPI Summary
      csv += "=== KPI SUMMARY ===\n";
      csv += "Metric,Value\n";
      if (summary) {
        csv += `Total Candidates,${summary.total_candidates}\n`;
        csv += `Total Jobs,${summary.total_jobs}\n`;
        csv += `Active Jobs,${summary.active_jobs}\n`;
        csv += `Total Applications,${summary.total_applications}\n`;
        csv += `Shortlisted Candidates,${summary.total_shortlisted}\n`;
        csv += `Total Interviews,${summary.total_interviews}\n`;
        csv += `Total Offered,${summary.total_offered}\n`;
        csv += `Average Match Score,${summary.avg_match_score ?? "N/A"}%\n`;
        csv += `Screening Rate,${summary.screening_rate ?? "N/A"}%\n`;
        csv += `Interview Rate,${summary.interview_rate ?? "N/A"}%\n`;
      }
      csv += "\n";

      // 2. Pipeline Funnel
      csv += "=== PIPELINE FUNNEL ===\n";
      csv += "Stage,Count,Percentage\n";
      pipeline.forEach((p) => {
        csv += `"${p.stage}",${p.count},${p.percentage}%\n`;
      });
      csv += "\n";

      // 3. Top Skills
      csv += "=== TOP SKILLS DEMAND ===\n";
      csv += "Skill,Demand Count\n";
      topSkills.forEach((s) => {
        csv += `"${s.skill}",${s.demand_count}\n`;
      });
      csv += "\n";

      // 4. Jobs Summary
      csv += "=== JOBS SUMMARY ===\n";
      csv += "Job Title,Status,Created At,Applied,Shortlisted,Interviewed,Offered,Avg Score\n";
      jobs.forEach((j) => {
        csv += `"${j.title}","${j.status}","${j.created_at}",${j.total_applied},${j.total_shortlisted},${j.total_interviewed},${j.total_offered},${j.avg_match_score ?? "N/A"}\n`;
      });

      const uri = `${FileSystem.cacheDirectory}recruitai_analytics_${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      await Sharing.shareAsync(uri, {
        mimeType: "text/csv",
        dialogTitle: "Share Recruitment Analytics CSV",
        UTI: "public.comma-separated-values-text",
      });

      successHaptic();
    } catch (err: any) {
      console.error("[useAnalytics] Export error:", err);
      warningHaptic();
    }
  }, [summary, pipeline, topSkills, jobs]);

  return {
    summary,
    pipeline,
    timeSeries,
    matchDistribution,
    topSkills,
    velocity,
    jobs,
    activity,
    lookbackDays,
    loading,
    refreshing,
    error,
    refresh,
    changeLookback,
    exportCsv,
  };
}

export default useAnalytics;
