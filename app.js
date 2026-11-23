const $ = (selector) => document.querySelector(selector);
let mediaRecorder = null, chunks = [], audioUrl = "", analyser = null, meterFrame = null, audioContext = null, capturedStream = null;
let sampleReady = false, profileReady = false;
const consent = $("#consent"), recordBtn = $("#recordBtn"), stopBtn = $("#stopBtn"), playBtn = $("#playBtn"), analyzeBtn = $("#analyzeBtn"), generateBtn = $("#generateBtn"), recordStatus = $("#recordStatus");
function setStatus(message) { recordStatus.textContent = message; }
consent.addEventListener("change", () => { recordBtn.disabled = !consent.checked || mediaRecorder?.state === "recording"; });

async function startRecording() {
  if (!consent.checked) { setStatus("Please confirm voice permission before recording."); return; }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { setStatus("Microphone recording is not supported. Use an updated Chrome browser over HTTPS."); return; }
  try {
    capturedStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    const options = {};
    if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) options.mimeType = "audio/webm;codecs=opus";
    mediaRecorder = new MediaRecorder(capturedStream, options);
    mediaRecorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
    mediaRecorder.onerror = () => setStatus("Recording error. Please try again.");
    mediaRecorder.onstop = () => {
      capturedStream?.getTracks().forEach((track) => track.stop());
      capturedStream = null;
      if (meterFrame) cancelAnimationFrame(meterFrame);
      meterFrame = null;
      if (audioContext && audioContext.state !== "closed") audioContext.close();
      audioContext = null;
      analyser = null;
      const blob = new Blob(chunks, { type: mediaRecorder.mimeType || "audio/webm" });
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      audioUrl = URL.createObjectURL(blob);
      const audio = $("#audioPreview");
      audio.src = audioUrl;
      audio.hidden = false;
      sampleReady = true;
      profileReady = false;
      playBtn.disabled = false;
      analyzeBtn.disabled = false;
      generateBtn.disabled = true;
      $("#duration").textContent = "Ready";
      $("#level").textContent = "Pending";
      $("#profile").textContent = "Not analyzed";
      $("#meterFill").style.width = "0%";
      setStatus("Voice sample captured. Play it back, then analyze your voice.");
    };
    mediaRecorder.start();
    recordBtn.disabled = true;
    stopBtn.disabled = false;
    analyzeBtn.disabled = true;
    generateBtn.disabled = true;
    setStatus("Recording… speak naturally for about 5–15 seconds. Press Stop when finished.");
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(capturedStream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const drawMeter = () => {
      if (!analyser) return;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const value of data) { const sample = (value - 128) / 128; sum += sample * sample; }
      const rms = Math.min(1, Math.sqrt(sum / data.length) * 4);
      $("#meterFill").style.width = Math.round(rms * 100) + "%";
      meterFrame = requestAnimationFrame(drawMeter);
    };
    drawMeter();
  } catch (error) {
    capturedStream?.getTracks().forEach((track) => track.stop());
    capturedStream = null;
    recordBtn.disabled = !consent.checked;
    stopBtn.disabled = true;
    setStatus(error?.name === "NotAllowedError" ? "Microphone permission was blocked. Allow microphone access in Chrome site settings, then try again." : "Could not start the microphone. Check that it is connected and not being used by another app.");
  }
}
recordBtn.addEventListener("click", startRecording);
stopBtn.addEventListener("click", () => {
  if (mediaRecorder?.state === "recording") {
    mediaRecorder.stop();
    stopBtn.disabled = true;
    recordBtn.disabled = !consent.checked;
  }
});
playBtn.addEventListener("click", async () => {
  if (!audioUrl) return;
  try { await $("#audioPreview").play(); }
  catch { setStatus("Tap the audio player to play your recording."); }
});

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position), upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

