// QA pass 6: valid bodies for the access matrix (QA_ACCESS_BODIES=tests/qa/pass6/matrix-bodies.mjs), so a deny cell shows the guard's own
// 401 or 403 and not a 400 from the schema. A function gets the identity's name. Session-ending routes (sign-out, password change) never
// get a valid body here. Passwords are read from the gitignored test-account file and never printed.
import { accounts } from "../seed-local-users.mjs";

const pw = (id) => accounts().find((a) => a.key === String(id).split("@")[0])?.password ?? "x";
export default {
  "POST /api/complaints": () => ({ firstName: "Qa", lastName: "Matrix", gender: "Male", streetAddress: "1 Test Street", mobileNumber: "9876543210", zoneId: 1, wardNumber: 1,
    manualStreetName: "Test Street", complaintSubtypeId: 1, title: `QA6 matrix ${Date.now()}`, description: "Garbage not cleared for three days near the corner shop." }),
  "POST /api/auth/confirm": (id) => ({ password: pw(id) })
};
// Not made valid (listed in the report): the GET file routes (complaints/media/[name], manu/photos/[name], officer/photos/[dir]/[name],
// rehearsal/photo/[dir]/[name]) need a real stored file name, and /api/collector/assistant/tools answers 404 to every caller on a test
// server (the route is off); /api/auth/security needs a reference from a real e-mail.
