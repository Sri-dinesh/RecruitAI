export interface PromptChip {
  id: string;
  label: string;
  prompt: string;
  iconName: string;
}

export const ACTION_CHIPS: PromptChip[] = [
  {
    id: "load-jd",
    label: "Load JD & Resumes",
    prompt: "Load the current Job Description and candidate resumes into this session.",
    iconName: "FileText",
  },
  {
    id: "screen-candidates",
    label: "Screen & Rank",
    prompt: "Screen and rank candidates against the loaded Job Description, calculating skill matches and gap analysis.",
    iconName: "Users",
  },
  {
    id: "count-resumes",
    label: "Count Resumes",
    prompt: "How many candidate resumes have been ingested so far, and what are their headline titles?",
    iconName: "Hash",
  },
  {
    id: "interview-prep",
    label: "Interview Prep",
    prompt: "Generate targeted technical and behavioral interview prep questions for the top-matched candidates.",
    iconName: "HelpCircle",
  },
  {
    id: "rewrite-jd",
    label: "Rewrite JD",
    prompt: "Rewrite this Job Description to make it more appealing to high-velocity startup talent.",
    iconName: "Edit3",
  },
  {
    id: "market-salary",
    label: "Salary Benchmarks",
    prompt: "What is the current market compensation and salary range for this role and seniority level?",
    iconName: "DollarSign",
  },
  {
    id: "finalize-shortlist",
    label: "Finalize Shortlist",
    prompt: "Finalize the candidate shortlist and prepare them for recruiter decision review.",
    iconName: "CheckSquare",
  },
  {
    id: "schedule-interview",
    label: "Schedule Slot",
    prompt: "Help me schedule interview time slots for shortlisted candidates.",
    iconName: "Calendar",
  },
];
