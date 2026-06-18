const READ_SECONDS = 30;
const CALIBRATION_SECONDS = 4;
const MIN_PEAK_DISTANCE_SECONDS = 0.38; // 158 bpm upper bound
const MAX_PEAK_DISTANCE_SECONDS = 1.5; // 40 bpm lower bound

const stateEl = document.querySelector('#state');
const timerEl = document.querySelector('#timer');
const sampleCountEl = document.querySelector('#sampleCount');
const startBtn = document.querySelector('#startBtn');
const stopBtn = document.querySelector('#stopBtn');
const canvas = document.querySelector('#chart');
const ctx = canvas.getContext('2d');
const results = document.querySelector('#results');
const heartRateEl = document.querySelector('#heartRate');
const beatsEl = document.querySelector('#beats');
const confidenceEl = document.querySelector('#confidence');
const rhythmEl = document.querySelector('#rhythm');
const qualityEl = document.querySelector('#quality');

let samples = [];
let reading = false;
let startTime = 0;
let timerId = 0;

function setState(text) { stateEl.textContent = text; }

function magnitude(event) {
  const rot = event.rotationRate || {};
  const a = Number(rot.alpha) || 0;
  const b = Number(rot.beta) || 0;
  const g = Number(rot.gamma) || 0;
  return Math.sqrt((a * a) + (b * b) + (g * g));
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function movingAverage(values, windowSize) {
  const out = [];
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= windowSize) sum -= values[i - windowSize];
    out.push(sum / Math.min(i + 1, windowSize));
  }
  return out;
}

function preprocess(rawSamples) {
  if (rawSamples.length < 20) return [];
  const times = rawSamples.map((s) => s.t);
  const values = rawSamples.map((s) => s.v);
  const duration = Math.max(0.001, times[times.length - 1] - times[0]);
  const sampleRate = rawSamples.length / duration;

  // Remove slow body drift/gravity coupling, then smooth high-frequency jitter.
  const driftWindow = Math.max(5, Math.round(sampleRate * 0.85));
  const smoothWindow = Math.max(3, Math.round(sampleRate * 0.09));
  const drift = movingAverage(values, driftWindow);
  const highPassed = values.map((v, i) => v - drift[i]);
  const smoothed = movingAverage(highPassed, smoothWindow);

  // Robust calibration: estimate resting noise from the first seconds.
  const calibrationCount = Math.max(10, Math.round(sampleRate * CALIBRATION_SECONDS));
  const calibration = smoothed.slice(0, calibrationCount);
  const baseline = median(calibration);
  const deviations = calibration.map((v) => Math.abs(v - baseline));
  const noise = median(deviations) * 1.4826 || 0.01;
  const maxSignal = Math.max(...smoothed.map((v) => Math.abs(v - baseline)));
  const threshold = Math.max(noise * 3.2, maxSignal * 0.18, 0.02);

  return smoothed.map((v, i) => ({ t: times[i], v: v - baseline, threshold, sampleRate }));
}

function detectPeaks(processed) {
  if (processed.length < 3) return [];
  const threshold = processed[0].threshold;
  const sampleRate = processed[0].sampleRate;
  const minGap = Math.round(sampleRate * MIN_PEAK_DISTANCE_SECONDS);
  const maxGap = Math.round(sampleRate * MAX_PEAK_DISTANCE_SECONDS);
  const candidates = [];

  for (let i = 1; i < processed.length - 1; i += 1) {
    const prev = processed[i - 1].v;
    const current = processed[i].v;
    const next = processed[i + 1].v;
    if (current > threshold && current >= prev && current > next) candidates.push(i);
  }

  const peaks = [];
  for (const index of candidates) {
    if (!peaks.length || index - peaks[peaks.length - 1] >= minGap) {
      peaks.push(index);
    } else if (processed[index].v > processed[peaks[peaks.length - 1]].v) {
      peaks[peaks.length - 1] = index;
    }
  }

  return peaks
    .filter((index, i) => i === 0 || index - peaks[i - 1] <= maxGap)
    .map((index) => processed[index]);
}

