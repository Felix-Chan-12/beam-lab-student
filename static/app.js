const offlineRuntime = window.BEAM_OFFLINE || null;
const offlineMode = Boolean(offlineRuntime);
const offlineConfig = window.BEAM_OFFLINE_CONFIG || {};
const role = offlineMode
  ? offlineRuntime.role
  : location.pathname.startsWith("/teacher") ? "teacher" : "student";
const searchParams = new URLSearchParams(location.search);
const teacherToken = searchParams.get("token") || "";
const studentKey = searchParams.get("key") || "";
const isPreview = role === "student" && searchParams.get("preview") === "1";
const isSelfGuidedStudent = offlineMode && role === "student" && !isPreview && offlineRuntime.selfGuided === true;
const layoutTeacherToken = searchParams.get("teacher_token") || "";
const layoutMode = isPreview && (
  searchParams.get("layout") === "1"
  || (searchParams.get("edit") === "1" && (offlineMode || Boolean(layoutTeacherToken)))
);
const layoutStage = Number(searchParams.get("layout_stage") || 2);
const layoutStep = Number(searchParams.get("layout_step") || 0);
const layoutToolsEnabled = role === "teacher" && searchParams.get("edit") === "1";
document.body.classList.add(`${role}-page`);
if (isPreview) document.body.classList.add("preview-page");
if (layoutMode) document.body.classList.add("layout-mode");
if (isSelfGuidedStudent) document.body.classList.add("self-guided-page");
const app = document.querySelector("#app");
const brandLink = document.querySelector("#brandLink");
const sessionPill = document.querySelector("#sessionPill");
const toast = document.querySelector("#toast");
const clientId = localStorage.getItem("beam-client-id") || crypto.randomUUID?.() || `offline-${Date.now()}`;
localStorage.setItem("beam-client-id", clientId);
brandLink.href = location.href;

const stageLabels = ["等待", "先行研判 E", "受力数验 A₁", "协调释理 A₂"];
const forceStepHeadings = [
  "先看原结构的受力",
  "切开竖向链杆，用力代替它的作用",
  "写出静定结构的平衡方程",
  "同一个 <i>F</i><sub>yB</sub>，比较切开前后的内力图",
];
const DEMO_VOTE_FEEDBACK = {
  participants: 10,
  counts: { agree: 5, doubt: 2, unsure: 3 },
  comments: [
    "方程少于未知量，从平衡上看确实可以有很多组解。",
    "支座反力如果可以任意取值，构件内力也会跟着变化，感觉不太合理。",
    "目前只能确认它们满足平衡，还需要更多证据才能判断。",
  ],
};
let lastStage = -1;
let lastVoteFeedback = null;
let currentState = null;
let config = null;
let x1 = 0.25;
let deformationBasicX1 = 0;
let lastDeformationRevealStep = 0;
let timerHandle = null;
let forceStoryboardRefresh = null;
let deformationLayout = null;
let previewSeconds = 0;
let previewStartedAt = 0;
let previewTimerRunning = false;
let aiDeformationEnabled = false;
let aiDeformationTimer = null;
let aiDeformationProgress = null;
let aiDeformationAnimationFrame = null;
const FORCE_CANVAS = { width: 1200, height: 1000 };

function runtimeUrl(value) {
  if (typeof value === "string" && /\/force-story\/scene\/(2|7)\.png$/.test(value)) {
    value += "?v=sign-20260912";
  }
  if (!offlineMode || typeof value !== "string" || !value.startsWith("/")) return value;
  return `${offlineRuntime.assetBase || "."}${value}`;
}
const FORCE_ELEMENT_META = {
  originalEquation: { number: "01", label: "上部平衡方程", baseWidth: 380, ratio: 3285 / 1460, reveal: 0 },
  originalStructure: { number: "02", label: "原结构", baseWidth: 480, ratio: 4306 / 1925, reveal: 0 },
  conceptOriginal: { number: "03", label: "圆一：原约束", baseWidth: 275, ratio: 2548 / 2534, reveal: 1 },
  conceptReleased: { number: "04", label: "圆二：解除约束", baseWidth: 275, ratio: 1, reveal: 1 },
  conceptRedundant: { number: "05", label: "圆三：力代约束", baseWidth: 275, ratio: 1, reveal: 1 },
  basicEquation: { number: "06", label: "下部平衡方程", baseWidth: 380, ratio: 3285 / 1460, reveal: 2 },
  basicStructure: { number: "07", label: "基本体系", baseWidth: 480, ratio: 4101 / 1912, reveal: 2 },
  originalMomentBg: { number: "08", label: "原结构M图", baseWidth: 350, ratio: 3221 / 1227, reveal: 3, curve: "moment", system: "original" },
  originalShearBg: { number: "09", label: "原结构FQ图", baseWidth: 350, ratio: 3211 / 1227, reveal: 3, curve: "shear", system: "original" },
  basicMomentBg: { number: "10", label: "基本体系M图", baseWidth: 350, ratio: 3221 / 949, reveal: 3, curve: "moment", system: "basic" },
  basicShearBg: { number: "11", label: "基本体系FQ图", baseWidth: 350, ratio: 3211 / 962, reveal: 3, curve: "shear", system: "basic" },
};
const FORCE_LABEL_META = {
  originalFyB: { label: "上部结构 FyB", parent: "originalStructure", type: "fyb" },
  basicFyB: { label: "下部结构 FyB", parent: "basicStructure", type: "fyb" },
  originalMA: { label: "原结构 M图 MA", parent: "originalMomentBg", type: "ma" },
  basicMA: { label: "基本体系 M图 MA", parent: "basicMomentBg", type: "ma" },
  originalFyA: { label: "原结构 FQ图 FyA", parent: "originalShearBg", type: "fya" },
  basicFyA: { label: "基本体系 FQ图 FyA", parent: "basicShearBg", type: "fya" },
};

const DEFORMATION_COMPARE_LAYOUT = {
  originalMomentBg: { x: 20, y: 85, scale: 1.55 },
  originalStructure: { x: 520, y: 92, scale: 1.406 },
  basicMomentBg: { x: 19.44, y: 525, scale: 1.586 },
  basicStructure: { x: 517.58, y: 530, scale: 1.3564 },
};

const DEFORMATION_ELEMENT_MAP = {
  topMoment: "originalMomentBg",
  topStructure: "originalStructure",
  bottomMoment: "basicMomentBg",
  bottomStructure: "basicStructure",
};

const DEFORMATION_LABEL_MAP = {
  topMA: "originalMA",
  topFyB: "originalFyB",
  bottomMA: "basicMA",
  bottomFyB: "basicFyB",
};

function deformationStepConfig(step = Number(currentState?.deformation_reveal_step || 0)) {
  if (currentState?.stage !== 3) return null;
  return deformationLayout?.steps?.[String([1, 2, 2, 3, 4, 4][step] ?? 1)] || null;
}

function normalizeDeformationLayout(layout) {
  if (!layout?.steps) return layout;
  if (!layout.steps["1"] && layout.steps["2"]) {
    const step1 = structuredClone(layout.steps["2"]);
    step1.elements.bottomStructure = { x: 517.58, y: 530, scale: 1.3564 };
    step1.styles.bottomColor = "#ff5900";
    step1.assets.bottomStructure = runtimeUrl("/assets/force-story/scene/7.png");
    layout.steps["1"] = step1;
  }
  const formulaDefaults = {
    "1": { x: 680, y: 760, scale: 1.4, color: "#ff5900" },
    "2": { x: 680, y: 760, scale: 1.4, color: "#800080" },
    "3": { x: 680, y: 760, scale: 1.4, color: "#008000" },
    "4": { x: 680, y: 760, scale: 1.4, color: "#ff5900" },
  };
  Object.entries(formulaDefaults).forEach(([step, fallback]) => {
    const stepConfig = layout.steps[step];
    if (!stepConfig) return;
    stepConfig.formula = { ...fallback, ...(stepConfig.formula || {}) };
    stepConfig.styles = stepConfig.styles || {};
    stepConfig.styles.deformationLineStyle ||= "dashed";
  });
  const step4Numeric = layout.steps["4"]?.numeric;
  if (step4Numeric) {
    step4Numeric.topDeformationX0 ??= step4Numeric.deformationX0;
    step4Numeric.topDeformationXB ??= step4Numeric.deformationXB;
    step4Numeric.topDeformationBaseline ??= step4Numeric.deformationBaseline;
    step4Numeric.topDeformationScale ??= step4Numeric.deformationScale;
    step4Numeric.topDeformationLineWidth ??= step4Numeric.deformationLineWidth;
  }
  return layout;
}

const DEFAULT_FORCE_LAYOUT = {
  version: 3,
  numeric: {
    controlWidth: 270, controlHeight: 760,
    momentX0: 35, momentXB: 920, momentScale: 300,
    shearX0: 35, shearXB: 920, shearScale: 105,
    originalMomentBaseline: 118, originalShearBaseline: 118,
    basicMomentBaseline: 115, basicShearBaseline: 118.5,
    momentDirection: 1,
    momentLineWidth: 4, shearLineWidth: 4,
  },
  elements: {
    originalEquation: { x: 0, y: 24, scale: 1 },
    originalStructure: { x: 390, y: 20, scale: 1 },
    conceptOriginal: { x: 915, y: 12, scale: 1 },
    conceptReleased: { x: 915, y: 335, scale: 1 },
    conceptRedundant: { x: 915, y: 658, scale: 1 },
    basicEquation: { x: 0, y: 790, scale: 1 },
    basicStructure: { x: 394.2, y: 777.1, scale: .97 },
    originalMomentBg: { x: 40, y: 345, scale: 1 },
    originalShearBg: { x: 405, y: 345, scale: 1 },
    basicMomentBg: { x: 40, y: 565, scale: 1 },
    basicShearBg: { x: 405, y: 565, scale: 1 },
  },
  labels: {
    originalFyB: { x: 83, y: 73, scale: 1 },
    basicFyB: { x: 83, y: 73, scale: 1 },
    originalMA: { x: 1, y: 2, scale: 1 },
    basicMA: { x: 1, y: 2, scale: 1 },
    originalFyA: { x: 1, y: 2, scale: 1 },
    basicFyA: { x: 1, y: 2, scale: 1 },
  },
  styles: {
    momentColor: "#ef6b3b",
    shearColor: "#2d9b68",
    momentLineStyle: "solid",
    shearLineStyle: "solid",
  },
  assets: {
    originalEquation: "/assets/force-story/scene/1.png",
    originalStructure: "/assets/force-story/scene/2.png",
    conceptOriginal: "/assets/force-story/scene/3.png",
    conceptReleased: "/assets/force-story/scene/4.png",
    conceptRedundant: "/assets/force-story/scene/5.png",
    basicEquation: "/assets/force-story/scene/6.png",
    basicStructure: "/assets/force-story/scene/7.png",
    originalMomentBg: "/assets/force-story/scene/8.png",
    originalShearBg: "/assets/force-story/scene/9.png",
    basicMomentBg: "/assets/force-story/scene/10.png",
    basicShearBg: "/assets/force-story/scene/11.png",
  },
};
let forceLayout = structuredClone(DEFAULT_FORCE_LAYOUT);

