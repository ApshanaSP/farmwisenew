# manu-sec: access matrix for the Manu Desk and public tracking

The handlers were called directly. Sessions were real signed tokens in a mocked cookie jar, and the store was an isolated SQLite one. Source: `chennai-grievance-portal-main/tests/qa/pass5/probes/manu-sec/manu-sec.test.ts` (access matrix test). Actors:

- **anon**: no cookie.
- **citizen**: a citizen session.
- **officerA**: a CMWSSB officer, the department the filed petition went to.
- **officerB**: a GCC-ELE officer.
- **manu**: `petition@chennai.gov.in`, a department_officer with dept_code COL-PET.
- **collector**: a Collector session.

Fixtures: one petition filed to CMWSSB, and one unfiled petition (needs_check).

## Measured (status + data scope)

| actor | GET /api/manu/petitions | POST /api/manu/petitions | GET /api/manu/petitions/[id] | POST /api/manu/petitions/[id] (repeats) | GET /api/manu/case/[incident] | GET /api/manu/photos/[name] (filed, CMWSSB) | GET photo (unfiled) | POST /api/track (QR key) |
|---|---|---|---|---|---|---|---|---|
| anon | 401 | 401 | 401 | 401 | 401 | 403 | 403 | 200 status only |
| citizen | 401 | 401 | 401 | 401 | 401 | 403 | 403 | 200 status only |
| officerA | 401 | 401 | 401 | 401 | 200, own dept's petitions (1) | 200 | 403 | 200 status only |
| officerB | 401 | 401 | 401 | 401 | 200, filtered to own dept (0) | 403 | 403 | 200 status only |
| manu | 200, whole desk (names, problems) | 200, new id | 200, full reading (name, mobile, address, Aadhaar last 4) | 200, matches incl. online complaints | 200, all | 200 | 200 | 200 status only |
| collector | 401 | 401 | 401 | 401 | 200, all | 200 | 200 | 200 status only |

The other POST actions on `/api/manu/petitions/[id]` (read, delete, delete_page, file) use the same `manuStaff()` guard, so only manu gets past it and everyone else gets 401. `/api/manu/case/[incident]` returns `200 {items:[]}` to anyone, anonymous included, when the id fails `^[A-Za-z0-9_-]{1,64}$`. Auth is only checked after that.

## What else each login reaches

| route family | guard | manu (COL-PET) |
|---|---|---|
| `/officer` page | `officerDeptCode === PETITION_DEPT` | ManuCounter only |
| `/api/officer/*` | `officerSession`, which needs `deptProfile(code)` | 403 (COL-PET is not in ref_departments) |
| `/api/collector/assistant/*` (Jarvis chat, export, feedback, insights, pins, sessions, status), `/api/map/{ask,export,insight,layers,suggest}`, `/api/rehearsal/traffic/*` | `assistantSession`: any department_officer with a non-null dept | **allowed**, lockDept=COL-PET (manu-sec-02) |
| `/api/rehearsal/route` | collector or any department_officer | **allowed** |
| `/api/jarvis/{hear,say}`, `/api/collector/*` (other), `/api/map/send`, rehearsal plan/state/... | `collectorSession` | 401 |
| `/api/profile/*` (change-password etc.) | any session | allowed. A password change is undone by the next sign-in attempt from anyone (manu-sec-01) |

## How the desk signs in

`POST /api/auth/login` calls `ensurePetitionLogin(email)` before it looks up the user or checks the password. For `petition@chennai.gov.in` it creates the account if it is missing, and puts back the fixed password hash (committed at login.ts:11) and dept_code COL-PET whenever the stored hash differs. Since 77ae11a (P5-005) it no longer re-activates a deactivated account. The login has no second factor, sessions last 12 h (staff), and the limits are 8 tries per email and 20 per IP per 15 min (200 shared without TRUST_PROXY_HOPS).

## Attacks tried that held

- **Path traversal on photos.** 15 names, all 404, and neither the store nor the disk was read: `../../.env`, `..%2f`, `%2e%2e%2f`, double-encoded, `..\\`, `C:\\…`, `/etc/passwd`, a NUL suffix, `%.jpg`, 32×`_`, 32×`%`, a trailing `_` wildcard, upper case, a trailing `%`, `x/<name>`. `PHOTO_NAME = /^[a-f0-9]{32}\.(jpg|png)$/` is checked before `pages LIKE ?`, so neither `%` nor `_` can reach the LIKE.
- **IDOR on petition ids.** Ids are sequential, but only the desk login gets past `manuStaff()`. There is one desk role, so there is no cross-tenant IDOR.
- **Case and photo scope.** A department officer sees only petitions whose `dept_code` is their own and whose status is `filed`.
- **Tracking enumeration.** A wrong code and a wrong mobile get the same 404 and the same body, and there is no extra query on either path. The QR key is HMAC(JWT secret) cut to 20 base64url characters (120 bits), and production refuses a weak secret. Guessing the last 4 digits is capped at 12 tries per code per 10 min (about 1,700 a day).
- **File types.** The type comes from the magic bytes, not the name. A JPEG-headed HTML polyglot is stored as `.jpg` and served as `image/jpeg` with `nosniff`, and GIF or other types are refused. Uploads are named with 128 random bits and stored outside `public/`.
- **CSRF.** The middleware refuses POSTs that are cross-origin, `Sec-Fetch-Site: cross-site`, from a sibling subdomain, or with `Origin: null`. The cookies are SameSite=Lax and httpOnly.
- **X-Forwarded-For.** It is ignored unless TRUST_PROXY_HOPS is set. With it set, the n-th entry from the right is used.
- **What tracking returns.** Code, status, filing time, department label, due date and steps. It returns no name, phone, address or officer identity, apart from the free text staff typed into notes (manu-sec-03).
- **Logs.** `console.*` in lib/manu prints ids, codes and error messages. It prints personal data only through a whole error object carrying `err.sql` (manu-sec-08).
