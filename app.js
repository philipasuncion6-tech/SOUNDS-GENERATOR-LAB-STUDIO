const $=s=>document.querySelector(s);
let mediaRecorder=null,chunks=[],audioUrl="",analyser=null,meterFrame=null,audioContext=null;
const consent=$("#consent"),recordBtn=$("#recordBtn"),stopBtn=$("#stopBtn"),playBtn=$("#playBtn"),analyzeBtn=$("#analyzeBtn"),generateBtn=$("#generateBtn");
consent.addEventListener("change",()=>recordBtn.disabled=!consent.checked);
async function startRecording(){
 if(!navigator.mediaDevices?.getUserMedia){$("#recordStatus").textContent="Microphone capture is not supported in this browser.";return}
 try{
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});chunks=[];mediaRecorder=new MediaRecorder(stream);
  mediaRecorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
  mediaRecorder.onstop=()=>{
   stream.getTracks().forEach(t=>t.stop());cancelAnimationFrame(meterFrame);if(audioContext)audioContext.close();analyser=null;
   const blob=new Blob(chunks,{type:mediaRecorder.mimeType||"audio/webm"});if(audioUrl)URL.revokeObjectURL(audioUrl);audioUrl=URL.createObjectURL(blob);
   const audio=$("#audioPreview");audio.src=audioUrl;audio.hidden=false;playBtn.disabled=false;analyzeBtn.disabled=false;generateBtn.disabled=false;$("#meterFill").style.width="0%";
   $("#recordStatus").textContent="Voice sample captured. Analyze it or create a song blueprint.";
  };
  mediaRecorder.start();recordBtn.disabled=true;stopBtn.disabled=false;$("#recordStatus").textContent="Recording… speak naturally for 5–15 seconds.";
  audioContext=new AudioContext();const source=audioContext.createMediaStreamSource(stream);analyser=audioContext.createAnalyser();analyser.fftSize=256;source.connect(analyser);
  const data=new Uint8Array(analyser.frequencyBinCount);const draw=()=>{if(!analyser)return;analyser.getByteTimeDomainData(data);let sum=0;for(const v of data){const x=(v-128)/128;sum+=x*x}const rms=Math.min(1,Math.sqrt(sum/data.length)*4);$("#meterFill").style.width=(rms*100)+"%";meterFrame=requestAnimationFrame(draw)};draw();
 }catch(err){$("#recordStatus").textContent="Microphone permission was not granted.";recordBtn.disabled=!consent.checked;stopBtn.disabled=true}
}
recordBtn.addEventListener("click",startRecording);stopBtn.addEventListener("click",()=>{if(mediaRecorder?.state==="recording"){mediaRecorder.stop();recordBtn.disabled=false;stopBtn.disabled=true}});playBtn.addEventListener("click",()=>$("#audioPreview").play());
analyzeBtn.addEventListener("click",async()=>{if(!audioUrl)return;$("#profile").textContent="Analyzing…";try{const response=await fetch(audioUrl),blob=await response.blob(),array=await blob.arrayBuffer(),ctx=new AudioContext(),decoded=await ctx.decodeAudioData(array.slice(0)),data=decoded.getChannelData(0);let sum=0;for(const v of data)sum+=v*v;const rms=Math.sqrt(sum/data.length);$("#duration").textContent=decoded.duration.toFixed(1)+" sec";$("#level").textContent=(rms*100).toFixed(1)+"%";$("#profile").textContent=rms>.12?"Strong / expressive":"Soft / intimate";ctx.close()}catch(e){$("#duration").textContent="Captured";$("#level").textContent="Available";$("#profile").textContent="Sample ready"}});
generateBtn.addEventListener("click",()=>{const title=$("#songTitle").value.trim()||"My Voice, My Song",style=$("#style").value,prompt=$("#prompt").value.trim()||"A heartfelt story about love, hope and unforgettable memories.";$("#visualTitle").textContent=title;const result=$("#songResult");result.hidden=false;result.innerHTML="<h3>🎵 Song Blueprint</h3><p><strong>"+escapeHtml(title)+"</strong> • "+escapeHtml(style)+"</p><p>Concept: "+escapeHtml(prompt)+"</p><p>Next engine layer: melody generation → lyrics generation → authorized voice singing → lyric timing → visual music video.</p>";result.scrollIntoView({behavior:"smooth",block:"center"})});
function escapeHtml(s){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}