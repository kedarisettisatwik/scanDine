# ScanDine

React + TypeScript + Vite restaurant menu and table-service application. Uses HashRouter, react-hot-toast, Firebase Email/Password Authentication, anonymous guest authentication, and Cloud Firestore. No Firebase Storage, Cloud Messaging, or Cloud Functions are used.

## Start

```powershell
npm install
npm run dev
```

Open the URL printed by Vite. The supplied `.env` contains your Firebase web configuration and is excluded from Git. `.env.example` documents the required variables. Vite embeds web configuration into the browser bundle; `.env` is configuration management, not a way to hide browser API keys. Access control comes from Firebase Authentication and Firestore rules.

## Firebase setup required

1. Open the `scandine-a49fb` Firebase project.
2. Under Authentication → Sign-in method, enable **Email/Password** and **Anonymous**.
3. Under Authentication → Settings → Authorized domains, add `localhost` for development and your hosting domain (for GitHub Pages, `kedarisettisatwik.github.io`).
4. Create the default Firestore database if it does not exist.
5. Paste `firestore.rules` into Firestore → Rules and publish them. Alternatively, with the Firebase CLI signed into your account, run `firebase deploy --only firestore:rules` in this directory.
6. Create your owner account in the app, then set up Profile and Menu. Restaurant ID equals the owner's Firebase UID. One restaurant per owner is supported.

These console settings and rules have not been applied to your cloud project automatically. No owner accounts or production test orders were created during development.

## Owner workflow

- Sign up, log in, reset password, and protected admin pages.
- Profile: restaurant name, logo URL, banner URLs, category create/rename/delete, enabled services and custom services.
- Add menu items with name, description, veg/non-veg, price, multiple categories, up to three image URLs, and availability.
- Download or print the restaurant QR, optionally prefilled with a table number.
- Orders: today/all-time summaries, filters, detailed items, later additions, activity, pending services, and manual table completion.
- Notifications page: latest first, unread badge, individual or bulk mark-read. New notification documents trigger toasts; initial history does not trigger alerts.
- Tap **Enable sound** once after opening the dashboard. Your supplied `notificaitionSound.wav` was copied to `public/notification.wav`. New orders, add-ons, and service requests play it automatically after sound is enabled. Browser autoplay rules prevent guaranteed playback before interaction. Alerts require an open dashboard; browsers may suspend background tabs. Closed-browser push notifications are outside this project.

## Guest workflow

Visit `#/r/RESTAURANT_ID` or `#/r/RESTAURANT_ID?table=5`. Hidden anonymous authentication keeps orders private. A separate session-based visitor auth instance allows an owner to preview the menu without logging out of the dashboard. Use one browser tab/session for a dining party; another device cannot take over an active table order.

Enter a table, filter/search dishes, review the cart, place an order, then add more items. Up to eight distinct dishes can be submitted at once; repeat submissions add more. Each quantity is capped at 99, and an order is capped at 200 lines. Staff closes the table manually after payment. Currency is INR, with no tax or payment integration. Guests cannot cancel submitted items.

Services can be requested before ordering. A table/service lock prevents duplicate open requests across devices. Staff can resolve these in the Requests waiting section even if no order exists. Guest buttons reset when staff marks a request done.

## Images

Use publicly accessible HTTPS image URLs for logos, banners, and menu images. Banner order can be moved upward and images can be removed before saving. No uploads, binary image data, or Storage SDK are included. Hosts may prohibit hotlinking; use image URLs you control. Banners rotate every five seconds and support touch swipes; manual navigation pauses rotation briefly. Menu image galleries support swiping and arrows.

## Security and data

Public restaurant/menu/category reads; owner-only administrative writes. Guests query only their own orders and requests. Notification history is owner-only. Atomic table locks enforce one active order per table. Rules validate new line prices/names/types against the menu, quantities, additive totals, immutable historical lines, timestamps, and enabled services. Notification creation must accompany the corresponding order/request update. Minimal table/service lock records are readable to signed-in clients so transactions can detect occupancy; order contents are private.

The rules are supplied for deployment and should be validated with Firebase Emulator Suite before production. Anonymous authentication and duplicate-request locks are not comprehensive abuse protection: the public menu is reachable outside the restaurant. Add App Check or a trusted backend for stronger abuse controls if needed.

## Build, tests, and deployment

```powershell
npm run test
npm run build
```

The order lifecycle tests use an isolated transaction mock, covering initial orders, add-ons, another-device refusal, reuse of a completed table, and submission limits. They do not replace emulator tests of the supplied rules or live Firebase integration tests.

Vite writes `dist`, which fixes the previous deployment-folder mismatch. HashRouter and relative asset paths support GitHub Pages subdirectories.

For your existing GitHub repository, copy this project into a clean checkout/branch, preserving its `.git` directory and replacing the old Next.js application files. Do not merge the old Next.js package.json with this one. The existing Desktop project was left unchanged.

```powershell
npm run deploy
```

This publishes `dist` to the checkout's `gh-pages` branch. Set GitHub Settings → Pages → Deploy from a branch → `gh-pages` → `/ (root)`. The current generated project is not connected to a Git remote; configure a checkout before running deployment.

Alternatively, after building, run `firebase deploy --only hosting` with the Firebase CLI. `firebase.json` and `.firebaserc` are included. No site has been published automatically.
