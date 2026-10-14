-- A complaint the department closes itself (work that is not severe; the Collector verifies severe work only) was
-- shown to the resident as "Verified by Collector", or not at all. It gets its own status. The tracker now follows
-- the officer's and the Collector's work on the incident the complaint was filed into (src/lib/complaint-progress.ts).
-- Additive: the existing values and rows are unchanged.
ALTER TABLE complaints
  MODIFY COLUMN status ENUM(
    'Complaint Filed',
    'Pending Approval',
    'Approved by Department Officer',
    'In Progress',
    'Completed - Pending Collector Verification',
    'Verified by Collector',
    'Resolved by Department',
    'Rejected'
  ) NOT NULL DEFAULT 'Complaint Filed';
