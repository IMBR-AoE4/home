const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS8-JmKMHKyf9xImMtoN30e_8Yc3KhAeoVcfdSUeC3jkqaofIEPkz-6lCJRf1FohCbQFpKxhaevCndB/pub?output=csv";

const POINTS_MAX = 1000;
const BASE_POINTS_PER_Q = POINTS_MAX / QUIZ_SIZE; // 41.666...

const QUIZ_SIZE = 24;
const TIME_LIMIT_MS = 30000;

const QUOTAS = {
  difficulty: { Easy: 6, Medium: 8, Hard: 6, Elite: 4 },
  type: { MC: 18, TF: 6 },
  area: { Mechanics: 6, Units: 6, Civs: 6, Strategy: 6 },
};

const ASSETS = {
  sfx: {
    wololo: "assets/sfx_wololo.m4a",
    horn: "assets/sfx_horn.m4a",
    victory: "assets/sfx_victory.m4a",
  },
  badges: [
    { min: 0,   key: "bronze",     src: "assets/badge_bronze.svg",     title: "Bronze" },
    { min: 200, key: "silver",     src: "assets/badge_silver.svg",     title: "Silver" },
    { min: 400, key: "gold",       src: "assets/badge_gold.svg",       title: "Gold" },
    { min: 600, key: "platinum",   src: "assets/badge_platinum.svg",   title: "Platinum" },
    { min: 750, key: "diamond",    src: "assets/badge_diamond.svg",    title: "Diamond" },
    { min: 900, key: "conqueror",  src: "assets/badge_conqueror.svg",  title: "Conqueror" },
  ],
};

const el = (id) => document.getElementById(id);


const screenLanding = el("screenLanding");
const screenName = el("screenName");
const screenQuiz = el("screenQuiz");
const screenLoading = el("screenLoading");
const screenResult = el("screenResult");

// UI
const topProgress = el("topProgress");
const timerBar = el("timerBar");
const questionText = el("questionText");
const answersWrap = el("answers");
const btnStart = el("btnStart");
const btnBegin = el("btnBegin");
const btnBackToLanding = el("btnBackToLanding");
const btnSkip = el("btnSkip");
const btnConfirm = el("btnConfirm");
const playerNameInput = el("playerName");

const loadingBar = el("loadingBar");
const resultCard = el("resultCard");
const resultBadge = el("resultBadge");
const resultTitle = el("resultTitle");
const resultScore = el("resultScore");
const resultName = el("resultName");
const btnShare = el("btnShare");
const btnPlayAgain = el("btnPlayAgain");
const btnDownloadImage = el("btnDownloadImage");
const btnCopyText = el("btnCopyText");
const copyStatus = el("copyStatus");

const audio = {
  wololo: new Audio(ASSETS.sfx.wololo),
  horn: new Audio(ASSETS.sfx.horn),
  victory: new Audio(ASSETS.sfx.victory),
};
Object.values(audio).forEach(a => { a.preload = "auto"; a.volume = 0.85; });

let audioUnlocked = false;
async function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  // tentativa de “desbloquear” no mobile
  try {
    for (const a of Object.values(audio)) {
      a.muted = true;
      await a.play();
      a.pause();
      a.currentTime = 0;
      a.muted = false;
    }
  } catch (_) { /* ok */ }
}
function playSfx(key) {
  const a = audio[key];
  if (!a) return;
  try {
    a.currentTime = 0;
    a.play();
  } catch (_) {}
}

let allQuestions = [];
let quizQueue = [];         // array de questões sorteadas (com elapsedCarry etc.)
let currentIndex = 0;
let selectedAnswerCol = null; // 'F','G','H','I'
let questionStartTs = 0;      // performance.now()
let timerRaf = null;
let playerName = "";

// Scoring state
let streak = 0;
let rawPoints = 0;
let maxRawPoints = 0; // máximo teórico do conjunto sorteado
let stats = {
  byDifficulty: { Easy: { correct:0, total:0 }, Medium:{correct:0,total:0}, Hard:{correct:0,total:0}, Elite:{correct:0,total:0} },
  fastWrongMC: { fastWrong:0, totalWrong:0 },
};

function showScreen(screen) {
  [screenLanding, screenName, screenQuiz, screenLoading, screenResult].forEach(s => s.classList.remove("active"));
  screen.classList.add("active");
}

function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

