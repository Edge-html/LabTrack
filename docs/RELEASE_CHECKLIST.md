# LabTrack release checklist

Run this checklist on a Vercel Preview deployment before promoting a workflow or rules change to production.

## Student flows

- [ ] Register a student, verify the email, sign out, and sign in again.
- [ ] Open Laboratory Inventory, then request equipment for a specific date and time. Confirm the page says the equipment is tentative until approved.
- [ ] Submit a pending equipment request, edit its date, time, quantity, and item, then confirm the original submitted time remains visible and the edit timestamp updates.
- [ ] Try a time window that overlaps an approved equipment reservation. Confirm the available quantity and submit protection respond correctly.
- [ ] Book a laboratory room, then use **Request equipment** from My Laboratory Bookings. Confirm room, date, time, purpose, and teacher prefill, and the two records link to each other.
- [ ] Submit an overlapping room booking. Confirm the conflict explains the occupied slot and prevents submission.
- [ ] Cancel a pending booking and a future approved booking. Confirm the room slot is released. Confirm an approved booking cannot be cancelled after it has started.
- [ ] Check the booking details timeline for request, approval, **Occupied**, and **Done** timestamps.
- [ ] Check the equipment request timeline for Submitted, Approved, Collected, Return photo submitted, and Done, including the next-step guidance.
- [ ] Check due-soon and overdue reminders on My Requests and in the notification bell.
- [ ] Capture and submit a return photo, then verify staff can approve it or flag it and the student can resubmit after a flag.

## Admin flows

- [ ] Approve/reject an equipment request, mark an item borrowed, review a return, and confirm each action appears in Admin Activity.
- [ ] Approve/reject a room booking, mark it occupied/done, and confirm each action appears in Admin Activity.
- [ ] In a preview dataset, let an approved booking pass its end time without check-in. Confirm the scheduled cleanup changes it to cancelled/no-show, releases the room, and records a system activity entry.
- [ ] Export each CSV report with and without date filters. Open the files and check date, item, room, status, and quantity columns.
- [ ] Load more from equipment request, borrowing, room booking, and student history lists.
- [ ] Before deleting one record or a year of history, download the JSON backup and verify it contains the linked records and available return proof. Then test deletion with a disposable record.
- [ ] Confirm only admins can open Reports and Admin Activity.

## Deploy

- [ ] Review the Vercel Preview deployment and confirm no build errors.
- [ ] Deploy Firestore rules for student edits to pending equipment requests, approved-room cancellation, and the admin-only append-only activity log:

  ```powershell
  firebase.cmd deploy --only firestore:rules --project amazing-project-ef9e3
  ```

- [ ] Confirm the GitHub Actions secret `FIREBASE_SERVICE_ACCOUNT_JSON` is available so scheduled no-show cleanup can run.
- [ ] Confirm the scheduled cleanup workflow has a recent successful run in GitHub Actions.
- [ ] Promote/deploy the verified build to production, then repeat one equipment request, one room booking, one admin review, and one report export.

History backups and CSV exports include student data. Store and share the downloaded files only with authorized laboratory staff.
