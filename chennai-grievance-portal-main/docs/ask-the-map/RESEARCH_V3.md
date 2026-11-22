# Ask the Map v3: research notes (22 Nov 2026)

The owner asked for more real data, answers that are easy to see (not "tiny dots"), a calmer chat, map animation, a clearer
day-by-day view, and more human-style and follow-up testing. v2 (main, 5dd50b30) is kept as it is; v3 is on the branch
`claude/askmap-v3-e4d529` so the two can be compared.

## Where the map's data comes from today

| Data | Source | Real or test |
|---|---|---|
| Complaints and incidents | the portal's `incidents` table | mostly generated test history (`npm run dataset:generate`), 36 real news reports |
| Ward and zone outlines | DataMeet Municipal_Spatial_Data (community, not GCC-official) | real boundaries |
| Area and street names | GCC complaint site (erp.chennaicorporation.gov.in) | real |
| Facilities (schools, hospitals, shops...) | OpenStreetMap, 27 Oct to 20 Nov 2026 | real, as complete as OSM is |
| Police, PWD assets, gauges, air stations | the district-intel reference tables | real labels |
| Satellite and street tiles | Esri ArcGIS (Leaflet only draws them) | real |

## Sources checked for v3

| Source | What it gives | Licence | Used in v3? |
|---|---|---|---|
| **Kontur Population** (HDX, India, release 2023-11-01), 400 m H3 hexagons | people per hexagon, so people per ward and per zone | CC BY 4.0 | **Yes**: `scripts/build-population.py` shares each hexagon between the wards it overlaps (shapely), 6.57 million people in the 200 wards; "cases per 10,000 people" rankings |
| **Open-Meteo forecast API** | hourly rain forecast at any point, no key | CC BY 4.0 | **Yes**: "will it rain tomorrow": mm over each zone in the next 24 hours beside its open flooding and drain cases |
| Open-Meteo air quality (CAMS) | hourly PM2.5 forecast | CC BY 4.0 (attribute CAMS) | Not yet: the console already reads CPCB stations (live_air) |
| OpenCity: Chennai flood hazard zones, inundation points with depth (GCC), 2015 inundation extent, GCC flood hotspots 2020 | where Chennai floods, with depth | Public domain | **Blocked**: the site's bot check refuses automated downloads (we do not get around it). Download by hand into `data/sources/opencity/` and v3 can draw "flood-prone" wards |
| OpenCity: Chennai UDISE+ 2024-25 | the official school list with enrolment | as listed | **Blocked**, same reason. With it, "which school has the most complaints near it" could also say how many children study there |
| OpenCity: ward-wise public toilets 2019, parks 2019, Census 2011 (155 old wards) | ward amenities | various | Not used: older ward scheme (155) or older than OSM |
| VIIRS night lights (NASA Black Marble, EOG) | how lit each street is at night | open, needs an account | Not used: needs a login; would test streetlight complaints against real darkness |
| Google / Microsoft building footprints | building density | open | Not used: heavy, little gain for complaint questions |

## Ideas taken from products that do this well

- **Kepler.gl (Uber), Foursquare Studio**: colour areas by a value (choropleth) instead of drawing every point; a time
  slider with a histogram above it. v3: ranked answers shade wards and zones; the day-by-day player shows a strip of
  days on the map itself.
- **Felt AI, Esri ArcGIS assistants**: the chat panel beside the map, the answer first, the steps behind it one click
  away. v3: the answer, the top five and what to ask next come first; filters, tables, every case and "how this was
  worked out" are folded under "More detail".
- **Perplexity / ChatGPT answers**: a short answer with the key figure first, follow-up suggestions under it. Kept
  from v2, now with "there" and "the second one" understood.
- **Rates, not raw counts** (standard epidemiology practice): a ward with more people has more complaints. v3 ranks
  "per 10,000 people". A rate on one or two cases is not reliable, so areas with at least 3 cases (or 1 in 200 of the
  answer's cases) are ranked first by their plain rate and the rest follow. (An empirical-Bayes "steadied" rate was
  tried first; it ranked well but the numbers shown did not run in order, which confused the reader.)

## Sources

- Kontur Population, India: https://data.humdata.org/dataset/kontur-population-india
- Open-Meteo forecast: https://open-meteo.com/en/docs ; air quality: https://open-meteo.com/en/docs/air-quality-api
- OpenCity Chennai flooding data: https://data.opencity.in/dataset/chennai-flooding-data
- OpenCity Chennai 2015 floods: https://data.opencity.in/dataset/chennai-floods-2015-data
- OpenCity Chennai UDISE+ 2024-25: https://data.opencity.in/dataset/chennai-udise-2024-25
- OpenCity ward-wise public toilets: https://data.opencity.in/dataset/chennai-civic-amenities/resource/ward-wise-number-of-public-toilets---2019
- Felt AI assistant: https://help.felt.com/felt-ai/ai-assistant
- Esri, AI assistants in ArcGIS: https://www.esri.com/about/newsroom/arcnews/ai-assistants-in-arcgis-provide-practical-help-and-give-useful-results
