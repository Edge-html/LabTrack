# LabTrack — KNCHS SHS Laboratory System

> Track, borrow, and return laboratory equipment — all in one place.

---

## Local Setup

### Prerequisites
- **Node.js** 22+ and npm (required by the Firebase Admin SDK used by the verification API)
- A Firebase project (see below)

### Installation

```bash
git clone https://github.com/Edge-html/LabTrack.git
cd LabTrack
npm install
```

### Environment Variables

Copy `.env.example` to `.env.local` and fill in your Firebase credentials:

```bash
cp .env.example .env.local
```

Required variables:

| Variable | Description |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase Web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Auth domain (e.g. `project.firebaseapp.com`) |
| `VITE_FIREBASE_PROJECT_ID` | Firestore project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Web app ID |
| `VITE_FIREBASE_MEASUREMENT_ID` | Analytics measurement ID (optional) |

### Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build for Production

```bash
npm run build
```

Output is in `dist/`.

---

## Firebase Console Setup

### 1. Authentication

1. Go to **Firebase Console → Authentication → Sign-in method**
2. Enable **Email/Password**
3. In **Authentication → Settings → Authorized domains**, add the hostname where LabTrack is deployed (and `localhost` for local development). Email verification and password-reset links use this domain to return to the app.

### 2. Firestore Database

1. Go to **Firebase Console → Firestore Database**
2. Click **Create database → Production mode**
3. Region: **asia-southeast1 (Singapore)**

### 3. Migrate existing data before deploying the new rules

For an existing LabTrack installation, push this repository to GitHub and confirm the
`FIREBASE_SERVICE_ACCOUNT_JSON` Actions secret is set. In **GitHub → Actions → Migrate LabTrack data**,
choose **Run workflow** and wait for it to succeed. It creates sanitized room-calendar entries and
moves legacy return photos out of request records. The migration is safe to run again.

Do not publish the new Firestore rules until the migration succeeds; students need the calendar
projection for room availability and conflict checks. New installations with no existing bookings
or return photos can deploy directly.

### 4. Deploy Firestore security rules and indexes

Some queries need composite indexes. Deploy the rules and indexes together with the Firebase CLI:

```bash
npm install -g firebase-tools
firebase login
firebase use --add                          # select your project
firebase deploy --only firestore
```

### 5. Authentication email branding and student LRNs

- New student accounts require a unique 12-digit LRN and an email verification link.
- Signing into an unverified student account automatically requests a verification email. Automatic sends are throttled per browser for 10 minutes; the Verify Email page still offers a manual resend.
- Accounts with an administrator role in `users/{uid}` can sign in without email verification; new public registrations remain student accounts and must verify.
- The app includes a custom handler at `/auth/action` for verification, password reset, and email recovery. Firebase currently rejects this project's template action URL update, so new student verification emails use a Vercel Function to generate a Firebase Admin SDK action code, build the LabTrack handler link, and send a branded email through Brevo or another SMTP provider. This avoids Firebase's blocked template setting and does not use Cloud Functions.
- Configure these **server-only** variables in **Vercel → Project → Settings → Environment Variables**. Never use a `VITE_` prefix for secrets.
  - `FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON`: the complete service-account JSON for the same Firebase project. Grant the service account **Firebase Authentication Admin** and **Cloud Datastore User** roles. You can reuse the service account used by the GitHub workflow if you still have its JSON file; otherwise create a new key from Firebase Project Settings → Service accounts.
  - `LABTRACK_APP_URL`: `https://knchs-labtrack.vercel.app`.
  - Recommended: `BREVO_API_KEY` plus `EMAIL_FROM`, set to a sender address verified in Brevo, such as `LabTrack <sender@example.com>`. Brevo API sending uses its API key, so no Gmail App Password or SMTP settings are needed. Transactional sending may require account activation; free addresses may be rewritten to a Brevo sending domain.
  - Alternatively, omit `BREVO_API_KEY` and set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, and `SMTP_PASSWORD` for another SMTP provider. `EMAIL_REPLY_TO` is optional.
