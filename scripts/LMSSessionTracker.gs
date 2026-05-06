// ============================================================
// LMS Session Tracker
// Calls the Next.js API endpoint → batch-writes to sheet
// Fast: one HTTP request, one sheet write. No JDBC.
// ============================================================

// ⚠️ Set these two values before running
var API_URL = 'https://your-vercel-app.vercel.app/api/admin/session-tracker';
var API_KEY = 'your-api-key-here';  // Must match SESSION_TRACKER_API_KEY in Vercel env

var SHEET_NAME = 'Session Tracker';

var HEADERS = [
  'Batch Name',
  'Session Name',
  'Scheduled Date',
  'Live Lecture Link',
  'Pre-Read Link',
  'Lecture Notes Link',
  'Assignment Objective Link',
  'Assignment Subjective Link'
];

// ============================================================
// MAIN — called by trigger or "Sync Now" menu item
// ============================================================
function syncAllSessions() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSheet(ss);
  setupHeaders(sheet);

  try {
    // 1. Fetch all sessions from the API (fast — runs on Vercel near the DB)
    var rows = fetchFromAPI();
    Logger.log('Fetched ' + rows.length + ' sessions from API');

    // 2. Clear old data and write all rows in one batch call
    batchWrite(sheet, rows);

    // 3. Stamp the sync time
    stamp(sheet);

    Logger.log('Sync complete.');

  } catch (e) {
    Logger.log('ERROR: ' + e.toString());
    SpreadsheetApp.getUi().alert('Sync failed:\n' + e.message);
  }
}

// ============================================================
// FETCH FROM API
// ============================================================
function fetchFromAPI() {
  var response = UrlFetchApp.fetch(API_URL, {
    method: 'get',
    headers: { 'x-api-key': API_KEY },
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  if (code !== 200) {
    throw new Error('API returned ' + code + ': ' + response.getContentText());
  }

  var data = JSON.parse(response.getContentText());
  return data.sessions; // array of [batchName, sessionName, date, liveUrl, preUrl, notesUrl, objUrl, subjUrl]
}

// ============================================================
// BATCH WRITE — clear + write all rows in 2 API calls total
// ============================================================
function batchWrite(sheet, rows) {
  var lastRow = sheet.getLastRow();

  // Clear existing data rows (keep header)
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, HEADERS.length).clearContent();
  }

  if (!rows || rows.length === 0) {
    Logger.log('No rows to write.');
    return;
  }

  // Write everything in one single call
  sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
  Logger.log('Wrote ' + rows.length + ' rows.');
}

// ============================================================
// HELPERS
// ============================================================
function getOrCreateSheet(ss) {
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

function setupHeaders(sheet) {
  if (sheet.getLastRow() > 0) return; // already set up

  var r = sheet.getRange(1, 1, 1, HEADERS.length);
  r.setValues([HEADERS]);
  r.setFontWeight('bold');
  r.setBackground('#1F4E79');
  r.setFontColor('#FFFFFF');
  sheet.setFrozenRows(1);

  // Column widths
  sheet.setColumnWidth(1, 200);  // Batch Name
  sheet.setColumnWidth(2, 350);  // Session Name
  sheet.setColumnWidth(3, 120);  // Date
  for (var c = 4; c <= 8; c++) sheet.setColumnWidth(c, 280); // Link columns

  // Conditional formatting on D2:H5000
  // Green = link present, Red = missing
  var linkRange = sheet.getRange('D2:H5000');
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextDoesNotContain('')
      .setBackground('#C6EFCE')
      .setFontColor('#276221')
      .setRanges([linkRange])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('')
      .setBackground('#FFC7CE')
      .setFontColor('#9C0006')
      .setRanges([linkRange])
      .build()
  ]);
}

function stamp(sheet) {
  sheet.getRange(1, 10).setValue(
    'Last Synced: ' + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
  );
}

// ============================================================
// TRIGGER SETUP — run once to enable auto-sync every 30 min
// ============================================================
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'syncAllSessions') ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('syncAllSessions')
    .timeBased()
    .everyMinutes(30)
    .create();

  SpreadsheetApp.getUi().alert('Auto-sync enabled — runs every 30 minutes.');
}

// ============================================================
// MENU
// ============================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('LMS Tracker')
    .addItem('Sync Now', 'syncAllSessions')
    .addSeparator()
    .addItem('Enable Auto-Sync (every 30 min)', 'setupTrigger')
    .addToUi();
}
