-- Live traffic kept: TomTom serves only the roads now, so the website reads it every 10 minutes and keeps it (src/lib/city/history.ts).
-- On the AWS store the same tables are created by the website itself (WEBSITE_TABLES in src/lib/aws/store.ts).
CREATE TABLE IF NOT EXISTS traffic_snaps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  at DATETIME NOT NULL,
  spots INT NULL, jams INT NULL, very INT NULL, congested INT NULL, slow INT NULL,
  closed INT NULL, flooded INT NULL, accidents INT NULL, works INT NULL, delay_min INT NULL,
  zones VARCHAR(400) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY traffic_snaps__at (at)
);

CREATE TABLE IF NOT EXISTS traffic_days (
  id INT AUTO_INCREMENT PRIMARY KEY,
  day DATE NOT NULL,
  stretch VARCHAR(200) NOT NULL,
  name VARCHAR(200) NULL, road VARCHAR(120) NULL,
  zone INT NULL, zone_name VARCHAR(60) NULL, ward INT NULL, lat DOUBLE NULL, lon DOUBLE NULL,
  seen INT NOT NULL DEFAULT 0, very INT NOT NULL DEFAULT 0, closed INT NOT NULL DEFAULT 0, flooded INT NOT NULL DEFAULT 0, accidents INT NOT NULL DEFAULT 0,
  max_delay_s INT NULL, sum_delay_s INT NOT NULL DEFAULT 0, max_len_m INT NULL,
  first_at DATETIME NULL, last_at DATETIME NULL, worst VARCHAR(12) NULL,
  UNIQUE KEY traffic_days__one (day, stretch),
  KEY traffic_days__zone (zone, day)
);