- Save the variables for **Production** and redeploy Vercel. Registration, automatic unverified sign-in, and the resend button will then send verification messages through the custom mailer, with a short **Verify your email** link that opens `/auth/action`. A server-side cooldown limits resends. Verification never silently falls back to Firebase: if the custom mailer is unavailable or Brevo rejects a message, LabTrack reports the failure so users do not receive a broken Firebase action link.
- The Vercel mailer needs either a Brevo API key or SMTP credentials plus a sender accepted by that provider. This avoids Firebase Cloud Functions and the Blaze plan; provider sending limits and account requirements still apply.
- Firebase's built-in template can still be branded in **Firebase Console → Authentication → Templates**. The subject can be set to **Verify your email for LabTrack** or **Reset your password for LabTrack**. The custom mailer controls verification email branding independently of those templates. Password reset emails still use Firebase's built-in delivery unless a separate custom reset mailer is configured.
- In **Project settings → General**, set the public-facing project name to **LabTrack** so Firebase’s default template uses the app name instead of the project ID.
- The verification email sent by the custom mailer uses a short clickable label instead of displaying the full action URL. Password reset still uses Firebase's built-in message and template.
- Existing student profiles need their LRN added by an administrator in **Admin Settings → Users & Roles** before they can submit new requests or bookings. The admin editor reserves the LRN uniquely.

### 6. Free scheduled cancellation of expired room bookings

Expired bookings are checked by a GitHub Actions workflow every 15 minutes. It uses the Firebase Admin SDK from GitHub-hosted runners, so it does not require deploying a Cloud Function or upgrading Firebase to Blaze. This repository is public, so its standard GitHub-hosted Actions runs are free. GitHub may delay scheduled runs, and automatically pauses schedules on public repositories after 60 days without repository activity.

One-time setup:

1. In Firebase Console → **Project settings → Service accounts**, generate a private key for the Firebase Admin SDK. Store the downloaded JSON key securely.
2. In the Google Cloud Console for the same project, grant that service account the **Cloud Datastore User** role so it can read and update Firestore bookings.
3. On GitHub, open **Edge-html/LabTrack → Settings → Secrets and variables → Actions → New repository secret**. Name it `FIREBASE_SERVICE_ACCOUNT_JSON` and paste the entire service-account JSON file as its value. Never commit the key to the repository.
4. Open the repository’s **Actions** tab and enable workflows if GitHub asks. Select **Cancel expired lab bookings → Run workflow** to perform the first run manually, then verify the run succeeds. The workflow also runs automatically every 15 minutes.

The key is used only by the scheduled workflow. Keep repository write access limited to trusted maintainers because they can change workflow code that reads repository secrets. Firebase Firestore usage remains subject to the Spark plan’s free quotas.

The app’s production build does not deploy Firestore rules or indexes, or change Authentication email templates. Deploy rules and indexes separately with `firebase deploy --only firestore` after selecting the correct Firebase project.

> **Cloud Storage is NOT used.** This project runs on the Firebase **Spark** (free) plan,
> which does not include Cloud Storage. Return-proof photos are downscaled in the browser and
> stored as base64 data URLs in separate Firestore proof documents (see `src/lib/upload.js`).
> Request lists therefore do not download image payloads, and this keeps the project on the free tier.

### Why photos live in Firestore

| | Firestore (Spark) | Cloud Storage (Blaze only) |
|---|---|---|
| Free tier | 1 GiB, 50k reads/day | Not available |
| Doc/file size cap | 1 MiB per document | 5 GB per file |
| How we use it | Photo compressed to ≤ ~700 KB base64 | — |

Client-side compression runs through six quality passes and stops as soon as the encoded
image fits inside the Firestore document limit, so a typical photo lands around 100–250 KB.

---

## Booking & Return Workflows

### Equipment returns now require photo proof

```
pending ──approve──▶ approved ──release──▶ borrowed
                                                  │
                              student uploads photo│
                                                  ▼
                                          return_submitted
                                                  │
                            ┌─────────────────────┴─────────────────────┐
                     "clean & no damage"                     "damaged" / "not cleaned"
                            │                                          │
                            ▼                                          ▼
                        returned                              return_flagged
                   (stock restored)                 (student alerted: report to the lab)
                                                                │
                                                    student re-uploads photo
                                                                └──────▶ return_submitted
```