// Estimate fundamental pitch from short, voiced frames. This is a lightweight
// browser-side estimate, not speaker identification or a complete vocal-range test.
function estimatePitchFrames(audioBuffer) {
  const source = audioBuffer.getChannelData(0);
  const factor = Math.max(1, Math.floor(audioBuffer.sampleRate / 12000));
  const sampleRate = audioBuffer.sampleRate / factor;
  const samples = new Float32Array(Math.ceil(source.length / factor));
  for (let i = 0, j = 0; i < source.length; i += factor, j++) {
    let sum = 0, count = 0;
    for (let k = i; k < Math.min(i + factor, source.length); k++) { sum += source[k]; count++; }
    samples[j] = sum / count;
  }

  const frameSize = 2048, hop = 1024;
  const minLag = Math.max(2, Math.floor(sampleRate / 500));
  const maxLag = Math.min(Math.floor(sampleRate / 65), frameSize - 2);
  const pitches = [];

  for (let offset = 0; offset + frameSize <= samples.length; offset += hop) {
    let mean = 0;
    for (let i = 0; i < frameSize; i++) mean += samples[offset + i];
    mean /= frameSize;

    const frame = new Float32Array(frameSize);
    let energy = 0;
    for (let i = 0; i < frameSize; i++) {
      const value = samples[offset + i] - mean;
      frame[i] = value;
      energy += value * value;
    }
    const rms = Math.sqrt(energy / frameSize);
    if (rms < 0.012) continue;

    const correlations = new Float32Array(maxLag + 1);
    for (let lag = minLag; lag <= maxLag; lag++) {
      let cross = 0, leftEnergy = 0, rightEnergy = 0;
      for (let i = 0; i < frameSize - lag; i++) {
        const a = frame[i], b = frame[i + lag];
        cross += a * b;
        leftEnergy += a * a;
        rightEnergy += b * b;
      }
      correlations[lag] = cross / Math.sqrt(leftEnergy * rightEnergy + 1e-12);
    }

    let selectedLag = -1;
    for (let lag = minLag + 1; lag < maxLag; lag++) {
      if (correlations[lag] > 0.55 &&
          correlations[lag] >= correlations[lag - 1] &&
          correlations[lag] >= correlations[lag + 1]) {
        selectedLag = lag;
        break;
      }
    }
    if (selectedLag < 0) {
      let best = 0;
      for (let lag = minLag; lag <= maxLag; lag++) {
        if (correlations[lag] > best) { best = correlations[lag]; selectedLag = lag; }
      }
      if (best < 0.35) continue;
    }

    const before = correlations[selectedLag - 1] || 0;
    const center = correlations[selectedLag] || 0;
    const after = correlations[selectedLag + 1] || 0;
    const denominator = before - 2 * center + after;
    const adjustment = Math.abs(denominator) > 1e-9
      ? 0.5 * (before - after) / denominator : 0;
    const refinedLag = selectedLag + Math.max(-0.5, Math.min(0.5, adjustment));
    const pitch = sampleRate / refinedLag;
    if (pitch >= 65 && pitch <= 500) pitches.push(pitch);
  }
  return pitches;
}

analyzeBtn.addEventListener("click", async () => {
  if (!audioUrl || !sampleReady) return;
  analyzeBtn.disabled = true;
  generateBtn.disabled = true;
  $("#profile").textContent = "Analyzing…";
  $("#analysisNote").textContent = "Measuring signal level and estimating pitch from voiced portions of the recording…";
  let context;
  try {
    const response = await fetch(audioUrl);
    if (!response.ok) throw new Error("Could not read the recorded audio.");
    const buffer = await response.arrayBuffer();
    context = new AudioContext();
    const decoded = await context.decodeAudioData(buffer.slice(0));
    const samples = decoded.getChannelData(0);
    let sum = 0;
    for (const value of samples) sum += value * value;
    const rms = Math.sqrt(sum / samples.length);
    const pitches = estimatePitchFrames(decoded);

    $("#duration").textContent = decoded.duration.toFixed(1) + " sec";
    $("#level").textContent = (rms * 100).toFixed(1) + "%";
    $("#profile").textContent = rms > 0.12 ? "Strong / expressive" : rms > 0.035 ? "Balanced / conversational" : "Soft / intimate";

    if (pitches.length >= 3) {
      const median = percentile(pitches, 0.5);
      const low = percentile(pitches, 0.1);
      const high = percentile(pitches, 0.9);
      const deviations = pitches.map(value => Math.abs(1200 * Math.log2(value / median)));
      const variation = percentile(deviations, 0.5);
      $("#pitchMedian").textContent = Math.round(median) + " Hz";
      $("#pitchRange").textContent = Math.round(low) + "–" + Math.round(high) + " Hz";
      $("#pitchStability").textContent = "±" + Math.round(variation) + " cents";
      $("#analysisNote").textContent = "Estimated from " + pitches.length + " voiced frames. Pitch span describes this sample only—not your full singing range. Results can vary with speech, background noise and microphone quality.";
    } else {
      $("#pitchMedian").textContent = "Not detected";
      $("#pitchRange").textContent = "Not detected";
      $("#pitchStability").textContent = "Not enough data";
      $("#analysisNote").textContent = "We measured the recording level, but could not find enough clear pitched audio. Try a 5–15 second sample with a steady spoken or sung voice and less background noise.";
    }

    profileReady = true;
    generateBtn.disabled = false;
    setStatus("Voice analysis complete. You can now build your song idea.");
  } catch (error) {
    profileReady = false;
    $("#pitchMedian").textContent = "—";
    $("#pitchRange").textContent = "—";
    $("#pitchStability").textContent = "—";
    $("#profile").textContent = "Analysis unavailable";
    $("#analysisNote").textContent = "The browser could not decode this recording for analysis. Please record a new sample using an updated Chrome browser.";
    setStatus("Could not analyze this recording. Please try recording again.");
  } finally {
    if (context && context.state !== "closed") await context.close().catch(() => {});
    analyzeBtn.disabled = false;
    generateBtn.disabled = !profileReady;
  }
});


