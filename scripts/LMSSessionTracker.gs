// ============================================================
// LMS Session Tracker — Google Apps Script
//
// Uses JDBC with JSON_ARRAYAGG: each query returns ONE row
// containing all data as a JSON string. Apps Script reads
// 7 rows total instead of thousands — fast, no timeout.
// ============================================================

var DB_HOST = 'msi-experience-rdonly.crfg8xlnzwpc.ap-south-1.rds.amazonaws.com';
var DB_PORT = 3306;
var DB_NAME = 'prod_course';
var DB_USER = 'metabase';
var DB_PASS = 'j1P&<`!`nH}O86"';

var LECTURE_URL    = 'https://experience-admin.masaischool.com/lectures/detail/?id=';
var ASSIGNMENT_URL = 'https://experience-admin.masaischool.com/assignment/detail/?id=';
var SHEET_NAME     = 'Session Tracker';

var HEADERS = [
  'Batch Name',
  'Session Name',
  'Scheduled Date',
  'Live Lecture Link',
  'Pre-Read Link',
  'Lecture Notes Link',
  'Assignment Objective Link',
  'Assignment Subjective Link',
  'Students Attended',
  'Avg Rating'
];

// ============================================================
// MAIN
// ============================================================
function syncAllSessions() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSheet(ss);
  setupHeaders(sheet);

  var conn;
  try {
    conn = Jdbc.getConnection(
      'jdbc:mysql://' + DB_HOST + ':' + DB_PORT + '/' + DB_NAME,
      DB_USER,
      DB_PASS
    );

    var rows = buildRows(conn);
    Logger.log('Built ' + rows.length + ' rows');

    batchWrite(sheet, rows);
    stamp(sheet);
    Logger.log('Sync complete');

  } catch (e) {
    Logger.log('ERROR: ' + e.toString());
    SpreadsheetApp.getUi().alert('Sync failed:\n\n' + e.message);
  } finally {
    try { if (conn) conn.close(); } catch (ignore) {}
  }
}

// ============================================================
// JSON QUERY HELPER
// Each SQL must return exactly ONE row with ONE column (JSON string).
// This means Apps Script reads only 1 row per query — no per-row
// network overhead regardless of how much data is in the JSON.
// ============================================================
function jsonQuery(conn, sql) {
  var stmt = conn.createStatement();
  var rs   = stmt.executeQuery(sql);
  rs.next();
  var raw = rs.getString(1);
  rs.close();
  stmt.close();
  return JSON.parse(raw || '[]');
}