- Students upload the photo from **My Requests** or the request detail page.
- Admin reviews each photo in **Borrowing & Returns → Review Return**.
- A flagged return keeps the equipment *out of stock* until it is settled.
- Staff can **Settle & Return** a flagged request once the assessment is resolved.

### Laboratory Room Booking

A completely separate form from equipment borrowing (`/lab-booking`), covering
**Room 103** and **Room 301**.

- Required info: name, date & time of the proposed booking, laboratory room, purpose, and student ID.
- The form checks for slot conflicts against existing pending/approved bookings.
- Students track and cancel their own bookings in **My Lab Bookings**.
- Admin approves/rejects and records when the room was used and handed back.

### Account Warnings

Admins can record a formal warning against a student account (**Account Warnings**),
optionally suspending borrowing and lab-booking privileges for a set number of days.
Warnings appear on the student's dashboard, on their request pages, and can be
resolved or reopened later.

---

## Firestore Data Model

```
users/{uid}
  name, email, role, gradeLevel, section,
  borrowRestrictedUntil, restrictionReason, createdAt

equipment/{id}
  name, category, totalQty, availableQty, condition, description

requests/{id}
  userId, borrowerName, gradeLevel, section, teacher, experiment,
  experimentDate, requestDate, duration, expectedReturnDate,
  actualReturnDate, releaseDate,
  status: pending | approved | rejected | borrowed
        | return_submitted | return_flagged | returned
  staffRemarks, lateRequestFlag,
  createdAt,                                   ← request SENT time
  approvedAt, releasedAt, returnedAt,          ← lifecycle timestamps
  notifSeenAt,                                 ← per-user, on users/{uid} only
  returnProofMeta: { count, size, width, height },
  returnSubmittedAt, returnSubmittedNote, proposedReturnDate, returnAttempt,
  returnReview: { verdict: clean|damaged|not_cleaned, remarks,
                  reviewedBy, reviewedByName, reviewedAt,
                  requiresLabVisit, method },
  items[]: { equipmentId, name, qtyRequested, qtyReleased,
             qtyReturned, qtyDamaged, qtyMissing, conditionOnReturn }

labBookings/{id}
  userId, studentName, studentId, gradeLevel, section,
  labRoom: "Room 103" | "Room 301",
  bookingDate, startTime, endTime, purpose, teacher, participants,
  status: pending | approved | rejected | completed | cancelled,
  staffRemarks,
  submittedAt,                                 ← request SENT time
  approvedAt, approvedBy, checkedInAt, returnedAt,
  cancelledAt, rejectedAt, createdAt, updatedAt

labBookingCalendar/{bookingId}  → { bookingDate, labRoom, startTime, endTime, status }
labBookingMutex/{date_room}     → { bookingId, bookingDate, labRoom, revision }

requestProofs/{requestId}
  userId, contentType, size, width, height, count,
  photos[]: { dataUrl, contentType, size, width, height, name },
  capturedAt, attempt

warnings/{id}
  userId, studentName, gradeLevel, section,
  type: not_returned | damaged_equipment | not_cleaned | lost_equipment
      | late_return | lab_booking | other,
  severity: warning | major | critical,
  message, requestId, labBookingId, sourceType,
  issuedBy, issuedByName, issuedAt,
  resolved, resolvedAt, resolvedBy, resolutionNote

penalties/{id}
  requestId, userId, studentName, violationType, description,
  consequence, dateRecorded, staffRemarks

settings/categories  → { list: string[] }
settings/conditions  → { list: string[] }
settings/penaltyRules → { rules: object[] }
settings/contacts    → { list: [{ id, name, role, email, phone, location }] }
```

### Return-proof photos

A student may attach up to `MAX_PROOF_PHOTOS` (5) photos in one submission. They are stored
in `requestProofs/{requestId}.photos[]` as base64 data URLs — no file storage service
required. Because the photos share one Firestore document, the set shares one
~700 KB base64 budget (`proofPhotoBudget(count)` divides it per photo), so more photos simply
means lower resolution each. Legacy proofs with only a top-level `dataUrl` are read as a single
photo by `proofPhotos()` during migration.