function forceAsset(slot) {
  if (slot === "originalEquation" || slot === "basicEquation") {
    // Vector equations use the same positive directions as the reaction readouts.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 445"><rect width="1000" height="445" rx="12" fill="#f2f2f2"/><g font-family="Times New Roman,serif" font-size="53" font-style="italic"><text x="18" y="94">∑ F<tspan baseline-shift="sub" font-size="32">x</tspan> = 0　<tspan fill="#315ba2">F<tspan baseline-shift="sub" font-size="32">xA</tspan></tspan> = 0</text><text x="18" y="238">∑ F<tspan baseline-shift="sub" font-size="32">y</tspan> = 0　−ql + <tspan fill="#315ba2">F<tspan baseline-shift="sub" font-size="32">yA</tspan></tspan> + <tspan fill="#d00000">F<tspan baseline-shift="sub" font-size="32">yB</tspan></tspan> = 0</text><text x="18" y="380">∑ M = 0　−ql²/2 + <tspan fill="#315ba2">M<tspan baseline-shift="sub" font-size="32">A</tspan></tspan> + <tspan fill="#d00000">F<tspan baseline-shift="sub" font-size="32">yB</tspan></tspan>l = 0</text></g></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
  return runtimeUrl(forceLayout.assets[slot] || DEFAULT_FORCE_LAYOUT.assets[slot]);
}

function forceCurveResponse(type, r, s, mode = "combined") {
  if (type === "moment") {
    // 教学显示采用用户约定的力矩正向；曲线及标注一起翻转。
    if (mode === "uniform") return ((1 - s) ** 2) / 2;
    if (mode === "fyb") return -r * (1 - s);
    return (1 - s) ** 2 / 2 - r * (1 - s);
  }
  if (mode === "uniform") return -(1 - s);
  if (mode === "fyb") return r;
  return r - (1 - s);
}

function applyForceLabelLayout(context = {}) {
  if (typeof context === "number") {
    context = { original: { r: context, mode: "combined" }, basic: { r: context, mode: "combined" } };
  }
  document.querySelectorAll("[data-force-label-slot]").forEach((label) => {
    const slot = label.dataset.forceLabelSlot;
    const labelMeta = FORCE_LABEL_META[slot];
    const layout = forceLayout.labels[slot];
    if (!labelMeta || !layout) return;
    label.style.left = `${layout.x}%`;
    if (labelMeta.type === "fyb") {
      const current = labelMeta.parent.startsWith("basic") ? context.basic : context.original;
      const isDecomposedFyB = slot === "basicFyB" && current?.mode === "fyb";
      label.style.left = `${isDecomposedFyB ? 42 : layout.x}%`;
      label.style.top = `${isDecomposedFyB ? 69 : layout.y}%`;
      label.style.transform = `scale(${layout.scale})`;
      return;
    }
    const parentMeta = FORCE_ELEMENT_META[labelMeta.parent];
    const values = forceLayout.numeric;
    const isMoment = labelMeta.type === "ma";
    const x0 = isMoment ? values.momentX0 : values.shearX0;
    const xB = isMoment ? values.momentXB : values.shearXB;
    const localX = layout.x / 100 * 1000;
    const s = Math.max(0, Math.min(1, (localX - x0) / (xB - x0)));
    const system = labelMeta.parent.startsWith("basic") ? "basic" : "original";
    const current = context[system] || { r: x1, mode: "combined" };
    const response = forceCurveResponse(isMoment ? "moment" : "shear", current.r, s, current.mode);
    const baselineKey = `${parentMeta.system}${isMoment ? "Moment" : "Shear"}Baseline`;
    const direction = isMoment ? -values.momentDirection : 1;
    const scale = isMoment ? values.momentScale : values.shearScale;
    const screenDelta = direction * response * scale;
    const curveY = values[baselineKey] + screenDelta;
    const canvasHeight = Math.round(1000 / parentMeta.ratio);
    const curveYPercent = curveY / canvasHeight * 100;
    const curveIsAboveBaseline = screenDelta <= 0;
    label.style.top = `${curveYPercent + (curveIsAboveBaseline ? -layout.y : layout.y)}%`;
    label.style.transform = `${curveIsAboveBaseline ? "translateY(-100%)" : "translateY(0)"} scale(${layout.scale})`;
  });
}

function applyForceLayout() {
  const values = forceLayout.numeric;
  const root = document.documentElement;
  root.style.setProperty("--force-control-width", `${values.controlWidth}px`);
  root.style.setProperty("--force-control-height", `${values.controlHeight}px`);
  document.querySelectorAll("[data-element-slot]").forEach((element) => {
    const slot = element.dataset.elementSlot;
    const meta = FORCE_ELEMENT_META[slot];
    const layout = forceLayout.elements[slot];
    if (!meta || !layout) return;
    element.style.left = `${layout.x / FORCE_CANVAS.width * 100}%`;
    element.style.top = `${layout.y / FORCE_CANVAS.height * 100}%`;
    element.style.width = `${meta.baseWidth * layout.scale / FORCE_CANVAS.width * 100}%`;
  });
  applyForceLabelLayout();
  document.querySelectorAll("[data-force-asset]").forEach((image) => {
    const nextSource = forceAsset(image.dataset.forceAsset);
    if (image.getAttribute("src") !== nextSource) image.src = nextSource;
  });
  if (forceStoryboardRefresh) {
    const revealStep = currentState?.stage === 3
      ? Number(currentState.deformation_reveal_step || 0)
      : Number(currentState?.force_reveal_step || 0);
    forceStoryboardRefresh(layoutMode && layoutStage !== 3 ? 5 : revealStep);
  }
}

function previewElapsed() {
  const runningSeconds = previewTimerRunning ? Math.floor((Date.now() - previewStartedAt) / 1000) : 0;
  const seconds = previewSeconds + runningSeconds;
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function setPreviewTimerRunning(running) {
  if (running === previewTimerRunning) return;
  if (running) {
    previewStartedAt = Date.now();
  } else {
    previewSeconds += Math.floor((Date.now() - previewStartedAt) / 1000);
  }
  previewTimerRunning = running;
}

if (isPreview) {
  window.addEventListener("message", (event) => {
    const sameOrigin = event.origin === location.origin
      || (location.protocol === "file:" && event.origin === "null");
    if (event.source !== window.parent || !sameOrigin || event.data?.type !== "beam-preview-timer") return;
    setPreviewTimerRunning(Boolean(event.data.running));
  });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1500);
}

const OFFLINE_CLASSROOM_STATE_KEY = "beam-offline-classroom-state-v2-sep13";
const OFFLINE_STUDENT_STATE_KEY = "beam-offline-student-state-v2-sep13";

function offlineStateKey() {
  return role === "teacher" || isPreview ? OFFLINE_CLASSROOM_STATE_KEY : OFFLINE_STUDENT_STATE_KEY;
}

function createOfflineState() {
  const now = new Date().toISOString();
  const studentEntryStage = role === "student" && !isPreview ? 1 : 0;
  return {
    session_id: "OFFLINE",
    stage: studentEntryStage,
    started_at: now,
    stage_started_at: now,
    comments_visible: true,
    voting_open: true,
    force_reveal_step: 0,
    deformation_reveal_step: 0,
    participants: 0,
    progress: { votes: 0, force: 0, alignments: 0, migration: 0 },
    vote_counts: { agree: 0, doubt: 0, unsure: 0 },
    vote_comments: [],
    offline_choice: "",
    vote_feedback_visible: false,
  };
}

function loadOfflineState() {
  try {
    const saved = JSON.parse(localStorage.getItem(offlineStateKey()) || "null");
    if (saved?.progress && saved?.vote_counts) return saved;
  } catch (_) {}
  const state = createOfflineState();
  localStorage.setItem(offlineStateKey(), JSON.stringify(state));
  return state;
}

function saveOfflineState(state) {
  localStorage.setItem(offlineStateKey(), JSON.stringify(state));
}

function applyOfflineAction(state, action) {
  if (action.type === "reset") return createOfflineState();
  const next = structuredClone(state);
  if (action.type === "set_stage") {
    next.stage = Math.max(0, Math.min(3, Number(action.stage || 0)));
    next.stage_started_at = new Date().toISOString();
    if (next.stage === 2) next.force_reveal_step = 0;
    if (next.stage === 3) next.deformation_reveal_step = 0;
  } else if (action.type === "set_force_reveal") {
    next.force_reveal_step = Math.max(0, Math.min(3, Number(action.step || 0)));
  } else if (action.type === "set_deformation_reveal") {
    next.deformation_reveal_step = Math.max(0, Math.min(5, Number(action.step || 0)));
  } else if (action.type === "set_voting") {
    next.voting_open = Boolean(action.open);
    if (action.open) {
      next.vote_feedback_visible = false;
      next.participants = 0;
      next.progress.votes = 0;
      next.vote_counts = { agree: 0, doubt: 0, unsure: 0 };
      next.vote_comments = [];
    }
  } else if (action.type === "show_vote_feedback") {
    next.voting_open = false;
    next.vote_feedback_visible = true;
    next.participants = DEMO_VOTE_FEEDBACK.participants;
    next.progress.votes = DEMO_VOTE_FEEDBACK.participants;
    next.vote_counts = structuredClone(DEMO_VOTE_FEEDBACK.counts);
    next.vote_comments = [...DEMO_VOTE_FEEDBACK.comments];
  } else if (action.type === "toggle_comments") {
    next.comments_visible = Boolean(action.visible);
  } else if (action.type === "clear_comments") {
    next.vote_comments = [];
  } else if (action.type === "vote" && next.voting_open !== false) {
    const choices = ["agree", "doubt", "unsure"];
    if (choices.includes(action.choice)) {
      if (next.offline_choice && next.vote_counts[next.offline_choice] > 0) next.vote_counts[next.offline_choice] -= 1;
      next.offline_choice = action.choice;
      next.vote_counts[action.choice] += 1;
      next.participants = 1;
      next.progress.votes = 1;
      const comment = String(action.comment || "").trim();
      next.vote_comments = comment ? [comment] : [];
    }
  } else if (action.type === "observe_force") {
    next.progress.force = Math.max(1, next.progress.force);
  } else if (action.type === "align") {
    next.progress.alignments = Math.abs(Number(action.x1) - 0.375) <= 0.02 ? 1 : 0;
  }
  return next;
}

async function api(action) {
  if (offlineMode) {
    currentState = applyOfflineAction(currentState || loadOfflineState(), action);
    saveOfflineState(currentState);
    return structuredClone(currentState);
  }
  if (isPreview) {
    showToast("教师预览：本次操作不计入课堂数据");
    return currentState;
  }
  const response = await fetch("/api/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...action, client_id: clientId, teacher_token: teacherToken, student_key: studentKey }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "操作未提交");
  return payload;
}

async function loadState() {
  if (offlineMode) return structuredClone(loadOfflineState());
  const accessQuery = role === "teacher"
    ? `&token=${encodeURIComponent(teacherToken)}`
    : layoutMode
      ? `&token=${encodeURIComponent(layoutTeacherToken)}`
    : `&key=${encodeURIComponent(studentKey)}`;
  const response = await fetch(`/api/state?role=${role}${accessQuery}`, { cache: "no-store" });
  if (!response.ok) throw new Error("连接失败");
  return response.json();
}

function steps(stage) {
  return `<div class="steps">${[1, 2, 3].map((number) => {
    const cls = number < stage ? "done" : number === stage ? "active" : "";
    return `<div class="step ${cls}">0${number} · ${stageLabels[number]}</div>`;
  }).join("")}</div>`;
}

function studentShell(title, eyebrow, content, aside = "") {
  return `${steps(currentState.stage)}<section class="hero"><article class="panel">
    <p class="eyebrow">${eyebrow}</p><h1>${title}</h1>${content}
  </article><aside class="panel">${aside}</aside></section>`;
}

function renderWaiting() {
  app.innerHTML = `<section class="panel waiting"><div class="pulse">B</div><p class="eyebrow">E—A 数智判验实验场</p>
    <h1>已进入课堂</h1><p class="lead" style="margin-inline:auto">请保留本页面。教师发布下一步后，这里会自动解锁，不需要重新扫码。</p></section>`;
}

function renderVote() {
  if (currentState.vote_feedback_visible) {
    renderVoteFeedback();
    return;
  }
  app.innerHTML = studentShell("同一个结构，会有很多组正确解吗？", "E · 先行研判", `
    <p class="question">平衡方程有无穷多组解。请先判断：它们是否都是原结构的正确解？</p>
    <div class="ai-quote"><strong>小智：</strong>F<sub>yB</sub> 可以任意取值，而且每一个值都能得到一组满足平衡的反力。所以，超静定结构本来就有很多组正确解。</div>
    <div class="options">
      <button class="option" data-vote="agree"><strong>同意小智</strong>两个平衡方程、三个未知量，当然可以有很多组解。</button>
      <button class="option" data-vote="doubt"><strong>感觉怪怪的</strong>内力如果想大就大、想小就小，构件截面还怎么设计？</button>
      <button class="option" data-vote="unsure"><strong>暂时无法判断</strong>我需要更多证据。</button>
    </div>
    <div class="vote-submit-row"><input id="voteComment" type="text" maxlength="80" placeholder="补充选项之外的想法（选填）"/><button class="primary" id="submitVote" disabled>提交判断</button></div>
    <p class="vote-status" id="voteStatus"></p>`, `<h3>先判，再验</h3><p class="lead">这里没有“正确选项”提示。你的判断会进入教师端汇总，但不会显示姓名。</p>
      <div class="formula equilibrium-system">
        <div>∑ F<sub>x</sub> = 0　 <span class="eq-blue">F<sub>xA</sub></span> = 0</div>
        <div>∑ F<sub>y</sub> = 0　 −q · l + <span class="eq-blue">F<sub>yA</sub></span> + <span class="eq-red">F<sub>yB</sub></span> = 0</div>
        <div>∑ M = 0　 −q · <span class="fraction"><span>l²</span><span>2</span></span> + <span class="eq-blue">M<sub>A</sub></span> + <span class="eq-red">F<sub>yB</sub></span> · l = 0</div>
      </div>
      <div class="candidate-solutions">
        <div class="candidate-heading"><span>三组平衡候选</span><span><span class="eq-blue">F<sub>xA</sub></span> = 0</span></div>
        <div class="candidate-row">
          <span><span class="eq-red">F<sub>yB</sub></span> = 0</span>
          <span><span class="eq-blue">F<sub>yA</sub></span> = q · l</span>
          <span><span class="eq-blue">M<sub>A</sub></span> = q · <span class="fraction"><span>l²</span><span>2</span></span></span>
        </div>
        <div class="candidate-row">
          <span><span class="eq-red">F<sub>yB</sub></span> = <span class="fraction"><span>q · l</span><span>4</span></span></span>
          <span><span class="eq-blue">F<sub>yA</sub></span> = <span class="fraction"><span>3q · l</span><span>4</span></span></span>
          <span><span class="eq-blue">M<sub>A</sub></span> = q · <span class="fraction"><span>l²</span><span>4</span></span></span>
        </div>
        <div class="candidate-row">
          <span><span class="eq-red">F<sub>yB</sub></span> = <span class="fraction"><span>q · l</span><span>2</span></span></span>
          <span><span class="eq-blue">F<sub>yA</sub></span> = <span class="fraction"><span>q · l</span><span>2</span></span></span>
          <span><span class="eq-blue">M<sub>A</sub></span> = 0</span>
        </div>
      </div>`);
  let selectedVote = null;
  const voteButtons = document.querySelectorAll("[data-vote]");
  const submitVote = document.querySelector("#submitVote");
  const voteComment = document.querySelector("#voteComment");
  voteButtons.forEach((button) => button.addEventListener("click", () => {
    selectedVote = button.dataset.vote;
    voteButtons.forEach((item) => {
      const selected = item === button;
      item.classList.toggle("selected", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
    submitVote.disabled = currentState.voting_open === false;
  }));
  submitVote.addEventListener("click", async () => {
    if (!selectedVote) return;
    if (isPreview) {
      showToast("教师预览：本次判断不计入统计");
      return;
    }
    try {
      await api({ type: "vote", choice: selectedVote, comment: voteComment.value });
      await api({ type: "show_vote_feedback" });
      renderStudent();
      lastVoteFeedback = true;
      showToast("判断已提交，正在查看全班反馈");
    } catch (error) {
      showToast(error.message || "内容未提交");
    }
  });
  updateVoteAvailability(currentState);
}

function voteFeedbackSummaryHtml(state) {
  return `<div class="student-feedback-summary">
    <div class="student-feedback-total"><strong>${state.participants}</strong><span>人完成判断</span></div>
    <div class="vote-bars student-vote-bars">${voteBars(state.vote_counts)}</div>
  </div>
  <section class="student-feedback-comments"><h3>匿名补充观点</h3>
    ${state.vote_comments.map(comment => `<p>${comment}</p>`).join("")}
  </section>`;
}

function renderVoteFeedback() {
  app.innerHTML = studentShell("全班判断已经汇总", "E · 投票反馈", `
    <p class="question">面对小智的观点，大家形成了三种不同判断。</p>
    ${voteFeedbackSummaryHtml(currentState)}
    ${isSelfGuidedStudent ? '<div class="button-row"><button class="primary" id="continueFromFeedback">进入02 · 受力数验</button></div>' : ""}`,
    `<h3>判断之后，还要验证</h3><p class="lead">投票呈现的是当前认识，并不直接公布正确答案。下一步，让内力图提供可以观察、可以比较的证据。</p>`);
  document.querySelector("#continueFromFeedback")?.addEventListener("click", () => setSelfGuidedPosition(2, 0));
}

function updateVoteAvailability(state) {
  const status = document.querySelector("#voteStatus");
  if (!status) return;
  const open = state.voting_open !== false;
  const selected = Boolean(document.querySelector(".option.selected"));
  document.querySelectorAll("[data-vote]").forEach((button) => { button.disabled = !open; });
  const comment = document.querySelector("#voteComment");
  const submit = document.querySelector("#submitVote");
  if (comment) comment.disabled = !open;
  if (submit) submit.disabled = !open || !selected;
  status.textContent = open ? "选择进行中，可修改后再次提交" : "本轮选择已结束";
  status.classList.toggle("closed", !open);
}

function labReadouts(deformation = false, value = x1, mode = "combined") {
  const fyb = mode === "uniform" ? 0 : value;
  const fya = mode === "uniform" ? 1 : mode === "fyb" ? -value : 1 - value;
  const moment = mode === "uniform" ? .5 : mode === "fyb" ? -value : .5 - value;
  const delta = value / 3 - 1 / 8;
  return `<div class="readouts">
    <div class="readout"><strong>${fya.toFixed(3)} ql</strong><small>F<sub>yA</sub></small></div>
    <div class="readout"><strong>${fyb.toFixed(3)} ql</strong><small>X<sub>1</sub> = F<sub>yB</sub></small></div>
    <div class="readout"><strong>${moment.toFixed(3)} ql²</strong><small>M<sub>A</sub></small></div>
    <div class="readout"><strong class="zero">0.000</strong><small>平衡残差</small></div>
    ${deformation ? `<div class="readout" style="grid-column:1/-1"><strong class="${Math.abs(delta) < .004 ? "zero" : ""}">${delta.toFixed(4)} ql⁴/EI</strong><small>Δ<sub>B</sub> = X<sub>1</sub>l³/3EI − ql⁴/8EI</small></div>` : ""}
  </div>`;
}

function bindLab(deformation = false) {
  const slider = document.querySelector("#x1Slider");
  const value = document.querySelector("#x1Value");
  const readouts = document.querySelector("#readouts");
  const align = document.querySelector("#alignButton");
  const update = () => {
    x1 = Number(slider.value);
    if (deformation && Math.abs(x1 - .375) < .008) {
      x1 = .375;
      slider.value = String(x1);
    }
    value.textContent = `${x1.toFixed(3)} ql`;
    readouts.innerHTML = labReadouts(deformation);
    drawLab(document.querySelector("#labCanvas"), x1, deformation);
    if (align) align.disabled = Math.abs(x1 - .375) > .02;
  };
  slider.addEventListener("input", update);
  slider.addEventListener("change", () => api({ type: deformation ? "align" : "observe_force", x1 }));
  if (align) align.addEventListener("click", async () => {
    await api({ type: "align", x1 });
    showToast("销孔已对正：唯一真解已锁定");
  });
  update();
}

function forceElementHtml(slot) {
  const meta = FORCE_ELEMENT_META[slot];
  const reveal = meta.reveal ? ` data-reveal="${meta.reveal}" hidden` : "";
  const ratio = `${meta.ratio}`;
  const labelEntry = Object.entries(FORCE_LABEL_META).find(([, meta]) => meta.parent === slot);
  const liveValue = labelEntry
    ? `<span class="force-live-value force-live-value-${labelEntry[1].type}" data-force-label-slot="${labelEntry[0]}" data-force-live-value="${labelEntry[1].type}" aria-label="${labelEntry[1].label}"></span>`
    : "";
  if (meta.curve) {
    const canvasHeight = Math.round(1000 / meta.ratio);
    return `<div class="force-free-element force-diagram-element" data-element-slot="${slot}" style="--element-ratio:${ratio}"${reveal}>
      <canvas data-force-curve="${meta.curve}" data-force-system="${meta.system}" width="1000" height="${canvasHeight}"></canvas>
      <img data-force-asset="${slot}" src="${forceAsset(slot)}" alt="${meta.label}"/>
      ${liveValue}
    </div>`;
  }
  return `<div class="force-free-element" data-element-slot="${slot}" style="--element-ratio:${ratio}"${reveal}><img data-force-asset="${slot}" src="${forceAsset(slot)}" alt="${meta.label}"/>${liveValue}</div>`;
}

function formatForceValue(type, r, mode = "combined") {
  if (type === "fyb") {
    const value = mode === "uniform" ? 0 : r;
    return `<i>F</i><sub>yB</sub> = ${value.toFixed(3)} <i>ql</i>`;
  }
  if (type === "fya") {
    const value = mode === "uniform" ? 1 : mode === "fyb" ? -r : 1 - r;
    return `<i>F</i><sub>yA</sub> = ${value.toFixed(3)} <i>ql</i>`;
  }
  const moment = forceCurveResponse("moment", r, 0, mode);
  const signedMoment = `${moment < 0 ? "−" : ""}${Math.abs(moment).toFixed(3)}`;
  return `<i>M</i><sub>A</sub> = ${signedMoment} <i>ql</i><sup>2</sup>`;
}

function bindForceStoryboard() {
  const sliders = Array.from(document.querySelectorAll("[data-force-slider]"));
  const refresh = (step = currentState.force_reveal_step || 0) => {
    const numericStep = Math.max(0, Math.min(Number(step), 3));
    const story = document.querySelector(".force-story:not(.deformation-story)");
    if (story) story.dataset.revealStep = String(numericStep);
    const heading = document.querySelector(".force-story:not(.deformation-story) h1");
    if (heading) heading.innerHTML = forceStepHeadings[numericStep];
    sliders.forEach((slider) => { slider.value = String(x1); });
    document.querySelectorAll("[data-force-value]").forEach((value) => { value.textContent = `${x1.toFixed(3)} ql`; });
    document.querySelectorAll("[data-force-live-value]").forEach((value) => {
      value.innerHTML = step < 3 && ["originalFyB", "basicFyB"].includes(value.dataset.forceLabelSlot)
        ? '<i>F</i><sub>yB</sub> = ?'
        : formatForceValue(value.dataset.forceLiveValue, x1);
    });
    document.querySelectorAll("[data-force-readouts]").forEach((readouts) => { readouts.innerHTML = labReadouts(false); });
    document.querySelectorAll("[data-force-curve]").forEach((canvas) => drawForceCurve(canvas, x1, canvas.dataset.forceCurve, canvas.dataset.forceSystem));
    applyForceLabelLayout(x1);
    story?.querySelectorAll('[data-element-slot="originalShearBg"], [data-element-slot="basicShearBg"]').forEach((element) => {
      element.hidden = true;
    });
    ["originalMomentBg", "basicMomentBg"].forEach((slot) => {
      const element = story?.querySelector(`[data-element-slot="${slot}"]`);
      const layout = forceLayout.elements[slot];
      if (element && layout) element.style.left = `${(numericStep === 3 ? forceLayout.elements.originalShearBg.x : layout.x) / FORCE_CANVAS.width * 100}%`;
    });
    const transitionArrow = story?.querySelector("[data-force-transition-arrow]");
    if (transitionArrow) transitionArrow.hidden = numericStep !== 2;
    const compareDecorations = story?.querySelectorAll("[data-force-compare-decoration]") || [];
    compareDecorations.forEach((element) => { element.hidden = numericStep !== 3; });
  };
  forceStoryboardRefresh = refresh;
  sliders.forEach((slider) => {
    slider.addEventListener("input", () => {
      x1 = Number(slider.value);
      refresh();
    });
    slider.addEventListener("change", () => api({ type: "observe_force", x1 }));
  });
  refresh();
}

function bindDeformationStoryboard() {
  const slider = document.querySelector('[data-force-channel="basic"]');
  const card = slider.closest('.force-control');
  const aiCard = document.querySelector('[data-ai-deformation-card]');
  const aiButton = document.querySelector('[data-ai-deformation-button]');
  const aiStatus = document.querySelector('[data-ai-deformation-status]');
  let keyboardInput = false;
  slider.addEventListener('keydown', () => { keyboardInput = true; });
  slider.addEventListener('pointerdown', () => { keyboardInput = false; });
  const refresh = (step = Number(currentState?.deformation_reveal_step || 0)) => {
    if (step < 4) {
      aiDeformationEnabled = false;
      aiDeformationProgress = null;
      if (aiDeformationAnimationFrame) cancelAnimationFrame(aiDeformationAnimationFrame);
      if (aiDeformationTimer) clearTimeout(aiDeformationTimer);
      aiDeformationAnimationFrame = null;
      aiDeformationTimer = null;
      if (aiButton) delete aiButton.dataset.computing;
      aiCard?.removeAttribute('aria-busy');
    }
    const uniform = step === 1 || step === 2;
    const mode = uniform ? 'uniform' : step === 3 ? 'fyb' : 'combined';
    deformationBasicX1 = uniform ? 0 : x1;
    slider.value = String(deformationBasicX1);
    slider.disabled = uniform;
    card.querySelector('[data-force-value]').textContent = `${deformationBasicX1.toFixed(3)} ql`;
    card.querySelector('[data-force-readouts]').innerHTML = labReadouts(false, deformationBasicX1, mode)
      + (step >= 4 ? `<div class="readout displacement-readout"><strong>${(Math.abs(1/8-x1/3) < 1e-10 ? 0 : 1/8-x1/3).toFixed(5)} ql⁴/EI</strong><small>B点位移 Δ<sub>B</sub>（向下为正）</small></div>` : '');
    card.querySelector('.hint').innerHTML = uniform ? '均布荷载单独作用，F<sub>yB</sub> 固定为零。' : '一个滑块共同控制上下两排。';
    card.querySelector('[data-special-candidates]').hidden = step < 4;
    document.querySelectorAll('[data-special-candidate]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.specialCandidate) === x1)));
    document.querySelectorAll('[data-force-curve]').forEach(canvas => {
      const original = canvas.dataset.forceSystem === 'original';
      drawForceCurve(canvas, original ? x1 : deformationBasicX1, canvas.dataset.forceCurve, canvas.dataset.forceSystem, original ? 'combined' : mode);
    });
    const labelContext = { original: { r: x1, mode: 'combined' }, basic: { r: deformationBasicX1, mode } };
    document.querySelectorAll('[data-force-live-value]').forEach(label => {
      const meta = FORCE_LABEL_META[label.dataset.forceLabelSlot];
      const current = labelContext[meta.parent.startsWith('basic') ? 'basic' : 'original'];
      label.innerHTML = formatForceValue(label.dataset.forceLiveValue, current.r, current.mode);
      label.dataset.forceMode = current.mode;
    });
    drawDecompositionStructure(document.querySelector('[data-deformation-load]'), mode, deformationBasicX1);
    const bottom = document.querySelector('[data-deformation-load]');
    const top = document.querySelector('[data-deformation-load-top]');
    const aiComputing = step === 4 && aiDeformationProgress !== null;
    const showAiCurves = step >= 5 || (step === 4 && aiDeformationEnabled);
    if (bottom) bottom.hidden = step === 0 || (step === 4 && !showAiCurves && !aiComputing);
    top.hidden = step < 4 || (step === 4 && !showAiCurves && !aiComputing);
    if (step >= 4) drawDecompositionStructure(top, 'combined', THEORETICAL_FYB_RATIO);
    if (aiCard) aiCard.hidden = step !== 4;
    if (aiButton && step === 4 && !aiButton.dataset.computing) {
      aiButton.disabled = aiDeformationEnabled;
      aiButton.textContent = aiDeformationEnabled ? 'AI 计算完成' : '启动 AI 辅助计算';
      aiStatus.textContent = aiDeformationEnabled
        ? '26/26 个采样点 · 变形曲线已生成'
        : '逐点图乘 · 计算 26 个采样点位移';
    }
    applyDeformationStepLayout(step);
    lastDeformationRevealStep = step;
  };
  forceStoryboardRefresh = refresh;
  slider.addEventListener('input', () => {
    const raw = Number(slider.value);
    const step = Number(currentState.deformation_reveal_step || 0);
    x1 = step >= 4 && !keyboardInput && Math.abs(raw - .375) <= .008 ? .375 : raw;
    refresh(step);
  });
  slider.addEventListener('change', () => { slider.value = String(x1); api({ type: 'observe_force', x1 }); });
  document.querySelectorAll('[data-special-candidate]').forEach(button => button.addEventListener('click', () => {
    x1 = Number(button.dataset.specialCandidate);
    slider.value = String(x1);
    refresh();
  }));
  aiButton?.addEventListener('click', () => {
    if (aiDeformationEnabled || aiButton.dataset.computing) return;
    aiButton.dataset.computing = 'true';
    aiButton.disabled = true;
    aiButton.textContent = 'AI 正在逐点计算…';
    aiStatus.textContent = '1/26 个采样点 · AI逐点图乘中';
    aiCard.setAttribute('aria-busy', 'true');
    aiDeformationProgress = 0;
    refresh(4);
    const startedAt = performance.now();
    const duration = 2000;
    const animate = (now) => {
      if (currentState?.stage !== 3 || Number(currentState.deformation_reveal_step || 0) !== 4) return;
      aiDeformationProgress = Math.min(1, (now - startedAt) / duration);
      const completedPoints = Math.min(26, Math.floor(aiDeformationProgress * 25) + 1);
      aiStatus.textContent = `${completedPoints}/26 个采样点 · AI逐点图乘中`;
      drawDecompositionStructure(document.querySelector('[data-deformation-load]'), 'combined', deformationBasicX1);
      drawDecompositionStructure(document.querySelector('[data-deformation-load-top]'), 'combined', THEORETICAL_FYB_RATIO);
      if (aiDeformationProgress < 1) {
        aiDeformationAnimationFrame = requestAnimationFrame(animate);
        return;
      }
      aiDeformationAnimationFrame = null;
      aiDeformationTimer = setTimeout(() => {
        aiDeformationTimer = null;
        delete aiButton.dataset.computing;
        aiCard.removeAttribute('aria-busy');
        if (currentState?.stage !== 3 || Number(currentState.deformation_reveal_step || 0) !== 4) return;
        aiDeformationProgress = null;
        aiDeformationEnabled = true;
        refresh(4);
      }, 300);
    };
    if (aiDeformationTimer) clearTimeout(aiDeformationTimer);
    aiDeformationAnimationFrame = requestAnimationFrame(animate);
  });
  refresh();
}

function updateForceReveal(state) {
  const step = Math.max(0, Math.min(Number(state.force_reveal_step || 0), 3));
  document.querySelectorAll("[data-reveal]").forEach((element) => {
    element.hidden = Number(element.dataset.reveal) > step;
  });
  if (forceStoryboardRefresh) forceStoryboardRefresh(step);
}

function applyDeformationCompareLayout() {
  Object.entries(DEFORMATION_COMPARE_LAYOUT).forEach(([slot, layout]) => {
    const element = document.querySelector(`[data-element-slot="${slot}"]`);
    const meta = FORCE_ELEMENT_META[slot];
    if (!element || !meta) return;
    element.style.left = `${layout.x / FORCE_CANVAS.width * 100}%`;
    element.style.top = `${layout.y / FORCE_CANVAS.height * 100}%`;
    element.style.width = `${meta.baseWidth * layout.scale / FORCE_CANVAS.width * 100}%`;
  });
}

function applyDeformationStepLayout(step) {
  const stepConfig = deformationStepConfig(step);
  if (!stepConfig) return;
  Object.entries(DEFORMATION_ELEMENT_MAP).forEach(([configSlot, elementSlot]) => {
    const element = document.querySelector(`[data-element-slot="${elementSlot}"]`);
    const meta = FORCE_ELEMENT_META[elementSlot];
    const position = stepConfig.elements[configSlot];
    if (!element || !meta || !position) return;
    element.style.left = `${position.x / FORCE_CANVAS.width * 100}%`;
    element.style.top = `${position.y / FORCE_CANVAS.height * 100}%`;
    element.style.width = `${meta.baseWidth * position.scale / FORCE_CANVAS.width * 100}%`;
    const image = element.querySelector("img");
    const source = stepConfig.assets[configSlot];
    const resolvedSource = runtimeUrl(source);
    if (image && resolvedSource && image.getAttribute("src") !== resolvedSource) image.src = resolvedSource;
  });
  Object.entries(DEFORMATION_LABEL_MAP).forEach(([configSlot, labelSlot]) => {
    const label = document.querySelector(`[data-force-label-slot="${labelSlot}"]`);
    const position = stepConfig.labels[configSlot];
    if (!label || !position) return;
    label.style.left = `${position.x}%`;
    if (!configSlot.endsWith("MA")) {
      label.style.top = `${position.y}%`;
      label.style.transform = `scale(${position.scale})`;
      return;
    }
    const isTop = configSlot.startsWith("top");
    const currentR = isTop ? x1 : deformationBasicX1;
    const mode = isTop ? "combined" : (step === 1 || step === 2) ? "uniform" : step === 3 ? "fyb" : "combined";
    const numeric = stepConfig.numeric;
    const localX = position.x / 100 * 1000;
    const s = Math.max(0, Math.min(1, (localX - numeric.momentX0) / (numeric.momentXB - numeric.momentX0)));
    const response = forceCurveResponse("moment", currentR, s, mode);
    const baseline = isTop ? numeric.topMomentBaseline : numeric.bottomMomentBaseline;
    const screenDelta = -numeric.momentDirection * response * numeric.momentScale;
    const elementSlot = isTop ? "originalMomentBg" : "basicMomentBg";
    const canvasHeight = Math.round(1000 / FORCE_ELEMENT_META[elementSlot].ratio);
    const curveYPercent = (baseline + screenDelta) / canvasHeight * 100;
    const curveIsAbove = screenDelta <= 0;
    label.style.top = `${curveYPercent + (curveIsAbove ? -position.y : position.y)}%`;
    label.style.transform = `${curveIsAbove ? "translateY(-100%)" : "translateY(0)"} scale(${position.scale})`;
  });
  const formula = document.querySelector("[data-deformation-formula]");
  if (formula) {
    formula.hidden = ![2, 3, 4, 5].includes(step);
    if (step >= 2) {
      formula.innerHTML = deformationFormulaHtml(step, deformationBasicX1);
      formula.style.left = `${stepConfig.formula.x / FORCE_CANVAS.width * 100}%`;
      formula.style.top = `${stepConfig.formula.y / FORCE_CANVAS.height * 100}%`;
      formula.style.color = stepConfig.formula.color;
      formula.style.transform = `scale(${stepConfig.formula.scale})`;
    }
  }
}

function updateDeformationFormulaValue(step, r) {
  const formula = document.querySelector("[data-deformation-formula]");
  if (formula && step >= 2) formula.innerHTML = deformationFormulaHtml(step, r);
}

function deformationFormulaHtml(step, r = deformationBasicX1) {
  const uniform = '<span class="fraction"><span><i>q</i><i>l</i><sup>4</sup></span><span>8<i>E</i><i>I</i></span></span>';
  const fyb = '<span class="fraction"><span><i>l</i><sup>3</sup></span><span>3<i>E</i><i>I</i></span></span><i>F</i><sub><i>yB</i></sub>';
  if (step === 2) return uniform;
  if (step === 3) return `&minus;${fyb}`;
  if (step === 4) return `Δ<sub>B</sub> = ${uniform} &minus; ${fyb}`;
  const rawCoefficient = 1 / 8 - r / 3;
  const coefficient = Math.abs(rawCoefficient) < 0.0000005 ? 0 : rawCoefficient;
  const coefficientText = coefficient.toFixed(4).replace("-", "&minus;");
  const result = `${coefficientText} <span class="fraction compact-fraction"><span><i>q</i><i>l</i><sup>4</sup></span><span><i>E</i><i>I</i></span></span>`;
  return `Δ<sub>B</sub> = ${uniform} &minus; ${fyb} = ${result}`;
}

function updateDeformationReveal(state) {
  const story = document.querySelector('.deformation-story');
  if (!story) return;
  const step = Math.max(0, Math.min(Number(state.deformation_reveal_step || 0), 5));
  const visible = new Set(['originalStructure', 'originalMomentBg', 'basicStructure', 'basicMomentBg']);
  story.dataset.revealStep = String(step);
  story.classList.add('deformation-compare');
  story.classList.toggle('deformation-decomposed', step >= 1);
  story.querySelector('h1').innerHTML = [
    '可是，切开竖向链杆时，我们到底拿走了什么？',
    '先看均布荷载单独作用',
    '均布荷载引起的B点位移',
    '再看 <i>F</i><sub>yB</sub> 单独作用',
    '将均布荷载与 <i>F</i><sub>yB</sub> 叠加起来',
    '写出B点位移的叠加表达式',
  ][step];
  story.querySelectorAll('[data-element-slot]').forEach(element => { element.hidden = !visible.has(element.dataset.elementSlot); });
  story.querySelectorAll('[data-force-label-slot]').forEach(label => { label.hidden = (step === 1 || step === 2) && label.dataset.forceLabelSlot === 'basicFyB'; });
  story.querySelector('[data-deformation-load]').hidden = step === 0;
  story.querySelector('[data-deformation-load-top]').hidden = step < 4;
  story.querySelector('[data-deformation-divider]').hidden = false;
  story.querySelectorAll('[data-structure-caption]').forEach(label => { label.hidden = false; });
  applyForceLayout();
  applyDeformationCompareLayout();
  if (forceStoryboardRefresh) forceStoryboardRefresh(step);
  applyDeformationStepLayout(step);
}

function renderForce() {
  app.innerHTML = `${steps(2)}<section class="panel force-story"><p class="eyebrow">A₁ · 受力数验</p><h1>${forceStepHeadings[0]}</h1>
    <div class="force-composition">
      <div class="force-free-canvas" aria-label="11元素自由排版画布">
        ${Object.keys(FORCE_ELEMENT_META).map(forceElementHtml).join("")}
        <div class="force-transition-arrow" data-force-transition-arrow hidden aria-label="由超静定结构指向静定结构"></div>
        <div class="deformation-row-divider" data-force-compare-decoration hidden aria-hidden="true"></div>
        <div class="structure-caption top-caption" data-force-compare-decoration hidden>未知的超静定结构</div>
        <div class="structure-caption bottom-caption" data-force-compare-decoration hidden>已知的静定结构</div>
      </div>
      <div class="force-controls">
        <aside class="control-card force-control" data-reveal="3" hidden><div class="range-row"><input data-force-slider type="range" min="0" max="1" step="0.005" value="${x1}" aria-label="原结构FyB滑块"/><strong data-force-value></strong></div><div data-force-readouts></div><p class="hint">拖动同一个 F<sub>yB</sub>，上下两组内力图同步更新。</p></aside>
      </div>
    </div>
  </section>`;
  bindForceStoryboard();
  updateForceReveal(currentState);
  applyForceLayout();
}

function renderDeformation() {
  x1 = .25;
  deformationBasicX1 = 0;
  lastDeformationRevealStep = 0;
  const slots = ["originalStructure", "originalMomentBg", "originalShearBg", "basicStructure", "basicMomentBg", "basicShearBg"];
  app.innerHTML = `${steps(3)}<section class="panel force-story deformation-story" data-reveal-step="0"><p class="eyebrow">A₂ · 协调释理</p><h1></h1>
    <div class="force-composition deformation-composition">
      <div class="force-free-canvas" aria-label="切开竖向链杆前后的受力对照">
        <div class="deformation-row-divider" data-deformation-divider hidden aria-hidden="true"></div>
        ${slots.map(forceElementHtml).join("")}<div class="structure-caption top-caption" data-structure-caption>未知的超静定结构</div><div class="structure-caption bottom-caption" data-structure-caption>已知的静定结构</div>
      </div>
      <div class="force-controls">
        <aside class="control-card force-control"><section class="ai-deformation-card" data-ai-deformation-card hidden><div class="ai-deformation-heading"><span>AI</span><strong>辅助生成整梁变形</strong></div><button type="button" class="primary ai-deformation-button" data-ai-deformation-button>启动 AI 辅助计算</button><small data-ai-deformation-status>逐点图乘 · 计算 26 个采样点位移</small></section><div class="range-row"><input data-force-slider data-force-channel="basic" type="range" min="0" max="1" step="0.005" value="0" aria-label="切开链杆后FyB滑块"/><strong data-force-value></strong></div><div class="special-candidates" data-special-candidates hidden><button class="secondary" data-special-candidate="0">FyB＝0</button><button class="secondary" data-special-candidate="0.25">FyB＝ql/4</button><button class="secondary" data-special-candidate="0.5">FyB＝ql/2</button></div><div data-force-readouts></div><p class="hint">上下滑块同步，两组内力图同步变化。</p></aside>
      </div>
    </div>
  </section>`;
  const basicStructure = document.querySelector('[data-element-slot="basicStructure"]');
  const canvasHeight = Math.round(1000 / FORCE_ELEMENT_META.basicStructure.ratio);
  basicStructure.insertAdjacentHTML("afterbegin", `<canvas class="deformation-load-canvas" data-deformation-load data-deformation-system="bottom" width="1000" height="${canvasHeight}" hidden></canvas>`);
  const originalStructure = document.querySelector('[data-element-slot="originalStructure"]');
  const topCanvasHeight = Math.round(1000 / FORCE_ELEMENT_META.originalStructure.ratio);
  originalStructure.insertAdjacentHTML("afterbegin", `<canvas class="deformation-load-canvas" data-deformation-load-top data-deformation-system="top" width="1000" height="${topCanvasHeight}" hidden></canvas>`);
  document.querySelector(".force-free-canvas").insertAdjacentHTML("beforeend", '<div class="deformation-formula-label" data-deformation-formula hidden></div>');
  bindDeformationStoryboard();
  updateDeformationReveal(currentState);
}

function beamResponse(s, r = .375) {
  const v = -(6*s*s - 4*s*s*s + s*s*s*s) / 24 + r * s*s*(3-s) / 6;
  const theta = -(3*s - 3*s*s + s*s*s) / 6 + r * (s - s*s/2);
  return { v, theta };
}

function solveLinear(A, b) {
  const n = b.length;
  const m = A.map((row, i) => [...row, b[i]]);
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(m[i][k]) > Math.abs(m[pivot][k])) pivot = i;
    [m[k], m[pivot]] = [m[pivot], m[k]];
    for (let i = k + 1; i < n; i++) {
      const f = m[i][k] / m[k][k];
      for (let j = k; j <= n; j++) m[i][j] -= f * m[k][j];
    }
  }
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = (m[i][n] - m[i].slice(i + 1, n).reduce((sum, value, j) => sum + value * x[i + 1 + j], 0)) / m[i][i];
  }
  return x;
}

function femBeam() {
  const elements = 4, nodes = 5, dofs = nodes * 2, le = 1 / elements;
  const K = Array.from({ length: dofs }, () => Array(dofs).fill(0));
  const F = Array(dofs).fill(0);
  const a = 12/le**3, b = 6/le**2, c = 4/le, d = 2/le;
  const ke = [[a,b,-a,b],[b,c,-b,d],[-a,-b,a,-b],[b,d,-b,c]];
  const fe = [-le/2, -(le**2)/12, -le/2, le**2/12];
  for (let e = 0; e < elements; e++) {
    const ids = [2*e,2*e+1,2*e+2,2*e+3];
    ids.forEach((gi, i) => { F[gi] += fe[i]; ids.forEach((gj, j) => K[gi][gj] += ke[i][j]); });
  }
  const fixed = new Set([0,1,8]);
  const free = [...Array(dofs).keys()].filter(i => !fixed.has(i));
  const reducedK = free.map(i => free.map(j => K[i][j]));
  const reducedF = free.map(i => F[i]);
  const solved = solveLinear(reducedK, reducedF);
  const u = Array(dofs).fill(0);
  free.forEach((id, i) => u[id] = solved[i]);
  return [1,2,3].map(node => ({ s: node/4, v: u[2*node], theta: u[2*node+1] }));
}

function renderMigration() {
  app.innerHTML = `${steps(4)}<section class="panel"><p class="eyebrow">M · 迁移进阶</p><h1>只协调 B 点，为什么整条梁都能对上？</h1>
    <p class="lead">左列用4个 Euler–Bernoulli 梁单元直接求原超静定结构；右列用静定基本体系的解析位移函数。两条路线独立计算。</p>
    <div class="button-row"><button class="primary" id="runMigration">运行双路线校核</button></div>
    <div id="migrationResult"><p class="hint">将比较 x=l/4、l/2、3l/4 三处的无量纲位移 v* 与转角 θ*。</p></div></section>`;
  document.querySelector("#runMigration").addEventListener("click", async () => {
    const fem = femBeam();
    const rows = fem.map(item => {
      const exact = beamResponse(item.s);
      const dv = Math.abs(item.v - exact.v);
      const dt = Math.abs(item.theta - exact.theta);
      return `<tr><td>${item.s}l</td><td>${item.v.toFixed(6)}</td><td>${exact.v.toFixed(6)}</td><td>${item.theta.toFixed(6)}</td><td>${exact.theta.toFixed(6)}</td><td class="pass">${Math.max(dv,dt) < 1e-10 ? "通过" : "检查"}</td></tr>`;
    }).join("");
    document.querySelector("#migrationResult").innerHTML = `<table><thead><tr><th>位置</th><th>FEM v*</th><th>基本体系 v*</th><th>FEM θ*</th><th>基本体系 θ*</th><th>校核</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="question">平衡、材料关系和 B 点位移约束恢复后，稳定线弹性结构的响应具有唯一性，因此两种表示必须给出同一整场响应。</p>`;
    await api({ type: "run_migration" });
    showToast("三处响应已完成独立校核");
  });
}

function renderComplete() {
  app.innerHTML = `<section class="panel waiting"><p class="eyebrow">CORE CHAIN COMPLETE</p><h1>从平衡候选，到协调真解</h1><p class="lead" style="margin-inline:auto">你已经完成：先判 → 受力数验 → 变形释理 → 全场迁移。</p><div class="formula">X<sub>1</sub> = 3ql / 8</div></section>`;
}

function drawLab(canvas, r, deformation, options = {}) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const system = options.system || (deformation ? "alignment" : "original");
  const showDiagrams = options.showDiagrams !== false;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#fbfaf6"; ctx.fillRect(0, 0, W, H);
  const x0 = 92, xB = 665, y0 = 128;
  ctx.strokeStyle = "#17221f"; ctx.lineWidth = 8; ctx.lineCap = "round";
  ctx.beginPath();
  for (let i = 0; i <= 80; i++) {
    const s = i/80, x = x0 + (xB-x0)*s;
    const v = deformation ? beamResponse(s, r).v * 1150 : 0;
    const y = y0 - v;
    i ? ctx.lineTo(x,y) : ctx.moveTo(x,y);
  }
  ctx.stroke();
  ctx.strokeStyle = "#174d61"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x0,y0-48); ctx.lineTo(x0,y0+54); ctx.stroke();
  for(let y=y0-43;y<y0+55;y+=13){ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x0-14,y+9);ctx.lineTo(x0,y);ctx.stroke();}

  const delta = r/3 - 1/8, movingY = y0 - (deformation ? delta*1150 : 0);
  ctx.strokeStyle = "#d76322"; ctx.fillStyle = "#d76322"; ctx.lineWidth = 2;
  for (let x = x0 + 45; x < xB; x += 58) {
    ctx.beginPath(); ctx.moveTo(x, y0 - 62); ctx.lineTo(x, y0 - 18); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 5, y0 - 27); ctx.lineTo(x, y0 - 17); ctx.lineTo(x + 5, y0 - 27); ctx.fill();
  }
  ctx.font = "italic 20px Cambria"; ctx.fillText("q", (x0 + xB) / 2, y0 - 70);

  if (system === "alignment") {
    ctx.setLineDash([6,6]); ctx.strokeStyle = "#9aa39e"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(xB,y0-30);ctx.lineTo(xB,y0+65);ctx.stroke();ctx.setLineDash([]);
    ctx.strokeStyle = "#9aa39e"; ctx.lineWidth = 5; ctx.beginPath();ctx.arc(xB,y0,11,0,Math.PI*2);ctx.stroke();
    ctx.strokeStyle = Math.abs(delta)<.004 ? "#2c6e58" : "#ef6b3b"; ctx.lineWidth = 5;ctx.beginPath();ctx.arc(xB,movingY,11,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle = "#64706a";ctx.font = "16px Microsoft YaHei";ctx.fillText("原支座销孔",xB-48,y0+86);
  } else if (system === "original") {
    ctx.strokeStyle = "#17221f"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(xB,y0,11,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(xB,y0+11); ctx.lineTo(xB,y0+43); ctx.stroke();
    ctx.beginPath(); ctx.arc(xB,y0+52,9,0,Math.PI*2); ctx.stroke();
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(xB-25,y0+65); ctx.lineTo(xB+25,y0+65); ctx.stroke();
    for(let x=xB-20;x<=xB+20;x+=10){ctx.beginPath();ctx.moveTo(x,y0+65);ctx.lineTo(x-8,y0+76);ctx.stroke();}
    ctx.fillStyle = "#17221f"; ctx.font = "18px Microsoft YaHei"; ctx.fillText("B",xB+18,y0+8);
  } else if (system === "basic") {
    ctx.strokeStyle = "#d76322"; ctx.fillStyle = "#d76322"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(xB,y0+58); ctx.lineTo(xB,y0+14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(xB-7,y0+26); ctx.lineTo(xB,y0+13); ctx.lineTo(xB+7,y0+26); ctx.fill();
    ctx.font = "italic 18px Cambria"; ctx.fillText("FyB",xB-6,y0+82);
    ctx.fillStyle = "#17221f"; ctx.font = "18px Microsoft YaHei"; ctx.fillText("B",xB+18,y0+8);
  }
  ctx.fillStyle = "#17221f";ctx.font = "700 17px Microsoft YaHei";ctx.fillText(`X₁ = ${r.toFixed(3)} ql`,W-175,36);

  if (!showDiagrams) return;
  const base1=270, base2=370;
  ctx.strokeStyle="#d9d1c3";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x0,base1);ctx.lineTo(xB,base1);ctx.moveTo(x0,base2);ctx.lineTo(xB,base2);ctx.stroke();
  ctx.fillStyle="#64706a";ctx.font="13px Microsoft YaHei";ctx.fillText("弯矩图 M / ql²",x0,base1-42);ctx.fillText("剪力图 Q / ql",x0,base2-42);
  ctx.strokeStyle="#ef6b3b";ctx.lineWidth=3;ctx.beginPath();
  for(let i=0;i<=80;i++){const s=i/80,m=forceCurveResponse("moment",r,s),x=x0+(xB-x0)*s,y=base1-m*120;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();
  ctx.strokeStyle="#174d61";ctx.beginPath();
  for(let i=0;i<=80;i++){const s=i/80,qv=r-(1-s),x=x0+(xB-x0)*s,y=base2-qv*58;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();
}

function colorWithAlpha(hex, alpha) {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${value >> 16},${value >> 8 & 255},${value & 255},${alpha})`;
}

function curveDash(style) {
  if (style === "dashed") return [18, 12];
  if (style === "dotted") return [3, 10];
  return [];
}

const DEFORMATION_COMPONENT_ASSETS = {
  uniform: { src: "/assets/force-story/scene/12.png", sourceWidth: 3240, beamX0: 141, beamXB: 2963, beamY: 590 },
  fyb: { src: "/assets/force-story/scene/13.png", sourceWidth: 3240, beamX0: 114, beamXB: 2963, beamY: 335 },
};
const THEORETICAL_FYB_RATIO = 3 / 8;
const deformationComponentImages = {};

function drawDecompositionStructure(canvas, mode, r) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const customStep = Number(currentState?.deformation_reveal_step || 0);
  const customConfig = deformationStepConfig(customStep);
  if (customConfig) {
    const numeric = customConfig.numeric;
    const isTopCurve = canvas.dataset.deformationSystem === "top";
    const responseRatio = isTopCurve ? THEORETICAL_FYB_RATIO : r;
    const curveX0 = isTopCurve ? numeric.topDeformationX0 : numeric.deformationX0;
    const curveXB = isTopCurve ? numeric.topDeformationXB : numeric.deformationXB;
    const curveBaseline = isTopCurve ? numeric.topDeformationBaseline : numeric.deformationBaseline;
    const curveScale = isTopCurve ? numeric.topDeformationScale : numeric.deformationScale;
    const curveLineWidth = isTopCurve ? numeric.topDeformationLineWidth : numeric.deformationLineWidth;
    const color = isTopCurve
      ? customConfig.styles.topColor
      : customConfig.styles.bottomColor;
    const baseCanvasHeight = Number(canvas.dataset.baseCanvasHeight || canvas.height);
    canvas.dataset.baseCanvasHeight = String(baseCanvasHeight);
    const points = [];
    for (let i = 0; i <= 100; i++) {
      const s = i / 100;
      const uniformShape = s * s * (6 - 4 * s + s * s) / 3;
      const fybShape = s * s * (3 - s) / 2;
      const amplitude = mode === "uniform"
        ? curveScale * uniformShape
        : mode === "fyb"
          ? -curveScale * responseRatio / THEORETICAL_FYB_RATIO * fybShape
          : curveScale * (uniformShape - responseRatio / THEORETICAL_FYB_RATIO * fybShape);
      points.push({
        x: curveX0 + (curveXB - curveX0) * s,
        y: curveBaseline + amplitude,
      });
    }
    const minimumY = Math.min(...points.map((point) => point.y));
    const maximumY = Math.max(...points.map((point) => point.y));
    const topPadding = Math.max(0, Math.ceil(-minimumY + curveLineWidth + 12));
    const bottomPadding = Math.max(0, Math.ceil(maximumY + curveLineWidth + 12 - baseCanvasHeight));
    const requiredCanvasHeight = baseCanvasHeight + topPadding + bottomPadding;
    if (canvas.width !== 1000 || canvas.height !== requiredCanvasHeight) {
      canvas.width = 1000;
      canvas.height = requiredCanvasHeight;
    }
    canvas.style.top = `${-topPadding / baseCanvasHeight * 100}%`;
    canvas.style.bottom = "auto";
    canvas.style.height = `${requiredCanvasHeight / baseCanvasHeight * 100}%`;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const isAiScan = customStep === 4 && aiDeformationProgress !== null;
    const finalPointIndex = isAiScan
      ? Math.max(0, Math.min(100, Math.floor(aiDeformationProgress * 100)))
      : 100;
    if (isAiScan) {
      ctx.save();
      ctx.lineWidth = 2.5;
      ctx.setLineDash([9, 6]);
      for (let index = 0; index <= finalPointIndex; index += 4) {
        const point = points[index];
        const beamY = curveBaseline + topPadding;
        const curveY = point.y + topPadding;
        const position = index / 100;
        const blend = Math.sin(Math.PI * position);
        const red = Math.round(215 + (47 - 215) * blend);
        const green = Math.round(99 + (109 - 99) * blend);
        const blue = Math.round(34 + (176 - 34) * blend);
        ctx.strokeStyle = `rgba(${red}, ${green}, ${blue}, .7)`;
        ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
        ctx.beginPath();
        ctx.moveTo(point.x, beamY);
        ctx.lineTo(point.x, curveY);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(point.x, beamY, 5.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.strokeStyle = color;
    ctx.lineCap = "round";
    ctx.lineWidth = curveLineWidth;
    ctx.setLineDash(curveDash(customConfig.styles.deformationLineStyle));
    ctx.beginPath();
    points.slice(0, finalPointIndex + 1).forEach((point, index) => {
      const y = point.y + topPadding;
      index ? ctx.lineTo(point.x, y) : ctx.moveTo(point.x, y);
    });
    ctx.stroke();
    if (isAiScan) {
      ctx.fillStyle = color;
      for (let index = 0; index <= finalPointIndex; index += 4) {
        const point = points[index];
        ctx.beginPath();
        ctx.arc(point.x, point.y + topPadding, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.setLineDash([]);
    return;
  }
  if (mode === "combined") return;
  const asset = DEFORMATION_COMPONENT_ASSETS[mode];
  const momentDisplayWidth = FORCE_ELEMENT_META.basicMomentBg.baseWidth * DEFORMATION_COMPARE_LAYOUT.basicMomentBg.scale;
  const structureDisplayWidth = FORCE_ELEMENT_META.basicStructure.baseWidth * DEFORMATION_COMPARE_LAYOUT.basicStructure.scale;
  // 10.png 宽 3221 px。按源图像素的实际显示比例配平，梁、支座和字母整体同尺度。
  const targetImageScale = momentDisplayWidth / 3221 * 1000 / structureDisplayWidth;
  const targetBeamSpan = (asset.beamXB - asset.beamX0) * targetImageScale;
  // 给图片右侧的 B 点与箭头预留完整空间。
  const xB = 929;
  const x0 = xB - targetBeamSpan;
  const beamY = 138;
  const color = mode === "uniform" ? "#800080" : "#008000";
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  let image = deformationComponentImages[mode];
  if (!image) {
    image = new Image();
    image.onload = () => forceStoryboardRefresh?.(Number(currentState?.deformation_reveal_step || 0));
    image.src = runtimeUrl(asset.src);
    deformationComponentImages[mode] = image;
  }
  if (image.complete && image.naturalWidth) {
    const scaleX = (xB - x0) / (asset.beamXB - asset.beamX0);
    // 12.png 的 q 紧贴图片上边缘；仅压缩其纵向比例，保持梁端和梁基线不变。
    const scaleY = mode === "uniform" ? Math.min(scaleX, (beamY - 4) / asset.beamY) : scaleX;
    const dx = x0 - asset.beamX0 * scaleX;
    const dy = beamY - asset.beamY * scaleY;
    ctx.drawImage(image, dx, dy, image.naturalWidth * scaleX, image.naturalHeight * scaleY);
    if (mode === "fyb") {
      // 13.png 自带静态 FyB；遮去该符号，改由页面上的完整动态标签统一呈现。
      ctx.fillStyle = "#fff";
      ctx.fillRect(dx + 2200 * scaleX, dy + 620 * scaleY, 650 * scaleX, 419 * scaleY);
    }
  }

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = "round";
  ctx.lineWidth = 8;
  ctx.beginPath();
  for (let i = 0; i <= 100; i++) {
    const s = i / 100;
    const shape = mode === "uniform"
      ? s * s * (6 - 4 * s + s * s) / 3
      : s * s * (3 - s) / 2;
    const amplitude = mode === "uniform" ? 92 : -92 * r / THEORETICAL_FYB_RATIO;
    const x = x0 + (xB - x0) * s;
    const y = beamY + amplitude * shape;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
}

function drawForceCurve(canvas, r, type, system, mode = "combined") {
  if (!canvas) return;
  const customConfig = type === "moment" ? deformationStepConfig() : null;
  const layout = customConfig?.numeric || forceLayout.numeric;
  const parentSlot = `${system}${type === "moment" ? "MomentBg" : "ShearBg"}`;
  const parentMeta = FORCE_ELEMENT_META[parentSlot];
  const baseCanvasHeight = Math.round(1000 / parentMeta.ratio);
  const baselineKey = `${system}${type === "moment" ? "Moment" : "Shear"}Baseline`;
  const beamY = customConfig
    ? (system === "original" ? layout.topMomentBaseline : layout.bottomMomentBaseline)
    : layout[baselineKey];
  const x0 = type === "moment" ? layout.momentX0 : layout.shearX0;
  const xB = type === "moment" ? layout.momentXB : layout.shearXB;
  const scale = type === "moment" ? layout.momentScale : layout.shearScale;
  // 屏幕 y 向下：只翻转绘图方向，力矩数值及符号保持原约定。
  const direction = type === "moment" ? -layout.momentDirection : 1;
  const color = customConfig
    ? (system === "original" ? customConfig.styles.topColor : customConfig.styles.bottomColor)
    : mode === "uniform"
      ? "#800080"
      : mode === "fyb"
        ? "#008000"
        : type === "moment" ? forceLayout.styles.momentColor : forceLayout.styles.shearColor;
  const lineStyle = customConfig
    ? customConfig.styles.momentLineStyle
    : type === "moment" ? forceLayout.styles.momentLineStyle : forceLayout.styles.shearLineStyle;
  const lineWidth = type === "moment" ? layout.momentLineWidth : layout.shearLineWidth;
  const points = [];
  for (let i = 0; i <= 120; i++) {
    const s = i / 120;
    const response = forceCurveResponse(type, r, s, mode);
    points.push({
      x: x0 + (xB - x0) * s,
      y: beamY + direction * response * scale,
    });
  }
  // 03-1～03-4 的弯矩曲线可能同时越过背景图上、下边界；双向扩展画布，不移动背景图。
  const minimumY = Math.min(...points.map((point) => point.y), beamY);
  const maximumY = Math.max(...points.map((point) => point.y), beamY);
  const topPadding = Math.max(0, Math.ceil(-minimumY + lineWidth + 12));
  const bottomPadding = Math.max(0, Math.ceil(maximumY + lineWidth + 12 - baseCanvasHeight));
  const requiredCanvasHeight = baseCanvasHeight + topPadding + bottomPadding;
  if (canvas.width !== 1000 || canvas.height !== requiredCanvasHeight) {
    canvas.width = 1000;
    canvas.height = requiredCanvasHeight;
  }
  canvas.style.top = `${-topPadding / baseCanvasHeight * 100}%`;
  canvas.style.bottom = "auto";
  canvas.style.height = `${requiredCanvasHeight / baseCanvasHeight * 100}%`;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  ctx.moveTo(x0, beamY + topPadding);
  points.forEach((point) => ctx.lineTo(point.x, point.y + topPadding));
  ctx.lineTo(xB, beamY + topPadding);
  ctx.closePath();
  ctx.fillStyle = colorWithAlpha(color, customConfig ? customConfig.styles.fillOpacity : .22);
  ctx.fill();
  ctx.beginPath();
  points.forEach((point, index) => {
    const y = point.y + topPadding;
    index ? ctx.lineTo(point.x, y) : ctx.moveTo(point.x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(curveDash(lineStyle));
  ctx.stroke();
  ctx.setLineDash([]);
}

const FORCE_LAYOUT_CONTROLS = [
  ["右侧控制列宽", "controlWidth", 200, 380, 1, "px"],
  ["右侧控制列高", "controlHeight", 240, 1000, 1, "px"],
  ["M图A端位置", "momentX0", 0, 300, 1, ""],
  ["M图B端位置", "momentXB", 650, 1000, 1, ""],
  ["M图纵向比例", "momentScale", 40, 600, 1, ""],
  ["FQ图A端位置", "shearX0", 0, 300, 1, ""],
  ["FQ图B端位置", "shearXB", 650, 1000, 1, ""],
  ["FQ图纵向比例", "shearScale", 30, 300, 1, ""],
  ["08 原结构M图基线", "originalMomentBaseline", 0, 381, 1, ""],
  ["09 原结构FQ图基线", "originalShearBaseline", 0, 382, 1, ""],
  ["10 基本体系M图基线", "basicMomentBaseline", 0, 295, 1, ""],
  ["11 基本体系FQ图基线", "basicShearBaseline", 0, 300, 1, ""],
  ["M图线宽", "momentLineWidth", 1, 12, .5, "px"],
  ["FQ图线宽", "shearLineWidth", 1, 12, .5, "px"],
];

const FORCE_ASSET_LABELS = Object.fromEntries(Object.entries(FORCE_ELEMENT_META).map(([slot, meta]) => [slot, `${meta.number} ${meta.label}`]));

function layoutControlHtml([label, key, min, max, step, unit]) {
  return `<label class="layout-control"><span>${label}<output data-layout-output="${key}"></output></span><input data-layout-key="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${forceLayout.numeric[key]}"/><input class="layout-number" data-layout-key="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${forceLayout.numeric[key]}"/><small>${unit}</small></label>`;
}

function elementAxisControlHtml(slot, key, label, min, max, step) {
  return `<label class="layout-control element-axis"><span>${label}<output data-element-output="${slot}.${key}"></output></span><input data-element-slot-control="${slot}" data-element-key="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${forceLayout.elements[slot][key]}"/><input class="layout-number" data-element-slot-control="${slot}" data-element-key="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${forceLayout.elements[slot][key]}"/><small>${key === "scale" ? "×" : ""}</small></label>`;
}

function elementControlHtml([slot, meta]) {
  return `<details class="element-control"><summary>${meta.number} ${meta.label}</summary>${elementAxisControlHtml(slot, "x", "左上角 X", 0, 1200, 1)}${elementAxisControlHtml(slot, "y", "左上角 Y", 0, 1000, 1)}${elementAxisControlHtml(slot, "scale", "Scale", .2, 2.5, .01)}</details>`;
}

function labelAxisControlHtml(slot, key, label, min, max, step) {
  return `<label class="layout-control element-axis"><span>${label}<output data-label-output="${slot}.${key}"></output></span><input data-label-slot-control="${slot}" data-label-key="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${forceLayout.labels[slot][key]}"/><input class="layout-number" data-label-slot-control="${slot}" data-label-key="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${forceLayout.labels[slot][key]}"/><small>${key === "scale" ? "×" : "%"}</small></label>`;
}

function labelControlHtml([slot, meta]) {
  const yLabel = meta.type === "fyb" ? "局部 Y" : "与曲线间距 Y";
  return `<details class="element-control"><summary>${meta.label}</summary>${labelAxisControlHtml(slot, "x", "局部 X", -100, 200, 1)}${labelAxisControlHtml(slot, "y", yLabel, -100, 200, 1)}${labelAxisControlHtml(slot, "scale", "Scale", .2, 3, .01)}</details>`;
}

function syncLayoutEditor() {
  document.querySelectorAll("[data-layout-key]").forEach((input) => {
    const key = input.dataset.layoutKey;
    input.value = String(forceLayout.numeric[key]);
  });
  document.querySelectorAll("[data-layout-output]").forEach((output) => {
    const key = output.dataset.layoutOutput;
    output.textContent = String(Math.round(forceLayout.numeric[key] * 100) / 100);
  });
  document.querySelectorAll("[data-element-slot-control]").forEach((input) => {
    input.value = String(forceLayout.elements[input.dataset.elementSlotControl][input.dataset.elementKey]);
  });
  document.querySelectorAll("[data-element-output]").forEach((output) => {
    const [slot, key] = output.dataset.elementOutput.split(".");
    output.textContent = String(Math.round(forceLayout.elements[slot][key] * 100) / 100);
  });
  document.querySelectorAll("[data-label-slot-control]").forEach((input) => {
    input.value = String(forceLayout.labels[input.dataset.labelSlotControl][input.dataset.labelKey]);
  });
  document.querySelectorAll("[data-label-output]").forEach((output) => {
    const [slot, key] = output.dataset.labelOutput.split(".");
    output.textContent = String(Math.round(forceLayout.labels[slot][key] * 100) / 100);
  });
  document.querySelectorAll("[data-style-key]").forEach((input) => {
    const key = input.dataset.styleKey;
    input.value = key === "momentDirection" ? String(forceLayout.numeric[key]) : forceLayout.styles[key];
  });
}

async function saveForceLayout() {
  const response = await fetch("/api/layout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teacher_token: layoutTeacherToken, layout: forceLayout }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "版面保存失败");
  forceLayout = payload.layout;
  applyForceLayout();
  syncLayoutEditor();
  showToast("版面配置已保存，正常课堂页面将自动使用");
}

function backupForceLayout() {
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  const blob = new Blob([`${JSON.stringify(forceLayout, null, 2)}\n`], { type: "application/json" });
  const link = document.createElement("a");
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = `beam-force-layout-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  showToast("当前配置文件已下载，请妥善保留");
}

async function uploadForceAsset(slot, file) {
  const extension = file?.name.toLowerCase().match(/\.(svg|png)$/)?.[1];
  const maximumBytes = extension === "png" ? 8 * 1024 * 1024 : 2 * 1024 * 1024;
  if (!file || !extension || file.size > maximumBytes) {
    throw new Error("请选择不超过2 MB的SVG，或不超过8 MB的PNG文件");
  }
  const contentType = extension === "png" ? "image/png" : "image/svg+xml";
  const response = await fetch(`/api/layout-asset?token=${encodeURIComponent(layoutTeacherToken)}&slot=${encodeURIComponent(slot)}`, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: await file.arrayBuffer(),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "素材上传失败");
  forceLayout.assets[slot] = payload.asset_url;
  document.querySelectorAll(`[data-force-asset="${slot}"]`).forEach((image) => {
    image.src = `${payload.asset_url}?v=${Date.now()}`;
  });
  await saveForceLayout();
}

const DEFORMATION_EDITOR_ELEMENTS = {
  topMoment: "上排左侧：弯矩图底图",
  topStructure: "上排右侧：结构图",
  bottomMoment: "下排左侧：弯矩图底图",
  bottomStructure: "下排右侧：结构与荷载图",
};

const DEFORMATION_EDITOR_LABELS = {
  topMA: "上排弯矩数值",
  topFyB: "上排 FyB 数值",
  bottomMA: "下排弯矩数值",
  bottomFyB: "下排 FyB 数值",
};

const DEFORMATION_EDITOR_NUMERIC = [
  ["弯矩图 A 端位置", "momentX0", 0, 300, 1],
  ["弯矩图 B 端位置", "momentXB", 650, 1000, 1],
  ["弯矩图纵向比例", "momentScale", 40, 600, 1],
  ["上排弯矩图基线", "topMomentBaseline", 0, 500, 1],
  ["下排弯矩图基线", "bottomMomentBaseline", 0, 500, 1],
  ["弯矩图线宽", "momentLineWidth", 1, 16, .5],
  ["下排变形曲线 A 端位置", "deformationX0", 0, 400, 1],
  ["下排变形曲线 B 端位置", "deformationXB", 600, 1000, 1],
  ["下排变形曲线基线", "deformationBaseline", 0, 500, 1],
  ["下排变形曲线纵向比例", "deformationScale", 10, 300, 1],
  ["下排变形曲线线宽", "deformationLineWidth", 1, 16, .5],
];

const TOP_DEFORMATION_EDITOR_NUMERIC = [
  ["上排曲线 A 端位置", "topDeformationX0", 0, 400, 1],
  ["上排曲线 B 端位置", "topDeformationXB", 600, 1000, 1],
  ["上排曲线基线", "topDeformationBaseline", 0, 500, 1],
  ["上排曲线纵向比例", "topDeformationScale", 10, 3000, 1],
  ["上排曲线线宽", "topDeformationLineWidth", 1, 16, .5],
];

const OFFLINE_DEFORMATION_LAYOUT_KEY = "beam-offline-deformation-layout-v2-sep13";

function deformationAxisHtml(group, slot, key, label, value, min, max, step) {
  return `<label class="layout-control element-axis"><span>${label}<output data-d-output="${group}.${slot}.${key}"></output></span><input data-d-group="${group}" data-d-slot="${slot}" data-d-key="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"/><input class="layout-number" data-d-group="${group}" data-d-slot="${slot}" data-d-key="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${value}"/></label>`;
}

function deformationElementEditorHtml(stepConfig, slot, label) {
  const item = stepConfig.elements[slot];
  return `<details class="element-control"><summary>${label}</summary>${deformationAxisHtml("elements", slot, "x", "左上角 X", item.x, 0, 1200, 1)}${deformationAxisHtml("elements", slot, "y", "左上角 Y", item.y, 0, 1000, 1)}${deformationAxisHtml("elements", slot, "scale", "Scale", item.scale, .2, 3, .01)}</details>`;
}

function deformationLabelEditorHtml(stepConfig, slot, label) {
  const item = stepConfig.labels[slot];
  return `<details class="element-control"><summary>${label}</summary>${deformationAxisHtml("labels", slot, "x", "局部 X", item.x, -100, 200, 1)}${deformationAxisHtml("labels", slot, "y", "局部 Y / 曲线间距", item.y, -100, 200, 1)}${deformationAxisHtml("labels", slot, "scale", "Scale", item.scale, .2, 3, .01)}</details>`;
}

function syncDeformationLayoutEditor(editor, stepConfig) {
  editor.querySelectorAll("[data-d-group]").forEach((input) => {
    const value = stepConfig[input.dataset.dGroup][input.dataset.dSlot][input.dataset.dKey];
    input.value = String(value);
  });
  editor.querySelectorAll("[data-d-output]").forEach((output) => {
    const [group, slot, key] = output.dataset.dOutput.split(".");
    output.textContent = String(Math.round(stepConfig[group][slot][key] * 100) / 100);
  });
  editor.querySelectorAll("[data-d-numeric]").forEach((input) => {
    input.value = String(stepConfig.numeric[input.dataset.dNumeric]);
  });
  editor.querySelectorAll("[data-d-numeric-output]").forEach((output) => {
    output.textContent = String(Math.round(stepConfig.numeric[output.dataset.dNumericOutput] * 100) / 100);
  });
  editor.querySelectorAll("[data-d-formula]").forEach((input) => {
    input.value = String(stepConfig.formula[input.dataset.dFormula]);
  });
  editor.querySelectorAll("[data-d-formula-output]").forEach((output) => {
    output.textContent = String(Math.round(stepConfig.formula[output.dataset.dFormulaOutput] * 100) / 100);
  });
  const formulaColor = editor.querySelector('[data-d-formula-color]');
  if (formulaColor) formulaColor.value = stepConfig.formula.color;
  editor.querySelector('[data-d-style="momentDirection"]').value = String(stepConfig.numeric.momentDirection);
  editor.querySelector('[data-d-style="topColor"]').value = stepConfig.styles.topColor;
  editor.querySelector('[data-d-style="bottomColor"]').value = stepConfig.styles.bottomColor;
  editor.querySelector('[data-d-style="momentLineStyle"]').value = stepConfig.styles.momentLineStyle;
  editor.querySelector('[data-d-style="deformationLineStyle"]').value = stepConfig.styles.deformationLineStyle;
  editor.querySelector('[data-d-style="fillOpacity"]').value = String(stepConfig.styles.fillOpacity);
}

async function saveDeformationLayout() {
  if (offlineMode) {
    localStorage.setItem(OFFLINE_DEFORMATION_LAYOUT_KEY, JSON.stringify(deformationLayout));
    updateDeformationReveal(currentState);
    showToast("03版面配置已保存到本机浏览器");
    return;
  }
  const response = await fetch("/api/deformation-layout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teacher_token: layoutTeacherToken, layout: deformationLayout }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "03版面保存失败");
  deformationLayout = payload.layout;
  updateDeformationReveal(currentState);
  showToast("03版面配置已保存");
}

function backupDeformationLayout() {
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  const blob = new Blob([`${JSON.stringify(deformationLayout, null, 2)}\n`], { type: "application/json" });
  const link = document.createElement("a");
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = `beam-deformation-layout-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  showToast("03版面配置已备份");
}

async function uploadDeformationAsset(step, slot, file) {
  const extension = file?.name.toLowerCase().match(/\.(svg|png)$/)?.[1];
  const maximumBytes = extension === "png" ? 8 * 1024 * 1024 : 2 * 1024 * 1024;
  if (!file || !extension || file.size > maximumBytes) throw new Error("请选择SVG或PNG文件");
  const contentType = extension === "png" ? "image/png" : "image/svg+xml";
  const uploadSlot = `d${step}_${slot}`;
  const response = await fetch(`/api/layout-asset?token=${encodeURIComponent(layoutTeacherToken)}&slot=${encodeURIComponent(uploadSlot)}`, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: await file.arrayBuffer(),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "图片上传失败");
  deformationLayout.steps[String(step)].assets[slot] = payload.asset_url;
  await saveDeformationLayout();
}

function createDeformationLayoutEditor(step) {
  const stepConfig = deformationLayout.steps[String(step)];
  const editor = document.createElement("aside");
  editor.id = "layoutEditor";
  editor.className = "layout-editor";
  const numericHtml = DEFORMATION_EDITOR_NUMERIC.map(([label, key, min, max, increment]) => {
    const effectiveMax = step === 4 && key === "deformationScale" ? 3000 : max;
    return `<label class="layout-control"><span>${label}<output data-d-numeric-output="${key}"></output></span><input data-d-numeric="${key}" type="range" min="${min}" max="${effectiveMax}" step="${increment}" value="${stepConfig.numeric[key]}"/><input class="layout-number" data-d-numeric="${key}" type="number" min="${min}" max="${effectiveMax}" step="${increment}" value="${stepConfig.numeric[key]}"/></label>`;
  }).join("");
  const topDeformationHtml = step === 4
    ? `<section><h3>上排固定真解曲线（<i>F</i><sub><i>yB</i></sub> = 3/8<i>ql</i>）</h3><p class="hint">该曲线不响应滑块，仅调整显示位置与大小。</p>${TOP_DEFORMATION_EDITOR_NUMERIC.map(([label, key, min, max, increment]) => `<label class="layout-control"><span>${label}<output data-d-numeric-output="${key}"></output></span><input data-d-numeric="${key}" type="range" min="${min}" max="${max}" step="${increment}" value="${stepConfig.numeric[key]}"/><input class="layout-number" data-d-numeric="${key}" type="number" min="${min}" max="${max}" step="${increment}" value="${stepConfig.numeric[key]}"/></label>`).join("")}</section>`
    : "";
  const formulaHtml = step >= 2 ? `<section><h3>变形公式：X、Y、Scale、颜色</h3>${[["X", "x", 0, 1200, 1], ["Y", "y", 0, 1000, 1], ["Scale", "scale", .2, 3, .01]].map(([label, key, min, max, increment]) => `<label class="layout-control"><span>${label}<output data-d-formula-output="${key}"></output></span><input data-d-formula="${key}" type="range" min="${min}" max="${max}" step="${increment}" value="${stepConfig.formula[key]}"/><input class="layout-number" data-d-formula="${key}" type="number" min="${min}" max="${max}" step="${increment}" value="${stepConfig.formula[key]}"/></label>`).join("")}<div class="style-grid"><label>公式颜色<input type="color" data-d-formula-color value="${stepConfig.formula.color}"/></label></div></section>` : "";
  editor.innerHTML = `<header><div><strong>03-${step} 版面调试</strong><small>四图独立配置，拖动即预览</small></div><div class="layout-editor-header-actions"><button class="secondary compact-button" id="closeLayoutEditor">关闭</button><button class="secondary compact-button" id="collapseLayoutEditor">收起</button></div></header><div class="layout-editor-body"><section><h3>四个图片：X、Y、Scale</h3>${Object.entries(DEFORMATION_EDITOR_ELEMENTS).map(([slot, label]) => deformationElementEditorHtml(stepConfig, slot, label)).join("")}</section><section><h3>弯矩图与下排变形曲线</h3>${numericHtml}<div class="style-grid"><label>弯矩方向<select data-d-style="momentDirection"><option value="1">当前方向</option><option value="-1">反向</option></select></label><label>上排颜色<input type="color" data-d-style="topColor"/></label><label>下排颜色<input type="color" data-d-style="bottomColor"/></label><label>弯矩图线型<select data-d-style="momentLineStyle"><option value="solid">实线</option><option value="dashed">虚线</option><option value="dotted">点线</option></select></label><label>变形曲线线型<select data-d-style="deformationLineStyle"><option value="solid">实线</option><option value="dashed">虚线</option><option value="dotted">点线</option></select></label><label>填充透明度<input data-d-style="fillOpacity" type="number" min="0" max="0.8" step="0.01"/></label></div></section>${topDeformationHtml}${formulaHtml}<section><h3>动态标注：X、Y、Scale</h3>${Object.entries(DEFORMATION_EDITOR_LABELS).map(([slot, label]) => deformationLabelEditorHtml(stepConfig, slot, label)).join("")}</section><section><h3>替换四张图片</h3>${Object.entries(DEFORMATION_EDITOR_ELEMENTS).map(([slot, label]) => `<label class="asset-upload"><span>${label}</span><input type="file" accept=".svg,.png,image/svg+xml,image/png" data-d-upload="${slot}"/></label>`).join("")}</section><div class="layout-editor-actions"><button class="primary" id="saveLayoutEditor">保存03-${step}版面</button><button class="secondary" id="backupLayoutEditor">备份配置文件</button></div></div>`;
  document.body.appendChild(editor);
  editor.querySelectorAll("[data-d-group]").forEach((input) => input.addEventListener("input", () => {
    stepConfig[input.dataset.dGroup][input.dataset.dSlot][input.dataset.dKey] = Number(input.value);
    updateDeformationReveal(currentState);
    syncDeformationLayoutEditor(editor, stepConfig);
  }));
  editor.querySelectorAll("[data-d-numeric]").forEach((input) => input.addEventListener("input", () => {
    stepConfig.numeric[input.dataset.dNumeric] = Number(input.value);
    updateDeformationReveal(currentState);
    syncDeformationLayoutEditor(editor, stepConfig);
  }));
  editor.querySelectorAll("[data-d-formula]").forEach((input) => input.addEventListener("input", () => {
    stepConfig.formula[input.dataset.dFormula] = Number(input.value);
    updateDeformationReveal(currentState);
    syncDeformationLayoutEditor(editor, stepConfig);
  }));
  editor.querySelector("[data-d-formula-color]")?.addEventListener("input", (event) => {
    stepConfig.formula.color = event.currentTarget.value;
    updateDeformationReveal(currentState);
    syncDeformationLayoutEditor(editor, stepConfig);
  });
  editor.querySelectorAll("[data-d-style]").forEach((input) => input.addEventListener("input", () => {
    const key = input.dataset.dStyle;
    if (key === "momentDirection") stepConfig.numeric[key] = Number(input.value);
    else if (key === "fillOpacity") stepConfig.styles[key] = Number(input.value);
    else stepConfig.styles[key] = input.value;
    updateDeformationReveal(currentState);
    syncDeformationLayoutEditor(editor, stepConfig);
  }));
  editor.querySelectorAll("[data-d-upload]").forEach((input) => input.addEventListener("change", async () => {
    try { await uploadDeformationAsset(step, input.dataset.dUpload, input.files[0]); }
    catch (error) { showToast(error.message || "图片上传失败"); }
    finally { input.value = ""; }
  }));
  editor.querySelector("#saveLayoutEditor").addEventListener("click", async () => {
    try { await saveDeformationLayout(); } catch (error) { showToast(error.message || "保存失败"); }
  });
  editor.querySelector("#backupLayoutEditor").addEventListener("click", backupDeformationLayout);
  editor.querySelector("#closeLayoutEditor").addEventListener("click", () => window.close());
  editor.querySelector("#collapseLayoutEditor").addEventListener("click", (event) => {
    const collapsed = editor.classList.toggle("collapsed");
    document.body.classList.toggle("layout-editor-collapsed", collapsed);
    event.currentTarget.textContent = collapsed ? "展开" : "收起";
  });
  syncDeformationLayoutEditor(editor, stepConfig);
}

function createLayoutEditor() {
  if (!layoutMode || document.querySelector("#layoutEditor")) return;
  if (layoutStage === 3 && (layoutStep === 1 || layoutStep === 2 || layoutStep === 3 || layoutStep === 4)) {
    createDeformationLayoutEditor(layoutStep);
    return;
  }
  const editor = document.createElement("aside");
  editor.id = "layoutEditor";
  editor.className = "layout-editor";
  editor.innerHTML = `<header><div><strong>版面调试</strong><small>拖动即预览，保存后全课堂生效</small></div><div class="layout-editor-header-actions"><button class="secondary compact-button" id="closeLayoutEditor">关闭调试页</button><button class="secondary compact-button" id="collapseLayoutEditor">收起</button></div></header>
    <div class="layout-editor-body">
      <section><h3>11个元素：X、Y与Scale</h3><p class="hint">坐标以1200×1000自由画布为基准，X、Y均指元素左上角。</p>${Object.entries(FORCE_ELEMENT_META).map(elementControlHtml).join("")}</section>
      <section><h3>6个动态标注：X、Y与Scale</h3><p class="hint">X为所属图片内的百分比位置；M图、FQ图标注的Y表示与曲线的间距，会随曲线自动升降。两处FyB仍使用普通局部Y。</p>${Object.entries(FORCE_LABEL_META).map(labelControlHtml).join("")}</section>
      <section><h3>内力图曲线</h3>${FORCE_LAYOUT_CONTROLS.map(layoutControlHtml).join("")}<div class="style-grid">
        <label>弯矩方向<select data-style-key="momentDirection"><option value="1">已翻转</option><option value="-1">反向</option></select></label>
        <label>弯矩颜色<input type="color" data-style-key="momentColor"/></label>
        <label>弯矩线型<select data-style-key="momentLineStyle"><option value="solid">实线</option><option value="dashed">虚线</option><option value="dotted">点线</option></select></label>
        <label>剪力颜色<input type="color" data-style-key="shearColor"/></label>
        <label>剪力线型<select data-style-key="shearLineStyle"><option value="solid">实线</option><option value="dashed">虚线</option><option value="dotted">点线</option></select></label>
      </div></section>
      <section><h3>替换11个SVG或PNG素材</h3><p class="hint">PNG建议透明背景。08—11只保留模型、支座、标签和模型基线，彩色曲线由滑块实时绘制。</p>${Object.entries(FORCE_ASSET_LABELS).map(([slot, label]) => `<label class="asset-upload"><span>${label}</span><input type="file" accept=".svg,.png,image/svg+xml,image/png" data-asset-upload="${slot}"/></label>`).join("")}</section>
      <div class="layout-editor-actions"><button class="primary" id="saveLayoutEditor">保存版面</button><button class="secondary" id="backupLayoutEditor">备份当前配置文件</button><button class="secondary reset-layout-button" id="resetLayoutEditor">恢复默认并保存</button></div>
    </div>`;
  document.body.appendChild(editor);
  editor.querySelectorAll("[data-layout-key]").forEach((input) => input.addEventListener("input", () => {
    forceLayout.numeric[input.dataset.layoutKey] = Number(input.value);
    applyForceLayout();
    syncLayoutEditor();
  }));
  editor.querySelectorAll("[data-element-slot-control]").forEach((input) => input.addEventListener("input", () => {
    forceLayout.elements[input.dataset.elementSlotControl][input.dataset.elementKey] = Number(input.value);
    applyForceLayout();
    syncLayoutEditor();
  }));
  editor.querySelectorAll("[data-label-slot-control]").forEach((input) => input.addEventListener("input", () => {
    forceLayout.labels[input.dataset.labelSlotControl][input.dataset.labelKey] = Number(input.value);
    applyForceLayout();
    syncLayoutEditor();
  }));
  editor.querySelectorAll("[data-style-key]").forEach((input) => input.addEventListener("input", () => {
    const key = input.dataset.styleKey;
    if (key === "momentDirection") forceLayout.numeric[key] = Number(input.value);
    else forceLayout.styles[key] = input.value;
    applyForceLayout();
    syncLayoutEditor();
  }));
  editor.querySelectorAll("[data-asset-upload]").forEach((input) => input.addEventListener("change", async () => {
    try {
      await uploadForceAsset(input.dataset.assetUpload, input.files[0]);
      showToast("素材已替换并保存");
    } catch (error) {
      showToast(error.message || "素材上传失败");
    } finally {
      input.value = "";
    }
  }));
  editor.querySelector("#saveLayoutEditor").addEventListener("click", async () => {
    try { await saveForceLayout(); } catch (error) { showToast(error.message || "版面保存失败"); }
  });
  editor.querySelector("#backupLayoutEditor").addEventListener("click", backupForceLayout);
  editor.querySelector("#resetLayoutEditor").addEventListener("click", async () => {
    if (!window.confirm("这会覆盖当前版面并立即保存。确认恢复默认设置吗？")) return;
    forceLayout = structuredClone(DEFAULT_FORCE_LAYOUT);
    renderForce();
    applyForceLayout();
    syncLayoutEditor();
    try { await saveForceLayout(); } catch (error) { showToast(error.message || "恢复失败"); }
  });
  editor.querySelector("#closeLayoutEditor").addEventListener("click", () => {
    if (!window.confirm("请确认已保存版面或备份配置文件。现在关闭调试页吗？")) return;
    window.close();
  });
  editor.querySelector("#collapseLayoutEditor").addEventListener("click", (event) => {
    const collapsed = editor.classList.toggle("collapsed");
    document.body.classList.toggle("layout-editor-collapsed", collapsed);
    event.currentTarget.textContent = collapsed ? "展开" : "收起";
  });
  syncLayoutEditor();
}

function elapsed(iso) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime())/1000));
  return `${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;
}

function voteBars(counts = {agree:0,doubt:0,unsure:0}) {
  const labels = {agree:"同意小智",doubt:"感觉怪怪的",unsure:"无法判断"};
  const total = Object.values(counts).reduce((a,b)=>a+b,0) || 1;
  return Object.entries(labels).map(([key,label]) => `<div class="vote-bar"><header><span>${label}</span><strong>${counts[key] || 0}</strong></header><div class="bar-track"><div class="bar-fill" style="width:${(counts[key]||0)/total*100}%"></div></div></div>`).join("");
}

function renderVoteComments(comments = [], visible = true) {
  const track = document.querySelector("#teacherCommentTrack");
  if (!track) return;
  const stream = track.closest(".comment-stream");
  stream.classList.toggle("paused", !visible);
  const items = visible ? (comments.length ? comments : ["等待学生补充观点……"]) : ["观点展示已关闭"];
  const signature = JSON.stringify(items);
  if (track.dataset.signature === signature) return;
  track.dataset.signature = signature;
  track.replaceChildren();
  items.forEach((comment) => {
    const chip = document.createElement("span");
    chip.className = "comment-chip";
    chip.textContent = comment;
    track.appendChild(chip);
  });
}

async function setTeacherStage(stage, returnToLast = false) {
  await api({ type: "set_stage", stage });
  if (returnToLast && stage === 2) await api({ type: "set_force_reveal", step: 3 });
  if (returnToLast && stage === 3) await api({ type: "set_deformation_reveal", step: 5 });
}

function renderTeacher(state) {
  const descriptions = ["学生扫码后等待", "以判断暴露初始理解", "以受力数验辨析平衡候选", "以位移协调重构理解"];
  if (!document.querySelector("#teacherCockpit")) {
    const roadmap = [0,1,2,3].map(stage => `<button class="roadmap-step" data-stage="${stage}"><span>0${stage}</span>${stageLabels[stage]}</button>`).join("");
    app.innerHTML = `<section class="teacher-cockpit" id="teacherCockpit">
      <div class="teacher-command-bar panel">
        <div><p class="eyebrow">教师控制台 · 单页运行</p><h2 id="teacherStageTitle"></h2><p class="hint" id="teacherStageDescription"></p></div>
        <div class="stage-nav"><button class="secondary" id="previousStage">上一步</button><button class="primary" id="nextStage">发布下一步</button><button class="vote-control end-vote" id="endVote">结束选择</button><button class="vote-control reopen-vote" id="reopenVote">重新开放</button><div class="force-reveal-grid" id="forceRevealGrid" aria-label="受力数验呈现进度">${[1,2,3,4,5].map(step => `<button type="button" data-force-reveal-step="${step}" aria-label="呈现到第${step}项">${step}</button>`).join("")}</div><button class="reveal-control" id="forceRevealNext">呈现下一项</button><button class="secondary" id="forceRevealReset">重置呈现</button><button class="secondary" id="focusPreview">放大学生预览</button>${layoutToolsEnabled ? `<button class="secondary" id="openLayoutEditor">版面调试</button>` : ""}</div>
      </div>
      <div class="stage-roadmap">${roadmap}</div>
      <div class="teacher-workspace">
        <div class="teacher-overview">
          <section class="panel teacher-pulse"><div class="pulse-heading"><div><p class="eyebrow">课堂脉搏</p><h2>实时投票反馈</h2></div><div><small>本阶段</small><div class="timer" id="stageTimer"></div></div></div>
            <div class="metric-grid"><div class="metric"><div class="big-number" id="participantCount"></div><small>已参与设备</small></div><div class="metric"><div class="big-number" id="voteCount"></div><small>已提交判断</small></div><div class="metric"><div class="big-number" id="forceCount"></div><small>已观察受力</small></div><div class="metric"><div class="big-number" id="alignmentCount"></div><small>已锁定真解</small></div></div>
            <div class="vote-bars" id="teacherVoteBars"></div>
            <div class="comment-tools"><span>匿名补充观点</span><div><button class="secondary compact-button" id="toggleComments">关闭展示</button><button class="secondary compact-button" id="clearComments">清空观点</button></div></div>
            <div class="comment-stream" aria-label="学生补充观点"><div class="comment-track" id="teacherCommentTrack"></div></div>
          </section>
          <section class="panel entry-compact"><img class="qr" src="${config.qr_url}" alt="学生端二维码"/><div><p class="eyebrow">学生入口</p><h2>一次扫码，全程不换页</h2><p class="url">${config.student_url}</p><div class="button-row"><button class="secondary" id="copyUrl">复制学生网址</button><button class="secondary" id="resetButton">重置试讲数据</button></div><p class="hint">教师预览不会写入投票或实验统计。</p></div></section>
        </div>
        <aside class="panel preview-panel"><div class="preview-heading"><div><p class="eyebrow">投屏演示视角</p><h2>学生端实时预览</h2></div><span class="preview-badge">只读 · 不计数</span></div>
          <div class="device-frame"><iframe id="studentPreview" title="学生端只读预览" src="${config.preview_url}"></iframe></div>
        </aside>
      </div>
    </section>`;
    document.querySelectorAll(".roadmap-step[data-stage]").forEach(button => button.addEventListener("click", () => setTeacherStage(Number(button.dataset.stage))));
    document.querySelector("#previousStage").addEventListener("click", () => setTeacherStage(Math.max(0,currentState.stage-1), true));
    document.querySelector("#nextStage").addEventListener("click", () => setTeacherStage(Math.min(3,currentState.stage+1)));
    document.querySelector("#endVote").addEventListener("click", () => api({type:"show_vote_feedback"}));
    document.querySelector("#reopenVote").addEventListener("click", () => api({type:"set_voting",open:true}));
    document.querySelector("#forceRevealNext").addEventListener("click", () => {
      if (currentState.stage === 3) {
        const supportsDeformationReveal = currentState.deformation_reveal_step != null;
        const currentStep = supportsDeformationReveal
          ? Number(currentState.deformation_reveal_step || 0)
          : (Number(currentState.force_reveal_step) === 1 ? 1 : 0);
        return api({
          type: supportsDeformationReveal ? "set_deformation_reveal" : "set_force_reveal",
          step: Math.min(5, currentStep + 1),
        });
      }
      return api({type:"set_force_reveal",step:Math.min(3,(currentState.force_reveal_step || 0)+1)});
    });
    document.querySelector("#forceRevealReset").addEventListener("click", () => api({
      type: currentState.stage === 3 && currentState.deformation_reveal_step != null ? "set_deformation_reveal" : "set_force_reveal",
      step: 0,
    }));
    document.querySelectorAll("[data-force-reveal-step]").forEach(button => button.addEventListener("click", () => api({
      type: currentState.stage === 3 ? "set_deformation_reveal" : "set_force_reveal",
      step: Number(button.dataset.forceRevealStep),
    })));
    document.querySelector("#focusPreview").addEventListener("click", (event) => {
      const focused = document.querySelector("#teacherCockpit").classList.toggle("preview-focus");
      event.currentTarget.textContent = focused ? "返回控制台" : "放大学生预览";
      document.querySelector("#studentPreview")?.contentWindow?.postMessage({type:"beam-preview-timer", running:focused}, location.protocol === "file:" ? "*" : location.origin);
    });
    document.querySelector("#resetButton").addEventListener("click", async () => { await api({type:"reset"}); showToast("试讲数据已重置"); });
    document.querySelector("#copyUrl").addEventListener("click", async () => { await navigator.clipboard.writeText(config.student_url); showToast("学生网址已复制"); });
    document.querySelector("#openLayoutEditor")?.addEventListener("click", () => {
      const editorUrl = new URL(config.layout_url, location.href);
      editorUrl.searchParams.set("edit", "1");
      if (currentState.stage === 3) {
        const step = Number(currentState.deformation_reveal_step || 0);
        if (step < 1) {
          showToast("请先切换到03的第1至第4格");
          return;
        }
        editorUrl.searchParams.set("layout_stage", "3");
        editorUrl.searchParams.set("layout_step", String(step));
      }
      window.open(editorUrl.toString(), "_blank", "noopener");
    });
    document.querySelector("#studentPreview").addEventListener("load", () => {
      const focused = document.querySelector("#teacherCockpit").classList.contains("preview-focus");
      document.querySelector("#studentPreview")?.contentWindow?.postMessage({type:"beam-preview-timer", running:focused}, location.protocol === "file:" ? "*" : location.origin);
    });
    document.querySelector("#toggleComments").addEventListener("click", () => api({type:"toggle_comments", visible:!currentState.comments_visible}));
    document.querySelector("#clearComments").addEventListener("click", async () => { await api({type:"clear_comments"}); showToast("补充观点已清空"); });
    clearInterval(timerHandle); timerHandle = setInterval(() => { const el=document.querySelector("#stageTimer"); if(el) el.textContent=elapsed(currentState.stage_started_at); },1000);
  }
  document.querySelector("#teacherStageTitle").textContent = `0${state.stage} · ${stageLabels[state.stage]}`;
  document.querySelector("#teacherStageDescription").textContent = descriptions[state.stage];
  document.querySelector("#stageTimer").textContent = elapsed(state.stage_started_at);
  document.querySelector("#participantCount").textContent = state.participants;
  document.querySelector("#voteCount").textContent = state.progress.votes;
  document.querySelector("#forceCount").textContent = state.progress.force;
  document.querySelector("#alignmentCount").textContent = state.progress.alignments;
  document.querySelector("#teacherVoteBars").innerHTML = voteBars(state.vote_counts);
  renderVoteComments(state.vote_comments || [], state.comments_visible !== false);
  document.querySelector("#teacherCockpit").classList.toggle("vote-feedback-mode", state.stage === 1 && state.vote_feedback_visible === true);
  document.querySelector("#toggleComments").textContent = state.comments_visible === false ? "开启展示" : "关闭展示";
  document.querySelectorAll(".roadmap-step[data-stage]").forEach(button => button.classList.toggle("current", Number(button.dataset.stage) === state.stage));
  document.querySelector("#previousStage").disabled = state.stage === 0;
  const endVote = document.querySelector("#endVote");
  const reopenVote = document.querySelector("#reopenVote");
  endVote.hidden = state.stage !== 1;
  reopenVote.hidden = state.stage !== 1;
  endVote.disabled = state.voting_open === false;
  reopenVote.disabled = state.voting_open !== false;
  const forceRevealNext = document.querySelector("#forceRevealNext");
  const forceRevealReset = document.querySelector("#forceRevealReset");
  const forceRevealGrid = document.querySelector("#forceRevealGrid");
  const revealStep = state.stage === 3
    ? (state.deformation_reveal_step == null ? (Number(state.force_reveal_step) === 1 ? 1 : 0) : Number(state.deformation_reveal_step || 0))
    : (state.force_reveal_step || 0);
  const revealMax = state.stage === 3 ? 5 : 3;
  forceRevealGrid.hidden = state.stage !== 2 && state.stage !== 3;
  forceRevealGrid.setAttribute("aria-label", state.stage === 3 ? "协调释理呈现进度" : "受力数验呈现进度");
  forceRevealGrid.querySelectorAll("[data-force-reveal-step]").forEach(button => {
    const step = Number(button.dataset.forceRevealStep);
    button.hidden = state.stage === 2 && step > 3;
    const currentRevealStep = state.stage === 3 ? revealStep : Number(state.force_reveal_step || 0);
    const active = step <= currentRevealStep;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  forceRevealNext.hidden = true;
  forceRevealReset.hidden = state.stage !== 2 && state.stage !== 3;
  forceRevealNext.disabled = revealStep >= revealMax;
  forceRevealReset.disabled = revealStep === 0;
  forceRevealNext.textContent = `呈现下一项 ${revealStep}/${revealMax}`;
  const nextButton = document.querySelector("#nextStage");
  nextButton.disabled = state.stage === 3;
  nextButton.textContent = state.stage === 3 ? "完成探究 · 返回PPT" : `下一步：${stageLabels[state.stage + 1]}`;
}

function renderStudent() {
  [renderWaiting, renderVote, renderForce, renderDeformation][Math.min(currentState.stage, 3)]();
  mountSelfGuidedNavigation();
}

function selfGuidedStep(stage = currentState.stage) {
  if (stage === 2) return Math.max(0, Math.min(3, Number(currentState.force_reveal_step || 0)));
  if (stage === 3) return Math.max(0, Math.min(5, Number(currentState.deformation_reveal_step || 0)));
  return 0;
}

function selfGuidedNavigationHtml() {
  const stage = Number(currentState.stage || 1);
  const step = selfGuidedStep(stage);
  const substepMax = stage === 2 ? 3 : stage === 3 ? 5 : 0;
  const stageButtons = [1, 2, 3].map(number => `
    <button type="button" class="self-stage-button${number === stage ? " current" : ""}" data-self-stage="${number}">
      <span>0${number}</span>${stageLabels[number]}
    </button>`).join("");
  const substeps = substepMax ? `<div class="self-substeps" aria-label="0${stage}阶段步骤">
    <span class="self-substeps-label">0${stage}步骤</span>
    <div class="force-reveal-grid">${Array.from({ length: substepMax }, (_, index) => {
      const number = index + 1;
      return `<button type="button" class="${number <= step ? "active" : ""}" data-self-step="${number}" aria-label="进入0${stage}第${number}步" aria-pressed="${number === step}">${number}</button>`;
    }).join("")}</div>
  </div>` : `<p class="self-guide-hint">提交判断后，可进入02逐步观察。</p>`;
  const atStart = stage === 1;
  const atEnd = stage === 3 && step === 5;
  return `<nav class="self-guided-nav panel" aria-label="学生自主探究导航">
    <div class="self-stage-roadmap">${stageButtons}</div>
    <div class="self-step-control">${substeps}<div class="self-nav-actions">
      <button type="button" class="secondary" data-self-nav="previous" ${atStart ? "disabled" : ""}>上一步</button>
      <button type="button" class="primary" data-self-nav="next" ${atEnd ? "disabled" : ""}>${atEnd ? "探究完成" : "下一步"}</button>
    </div></div>
  </nav>`;
}

async function setSelfGuidedPosition(targetStage, targetStep = 0) {
  const stage = Math.max(1, Math.min(3, Number(targetStage || 1)));
  const stageChanged = stage !== currentState.stage;
  if (stageChanged) await api({ type: "set_stage", stage });
  if (stage === 2) await api({ type: "set_force_reveal", step: Math.max(0, Math.min(3, Number(targetStep || 0))) });
  if (stage === 3) await api({ type: "set_deformation_reveal", step: Math.max(0, Math.min(5, Number(targetStep || 0))) });
  document.body.dataset.stage = String(currentState.stage);
  if (stageChanged) {
    renderStudent();
    lastStage = currentState.stage;
  } else {
    if (stage === 2) updateForceReveal(currentState);
    if (stage === 3) updateDeformationReveal(currentState);
    mountSelfGuidedNavigation();
  }
}

function mountSelfGuidedNavigation() {
  if (!isSelfGuidedStudent) return;
  document.querySelector(".self-guided-nav")?.remove();
  app.insertAdjacentHTML("afterbegin", selfGuidedNavigationHtml());
  document.querySelectorAll("[data-self-stage]").forEach(button => button.addEventListener("click", () => {
    const stage = Number(button.dataset.selfStage);
    const step = 0;
    setSelfGuidedPosition(stage, step);
  }));
  document.querySelectorAll("[data-self-step]").forEach(button => button.addEventListener("click", () => {
    setSelfGuidedPosition(currentState.stage, Number(button.dataset.selfStep));
  }));
  document.querySelector('[data-self-nav="previous"]')?.addEventListener("click", () => {
    const stage = currentState.stage;
    const step = selfGuidedStep(stage);
    if (stage === 3 && step > 0) return setSelfGuidedPosition(3, step - 1);
    if (stage === 3) return setSelfGuidedPosition(2, 3);
    if (stage === 2 && step > 0) return setSelfGuidedPosition(2, step - 1);
    if (stage === 2) return setSelfGuidedPosition(1, 0);
  });
  document.querySelector('[data-self-nav="next"]')?.addEventListener("click", () => {
    const stage = currentState.stage;
    const step = selfGuidedStep(stage);
    if (stage === 1) return setSelfGuidedPosition(2, 0);
    if (stage === 2 && step < 3) return setSelfGuidedPosition(2, step + 1);
    if (stage === 2) return setSelfGuidedPosition(3, 0);
    if (stage === 3 && step < 5) return setSelfGuidedPosition(3, step + 1);
  });
}

async function tick() {
  try {
    const loadedState = await loadState();
    const state = layoutMode
      ? layoutStage === 3 && (layoutStep === 1 || layoutStep === 2 || layoutStep === 3 || layoutStep === 4)
        ? { ...loadedState, stage: 3, deformation_reveal_step: layoutStep }
        : { ...loadedState, stage: 2, force_reveal_step: 5 }
      : loadedState;
    currentState = state;
    document.body.dataset.stage = String(state.stage);
    if (isPreview && state.stage !== lastStage) {
      previewSeconds = 0;
      previewStartedAt = Date.now();
    }
    if (layoutMode) {
      sessionPill.textContent = "教师版面调试 · 不计入课堂数据";
    } else if (isPreview) {
      sessionPill.innerHTML = `<span>0${state.stage} · ${stageLabels[state.stage]}</span><strong>${previewElapsed()}</strong>`;
    } else {
      sessionPill.textContent = `${role === "teacher" ? "教师端" : "学生端"} · ${state.session_id}`;
    }
    if (role === "teacher") renderTeacher(state);
    else if (state.stage !== lastStage) renderStudent();
    else if (state.stage === 1 && Boolean(state.vote_feedback_visible) !== lastVoteFeedback) renderStudent();
    else if (state.stage === 1) updateVoteAvailability(state);
    else if (state.stage === 2) updateForceReveal(state);
    else if (state.stage === 3) updateDeformationReveal(state);
    lastStage = state.stage;
    lastVoteFeedback = Boolean(state.vote_feedback_visible);
  } catch (error) {
    sessionPill.textContent = "正在重连";
  }
}

async function start() {
  if (offlineMode) {
    config = {
      qr_url: offlineConfig.studentQr || `${offlineRuntime.assetBase}/student-qr.svg`,
      student_url: offlineConfig.studentUrl || "请先配置学生页网址",
      preview_url: offlineRuntime.previewUrl || "./teacher.html?preview=1",
      layout_url: offlineRuntime.previewUrl || "./teacher.html?preview=1",
    };
    forceLayout = structuredClone(window.BEAM_OFFLINE_FORCE_LAYOUT || DEFAULT_FORCE_LAYOUT);
    let savedDeformationLayout = null;
    try {
      savedDeformationLayout = JSON.parse(localStorage.getItem(OFFLINE_DEFORMATION_LAYOUT_KEY) || "null");
    } catch {}
    deformationLayout = normalizeDeformationLayout(structuredClone(savedDeformationLayout || window.BEAM_OFFLINE_DEFORMATION_LAYOUT || null));
    applyForceLayout();
    createLayoutEditor();
    await tick();
    setInterval(tick, role === "teacher" ? 600 : 1000);
    return;
  }
  const configQuery = role === "teacher"
    ? `?token=${encodeURIComponent(teacherToken)}`
    : layoutMode
      ? `?token=${encodeURIComponent(layoutTeacherToken)}`
    : `?key=${encodeURIComponent(studentKey)}`;
  config = await fetch(`/api/config${configQuery}`).then(response => {
    if (!response.ok) throw new Error("课堂入口无效");
    return response.json();
  });
  forceLayout = await fetch("/force-layout.json", { cache: "no-store" })
    .then(response => response.ok ? response.json() : structuredClone(DEFAULT_FORCE_LAYOUT))
    .catch(() => structuredClone(DEFAULT_FORCE_LAYOUT));
  deformationLayout = await fetch("/deformation-layout.json", { cache: "no-store" })
    .then(response => response.ok ? response.json() : null)
    .then(normalizeDeformationLayout)
    .catch(() => null);
  applyForceLayout();
  createLayoutEditor();
  await tick();
  setInterval(tick, role === "teacher" ? 1200 : 1000);
}

start().catch(() => {
  sessionPill.textContent = "连接失败";
  app.innerHTML = `<section class="panel waiting"><p class="eyebrow">CONNECTION ERROR</p><h1>课堂入口暂时不可用</h1><p class="lead" style="margin-inline:auto">请关闭当前页面，由教师重新运行 start-public.cmd，并使用新生成的完整网址或二维码进入。</p></section>`;
});


