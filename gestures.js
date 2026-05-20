const UMBRAL_FRAMES = 5;

function dist(p1, p2) {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}
function distXY(x1, y1, x2, y2) {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}
function vis(lm, idx, min = 0.5) {
  return (lm[idx].visibility ?? 1) >= min;
}
function palmaAbierta(hand, minDedos = 3) {
  if (!hand) return false;
  return [[8,6],[12,10],[16,14],[20,18]].filter(([p,b]) => hand[p].y < hand[b].y).length >= minDedos;
}
function dedosAbiertos(hand) {
  if (!hand) return 0;
  return [[8,6],[12,10],[16,14],[20,18]].filter(([p,b]) => hand[p].y < hand[b].y).length;
}
function manoCercaCara(hand, nose, umbral = 0.25) {
  if (!hand) return false;
  return dist(hand[0], nose) < umbral || dist(hand[9], nose) < umbral;
}

// ── Gesto 1: Cristiano ───────────────────────────────────────────────────────
function esCristiano(poseLm, hand, faceLm) {
  if (!hand || !poseLm) return false;
  if (!(hand[8].y < hand[6].y)) return false;
  if (hand[12].y < hand[10].y || hand[16].y < hand[14].y) return false;
  let bocaCx, bocaCy;
  if (faceLm) {
    bocaCx = (faceLm[13].x + faceLm[14].x) / 2;
    bocaCy = (faceLm[13].y + faceLm[14].y) / 2;
  } else {
    bocaCx = (poseLm[9].x + poseLm[10].x) / 2;
    bocaCy = (poseLm[9].y + poseLm[10].y) / 2;
  }
  return distXY(hand[8].x, hand[8].y, bocaCx, bocaCy) < 0.15;
}

// ── Gesto 2: Dog judging ─────────────────────────────────────────────────────
function esDogJudging(poseLm) {
  if (!poseLm) return false;
  if (!vis(poseLm, 7) || !vis(poseLm, 8)) return false;
  return Math.abs(poseLm[7].y - poseLm[8].y) > 0.06;
}

// ── Gesto 3: Winking kitty ───────────────────────────────────────────────────
const OJO_DER = [33, 160, 158, 133, 153, 144];
const OJO_IZQ = [362, 387, 385, 263, 380, 373];

function ear(lm, pts) {
  const A = dist(lm[pts[1]], lm[pts[5]]);
  const B = dist(lm[pts[2]], lm[pts[4]]);
  const C = dist(lm[pts[0]], lm[pts[3]]);
  return C > 0 ? (A + B) / (2 * C) : 0;
}

function esWinkingKitty(faceLm) {
  if (!faceLm) return false;
  const ed = ear(faceLm, OJO_DER);
  const ei = ear(faceLm, OJO_IZQ);
  return (ed < 0.15 && ei > 0.25) || (ei < 0.15 && ed > 0.25);
}

// ── Gesto 4: Brindando ───────────────────────────────────────────────────────
function esBrindando(poseLm, leftHand, rightHand) {
  if (!poseLm) return false;
  const nose = poseLm[0];
  if (manoCercaCara(leftHand, nose, 0.22) || manoCercaCara(rightHand, nose, 0.22)) return false;

  let brazoOk = false;
  for (const [wIdx, eIdx] of [[15,13],[16,14]]) {
    const wrist = poseLm[wIdx], elbow = poseLm[eIdx];
    if (wrist.y < nose.y && dist(wrist, nose) > 0.22 && vis(poseLm, wIdx) && elbow.y > wrist.y) {
      brazoOk = true; break;
    }
  }
  if (!brazoOk) return false;
  return [leftHand, rightHand].some(h => h && dedosAbiertos(h) <= 2);
}

// ── Gesto 5: TikTok gato ─────────────────────────────────────────────────────
function esTiktokGato(poseLm, leftHand, rightHand) {
  if (!poseLm) return false;
  const nose = poseLm[0];
  const hands = [leftHand, rightHand].filter(Boolean);
  const abiertaAlLado = h => palmaAbierta(h) && Math.abs(h[0].x - nose.x) > 0.12;

  if (hands.length >= 2) {
    const [h1, h2] = hands;
    const t1 = manoCercaCara(h1, nose, 0.22), t2 = manoCercaCara(h2, nose, 0.22);
    return (t1 && abiertaAlLado(h2)) || (t2 && abiertaAlLado(h1));
  }
  if (hands.length === 1 && manoCercaCara(hands[0], nose, 0.25)) {
    for (const wIdx of [15, 16]) {
      const w = poseLm[wIdx];
      if (vis(poseLm, wIdx) && dist(w, nose) > 0.20 && Math.abs(w.x - nose.x) > 0.15) return true;
    }
  }
  return false;
}

