import { describe, expect, it } from "vitest";
import { allNoticeTexts, isBackground, noticeFor, NOTICE_TA } from "./messages";

describe("what the site says it is doing", () => {
  it("says it is signing out, and holds until the next page arrives", () =>
    expect(noticeFor("POST", "/api/auth/logout")).toMatchObject({ doing: "Signing you out securely", hold: true, full: true }));

  it("words each Manu Desk action by what is being done", () => {
    const n = (action: string) => noticeFor("POST", "/api/manu/petitions/12", JSON.stringify({ action }));
    expect(n("file")?.doing).toBe("Approving the petition and forwarding it to the department");
    expect(n("file")?.done).toBe("The petition has been approved and forwarded.");
    expect(n("delete")?.doing).toBe("Deleting the petition");
    expect(n("read")?.doing).toBe("Sending the petition to be read again");
  });

  it("keeps quiet about the check that follows the officer's typing", () => expect(noticeFor("POST", "/api/manu/petitions/12", JSON.stringify({ action: "repeats" }))).toBeNull());

  it.each([
    ["GET", "/api/collector/overview", "Updating the dashboard"],
    ["GET", "/api/collector/incidents/INC-1", "Retrieving the incident record"],
    ["GET", "/api/collector/incidents/INC-1/analysis", "Preparing the analysis of this incident"],
    ["POST", "/api/collector/incidents/INC-1/action", "Recording the action and informing the department"],
    ["POST", "/api/collector/decisions", "Recording your decision"],
    ["POST", "/api/collector/workspaces", "Saving the workspace"],
    ["DELETE", "/api/collector/workspaces", "Removing the workspace"],
    ["DELETE", "/api/collector/sources/4", "Removing the data source"],
    ["PATCH", "/api/collector/sources/4", "Updating the data sources"],
    ["POST", "/api/officer/grievances/GRV-9", "Recording your update"],
    ["POST", "/api/officer/grievances/GRV-9/report", "Submitting the completion report"],
    ["POST", "/api/complaints", "Submitting your complaint"],
    ["POST", "/api/map/send", "Forwarding the work to the departments"],
    ["PUT", "/api/profile", "Updating your profile"]
  ])("%s %s", (m, p, doing) => expect(noticeFor(m, p)?.doing).toBe(doing));

  it("says something sensible about a route nobody has worded yet", () => {
    expect(noticeFor("GET", "/api/collector/brand-new")?.doing).toBe("Retrieving the requested information");
    expect(noticeFor("POST", "/api/collector/brand-new")).toMatchObject({ doing: "Processing your request", done: "Your request has been completed." });
  });

  it("claims nothing has been done when something was only read", () => {
    expect(noticeFor("GET", "/api/collector/overview")?.done).toBeUndefined();
    expect(noticeFor("POST", "/api/track")?.done).toBeUndefined();
  });
});

describe("several requests behind one click", () => {
  it("names the dashboard as the main thing", () => expect(noticeFor("GET", "/api/collector/overview")?.primary).toBe(true));
  it("does not let side panels hold the notice up", () => {
    expect(noticeFor("GET", "/api/collector/brief")?.secondary).toBe(true);
    expect(noticeFor("GET", "/api/collector/stories")?.secondary).toBe(true);
  });
});

describe("the requests the site makes by itself", () => {
  it.each([
    ["GET", "/api/manu/petitions"], ["GET", "/api/manu/photos/ab12.jpg"], ["POST", "/api/i18n"], ["POST", "/api/auth/tab"], ["GET", "/api/auth/me"], ["POST", "/api/jarvis/hear"],
    ["GET", "/api/collector/alerts"], ["GET", "/api/collector/conflicts"], ["GET", "/api/collector/nearby"], ["GET", "/api/rehearsal/state"], ["GET", "/api/collector/search"], ["POST", "/api/collector/thunai/plan"], ["GET", "/api/locations/wards"], ["GET", "/api/map/suggest"]
  ])("%s %s is never announced", (m, p) => { expect(isBackground(m, p)).toBe(true); expect(noticeFor(m, p)).toBeNull(); });

  it("still announces uploading a petition", () => expect(noticeFor("POST", "/api/manu/petitions")?.doing).toBe("Uploading the petition securely"));
  it("still announces uploading a complaint's photo, though its pictures load quietly", () => {
    expect(noticeFor("POST", "/api/complaints/media")?.doing).toBe("Uploading the attachment");
    expect(noticeFor("GET", "/api/complaints/media/a.jpg")).toBeNull();
  });
});

describe("Tamil", () => {
  it("has every notice", () => expect(allNoticeTexts().filter((t) => !NOTICE_TA[t])).toEqual([]));
  it("is complete for the generic ones", () => {
    for (const t of ["Please wait.", "Retrieving the requested information", "Processing your request", "Your request has been completed."]) expect(NOTICE_TA[t]).toBeTruthy();
  });
});
