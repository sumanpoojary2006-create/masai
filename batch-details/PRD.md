# Product Requirements Document (PRD): Batch Wise

**To the AI Development Agent:** You are tasked with building "Batch Wise," an internal ed-tech web application for Masai (Bengaluru, India). Read this PRD carefully. Your first output must be a clarification of any technical ambiguities listed at the bottom of this document, followed by a proposed tech stack. Do not generate the full codebase until the architecture and database schema are confirmed by the user.

## 1. Product Overview

Batch Wise is a desktop-only web application designed to manage educational program batches, their respective schedules, team members, and grading policies. The core experience relies on a seamless, spreadsheet-like data entry interface and a visual calendar representation of batch schedules.

## 2. Technical & Scope Constraints

- **Platform:** Web application (Desktop ONLY). Do not write CSS/logic for mobile responsiveness.
- **Database:** I'd like to use supabase for the backend database. Design the schema accordingly. I'd also like to use supabase's authentication system for user management. I'd only want to allow my company email addresses to sign up and access the application, so please implement email domain restrictions in the authentication flow. `masaischool.com` should be the only allowed domain for sign-ups/logins.
- **Data strictness:** ALL fields across ALL entities are strictly **optional** (nullable). There are no mandatory fields or validation blockers for saving partial data.
- **Editing UX:** The data editing interface must be a tabular format, mimicking the smooth, inline-cell editing experience of Google Sheets.

## 3. Data Architecture (Proposed Schema)

All database fields must be configured as optional/nullable.

### Table: Batch

| Field Name           | Type        | Description / Allowed Values                                                                                                                                                                                          |
| :------------------- | :---------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                 | UUID/String | Primary Key                                                                                                                                                                                                           |
| `batch_name`         | String      | Unique identifier (e.g., `IITP-AIMLTN-2602`)                                                                                                                                                                          |
| `program_name`       | String      | (e.g., `Certification in Artificial Intelligence and Machine Learning`)                                                                                                                                               |
| `institute_name`     | String      | (e.g., `i-HUB IIT Patna`)                                                                                                                                                                                             |
| `model_number`       | Integer     | 0, 1, 2, or 3                                                                                                                                                                                                         |
| `start_date`         | Date        | Official start date                                                                                                                                                                                                   |
| `end_date_scheduled` | Date        | Calculated end date based on duration                                                                                                                                                                                 |
| `actual_end_date`    | Date        | Real end date (accommodating delays)                                                                                                                                                                                  |
| `status`             | String      | `about-to-start`, `in-order`, `completed/last-leg`                                                                                                                                                                    |
| `domain`             | String      | AI-ML-DS, Analytics, Cloud & DevOps, Cyber Security, Digital Marketing, Entrepreneurship / Leadership, Finance, Gen AI / Applied AI, Maths, Product Management, Project Management, Software Engineering, MBA, Others |
| `language`           | String      | English, Hindi, Telugu, Tamil, Kannada, Marathi, Malayalam, etc.                                                                                                                                                      |
| `website_link`       | String      | URL to the program landing page                                                                                                                                                                                       |
| `team_members`       | JSON        | Object storing Coordinators, Instructors 1-3, and an arbitrary number (1 to n) of Teaching Assistants.                                                                                                                |
| `grading_policy`     | JSON        | Array of objects containing `Component Name` and `Weightage in %`.                                                                                                                                                    |

### Table: Session (Schedule)

| Field Name            | Type          | Description / Allowed Values                                                                                                             |
| :-------------------- | :------------ | :--------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                  | UUID/String   | Primary Key                                                                                                                              |
| `batch_id`            | UUID/String   | Foreign Key referencing Batch                                                                                                            |
| `date`                | Date          | Date of the session                                                                                                                      |
| `day`                 | String        | Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday                                                                           |
| `start_time`          | Time/String   | Session start time                                                                                                                       |
| `end_time`            | Time/String   | Session end time                                                                                                                         |
| `session_title`       | String        | Topic of the session                                                                                                                     |
| `learning_objectives` | Text          | Description of objectives                                                                                                                |
| `to_be_taken_by`      | String        | professor, industry-mentor, teaching-assistant, program-coordinator, curriculum-coordinator, guest-lecturer                              |
| `instructor_name`     | String        | Name of the person taking the session                                                                                                    |
| `rating`              | Float/Integer | Student rating for the session                                                                                                           |
| `zoom_link`           | String        | URL for the meeting                                                                                                                      |
| `is_end_of_schedule`  | Boolean       | If true, marks the definitive end of the batch calendar. If false/null, indicates the schedule requires more sessions to be added later. |

## 4. UI / UX Requirements

### Main Dashboard

- Display a list of all created batches.
- Clicking a batch name navigates the user to the Batch Detail & Calendar View.

### Batch Detail & Calendar View

- **Tabular Editor:** A Google Sheets-like table interface to edit Batch metadata and Session rows. Clicking a cell should allow instant inline editing without page reloads or complex modal forms.
- **Calendar UI:** A visual calendar rendering the sessions based on their `date`, `start_time`, and `end_time`.
- **End of Schedule Indicator:** The calendar UI must clearly visualize the `is_end_of_schedule` flag. If a session is marked true, the calendar should visually indicate that the batch concludes on this date. If no session has this flag, the calendar should indicate an "Incomplete Schedule" state.

## 5. Ambiguity & Clarification Checklist for the AI Agent

**AI Agent:** Before generating the application code, prompt the user with your recommendations for the following architectural decisions:

1.  **Tech Stack:** Propose a specific frontend framework (e.g., Next.js, React + Vite), styling library (e.g., Tailwind CSS), and spreadsheet UI library (e.g., AG Grid, Handsontable, or a custom component).
2.  **Teaching Assistants (1 to n):** Since a batch can have an infinite number of TAs, confirm if storing `team_members` as a JSON blob in the `Batch` table is preferred, or if a separate `TeamMember` relational table should be created.
3.  **Grading Policy:** Confirm if the grading policy should be stored as a JSON array within the `Batch` table or if it requires a separate `GradingComponent` table.
4.  **Date/Time Handling:** Confirm the preferred timezone handling for the local database, considering the users are in Bengaluru, India (IST).

## 6. Few more considerations

1. I'd prefer we use vite + react for frontend and tailwind css and Chakra UI for styling.
2. Spreadsheet UI : check and figure out best thing out there for the same.
3. I'd prefer to store team members as JSON blob in the Batch table itself.
4. I'd prefer to store grading policy as JSON array in the Batch table itself.
5. IST timezone should be used for date/time handling in the local database, as all users are based in India.
6. I'd prefer to have a username and password based authentication system for this application, so that only authorized users can access and edit the batch data. We can have different roles like admin, editor, viewer etc with different levels of access and permissions. Admin can have full access to all features and data, editor can have access to edit batch data but not manage users, viewer can only view batch data without editing permissions. We need to implement role-based access control (RBAC) to enforce these permissions effectively.
7. Are there any good calendar UI libraries. if yes, i'd like to use that for calendar UI.