// ── Gesto 6: Lentes de sol ───────────────────────────────────────────────────
function esLentesSol(faceLm, offCtx, vw, vh) {
  if (!faceLm || !offCtx) return false;
  const lm = faceLm;
  const x1 = Math.max(0, Math.floor(Math.min(lm[33].x, lm[263].x) * vw) - 15);
  const x2 = Math.min(vw, Math.ceil(Math.max(lm[33].x, lm[263].x) * vw) + 15);
  const y1 = Math.max(0, Math.floor(Math.min(lm[105].y, lm[334].y) * vh) - 5);
  const y2 = Math.min(vh, Math.ceil(Math.max(lm[145].y, lm[374].y) * vh) + 15);
  if (x2 <= x1 || y2 <= y1) return false;

  const eyePx = offCtx.getImageData(x1, y1, x2 - x1, y2 - y1).data;
  let eyeSum = 0, darkCount = 0;
  for (let i = 0; i < eyePx.length; i += 4) {
    const g = 0.299 * eyePx[i] + 0.587 * eyePx[i+1] + 0.114 * eyePx[i+2];
    eyeSum += g;
    if (g < 60) darkCount++;
  }
  const nPx = eyePx.length / 4;
  const eyeMean = eyeSum / nPx;
  const darkFrac = darkCount / nPx;

  const sy1 = Math.floor(lm[4].y * vh) + 5;
  const sy2 = Math.min(vh, Math.floor(lm[152].y * vh));
  if (sy2 - sy1 < 8) return darkFrac > 0.55 && eyeMean < 65;

  const skinPx = offCtx.getImageData(x1, sy1, x2 - x1, sy2 - sy1).data;
  let skinSum = 0;
  for (let i = 0; i < skinPx.length; i += 4)
    skinSum += 0.299 * skinPx[i] + 0.587 * skinPx[i+1] + 0.114 * skinPx[i+2];
  const skinMean = skinSum / (skinPx.length / 4);

  const ratio = skinMean > 20 ? eyeMean / skinMean : 1;
  return ratio < 0.85 && darkFrac > 0.55;
}

// ── Gestos 7/8: Maradona V y Doble V ─────────────────────────────────────────
function esSeñalV(hand) {
  if (!hand) return false;
  return hand[8].y < hand[6].y && hand[12].y < hand[10].y &&
         hand[16].y >= hand[14].y && hand[20].y >= hand[18].y;
}
function esMaradonaV(l, r)      { return esSeñalV(l) !== esSeñalV(r); }
function esMaradonaDobleV(l, r) { return esSeñalV(l) && esSeñalV(r); }

// ── Debug ─────────────────────────────────────────────────────────────────────
function debugGestos(poseLm, leftHand, rightHand, faceLm, contadores) {
  const lines = [];
  for (const [nombre, hand] of [['izq', leftHand], ['der', rightHand]]) {
    if (!hand) { lines.push(`mano ${nombre}: --`); continue; }
    const nose = poseLm ? poseLm[0] : null;
    const d = nose ? Math.min(dist(hand[0], nose), dist(hand[9], nose)) : 0;
    lines.push(`mano ${nombre}: dist=${d.toFixed(2)} dedos=${dedosAbiertos(hand)}/4`);
  }
  if (poseLm) {
    const nose = poseLm[0];
    const wyI = (poseLm[15].y - nose.y).toFixed(2);
    const wyD = (poseLm[16].y - nose.y).toFixed(2);
    const ed = (vis(poseLm,7)&&vis(poseLm,8)) ? Math.abs(poseLm[7].y-poseLm[8].y).toFixed(2) : '0.00';
    lines.push(`wrist dy: izq=${wyI} der=${wyD}  ear_diff=${ed}`);
  }
  if (faceLm) {
    const ed = ear(faceLm, OJO_DER).toFixed(2);
    const ei = ear(faceLm, OJO_IZQ).toFixed(2);
    lines.push(`EAR der=${ed} izq=${ei}`);
  }
  const cnt = Object.entries(contadores).map(([g,v]) => `${g[0]}:${v}`).join(' ');
  lines.push(`cnt: ${cnt}`);
  return lines;
}

// ── Detector principal ────────────────────────────────────────────────────────
class DetectorGestos {
  constructor() {
    this._gestos = ['cristiano','perro','gato','tiktok','brindis','lentes','maradona_v','maradona_doble_v'];
    this._cnt = Object.fromEntries(this._gestos.map(g => [g, 0]));
    this.activo = null;
  }

  procesar(poseLm, leftHand, rightHand, faceLm, offCtx, vw, vh) {
    const any = rightHand || leftHand;
    const detected = {
      cristiano:       esCristiano(poseLm, any, faceLm),
      perro:           esDogJudging(poseLm),
      gato:            esWinkingKitty(faceLm),
      tiktok:          esTiktokGato(poseLm, leftHand, rightHand),
      brindis:         esBrindando(poseLm, leftHand, rightHand),
      lentes:          esLentesSol(faceLm, offCtx, vw, vh),
      maradona_v:      esMaradonaV(leftHand, rightHand),
      maradona_doble_v: esMaradonaDobleV(leftHand, rightHand),
    };
    for (const [g, det] of Object.entries(detected)) {
      this._cnt[g] = det
        ? Math.min(this._cnt[g] + 1, UMBRAL_FRAMES + 2)
        : Math.max(this._cnt[g] - 2, 0);
    }
    const conf = Object.entries(this._cnt).filter(([,v]) => v >= UMBRAL_FRAMES);
    this.activo = conf.length ? conf.reduce((a,b) => a[1]>b[1]?a:b)[0] : null;
    return this.activo;
  }

  get contadores() { return this._cnt; }
}
