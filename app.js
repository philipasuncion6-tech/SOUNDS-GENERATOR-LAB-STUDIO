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

analyzeBtn.addEventListener("click", async () => {
  if (!audioUrl || !sampleReady) return;
  analyzeBtn.disabled = true;
  $("#profile").textContent = "Analyzing…";
  try {
    const response = await fetch(audioUrl);
    const buffer = await response.arrayBuffer();
    const context = new AudioContext();
    const decoded = await context.decodeAudioData(buffer.slice(0));
    const samples = decoded.getChannelData(0);
    let sum = 0;
    for (const value of samples) sum += value * value;
    const rms = Math.sqrt(sum / samples.length);
    $("#duration").textContent = decoded.duration.toFixed(1) + " sec";
    $("#level").textContent = (rms * 100).toFixed(1) + "%";
    $("#profile").textContent = rms > 0.12 ? "Strong / expressive" : rms > 0.035 ? "Balanced / conversational" : "Soft / intimate";
    await context.close();
    profileReady = true;
    generateBtn.disabled = false;
    setStatus("Voice profile ready. You can now build your song idea.");
  } catch (error) {
    $("#duration").textContent = "Captured";
    $("#level").textContent = "Available";
    $("#profile").textContent = "Sample ready";
    profileReady = true;
    generateBtn.disabled = false;
    setStatus("Basic voice profile prepared. You can now build your song idea.");
  } finally { analyzeBtn.disabled = false; }
});

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
  result.innerHTML = '<h3>🎵 Your Song Draft</h3><p><strong>' + escapeHtml(title) + '</strong> · ' + escapeHtml(style) + '</p><p><strong>Song idea:</strong> ' + escapeHtml(prompt) + '</p><p><strong>Voice sample:</strong> Captured and locally analyzed in this browser.</p><h4>Lyrics draft</h4><pre class="lyrics">' + escapeHtml(lyrics) + '</pre><p class="engine-note">This is a locally assembled lyric draft, not an AI-generated recording. Next integration: melody and backing track generation, authorized voice singing, lyric timing, and music-video rendering.</p><button type="button" id="downloadLyricsBtn">⬇ Download Lyrics (.txt)</button>';
  $("#downloadLyricsBtn").addEventListener("click", () => {
    const file = new Blob([title + "\nStyle: " + style + "\n\n" + lyrics + "\n"], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = (title.replace(/[^a-z0-9-_]+/gi, "-") || "song") + "-lyrics.txt";
    link.click();
    URL.revokeObjectURL(url);
  });
  result.scrollIntoView({ behavior: "smooth", block: "center" });
});
window.addEventListener("beforeunload", () => {
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  capturedStream?.getTracks().forEach((track) => track.stop());
});