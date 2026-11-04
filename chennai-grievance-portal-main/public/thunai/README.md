`silero_vad_v5.onnx`: Silero VAD v5, MIT licence (snakers4/silero-vad), as shipped in the npm package `@ricky0123/vad-web@0.0.24` (ISC).
Jarvis runs it in the browser with onnxruntime-web (MIT, already installed through `@huggingface/transformers`). The runtime's
own files are served by `src/app/thunai-ort/[file]/route.ts`, so 14 MB of WebAssembly stays out of git.
`ears.worklet.js`: Jarvis's AudioWorklet (20 ms frames from the microphone).
