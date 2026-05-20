const IMAGENES = {
  cristiano:       'images/cristiano_beboteando.jpeg',
  perro:           'images/dog_judging.jpg',
  gato:            'images/winking_kitty.jpeg',
  lentes:          'images/cristina_lentes_sol.jpg',
  maradona_v:      'images/maradona_V.jpg',
  maradona_doble_v:'images/maradona_dobleV.jpg',
};
const VIDEOS = {
  tiktok:  'gato.mp4',
  brindis: 'kiti_brindando.mp4',
};
const NOMBRES = {
  cristiano:       'Cristiano beboteando',
  perro:           'Dog judging u_u',
  gato:            'Winking kitty!!!',
  tiktok:          'Gato TikTok !!!',
  brindis:         'Kiti brindando !!!',
  lentes:          'Cristina con lentes !!!',
  maradona_v:      'Maradona campeon !!!',
  maradona_doble_v:'Maradona doble campeon !!!',
};

// ── Preload assets ────────────────────────────────────────────────────────────
const imgElements = {};
for (const [k, src] of Object.entries(IMAGENES)) {
  const img = new Image();
  img.src = src;
  imgElements[k] = img;
}

const videoElements = {};
for (const [k, src] of Object.entries(VIDEOS)) {
  const v = document.createElement('video');
  v.src = src;
  v.loop = true;
  v.muted = true;
  v.preload = 'auto';
  videoElements[k] = v;
}

// ── Canvas setup ──────────────────────────────────────────────────────────────
const camCanvas  = document.getElementById('cam-canvas');
const camCtx     = camCanvas.getContext('2d');
const panelCanvas = document.getElementById('panel-canvas');
const panelCtx   = panelCanvas.getContext('2d');

// Offscreen canvas for pixel analysis (sunglasses detection)
const offCanvas = document.createElement('canvas');
const offCtx    = offCanvas.getContext('2d', { willReadFrequently: true });

const videoEl   = document.getElementById('input-video');
const labelEl   = document.getElementById('gesture-label');
const debugEl   = document.getElementById('debug-overlay');

const detector  = new DetectorGestos();

let poseLm = null, leftHand = null, rightHand = null, faceLm = null;
let activeVideoKey = null;
let videoStartTime = 0;

// ── MediaPipe Holistic ────────────────────────────────────────────────────────
const holistic = new Holistic({
  locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${f}`
});

holistic.setOptions({
  modelComplexity: 1,
  smoothLandmarks: true,
  enableSegmentation: false,
  smoothSegmentation: false,
  refineFaceLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
});

holistic.onResults(onResults);

// ── Camera ────────────────────────────────────────────────────────────────────
const camera = new Camera(videoEl, {
  onFrame: async () => { await holistic.send({ image: videoEl }); },
  width: 640,
  height: 480,
});
const loadingEl   = document.getElementById('loading');
const stepModels  = document.getElementById('step-models');
const stepCamera  = document.getElementById('step-camera');
const stepReady   = document.getElementById('step-ready');

function setStep(el, state) {
  // state: 'active' | 'done'
  const icons = { active: '▶', done: '✓' };
  el.className = state;
  el.textContent = el.textContent.replace(/^./, icons[state]);
}

setStep(stepModels, 'active');

camera.start().then(() => {
  setStep(stepModels, 'done');
  setStep(stepCamera, 'active');
});

// ── Results callback ──────────────────────────────────────────────────────────
function onResults(results) {
  const vw = videoEl.videoWidth  || 640;
  const vh = videoEl.videoHeight || 480;

  const mobile = window.innerWidth <= 768 || window.innerHeight > window.innerWidth;

  camCanvas.width   = vw;
  camCanvas.height  = vh;
  // Mobile: panel debajo de la cámara, ancho completo, altura proporcional
  // Desktop: panel al costado, 42% del ancho de la cámara
  panelCanvas.width  = mobile ? vw : Math.floor(vw * 0.42);
  panelCanvas.height = mobile ? Math.round(vw * 0.60) : vh;
  offCanvas.width   = vw;
  offCanvas.height  = vh;

  // Mirror the camera feed
  camCtx.save();
  camCtx.scale(-1, 1);
  camCtx.drawImage(results.image, -vw, 0, vw, vh);
  camCtx.restore();

  // Draw mirrored frame to offscreen canvas for pixel analysis
  offCtx.save();
  offCtx.scale(-1, 1);
  offCtx.drawImage(results.image, -vw, 0, vw, vh);
  offCtx.restore();

  // Extract landmarks
  poseLm    = results.poseLandmarks    || null;
  faceLm    = results.faceLandmarks    || null;

  // Holistic gives left/right from person's perspective.
  // Mirror compensation: swap so "leftHand" = hand on left side of mirrored image.
  leftHand  = results.rightHandLandmarks || null;
  rightHand = results.leftHandLandmarks  || null;

  // Mirror hand x-coords to match the flipped canvas
  [leftHand, rightHand].forEach(hand => {
    if (hand) hand.forEach(lm => { lm.x = 1 - lm.x; });
  });
  if (poseLm) poseLm.forEach(lm => { lm.x = 1 - lm.x; });
  if (faceLm) faceLm.forEach(lm => { lm.x = 1 - lm.x; });

  if (loadingEl.style.display !== 'none') {
    setStep(stepCamera, 'done');
    setStep(stepReady, 'active');
    setTimeout(() => { loadingEl.style.display = 'none'; }, 600);
  }

  const gesto = detector.procesar(poseLm, leftHand, rightHand, faceLm, offCtx, vw, vh);

  renderPanel(gesto, vw, vh);
  renderLabel(gesto);
  renderDebug(gesto);
}

// ── Panel rendering ───────────────────────────────────────────────────────────
function renderPanel(gesto, vw, vh) {
  const pw = panelCanvas.width;
  const ph = panelCanvas.height;
  panelCtx.fillStyle = '#000';
  panelCtx.fillRect(0, 0, pw, ph);

  if (gesto && VIDEOS[gesto]) {
    const vid = videoElements[gesto];
    if (gesto !== activeVideoKey) {
      if (activeVideoKey && videoElements[activeVideoKey]) videoElements[activeVideoKey].pause();
      vid.currentTime = 0;
      vid.play().catch(() => {});
      activeVideoKey = gesto;
      videoStartTime = performance.now();
    }
    if (vid.readyState >= 2) {
      panelCtx.drawImage(vid, 0, 0, pw, ph);
    }
  } else {
    if (activeVideoKey) {
      videoElements[activeVideoKey]?.pause();
      activeVideoKey = null;
    }
    if (gesto && imgElements[gesto]?.complete) {
      panelCtx.drawImage(imgElements[gesto], 0, 0, pw, ph);
    }
  }
}

// ── Overlay rendering ─────────────────────────────────────────────────────────
function renderLabel(gesto) {
  if (gesto) {
    labelEl.textContent = NOMBRES[gesto] || gesto;
    labelEl.style.display = 'block';
  } else {
    labelEl.style.display = 'none';
  }
}

function renderDebug(gesto) {
  if (gesto) { debugEl.style.display = 'none'; return; }
  debugEl.style.display = 'block';
  const lines = debugGestos(poseLm, leftHand, rightHand, faceLm, detector.contadores);
  debugEl.innerHTML = lines.map(l => `<span>${l}</span>`).join('<br>');
}
