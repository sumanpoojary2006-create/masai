// ============================================================
// LMS Session Tracker — Google Apps Script
//
// HOW IT WORKS:
//   1. Calls your Vercel API (which queries MySQL server-side)
//   2. Gets back all sessions as JSON in one HTTP request
//   3. Writes everything to the sheet in one batch call
//   Total time: ~30 seconds
// ============================================================

var API_URL = 'https://masai-lecture-compliance.vercel.app/api/admin/session-tracker';
var API_KEY = 'YOUR_SECRET_KEY_HERE';  // must match SESSION_TRACKER_API_KEY in Vercel

var SHEET_NAME = 'Session Tracker';

var HEADERS = [
  'Batch Name',                    // A
  'Session Name',                  // B
  'Scheduled Date',                // C
  'Live Lecture Link',             // D
  'Pre-Read Link',                 // E
  'Lecture Notes Link',            // F
  'Assignment Objective Link',     // G
  'Assignment Subjective Link',    // H
  'Students Attended',             // I
  'Avg Rating'                     // J
];

// ============================================================
// MAIN
// ============================================================
function syncAllSessions() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSheet(ss);

  setupHeaders(sheet);

  try {
    var rows = fetchFromAPI();
    Logger.log('Fetched ' + rows.length + ' sessions from API');

    batchWrite(sheet, rows);
    stamp(sheet);

    Logger.log('Sync complete');
  } catch (e) {
    Logger.log('ERROR: ' + e.toString());
    SpreadsheetApp.getUi().alert('Sync failed:\n\n' + e.message);
  }
}

// ============================================================
// FETCH — single HTTP call to the Vercel API
// ============================================================
function fetchFromAPI() {
  var response = UrlFetchApp.fetch(API_URL, {
    method: 'get',
    headers: { 'x-api-key': API_KEY },
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  if (code !== 200) {
    throw new Error('API returned HTTP ' + code + ':\n' + response.getContentText());
  }

  var payload = JSON.parse(response.getContentText());
  if (!payload.sessions) {
    throw new Error('Unexpected API response — missing "sessions" field');
  }

  return payload.sessions;
}

// ============================================================
// WRITE — 2 Sheets API calls regardless of row count
// ============================================================
function batchWrite(sheet, rows) {
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, HEADERS.length).clearContent();
  }

  if (!rows || rows.length === 0) {
    Logger.log('No rows returned from API');
    return;
  }

  sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
  Logger.log('Wrote ' + rows.length + ' rows');
}

// ============================================================
// HELPERS
// ============================================================
function getOrCreateSheet(ss) {
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

// ============================================================
// SHEET SETUP — runs once when sheet is first created
// ============================================================
function setupHeaders(sheet) {
  if (sheet.getLastRow() > 0) return;

  var headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
  headerRange.setValues([HEADERS]);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#1F4E79');
  headerRange.setFontColor('#FFFFFF');
  sheet.setFrozenRows(1);

  // Column widths
  sheet.setColumnWidth(1, 220);   // Batch Name
  sheet.setColumnWidth(2, 360);   // Session Name
  sheet.setColumnWidth(3, 130);   // Scheduled Date
  sheet.setColumnWidth(4, 280);   // Live Lecture Link
  sheet.setColumnWidth(5, 280);   // Pre-Read Link
  sheet.setColumnWidth(6, 280);   // Lecture Notes Link
  sheet.setColumnWidth(7, 280);   // Assignment Objective Link
  sheet.setColumnWidth(8, 280);   // Assignment Subjective Link
  sheet.setColumnWidth(9, 140);   // Students Attended
  sheet.setColumnWidth(10, 100);  // Avg Rating

  // Conditional formatting — link columns D:H only
  // Green = present, Red = missing
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

// ============================================================
// STAMP — writes last-synced time in column L of row 1
// ============================================================
function stamp(sheet) {
  sheet.getRange(1, 12).setValue(
    'Last Synced: ' + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
  );
}

// ============================================================
// TRIGGER — run setupTrigger() once to enable auto-sync
// ============================================================
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'syncAllSessions') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('syncAllSessions')
    .timeBased()
    .everyMinutes(30)
    .create();

  SpreadsheetApp.getUi().alert('Auto-sync is now enabled.\nThe sheet will refresh every 30 minutes.');
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
