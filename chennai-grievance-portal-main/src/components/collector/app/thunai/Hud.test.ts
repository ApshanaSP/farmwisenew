import React, { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import Hud from "./Hud";
import { coreOf, hud } from "./hudstore";
import { setConsoleMap, toViewport } from "./mapbridge";

// this vitest config compiles .tsx with the classic JSX runtime
(globalThis as { React?: unknown }).React = React;
const render = (stageOpen: boolean) => renderToStaticMarkup(createElement(Hud, { lang: "en", coreRef: createRef<HTMLSpanElement>() as never, stageOpen, onSend: () => undefined, onStop: () => undefined, onDismissFirstUse: () => undefined }));
const fakeMap = (ownWidth: number, shownWidth: number) => ({
  latLngToContainerPoint: () => ({ x: 300, y: 100 }),
  getContainer: () => ({ isConnected: true, offsetWidth: ownWidth, getBoundingClientRect: () => ({ left: 10, top: 20, right: 10 + shownWidth, bottom: 20 + shownWidth, width: shownWidth }) }) as unknown as HTMLElement
});

afterEach(() => { setConsoleMap(null); hud.set({ mode: "off", turn: "off", core: "off", firstUse: false, focus: null }); });

describe("the HUD's microphone word", () => {
  it("says the mic is closed above the first-use notice, with no dot", () => {
    hud.set({ mode: "on", turn: "off", core: coreOf("on", "off", false, false), firstUse: true });
    const html = render(false);
    expect(html).not.toContain("Listening");
    expect(html).toContain("Mic closed");
  });
  it("shows the dot whenever the microphone is open, even under a stale notice", () => {
    hud.set({ mode: "on", turn: "listening", core: "listening", firstUse: true });
    expect(render(false)).toContain('class="hud-mic"><i');
  });
});

describe("the map's reticle", () => {
  const focus = { label: "Adyar", lat: 13, lon: 80, zone: null };
  it("does not float over an open screen", () => {
    setConsoleMap(fakeMap(500, 500));
    hud.set({ mode: "on", focus });
    expect(render(false)).toContain("hud-reticle");
    expect(render(true)).not.toContain("hud-reticle");
  });
  it("lands on the place at a console zoom other than 1", () => {
    setConsoleMap(fakeMap(500, 650));
    hud.set({ mode: "on", focus });
    expect(render(false)).toContain("translate(400px, 150px)");
  });
  it("is off the map when the point is", () => {
    expect(toViewport({ left: 0, top: 0, right: 100, bottom: 100, width: 100 }, { x: 150, y: 10 }, 100)).toBeNull();
  });
});
