/**
 * v16 (22 Nov, the browser drive): "M.K.B. Nagar" was spoken as four utterances ("at M." / "K." / "B." / "Nagar, which ..."), each one
 * stopped and started again: a dot with a letter right after it, and the last initial of a run, end no sentence.
 */
import { describe, expect, it } from "vitest";
import { chunks } from "./chunker";

describe("v16: initials run together are one name, not three sentences", () => {
  it("M.K.B. Nagar stays in its sentence", () => {
    const c = chunks("Start with the group clash at M.K.B. Nagar, which is past its deadline and held by Greater Chennai Police. Two other severe cases need you.");
    expect(c[0]).toBe("Start with the group clash at M.K.B. Nagar, which is past its deadline and held by Greater Chennai Police.");
    expect(c[1]).toBe("Two other severe cases need you.");
  });
  it("spaced initials and real sentence ends are as before", () => {
    expect(chunks("The busiest spot is K. K. Nagar. Then T. Nagar.")).toEqual(["The busiest spot is K. K. Nagar.", "Then T. Nagar."]);
    expect(chunks("Velachery is in Adyar zone. Its flooding is steady.")).toEqual(["Velachery is in Adyar zone.", "Its flooding is steady."]);
  });
});