function normalizeToken(s) {
  return String(s ?? "").trim();
}

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(l => l.trim().length > 0);
  if (!lines.length) return [];
  const headerLine = lines[0];
  const delim = headerLine.includes(";") ? ";" : ",";
  const rows = [];
  for (const line of lines) {
    rows.push(parseCSVLine(line, delim));
  }
  return { rows, delim };
}

function parseCSVLine(line, delim) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i+1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && ch === delim) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map(v => v.trim());
}

function mapRowToQuestion(row) {
  const qid = normalizeToken(row[0]);
  const value = Number(String(row[1] ?? "").replace(",", ".")) || 0;
  const type = normalizeToken(row[2]).toUpperCase(); // MC / TF
  const answer = normalizeToken(row[3]).toUpperCase(); // F/G/H/I
  const quest = normalizeToken(row[4]);
  const r1 = row[5] ?? "";
  const r2 = row[6] ?? "";
  const r3 = row[7] ?? "";
  const r4 = row[8] ?? "";
  const area = normalizeToken(row[9]) || "Unknown";
  const difficulty = normalizeToken(row[10]) || "Medium";

  if (!qid || qid.toLowerCase() === "questid") return null;
  if (!quest) return null;
  if (!["MC","TF"].includes(type)) return null;
  if (!["F","G","H","I"].includes(answer)) return null;

  const options = [
    { col: "F", text: String(r1 || "").trim() },
    { col: "G", text: String(r2 || "").trim() },
    { col: "H", text: String(r3 || "").trim() },
    { col: "I", text: String(r4 || "").trim() },
  ];

  // TF: só F e G
  const cleanOptions = type === "TF" ? options.slice(0,2) : options;

  return {
    id: qid,
    value,
    type,
    answerCol: answer,
    text: quest,
    options: cleanOptions,
    area,
    difficulty,
    elapsedCarryMs: 0,
    answered: false,
  };
}

async function loadQuestions() {
  const resp = await fetch(CSV_URL, { cache: "no-store" });
  if (!resp.ok) throw new Error("Falha ao carregar CSV.");
  const text = await resp.text();
  const parsed = parseCSV(text);
  const rows = parsed.rows;

  const questions = [];
  for (let i = 1; i < rows.length; i++) {
    const q = mapRowToQuestion(rows[i]);
    if (q) questions.push(q);
  }
  return questions;
}

function buildQuizSet(all) {
  const canon = (s) => {
    const t = String(s||"").trim();
    const map = {
      mechanics:"Mechanics", units:"Units", civs:"Civs", strategy:"Strategy",
      easy:"Easy", medium:"Medium", hard:"Hard", elite:"Elite",
    };
    const key = t.toLowerCase();
    return map[key] || t;
  };

  const pool = all.map(q => ({
    ...q,
    area: canon(q.area),
    difficulty: canon(q.difficulty),
    type: q.type.toUpperCase(),
  }));

  const byBucket = new Map();
  const keyOf = (area, diff, type) => `${area}||${diff}||${type}`;
  for (const q of pool) {
    const k = keyOf(q.area, q.difficulty, q.type);
    if (!byBucket.has(k)) byBucket.set(k, []);
    byBucket.get(k).push(q);
  }
  for (const arr of byBucket.values()) shuffleInPlace(arr);

  const picked = [];
  const usedIds = new Set();

  const targetByDiff = { ...QUOTAS.difficulty };
  const targetByArea = { ...QUOTAS.area };
  const targetByType = { ...QUOTAS.type };

  const diffOrder = ["Elite","Hard","Medium","Easy"];

  function pickOne(area, diff) {
    const typePref = (targetByType.MC >= targetByType.TF) ? ["MC","TF"] : ["TF","MC"];
    for (const t of typePref) {
      const k = keyOf(area, diff, t);
      const bucket = byBucket.get(k) || [];
      while (bucket.length) {
        const q = bucket.pop();
        if (usedIds.has(q.id)) continue;
        usedIds.add(q.id);
        picked.push(structuredCloneQuestion(q));
        targetByType[t] = Math.max(0, targetByType[t] - 1);
        return true;
      }
    }
    // relaxa type (pega qualquer)
    for (const t of ["MC","TF"]) {
      const k = keyOf(area, diff, t);
      const bucket = byBucket.get(k) || [];
      while (bucket.length) {
        const q = bucket.pop();
        if (usedIds.has(q.id)) continue;
        usedIds.add(q.id);
        picked.push(structuredCloneQuestion(q));

        return true;
      }
    }
    return false;
  }

  for (const diff of diffOrder) {
    while (targetByDiff[diff] > 0) {
      const areasNeeding = Object.keys(targetByArea).filter(a => targetByArea[a] > 0);
      if (!areasNeeding.length) break;
      const area = areasNeeding[Math.floor(Math.random() * areasNeeding.length)];
      const ok = pickOne(area, diff);
      if (!ok) {
        let found = false;
        for (const a of areasNeeding) {
          if (pickOne(a, diff)) { found = true; break; }
        }
        if (!found) break; // sem estoque
      }
      targetByDiff[diff]--;
      targetByArea[area]--;
    }
  }

  if (picked.length < QUIZ_SIZE) {
    const remaining = pool.filter(q => !usedIds.has(q.id));
    shuffleInPlace(remaining);
    while (picked.length < QUIZ_SIZE && remaining.length) {
      const q = remaining.pop();
      picked.push(structuredCloneQuestion(q));
    }
  }

  // Ajuste final de types (pra tentar manter 18/6) — opcional, não crítico
  // Embaralha o set final
  shuffleInPlace(picked);

  // Calcula MaxRaw do set (streak perfeito + timeFactor=1)
  maxRawPoints = computeMaxRaw(picked);

  return picked.slice(0, QUIZ_SIZE);
}

