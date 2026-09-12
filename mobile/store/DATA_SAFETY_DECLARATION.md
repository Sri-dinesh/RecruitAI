# RecruitAI — Google Play Data Safety Declaration Guide

This document contains the exact answers to submit in the **Data safety** section of the Google Play Console for **RecruitAI** (`com.recruitai.app`).

---

## 1. Data Collection and Security Overview

| Question | Response |
| :--- | :--- |
| **Does your app collect or share any of the required user data types?** | **Yes** |
| **Is all of the user data collected by your app encrypted in transit?** | **Yes** (Transmitted over HTTPS/TLS 1.3) |
| **Do you provide a way for users to request that their data is deleted?** | **Yes** (Direct link: `https://recruitaiofficial.vercel.app/data-deletion`) |

---

## 2. Data Types Collected

### A. Personal Info
- **Name:**
  - *Collected?* **Yes**
  - *Shared with third parties?* **No**
  - *Processed ephemerally?* **No**
  - *Required or optional?* **Required for account creation & candidate record management**
  - *Purposes:* App functionality, Account management.
- **Email Address:**
  - *Collected?* **Yes**
  - *Shared with third parties?* **No**
  - *Purposes:* Account authentication, Recruiter communications, Notifications.
- **Phone Number:**
  - *Collected?* **Optional** (only if extracted from uploaded candidate resumes)
  - *Shared with third parties?* **No**
  - *Purposes:* App functionality (candidate dossier).

### B. Files and Docs
- **Files and documents (PDFs / Resumes / JDs):**
  - *Collected?* **Yes**
  - *Shared with third parties?* **No**
  - *Processed ephemerally?* **No** (Stored in recruiter's private Supabase / PostgreSQL database with Row-Level Security)
  - *Purposes:* App functionality (Resume parsing, candidate scoring, AI screening).

### C. App Activity
- **App interactions (session actions, triage decisions):**
  - *Collected?* **Yes**
  - *Shared with third parties?* **No**
  - *Purposes:* Analytics, App functionality (Pipeline progression: shortlisted, offered, rejected).

---

## 3. Data Sharing Declaration
- **Third-Party Data Sharing:** **None.** RecruitAI does not sell, rent, or transfer any user or candidate data to data brokers, ad networks, or external commercial entities.

---

## 4. Privacy & Security Practices

- **Encryption in Transit:** All network requests to `https://recruitai-vpbe.onrender.com` and Supabase are encrypted using industry-standard TLS 1.2 / TLS 1.3 protocols.
- **Storage Security:** Sensitive user tokens are stored in Android Hardware-backed Keystore (`expo-secure-store`).
- **Account & Data Deletion Mechanism:**
  - In-app link in Settings: `https://recruitaiofficial.vercel.app/data-deletion`
  - Users can request deletion of account credentials, active sessions, uploaded resumes, and generated reports.
