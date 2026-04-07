let ctx = null;

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function createNoise(ac, duration) {
  const bufferSize = ac.sampleRate * duration;
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const source = ac.createBufferSource();
  source.buffer = buffer;
  return source;
}

export function playBatCrack(intensity = 1) {
  const ac = getCtx();
  const now = ac.currentTime;
  const duration = 0.08 + intensity * 0.04;
  const volume = 0.3 + intensity * 0.15;

  // Noise burst through bandpass filter
  const noise = createNoise(ac, duration);
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 800 + intensity * 400;
  filter.Q.value = 2;

  const gain = ac.createGain();
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);
  noise.start(now);
  noise.stop(now + duration);
}

export function playHomeRunFanfare() {
  const ac = getCtx();
  const now = ac.currentTime;

  // Ascending 8-bit arpeggio
  const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    const osc = ac.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;

    const gain = ac.createGain();
    const start = now + i * 0.12;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.15);

    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(start);
    osc.stop(start + 0.15);
  });

  // Victory chord at end
  const chordTime = now + 0.5;
  [523, 659, 784].forEach(freq => {
    const osc = ac.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;

    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.15, chordTime);
    gain.gain.exponentialRampToValueAtTime(0.001, chordTime + 0.5);

    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(chordTime);
    osc.stop(chordTime + 0.5);
  });

  // Crowd noise
  const crowd = createNoise(ac, 1.5);
  const crowdFilter = ac.createBiquadFilter();
  crowdFilter.type = 'lowpass';
  crowdFilter.frequency.value = 600;

  const crowdGain = ac.createGain();
  crowdGain.gain.setValueAtTime(0, now + 0.3);
  crowdGain.gain.linearRampToValueAtTime(0.15, now + 0.6);
  crowdGain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);

  crowd.connect(crowdFilter);
  crowdFilter.connect(crowdGain);
  crowdGain.connect(ac.destination);
  crowd.start(now + 0.3);
  crowd.stop(now + 1.8);
}

export function playSuccess() {
  const ac = getCtx();
  const now = ac.currentTime;

  const osc = ac.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.setValueAtTime(1100, now + 0.08);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.15);
}

export function playError() {
  const ac = getCtx();
  const now = ac.currentTime;

  const osc = ac.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(400, now);
  osc.frequency.exponentialRampToValueAtTime(200, now + 0.2);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.25);
}
