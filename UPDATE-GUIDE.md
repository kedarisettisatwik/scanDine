# Updating to staff-approved tables

This update removes the table password and phone number. Guests enter only a table number and request staff approval. Each table has one approved dining session. A completed or reset session cannot send more orders or services; guests must request approval again.

## Install the update

1. Preserve your existing `.env` and `.git` folder.
2. Extract the updated project files over your React project. No restaurant, menu, or account data is deleted.
3. Run `npm install`.
4. Publish this ZIP's **new `firestore.rules`** in Firebase Console → Firestore Database → Rules. The previous rules do not enforce staff approval, so this is required.
5. Run `npm run deploy` (or your existing hosting deployment command).
6. Refresh the admin and visitor pages.

## Admin workflow

Open **Tables**. Add the table numbers used by your restaurant. Existing legacy occupied tables are listed too; complete or reset those old sessions before accepting new guests, then register their table numbers with Add table.

**Guests waiting for approval** shows the requested table. Confirm the guest is physically dining there, then click **Approve**. A remote or mistaken request can be declined. Pending requests leave the table empty; approval fills it. Approving a second request for an occupied table is blocked even if two admin windows act at once.

Filled tables show the session start time and order number (or “No order placed yet”). **Reset table** completes any active order, clears the visible open service requests for that session, revokes its approval, and empties the table. Normal order completion performs the same session release. Resetting a table never approves a waiting guest automatically.

## Guest workflow

Scan the existing QR, enter the table number, and click **Request table approval**. The menu remains browsable, but placing orders and sending service requests stay disabled until staff approval arrives. Approval updates the guest page automatically. Reloading the same browser session resumes an active approved table without a second request.

If another guest is already using that table, the page shows **“Someone else is using this table”** and creates an admin notification with a link to Tables. Repeated conflict alerts from the same device are limited to one per minute by Firestore rules. Join-request resubmissions are also limited to one per minute. Existing toast and sound alerts apply to new approval requests and conflicts.

## Scope

Only a table number is collected. No phone number, OTP, or table password is used. Hidden anonymous authentication binds each approved session to a browser identity; one approved browser session controls the party's order. Another phone must ask staff to reset/approve if the party changes devices. Staff must confirm physical presence before approving: the QR link remains public, but public visitors cannot reserve a table or write orders directly under the new rules.

The session ID changes on each new request. Firestore rules check that the sender still owns the currently approved session on every order and service write, including when an old browser bypasses the interface.

Tests and deployment details are in README.md. Live Firebase settings and hosted application files have not been changed automatically.
## Verification of this update

- Production TypeScript/Vite build passed.
- 14 isolated session lifecycle tests passed.
- 19 Firestore rules checks passed against the local `demo-scandine` emulator, including unapproved writes, staff activation, cross-guest isolation, conflict cooldown, orders, and post-completion access denial.
- No live restaurant records, authentication settings, or deployed rules were changed during verification.
