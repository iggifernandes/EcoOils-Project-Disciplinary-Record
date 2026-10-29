# EcoOils Project – Disciplinary Record (v2.7.1)

Site safety warning register for the Mentari Project with SP1 / SP2 / SP3 tracking. Multi-user: EcoOils HSSE (admin) and the IC admins (GSB, WEN, KKS, PBS).

## How it works
• HSSE posts the punched-badge photo + violation in the app (Post photo). The IC admin of that company sees it under "Waiting for you", enters badge number / name / position / level, then HSSE verifies. Open items show per company with age on the Review tab; a daily 08:00 email reminds each IC (counts only)
• Each IC sees only its own company's warnings (status, photo, active SP level), never other companies
• Person key = EcoOils ID badge number. Every warning needs the photo of the punched ID badge
• IC admins sign in with a one-time email code (no passwords); the session lasts 30 days (stored in the Sessions sheet, hashed), so no new code each visit. They see only their own company
• An IC warning is Pending until an EcoOils admin verifies it against the badge posted in the WhatsApp group; only Verified warnings count for the SP ladder
• ICs cannot edit, delete or verify. Admin edits, deletions and verifications are logged (Audit sheet)
• Identity drift flags for the admin: NAME_MISMATCH, SAME_NAME_NEW_BADGE, PHOTO_REUSED, LEVEL_MISMATCH, SP3_ACTIVE.
• EcoOils does not terminate anyone. SP3 = no access to the project site; zero tolerance (especially LSR) = direct no access. The IC decides on employment
• Roles: admin (you, full control), HSSE viewer (Hocine, Agung, Ron: sees everything read-only), IC admin (own company only)
• Admin-only "IC view": pick a company and see exactly what its IC admin sees (preview, nothing is sent)
• Letters, Legal tab, Settings, Users and Audit are admin only
• EN / ID / MS, Jost, EcoOils standard header

## Setup (admin, once)
1. Google Sheet > Extensions > Apps Script > replace the code with `apps-script/Code.gs`, Save
2. Run `setup` once (accept Sheets, Drive, Mail permissions). It registers your Google account as the first admin
3. Deploy > Manage deployments > pencil > New version > Deploy (the /exec URL stays the same)
4. Open the app, sign in with your email, Settings > Users: add the IC admins (email + company)
5. Run `setupReminder` once (daily 08:00 Jakarta email to ICs with waiting items)
6. Old v1 data: Settings > Import Excel (goes to the server as verified legacy), or the yellow button "Upload records saved in this browser". `migrateLegacy` copies the old `Warnings` sheet

## Privacy
No data in this repo. Records live in your Google Sheet, badge photos in a private Drive folder and are served only to signed-in users of the same company (admin: all). The shared KEY of v1 is no longer used.

## Legal note
Information summary, not legal advice. Contractor workers are employed by the contractor (IC), which issues any formal SP / PHK under its own PK / PP / PKB. Verify against official texts (peraturan.go.id / JDIH).


## v2.4.0
- IC admins now have a **Worker history** tab: ladder history (SP level, validity, timeline) for the workers of their own company only. No letters, flags or other companies. Also shown in the admin 'IC view'. Front end only, Code.gs unchanged (v2.3).

## v2.5.0 – who is "the same person"
- Legacy (imported Excel) warnings are linked **by name only** (case, brackets such as "(Mandor)" and one-letter initials ignored; a shorter name inside a longer one counts, e.g. "Wahyu Akbar" = "Wahyu Akbar Panjaitan"). Their old IDs (shared GSB batch codes, typos) are no longer used.
- New entries are linked **by badge ID**, and join a legacy person when the name matches (same company). The IC form also looks up the ladder by name when the badge is new.
- The server gives every record a person key (`pk`); Code.gs v2.5 must be redeployed. Same-name legacy people in different companies are still joined by name (owner decision, for now).

## v2.5.1
- Settings: **Replace old imported data with an Excel file** (removes only records that came from an Excel import, keeps warnings entered in the app, then imports the chosen file). Use it to load a corrected Excel. Code.gs v2.5 (import `replace`).
- Post a warning photo: the company list now offers every company (EcoOils first, plus any company already in the records).

## v2.6.0 – violation dropdown
- The free-text violation box is replaced by a picker (Post a warning photo, IC form, admin form): 33 standard violations in 7 groups, shown in EN / ID / MS and stored in English. Several violations can be added to one warning (stored as `A | B | C`). **Other** needs a reason and a remark (stored as `Other: reason – remark`). Old free-text records are kept as they are.
- The dashboard category chart counts every violation of a warning; categories: safety glasses, gloves, other PPE, work at height, lifting/vehicles/equipment, permit/hot work/tools, smoking, conduct, supervision/reporting, other. Old texts are matched by keywords (misspellings included): "Other" fell from 87 to 4 on the 368 imported rows.
- Front end only; Code.gs unchanged (v2.5).

## v2.6.1
- "New Warning" is no longer a tab: it is a button at the top right of the title row (above the line), shown to admin and IC admins, hidden for the HSSE viewer. Front end only; Code.gs unchanged (v2.5).

## v2.6.2
- Fluid layout: the app now uses the full width of the screen (phone, tablet, laptop, desktop) with side margins that scale with the screen; the worker-history list column scales too. Header date corrected. Front end only; Code.gs unchanged (v2.5).

## v2.7.0 – PIN sign-in
- Sign in with **email + 6-digit PIN**. The emailed code is now only for **"Forgot PIN, or first time?"**: code + a new PIN (typed twice), then signed in. PINs are never typed into the code or the Sheet: stored salted + hashed in the 'Pins' sheet (salt in script property PIN_SALT, created automatically).
- 5 wrong PINs lock that email for 15 minutes (the same lock answer for unknown emails; unknown email, no PIN and wrong PIN give the same message). Sessions still last 30 days, so the PIN is only needed on a new device or after sign-out.
- **First time after this update everybody (including the admin) uses "Forgot PIN, or first time?" once to create a PIN.** Code.gs v2.7 must be redeployed (new action `login`; `verify` now needs `pin`).

## v2.7.1
- Photo fields (punched ID badge / warning photo) now have two buttons: **Take photo with camera** (opens the rear camera directly) and **Choose from gallery**.
- HSSE viewers (Hocine, Agung, Ron) can also use **Post photo** (Code.gs v2.7: `post` allowed for admin and viewer); everything else stays read-only for them.

## Code.gs version line
- Line 1 of Code.gs always states its version (now 2.7.1) and the /exec link shows the same, so you can check which version is deployed. It is bumped on every Code.gs change.
