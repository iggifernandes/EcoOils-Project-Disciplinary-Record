# EcoOils Project – Disciplinary Record (v1.1.0)

Site safety warning register for the Mentari Project with SP1 / SP2 / SP3 tracking under Indonesian labour regulation.

• Single file app: `index.html` (EN / ID / MS toggle, version top right above the toggle)
• Minimal Shell-style interface: Jost, Shell palette, dot-grid watermark (EcoOils standard)
• Same fields as the Microsoft Forms "Site Safety Warning Record"
• Automatic SP ladder: validity window (default 6 months), recommended next level, sequence-check flags
• Printable A4 warning letter (ID / EN / bilingual) with legal basis and signature blocks
• Legal Reference tab: UU 13/2003 as amended (Pasal 154A(1)(k)), PP 35/2021 Pasal 36(k), 37-40, 52, UU 1/1970 Pasal 12
• Import the Forms Excel export, export Excel, JSON backup
• Optional free Google Sheets sync (`apps-script/Code.gs`)

## Privacy
The app ships with NO data. Records live in the browser (localStorage) and, if you enable sync, in your own Google Sheet. Worker names are never in this repo.

## Publish on GitHub Pages (free)
1. Create repo `EcoOils-Project-Disciplinary-Record` (public is fine, it holds no data)
2. Upload `index.html`, `README.md`, `apps-script/Code.gs`
3. Settings > Pages > Deploy from branch `main` / root
4. Open the Pages URL > Settings tab > Import Excel

## Google Sheets sync (optional, 5 minutes)
1. New Google Sheet > Extensions > Apps Script > paste `apps-script/Code.gs`
2. Project Settings > Script properties > add `KEY` = a secret word
3. Deploy > New deployment > Web app > Execute as Me > Anyone
4. Paste the `/exec` URL and the secret word in the app's Settings tab, then Push / Pull

## Legal note
Information summary, not legal advice. Contractor workers are employed by the contractor, so a formal SP must be issued by the employer of record under its own PK / PP / PKB. Verify against official texts (peraturan.go.id / JDIH).

## Sync URL and key
The Apps Script web-app URL is pre-filled in Settings. The shared key is NOT stored in the repo: set `KEY` in Script properties and type the same word in Settings on each device. Without a KEY the Sheet endpoint is open to anyone who has the URL.
Push replaces the Sheet with this browser's data (the app asks first if the browser is empty). Pull replaces this browser's data with the Sheet.