function structuredCloneQuestion(q) {
  return {
    id: q.id,
    value: q.value,
    type: q.type,
    answerCol: q.answerCol,
    text: q.text,
    options: q.options.map(o => ({...o})),
    area: q.area,
    difficulty: q.difficulty,
    elapsedCarryMs: 0,
    answered: false,
  };
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function computeMaxRaw(set) {
  // máximo teórico: acertar todas com timeFactor=1 e sem anti-chute
  // se tiver streak, consideramos o máximo com streak para normalizar corretamente
  let s = 0;
  let max = 0;

  for (let i = 0; i < set.length; i++) {
    s += 1;
    const streakMult = Math.min(1.20, 1 + 0.03 * s); // bônus mais leve
    max += BASE_POINTS_PER_Q * 1.0 * streakMult;
  }
  return max || 1;
}


// timeFactor do jeito que você pediu
function timeFactorFromElapsed(elapsedMs) {
  const t = elapsedMs / 1000;
  if (t <= 7) return 1.0;
  if (t < 25) {
    return 1.0 - ((t - 7) / 18) * 0.8; // 1.0 -> 0.2
  }
  if (t < 30) return 0.2;
  return 0.0; // timeout
}

function updateTopProgress() {
  // sem números; só progresso discreto
  const done = currentIndex; // questões já finalizadas
  const pct = clamp((done / QUIZ_SIZE) * 100, 0, 100);
  topProgress.style.width = `${pct}%`;
}

function renderQuestion() {
  selectedAnswerCol = null;
  btnConfirm.disabled = true;

  const q = quizQueue[currentIndex];
  if (!q) return;

  // Texto
  questionText.textContent = q.text;

  // Respostas
  answersWrap.innerHTML = "";
  for (const opt of q.options) {
    const b = document.createElement("button");
    b.className = "answer-btn";
    b.type = "button";
    b.textContent = opt.text;
    b.dataset.col = opt.col;
    b.addEventListener("click", () => {
      // select
      answersWrap.querySelectorAll(".answer-btn").forEach(x => x.classList.remove("selected"));
      b.classList.add("selected");
      selectedAnswerCol = opt.col;
      btnConfirm.disabled = false;
    });
    answersWrap.appendChild(b);
  }

  // Timer start
  questionStartTs = performance.now();
  startTimerLoop();
}

function startTimerLoop() {
  cancelAnimationFrame(timerRaf);
  const q = quizQueue[currentIndex];
  const carry = q.elapsedCarryMs || 0;

  const tick = () => {
    const now = performance.now();
    const elapsed = (now - questionStartTs) + carry;
    const remaining = Math.max(0, TIME_LIMIT_MS - elapsed);
    const ratio = remaining / TIME_LIMIT_MS;
    timerBar.style.width = `${clamp(ratio * 100, 0, 100)}%`;

    if (elapsed >= TIME_LIMIT_MS) {
      // timeout -> auto-avança como erro/sem resposta
      handleAnswer(null, true);
      return;
    }
    timerRaf = requestAnimationFrame(tick);
  };
  timerRaf = requestAnimationFrame(tick);
}

function stopTimerLoop() {
  cancelAnimationFrame(timerRaf);
  timerRaf = null;
}

// PULAR: joga questão pro fim mantendo tempo consumido
function skipQuestion() {
  const q = quizQueue[currentIndex];
  const elapsedNow = (performance.now() - questionStartTs);
  q.elapsedCarryMs = (q.elapsedCarryMs || 0) + elapsedNow;

  stopTimerLoop();

  // remove do índice atual e empurra pro fim
  quizQueue.splice(currentIndex, 1);
  quizQueue.push(q);

  // não incrementa currentIndex (pois o próximo agora ocupa esse índice)
  renderQuestion();
}

// Confirma resposta (avança)
function confirmAnswer() {
  if (!selectedAnswerCol) return;
  handleAnswer(selectedAnswerCol, false);
}

function handleAnswer(chosenCol, isTimeout) {
  const q = quizQueue[currentIndex];
  const elapsedNow = (performance.now() - questionStartTs);
  const totalElapsed = (q.elapsedCarryMs || 0) + elapsedNow;

  stopTimerLoop();

  const correct = (!isTimeout && chosenCol && chosenCol === q.answerCol);
  const tFactor = correct ? timeFactorFromElapsed(totalElapsed) : 0;

  // stats difficulty
  const diff = (q.difficulty || "Medium");
  if (stats.byDifficulty[diff]) {
    stats.byDifficulty[diff].total += 1;
    if (correct) stats.byDifficulty[diff].correct += 1;
  }

  // fast-wrong MC
  if (!correct && q.type === "MC") {
    stats.fastWrongMC.totalWrong += 1;
    if (totalElapsed <= 3000) stats.fastWrongMC.fastWrong += 1;
  }

  // scoring raw
  if (correct) {
    streak += 1;
    const streakMult = Math.min(1.25, 1 + 0.05 * streak);
   const gained = BASE_POINTS_PER_Q * tFactor * streakMult;
   rawPoints += gained;
  } else {
    streak = 0;
  }

  // Avança
  q.answered = true;

// toca a trombeta só quando responder a última pergunta (não em timeout)
const isLast = (currentIndex === QUIZ_SIZE - 1);
if (!isTimeout && isLast) playSfx("horn");


  currentIndex += 1;
  updateTopProgress();

  if (currentIndex >= QUIZ_SIZE) {
    finishQuiz();
  } else {
    renderQuestion();
  }
}

function computeAntiGuessFactors() {
  const acc = (d) => {
    const o = stats.byDifficulty[d];
    if (!o || o.total === 0) return 0;
    return o.correct / o.total;
  };
  const accEasy = acc("Easy");
  const accHard = acc("Hard");
  const accElite = acc("Elite");

  let consistency = 1.0;
  if (accEasy < 0.50) consistency -= 0.10;
  if ((accHard - accEasy) >= 0.35) consistency -= 0.15;
  if ((accElite - accEasy) >= 0.35) consistency -= 0.20;
  consistency = clamp(consistency, 0.60, 1.00);

  let guess = 1.0;
  const totalWrong = stats.fastWrongMC.totalWrong || 0;
  const fastWrong = stats.fastWrongMC.fastWrong || 0;
  const fastWrongRate = totalWrong ? (fastWrong / totalWrong) : 0;

  if (fastWrongRate >= 0.40) guess -= 0.10;
  if (fastWrongRate >= 0.55) guess -= 0.10;
  guess = clamp(guess, 0.70, 1.00);

  return { consistency, guess };
}

function finishQuiz() {
  showScreen(screenLoading);
  // loading 10s com barra
  const duration = 10000;
  const start = performance.now();
  loadingBar.style.width = "0%";

  const step = () => {
    const now = performance.now();
    const p = clamp((now - start) / duration, 0, 1);
    loadingBar.style.width = `${(p * 100).toFixed(1)}%`;
    if (p < 1) requestAnimationFrame(step);
    else showResult();
  };
  requestAnimationFrame(step);
}

function pickBadge(score) {
  let chosen = ASSETS.badges[0];
  for (const b of ASSETS.badges) {
    if (score >= b.min) chosen = b;
  }
  return chosen;
}

function showResult() {
  let score = Math.round(1000 * (rawPoints / (maxRawPoints || 1)));
  score = clamp(score, 0, 1000);

   const finalScore = score;

  const badge = pickBadge(finalScore);
   resultTitle.textContent = badge.title;
   resultBadge.style.display = "none";
   resultBadge.removeAttribute("src");

   if (badge?.src) {
     resultBadge.src = badge.src;
     resultBadge.style.display = "block";
     resultBadge.onerror = () => { resultBadge.style.display = "none"; };
   }

  resultScore.textContent = String(finalScore);
  resultName.textContent = playerName || "—";

  updateTopProgress();
  topProgress.style.width = "100%";

  showScreen(screenResult);
  playSfx("victory");

  copyStatus.textContent = "";
  btnDownloadImage.style.display = "none";
}

async function makeResultImageBlob() {

  const canvas = await html2canvas(resultCard, {
    backgroundColor: null,
    scale: Math.min(2, window.devicePixelRatio || 1.5),
    useCORS: true,
  });
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png", 0.92);
  });
}

