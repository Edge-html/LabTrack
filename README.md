# LabTrack — KNCHS SHS Laboratory System

> Track, borrow, and return laboratory equipment — all in one place.

---

## Local Setup

### Prerequisites
- **Node.js** 18+ and npm
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

### 2. Firestore Database

1. Go to **Firebase Console → Firestore Database**
2. Click **Create database → Production mode**
3. Region: **asia-southeast1 (Singapore)**

### 3. Firestore Security Rules

1. In Firestore → **Rules tab**
2. Paste the contents of `firestore.rules`
3. Click **Publish**

### 4. Cloud Storage (needed for return-proof photos)

1. Go to **Firebase Console → Storage**
2. Click **Get started** (same region as Firestore)
3. Paste the contents of `storage.rules` into the Rules tab and **Publish**

Without Storage enabled, students can still borrow equipment but the return-photo upload will fail.

### 5. Firestore Indexes (CLI)

Some queries need composite indexes. Deploy them all at once with the Firebase CLI:

```bash
npm install -g firebase-tools
firebase login
firebase use --add          # select your project
firebase deploy --only firestore:rules,firestore:indexes,storage
```

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
  returnProof: { url, path, fileName, contentType, size, uploadedAt, attempt },
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
settings/contact     → { name, email, phone, location }
```

### Firebase Storage

```
returnProofs/{uid}/{requestId}/{timestamp}-{filename}
```

Ownership-scoped: the owning student uploads, the student and any admin can read.

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
- **Firebase v10** — Auth + Firestore + Storage (Spark / free plan compatible)
- **react-router-dom v6** — client-side routing
- **lucide-react** — icon library
- **papaparse** — CSV parsing for bulk import

---

## Manual Checklist After Deployment

- [ ] Firebase: Enable Email/Password authentication
- [ ] Firebase: Create Firestore database (production mode, asia-southeast1)
- [ ] Firebase: Paste and publish `firestore.rules`
- [ ] Firebase: **Enable Cloud Storage** and publish `storage.rules` (required for return photos)
- [ ] Firebase CLI: `firebase deploy --only firestore:rules,firestore:indexes,storage`
- [ ] App: Sign up, then set your `role` to `"admin"` in Firestore
- [ ] Vercel: Import repo, add all `VITE_FIREBASE_*` env vars, deploy
- [ ] Firebase: Add Vercel domain to Authorized Domains
- [ ] App: Sign in as admin → Settings → Seed Data → Load Starter Data
- [ ] App: Sign in as a student → borrow equipment → confirm the **Return** button and photo upload work