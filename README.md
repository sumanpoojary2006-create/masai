# Lecture Compliance Tracker

Zero-cost full-stack web application for a Curriculum Coordinator to:

- import weekly lecture schedules from CSV or Excel
- create and track Pre-read, Lecture Notes, and Assignment tasks
- verify upload status from `https://experience-admin.masaischool.com` with Playwright
- apply deadline rules automatically
- send Slack alerts for reminders, missed deadlines, and detected uploads

## Stack

- Next.js App Router
- Tailwind CSS
- Supabase PostgreSQL
- Playwright
- GitHub Actions
- Slack Incoming Webhook

## Setup

1. Install dependencies:

```bash
npm install
```

2. Install the Playwright browser:

```bash
npx playwright install chromium
```

3. Copy `.env.example` to `.env.local` and fill in:

```bash
LMS_USERNAME=...
LMS_PASSWORD=...
SLACK_WEBHOOK_URL=...
SUPABASE_URL=...
SUPABASE_KEY=...
APP_TIMEZONE=Asia/Kolkata
```

4. Run the SQL in [supabase/schema.sql](/Users/inno/Desktop/Masai/supabase/schema.sql) inside the Supabase SQL editor.

5. Start the app:

```bash
npm run dev
```

6. Run the compliance job locally:

```bash
npm run compliance
```

## Workflow

- Import a weekly sheet from the dashboard.
- The app stores lectures and creates 3 tasks per lecture.
- The scheduled job logs in to the LMS every 30 minutes, checks resource presence, updates task statuses, and pushes Slack alerts.

## Important implementation note

The LMS scraper is structured to be production-ready and modular, but the exact DOM selectors for `experience-admin.masaischool.com` may need one validation pass against the live UI because this project was generated without direct access to the authenticated LMS DOM.
