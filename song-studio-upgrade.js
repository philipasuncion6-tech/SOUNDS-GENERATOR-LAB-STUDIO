/* SOUNDS GENERATOR LAB STUDIO — Song Creation Upgrade
   Local-first songwriting, project export, instrumental rendering and lyric-video export. */
(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const escape = (value) => {
    const node = document.createElement("div");
    node.textContent = String(value ?? "");
    return node.innerHTML;
  };
  const saveFile = (name, data, type) => {
    const blob = new Blob([data], { type: type || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  };
  const lyricBank = {
    English: {
      verse: ["I kept a little light inside", "Through every changing road and tide", "The quiet days, the nights so long", "Have taught my heart to carry on"],
      verse2: ["Every scar became a page", "Every dream outlived its age", "When the world was hard to see", "A new horizon waited for me"],
      pre: ["And now I feel the moment turning", "A brighter fire is slowly burning"],
      bridge: ["If tomorrow changes everything", "I will still remember how to sing"],
      Hopeful: ["We are stronger than yesterday", "There is a new dawn on the way"],
      Romantic: ["Every heartbeat leads to you", "My forever starts anew"],
      Heartbreak: ["I let the echoes fade away", "I choose to heal another day"],
      Inspirational: ["Stand up tall and claim the sky", "Your dream was born to learn to fly"],
      Celebration: ["Raise your hands and feel alive", "This is our moment, this is our time"],
      Peaceful: ["Let the restless waters slow", "Find the calm you used to know"]
    },
    Filipino: {
      verse: ["May munting ilaw sa puso ko", "Sa bawat unos, di susuko", "Mga araw na kay bigat", "Nagturo sa aking mangarap"],
      verse2: ["Bawat sugat ay may aral", "Bawat luha ay may dangal", "Kahit minsan ay madilim", "May umagang darating din"],
      pre: ["At ngayon ay dama ko", "May bagong lakas sa puso"],
      bridge: ["Kung magbago man ang bukas", "Pangarap ko'y di kukupas"],
      Hopeful: ["Mas matatag kaysa kahapon", "May bagong araw sa dulo ng panahon"],
      Romantic: ["Ikaw ang tibok ng puso", "Sa piling mo, buo ako"],
      Heartbreak: ["Papalaya ang damdamin", "May bagong araw na darating"],
      Inspirational: ["Tumindig at abutin ang tala", "May lakas ka, maniwala"],
      Celebration: ["Itaas ang kamay, magsaya", "Ating gabi, ating ligaya"],
      Peaceful: ["Pahinga muna, huminga", "May payapang umaga"]
    },
    Taglish: {
      verse: ["May little light sa puso ko", "Through every storm, I still grow", "Kahit mahirap ang daan", "I know na kaya kong lumaban"],
      verse2: ["Every scar may lesson dala", "Bawat luha, may pag-asa", "When the night feels cold and blue", "May bagong dawn waiting for you"],
      pre: ["And now I feel it, here we go", "May bagong fire sa puso ko"],
      bridge: ["Whatever changes, come what may", "Pipiliin kong lumaban every day"],
      Hopeful: ["Stronger tayo than yesterday", "May brighter dawn along the way"],
      Romantic: ["Ikaw ang home na hinahanap", "My forever, walang katapusan"],
      Heartbreak: ["I will let the old pain go", "Unti-unti, I will grow"],
      Inspirational: ["Stand up, kaya mong abutin", "Your dreams, huwag bitawan natin"],
      Celebration: ["Hands up, sabay nating isigaw", "This is our night, ngayon at araw-araw"],
      Peaceful: ["Slow down, breathe and let it flow", "May peace sa puso mo"]
    }
  };
  function buildLyrics(title, idea, language, mood, structure) {
    const p = lyricBank[language] || lyricBank.English;
    const hook = p[mood] || p.Hopeful;
    const theme = idea.trim().replace(/[.!?]+$/g, "") || "the story we carry in our hearts";
    const parts = [
      ["[Verse 1]", ...p.verse],
      ["[Pre-Chorus]", ...p.pre],
      ["[Chorus]", title, theme, ...hook],
      ["[Verse 2]", ...p.verse2],
      ["[Bridge]", ...p.bridge],
      ["[Final Chorus]", title, theme, ...hook]
    ];
    if (structure === "Short") return [parts[0], parts[2], parts[4], parts[5]].map(x => x.join("\n")).join("\n\n");
    if (structure === "VerseChorus") return [parts[0], parts[2], parts[1], parts[2]].map(x => x.join("\n")).join("\n\n");
    return parts.map(x => x.join("\n")).join("\n\n");
  }
  async function renderLyricVideo(title, lyrics, audioBlob) {
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) throw new Error("Video export is not supported in this browser. Try updated desktop Chrome.");
    const canvas=document.createElement("canvas");canvas.width=1280;canvas.height=720;
    const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Canvas rendering is unavailable.");
    const sections=lyrics.split(/\\n\\s*\\n/).map(s=>s.trim()).filter(Boolean);
    const ac=new AudioContext();
    let stream,raf=0;
    try {
      const decoded=await ac.decodeAudioData(await audioBlob.arrayBuffer());
      const destination=ac.createMediaStreamDestination(),source=ac.createBufferSource();
      source.buffer=decoded;source.connect(destination);
      const canvasStream=canvas.captureStream(30);
      stream=new MediaStream([...canvasStream.getVideoTracks(),...destination.stream.getAudioTracks()]);
      const types=["video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"];
      const mime=types.find(type=>MediaRecorder.isTypeSupported(type));
      if(!mime)throw new Error("This browser does not support WebM video recording.");
      const recorder=new MediaRecorder(stream,{mimeType:mime}),chunks=[];
      const duration=decoded.duration,started=performance.now();
      const wrap=(line,x,y,maxWidth,lineHeight)=>{let current="",row=0;for(const word of line.split(/\\s+/)){const next=current?current+" "+word:word;if(ctx.measureText(next).width>maxWidth&&current){ctx.fillText(current,x,y+row++*lineHeight);current=word;}else current=next;}if(current)ctx.fillText(current,x,y+row*lineHeight);};
      const draw=()=>{const elapsed=Math.min(duration,(performance.now()-started)/1000),progress=elapsed/duration,index=Math.min(sections.length-1,Math.floor(progress*sections.length)),hue=(252+elapsed*8)%360;
        const g=ctx.createLinearGradient(0,0,1280,720);g.addColorStop(0,"#080d20");g.addColorStop(.55,"hsl("+hue+" 48% 19%)");g.addColorStop(1,"#090b17");ctx.fillStyle=g;ctx.fillRect(0,0,1280,720);
        ctx.globalAlpha=.18;for(let i=0;i<34;i++){ctx.beginPath();ctx.arc((i*173+elapsed*(18+i%5)*8)%1280,(i*97+Math.sin(elapsed+i)*28+720)%720,2+i%4,0,Math.PI*2);ctx.fillStyle="#fff";ctx.fill();}ctx.globalAlpha=1;
        ctx.textAlign="center";ctx.fillStyle="#c4b5fd";ctx.font="700 25px system-ui";ctx.fillText("SOUNDS GENERATOR LAB STUDIO",640,92);
        ctx.fillStyle="#fff";ctx.font="800 54px system-ui";wrap(title,640,190,1080,64);
        ctx.fillStyle="#f8e7ff";ctx.font="600 36px system-ui";(sections[index]||title).split("\\n").filter(line=>!/^\\[.*\\]$/.test(line)).slice(0,5).forEach((line,i)=>wrap(line,640,330+i*55,1080,44));
        ctx.fillStyle="#aab3cf";ctx.font="20px system-ui";ctx.fillText("ORIGINAL LYRIC VIDEO • LOCAL BROWSER RENDER",640,650);
        ctx.fillStyle="#2b3658";ctx.fillRect(100,680,1080,8);ctx.fillStyle="#c4b5fd";ctx.fillRect(100,680,1080*progress,8);ctx.textAlign="start";
        if(elapsed<duration)raf=requestAnimationFrame(draw);
      };
      draw();
      const stopped=new Promise((resolve,reject)=>{recorder.ondataavailable=event=>{if(event.data?.size)chunks.push(event.data);};recorder.onerror=()=>reject(new Error("Video recording stopped unexpectedly."));recorder.onstop=resolve;});
      recorder.start(250);source.onended=()=>{if(recorder.state!=="inactive")recorder.stop();};
      await ac.resume();source.start();await stopped;
      const blob=new Blob(chunks,{type:recorder.mimeType||"video/webm"});
      if(!blob.size)throw new Error("The browser created an empty video.");
      return blob;
    } finally {cancelAnimationFrame(raf);stream?.getTracks().forEach(track=>track.stop());if(ac.state!=="closed")await ac.close();}
  }
  const generate = $("#generateBtn");
  if (!generate) return;
  generate.addEventListener("click", () => {
    // The core click handler runs first and validates the voice profile.
    setTimeout(() => {
      const result = $("#songResult");
      if (!result || result.hidden || !$("#songTitle")) return;
      const title = $("#songTitle").value.trim() || "My Voice, My Song";
      const style = $("#style").value;
      const language = $("#songLanguage").value;
      const mood = $("#songMood").value;
      const structure = $("#songStructure").value;
      const bpm = Number($("#tempo").value) || 100;
      const idea = $("#prompt").value.trim() || "A heartfelt story about love, hope and unforgettable memories.";
      const lyrics = buildLyrics(title, idea, language, mood, structure);
      const safeName = title.replace(/[^a-z0-9-_]+/gi, "-") || "song";
      $("#visualTitle").textContent = title;
      result.innerHTML =
        '<h3>🎵 Your Song Blueprint</h3>' +
        '<p><strong>' + escape(title) + '</strong> · ' + escape(style) + ' · ' + escape(mood) + '</p>' +
        '<p><strong>Language:</strong> ' + escape(language) + ' · <strong>Target tempo:</strong> ' + bpm + ' BPM · <strong>Structure:</strong> ' + escape(structure) + '</p>' +
        '<p><strong>Song idea:</strong> ' + escape(idea) + '</p>' +
        '<label for="lyricsEditor">Edit your lyrics before export</label><textarea id="lyricsEditor" class="lyrics-editor" rows="18">' + escape(lyrics) + '</textarea>' +
        '<div class="result-actions"><button type="button" id="downloadLyricsBtn">⬇ Download Lyrics (.txt)</button><button type="button" id="saveProjectBtn">💾 Save Project (.json)</button></div>' +
        '<p class="engine-note">Lyrics are editable and template-assisted in this browser. This does not generate a singing voice or use a cloud AI model.</p>' +
        '<div class="music-engine"><h4>🎼 Instrumental Studio</h4><p class="engine-note">Generate an original 8-bar browser-synthesized instrumental using your selected style and target tempo. Export as WAV.</p>' +
        '<button type="button" id="generateMusicBtn">🎹 Generate Instrumental Preview</button><p id="musicStatus" class="status-text">Ready to compose at ' + bpm + ' BPM.</p><audio id="musicPreview" controls hidden></audio>' +
        '<p><a id="downloadMusicBtn" class="download-link" hidden download="sounds-generator-backing-track.wav">⬇ Download Backing Track (.wav)</a></p>' +
        '<div class="video-tools"><h4>🎬 Animated Lyric Video</h4><p class="engine-note">After creating the instrumental, render animated lyrics with the backing audio into a WebM video. MP4 support varies by browser.</p>' +
        '<button type="button" id="generateVideoBtn" disabled>✨ Create Animated Lyric Video</button><p id="videoStatus" class="status-text">Generate an instrumental first.</p><a id="downloadVideoBtn" class="download-link" hidden download="sounds-generator-lyric-video.webm">⬇ Download Lyric Video (.webm)</a></div></div>';
      $("#downloadLyricsBtn").addEventListener("click", () => {
        saveFile(safeName + "-lyrics.txt", title + "\nStyle: " + style + "\nMood: " + mood + "\nLanguage: " + language + "\nTarget BPM: " + bpm + "\n\n" + $("#lyricsEditor").value + "\n");
      });
      $("#saveProjectBtn").addEventListener("click", () => {
        const project = { app: "SOUNDS GENERATOR LAB STUDIO", version: 2, title, style, mood, language, structure, targetBpm: bpm, idea, lyrics: $("#lyricsEditor").value, createdAt: new Date().toISOString(), note: "Local project data. No generated singing audio is included." };
        saveFile(safeName + "-project.json", JSON.stringify(project, null, 2), "application/json");
      });
      $("#generateMusicBtn").addEventListener("click", async () => {
        const button = $("#generateMusicBtn"), status = $("#musicStatus"), player = $("#musicPreview"), download = $("#downloadMusicBtn");
        button.disabled = true; button.textContent = "⏳ Creating instrumental…";
        status.textContent = "Composing " + style + " chords, melody and rhythm at " + bpm + " BPM.";
        try {
          if (typeof window.createBackingTrack !== "function") throw new Error("Instrumental engine is unavailable.");
          const blob = await window.createBackingTrack(style, bpm);
          if (window.currentBackingTrackUrl) URL.revokeObjectURL(window.currentBackingTrackUrl);
          window.currentBackingTrackBlob = blob;
          window.currentBackingTrackUrl = URL.createObjectURL(blob);
          player.src = window.currentBackingTrackUrl; player.hidden = false;
          download.href = window.currentBackingTrackUrl; download.hidden = false;
          $("#generateVideoBtn").disabled = false;
          status.textContent = "Instrumental ready. Play it, download WAV, or create your lyric video.";
        } catch (error) { status.textContent = error.message || "Could not create audio in this browser."; }
        finally { button.disabled = false; button.textContent = "🎹 Generate Instrumental Preview"; }
      });
      $("#generateVideoBtn").addEventListener("click", async () => {
        const button = $("#generateVideoBtn"), status = $("#videoStatus"), download = $("#downloadVideoBtn");
        if (!window.currentBackingTrackBlob) { status.textContent = "Generate an instrumental first."; return; }
        button.disabled = true; button.textContent = "⏳ Rendering video…";
        status.textContent = "Rendering animated lyrics and backing audio. Keep this tab open.";
        try {
          const video = await renderLyricVideo(title, $("#lyricsEditor").value, window.currentBackingTrackBlob);
          if (window.currentLyricVideoUrl) URL.revokeObjectURL(window.currentLyricVideoUrl);
          window.currentLyricVideoUrl = URL.createObjectURL(video);
          download.href = window.currentLyricVideoUrl; download.hidden = false;
          status.textContent = "Lyric video ready. Download the WebM file.";
        } catch (error) { status.textContent = error.message || "Video rendering failed. Try desktop Chrome."; }
        finally { button.disabled = false; button.textContent = "✨ Create Animated Lyric Video"; }
      });
      result.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  });
  $("#tempo")?.addEventListener("input", () => { $("#tempoValue").textContent = $("#tempo").value + " BPM"; });
})();