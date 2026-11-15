(() => {
"use strict";
const $ = id => document.getElementById(id);
const video = $("camera"), photo = $("photo"), placeholder = $("placeholder");
const modelStatus = $("modelStatus"), cameraStatus = $("cameraStatus"), locationStatus = $("locationStatus");
const captureBtn = $("captureBtn"), submitBtn = $("submitBtn"), resultBox = $("result");
const REPORT_URL = "/api/reports";
const MODEL_URL = "./model/best.onnx?v=roadguard-edge-v1";
const RF_CLASSES = ["Alligator Crack","Longitudinal Crack","Normal Road","Open Manhole","Pothole","Transverse Crack"];
const YOLO_CLASSES = ["Longitudinal Crack","Transverse Crack","Alligator Crack","Pothole"];
const IGNORE_CLASSES = new Set([2]);
let contributor, stream = null, gpsWatch = null, coords = {lat:null,lng:null};
let session = null, modelFamily = "unknown", modelPromise = null;
let captured = null, detections = [], busy = false;

try {
  contributor = JSON.parse(sessionStorage.getItem("roadguard_contributor") || "null");
  if (!contributor || !contributor.name || !contributor.phone) throw new Error("Sign-in required");
} catch (_) {
  location.replace("contributor.html");
  return;
}
$("contributorMeta").textContent = "Contributor: " + contributor.name;
function statusResult(message) { resultBox.textContent = message; }
function updateButtons() {
  captureBtn.disabled = !stream || video.readyState < 2 || busy;
  submitBtn.disabled = !captured || !coordsValid() || busy;
}
function coordsValid() {
  return Number.isFinite(coords.lat) && Number.isFinite(coords.lng);
}
function startLocation() {
  if (!navigator.geolocation) {
    locationStatus.textContent = "Location is not supported by this browser.";
    return;
  }
  locationStatus.textContent = "Waiting for GPS permission…";
  gpsWatch = navigator.geolocation.watchPosition(position => {
    coords.lat = position.coords.latitude;
    coords.lng = position.coords.longitude;
    locationStatus.textContent = "Live location connected · accuracy ±" + Math.round(position.coords.accuracy) + " m";
    updateButtons();
  }, error => {
    locationStatus.textContent = error.code === 1
      ? "Location permission denied. Allow location access in browser settings."
      : "Waiting for GPS signal. Enable device location and try outdoors.";
    updateButtons();
  }, {enableHighAccuracy:true, maximumAge:3000, timeout:20000});
}
async function startCamera() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    cameraStatus.textContent = "Camera requires HTTPS and a supported browser.";
    placeholder.textContent = "Camera unavailable";
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"environment"}}});
    video.srcObject = stream;
    await video.play();
    await new Promise((resolve,reject) => {
      if (video.readyState >= 2 && video.videoWidth) return resolve();
      const timer = setTimeout(() => reject(new Error("Camera preview timed out")), 12000);
      video.addEventListener("loadeddata", () => {clearTimeout(timer);resolve();},{once:true});
    });
    placeholder.style.display = "none";
    cameraStatus.textContent = "Live camera connected.";
    updateButtons();
  } catch (error) {
    stream = null;
    cameraStatus.textContent = error.name === "NotAllowedError"
      ? "Camera permission denied. Allow camera access for this site, then reload."
      : error.name === "NotFoundError" ? "No camera was found on this device."
      : "Camera could not start: " + (error.message || error.name);
    placeholder.textContent = "Camera unavailable";
    updateButtons();
  }
}
async function loadModel() {
  if (session) return session;
  if (modelPromise) return modelPromise;
  modelPromise = (async () => {
    if (!window.ort?.InferenceSession) throw new Error("ONNX Runtime did not load.");
    modelStatus.textContent = "Downloading AI model to this device…";
    const response = await fetch(MODEL_URL,{cache:"force-cache"});
    if (!response.ok) throw new Error("Model download failed (HTTP " + response.status + ").");
    const total = Number(response.headers.get("content-length")) || 0;
    const reader = response.body?.getReader();
    let bytes;
    if (reader) {
      const chunks=[]; let received=0;
      while (true) {
        const part=await reader.read(); if(part.done) break;
        chunks.push(part.value); received+=part.value.byteLength;
        modelStatus.textContent = "Downloading AI model… " + (received/1048576).toFixed(1) + (total ? " / "+(total/1048576).toFixed(1)+" MB" : " MB");
      }
      bytes=new Uint8Array(received); let offset=0;
      for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    } else bytes=new Uint8Array(await response.arrayBuffer());
    const header=new TextDecoder().decode(bytes.subarray(0,100));
    if(header.startsWith("version https://git-lfs.github.com/spec/")) throw new Error("Deployment contains a Git LFS pointer, not the ONNX model.");
    if(bytes.byteLength < 1024*1024) throw new Error("Downloaded model is too small to be a valid model.");
    modelStatus.textContent = "Initializing model in device RAM…";
    const created = await ort.InferenceSession.create(bytes,{executionProviders:["wasm"],graphOptimizationLevel:"all"});
    const names=(created.outputNames||[]).map(n=>n.toLowerCase());
    modelFamily=names.some(n=>n.includes("dets")) && names.some(n=>n.includes("labels")) ? "rfdetr" : "yolo";
    session=created;
    modelStatus.textContent="RoadGuard AI ready · running locally on this device";
    return session;
  })();
  try{return await modelPromise;}catch(error){modelPromise=null;modelStatus.textContent="AI model unavailable: "+error.message;throw error;}
}
function sigmoid(x){return 1/(1+Math.exp(-Math.max(-88,Math.min(88,x))));}
function iou(a,b){
 const x1=Math.max(a.x1,b.x1),y1=Math.max(a.y1,b.y1),x2=Math.min(a.x2,b.x2),y2=Math.min(a.y2,b.y2);
 const inter=Math.max(0,x2-x1)*Math.max(0,y2-y1);
 const aa=Math.max(0,a.x2-a.x1)*Math.max(0,a.y2-a.y1),ab=Math.max(0,b.x2-b.x1)*Math.max(0,b.y2-b.y1);
 return inter/Math.max(1e-9,aa+ab-inter);
}
function nms(items){
 const kept=[];
 for(const label of [...new Set(items.map(x=>x.label))]){
  const group=items.filter(x=>x.label===label).sort((a,b)=>b.confidence-a.confidence);
  while(group.length){const best=group.shift();kept.push(best);for(let i=group.length-1;i>=0;i--)if(iou(best,group[i])>.45)group.splice(i,1);}
 }
 return kept.sort((a,b)=>b.confidence-a.confidence).slice(0,100);
}
async function runDetection(image) {
 await loadModel();
 const size=modelFamily==="rfdetr"?576:640;
 const canvas=document.createElement("canvas");canvas.width=size;canvas.height=size;
 const ctx=canvas.getContext("2d",{willReadFrequently:true});ctx.drawImage(image,0,0,size,size);
 const pixels=ctx.getImageData(0,0,size,size).data, area=size*size, input=new Float32Array(3*area);
 if(modelFamily==="rfdetr"){
  const mean=[.485,.456,.406],std=[.229,.224,.225];
  for(let i=0;i<area;i++){input[i]=(pixels[i*4]/255-mean[0])/std[0];input[i+area]=(pixels[i*4+1]/255-mean[1])/std[1];input[i+2*area]=(pixels[i*4+2]/255-mean[2])/std[2];}
 } else {
  for(let i=0;i<area;i++){input[i]=pixels[i*4]/255;input[i+area]=pixels[i*4+1]/255;input[i+2*area]=pixels[i*4+2]/255;}
 }
 const tensor=new ort.Tensor("float32",input,[1,3,size,size]);
 const output=await session.run({[session.inputNames[0]]:tensor});
 if(modelFamily==="rfdetr"){
  const names=session.outputNames,bi=names.findIndex(n=>n.toLowerCase().includes("dets")),li=names.findIndex(n=>n.toLowerCase().includes("labels"));
  if(bi<0||li<0)throw new Error("Expected RF-DETR dets and labels outputs.");
  const boxes=output[names[bi]],logits=output[names[li]],count=boxes.dims[1],slots=logits.dims[2],found=[];
  if(boxes.dims[2]!==4||slots!==RF_CLASSES.length+1)throw new Error("Unexpected RF-DETR output dimensions.");
  for(let row=0;row<count;row++){
   let cls=-1,score=0;
   for(let c=0;c<RF_CLASSES.length;c++){if(IGNORE_CLASSES.has(c))continue;const value=sigmoid(Number(logits.data[row*slots+c]));if(value>score){score=value;cls=c;}}
   if(cls<0||score<.4)continue;
   const off=row*4,cx=Number(boxes.data[off]),cy=Number(boxes.data[off+1]),w=Number(boxes.data[off+2]),h=Number(boxes.data[off+3]);
   if(![cx,cy,w,h].every(Number.isFinite)||w<=0||h<=0)continue;
   const x=Math.max(0,cx-w/2),y=Math.max(0,cy-h/2),right=Math.min(1,cx+w/2),bottom=Math.min(1,cy+h/2);
   if(right<=x||bottom<=y)continue;
   found.push({label:RF_CLASSES[cls],confidence:score,boundingBox:{x,y,width:right-x,height:bottom-y}});
  }
  return found.sort((a,b)=>b.confidence-a.confidence).slice(0,100);
 }
 const t=output[session.outputNames[0]],dims=t.dims,data=t.data;
 const featureCount=YOLO_CLASSES.length+4,withObj=featureCount+1;
 let rows,at;
 if(dims.length===3&&(dims[1]===featureCount||dims[1]===withObj)){rows=dims[2];at=(r,c)=>data[c*rows+r];}
 else if(dims.length===3&&(dims[2]===featureCount||dims[2]===withObj)){rows=dims[1];at=(r,c)=>data[r*dims[2]+c];}
 else throw new Error("Unsupported YOLO output shape: "+dims.join("×"));
 const hasObj=dims[1]===withObj||dims[2]===withObj,offset=hasObj?5:4,candidates=[];
 for(let r=0;r<rows;r++){
  const cx=Number(at(r,0)),cy=Number(at(r,1)),w=Number(at(r,2)),h=Number(at(r,3));
  if(![cx,cy,w,h].every(Number.isFinite)||w<=0||h<=0)continue;
  let cls=0,score=0;for(let c=0;c<YOLO_CLASSES.length;c++){const v=Number(at(r,offset+c));if(v>score){score=v;cls=c;}}
  const confidence=score*(hasObj?Number(at(r,4)):1);if(confidence<.6)continue;
  const scale=Math.max(Math.abs(cx),Math.abs(cy),w,h)<=2?size:1;
  const x=Math.max(0,Math.min(size,(cx-w/2)*scale))/size,y=Math.max(0,Math.min(size,(cy-h/2)*scale))/size;
  const right=Math.max(0,Math.min(size,(cx+w/2)*scale))/size,bottom=Math.max(0,Math.min(size,(cy+h/2)*scale))/size;
  if(right>x&&bottom>y)candidates.push({label:YOLO_CLASSES[cls],confidence,boundingBox:{x,y,width:right-x,height:bottom-y}});
 }
 return nms(candidates);
}
function getLocalKey(){return "roadguard_local_reports_"+String(contributor.phone||contributor.email||contributor.name||"guest").toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,48);}
function saveFailedReport(payload){
 try{localStorage.setItem(getLocalKey(),JSON.stringify([{...payload,saved_at:new Date().toISOString()}]));}catch(_){}
}
async function captureRoad() {
 if(busy||!stream||video.readyState<2)return;
 busy=true;updateButtons();captureBtn.textContent="Capturing and analyzing…";
 try{
  const canvas=document.createElement("canvas"),scale=Math.min(1,1600/Math.max(video.videoWidth,video.videoHeight));
  canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
  canvas.getContext("2d").drawImage(video,0,0,canvas.width,canvas.height);
  captured=canvas.toDataURL("image/jpeg",.82);
  photo.src=captured;photo.style.display="block";video.style.display="none";
  statusResult("Photo captured. Running RoadGuard AI locally on this device…");
  const image=new Image();image.src=captured;
  await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error("Could not read captured image."));});
  detections=await runDetection(image);
  statusResult(detections.length
   ? "AI detected: "+detections.map(d=>d.label+" ("+Math.round(d.confidence*100)+"%)").join(", ")+". Review the photo and submit the report."
   : "AI analysis complete. No confident damage detection; you can still submit this photo for review.");
 }catch(error){detections=[];statusResult("Photo captured, but AI analysis failed: "+error.message+". You may still submit the evidence.");}
 finally{busy=false;captureBtn.textContent="Capture Road Damage";updateButtons();}
}
async function submitReport(){
 if(busy||!captured||!coordsValid())return;
 busy=true;updateButtons();submitBtn.textContent="Submitting…";
 const labels=[...new Set(detections.map(d=>d.label))];
 const severity=detections.length>8?"high":detections.length>3?"medium":"low";
 const payload={
  contributor_name:contributor.name,
  contributor_phone:contributor.phone,
  contributor_email:contributor.email||"",
  contributor_location:contributor.locationText||"",
  location_name:contributor.locationText||"GPS location",
  latitude:coords.lat,longitude:coords.lng,
  severity,
  damage_type:labels.join(", ")||"Road damage (requires review)",
  description:detections.length
   ?"Detected by RoadGuard AI on the contributor device: "+detections.length+" detection(s)."
   :"Road evidence captured by contributor. AI did not return a confident detection; manual review requested.",
  evidence_photos:[{image_base64:captured,detections:detections.map(d=>({label:d.label,confidence:d.confidence,boundingBox:d.boundingBox}))}]
 };
 try{
  const response=await fetch(REPORT_URL,{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify(payload)});
  const raw=await response.text();let result={};try{result=raw?JSON.parse(raw):{};}catch(_){}
  if(!response.ok||!result.success)throw new Error(result.message||raw.slice(0,200)||"HTTP "+response.status);
  try{localStorage.removeItem(getLocalKey());}catch(_){}
  statusResult("Report submitted successfully. Reference: "+(result.data?.id||"received")+". Older unsent local report data has been cleared.");
  captured=null;detections=[];photo.removeAttribute("src");photo.style.display="none";video.style.display="block";
 }catch(error){
  saveFailedReport(payload);
  statusResult("Submission failed: "+error.message+". The latest report is saved on this device; it will remain until a later successful submission.");
 }finally{
  busy=false;submitBtn.textContent="Submit Public Report";updateButtons();
 }
}
captureBtn.addEventListener("click",captureRoad);
submitBtn.addEventListener("click",submitReport);
window.addEventListener("pagehide",()=>{
 if(gpsWatch!==null&&navigator.geolocation)navigator.geolocation.clearWatch(gpsWatch);
 if(stream)stream.getTracks().forEach(track=>track.stop());
});
startLocation();
startCamera();
loadModel().catch(error=>console.error("RoadGuard model startup:",error));
})();
