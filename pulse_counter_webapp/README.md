# Chest Pulse Counter Webapp

A minimal browser prototype that estimates pulse from mobile gyroscope/motion readings while the phone rests on the user's chest for 30 seconds.

## Run

Serve this folder over HTTPS or from `localhost` because mobile browsers require a secure context for motion sensor permissions:

```bash
python -m http.server 8080 --directory pulse_counter_webapp
```

Then open `http://localhost:8080` for local testing, or deploy the three static files to any HTTPS static host.

## Algorithm

1. Read `DeviceMotionEvent.rotationRate` values and convert alpha/beta/gamma angular velocity into a single magnitude stream.
2. Use the first 4 seconds as calibration to estimate resting baseline and robust noise with median absolute deviation.
3. Remove slow drift with a moving-average high-pass stage and reduce sensor jitter with a short smoothing window.
4. Detect local maxima above an adaptive threshold, enforcing physiologic peak spacing of roughly 40-160 bpm.
5. Estimate heart rate from the median beat-to-beat interval and report beat count, rhythm variation, and confidence.

This is a wellness prototype, not a medical device. It must not be used for diagnosis, emergencies, treatment decisions, or replacing validated pulse/ECG equipment.
