# EcoOils Project – Disciplinary Record (v2.0.0)

Site safety warning register for the Mentari Project with SP1 / SP2 / SP3 tracking. Multi-user: EcoOils HSSE (admin) and the IC admins (GSB, WEN, KKS, PBS).

## How it works
• Person key = EcoOils ID badge number. Every warning needs the photo of the punched ID badge
• IC admins sign in with a one-time email code (no passwords) and see only their own company
• An IC warning is Pending until an EcoOils admin verifies it against the badge posted in the WhatsApp group; only Verified warnings count for the SP ladder
• ICs cannot edit, delete or verify. Admin edits, deletions and verifications are logged (Audit sheet)
• Identity drift flags for the admin: NAME_MISMATCH, SAME_NAME_NEW_BADGE, PHOTO_REUSED, LEVEL_MISMATCH, SP3_ACTIVE. A known badge locks the name on the IC form
• EcoOils does not terminate anyone. SP3 = no access to the project site; zero tolerance (especially LSR) = direct no access. The IC decides on employment
• Letters, Legal tab, Settings, Users and Audit are admin only
• EN / ID / MS, Jost, EcoOils standard header

## Setup (admin, once)
1. Google Sheet > Extensions > Apps Script > replace the code with `apps-script/Code.gs`, Save
2. Run `setup` once (accept Sheets, Drive, Mail permissions). It registers your Google account as the first admin
3. Deploy > Manage deployments > pencil > New version > Deploy (the /exec URL stays the same)
4. Open the app, sign in with your email, Settings > Users: add the IC admins (email + company)
5. Old v1 data: Settings > Import Excel (goes to the server as verified legacy), or the yellow button "Upload records saved in this browser". `migrateLegacy` copies the old `Warnings` sheet

## Privacy
No data in this repo. Records live in your Google Sheet, badge photos in a private Drive folder and are served only to signed-in users of the same company (admin: all). The shared KEY of v1 is no longer used.

## Legal note
Information summary, not legal advice. Contractor workers are employed by the contractor (IC), which issues any formal SP / PHK under its own PK / PP / PKB. Verify against official texts (peraturan.go.id / JDIH).
