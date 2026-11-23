# Data Studio demo: Chennai links and files

Sources for the Data Studio demo. Each one was checked on 22 Nov 2026 and returned real Chennai rows.
The "In the Studio" column is what our own Data Studio made of it in a test run on a copy of the site.

How to use one:
- **Link**: open Data Studio and paste the link into "Paste a link". It starts at once.
- **File**: drag the file from `docs/studio-demo/data/` onto Data Studio, or click "Drop a file or browse".

When the agents finish, the dataset opens. Press **Add to dashboard** at the top right to get its simple dashboard.

## Best for the demo (in this order)

| # | Add this | How | What the dashboard shows |
|---|---|---|---|
| 1 | `https://raw.githubusercontent.com/PratyushBalaji/chennai-metro-ridership-tracker/main/data/ridership/ChennaiMetro_Station_Ridership.csv` | Paste link | Chennai Metro, 13,426 rows, 24 Jan to 22 Nov 2026 (current). AI headline: "Total volume is climbing fast and last week broke the usual range." Findings: last week above the usual range, Line 04 up 185% in four weeks. Charts: ridership over time and by line. |
| 2 | `data/chennai-flood-inundation-spots-by-ward-cdmp-2024.csv` | Drop file | 1,203 flood spots from the city disaster plan, by zone and ward, all on the map. AI headline: spots cluster in Adyar and Thiru-Vi-Ka-Nagar, and two zones stopped reporting. Linked with the district's flooding incidents. |
| 3 | `https://gistest.saskatchewan.ca/egis/rest/services/Hosted/chennai_relief_centers/FeatureServer/0` | Paste link | 136 relief centres from the 2015 floods, read from an ArcGIS map layer, shown on the map. AI headline: the zones with the most people needing relief also have the most incidents. |
| 4 | `data/chennai-ward-property-tax-2013-2018.csv` | Drop file | Property tax for all 200 wards. AI headline: collection sits in a few zones. Ambattur holds 24% of the Rs 153 crore total. Strong link with district incidents (0.84 across 15 zones). |
| 5 | `data/chennai-air-quality-cpcb-daily-4-stations-2021-2026.csv` | Drop file | CPCB PM2.5 at Manali, Arumbakkam, Perungudi and Kodungaiyur, to 14 Nov 2026. Average PM2.5 by month (peak 65 µg/m³ in Dec 2025) and by station. 11 extreme readings flagged for checking. |
| 6 | `https://raw.githubusercontent.com/khemabushan/chennai-air-quality-intelligence/main/data/processed/daily.csv` | Paste link | Six stations, 2022 to 2024. Average PM2.5 by station: Alandur is highest. The headline says honestly that the data is two years old. |
| 7 | The "Storm-water drain desilting register" sample | Click it under Samples | Synthetic, but the richest dashboard: backlog, the zones falling behind, the map, work types, and a strong link with flooding incidents. |

Tips for the demo:
- After each one opens, show "What we took from the link/file" at the top. Then press **Add to dashboard**, which opens it under **Dashboards**.
- The link and file reads take 15 to 40 seconds each, with the AI on.
- **News links** still go to the news tile on the Overview, as before. **Incidents** are linked automatically: the dataset's "Link with district incidents" card and the Linker agent.

## Sign-in links and feeds (checked 23 Nov 2026)

Data Studio can read links that need a sign-in, and RSS/Atom feeds. Paste the link, or open **Connect with sign-in or schedule** and pick how
the site signs in. The key or password stays in the server's vault; the page only ever shows the sign-in type and the user name.

| Sign-in type | Use it for | Demo link (checked 23 Nov) | What to enter |
|---|---|---|---|
| **API key** | Government and data APIs | `https://api.data.gov.in/resource/3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69?format=json&limit=100&filters[city]=Chennai` (real-time air quality, every CPCB station in Chennai) | Your own free key from data.gov.in (sign up, then "My Account"). Key name `api-key`, put in the **query**. Without a key the site answers "Authorization field missing". |
| **API key** | Weather | `https://api.openweathermap.org/data/2.5/forecast?q=Chennai,IN&units=metric` (5-day forecast, 40 rows of 3 hours) | Your own free key from openweathermap.org. Key name `appid`, put in the **query**. Without a key it answers 401. |
| **User name & password (pop-up)** | A department portal that asks in a browser pop-up (HTTP Basic) | A department MIS you have an account for | Its user name and password. |
| **User name & password** | A portal with its own sign-in page | The portal's link; add the sign-in page if it is different | The Studio's browser types them into the page. |
| **I'll sign in myself** | A site with an OTP, CAPTCHA or single sign-on | Any such site | A browser window opens; you sign in once and the session is kept. |
| **Public (RSS feed)** | News feeds | `https://timesofindia.indiatimes.com/rssfeeds/2950623.cms` (Times of India, Chennai: 20 stories) or `https://news.google.com/rss/search?q=Chennai%20flooding&hl=en-IN&gl=IN&ceid=IN:en` (58 stories) | Nothing. The Studio sees a news feed and offers to **follow it in Latest news** (one click), because news is followed there, not charted. |

Notes:
- After a sign-in link is read, choose **Keep it up to date** to make it a **Live connector**: it is read again on its schedule and its dashboard refreshes.
- The two API-key links were checked to answer (they ask for the key). Their data has not been read through the Studio here, because that needs your own keys.
- Do not use `thehindu.com` feeds in a live demo: they did not answer within 20 seconds on 23 Nov.

## Work, but weaker

- `data/chennai-metro-daily-ridership-2026.csv`: city-wide totals per day. Its charts are fine, but it shows "No insights available" (nothing stands out). Use #1 instead.
- `data/chennai-rainfall-by-station-1993-2023.csv`: 62 gauges, average rainfall by place and year. The data ends in Dec 2023, so the headline is about its age.
- `data/chennai-reservoir-levels-daily-2004-2019.csv`: storage trends for the four lakes, but it ends in 2019.
- `https://en.wikipedia.org/wiki/Metropolitan_Transport_Corporation_(Chennai)`: the Studio offers a list of tables to choose from. Tick **"Table 1 of 9 on the page"** (the depots: fleet and region), not the PDF tables it ranks first.
- `https://cmwssb.tn.gov.in/lake-level`: slow. The page links large PDFs, and the Studio reads those first. Not recommended live.

## Files in `data/`

These are copies of public files. Most come from GitHub repositories, and one of those repositories states no licence.
Keep them for the demo, and do not commit them unless you are happy to redistribute them.

## Do not use

- **data.opencity.in**: Cloudflare blocks automated reads, so its pages, its API and its downloads all fail. Download the file in a normal browser and drop it in instead. The rainfall and property-tax files here are copies of OpenCity data.
- **data.gov.in**: needs a free API key. Add the link through "Connect with sign-in or schedule" and choose API key.
- City disaster plan files `relief_centres.csv`, `officials.csv` and `ward_contacts.csv` contain phone numbers. Keep them out of a demo.
