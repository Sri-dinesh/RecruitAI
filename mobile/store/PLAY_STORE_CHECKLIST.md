# RecruitAI — Google Play Store Pre-Launch Audit & Verification Checklist

**App Name:** RecruitAI  
**Package Name:** `com.recruitai.app`  
**Version:** `1.0.0` (Version Code: `1`)  
**Target Android Version:** Android 15 / 16+ (API 35/36)  
**Minimum Android Version:** Android 7.0 (API 24)  
**Build Format:** Android App Bundle (`.aab`)  

---

## 📋 Comprehensive Launch Readiness Checklist

### Phase 1: Application Architecture & Manifest Audit (`app.json` & `eas.json`)
- [x] **App Name Set to "RecruitAI"**: Configured in `app.json` line 3 (`"name": "RecruitAI"`).
- [x] **Package Name Declared**: `"package": "com.recruitai.app"` configured.
- [x] **Version & Version Code Configured**: `"version": "1.0.0"`, `"versionCode": 1`.
- [x] **Android 15 / 16+ Compatibility**: Explicitly locked compile & target SDK to 35 via `expo-build-properties` plugin (compliant with Google Play's target SDK 34+ requirement).
- [x] **Cleartext Traffic Disabled**: Set `"usesCleartextTraffic": false` to enforce HTTPS on all network communications.
- [x] **Deprecated Permissions Removed**: Eliminated `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE` to comply with scoped storage and avoid Play Console All Files Access rejection.
- [x] **Adaptive Icons Configured**: High-res foreground (`432x432`), background (`432x432`), and monochrome themed icons (`432x432`) located in `assets/`.
- [x] **Deep Linking & App Links**: `autoVerify: true` configured with `https://recruitaiofficial.vercel.app` and `/.well-known/assetlinks.json`.
- [x] **EAS Production Profile Configured**: `eas.json` set to generate `"buildType": "app-bundle"` for production.

---

### Phase 2: In-App Legal, Compliance & Privacy Links
- [x] **Privacy Policy in App**:
  - Welcome screen footer (`mobile/app/(auth)/welcome.tsx`)
  - Login screen footer (`mobile/app/(auth)/login.tsx`)
  - Signup terms link (`mobile/app/(auth)/signup.tsx`)
  - Session / Recruiter settings modal (`mobile/src/components/modals/SessionPickerModal.tsx`)
  - Verified live URL: `https://recruitaiofficial.vercel.app/privacy`
- [x] **Terms of Service in App**:
  - Clickable across all auth flows and settings modal.
  - Verified live URL: `https://recruitaiofficial.vercel.app/terms`
- [x] **Customer Support & Help Link**:
  - Accessible in Welcome, Login, and Settings modal.
  - Verified live URL: `https://recruitaiofficial.vercel.app/support`
- [x] **Data & Account Deletion Link**:
  - Required by Google Play policy for apps with account registration.
  - Directly accessible in SessionPickerModal and auth screens.
  - Verified live URL: `https://recruitaiofficial.vercel.app/data-deletion`

---

### Phase 3: Security & Code Hygiene Audit
- [x] **Zero Hardcoded Secrets**: Removed Supabase keys and LAN IP strings from client source code.
- [x] **Production Backend Target**: Configured default endpoint to live Render cloud backend: `https://recruitai-vpbe.onrender.com`.
- [x] **Demo & Dummy Buttons Purged**: Removed sample files ingestion button from `ActionChips.tsx`; replaced with real candidate ranking and salary estimation actions.
- [x] **Secure Hardware Token Storage**: User JWT access tokens chunked and saved securely via `expo-secure-store`.
- [x] **Graceful Offline Fallback**: Cached active sessions, triage decisions, and analytical snapshots in local storage with automatic re-sync upon reconnection.
- [x] **XSS & Link Protocol Validation**: All external URLs strictly filtered to safe schemes (`https`, `mailto`, `tel`).

---

### Phase 4: Google Play Console Submission Steps

#### Step 1: Generate Release Android App Bundle (AAB)
```bash
cd mobile
eas login
eas build --platform android --profile production
```
*This produces the signed `.aab` file ready for Play Console upload.*

#### Step 2: Play Console App Setup
1. Open **Google Play Console** -> **Create App**.
2. **App Details**:
   - App Name: `RecruitAI`
   - Default Language: `English (United States)`
   - App or Game: `App`
   - Free or Paid: `Free`
   - Declarations: Accept Developer Program Policies and US export laws.

#### Step 3: Policy Declarations & Data Safety
1. **Privacy Policy**: Enter `https://recruitaiofficial.vercel.app/privacy`.
2. **App Access**: Provide test credentials for Play Store review team:
   - Email: `demo.recruiter@recruitai.app`
   - Password: *(your test account password created in Supabase)*
3. **Ads**: Select *"No, my app does not contain ads"*.
4. **Content Rating**:
   - Fill out Questionnaire (Category: Utility / Productivity).
   - Rating awarded: `Everyone` / `PEGI 3`.
5. **Target Audience**: Select `18 and over` (Business / Professional).
6. **Data Safety**:
   - Copy answers directly from `mobile/store/DATA_SAFETY_DECLARATION.md`.
   - Mark Name, Email, and Files as collected for app functionality.
   - Declare Account Deletion URL: `https://recruitaiofficial.vercel.app/data-deletion`.
7. **Financial Features**: Select *"None"*.
8. **Government Apps**: Select *"No"*.

#### Step 4: Store Listing & ASO
1. Paste descriptions from `mobile/store/GOOGLE_PLAY_LISTING.md`:
   - Title: `RecruitAI`
   - Short Description (79 chars): `AI-powered recruiter & ATS: screen resumes, score candidates, and hire faster.`
   - Full Description: Paste complete feature breakdown from listing file.
2. Upload Graphics:
   - **App Icon**: `mobile/assets/icon.png` (1024x1024 -> resized to 512x512)
   - **Feature Graphic**: 1024 x 500 banner
   - **Screenshots**: 4–8 phone screenshots (1080x2400)

#### Step 5: Release Tracks
1. **Internal Testing**:
   - Upload the generated `.aab` file.
   - Add your tester email and verify installation on physical Android device.
2. **Closed Testing (if personal account)**:
   - Run closed testing with 20 testers for 14 days (mandatory Google Play policy for new personal developer accounts).
3. **Production Track**:
   - Roll out to Production. Review takes 24–72 hours.