function midiFrequency(note) { return 440 * Math.pow(2, (note - 69) / 12); }
function addTone(context, frequency, start, duration, type, volume, pan = 0) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const panner = context.createStereoPanner ? context.createStereoPanner() : null;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(volume, start + Math.min(0.04, duration * 0.2));
  gain.gain.setValueAtTime(volume, Math.max(start + 0.05, start + duration - 0.08));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  if (panner) { panner.pan.value = pan; gain.connect(panner); panner.connect(context.destination); }
  else gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}
function addKick(context, start) {
  const osc = context.createOscillator(), gain = context.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(115, start);
  osc.frequency.exponentialRampToValueAtTime(42, start + 0.16);
  gain.gain.setValueAtTime(0.35, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
  osc.connect(gain); gain.connect(context.destination); osc.start(start); osc.stop(start + 0.21);
}
function addNoiseHit(context, start, duration, volume, highpass) {
  const length = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
  source.buffer = buffer; filter.type = "highpass"; filter.frequency.value = highpass;
  gain.gain.setValueAtTime(volume, start); gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  source.connect(filter); filter.connect(gain); gain.connect(context.destination);
  source.start(start); source.stop(start + duration);
}
function audioBufferToWav(buffer) {
  const channels = buffer.numberOfChannels, sampleRate = buffer.sampleRate, frames = buffer.length;
  const bytes = 2, dataSize = frames * channels * bytes;
  const output = new ArrayBuffer(44 + dataSize), view = new DataView(output);
  const write = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  write(0, "RIFF"); view.setUint32(4, 36 + dataSize, true); write(8, "WAVE");
  write(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channels, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytes, true); view.setUint16(32, channels * bytes, true);
  view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < frames; i++) for (let ch = 0; ch < channels; ch++) {
    const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
    view.setInt16(offset, sample < 0 ? sample * 32768 : sample * 32767, true); offset += 2;
  }
  return new Blob([output], { type: "audio/wav" });
}
async function createBackingTrack(style) {
  const tempos = { Pop: 100, Acoustic: 92, Ballad: 76, "R&B": 88, Rock: 116 };
  const bpm = tempos[style] || 100, beat = 60 / bpm, bars = 8, sampleRate = 44100;
  const duration = bars * 4 * beat + 1;
  const offline = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
  const master = offline.createGain(); master.gain.value = 0.72; master.connect(offline.destination);
  const originalDestination = offline.destination;
  const progressions = [[60,64,67],[55,59,62],[57,60,64],[53,57,60]];
  const roots = [48,43,45,41], melody = [72,74,76,79,76,74,72,67];
  for (let bar = 0; bar < bars; bar++) {
    const start = bar * 4 * beat, chord = progressions[bar % 4], root = roots[bar % 4];
    chord.forEach((note, index) => addTone(offline, midiFrequency(note), start, beat * 3.85, "triangle", 0.035, index === 0 ? -0.25 : index === 2 ? 0.25 : 0));
    addTone(offline, midiFrequency(root), start, beat * 3.7, "sine", 0.11);
    for (let i = 0; i < 8; i++) {
      const t = start + i * beat / 2;
      addTone(offline, midiFrequency(melody[(i + bar) % melody.length]), t, beat * 0.38, "sine", 0.075, i % 2 ? 0.18 : -0.18);
    }
    for (let b = 0; b < 4; b++) {
      const t = start + b * beat;
      if (b === 0 || b === 2) addKick(offline, t);
      if (b === 1 || b === 3) addNoiseHit(offline, t, 0.13, 0.10, 900);
      addNoiseHit(offline, t + 0.02, 0.035, 0.025, 6500);
    }
  }
  const rendered = await offline.startRendering();
  return audioBufferToWav(rendered);
}

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = String(value);
  return element.innerHTML;
}
function makeLyricDraft(title, style, idea) {
  const theme = idea.replace(/[.!?]+$/g, "").trim() || "the story we carry in our hearts";
  const first = (style === "Ballad" || style === "Acoustic")
    ? ["In the quiet, I can hear", "Every hope that brought me here", "Through the moments, bright and blue", "I find my way back into you"]
    : ["We were waiting for a sign", "Now the stars are falling into line", "Every heartbeat finds a way", "To turn this moment into a day"];
  const second = (style === "Ballad" || style === "Acoustic")
    ? ["When the road is hard to see", "There is still a light in me", "Every memory helps me grow", "More than words could ever show"]
    : ["Let the rhythm take control", "Feel the fire inside your soul", "Raise your voice and let it fly", "We can paint a brighter sky"];
  return [
    "[Verse 1]\n" + first.join("\n"),
    "[Pre-Chorus]\nI can feel a new beginning\nHear the sound of hope within",
    "[Chorus]\n" + title + "\n" + theme + "\nWe will keep this feeling alive\nWith every beat, we rise",
    "[Verse 2]\n" + second.join("\n"),
    "[Bridge]\nEven if the night is long\nWe can turn our dreams to song",
    "[Final Chorus]\n" + title + "\n" + theme + "\nLet the whole world hear us tonight\nOur hearts are shining bright"
  ].join("\n\n");
}
generateBtn.addEventListener("click", () => {
  if (!profileReady) { setStatus("Please capture and analyze your voice before creating a song draft."); return; }
  const title = $("#songTitle").value.trim() || "My Voice, My Song";
  const style = $("#style").value;
  const prompt = $("#prompt").value.trim() || "A heartfelt story about love, hope and unforgettable memories.";
  const lyrics = makeLyricDraft(title, style, prompt);
  $("#visualTitle").textContent = title;
  const result = $("#songResult");
  result.hidden = false;
  result.innerHTML = '<h3>🎵 Your Song Draft</h3><p><strong>' + escapeHtml(title) + '</strong> · ' + escapeHtml(style) + '</p><p><strong>Song idea:</strong> ' + escapeHtml(prompt) + '</p><p><strong>Voice sample:</strong> Captured and locally analyzed in this browser.</p><h4>Lyrics draft</h4><pre class="lyrics">' + escapeHtml(lyrics) + '</pre><p class="engine-note">This is a locally assembled lyric draft, not an AI-generated recording. Next integration: melody and backing track generation, authorized voice singing, lyric timing, and music-video rendering.</p><button type="button" id="downloadLyricsBtn">⬇ Download Lyrics (.txt)</button><div class="music-engine"><h4>🎼 Instrumental Backing Track</h4><p class="engine-note">Create an original 8-bar browser-synthesized melody, chords and rhythm. This is a local demo track, not an AI-generated song.</p><button type="button" id="generateMusicBtn">🎹 Generate Instrumental Preview</button><p id="musicStatus" class="status-text">Ready to build your first instrumental preview.</p><audio id="musicPreview" controls hidden></audio><p><a id="downloadMusicBtn" class="download-link" hidden download="sounds-generator-backing-track.wav">⬇ Download Backing Track (.wav)</a></p></div>';
  $("#downloadLyricsBtn").addEventListener("click", () => {
    const file = new Blob([title + "\nStyle: " + style + "\n\n" + lyrics + "\n"], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = (title.replace(/[^a-z0-9-_]+/gi, "-") || "song") + "-lyrics.txt";
    link.click();
    URL.revokeObjectURL(url);
  });
  $("#generateMusicBtn").addEventListener("click", async () => {
    const button = $("#generateMusicBtn"), status = $("#musicStatus"), player = $("#musicPreview"), download = $("#downloadMusicBtn");
    button.disabled = true; button.textContent = "⏳ Creating instrumental…"; status.textContent = "Composing melody, chords and rhythm in this browser.";
    try {
      const blob = await createBackingTrack(style);
      if (window.currentBackingTrackUrl) URL.revokeObjectURL(window.currentBackingTrackUrl);
      window.currentBackingTrackUrl = URL.createObjectURL(blob);
      player.src = window.currentBackingTrackUrl; player.hidden = false;
      download.href = window.currentBackingTrackUrl; download.hidden = false;
      status.textContent = "Instrumental preview ready. Press Play or download the WAV file.";
    } catch (error) {
      status.textContent = "Could not create audio in this browser. Please try an updated Chrome browser.";
    } finally { button.disabled = false; button.textContent = "🎹 Generate Instrumental Preview"; }
  });
  result.scrollIntoView({ behavior: "smooth", block: "center" });
});
window.addEventListener("beforeunload", () => {
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  capturedStream?.getTracks().forEach((track) => track.stop());
});