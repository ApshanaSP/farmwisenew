-- Manu Desk: the SMS sent to the person who wrote a petition, one row a message.
-- On the AWS store the same table is created by the website itself (WEBSITE_TABLES in src/lib/aws/store.ts).
CREATE TABLE IF NOT EXISTS petition_sms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  complaint_code VARCHAR(20) NOT NULL,
  kind VARCHAR(10) NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'waiting',
  result VARCHAR(10) NULL,
  detail VARCHAR(200) NULL,
  attempts INT NOT NULL DEFAULT 0,
  tried_at DATETIME NULL,
  sent_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY petition_sms__one (complaint_code, kind)
);
