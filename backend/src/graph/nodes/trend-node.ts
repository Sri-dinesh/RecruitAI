import { searchSkillTrends } from '../../tools/skill-trend-tool.js';
import { getGraphDeps, type GraphDeps } from '../deps.js';
import { historyOf } from '../state.js';
import type { RecruitState } from '../state.js';

/**
 * Port of `backend/app/graph/nodes/trend_node.py`.
 *
 * Calls the skill-trend tool, parses its markdown bullets, and classifies the
 * JD's required skills into market-aligned, trending-but-missing, and
 * niche/legacy buckets.
 */

function extractSkillsFromTrendText(trendText: string): string[] {
  const skills: string[] = [];
  let inCitations = false;

  for (const line of trendText.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase().includes('citations') || trimmed.toLowerCase().includes('sources')) {
      inCitations = true;
      continue;
    }
    if (inCitations && trimmed.startsWith('#')) {
      inCitations = false;
    }

    if (!inCitations && trimmed.startsWith('- ')) {
      // Ignore markdown link citations, e.g. - [TechCrunch](...).
      if (
        trimmed.startsWith('- [') ||
        trimmed.includes('http://') ||
        trimmed.includes('https://')
      ) {
        continue;
      }
      let skill = trimmed.slice(2).trim();
      if (skill.includes('**:')) {
        skill = skill.split('**:')[0]?.replaceAll('**', '').trim() ?? '';
      } else if (skill.includes('**')) {
        skill = skill.replaceAll('**', '').trim();
      }
      if (skill && skill.length < 60) {
        skills.push(skill);
      }
    }
  }

  return skills;
}

export async function trendNode(
  state: RecruitState,
  deps: GraphDeps = getGraphDeps(),
): Promise<Partial<RecruitState>> {
  const history = historyOf(state);
  const jd = state.jd_structured ?? null;

  if (!jd) {
    return {
      conversation_history: [
        ...history,
        {
          role: 'assistant',
          content:
            'I need a Job Description loaded first before I can analyze skill trends. Please load a JD first.',
        },
      ],
    };
  }

  const role = jd.role;
  const jdRequiredSkills = (jd.required_skills ?? []).map((skill) => skill.toLowerCase());

  let trendText: string;
  try {
    trendText = await searchSkillTrends(role, { tavilyService: deps.getTavily() });
  } catch (error) {
    return {
      conversation_history: [
        ...history,
        {
          role: 'assistant',
          content: `Failed to fetch skill trends: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
    };
  }

  const trendingSkills = extractSkillsFromTrendText(trendText);
  const trendingLower = trendingSkills.map((skill) => skill.toLowerCase());

  const inJdAndTrending: string[] = [];
  const trendingNotInJd: string[] = [];

  trendingLower.forEach((skillLower, index) => {
    const display = trendingSkills[index] as string;
    const matched = jdRequiredSkills.some(
      (jdSkill) => skillLower.includes(jdSkill) || jdSkill.includes(skillLower),
    );
    if (matched) {
      inJdAndTrending.push(display);
    } else {
      trendingNotInJd.push(display);
    }
  });

  const jdSkillsNotTrending: string[] = [];
  jd.required_skills.forEach((display, index) => {
    const jdSkillLower = jdRequiredSkills[index] as string;
    const matched = trendingLower.some(
      (trendLower) => jdSkillLower.includes(trendLower) || trendLower.includes(jdSkillLower),
    );
    if (!matched) {
      jdSkillsNotTrending.push(display);
    }
  });

  const lines = [
    `### 📈 Skill Trend Analysis for **${role}**\n`,
    "*Comparing your JD's required skills against 2026 market trends.*\n",
  ];

  lines.push('---\n');
  lines.push('#### 🔥 Trending Skills in Your JD (Market-Aligned)');
  if (inJdAndTrending.length > 0) {
    for (const skill of inJdAndTrending) {
      lines.push(`- ✅ **${skill}**`);
    }
  } else {
    lines.push('- *None of the JD skills directly match top trending skills.*');
  }

  lines.push('\n#### 🆕 Trending Skills NOT in Your JD (Consider Adding)');
  if (trendingNotInJd.length > 0) {
    for (const skill of trendingNotInJd.slice(0, 8)) {
      lines.push(`- 💡 ${skill}`);
    }
  } else {
    lines.push('- *Your JD already covers the trending skill landscape well!*');
  }

  lines.push('\n#### 🗓️ JD Skills Not in Top Trends (Niche/Legacy)');
  if (jdSkillsNotTrending.length > 0) {
    for (const skill of jdSkillsNotTrending) {
      lines.push(`- ⚠️ ${skill}`);
    }
  } else {
    lines.push('- *All JD skills are aligned with current market trends.*');
  }

  lines.push('\n---');
  lines.push('\n**Raw Trend Data:**');
  lines.push(trendText);

  return {
    conversation_history: [...history, { role: 'assistant', content: lines.join('\n') }],
  };
}
