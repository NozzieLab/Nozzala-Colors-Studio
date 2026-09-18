# Microphone music lights

The browser requests audio-only microphone access after Start microphone is clicked. The audio graph is `MediaStreamAudioSourceNode -> AnalyserNode`, with no speaker destination, recorder, upload, or persistent audio storage. Both frequency and current waveform samples stay in memory until the session stops. Stopping, switching easter eggs, leaving the page, losing microphone input, or disconnecting a previously connected keyboard releases the tracks and closes the AudioContext. A late permission grant after cancellation is immediately released and cannot restart the lights.

## Sources

- [MDN AnalyserNode](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode): frequency/time-domain data and operation without a connected output.
- [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia): secure contexts and permission handling.
- [MDN MediaStreamTrack.stop](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/stop): explicit track release.
- [MDN voice-change-o-matic](https://github.com/mdn/webaudio-examples/blob/733def1c41939a7bb2ec4dc1be3603e3ae70af51/voice-change-o-matic/scripts/app.js), pinned at `733def1c41939a7bb2ec4dc1be3603e3ae70af51`, reviewed for microphone acquisition, analyser buffers and requestAnimationFrame visualisation. The example is CC0; its source and licence are archived in the engineering repository. Our independent implementation uses analysis only, with no monitored speaker output or voice effects.

## Behaviour

Spectrum mode splits audio into six bands: 60–160, 160–400, 400–1000, 1000–2500, 2500–6000 and 6000–16000 Hz, clipped to the input sample rate. SW1 through SW6 follow this order. An RMS noise gate suppresses near-silence; fast attack and slower release smooth brightness. Pulse mode uses an amplitude envelope and rising-energy accents; it is a visual response, not a tempo/BPM measurement. Sensitivity changes gain and brightness caps output.

The keyboard uses existing temporary per-slot lighting commands, the calibrated colour palette and firmware brightness limits. Frames are limited to 10 submissions/second, only changed slots are sent, and transport completion limits the actual rate. Brightness has 20 steps. Stop is ordered after any in-flight lighting update. No firmware upgrade or saved-setting changes are required. Offline microphone preview works without a keyboard.

Requires microphone support on HTTPS or localhost. The browser or OS may apply input processing despite requested constraints. Physical latency, colour and ambient-noise behaviour depend on the microphone and keyboard; browser simulation does not certify those properties.
