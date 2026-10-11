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
  status: pending | approved | rejected | borrowed | returned
  staffRemarks, lateRequestFlag,
  items[]: { equipmentId, name, qtyRequested, qtyReleased,
             qtyReturned, qtyDamaged, qtyMissing, conditionOnReturn }

penalties/{id}
  requestId, userId, studentName, violationType, description,
  consequence, dateRecorded, staffRemarks

settings/categories  → { list: string[] }
settings/conditions  → { list: string[] }
settings/penaltyRules → { rules: object[] }
settings/contact     → { name, email, phone, location }
```

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
- [ ] App: Sign up, then set your `role` to `"admin"` in Firestore
- [ ] Vercel: Import repo, add all `VITE_FIREBASE_*` env vars, deploy
- [ ] Firebase: Add Vercel domain to Authorized Domains
- [ ] App: Sign in as admin → Settings → Seed Data → Load Starter Data