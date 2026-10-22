/**
 * Disciplinary Record — Google Sheets backend (optional)
 * Deploy: Extensions > Apps Script > paste this > Deploy > New deployment > Web app
 *   Execute as: Me   |   Who has access: Anyone
 * Then set Project Settings > Script properties > KEY = <any secret word>
 * Paste the /exec URL and the same secret word into the app's Settings tab.
 */
const SHEET_NAME = 'Warnings';
const HEADERS = ['id','date','company','name','empId','position','level','violation','givenBy','ack'];

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) { sh = ss.insertSheet(SHEET_NAME); sh.appendRow(HEADERS); sh.setFrozenRows(1); }
  return sh;
}
function authOk_(key) {
  const k = PropertiesService.getScriptProperties().getProperty('KEY');
  return !k || k === key;
}
function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function doGet(e) {
  e = e || {};
  const key = e.parameter && e.parameter.key;   // undefined when run from the editor
  if (!authOk_(key)) return out_({ ok: false, error: 'auth' });
  const v = sheet_().getDataRange().getValues();
  const recs = v.slice(1).filter(r => r[0] !== '').map(r => {
    const o = {};
    HEADERS.forEach((h, i) => {
      let x = r[i];
      if (h === 'date' && x instanceof Date) x = Utilities.formatDate(x, 'Asia/Jakarta', 'yyyy-MM-dd');
      o[h] = String(x === null ? '' : x);
    });
    return o;
  });
  return out_({ ok: true, records: recs });
}
function doPost(e) {
  if (!e || !e.postData) return out_({ ok: false, error: 'no body' });
  const b = JSON.parse(e.postData.contents);
  if (!authOk_(b.key)) return out_({ ok: false, error: 'auth' });
  if (b.action !== 'replace' || !Array.isArray(b.records)) return out_({ ok: false, error: 'bad request' });
  const sh = sheet_();
  sh.clearContents();
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  if (b.records.length) {
    // store text so dates and IDs like "kks /204" are not auto-converted
    const rows = b.records.map(r => HEADERS.map(h => String(r[h] === undefined ? '' : r[h])));
    sh.getRange(2, 1, rows.length, HEADERS.length).setNumberFormat('@').setValues(rows);
  }
  return out_({ ok: true, count: b.records.length });
}