function buildShareText(score) {
  const url = window.location.href;
  return `Fiz ${score} pontos no AoE4 Knowledge Challenge! 🔥 Consegue bater?\nJoga aqui: ${url}`;
}

async function shareResult() {
  const score = resultScore.textContent || "0";
  const url = window.location.href;
  const text = buildShareText(score);

  try {
    await navigator.clipboard.writeText(text);
    copyStatus.textContent = "Texto + link copiados! Cole no WhatsApp após enviar a imagem.";
  } catch {
    copyStatus.textContent = "Não consegui copiar automaticamente. Use o botão COPIAR TEXTO + LINK.";
  }

  let blob = null;
  try {
    blob = await makeResultImageBlob();
  } catch (e) {
    blob = null;
  }

  if (navigator.share) {
    try {
      if (blob) {
        const file = new File([blob], "resultado.png", { type: "image/png" });

        const shareDataFileOnly = { files: [file] };
        if (!navigator.canShare || navigator.canShare(shareDataFileOnly)) {
          await navigator.share(shareDataFileOnly);
          return;
        }
      }

      await navigator.share({ title: "IMBR AoE4 QUIZZ", text, url });
      return;

    } catch (_) {

    }
  }


  if (blob) {
    btnDownloadImage.style.display = "block";
    btnDownloadImage.onclick = () => downloadBlob(blob, "resultado.png");
  } else {
    btnDownloadImage.style.display = "none";
  }


  const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(waUrl, "_blank");

  copyStatus.textContent = "Abrimos o WhatsApp com o texto. Se a imagem não foi junto, use BAIXAR IMAGEM e envie separadamente.";
}


