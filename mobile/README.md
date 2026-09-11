# RecruitAI Mobile — React Native & Expo 57 Recruitment Companion

<div align="center">

[![Expo](https://img.shields.io/badge/Expo-57.0-000020?style=flat-square&logo=expo)](https://expo.dev/)
[![React Native](https://img.shields.io/badge/React%20Native-0.86-61dafb?style=flat-square&logo=react)](https://reactnative.dev/)
[![NativeWind](https://img.shields.io/badge/NativeWind-v4.2-38B2AC?style=flat-square&logo=tailwind-css)](https://www.nativewind.dev/)
[![Expo Router](https://img.shields.io/badge/Expo%20Router-v4-000000?style=flat-square&logo=expo)](https://docs.expo.dev/router/introduction/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth-3ecf8e?style=flat-square&logo=supabase)](https://supabase.com/)
[![Jest](https://img.shields.io/badge/Jest-29.7-C21325?style=flat-square&logo=jest)](https://jestjs.io/)
[![Maestro](https://img.shields.io/badge/Maestro-E2E-0284C7?style=flat-square)](https://maestro.mobile.dev/)

**The official high-ergonomics iOS & Android mobile companion for RecruitAI. Screen technical applicants, trigger conversational agent workflows, schedule interviews, and monitor hiring intelligence on the go.**

</div>

---

## 📱 Features & Screen Overview

### 1. Conversational Co-Pilot (Tab 1)
- **LangGraph Multi-Agent Engine**: Interacts with the backend recruitment supervisor and specialized workers (JD parser, vector screener, interview architect, salary analyst, and coordinator).
- **Recruitment Action Chips**: 8 pre-configured agent routine chips (*Screen All Resumes*, *Generate Shortlist*, *Draft Outreach*, *Salary Benchmark*, *Schedule Interview*, *Compare Candidates*, *Interview Questions*, *Pipeline Status*).
- **Document & Resume Ingestion**: Attach files (`.pdf`, `.docx`, `.txt`, `.png`) directly from local device storage or camera scan via `expo-document-picker`.
- **Typing Indicator & Abort Controller**: Live pulsating three-dot animation and instantaneous request abortion via native `AbortController`.

### 2. Talent Pool & Decision Workflow (Tab 2)
- **Active Job Description**: Expandable overview of target role requirements, minimum experience, and required skill chips.
- **Candidate Triage Cards**: Candidate match scores, experience years, skills checklist, missing gaps, and contact chips.
- **Instant Decision Bar**: One-touch **Shortlist (✓)**, **Offer (★)**, or **Reject (✕)** buttons with native haptic feedback (`Haptics.notificationAsync`) and real-time database synchronization.
- **Blind Hiring Mode**: Toggleable PII redaction that replaces candidate names with initials/indices and masks email addresses and phone numbers.
- **Candidate Inspector**: Detailed modal with 1–5 star technical/communication rubric rating and recruiter notes persistence.

### 3. Dynamic Workspace Tools (Tab 3)
- **Side-by-Side Comparison Matrix**: Compare candidate scorecards, matched qualifications, and gap analyses.
- **Visual Interview Slot Scheduler**: Interactive calendar slots for 30-minute interviews that sync directly to the LangGraph session state.
- **Recruiter Email Drafter**: Auto-drafted candidate outreach with tone selector (`Professional`, `Casual`, `Direct`) and direct SMTP sending.
- **Native ATS Export & PDF Reports**: Generate RFC 4180 compliant CSV or Lever/Greenhouse JSON and export via native iOS/Android sharing (`expo-sharing`).

### 4. Recruitment Intelligence & Analytics (Tab 4)
- **8 Executive KPI Cards**: Total Candidates, Active Jobs, Shortlisted, Interviews, Average Match Score, Screening Rate, Interview Rate, and Active Campaigns.
- **Hiring Velocity Cards**: Milestone tracking for Days to Shortlist, Days to Interview, and Days to Offer.
- **Pipeline Funnel**: Stepped conversion visualization from Ingested $\rightarrow$ Shortlisted $\rightarrow$ Interview $\rightarrow$ Offer.
- **Ingestion Timeline (Gifted Charts)**: Native bezier AreaChart with customizable lookback windows (**7D**, **30D**, **90D**).
- **Quality Distribution Histogram**: Candidate breakdown across 5 tiers (Top Tier, Strong Fit, Good Fit, Fair Fit, Low Fit).
- **Skills Demand Ranking**: Horizontal bar chart of most frequently requested skills.
- **Jobs Table & Live Activity Feed**: Active campaign positions and chronological audit trail.

---

## 🎨 Design System & Aesthetics

The mobile application mirrors the desktop web interface:

- **Color Palette**:
  - Background Canvas: Ivory `#F8F6F2`
  - Primary Dark: Navy `#1B2A4A`
  - Accent Slate: `#263A66`
  - Text Primary: `#111111`
  - Border Subdued: `#E5E7EB`
  - Status Shortlist: Emerald `#10B981`
  - Status Offer: Amber `#F59E0B`
  - Status Reject: Rose `#EF4444`
- **Typography**:
  - Headings: `Fraunces` editorial serif
  - UI & Body: `DM Sans` geometric sans-serif
  - Monospace: `Courier` / system mono
- **Corner Radii & Elevation**:
  - Consistent `6px` border radius
  - Subtle cards with borders and hardware-accelerated drop shadows

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `v18.0.0` or later
- **npm** or **bun**
- **Expo Go** app installed on your physical mobile device, or Xcode / Android Studio for emulators.

### 1. Environment Configuration
Create a `.env` file in the `mobile/` directory:

```env
# Backend API Base URL (use your machine's LAN IP when testing on physical devices)
EXPO_PUBLIC_BACKEND_URL=http://192.168.1.100:8000

# Supabase Auth Configuration
EXPO_PUBLIC_SUPABASE_URL=https://<your-project-id>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

### 2. Install Dependencies
```bash
cd mobile
npm install
```

### 3. Launch Development Server
```bash
npx expo start
```
- Press `a` to launch on a running Android emulator.
- Press `i` to launch on the iOS simulator.
- Scan the QR code with **Expo Go** on Android or Camera app on iOS.

---

## 🛡️ Offline Resilience & Network Handling

- **Secure Hardware Storage**: Active campaign sessions, candidate statuses, and analytical snapshots are saved to `expo-secure-store`.
- **Fallback Hydration**: If the network drops or the server is temporarily unreachable, the app automatically hydrates cached data.
- **Ambient Connectivity Indicator**: Displays a `WifiOff` warning bar (*"Offline Mode — Changes will sync when reconnected"*) when disconnected.
- **Exponential Backoff**: Automatic retry interceptor for flaky cellular network requests in `src/lib/apiClient.ts`.
- **Crash Recovery**: Top-level `ErrorBoundary.tsx` prevents full app terminations on unhandled exceptions.

---

## 🧪 Testing Suite

### Unit & Component Tests (Jest)
Runs test suites verifying candidate triage filtering, PII blind hiring masking, ATS CSV serialization, and authentication logic:
```bash
npm test
```

### End-to-End Testing (Maestro)
Automated flow simulating authentication, session switching, candidate review, rubric rating, and analytics inspection:
```bash
# Ensure Android emulator or iOS simulator is running
maestro test .maestro/recruitment_flow.yaml
```

---

## 📦 Cloud Builds & EAS Deployment

The mobile application is pre-configured with Expo Application Services (EAS):

### Build Profiles (`eas.json`)
- **`development`**: Development client with debugging tools and internal distribution.
- **`preview`**: Standalone `.apk` / TestFlight ad-hoc build for team dogfooding.
- **`production`**: Release build configured for Google Play Console (`.aab`) and Apple App Store (`.ipa`).

### Compiling Standalone Builds
```bash
# Install EAS CLI
npm install -g eas-cli
eas login

# Trigger cloud build for Android and iOS
eas build --platform all --profile preview
```