Access is governed by the `requestProofs` rules: only the owning student can write a proof,
and the owning student plus admins can read it.

### Notifications

There is **no `notifications` collection**. Every notification is *derived* from the collections
that already exist, so the data model stays small and notifications work retroactively — a
request approved last term still raises the right notification today.

`src/lib/notifications.js` is pure logic (no React, no Firestore) and holds the whole catalogue:

- `buildStudentNotifications({ requests, bookings, warnings, penalties })`
- `buildAdminNotifications({ pendingRequests, returnProofs, overdueReturns, flaggedReturns, pendingBookings, today })`
- `buildCounts({ isAdmin, data })` — sidebar badges
- `isUnread(notification, seenAt)` — read state

Each notification carries the route it belongs to, so clicking one lands on the exact record
where the page understands a parameter (`/admin/borrowing?id=…&action=return`,
`/admin/lab-bookings?id=…`, `/my-lab-bookings?booking=…`) or on its section otherwise. The old
bell always sent you to one hard-coded page, which is what this replaces.

`src/context/NotificationContext.jsx` owns the subscriptions (single-field equality queries only,
so no new Firestore indexes are required) and feeds both the bell and the sidebar badges, which
means the two can never disagree.

**Read state** is one watermark: `users/{uid}.notifSeenAt`. Anything at or before it has been
seen. Clicking a single notification advances the watermark to that item's timestamp, so it is
marked read without swallowing the newer ones; "Mark all read" advances it to now. Sidebar badges
intentionally stay "how many need attention" rather than "how many unread", so opening the bell
never silently clears an alert from the sidebar.

---

## Creating the First Admin

1. **Sign up** in the app normally (this creates a student account).
2. Go to **Firebase Console → Firestore → users collection**
3. Find the document with your UID (shown in Authentication tab)
4. Edit the `role` field: change `"student"` → `"admin"`
5. Reload the app — you now have admin access.

After that, admins can change other users' roles in **Settings → Users & Roles**.

---

## Vercel Deployment

1. Push to GitHub (main branch)
2. Go to [vercel.com](https://vercel.com) → **Import Project** → select this repo
3. Framework Preset: **Vite**
4. Build command: `npm run build`
5. Output directory: `dist`
6. **Environment Variables**: Add all `VITE_FIREBASE_*` variables (Production, Preview, and Development environments)
7. Deploy

### After Deploying

1. Note your Vercel domain (e.g. `labtrack.vercel.app`)
2. Go to **Firebase Console → Authentication → Settings → Authorized domains**
3. Add your Vercel domain

---

## Loading Starter Data

1. Sign in as an admin
2. Go to **Settings → Seed Data**
3. Click **Load Starter Data**

This seeds:
- 8 equipment items (Beaker, Test Tube, Erlenmeyer Flask, Microscope, Bunsen Burner, Digital Balance, Thermometer, Safety Goggles)
- Default categories, conditions, and penalty rules

---

## Tech Stack

- **React 18** + **Vite 5** — frontend framework and build tool
- **Tailwind CSS v3** — utility-first styling
- **Firebase v10** — Auth + Firestore (Spark / free plan compatible)
- **react-router-dom v6** — client-side routing
- **lucide-react** — icon library
- **papaparse** — CSV parsing for bulk import

---

## Manual Checklist After Deployment

- [ ] Firebase: Enable Email/Password authentication
- [ ] Firebase: Create Firestore database (production mode, asia-southeast1)
- [ ] Firebase: Paste and publish `firestore.rules`
- [ ] Firebase CLI: `firebase deploy --only firestore`
- [ ] GitHub: add the `FIREBASE_SERVICE_ACCOUNT_JSON` Actions secret and run the booking cleanup workflow
- [ ] App: Sign up, then set your `role` to `"admin"` in Firestore
- [ ] Vercel: Import repo, add all `VITE_FIREBASE_*` env vars, deploy
- [ ] Firebase: Add Vercel domain to Authorized Domains
- [ ] App: Sign in as admin → Settings → Seed Data → Load Starter Data
- [ ] App: Sign in as a student → borrow equipment → confirm the **Return** button and photo upload work