// ============================================================
// BUILD ALL ROWS
// ============================================================
function buildRows(conn) {

  // 1. All Academic Session lectures across all active batches
  var lectures = jsonQuery(conn,
    'SELECT JSON_ARRAYAGG(JSON_OBJECT(' +
    '  "id",    live.id,' +
    '  "batch", b.name,' +
    '  "title", live.title,' +
    '  "date",  DATE_FORMAT(live.schedule, "%Y-%m-%d")' +
    ')) ' +
    'FROM lectures live ' +
    'JOIN batches b ON live.batch_id = b.id ' +
    'WHERE live.category   = "Academic Session" ' +
    '  AND live.deleted_at IS NULL ' +
    '  AND b.deleted_at    IS NULL ' +
    '  AND b.active        = 1'
  );

  // 2. Pre-reads — keyed by associatedLecture.id (plain object)
  var prereads = jsonQuery(conn,
    'SELECT JSON_ARRAYAGG(JSON_OBJECT(' +
    '  "id",  id,' +
    '  "lid", JSON_UNQUOTE(JSON_EXTRACT(data, "$.associatedLecture.id"))' +
    ')) ' +
    'FROM lectures ' +
    'WHERE category   = "pre-reads" ' +
    '  AND deleted_at IS NULL ' +
    '  AND JSON_EXTRACT(data, "$.associatedLecture.id") IS NOT NULL'
  );

  // 3. Lecture notes — same pattern as pre-reads
  var notes = jsonQuery(conn,
    'SELECT JSON_ARRAYAGG(JSON_OBJECT(' +
    '  "id",  id,' +
    '  "lid", JSON_UNQUOTE(JSON_EXTRACT(data, "$.associatedLecture.id"))' +
    ')) ' +
    'FROM lectures ' +
    'WHERE category   = "notes" ' +
    '  AND deleted_at IS NULL ' +
    '  AND JSON_EXTRACT(data, "$.associatedLecture.id") IS NOT NULL'
  );

  // 4. Objective assignments — associatedLecture is array [{ id, title }]
  var objAssignments = jsonQuery(conn,
    'SELECT JSON_ARRAYAGG(JSON_OBJECT(' +
    '  "id",  id,' +
    '  "lid", JSON_UNQUOTE(JSON_EXTRACT(data, "$.associatedLecture[0].id"))' +
    ')) ' +
    'FROM assignments ' +
    'WHERE (category = "objective" OR (category = "practice-assignment" AND title LIKE "%Objective%")) ' +
    '  AND deleted_at IS NULL ' +
    '  AND JSON_EXTRACT(data, "$.associatedLecture[0].id") IS NOT NULL'
  );

  // 5. Subjective assignments
  var subjAssignments = jsonQuery(conn,
    'SELECT JSON_ARRAYAGG(JSON_OBJECT(' +
    '  "id",  id,' +
    '  "lid", JSON_UNQUOTE(JSON_EXTRACT(data, "$.associatedLecture[0].id"))' +
    ')) ' +
    'FROM assignments ' +
    'WHERE (category = "subjective" OR (category = "practice-assignment" AND title LIKE "%Subjective%")) ' +
    '  AND deleted_at IS NULL ' +
    '  AND JSON_EXTRACT(data, "$.associatedLecture[0].id") IS NOT NULL'
  );

  // 6. Attendance — restricted to Academic Session lectures only (avoids full table scan)
  var attendance = jsonQuery(conn,
    'SELECT JSON_ARRAYAGG(JSON_OBJECT("lid", lecture_id, "cnt", cnt)) ' +
    'FROM (' +
    '  SELECT a.lecture_id, COUNT(DISTINCT a.user_id) AS cnt ' +
    '  FROM attendances a ' +
    '  INNER JOIN lectures l ON l.id = a.lecture_id ' +
    '  WHERE a.status = 1 ' +
    '    AND l.category = "Academic Session" ' +
    '    AND l.deleted_at IS NULL ' +
    '  GROUP BY a.lecture_id' +
    ') t'
  );

  // 7. Average rating per lecture
  var ratings = jsonQuery(conn,
    'SELECT JSON_ARRAYAGG(JSON_OBJECT("lid", lecture_id, "avg", avg_r)) ' +
    'FROM (' +
    '  SELECT lecture_id, ROUND(AVG(rating), 2) AS avg_r ' +
    '  FROM lecture_feedback ' +
    '  GROUP BY lecture_id' +
    ') t'
  );

  // Build lookup maps: lecture_id (string) -> value
  var preMap    = {};
  var notesMap  = {};
  var objMap    = {};
  var subjMap   = {};
  var attendMap = {};
  var ratingMap = {};

  prereads.forEach(function(r)       { preMap[String(r.lid)]    = r.id;  });
  notes.forEach(function(r)          { notesMap[String(r.lid)]  = r.id;  });
  objAssignments.forEach(function(r) { objMap[String(r.lid)]    = r.id;  });
  subjAssignments.forEach(function(r){ subjMap[String(r.lid)]   = r.id;  });
  attendance.forEach(function(r)     { attendMap[String(r.lid)] = r.cnt; });
  ratings.forEach(function(r)        { ratingMap[String(r.lid)] = r.avg; });

  // Sort lectures by batch name then date
  lectures.sort(function(a, b) {
    if (a.batch < b.batch) return -1;
    if (a.batch > b.batch) return 1;
    if (a.date  < b.date)  return -1;
    if (a.date  > b.date)  return 1;
    return 0;
  });

  // Assemble final rows
  return lectures.map(function(l) {
    var lid = String(l.id);
    return [
      l.batch || '',
      l.title || '',
      l.date  || '',
      LECTURE_URL + l.id,
      preMap[lid]    ? LECTURE_URL    + preMap[lid]    : '',
      notesMap[lid]  ? LECTURE_URL    + notesMap[lid]  : '',
      objMap[lid]    ? ASSIGNMENT_URL + objMap[lid]    : '',
      subjMap[lid]   ? ASSIGNMENT_URL + subjMap[lid]   : '',
      attendMap[lid] || 0,
      ratingMap[lid] || ''
    ];
  });
}

// ============================================================
// WRITE — clear + write all in 2 API calls
// ============================================================
function batchWrite(sheet, rows) {
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, HEADERS.length).clearContent();
  }

  if (!rows || rows.length === 0) {
    Logger.log('No rows to write');
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

function setupHeaders(sheet) {
  if (sheet.getLastRow() > 0) return;

  var r = sheet.getRange(1, 1, 1, HEADERS.length);
  r.setValues([HEADERS]);
  r.setFontWeight('bold');
  r.setBackground('#1F4E79');
  r.setFontColor('#FFFFFF');
  sheet.setFrozenRows(1);

  sheet.setColumnWidth(1,  220);
  sheet.setColumnWidth(2,  360);
  sheet.setColumnWidth(3,  130);
  sheet.setColumnWidth(4,  280);
  sheet.setColumnWidth(5,  280);
  sheet.setColumnWidth(6,  280);
  sheet.setColumnWidth(7,  280);
  sheet.setColumnWidth(8,  280);
  sheet.setColumnWidth(9,  140);
  sheet.setColumnWidth(10, 100);

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
  sheet.getRange(1, 12).setValue(
    'Last Synced: ' + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
  );
}

// ============================================================
// TRIGGER — run once to enable auto-sync every 30 min
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