function analyse() {
  const processed = preprocess(samples);
  const peaks = detectPeaks(processed);
  const intervals = peaks.slice(1).map((peak, i) => peak.t - peaks[i].t);
  const bpmValues = intervals.map((interval) => 60 / interval).filter((bpm) => bpm >= 40 && bpm <= 160);
  const bpm = bpmValues.length ? Math.round(median(bpmValues)) : 0;
  const meanInterval = intervals.reduce((sum, v) => sum + v, 0) / Math.max(intervals.length, 1);
  const sdnn = Math.sqrt(intervals.reduce((sum, v) => sum + ((v - meanInterval) ** 2), 0) / Math.max(intervals.length, 1));
  const rhythmVariation = intervals.length ? Math.round(sdnn * 1000) : 0;
  const expectedBeats = bpm ? bpm * (READ_SECONDS / 60) : 0;
  const beatCompleteness = expectedBeats ? Math.min(1, peaks.length / expectedBeats) : 0;
  const regularity = meanInterval ? Math.max(0, 1 - (sdnn / meanInterval)) : 0;
  const confidence = Math.round(100 * Math.min(1, (beatCompleteness * 0.45) + (regularity * 0.45) + (samples.length > 600 ? 0.1 : 0)));

  heartRateEl.textContent = bpm ? String(bpm) : '--';
  beatsEl.textContent = String(peaks.length);
  confidenceEl.textContent = `${confidence}%`;
  rhythmEl.textContent = intervals.length ? `${rhythmVariation} ms` : '--';
  qualityEl.textContent = bpm
    ? 'Use the result only as an estimate. Repeat if confidence is low, the phone moved, or the waveform was irregular.'
    : 'No reliable pulse pattern was found. Hold the phone still against the chest and try again.';
  results.hidden = false;
  draw(processed, peaks);
}

function draw(processed = preprocess(samples), peaks = []) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#20364d';
  ctx.lineWidth = 1;
  for (let y = 30; y < canvas.height; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }
  if (!processed.length) return;
  const values = processed.map((p) => p.v);
  const maxAbs = Math.max(0.05, ...values.map(Math.abs));
  ctx.strokeStyle = '#71d0ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  processed.forEach((point, index) => {
    const x = (index / (processed.length - 1)) * canvas.width;
    const y = (canvas.height / 2) - ((point.v / maxAbs) * (canvas.height * 0.42));
    if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.fillStyle = '#ffcc66';
  peaks.forEach((peak) => {
    const index = processed.indexOf(peak);
    const x = (index / (processed.length - 1)) * canvas.width;
    ctx.beginPath(); ctx.arc(x, 24, 4, 0, Math.PI * 2); ctx.fill();
  });
}

function onMotion(event) {
  if (!reading) return;
  samples.push({ t: (performance.now() - startTime) / 1000, v: magnitude(event) });
  sampleCountEl.textContent = String(samples.length);
  if (samples.length % 6 === 0) draw();
}

function finish() {
  if (!reading) return;
  reading = false;
  clearInterval(timerId);
  window.removeEventListener('devicemotion', onMotion);
  startBtn.disabled = false;
  stopBtn.disabled = true;
  timerEl.textContent = '0.0s';
  setState('Analysing');
  analyse();
  setState('Complete');
}

async function requestMotionAccess() {
  if (typeof DeviceMotionEvent === 'undefined') throw new Error('Device motion is not supported by this browser.');
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    const permission = await DeviceMotionEvent.requestPermission();
    if (permission !== 'granted') throw new Error('Motion sensor permission was denied.');
  }
}

async function start() {
  try {
    await requestMotionAccess();
    samples = [];
    results.hidden = true;
    startTime = performance.now();
    reading = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    setState('Calibrating');
    window.addEventListener('devicemotion', onMotion);
    timerId = setInterval(() => {
      const elapsed = (performance.now() - startTime) / 1000;
      const remaining = Math.max(0, READ_SECONDS - elapsed);
      timerEl.textContent = `${remaining.toFixed(1)}s`;
      if (elapsed > CALIBRATION_SECONDS) setState('Reading');
      if (remaining <= 0) finish();
    }, 100);
  } catch (error) {
    setState(error.message);
  }
}

startBtn.addEventListener('click', start);
stopBtn.addEventListener('click', finish);
draw([]);
