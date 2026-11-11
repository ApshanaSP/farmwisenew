# Manu Desk (மனு)

Paper petitions given at the Collector's office become normal complaints. One officer scans each petition, checks what the AI read, and approves it.

## Who uses what

| Who | Where | What they do |
|---|---|---|
| Petition officer | `petition@chennai.gov.in`, password `Petition@2026`, opens only the desk | Scans, checks, approves or deletes |
| Department officer | Their usual console | Works it like any other complaint; the source says Manu |
| Collector | Their usual console | Sees it like any other complaint; the source says Manu |
| Anyone with the complaint number | `/track` | Enters the number and the last 4 digits of the mobile, and sees the status only |

Citizens file online from their own login as before. They cannot upload a Manu.

## How a petition moves

1. Upload a photo or scanned PDF. Tick "pages of one petition" for a multi-page one.
2. It is read in two steps, about a minute for one page (`src/lib/manu/read.ts`). PaddleOCR reads it first on this computer, then the AI OCR (Claude) reads the same photo and fills the form.
3. The petition officer checks it beside the photo. Doubtful fields are highlighted, and where PaddleOCR read a mobile number, pincode or date differently from the AI OCR, the field says what PaddleOCR read. The mobile number should always be compared with the paper.
4. **Approve and send** creates the complaint and its case, and shows its complaint number.
5. The complaint appears at once in the department's console and the Collector's console, marked **Manu**. The desk returns to its home screen with the complaint number, ready for the next upload.

While a petition is read, the desk shows each real step from the server: received, PaddleOCR (with the page number on a multi-page petition), AI OCR, then the comparison.

An unwanted upload can be deleted with the × in the list, **Delete petition**, or **Delete image**. On a multi-page upload, **Delete this page** removes one page and reads the rest again. Deleting removes the photo for good. An approved petition cannot be deleted from the desk, because it is already a complaint with the department.

## The two readers

| What happens | Result |
|---|---|
| Both work | The AI OCR fills the form. PaddleOCR only adds doubts, on numbers it read differently. |
| PaddleOCR is off | The AI OCR reads alone, as before. The check screen says the numbers had no second check. |
| The AI OCR cannot be reached | PaddleOCR's text and numbers fill the form, every field is marked, and the officer fills in the rest or uses **Read again**. |
| Neither can read it | The petition stays on the desk for typing in by hand. |

Install once: run `manu_paddle_ocr\setup.bat`, about 1 GB. After that `start-fast.bat`, `host-server.bat` and `npm run dev` open PaddleOCR in its own small window. Test copies of the site (`AWS_STORE_DRY_RUN=1`) do not. It uses about 1.4 GB of memory while open, listens only on this computer, and keeps nothing it reads. To read with the AI OCR alone, set `MANU_PADDLE_URL=off`.

The AI OCR is always given the photo and never PaddleOCR's text, so PaddleOCR's mistakes cannot lead it astray. PaddleOCR is not used as the main reader because on the sample petitions it matched only 88% of handwritten Tamil text, against 99.8% for the AI OCR.

## SMS to the person who wrote the Manu

One message when a petition is approved, and one when the work on it ends. Each goes once, and a failed send is tried again every 15 minutes, up to four tries. Test copies of the site (`AWS_STORE_DRY_RUN=1`) never send.

**Test mode (the default, `SMS_MODE=sandbox`).** It works like the email test mode. The exact message goes to the team inbox (`EMAIL_SANDBOX_TO`), with the petitioner's number named in it, and no phone receives anything. It needs only the email settings you already have. The desk says "Test SMS sent to the team inbox".

**Real SMS (`SMS_MODE=live`).** It needs the steps below. Until they are all done, leave it on test mode.

1. Register on a DLT portal (Jio, Airtel, Vi or BSNL) as the sending organisation, and register a 6-letter sender name.
2. Register the four messages below on DLT as service messages. Copy them exactly.
3. Open an MSG91 account, add the sender name, and add each approved message as a template. Name its variables `var1` and `var2`, in that order.
4. Put the key, the sender name and the four template IDs in `.env` (see "MANU DESK" in `.env.example`), set `SMS_MODE=live`, and restart the site.
5. To test, set `SMS_TEST_NUMBER` to your own mobile. Every SMS then goes to you. Remove it to go live.

| Setting | Message to register |
|---|---|
| `MSG91_TEMPLATE_RECEIVED_EN` | Your petition to the Chennai Collector's Office is registered. Number {#var#}. Sent to {#var#}. |
| `MSG91_TEMPLATE_RECEIVED_TA` | சென்னை மாவட்ட ஆட்சியர் அலுவலகத்தில் உங்கள் மனு பதிவு செய்யப்பட்டது. எண் {#var#}. அனுப்பப்பட்ட துறை {#var#}. |
| `MSG91_TEMPLATE_CLOSED_EN` | Your petition number {#var#} at the Chennai Collector's Office: {#var#}. |
| `MSG91_TEMPLATE_CLOSED_TA` | சென்னை மாவட்ட ஆட்சியர் அலுவலகத்தில் உங்கள் மனு எண் {#var#}: {#var#}. |

The first variable is the complaint number. The second is the department in the first message, and the result in the second ("the work is completed" or "it could not be taken up"). Once the site is hosted, the tracking address can be added to the wording in DLT and MSG91, with no code change.

The petition's language picks the message: English for English, Tamil for Tamil or mixed.

## How it is built

- `src/lib/manu/`: `login.ts` (the fixed login), `read.ts` (the two reading steps and the AI OCR), `paddle.ts` (PaddleOCR, the comparison and the backup), `clean.ts` (checks and Aadhaar masking), `petitions.ts` (store and approval), `cases.ts` (turns an approved petition into a case), `repeat.ts` (came before), `track.ts` (public tracking), `sms.ts` (the two SMS).
- `src/components/manu/`: the desk and the original-paper block on the case screens.
- A Manu is an ordinary complaint: `source` is `grievance`, and `channel` is `manu`. That channel is the only difference, and it is what shows as "Manu" on the screens.
- `petitions` table: added by the website on the AWS store (`WEBSITE_TABLES` in `src/lib/aws/store.ts`), and by `migrations/015_petitions.sql` on MySQL.
- Cases are added when approved and again on each new build (`websiteCases`), because the pipeline never sees what the website saves on AWS. The same step brings citizens' online complaints to the departments.
- Settings are listed under "MANU DESK" in `.env.example`.

## Limits to know

- `reading-test/results.csv` was scored on simulated, font-based samples, so it is a best case. Real handwriting has not been tested yet: add pen-written samples to `samples/` and run the test again.
- Petition photos are stored on this server's disk, not in AWS, like complaint photos.
- PaddleOCR's check was measured on the same simulated samples, at the size the site stores them. It flagged 4 of the AI OCR's 8 phone-number and date mistakes, with 4 false alarms in 78 correct numbers. It takes about 25 seconds a page on this computer. Real handwriting may do worse.
