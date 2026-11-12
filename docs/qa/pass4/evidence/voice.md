# Voice without a person (fake capture device, no sound)

Run 7 Nov 2026, dev console /dev/thunai on a dev server (port 3186, own dist .next-test-3186; /dev/thunai is 404 in the baseline production build, so the .next-qa bundle cannot host these specs). Chromium launched with --mute-audio, --use-fake-ui-for-media-stream, --use-fake-device-for-media-stream. Providers (/hear, agent, say) mocked with page.route; Silero, worklet, turn machine are real. Nothing was played aloud.

Audio: English = Windows SAPI (Microsoft David / Zira, the only voices installed, both en-US) rendered to wav files with no playback (tests/e2e/fixtures). No Tamil voice exists on this machine, so "Tamil" is a tone/silence stand-in: voiced harmonic tone with a 4 Hz syllable envelope (tests/qa/pass4/audio/tamil_standin_tone_pattern.wav). It tests the detector only, not Tamil recognition or Tamil language handling.

Existing specs run (vad, vadfake, bargein, hold, ambientrate, mode; real.spec and e2e-latency not run, they need live providers): 15 passed, 12 failed, 1 skipped (voice-specs.json).
- Passed: vad (Silero loads, one 16 kHz WAV posted, near-silence is not speech), vadfake (fake device sentence reaches transcriber), ambientrate, mic-denied notice, tab-hidden closes mic, energy-gate fallback, level B pin waits for yes, Esc forgets a cancelled question, a sentence with a pause reaches Whisper whole.
- Failed: bargein 3, hold 4 (wait, continue, wait+command, go to sleep), mode 5. Cause not fully isolated. Seven are consistent with a test/source collision: data-testid="state" is used by both Harness.tsx:112 and the HUD (Hud.tsx:162), so getByTestId('state') hits two elements (strict-mode violation seen in hold "wait"). The rest (never reaching the speaking state, switch/.hud not found) are unexplained. I did not run a control without --mute-audio (it would make sound), so mute-audio as a cause is not excluded.

New spec tests/qa/pass4/voice-fakedevice.spec.ts, 4 clips through the fake device (real getUserMedia path), mocked /hear, 9 s each, 4 passed, no unexpected console errors:
| clip | uploads to /hear | agent calls |
| English "Wait." | 1 | 0 |
| English sentence | 1 | 0 |
| tone pattern (Tamil stand-in) | 2 (two bursts) | 0 |
| noise burst | 0 | 0 |
Agent calls are 0 because no clip says the name and nothing is engaged: this matches the address gate staying shut for unaddressed speech. It was not tested that a named request opens it (mode.spec covers that and fails above).

Proves: the capture path, Silero detection of synthetic speech, noise rejection for a white-noise burst, segmentation of two bursts into two uploads, address gate closed on unnamed speech. Does not prove: barge-in latency (bargein spec failed), wait/continue behaviour (hold failed), real room acoustics, echo from Jarvis's own speaker, real microphones, real Whisper accuracy, Tamil. A real room stays unverified.