function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function resetGameState() {
  quizQueue = [];
  currentIndex = 0;
  selectedAnswerCol = null;
  streak = 0;
  rawPoints = 0;
  maxRawPoints = 1;
  stats = {
    byDifficulty: { Easy: { correct:0, total:0 }, Medium:{correct:0,total:0}, Hard:{correct:0,total:0}, Elite:{correct:0,total:0} },
    fastWrongMC: { fastWrong:0, totalWrong:0 },
  };
  timerBar.style.width = "100%";
  topProgress.style.width = "0%";
}

async function startQuizFlow() {
  resetGameState();
  showScreen(screenQuiz);

  quizQueue = buildQuizSet(allQuestions);
  currentIndex = 0;
  updateTopProgress();

  playSfx("wololo");
  renderQuestion();
}

btnStart.addEventListener("click", async () => {
  await unlockAudio();
  showScreen(screenName);
  playerNameInput.focus();
});

btnBackToLanding.addEventListener("click", async () => {
  await unlockAudio();
  showScreen(screenLanding);
});

btnBegin.addEventListener("click", async () => {
  await unlockAudio();
  playerName = playerNameInput.value.trim();
  if (!playerName) playerName = "Player";
  await startQuizFlow();
});

btnSkip.addEventListener("click", async () => {
  await unlockAudio();
  skipQuestion();
});

btnConfirm.addEventListener("click", async () => {
  await unlockAudio();
  confirmAnswer();
});

btnPlayAgain.addEventListener("click", async () => {
  await unlockAudio();
  showScreen(screenName);
  playerNameInput.focus();
});

btnShare.addEventListener("click", async () => {
  await unlockAudio();
  await shareResult();
});

btnDownloadImage.addEventListener("click", async () => {
  await unlockAudio();
});

btnCopyText.addEventListener("click", async () => {
  await unlockAudio();
});

(async function init() {
  showScreen(screenLanding);
  topProgress.style.width = "0%";

  try {
    allQuestions = await loadQuestions();
    if (!allQuestions.length) {
      questionText.textContent = "Não encontrei perguntas na planilha.";
    }
  } catch (e) {
    console.error(e);
    const p = document.createElement("p");
    p.className = "subtitle";
    p.textContent = "Não consegui carregar a planilha agora. Verifique se ela está publicada e acessível.";
    screenLanding.querySelector(".hero").appendChild(p);
  }
})();
