`silero_vad_v5.onnx`: Silero VAD v5, MIT licence (snakers4/silero-vad), as shipped in the npm package `@ricky0123/vad-web@0.0.24` (ISC).
Jarvis runs it in the browser with onnxruntime-web (MIT, already installed through `@huggingface/transformers`). The runtime's
own files are served by `src/app/thunai-ort/[file]/route.ts`, so 14 MB of WebAssembly stays out of git.
`ears.worklet.js`: Jarvis's AudioWorklet (20 ms frames from the microphone).
`hey_jarvis.onnx` (v6): LiveKit WakeWord's ready-made "hey jarvis" model, v2.1.2, Apache-2.0 for code and weights (its NOTICE, in
`LICENSE-livekit-wakeword.txt` with the licence). `kws.worker.js` runs it on the page's own onnxruntime-web (no npm package installed).
`wake/`: Jarvis's pre-rendered wake replies (scripts/jarvis6/wake-replies.mjs), Gemini's speech model in Jarvis's server voice, made once.
