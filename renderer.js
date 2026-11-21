const root = document.querySelector('.widget');
const status = document.querySelector('[data-status]');
const detail = document.querySelector('[data-detail]');
const closeButton = document.querySelector('[data-close]');
const monitorButton = document.querySelector('[data-monitor]');
const deviceSelect = document.querySelector('[data-device]');
const bars = [...document.querySelectorAll('.signal i')];

let stream;
let audioContext;
let analyser;
let monitorGain;
let heardUntil = 0;
let animationFrame;
let visualLevel = 0;
let currentState = '';
let isStarting = false;
let monitoring = false;

function setState(name, heading, description) {
  if (name === currentState) return;
  currentState = name;
  root.dataset.state = name;
  status.textContent = heading;
  detail.textContent = description;
}

function animateBars(level) {
  visualLevel += (level - visualLevel) * 0.22;
  const baseHeights = [8, 15, 10];
  const rangeHeights = [12, 14, 13];
  bars.forEach((bar, index) => {
    bar.style.height = `${baseHeights[index] + visualLevel * rangeHeights[index]}px`;
  });
}

function setMonitoring(enabled) {
  if (!monitorGain || !audioContext) return;
  monitoring = enabled;
  monitorGain.gain.setTargetAtTime(enabled ? 0.85 : 0, audioContext.currentTime, 0.01);
  monitorButton.setAttribute('aria-pressed', String(enabled));
  monitorButton.setAttribute('aria-label', enabled ? 'Turn off mic monitoring' : 'Turn on mic monitoring');
  monitorButton.title = enabled ? 'Stop hearing your microphone' : 'Hear your microphone';
}

function stopListening() {
  cancelAnimationFrame(animationFrame);
  stream?.getTracks().forEach((track) => track.stop());
  audioContext?.close();
  stream = undefined;
  audioContext = undefined;
  analyser = undefined;
  monitorGain = undefined;
  monitoring = false;
  monitorButton.disabled = true;
  monitorButton.setAttribute('aria-pressed', 'false');
  monitorButton.setAttribute('aria-label', 'Turn on mic monitoring');
  monitorButton.title = 'Hear your microphone';
}

async function populateMicrophones(selectedDeviceId) {
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter(({ kind }) => kind === 'audioinput');
  deviceSelect.replaceChildren(...devices.map((device, index) => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.textContent = device.label || `Microphone ${index + 1}`;
    return option;
  }));
  deviceSelect.value = selectedDeviceId;
  deviceSelect.hidden = false;
  detail.hidden = true;
}

function measure() {
  const samples = new Uint8Array(analyser.fftSize);
  const tick = () => {
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) {
      const value = (sample - 128) / 128;
      sum += value * value;
    }

    const level = Math.sqrt(sum / samples.length);
    // Voice processing lifts quiet speech while this lower gate still rejects most room noise.
    if (level > 0.006) heardUntil = performance.now() + 550;
    const speaking = performance.now() < heardUntil;
    animateBars(Math.min(level / 0.03, 1));
    setState(speaking ? 'heard' : 'listening', speaking ? 'Heard you' : 'Listening', speaking ? 'Your mic picked up sound' : 'Speak to test your mic');
    animationFrame = requestAnimationFrame(tick);
  };
  tick();
}

async function startListening(deviceId = localStorage.getItem('microphoneDeviceId')) {
  if (isStarting) return;
  isStarting = true;
  stopListening();
  setState('connecting', 'Checking mic', 'Waiting for microphone access');
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false,
    });
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    monitorGain = audioContext.createGain();
    monitorGain.gain.value = 0;
    source.connect(analyser);
    source.connect(monitorGain);
    monitorGain.connect(audioContext.destination);
    monitorButton.disabled = false;
    await populateMicrophones(stream.getAudioTracks()[0].getSettings().deviceId);
    measure();
  } catch (error) {
    console.error('Microphone access failed:', error);
    detail.hidden = false;
    deviceSelect.hidden = true;
    setState('error', 'Mic unavailable', 'Click to try again');
  } finally {
    isStarting = false;
  }
}

root.addEventListener('click', () => startListening());
deviceSelect.addEventListener('click', (event) => event.stopPropagation());
deviceSelect.addEventListener('change', () => {
  localStorage.setItem('microphoneDeviceId', deviceSelect.value);
  startListening(deviceSelect.value);
});
monitorButton.addEventListener('click', (event) => {
  event.stopPropagation();
  setMonitoring(!monitoring);
});
closeButton.addEventListener('click', (event) => {
  event.stopPropagation();
  window.widget.quit();
});

window.addEventListener('beforeunload', () => {
  stopListening();
});

startListening();
