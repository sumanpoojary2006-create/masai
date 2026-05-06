// ============================================================
// LMS Session Tracker — Google Apps Script
//
// HOW IT WORKS:
//   1. Calls your Vercel API (which queries MySQL server-side)
//   2. Gets back all sessions as JSON in one HTTP request
//   3. Writes everything to the sheet in one batch call
//   Total time: ~30 seconds
//
// SETUP (do this before running):
//   1. Replace API_URL with your actual Vercel app URL
//   2. Replace API_KEY with the value you set in Vercel env as SESSION_TRACKER_API_KEY
// ============================================================

var API_URL  = 'https://masai-lecture-compliance.vercel.app/api/admin/session-tracker';
var API_KEY  = 'YOUR_SECRET_KEY_HERE';

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
    method          : 'get',
    headers         : { 'x-api-key': API_KEY },
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
// WRITE — 2 Sheets API calls regardless of row count:
//   1. clearContent on old data
//   2. setValues for all new rows
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
// SHEET SETUP — runs once when sheet is first created
// ============================================================
function setupHeaders(sheet) {
  if (sheet.getLastRow() > 0) return;

  // Header row styling
  var headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
  headerRange.setValues([HEADERS]);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#1F4E79');
  headerRange.setFontColor('#FFFFFF');
  sheet.setFrozenRows(1);

  // Column widths
  sheet.setColumnWidth(1, 220);  // Batch Name
  sheet.setColumnWidth(2, 360);  // Session Name
  sheet.setColumnWidth(3, 130);  // Scheduled Date
  sheet.setColumnWidth(4, 280);  // Live Lecture Link
  sheet.setColumnWidth(5, 280);  // Pre-Read Link
  sheet.setColumnWidth(6, 280);  // Lecture Notes Link
  sheet.setColumnWidth(7, 280);  // Assignment Objective Link
  sheet.setColumnWidth(8, 280);  // Assignment Subjective Link

  // Conditional formatting on link columns D:H
  // Green  = link is present
  // Red    = link is missing
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
// STAMP — writes last-synced time in column J of row 1
// ============================================================
function stamp(sheet) {
  sheet.getRange(1, 10).setValue(
    'Last Synced: ' + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
  );
}

// ============================================================
// TRIGGER — run setupTrigger() once to enable auto-sync
// ============================================================
function setupTrigger() {
  // Remove any existing trigger for this function first
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
// MENU — appears in the spreadsheet toolbar on open
// ============================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('LMS Tracker')
    .addItem('🔄 Sync Now', 'syncAllSessions')
    .addSeparator()
    .addItem('⏱ Enable Auto-Sync (every 30 min)', 'setupTrigger')
    .addToUi();
}
