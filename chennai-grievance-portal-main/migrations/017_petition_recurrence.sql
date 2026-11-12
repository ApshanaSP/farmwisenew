-- Manu Desk: how many times the petitioner wrote before about the same problem, found when the petition is approved, so a new build's
-- case keeps "written about N times before" and its priority (QA pass 6, P5-031).
-- On the AWS store the website adds the same column itself on load (DURABLE_ADDED in src/lib/aws/store.ts).
ALTER TABLE petitions ADD COLUMN recurrence INT NOT NULL DEFAULT 0;
