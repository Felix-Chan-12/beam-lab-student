/* BEAM LAB · 版面调试 v4（static/layout-tuner.js）
 *
 * 用法：
 *   teacher.html          正常上课：套用 static/layout-overrides.js 里保存的版面。
 *   teacher.html?edit=1   打开调试：
 *                          · 控制台（普通视图）：调控制台本身——顶部栏、命令条、二维码区、学生预览整体的位置与大小；
 *                            学生预览只显示整页缩略图，不能改页面内容。
 *                          · 点「放大学生预览」后：调页面内容（每一页的每个元素），也可切回去调顶部 / 控制台。
 *   teacher.html?preview=1&tune=1   在单独的标签页里调页面内容。
 *   student.html          学生页：套用保存的版面。手机上（宽度 <700px）先继承教师版宽屏档的画布排布，再套用手机版面。
 *   student-edit.html     （或 student.html?edit=1）在电脑上按手机尺寸调 student.html 的手机版面。
 *
 * 页面内容的调整按「页」保存（00 等待、01 E、01 E 反馈、A1-0…A1-3、A2-0…A2-5），可选「只改本页 / 本阶段通用 /
 * 所有页通用」；并按宽度分档（宽屏 ≥1300px、中屏 1000–1299px、窄屏 700–999px；手机 <700px 只对 student.html）。
 */
(function () {
  "use strict";

  /* ---------- 运行环境 ---------- */
  const runtime = window.BEAM_OFFLINE || {};
  const hostConfig = window.BEAM_TUNER_HOST || null; // student-edit.html：手机版面调试的外壳页
  const params = new URLSearchParams(location.search);
  const role = runtime.role || "";
  const embedded = window.parent !== window;
  const appEl = document.getElementById("app");
  const isConsole = role === "teacher";
  const isPreview = role === "student" && params.get("preview") === "1";
  const isSelfGuided = role === "student" && !isPreview && runtime.selfGuided === true; // student.html
  const consoleEdit = isConsole && params.get("edit") === "1";
  const pageTune = isPreview && params.get("tune") === "1";
  const phoneTune = isSelfGuided && embedded && params.get("tune") === "1";

  const FILE_NAME = "layout-overrides.js";
  const FILE_URL = `./static/${FILE_NAME}`;
  // 本地打开时，所有文件夹共用同一个浏览器存储；按文件夹区分，避免不同副本互相串。
  const SCOPE = (() => { const dir = location.pathname.replace(/[^/]*$/, ""); try { return decodeURIComponent(dir); } catch (_) { return dir; } })();
  const DRAFT_KEY = `beam-layout-tuner-draft-v1:${SCOPE}`;
  const SAVED_KEY = `beam-layout-tuner-saved-v1:${SCOPE}`;
  const FOCUS_SIZE_KEY = `beam-layout-tuner-focus-size-v1:${SCOPE}`;
  const UI_KEY = "beam-layout-tuner-ui-v2";
  const STYLE_ID = "beam-layout-overrides";
  const IMG_STYLE_ID = "beam-layout-overrides-images";
  const IDB_NAME = "beam-layout-tuner";
  const IDB_STORE = "handles";
  const IDB_HANDLE_KEY = `overridesFile:${SCOPE}`;
  const CONSOLE_KEYS = ["CONSOLE", "CONSOLE-OVERVIEW", "CONSOLE-FOCUS"];
  // 控制台套上平板外框（body.beam-frame）后，这几项换了位置和样子（顶部栏 → 面板下沿小字，命令条 → 银色面板）：
  // 它们原来的调整（不论哪种视图）只在没有外框（?frame=0）时生效；外框里的银色面板、护角另有自己的调整项。
  const FRAME_OWNED = new Set(["c:topbar", "c:brand", "c:brandMark", "c:pill", "c:cmdbar"]);
  const frameOn = () => Boolean(document.body && document.body.classList.contains("beam-frame"));
  // E 投票反馈页的人数（A / B / C 各几人）：存在配置文件的 votes 里（不分宽窄档、不分页），教师版和学生页都用这组数。
  // 选中「统计区」「人数方块」「票数条」时，窗口里多出三行人数。
  const VOTE_PROPS = { voteA: "agree", voteB: "doubt", voteC: "unsure" };
  const VOTE_DEFS = new Set(["fbSummary", "fbTotal", "fbBars"]);

  const REGIMES = {
    wide: { label: "宽屏", range: "≥1300px", mq: "(min-width: 1300px)" },
    medium: { label: "中屏", range: "1000–1299px", mq: "(min-width: 1000px) and (max-width: 1299.98px)" },
    narrow: { label: "窄屏", range: "700–999px", mq: "(min-width: 700px) and (max-width: 999.98px)" },
    // 手机档只对学生页（student.html）生效：先继承教师版宽屏档的画布排布，再叠加这里的调整。
    phone: { label: "手机", range: "<700px", mq: "(max-width: 699.98px)" },
  };
  // 当前页面参与匹配的档位（教师页没有手机档）。
  const ACTIVE_REGIMES = isSelfGuided ? ["phone", "wide", "medium", "narrow"] : ["wide", "medium", "narrow"];
  const PHONE_TEXT_K = 0.6; // 手机上画布里文字的默认比例（相对 18/24/32px）
  const PHONE_DEVICES = [
    { key: "iphone15", label: "iPhone 14 / 15（390×844）", w: 390, h: 844 },
    { key: "iphoneSE", label: "iPhone SE（375×667）", w: 375, h: 667 },
    { key: "iphonePM", label: "iPhone 15 Pro Max（430×932）", w: 430, h: 932 },
    { key: "android", label: "常见安卓（360×800）", w: 360, h: 800 },
  ];

  const PAGES = [
    ["WAIT", "00 等待"],
    ["E", "01 E 投票"],
    ["E-FB", "01 E 投票反馈"],
    ["A1-0", "02 A1-0 先看原结构的受力"],
    ["A1-1", "02 A1-1 切开竖向链杆"],
    ["A1-2", "02 A1-2 用力保留链杆作用"],
    ["A1-3", "02 A1-3 比较切开前后内力图"],
    ["A2-0", "03 A2-0 切开时拿走了什么"],
    ["A2-1", "03 A2-1 均布荷载单独作用"],
    ["A2-2", "03 A2-2 均布荷载引起的位移"],
    ["A2-3", "03 A2-3 FyB 单独作用"],
    ["A2-4", "03 A2-4 叠加 · AI 辅助计算"],
    ["A2-5", "03 A2-5 B 点位移表达式"],
  ];
  const PHONE_PAGES = PAGES.filter(([key]) => key !== "WAIT"); // 学生页没有「等待」页
  // 「本阶段通用」的分组：E（投票、反馈两页）、A1（四步）、A2（六步）。
  const GROUPS = { E: "01 E 两页", A1: "02 A1 四步", A2: "03 A2 六步" };
  const groupOf = (pageKey) => (pageKey === "E" || pageKey === "E-FB" ? "E" : /^A1-/.test(pageKey) ? "A1" : /^A2-/.test(pageKey) ? "A2" : "");
  // 同一元素在几个范围里都有调整时：本页 > 本阶段 > 所有页（控制台：当前视图 > 两种视图通用）。
  const bucketRank = (key) => (key === "ALL" || key === "CONSOLE" ? 0 : key.startsWith("G:") ? 1 : 2);

  const PROPS = {
    left: { label: "X 位置", unit: "%", min: -20, max: 120, step: 0.1, digits: 1 },
    top: { label: "Y 位置", unit: "%", min: -20, max: 120, step: 0.1, digits: 1 },
    width: { label: "宽度", unit: "%", min: 2, max: 150, step: 0.1, digits: 1 },
    wpx: { label: "宽度", unit: "px", min: 20, max: 2400, step: 1, digits: 0 },
    hpx: { label: "高度", unit: "px", min: 10, max: 2000, step: 1, digits: 0 },
    h: { label: "高度", unit: "%", min: 2, max: 150, step: 0.1, digits: 1 },
    size: { label: "大小", unit: "px", min: 10, max: 600, step: 1, digits: 0 },
    dx: { label: "左右偏移", unit: "px", min: -800, max: 800, step: 1, digits: 0 },
    dy: { label: "上下偏移", unit: "px", min: -800, max: 800, step: 1, digits: 0 },
    mt: { label: "上方留白", unit: "px", min: -200, max: 400, step: 1, digits: 0 },
    mb: { label: "下方留白", unit: "px", min: -200, max: 400, step: 1, digits: 0 },
    pt: { label: "内上留白", unit: "px", min: 0, max: 300, step: 1, digits: 0 },
    px: { label: "内左右留白", unit: "px", min: 0, max: 300, step: 1, digits: 0 },
    pb: { label: "内下留白", unit: "px", min: 0, max: 300, step: 1, digits: 0 },
    gap: { label: "内部间距", unit: "px", min: 0, max: 300, step: 1, digits: 0 },
    order: { label: "排列顺序", unit: "", min: -5, max: 5, step: 1, digits: 0 },
    text: { label: "文字大小", unit: "%", min: 30, max: 300, step: 1, digits: 0 },
    ar: { label: "宽高比", unit: "", min: 0.5, max: 6, step: 0.001, digits: 3 },
    colR: { label: "右栏宽度", unit: "px", min: 120, max: 900, step: 1, digits: 0 },
    heroL: { label: "左栏占比", unit: "%", min: 15, max: 85, step: 0.5, digits: 1 },
    minH: { label: "最小高度", unit: "px", min: 0, max: 600, step: 1, digits: 0 },
    gsize: { label: "大小", unit: "px", min: 40, max: 400, step: 1, digits: 0 },
    voteA: { label: "A 人数", unit: "人", min: 0, max: 200, step: 1, digits: 0 },
    voteB: { label: "B 人数", unit: "人", min: 0, max: 200, step: 1, digits: 0 },
    voteC: { label: "C 人数", unit: "人", min: 0, max: 200, step: 1, digits: 0 },
    // 统一坐标（界面上显示的数）：原点在页面左上角，单位 px。实际存储见下面。
    x: { label: "X 坐标", unit: "px", min: 0, max: 2000, step: 1, digits: 0, virtual: true },
    y: { label: "Y 坐标", unit: "px", min: 0, max: 2400, step: 1, digits: 0, virtual: true },
    w: { label: "宽度", unit: "px", min: 4, max: 2400, step: 1, digits: 0, virtual: true },
    hh: { label: "高度", unit: "px", min: 2, max: 2000, step: 1, digits: 0, virtual: true },
    // 画布里的元素：相对画布左上角的位置、宽高，单位 vw（页面宽度的 1%），各页同一数值 = 同一位置，屏幕大小变化时一起缩放。
    lvw: { hidden: true, digits: 4 },
    tvw: { hidden: true, digits: 4 },
    wvw: { hidden: true, digits: 4 },
    hvw: { hidden: true, digits: 4 },
    // 保存时画布的宽、高（vw），用来把位置换算成画布的百分比，给手机版面继承。
    kw: { hidden: true, digits: 4 },
    kh: { hidden: true, digits: 4 },
  };

  const KIND_PROPS = {
    main: ["x", "y", "width", "hpx", "mt", "mb", "text"],
    panel: ["x", "y", "wpx", "hpx", "pt", "px", "pb", "mt", "mb", "gap", "order", "text"],
    hero: ["heroL", "gap", "hpx", "mt", "mb", "text"],
    comp: ["colR", "gap", "mt", "mb"],
    canvas: ["ar", "width", "x", "y", "mt", "text"],
    abs: ["x", "y", "w"],
    abstext: ["x", "y", "w", "text"],
    label: ["dx", "dy", "text"],
    arrow: ["x", "y", "hh"],
    bar: ["x", "y", "w"],
    group: ["x", "y", "wpx", "hpx", "mt", "mb", "gap", "order", "text"],
    box: ["x", "y", "wpx", "hpx", "pt", "px", "pb", "mt", "mb", "order", "text"],
    row: ["minH", "gap", "text"],
    text: ["x", "y", "wpx", "hpx", "mt", "mb", "order", "text"],
    circle: ["x", "y", "size", "mt", "mb", "order", "text"],
    fpanel: ["hpx"],
    guard: ["gsize"],
  };
  // 画布里（绝对定位）的元素：坐标、宽高存成相对画布的 vw；其他元素的坐标存成相对原位置的移动量（dx、dy）。
  const CANVAS_KINDS = new Set(["abs", "abstext", "arrow", "bar"]);
  // 手机版面从教师版（宽屏档）继承的属性：只继承按比例表示的位置、大小，px 数值和左右分栏不继承。
  const INHERIT_PROPS = {
    canvas: ["ar"],
    abs: ["left", "top", "width"],
    abstext: ["left", "top", "width", "text"],
    arrow: ["left", "top", "h"],
    bar: ["left", "top", "width"],
    label: ["text"],
  };

  // 拖动手柄对应的尺寸属性：w 宽、h 高、both 等宽高、scale 按比例缩放文字。
  const KIND_DIMS = {
    main: { w: "width", h: "hpx" },
    panel: { w: "wpx", h: "hpx" },
    hero: { h: "hpx" },
    comp: {},
    canvas: { w: "width", h: "ar" },
    abs: { w: "w" },
    abstext: { w: "w" },
    label: { scale: "text" },
    arrow: { h: "hh" },
    bar: { w: "w" },
    group: { w: "wpx", h: "hpx" },
    box: { w: "wpx", h: "hpx" },
    row: {},
    text: { w: "wpx", h: "hpx" },
    circle: { both: "size" },
    fpanel: { h: "hpx" },
    guard: { both: "gsize" },
  };

  const KIND_TIPS = {
    main: "整块内容的位置、宽度、高度和上下留白。四条边都可以拖：拖哪一边，哪一边动，对边不动。设了高度后，里面的内容跟着填满（E 页两栏变高；A1、A2 页画布变高或变矮）。最矮只到里面的内容放得下为止，再往小就停住。",
    canvas: "拖右下角同时改宽和高；宽高比越大，画布越扁。「文字大小」会一起缩放画布里的全部文字。",
    abs: "图片高度按比例自动变化。设成「本阶段 / 所有页通用」后，各页的这张图在同一坐标、同样大小。",
    abstext: "设成「本阶段 / 所有页通用」后，各页的这段文字在同一坐标。",
    label: "位置由程序跟着数值自动计算，这里调的是在自动位置上的偏移；拖右下角可以放大缩小。",
    arrow: "设成「本阶段 / 所有页通用」后，各页的箭头在同一坐标。",
    bar: "设成「本阶段 / 所有页通用」后，各页的分隔线在同一坐标。",
    hero: "左栏占比决定左右两栏的宽度分配。",
    comp: "右栏宽度只在显示右侧控制栏的页面有效。",
    fpanel: "银色面板的高度（拖下边也行）。屏幕跟着变矮或变高，整个外框始终正好一屏。",
    guard: "两个护角一起调大小（拖右下角 ◢ 也行）；阶段名和右边的按钮会跟着让开。",
  };

  const FORCE_SLOTS = [
    ["originalEquation", "01 上部平衡方程"],
    ["originalStructure", "02 原结构图"],
    ["conceptOriginal", "03 圆一：原约束"],
    ["conceptReleased", "04 圆二：解除约束"],
    ["conceptRedundant", "05 圆三：力代约束"],
    ["basicEquation", "06 下部平衡方程"],
    ["basicStructure", "07 基本体系图"],
    ["originalMomentBg", "08 上方弯矩图"],
    ["originalShearBg", "09 上方剪力图"],
    ["basicMomentBg", "10 下方弯矩图"],
    ["basicShearBg", "11 下方剪力图"],
  ];
  const FORCE_LABELS = [
    ["originalFyB", "上方 FyB 数值"],
    ["basicFyB", "下方 FyB 数值"],
    ["originalMA", "上方 MA 数值"],
    ["basicMA", "下方 MA 数值"],
    ["originalFyA", "上方 FyA 数值"],
    ["basicFyA", "下方 FyA 数值"],
  ];

  const PAGE_REGISTRY = [
    { key: "main", label: "页面主体", sel: "#app", kind: "main" },
    { key: "waitPanel", label: "等待面板", sel: "#app > .waiting", kind: "panel" },
    { key: "waitPulse", label: "B 圆标", sel: "#app .waiting .pulse", kind: "circle" },
    { key: "waitEyebrow", label: "小标题", sel: "#app .waiting .eyebrow", kind: "text" },
    { key: "waitTitle", label: "标题", sel: "#app .waiting h1", kind: "text" },
    { key: "waitLead", label: "说明文字", sel: "#app .waiting .lead", kind: "text" },
    { key: "hero", label: "左右两栏", sel: "#app > .hero", kind: "hero" },
    { key: "leftPanel", label: "左栏面板", sel: "#app .hero > article.panel", kind: "panel" },
    { key: "leftTitle", label: "左栏标题", sel: "#app .hero > article.panel > h1", kind: "text" },
    { key: "options", label: "选项组", sel: "#app .options", kind: "group" },
    { key: "optionAll", label: "三个选项按钮", sel: "#app .options > .option", kind: "box" },
    { key: "submitRow", label: "提交行", sel: "#app .vote-submit-row", kind: "group" },
    { key: "voteInput", label: "补充想法输入框", sel: "#app #voteComment", kind: "box" },
    { key: "voteSubmit", label: "提交按钮", sel: "#app #submitVote", kind: "box" },
    { key: "fbSummary", label: "统计区", sel: "#app .student-feedback-summary", kind: "group" },
    { key: "fbTotal", label: "人数方块", sel: "#app .student-feedback-total", kind: "box" },
    { key: "fbBars", label: "票数条", sel: "#app .student-vote-bars", kind: "group" },
    { key: "fbComments", label: "匿名观点区", sel: "#app .student-feedback-comments", kind: "group" },
    { key: "rightPanel", label: "右栏面板", sel: "#app .hero > aside.panel", kind: "panel" },
    { key: "rightTitle", label: "右栏标题", sel: "#app .hero > aside.panel > h2", kind: "text" },
    { key: "rightSubtitle", label: "右栏小标题", sel: "#app .hero > aside.panel > h3", kind: "text" },
    { key: "rightLead", label: "右栏说明文字", sel: "#app .hero > aside.panel > .lead", kind: "text" },
    { key: "equations", label: "平衡方程框", sel: "#app .equilibrium-system", kind: "box" },
    { key: "candidates", label: "三组候选解", sel: "#app .candidate-solutions", kind: "group" },
    { key: "candidateRows", label: "候选解每一行", sel: "#app .candidate-row", kind: "row" },
    { key: "symbolNotes", label: "符号说明", sel: "#app .symbol-notes", kind: "group" },
    { key: "story", label: "外框（四周留白）", sel: "#app > .force-story", kind: "panel" },
    { key: "storyTitle", label: "标题", sel: "#app .force-story > h1", kind: "text" },
    { key: "composition", label: "画布与右栏的布局", sel: "#app .force-composition", kind: "comp" },
    { key: "canvas", label: "画布白框", sel: "#app .force-free-canvas", kind: "canvas" },
    ...FORCE_SLOTS.map(([slot, label]) => ({ key: `slot:${slot}`, label, sel: `#app .force-free-canvas > [data-element-slot="${slot}"]`, kind: "abs" })),
    ...FORCE_LABELS.map(([slot, label]) => ({ key: `label:${slot}`, label, sel: `#app [data-force-label-slot="${slot}"]`, kind: "label" })),
    { key: "momentTitleTop", label: "上方「弯矩图」小标题", sel: '#app [data-element-slot="originalMomentBg"] > .moment-diagram-title', kind: "abstext" },
    { key: "momentTitleBottom", label: "下方「弯矩图」小标题", sel: '#app [data-element-slot="basicMomentBg"] > .moment-diagram-title', kind: "abstext" },
    { key: "captionTop", label: "上方图注", sel: "#app .force-free-canvas > .structure-caption.top-caption", kind: "abstext" },
    { key: "captionBottom", label: "下方图注", sel: "#app .force-free-canvas > .structure-caption.bottom-caption", kind: "abstext" },
    { key: "arrow", label: "过渡箭头", sel: "#app .force-free-canvas > .force-transition-arrow", kind: "arrow" },
    { key: "divider", label: "上下分隔线", sel: "#app .force-free-canvas > .deformation-row-divider", kind: "bar" },
    { key: "formula", label: "位移公式", sel: "#app .force-free-canvas > .deformation-formula-label", kind: "abstext" },
    { key: "trendLabel", label: "「变形趋势示意」", sel: "#app .deformation-trend-label", kind: "abstext" },
    { key: "zeroLabel", label: "「ΔB = 0」", sel: "#app .deformation-zero-label", kind: "abstext" },
    { key: "endpointLabel", label: "端点「ΔB」标注", sel: "#app .endpoint-label", kind: "label" },
    { key: "controls", label: "右侧控制栏", sel: "#app .force-controls", kind: "group" },
    { key: "controlCard", label: "滑块卡片", sel: "#app .force-control", kind: "panel" },
    { key: "aiCard", label: "AI 辅助计算卡片", sel: "#app .ai-deformation-card", kind: "panel" },
    { key: "rangeRow", label: "滑块行", sel: "#app .force-control .range-row", kind: "group" },
    { key: "specials", label: "三个特殊值按钮", sel: "#app .special-candidates", kind: "group" },
    { key: "readouts", label: "读数区", sel: "#app .force-control .readouts", kind: "group" },
    { key: "readoutBoxes", label: "读数方块（全部）", sel: "#app .force-control .readout", kind: "box" },
    { key: "hint", label: "提示文字", sel: "#app .force-control .hint", kind: "text" },
  ];
  // 默认应用范围：各页都有的「外框、标题、右侧控制栏」默认所有页通用；E 阶段的两栏默认 E 两页通用；
  // 画布里的图和标注各页排布不同，默认只改本页。选中元素后可以随时改。
  const ALL_SCOPE_KEYS = new Set(["main", "story", "storyTitle", "composition", "controls", "controlCard", "aiCard", "rangeRow", "specials", "readouts", "readoutBoxes", "hint"]);
  const GROUP_SCOPE_KEYS = new Set(["hero", "leftPanel", "leftTitle", "options", "optionAll", "submitRow", "voteInput", "voteSubmit", "fbSummary", "fbTotal", "fbBars", "fbComments", "rightPanel", "rightTitle", "rightSubtitle", "rightLead", "equations", "candidates", "candidateRows", "symbolNotes"]);
  PAGE_REGISTRY.forEach((def) => { def.scope = ALL_SCOPE_KEYS.has(def.key) ? "all" : GROUP_SCOPE_KEYS.has(def.key) ? "group" : "page"; });

  // 学生页（手机）独有的顶部栏与导航。
  const STUDENT_REGISTRY = [
    { key: "s:topbar", label: "顶部栏", sel: "body > .topbar", kind: "box" },
    { key: "s:brand", label: "左上品牌", sel: "body > .topbar > .brand", kind: "group" },
    { key: "s:brandMark", label: "「B」方块", sel: "body > .topbar .brand-mark", kind: "circle" },
    { key: "s:brandName", label: "「BEAM LAB」字样", sel: "body > .topbar .brand strong", kind: "text" },
    { key: "s:pill", label: "右上状态标签", sel: "#sessionPill", kind: "box" },
    { key: "s:nav", label: "导航面板", sel: "#app > .self-guided-nav", kind: "panel" },
    { key: "s:navStages", label: "01–03 阶段按钮组", sel: "#app .self-stage-roadmap", kind: "group" },
    { key: "s:navStage", label: "阶段按钮（全部）", sel: "#app .self-stage-button", kind: "box" },
    { key: "s:navControl", label: "步骤与翻页行", sel: "#app .self-step-control", kind: "group" },
    { key: "s:navSteps", label: "步骤区", sel: "#app .self-substeps", kind: "group" },
    { key: "s:navStepLabel", label: "「0x步骤」字样", sel: "#app .self-substeps-label", kind: "text" },
    { key: "s:navStepBtn", label: "步骤小方块（全部）", sel: "#app .self-substeps .force-reveal-grid > button", kind: "box" },
    { key: "s:navHint", label: "导航提示文字", sel: "#app .self-guide-hint", kind: "text" },
    { key: "s:navActions", label: "上一步 / 下一步", sel: "#app .self-nav-actions", kind: "group" },
    { key: "s:navPrev", label: "「上一步」", sel: '#app [data-self-nav="previous"]', kind: "box" },
    { key: "s:navNext", label: "「下一步」", sel: '#app [data-self-nav="next"]', kind: "box" },
    { key: "s:continue", label: "「进入02」按钮", sel: "#continueFromFeedback", kind: "box" },
  ];
  STUDENT_REGISTRY.forEach((def, index) => { def.scope = "all"; def.section = index === 0 ? "顶部栏与导航（各页都有）" : ""; });

  // shared: true = 普通视图和放大预览里都生效（顶部栏、命令条）。
  const CONSOLE_REGISTRY = [
    { key: "c:topbar", label: "顶部栏", sel: "body > .topbar", kind: "box", shared: true },
    { key: "c:brand", label: "左上品牌", sel: "body > .topbar > .brand", kind: "group", shared: true },
    { key: "c:brandMark", label: "「B」方块", sel: "body > .topbar .brand-mark", kind: "circle", shared: true },
    { key: "c:pill", label: "右上状态标签", sel: "#sessionPill", kind: "box", shared: true },
    { key: "c:main", label: "控制台主体", sel: "#app", kind: "main" },
    // sel 用来在页面上找元素；cssSel（有的话）是调整写进样式时用的选择器。
    { key: "c:cmdbar", label: "命令条", sel: "body:not(.beam-frame) #teacherCockpit > .teacher-command-bar", cssSel: "#teacherCockpit > .teacher-command-bar", kind: "panel", shared: true },
    { key: "c:panel", label: "银色面板（外框底部）", sel: "body.beam-frame #teacherCockpit > .teacher-command-bar", cssSel: "body.beam-frame #teacherCockpit", kind: "fpanel", shared: true },
    { key: "c:guards", label: "下方两个橙色护角", sel: "body.beam-frame #teacherCockpit .frame-guard", cssSel: "body.beam-frame #teacherCockpit > .teacher-command-bar", kind: "guard", shared: true },
    { key: "c:stageTitle", label: "阶段标题", sel: "#teacherStageTitle", kind: "text", shared: true },
    { key: "c:stageNav", label: "按钮组", sel: "#teacherCockpit .stage-nav", kind: "group", shared: true },
    { key: "c:prev", label: "「上一步」", sel: "#previousStage", kind: "box", shared: true },
    { key: "c:next", label: "「下一步」", sel: "#nextStage", kind: "box", shared: true },
    { key: "c:endVote", label: "「结束选择」", sel: "#endVote", kind: "box", shared: true },
    { key: "c:reopenVote", label: "「重新开放」", sel: "#reopenVote", kind: "box", shared: true },
    { key: "c:revealGrid", label: "进度格", sel: "#forceRevealGrid", kind: "group", shared: true },
    { key: "c:revealReset", label: "「重置呈现」", sel: "#forceRevealReset", kind: "box", shared: true },
    { key: "c:focusBtn", label: "「放大学生预览 / 返回控制台」", sel: "#focusPreview", kind: "box", shared: true },
    { key: "c:tuneBtn", label: "「版面调试」按钮", sel: "#openLayoutEditor", kind: "box", shared: true },
    { key: "c:roadmap", label: "阶段路线（00–03）", sel: "#teacherCockpit > .stage-roadmap", kind: "group" },
    { key: "c:roadSteps", label: "路线格（全部）", sel: "#teacherCockpit .stage-roadmap > .roadmap-step", kind: "box" },
    { key: "c:workspace", label: "下方工作区（左右比例）", sel: "#teacherCockpit > .teacher-workspace", kind: "hero" },
    { key: "c:entry", label: "学生入口面板", sel: "#teacherCockpit .entry-compact", kind: "panel" },
    { key: "c:qr", label: "二维码", sel: "#teacherCockpit .entry-compact .qr", kind: "circle" },
    { key: "c:entryTitle", label: "「学生入口」", sel: "#teacherCockpit .entry-compact h2", kind: "text" },
    { key: "c:entryText", label: "入口说明", sel: "#teacherCockpit .entry-compact h2 + p", kind: "text" },
    { key: "c:url", label: "学生网址", sel: "#teacherCockpit .entry-compact .url", kind: "text" },
    { key: "c:entryButtons", label: "「自主设计的」「AI虚拟实验室」", sel: "#teacherCockpit .entry-compact .button-row", kind: "group" },
    { key: "c:preview", label: "学生预览（整体）", sel: "#teacherCockpit .preview-panel", kind: "panel" },
    { key: "c:previewHead", label: "「投屏演示视角」标签行", sel: "#teacherCockpit .preview-heading", kind: "group" },
  ];

  // 这些内容由程序实时生成或随状态变化，不能改成固定文字。
  const DYNAMIC_SEL = [
    "[data-force-live-value]", "[data-force-value]", "[data-force-readouts]", ".readouts", ".readout",
    "[data-deformation-formula]", ".vote-bar", ".student-vote-bars", ".student-feedback-total",
    "[data-ai-deformation-status]", "[data-ai-deformation-button]", "#voteStatus",
    "#teacherStageTitle", "#nextStage", "#focusPreview", "#forceRevealNext", "#sessionPill", ".url",
    ".student-feedback-comments", '[data-self-nav="next"]',
  ].join(",");
  const INTERACTIVE_SEL = "button, input, select, textarea, a, iframe, [data-vote]";

  const ANCHOR_ATTRS = ["data-element-slot", "data-force-label-slot", "data-vote", "data-special-candidate", "data-force-channel", "data-force-reveal-step", "data-stage", "data-self-nav", "data-self-stage", "data-self-step"];
  const FLAG_ATTRS = ["data-force-top-caption", "data-force-bottom-caption", "data-structure-caption", "data-deformation-divider", "data-force-transition-arrow", "data-force-compare-decoration", "data-force-readouts", "data-special-candidates", "data-ai-deformation-card", "data-ai-deformation-button", "data-ai-deformation-status", "data-deformation-formula", "data-deformation-trend-label", "data-deformation-zero-label", "data-force-value", "data-force-slider"];
  const SKIP_CLASS = /^(selected|active|current|show|closed|collapsed|math-variable|zero|preview-focus)$/;
  const INLINE_TAGS = new Set(["I", "B", "EM", "SUB", "SUP", "BR"]);

  /* ---------- 通用工具 ---------- */
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const round = (value, digits) => { const f = 10 ** digits; return Math.round(value * f) / f; };
  const px = (value) => { const n = parseFloat(value); return Number.isFinite(n) ? n : 0; };
  const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cssString = (text) => String(text).replace(/["\\]/g, "\\$&");
  const hash = (text) => { let h = 5381; for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  const isConsoleKey = (key) => CONSOLE_KEYS.includes(key);

  function canon(value) {
    if (Array.isArray(value)) return `[${value.map(canon).join(",")}]`;
    if (value && typeof value === "object") return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canon(value[k])}`).join(",")}}`;
    return JSON.stringify(value);
  }
  function sortedClone(value) {
    if (Array.isArray(value)) return value.map(sortedClone);
    if (value && typeof value === "object") return Object.keys(value).sort().reduce((o, k) => { o[k] = sortedClone(value[k]); return o; }, {});
    return value;
  }
  function cleanSource(html) {
    return String(html)
      .replace(/<template data-beam-mark[^>]*><\/template>/g, "")
      .replace(/<i class="math-variable">([\s\S]*?)<\/i>/g, "$1");
  }

  /* ---------- 数据 ---------- */
  function emptyData() { return { version: 3, regimes: {} }; }
  function entryHasContent(entry) {
    return Boolean(entry && ((entry.props && Object.keys(entry.props).length) || typeof entry.text === "string" || entry.img));
  }
  function cleanData(data) {
    for (const regimeKey of Object.keys(data.regimes)) {
      const pages = data.regimes[regimeKey];
      for (const pageKey of Object.keys(pages)) {
        const entries = pages[pageKey];
        for (const entryKey of Object.keys(entries)) {
          const entry = entries[entryKey];
          if (entry && entry.props) {
            for (const p of Object.keys(entry.props)) if (!Number.isFinite(entry.props[p])) delete entry.props[p];
            // 没有 vw 位置了，就不用再记画布大小
            const v = entry.props;
            if (v.lvw == null && v.tvw == null && v.wvw == null && v.hvw == null) { delete v.kw; delete v.kh; }
          }
          if (!entryHasContent(entry)) delete entries[entryKey];
        }
        if (!Object.keys(entries).length) delete pages[pageKey];
      }
      if (!Object.keys(pages).length) delete data.regimes[regimeKey];
    }
    return data;
  }
  function toAbsSel(sel) {
    if (!sel) return "#app";
    if (sel.startsWith(">")) return `#app ${sel}`;
    if (/^(#|html|body)/.test(sel)) return sel;
    return `#app ${sel}`;
  }
  // 投票人数：三个不小于 0 的整数，缺了或不对就不用。
  function normVotes(raw) {
    if (!raw || typeof raw !== "object") return null;
    const out = {};
    for (const key of Object.values(VOTE_PROPS)) {
      const n = Math.round(Number(raw[key]));
      if (!Number.isFinite(n) || n < 0) return null;
      out[key] = n;
    }
    return out;
  }
  function normalize(raw) {
    const out = emptyData();
    const votes = normVotes(raw && raw.votes);
    if (votes) out.votes = votes;
    if (!raw || typeof raw !== "object" || !raw.regimes || typeof raw.regimes !== "object") return out;
    const legacy = Number(raw.version || 1) < 2;
    for (const regimeKey of Object.keys(REGIMES)) {
      const pages = raw.regimes[regimeKey];
      if (!pages || typeof pages !== "object") continue;
      out.regimes[regimeKey] = {};
      for (const [pageKey, entries] of Object.entries(pages)) {
        if (!entries || typeof entries !== "object") continue;
        const target = out.regimes[regimeKey][pageKey] = {};
        for (const [entryKey, entry] of Object.entries(entries)) {
          if (!entry || typeof entry !== "object" || typeof entry.sel !== "string") continue;
          if (entry.added) continue; // v3 的「新增文字 / 图片」已取消
          const props = {};
          for (const [p, v] of Object.entries(entry.props || {})) if (PROPS[p] && Number.isFinite(Number(v))) props[p] = Number(v);
          const kind = KIND_PROPS[entry.kind] ? entry.kind : "box";
          const item = { sel: legacy ? toAbsSel(entry.sel) : entry.sel, label: String(entry.label || entryKey), kind, props };
          if (typeof entry.text === "string") item.text = entry.text;
          if (typeof entry.img === "string" && /^data:image\//.test(entry.img)) {
            item.img = entry.img;
            if (typeof entry.imgSel === "string") item.imgSel = entry.imgSel;
            if (Number.isFinite(Number(entry.imgRatio))) item.imgRatio = Number(entry.imgRatio);
            if (entry.ratioVar) item.ratioVar = true;
          }
          target[entryKey] = item;
        }
      }
    }
    return cleanData(out);
  }

  function readBaseText() {
    const cs = getComputedStyle(document.documentElement);
    const get = (name, fallback) => { const v = parseFloat(cs.getPropertyValue(name)); return Number.isFinite(v) && v > 0 ? v : fallback; };
    return { small: get("--text-small", 18), body: get("--text-body", 24), title: get("--text-title", 32) };
  }
  const BASE_TEXT = readBaseText();

  /* ---------- 生成覆盖样式 ---------- */
  // 作用范围：本页 [data-beam-page]、本阶段 [data-beam-group]、所有页 [data-beam-view="page"]、控制台两种视图 [data-beam-console]。
  // 这几种写法的优先级（specificity）相同，生成时按「所有页 → 本阶段 → 本页」的顺序排列，后面的覆盖前面的。
  function scopeFor(bucketKey, regimeKey) {
    const base = regimeKey === "phone" ? "html body.self-guided-page" : "html body";
    if (bucketKey === "CONSOLE") return `${base}[data-beam-console]`;
    if (bucketKey === "ALL") return `${base}[data-beam-view="page"]`;
    if (bucketKey.startsWith("G:")) return `${base}[data-beam-group="${cssString(bucketKey.slice(2))}"]`;
    return `${base}[data-beam-page="${cssString(bucketKey)}"]`;
  }
  // 选择器以 body 开头时，与作用范围里的 body 合并。
  function scoped(scope, sel) {
    return /^body(?![\w-])/.test(sel) ? `${scope}${sel.slice(4)}` : `${scope} ${sel}`;
  }
  // 文字大小：相对默认字号的比例；var(--beam-k) 是手机画布里的默认比例（教师页没有，按 1 计）。
  function textVars(k) {
    const I = " !important";
    return [
      `--text-small: calc(${BASE_TEXT.small}px * ${k} * var(--beam-k, 1))${I}`,
      `--text-body: calc(${BASE_TEXT.body}px * ${k} * var(--beam-k, 1))${I}`,
      `--text-title: calc(${BASE_TEXT.title}px * ${k} * var(--beam-k, 1))${I}`,
    ];
  }
  function declarations(entry, only) {
    const all = entry.props || {};
    const p = only ? only.reduce((o, key) => { if (all[key] != null) o[key] = all[key]; return o; }, {}) : all;
    const d = [];
    const I = " !important";
    // 画布里的元素：vw（统一坐标）优先，旧数据里的 % 仍然有效。
    if (p.lvw != null) d.push(`left: ${p.lvw}vw${I}`, `right: auto${I}`);
    else if (p.left != null) d.push(`left: ${p.left}%${I}`, `right: auto${I}`);
    if (p.tvw != null) d.push(`top: ${p.tvw}vw${I}`, `bottom: auto${I}`);
    else if (p.top != null) d.push(`top: ${p.top}%${I}`, `bottom: auto${I}`);
    if (p.wvw != null) d.push(`width: ${p.wvw}vw${I}`, `max-width: none${I}`);
    else if (p.width != null) {
      d.push(`width: ${p.width}%${I}`, `max-width: none${I}`);
      if (entry.kind === "main") d.push(`margin-left: auto${I}`, `margin-right: auto${I}`);
    }
    if (p.wpx != null) d.push(`width: ${p.wpx}px${I}`, `max-width: none${I}`, `min-width: 0${I}`);
    // 外框的银色面板：高度写成变量（写在屏幕上），屏幕和面板一起跟着变。
    if (p.hpx != null && entry.kind === "fpanel") d.push(`--fr-panel: ${p.hpx}px${I}`);
    else if (p.hpx != null) {
      // 页面主体最矮到里面的内容放得下为止，内容不会露到页面主体外面。
      d.push(`height: ${p.hpx}px${I}`, `min-height: ${entry.kind === "main" ? "min-content" : "0"}${I}`, `max-height: none${I}`);
      if (entry.kind === "main") d.push(`display: flex${I}`, `flex-direction: column${I}`);
    }
    if (p.hvw != null) d.push(`height: ${p.hvw}vw${I}`);
    else if (p.h != null) d.push(`height: ${p.h}%${I}`);
    if (p.size != null) d.push(`width: ${p.size}px${I}`, `height: ${p.size}px${I}`, `max-width: none${I}`);
    // 左右、上下偏移分开存（不同范围可以各管一个），见 buildCss 开头的 @property。
    if (p.dx != null) d.push(`--beam-dx: ${p.dx}px${I}`);
    if (p.dy != null) d.push(`--beam-dy: ${p.dy}px${I}`);
    if (p.dx != null || p.dy != null) d.push(`translate: var(--beam-dx, 0px) var(--beam-dy, 0px)${I}`);
    if (p.mt != null) d.push(`margin-top: ${p.mt}px${I}`);
    if (p.mb != null) d.push(`margin-bottom: ${p.mb}px${I}`);
    if (p.pt != null) d.push(`padding-top: ${p.pt}px${I}`);
    if (p.px != null) d.push(`padding-left: ${p.px}px${I}`, `padding-right: ${p.px}px${I}`);
    if (p.pb != null) d.push(`padding-bottom: ${p.pb}px${I}`);
    if (p.gap != null) d.push(`gap: ${p.gap}px${I}`);
    if (p.order != null) d.push(`order: ${p.order}${I}`);
    if (p.text != null) d.push(...textVars(round(p.text / 100, 4)));
    if (p.ar != null) d.push(`aspect-ratio: ${p.ar}${I}`);
    if (p.colR != null) d.push(`grid-template-columns: minmax(0, 1fr) ${p.colR}px${I}`);
    if (p.heroL != null) d.push(`grid-template-columns: minmax(0, ${p.heroL}fr) minmax(0, ${round(100 - p.heroL, 2)}fr)${I}`);
    if (p.minH != null) d.push(`min-height: ${p.minH}px${I}`);
    if (p.gsize != null) d.push(`--fr-guard-b: ${p.gsize}px${I}`);
    if (entry.img && entry.ratioVar && entry.imgRatio) d.push(`--element-ratio: ${round(entry.imgRatio, 5)}${I}`);
    return d.join("; ");
  }
  // 页面主体设了高度：里面的主要内容填满这个高度（E 页两栏、等待面板变高；A1、A2 页画布变高，这时画布的宽高比不起作用）。
  function fillRules(entry, sel) {
    if (entry.kind !== "main" || !entry.props || entry.props.hpx == null) return "";
    const I = " !important";
    return [
      `${sel} > :last-child { flex: 1 1 auto${I}; min-height: 0${I}; }`,
      `${sel} .force-story { display: flex${I}; flex-direction: column${I}; }`,
      `${sel} .force-story > .force-composition { flex: 1 1 auto${I}; min-height: 0${I}; }`,
      `${sel} .force-free-canvas { height: 100%${I}; aspect-ratio: auto${I}; }`,
    ].map((rule) => `  ${rule}\n`).join("");
  }
  // 手机继承教师版：只取按比例的位置、大小；教师版用 vw 存的画布位置，按保存时的画布大小换算成画布的 %。
  function inheritedProps(entry) {
    const allowed = INHERIT_PROPS[entry.kind] || [];
    const p = entry.props || {};
    const out = {};
    allowed.forEach((key) => { if (p[key] != null) out[key] = p[key]; });
    if (p.kw > 0) {
      if (p.lvw != null && allowed.includes("left")) out.left = round(p.lvw / p.kw * 100, 3);
      if (p.wvw != null && allowed.includes("width")) out.width = round(p.wvw / p.kw * 100, 3);
    }
    if (p.kh > 0) {
      if (p.tvw != null && allowed.includes("top")) out.top = round(p.tvw / p.kh * 100, 3);
      if (p.hvw != null && allowed.includes("h")) out.h = round(p.hvw / p.kh * 100, 3);
    }
    return out;
  }
  // 手机档的底子：照搬教师版宽屏档（styles.css 最后几段）的画布排布，画布里的文字按手机比例缩小。
  let phoneBase = "";
  function phoneBaseCss() {
    if (phoneBase) return phoneBase;
    const P = "html body.self-guided-page:not(.layout-mode)";
    const F = `${P} .force-story:not(.deformation-story)`;
    const F3 = `${F}:not([data-reveal-step="3"])`;
    const D = `${P} .deformation-story`;
    const I = " !important";
    const S = (slot) => `[data-element-slot="${slot}"]`;
    const rules = [
      `${P} .force-free-canvas { width: 100%${I}; aspect-ratio: 2; --beam-k: ${PHONE_TEXT_K}; --text-small: calc(${BASE_TEXT.small}px * var(--beam-k)); --text-body: calc(${BASE_TEXT.body}px * var(--beam-k)); --text-title: calc(${BASE_TEXT.title}px * var(--beam-k)); }`,
      `${F} ${S("originalStructure")} { left: 3%${I}; top: 8%${I}; width: 43%${I}; }`,
      `${F} ${S("basicStructure")} { left: 3%${I}; top: 57%${I}; width: 43%${I}; }`,
      `${F} ${S("originalMomentBg")} { left: 47%${I}; top: 15%${I}; width: 32%${I}; }`,
      `${F} ${S("basicMomentBg")} { left: 47%${I}; top: 64%${I}; width: 32%${I}; }`,
      `${F} [data-element-slot^="concept"] { left: 82%${I}; width: 16%${I}; }`,
      `${P} ${S("conceptOriginal")} { top: 2%${I}; }`,
      `${P} ${S("conceptReleased")} { top: 35%${I}; }`,
      `${P} ${S("conceptRedundant")} { top: 68%${I}; }`,
      `${F} .force-stage-caption { left: 3%${I}; }`,
      `${F} .force-stage-caption.top-caption { top: 2%${I}; }`,
      `${F} .force-stage-caption.bottom-caption { top: 51%${I}; }`,
      `${F} .deformation-row-divider { top: 48%; right: 20%${I}; }`,
      `${D} .force-free-canvas { aspect-ratio: 1.9; }`,
      `${D} .top-caption { top: 0; }`,
      `${D} .bottom-caption { top: 46%; }`,
      `${D} ${S("originalStructure")}, ${D} ${S("basicStructure")} { left: 55%${I}; width: 44%${I}; }`,
      `${D} ${S("originalMomentBg")}, ${D} ${S("basicMomentBg")} { width: 43%${I}; }`,
      `${D} ${S("originalStructure")} { top: 5%${I}; }`,
      `${F3} .force-controls { display: none; }`,
      `${F3} .force-free-canvas { aspect-ratio: 2.6; }`,
      `${F3} [data-element-slot$="Structure"] { left: 12%${I}; width: 34%${I}; }`,
      `${F3} [data-element-slot^="concept"] { left: 70%${I}; width: 12%${I}; }`,
      `${F}[data-reveal-step="0"] ${S("originalStructure")} { left: 25%${I}; width: 50%${I}; top: 12%${I}; }`,
    ];
    phoneBase = `  /* 手机：先按教师版宽屏档的画布排布 */\n${rules.map((rule) => `  ${rule}\n`).join("")}`;
    return phoneBase;
  }
  let lastImageSig = null;
  let lastImageCss = "";
  function imageSignature(data) {
    const parts = [];
    for (const [regimeKey, pages] of Object.entries(data.regimes)) {
      for (const [pageKey, entries] of Object.entries(pages)) {
        for (const [entryKey, entry] of Object.entries(entries)) {
          if (entry.img) parts.push(`${regimeKey}|${pageKey}|${entryKey}|${entry.imgSel || entry.sel}|${entry.img.length}|${entry.img.slice(-32)}`);
        }
      }
    }
    return parts.join("\n");
  }
  // 同一档里：所有页 → 本阶段 → 本页（控制台：两种视图 → 当前视图），后写的覆盖先写的。
  function orderedBuckets(pages) {
    return Object.keys(pages).map((key, index) => [key, index])
      .sort((a, b) => bucketRank(a[0]) - bucketRank(b[0]) || a[1] - b[1]).map(([key]) => key);
  }
  function buildCss(data) {
    let layout = "/* 由 layout-tuner.js 根据版面调试结果生成 */\n"
      + '@property --beam-dx { syntax: "<length>"; inherits: false; initial-value: 0px; }\n'
      + '@property --beam-dy { syntax: "<length>"; inherits: false; initial-value: 0px; }\n';
    let images = "";
    const imageSig = imageSignature(data);
    const reuseImages = imageSig === lastImageSig;
    for (const [regimeKey, regimeDef] of Object.entries(REGIMES)) {
      const phone = regimeKey === "phone";
      if (phone && !isSelfGuided) continue; // 手机档只用于学生页
      // 手机档：先写继承的教师版（宽屏档）调整，再写手机自己的调整。
      const layers = [];
      if (phone && data.regimes.wide) layers.push({ pages: data.regimes.wide, inherit: true });
      if (data.regimes[regimeKey]) layers.push({ pages: data.regimes[regimeKey], inherit: false });
      let rules = phone ? phoneBaseCss() : "";
      let imageRules = "";
      for (const { pages, inherit } of layers) {
        for (const bucketKey of orderedBuckets(pages)) {
          if (phone && isConsoleKey(bucketKey)) continue;
          const scope = scopeFor(bucketKey, regimeKey);
          for (const [entryKey, entry] of Object.entries(pages[bucketKey])) {
            const body = inherit ? declarations(Object.assign({}, entry, { props: inheritedProps(entry) })) : declarations(entry);
            // :where() 不增加优先级，保持「两种视图 → 当前视图」的先后关系。
            const layoutScope = isConsoleKey(bucketKey) && FRAME_OWNED.has(entryKey) ? `${scope}:where(:not(.beam-frame))` : scope;
            if (body) rules += `  ${scoped(layoutScope, entry.sel)} { ${body}; }\n`;
            if (!inherit) rules += fillRules(entry, scoped(scope, entry.sel));
            if (!reuseImages && entry.img) imageRules += `  ${scoped(scope, entry.imgSel || entry.sel)} { content: url("${entry.img}") !important; object-fit: contain !important; }\n`;
          }
        }
      }
      if (rules) layout += `@media ${regimeDef.mq} {\n${rules}}\n`;
      if (imageRules) images += `@media ${regimeDef.mq} {\n${imageRules}}\n`;
    }
    if (reuseImages) images = lastImageCss; else { lastImageSig = imageSig; lastImageCss = images; }
    return { layout, images };
  }

  const styleEls = {};
  let lastImagesCss = null;
  function styleEl(id) {
    if (!styleEls[id]) {
      styleEls[id] = document.getElementById(id) || document.createElement("style");
      styleEls[id].id = id;
    }
    const el = styleEls[id];
    if (el.parentNode !== document.head) document.head.appendChild(el);
    return el;
  }
  function applyCss(data) {
    const css = buildCss(data);
    const layout = styleEl(STYLE_ID);
    const images = styleEl(IMG_STYLE_ID);
    // 两个样式表都要排在所有课件样式之后。
    if (document.head.lastElementChild !== images || images.previousElementSibling !== layout) { document.head.appendChild(layout); document.head.appendChild(images); }
    layout.textContent = css.layout;
    if (css.images !== lastImagesCss) { images.textContent = css.images; lastImagesCss = css.images; }
  }

  /* ---------- 当前页 / 控制台模式 ---------- */
  function readState() {
    try { return typeof currentState !== "undefined" ? currentState : null; } catch (_) { return null; }
  }
  function pageKeyOf(state) {
    if (!state) return "";
    const stage = Number(state.stage || 0);
    if (stage === 0) return "WAIT";
    if (stage === 1) return state.vote_feedback_visible ? "E-FB" : "E";
    if (stage === 2) return `A1-${Math.max(0, Math.min(3, Number(state.force_reveal_step || 0)))}`;
    if (stage === 3) return `A2-${Math.max(0, Math.min(5, Number(state.deformation_reveal_step || 0)))}`;
    return "";
  }
  function currentRegime() {
    for (const key of ACTIVE_REGIMES) if (window.matchMedia(REGIMES[key].mq).matches) return key;
    return null;
  }
  function consoleFocus() {
    const cockpit = document.getElementById("teacherCockpit");
    return Boolean(cockpit && cockpit.classList.contains("preview-focus"));
  }
  function currentKey() {
    if (isConsole) return consoleFocus() ? "CONSOLE-FOCUS" : "CONSOLE-OVERVIEW";
    return pageKeyOf(readState());
  }
  // 某一页用到的存放位置，从「通用」到「本页」排列（后面的优先）。
  function bucketKeysFor(key) {
    if (!key) return [];
    if (isConsoleKey(key)) return ["CONSOLE", key];
    const group = groupOf(key);
    return group ? ["ALL", `G:${group}`, key] : ["ALL", key];
  }
  function contentKeys() { return bucketKeysFor(currentKey()); }

  /* ---------- 改过的文字（程序每次重画后自动补上） ---------- */
  let activeData = emptyData();
  const originalHtml = new WeakMap();
  // 当前页生效的调整，按优先级从低到高排列；手机档先放继承自教师版（宽屏档）的调整。
  function layeredEntries(data, regimeKey, keys) {
    const list = [];
    if (!regimeKey) return list;
    if (regimeKey === "phone") {
      keys.forEach((key) => { if (!isConsoleKey(key)) Object.values(data.regimes.wide?.[key] || {}).forEach((entry) => list.push({ entry, inherited: true })); });
    }
    keys.forEach((key) => Object.values(data.regimes[regimeKey]?.[key] || {}).forEach((entry) => list.push({ entry, inherited: false })));
    return list;
  }
  function applyContent() {
    const texts = new Map();
    for (const { entry } of layeredEntries(activeData, currentRegime(), contentKeys())) {
      if (typeof entry.text !== "string") continue;
      let nodes = [];
      try { nodes = Array.from(document.querySelectorAll(entry.sel)); } catch (_) {}
      nodes.forEach((el) => texts.set(el, entry.text));
    }
    texts.forEach((text, el) => {
      const version = hash(text);
      const mark = el.querySelector(":scope > template[data-beam-mark]");
      if (mark && mark.dataset.v === version) return;
      if (!mark) originalHtml.set(el, el.innerHTML);
      el.innerHTML = `${text}<template data-beam-mark data-v="${version}"></template>`;
    });
    document.querySelectorAll("template[data-beam-mark]").forEach((mark) => {
      const el = mark.parentElement;
      if (!el || texts.has(el)) return;
      if (originalHtml.has(el)) el.innerHTML = originalHtml.get(el); else mark.remove();
    });
  }
  function setActiveData(data) {
    activeData = data;
    applyCss(data);
    applyContent();
    applyVotes(data);
  }
  // 投票人数交给 app.js（window.BEAM_VOTE_COUNTS），E 投票反馈页马上按这组数显示。
  let appliedVotes;
  function applyVotes(data) {
    const votes = data && data.votes ? data.votes : null;
    const sig = votes ? canon(votes) : "";
    if (sig === appliedVotes) return;
    appliedVotes = sig;
    window.BEAM_VOTE_COUNTS = votes ? Object.assign({}, votes) : null;
    window.dispatchEvent(new CustomEvent("beam-votes-changed"));
  }

  /* ---------- 文件：保存、下载、核对 ---------- */
  function fileContent(data) {
    const stamp = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const when = `${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())} ${pad(stamp.getHours())}:${pad(stamp.getMinutes())}:${pad(stamp.getSeconds())}`;
    const payload = sortedClone(Object.assign(cleanData(clone(data)), { savedAt: when, version: 3 }));
    return `// BEAM LAB 版面调试保存的配置（由「版面调试」窗口自动生成，${when}）\n`
      + "// 放在 static 文件夹里，teacher.html 和 student.html 会自动读取。\n"
      + '// "wide" "medium" "narrow" 是教师版（按宽度分档），"phone" 是学生页的手机版面。\n'
      + '// 想恢复默认版面：把 "regimes" 后面的内容改成 {}，或在版面调试里重置后再保存。\n'
      + (data.votes ? '// "votes" 是 E 投票反馈页的人数（agree = A、doubt = B、unsure = C），在版面调试里选中「人数方块」可以改。\n' : "")
      + `window.BEAM_LAYOUT_OVERRIDES = ${JSON.stringify(payload, null, 2)};\n`;
  }
  function downloadFile(content) {
    const blob = new Blob([content], { type: "text/javascript;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = FILE_NAME;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  // 保存后重新读一次页面实际使用的 static/layout-overrides.js，确认存到了正确的位置。
  function readSavedFile() {
    return new Promise((resolve) => {
      const previous = window.BEAM_LAYOUT_OVERRIDES;
      const script = document.createElement("script");
      const done = (value) => { window.BEAM_LAYOUT_OVERRIDES = previous; script.remove(); resolve(value); };
      script.onload = () => done(window.BEAM_LAYOUT_OVERRIDES);
      script.onerror = () => done(undefined);
      script.src = `${FILE_URL}?verify=${Date.now()}`;
      document.head.appendChild(script);
    });
  }
  function idbOpen() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(IDB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(IDB_STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function idbRun(mode, fn) {
    const db = await idbOpen();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, mode);
        const request = fn(tx.objectStore(IDB_STORE));
        tx.oncomplete = () => resolve(request ? request.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  }
  const idbGet = (key) => idbRun("readonly", (store) => store.get(key)).catch(() => null);
  const idbSet = (key, value) => idbRun("readwrite", (store) => store.put(value, key)).catch(() => null);
  const idbDelete = (key) => idbRun("readwrite", (store) => store.delete(key)).catch(() => null);

  // 只能在最外层页面调用（浏览器不允许嵌在框里的页面弹出保存对话框）。
  async function saveTopLevel(content) {
    if (typeof window.showSaveFilePicker === "function") {
      try {
        let handle = await idbGet(IDB_HANDLE_KEY);
        if (handle && typeof handle.queryPermission === "function") {
          let permission = await handle.queryPermission({ mode: "readwrite" });
          if (permission !== "granted") permission = await handle.requestPermission({ mode: "readwrite" });
          if (permission !== "granted") handle = null;
        } else {
          handle = null;
        }
        if (!handle) {
          handle = await window.showSaveFilePicker({
            suggestedName: FILE_NAME,
            types: [{ description: "JavaScript 文件", accept: { "text/javascript": [".js"] } }],
          });
        }
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        await idbSet(IDB_HANDLE_KEY, handle);
        return { ok: true, method: "picker", name: handle.name };
      } catch (error) {
        if (error && error.name === "AbortError") return { ok: false, cancelled: true };
        console.warn("[版面调试] 保存对话框不可用，改为下载文件：", error);
      }
    }
    downloadFile(content);
    return { ok: true, method: "download", name: FILE_NAME };
  }

  /* ---------- 控制台：学生预览显示为放大后的整页缩略图 ---------- */
  function startPreviewScaler(onModeChange) {
    let lastFocus = null;
    try { lastFocus = JSON.parse(localStorage.getItem(FOCUS_SIZE_KEY) || "null"); } catch (_) {}
    let observedFrame = null;
    let observedCockpit = null;
    let resizeObserver = null;
    let lastMode = null;
    const parts = () => ({
      cockpit: document.getElementById("teacherCockpit"),
      frame: document.querySelector("#teacherCockpit .device-frame"),
      iframe: document.getElementById("studentPreview"),
    });
    function clear(iframe, frame) {
      ["position", "left", "top", "width", "height", "maxWidth", "transform", "transformOrigin"].forEach((p) => { iframe.style[p] = ""; });
      frame.style.position = "";
    }
    function update() {
      const { cockpit, frame, iframe } = parts();
      if (!cockpit || !frame || !iframe) return;
      if (cockpit !== observedCockpit) {
        observedCockpit = cockpit;
        new MutationObserver(update).observe(cockpit, { attributes: true, attributeFilter: ["class"] });
      }
      if (frame !== observedFrame) {
        if (resizeObserver) resizeObserver.disconnect();
        resizeObserver = new ResizeObserver(() => update());
        resizeObserver.observe(frame);
        observedFrame = frame;
      }
      const focus = cockpit.classList.contains("preview-focus");
      document.body.dataset.beamConsole = "1";
      const key = focus ? "CONSOLE-FOCUS" : "CONSOLE-OVERVIEW";
      if (document.body.dataset.beamPage !== key) document.body.dataset.beamPage = key;
      if (lastMode !== focus) { lastMode = focus; onModeChange(focus); }
      // 外框的银色面板在屏幕下方：调试窗口别盖住它
      const consoleHost = document.getElementById("beam-layout-tuner-console");
      if (consoleHost) consoleHost.toggleAttribute("data-frame", frameOn());
      if (focus) {
        clear(iframe, frame);
        const w = iframe.clientWidth;
        const h = iframe.clientHeight;
        if (w > 200 && h > 150 && (!lastFocus || lastFocus.w !== w || lastFocus.h !== h || lastFocus.ww !== window.innerWidth || lastFocus.wh !== window.innerHeight)) {
          lastFocus = { w, h, ww: window.innerWidth, wh: window.innerHeight };
          try { localStorage.setItem(FOCUS_SIZE_KEY, JSON.stringify(lastFocus)); } catch (_) {}
        }
        return;
      }
      const main = document.getElementById("app");
      let vw;
      let vh;
      const fg = frameGeometry();
      if (lastFocus && lastFocus.ww === window.innerWidth && lastFocus.wh === window.innerHeight) { vw = lastFocus.w; vh = lastFocus.h; }
      else if (fg) { vw = fg.w; vh = fg.h; }
      else { vw = main.clientWidth; vh = Math.max(320, window.innerHeight - 165); }
      frame.style.position = "relative";
      const fw = frame.clientWidth;
      const fh = frame.clientHeight;
      if (!fw || !fh) return;
      const scale = Math.min(fw / vw, fh / vh);
      const left = `${round(Math.max(0, (fw - vw * scale) / 2), 2)}px`;
      const transform = `scale(${round(scale, 5)})`;
      if (iframe.style.width !== `${vw}px` || iframe.style.height !== `${vh}px` || iframe.style.transform !== transform || iframe.style.left !== left) {
        Object.assign(iframe.style, { position: "absolute", left, top: "0px", width: `${vw}px`, height: `${vh}px`, maxWidth: "none", transform, transformOrigin: "0 0" });
      }
    }
    // 还没放大过时，按平板外框估计放大后的屏幕大小（尺寸取自 styles.css 里的 --fr-* 变量；?frame=0 时不用外框）。
    function frameGeometry() {
      if (new URLSearchParams(location.search).get("frame") === "0") return null;
      const cs = getComputedStyle(document.getElementById("teacherCockpit") || document.body);
      const v = (name) => parseFloat(cs.getPropertyValue(name));
      if (!Number.isFinite(v("--fr-panel"))) return null;
      const regime = currentRegime();
      const pages = regime ? activeData.regimes[regime] || {} : {};
      const mainWidth = ["CONSOLE-FOCUS", "CONSOLE"].map((key) => pages[key]?.["c:main"]?.props?.width).find((w) => w != null);
      const w = mainWidth != null ? window.innerWidth * mainWidth / 100 : window.innerWidth - 2 * (v("--fr-out") + v("--fr-side") + v("--fr-ring"));
      const h = window.innerHeight - (v("--fr-out") + v("--fr-bez") + 2 * v("--fr-ring") + v("--fr-gap") + v("--fr-panel") + v("--fr-bottom"));
      return { w: Math.round(w), h: Math.max(320, Math.round(h)) };
    }
    window.addEventListener("resize", update);
    new MutationObserver(() => { if (!document.getElementById("teacherCockpit") || !observedCockpit) update(); }).observe(appEl || document.body, { childList: true });
    setInterval(update, 1000);
    update();
    return { update };
  }

  /* ---------- 调试窗口（页面内容 / 控制台 / 手机 共用） ---------- */
  function panelMarkup({ kind, pages = [], docked = false, newTab = false }) {
    const pageUi = kind !== "console";
    const resetLabel = kind === "console" ? "重置控制台" : "重置本页";
    const resetAll = kind === "phone" ? "全部恢复成教师版的样子" : kind === "page" ? "所有页全部重置（本档）" : "";
    return `<button class="pill" hidden title="展开版面调试">版面调试 ▸</button>
      <section class="panel${docked ? " docked" : ""}">
        <header><strong>${kind === "phone" ? "手机版面调试" : "版面调试"}</strong><span class="page-tag"></span><span class="spacer"></span>
          <button class="head-btn scope-btn" data-action="scope" hidden></button>
          ${docked ? "" : '<button class="head-btn" data-action="flip" title="把窗口移到另一侧">⇆</button><button class="head-btn" data-action="collapse" title="收起">—</button>'}</header>
        <div class="body">
          <div class="regime"></div>
          ${pageUi ? `<div class="row"><select class="page-select" title="切换到要调整的页面">${pages.map(([key, label]) => `<option value="${key}">${escapeHtml(label)}</option>`).join("")}</select>
            <button data-action="prev-page" title="上一页">◀</button><button data-action="next-page" title="下一页">▶</button></div>` : ""}
          <div class="row wrap"><button data-action="pick" class="pick">🎯 在页面上点选</button><button data-action="parent" title="选中外面一层">↑ 外层</button></div>
          <div class="list-title">${kind === "console" ? "控制台元素" : "本页元素"}（● = 已调整）</div>
          <div class="chips"></div>
          <div class="editor"></div>
          <div class="footer">
            <div class="row"><button data-action="undo">撤销</button><button data-action="redo">重做</button><span class="spacer"></span><button data-action="reset-page">${resetLabel}</button><button class="danger" data-action="reset-everything" title="教师版各页、控制台、手机版面的调整和投票人数全部清掉（可以撤销）">全部重置</button></div>
            <div class="status"></div>
            <div class="row"><button class="primary" data-action="save">保存到文件</button><span class="spacer"></span></div>
            <details class="more"><summary>更多</summary>
              <div class="row wrap"><button data-action="discard">放弃未保存的改动</button><button data-action="download">下载配置文件</button>
              <button data-action="forget-file">重新选择保存位置</button>${resetAll ? `<button data-action="reset-all">${resetAll}</button>` : ""}${newTab ? '<button data-action="new-tab">在新标签页打开</button>' : ""}${kind !== "phone" ? '<button data-action="open-phone" title="在新标签页打开 student-edit.html">调学生页手机版面 ↗</button>' : ""}</div>
              <p class="hint">第一次保存会弹出保存对话框：请选到<b>本副本的 static 文件夹</b>，文件名保持 <b>${FILE_NAME}</b>，替换原文件。之后再保存会直接写入同一个文件。</p>
            </details>
          </div>
        </div>
      </section>
      <input type="file" class="file-input" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" hidden>`;
  }

  function readImage(file) {
    return new Promise((resolve, reject) => {
      if (!file) { reject(new Error("没有选择文件")); return; }
      if (file.size > 12 * 1024 * 1024) { reject(new Error("图片超过 12 MB，请先压缩")); return; }
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        const url = String(reader.result);
        const img = new Image();
        img.onload = () => {
          let data = url;
          const w = img.naturalWidth || 1;
          const h = img.naturalHeight || 1;
          // 位图太大时缩到 2000px 宽，避免配置文件过大。
          if (!/svg/.test(file.type) && (w > 2000 || file.size > 1.5 * 1024 * 1024)) {
            const k = Math.min(1, 2000 / w);
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(w * k);
            canvas.height = Math.round(h * k);
            canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
            data = /jpe?g/.test(file.type) ? canvas.toDataURL("image/jpeg", 0.9) : canvas.toDataURL("image/png");
          }
          resolve({ data, ratio: w / h });
        };
        img.onerror = () => reject(new Error("这个文件不是能显示的图片"));
        img.src = url;
      };
      reader.readAsDataURL(file);
    });
  }

  function createTuner(ctx) {
    const remote = ctx.remote || null; // 手机版面：窗口画在外壳页（student-edit.html）里，这里只负责页面上的框和数据
    const pages = ctx.pages || PAGES;
    const fileData = normalize(window.BEAM_LAYOUT_OVERRIDES);
    let saved = clone(fileData);
    let draft = clone(fileData);
    let restoredDraft = false;
    try {
      const stored = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      if (stored && stored.data) {
        const candidate = normalize(stored.data);
        if (canon(candidate) !== canon(saved)) { draft = candidate; restoredDraft = true; }
      }
    } catch (_) {}

    const uiKey = `${UI_KEY}:${ctx.kind}`;
    let ui = { x: null, y: 12, collapsed: false, levels: {}, clevels: {} };
    try { ui = Object.assign(ui, JSON.parse(localStorage.getItem(uiKey) || "{}")); } catch (_) {}
    if (!ui.levels || typeof ui.levels !== "object") ui.levels = {};
    if (!ui.clevels || typeof ui.clevels !== "object") ui.clevels = {};
    let allowed = true; // 由外部控制是否显示（控制台的模式与范围切换）

    let selected = null;
    let picking = false;
    let hoverNode = null;
    let dragging = false;
    let statusNote = restoredDraft ? "已恢复上次没有保存到文件的改动。" : "";
    const undoStack = [];
    const redoStack = [];
    let lastEditTag = "";
    let lastEditTime = 0;
    let textTimer = null;
    let lastEditorHtml = "";
    let lastEditorKey = null;
    let openTextKey = null; // 「改文字」展开着的元素（窗口重画后保持展开）
    // 坐标原点：整个页面（浏览器窗口）左上角。嵌在控制台里的学生预览，由控制台告诉它自己在页面上的位置和缩放。
    let origin = { x: 0, y: 0, scale: 1 };

    setActiveData(draft);

    /* 界面骨架（放在 Shadow DOM 里，不受课件样式影响） */
    const host = document.createElement("div");
    host.id = `beam-layout-tuner-${ctx.kind}`;
    host.className = "beam-layout-tuner";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${TUNER_CSS}</style>
      <div class="boxes"></div>
      <div class="shield" hidden title="学生预览（整体）"></div>
      ${panelMarkup({ kind: ctx.kind, pages, newTab: ctx.kind === "page" && embedded })}
      <div class="handle move" data-handle="move" title="按住拖动，移动元素" hidden>✥</div>
      <div class="handle corner" data-handle="corner" title="按住拖动，改大小" hidden>◢</div>
      <div class="handle right" data-handle="right" title="按住拖动，只改宽度" hidden></div>
      <div class="handle bottom" data-handle="bottom" title="按住拖动，只改高度（上边不动）" hidden></div>
      <div class="handle left" data-handle="left" title="按住拖动左边（右边不动）" hidden></div>
      <div class="handle top" data-handle="top" title="按住拖动上边（下边不动）" hidden></div>`;
    document.body.appendChild(host);

    const $ = (sel) => root.querySelector(sel);
    const panel = $(".panel");
    const pill = $(".pill");
    const boxesEl = $(".boxes");
    const shield = $(".shield");
    const fileInput = $(".file-input");
    const handles = { move: $(".handle.move"), corner: $(".handle.corner"), right: $(".handle.right"), bottom: $(".handle.bottom"), left: $(".handle.left"), top: $(".handle.top") };
    const pageSelect = $(".page-select");

    function persistUi() { try { localStorage.setItem(uiKey, JSON.stringify({ x: ui.x, y: ui.y, collapsed: ui.collapsed, levels: ui.levels, clevels: ui.clevels })); } catch (_) {} }
    function placePanel() {
      if (remote) return;
      const width = panel.offsetWidth || 336;
      const maxX = Math.max(0, window.innerWidth - width - 8);
      const x = ui.x == null ? maxX : Math.min(Math.max(0, ui.x), maxX);
      const y = Math.min(Math.max(0, ui.y || 0), Math.max(0, window.innerHeight - 60));
      panel.style.left = `${x}px`;
      panel.style.top = `${y}px`;
    }
    const panelShowing = () => (remote ? allowed : allowed && !panel.hidden);
    function applyVisibility() {
      host.hidden = !allowed;
      panel.hidden = Boolean(remote) || !allowed || ui.collapsed;
      pill.hidden = Boolean(remote) || !allowed || !ui.collapsed;
      if (!panelShowing()) setPicking(false);
      placePanel();
    }
    // 这个窗口负责的档位：手机窗口只管手机档，教师页的窗口只管宽 / 中 / 窄三档。
    function workRegime() {
      const regimeKey = currentRegime();
      if (ctx.kind === "phone") return regimeKey === "phone" ? regimeKey : null;
      return regimeKey === "phone" ? null : regimeKey;
    }

    /* 数据读写：同一元素可以存在「本页 / 本阶段 / 所有页」（控制台：「当前视图 / 两种视图」）几个位置 */
    const pageKey = () => currentKey();
    const LEVEL_ORDER = ctx.kind === "console" ? ["view", "shared"] : ["page", "group", "all"]; // 从小范围到大范围
    function levelKey(level, key = pageKey()) {
      if (!key) return null;
      if (ctx.kind === "console") return level === "shared" ? "CONSOLE" : key;
      if (level === "all") return "ALL";
      if (level === "group") { const group = groupOf(key); return group ? `G:${group}` : null; }
      return key;
    }
    const levels = () => LEVEL_ORDER.filter((level) => levelKey(level));
    function levelLabel(level) {
      if (level === "page") return "只改本页";
      if (level === "group") return `本阶段通用（${GROUPS[groupOf(pageKey())] || ""}）`;
      if (level === "all") return "所有页通用";
      if (level === "view") return consoleFocus() ? "只在放大预览" : "只在普通视图";
      if (level === "shared") return "两种视图通用";
      return level;
    }
    const levelShort = (level) => ({ page: "本页", group: "本阶段", all: "所有页", view: "当前视图", shared: "两种视图" }[level] || "");
    function levelHint(level) {
      if (level === "page") return "只改这一页。";
      if (level === "group") return "本阶段各页里的这个元素一起改；某页单独调过的，以那一页为准。";
      if (level === "all") return "所有页里的这个元素一起改；某页或某阶段单独调过的，以它为准。";
      if (level === "view") return consoleFocus() ? "只在「放大学生预览」时生效。" : "只在普通视图生效。";
      if (level === "shared") return "普通视图和放大预览里都生效。";
      return "";
    }
    function bucket(key, create) {
      const regimeKey = workRegime();
      if (!regimeKey || !key) return null;
      if (create) {
        draft.regimes[regimeKey] ||= {};
        draft.regimes[regimeKey][key] ||= {};
      }
      return draft.regimes[regimeKey]?.[key] || null;
    }
    const entryAt = (def, level) => bucket(levelKey(level), false)?.[def.key] || null;
    const anyEntry = (def) => levels().some((level) => entryAt(def, level));
    const hasProps = (entry) => Boolean(entry && Object.keys(entry.props || {}).length);
    const hasContent = (entry) => Boolean(entry && (typeof entry.text === "string" || entry.img));
    // 位置、大小的应用范围（默认值见各元素的 scope）；文字、图片另有自己的范围（默认只改本页，顶部栏与导航默认所有页）。
    const defaultLevel = (def) => (ctx.kind === "console" ? (def.shared ? "shared" : "view") : (def.scope || "page"));
    const defaultContentLevel = (def) => (ctx.kind === "console" ? "shared" : String(def.key).startsWith("s:") ? "all" : "page");
    function pickLevel(def, chosenMap, test, fallback) {
      const list = levels();
      const chosen = chosenMap[def.key];
      if (chosen && list.includes(chosen)) return chosen;
      for (const level of list) if (test(entryAt(def, level))) return level;
      return list.includes(fallback) ? fallback : list[0];
    }
    const editLevel = (def) => pickLevel(def, ui.levels, hasProps, defaultLevel(def));
    const contentLevel = (def) => pickLevel(def, ui.clevels, hasContent, defaultContentLevel(def));
    const moreSpecific = (level) => { const list = levels(); const i = list.indexOf(level); return i < 0 ? [] : list.slice(0, i); };
    const targetsFrom = (def, level) => [level, ...moreSpecific(level)].map((l) => entryAt(def, l)).filter(Boolean);
    const editTargets = (def) => targetsFrom(def, editLevel(def));
    const contentTargets = (def) => targetsFrom(def, contentLevel(def));
    // 手机：继承来的教师版（宽屏档）调整，从本页到所有页排列。
    function inheritedEntries(def) {
      if (ctx.kind !== "phone") return [];
      return bucketKeysFor(pageKey()).slice().reverse().map((key) => draft.regimes.wide?.[key]?.[def.key]).filter(Boolean);
    }
    function inheritedProp(def, prop) {
      for (const entry of inheritedEntries(def)) { const value = inheritedProps(entry)[prop]; if (value != null) return value; }
      return null;
    }
    function effectiveProp(def, prop) {
      for (const level of levels()) { const entry = entryAt(def, level); if (entry && entry.props[prop] != null) return entry.props[prop]; }
      return inheritedProp(def, prop);
    }
    // 界面上的坐标、像素宽高 → 存储项（第一个是现在用的，其余是旧写法，改的时候一起清掉）。
    const STORED = { x: ["lvw", "left", "dx"], y: ["tvw", "top", "dy"], w: ["wvw", "width"], hh: ["hvw", "h"] };
    const INHERIT_OF = { x: "left", y: "top", w: "width", hh: "h" };
    const storedOf = (prop) => STORED[prop] || [prop];
    const hasStored = (entry, prop) => Boolean(entry && entry.props) && storedOf(prop).some((p) => entry.props[p] != null);
    const ownProp = (def, prop) => editTargets(def).some((entry) => hasStored(entry, prop));
    // 有值，但不是在当前范围设的（来自更大的范围，或手机继承自教师版）→ 显示成蓝色
    function generalProp(def, prop) {
      if (ownProp(def, prop)) return false;
      if (levels().some((level) => hasStored(entryAt(def, level), prop))) return true;
      return inheritedProp(def, INHERIT_OF[prop] || prop) != null;
    }
    const ownText = (def) => contentTargets(def).some((entry) => typeof entry.text === "string");
    const ownImage = (def) => contentTargets(def).some((entry) => entry.img);

    const owns = (regimeKey, key) => (ctx.kind === "phone" ? regimeKey === "phone" : regimeKey !== "phone" && (ctx.kind === "console" ? isConsoleKey(key) : !isConsoleKey(key)));
    const ownsVotes = ctx.kind !== "console";
    function ownPart(data) {
      const part = {};
      if (ownsVotes) part["#votes"] = data.votes || null;
      for (const [regimeKey, regimePages] of Object.entries(data.regimes)) {
        for (const [key, entries] of Object.entries(regimePages)) {
          if (!owns(regimeKey, key)) continue;
          part[regimeKey] ||= {};
          part[regimeKey][key] = entries;
        }
      }
      return canon(part);
    }
    function mergeOwnPart(serialized) {
      const part = JSON.parse(serialized);
      if (ownsVotes) { if (part["#votes"]) draft.votes = part["#votes"]; else delete draft.votes; }
      delete part["#votes"];
      for (const [regimeKey, regimePages] of Object.entries(draft.regimes)) {
        for (const key of Object.keys(regimePages)) if (owns(regimeKey, key)) delete regimePages[key];
      }
      for (const [regimeKey, regimePages] of Object.entries(part)) {
        draft.regimes[regimeKey] ||= {};
        Object.assign(draft.regimes[regimeKey], regimePages);
      }
      draft = normalize(draft);
    }
    function beginEdit(tag, force) {
      const now = Date.now();
      if (force || tag !== lastEditTag || now - lastEditTime > 900) {
        undoStack.push(ownPart(draft));
        if (undoStack.length > 60) undoStack.shift();
        redoStack.length = 0;
      }
      lastEditTag = tag;
      lastEditTime = now;
    }
    let draftCanon = canon(draft);
    let savedCanon = canon(saved);
    function persistDraft() {
      try {
        if (draftCanon === savedCanon) localStorage.removeItem(DRAFT_KEY);
        else localStorage.setItem(DRAFT_KEY, JSON.stringify({ data: draft, t: Date.now() }));
        return true;
      } catch (error) {
        statusNote = "浏览器草稿空间不够（图片可能太大），请尽快「保存到文件」。";
        return false;
      }
    }
    function commit(options = {}) {
      cleanData(draft);
      setActiveData(draft);
      if (options.skipPersist) { refreshRows(); return; } // 拖动过程中只刷新数值，松手后再存草稿
      draftCanon = canon(draft);
      persistDraft();
      if (options.rebuild) renderPanel(); else { refreshRows(); renderChips(); renderStatus(); }
    }
    function entryFor(def, level = editLevel(def)) {
      const entries = bucket(levelKey(level), true);
      if (!entries) return null;
      const entry = entries[def.key] ||= { sel: def.cssSel || def.sel, label: def.label, kind: def.kind, props: {} };
      entry.sel = def.cssSel || def.sel;
      entry.label = def.label;
      entry.kind = def.kind;
      entry.props ||= {};
      return entry;
    }
    // 在某个范围里改了之后，清掉本页更小范围里的同一项，保证改动马上看得见。
    function clearMoreSpecific(def, level, fn) { moreSpecific(level).forEach((l) => { const entry = entryAt(def, l); if (entry) fn(entry); }); }
    function setProp(def, prop, value, options = {}) {
      if (!Number.isFinite(value)) return;
      if (VOTE_PROPS[prop]) { setVote(prop, value, options); return; }
      if (PROPS[prop].virtual) setVirtual(def, prop, value, options);
      else setStored(def, prop, value, options);
      if (prop === "hpx" && def.kind === "main") holdMainHeight(def, options);
    }
    // 投票人数：没改过就是 app.js 里的演示数据；改回演示数据时就不再存。
    const defaultVotes = () => Object.assign({ agree: 0, doubt: 0, unsure: 0 }, window.BEAM_DEMO_VOTES || {});
    const currentVotes = () => Object.assign(defaultVotes(), draft.votes || {});
    function setVote(prop, value, options = {}) {
      const key = VOTE_PROPS[prop];
      if (!options.noUndo) beginEdit(options.reset ? `votes-reset|${key}` : `votes|${key}`, Boolean(options.reset)); // ↺ 单独算一步撤销
      if (!options.keepNote) statusNote = "";
      const next = currentVotes();
      next[key] = Math.max(0, Math.round(value));
      if (canon(next) === canon(defaultVotes())) delete draft.votes; else draft.votes = next;
      commit(options);
    }
    // 页面主体比里面的内容还矮时，实际停在内容放得下的高度；数值也记成这个高度，和看到的一致。
    function holdMainHeight(def, options) {
      const node = nodesOf(def)[0];
      const want = effectiveProp(def, "hpx");
      if (!node || want == null) return;
      const used = px(getComputedStyle(node).height);
      if (used > want + 0.5) setStored(def, "hpx", used, { ...options, noUndo: true });
    }
    function setStored(def, prop, value, options = {}, extra = {}) {
      if (!Number.isFinite(value)) return;
      if (!options.noUndo) beginEdit(`${def.key}|${extra.tag || prop}`);
      const level = editLevel(def);
      const entry = entryFor(def, level);
      if (!entry) return;
      if (!options.keepNote) statusNote = "";
      const legacy = extra.legacy || [];
      entry.props[prop] = round(value, PROPS[prop].digits);
      legacy.forEach((p) => delete entry.props[p]);
      if (extra.refs) Object.assign(entry.props, extra.refs);
      clearMoreSpecific(def, level, (e) => { delete e.props[prop]; legacy.forEach((p) => delete e.props[p]); });
      commit(options);
    }
    /* 统一坐标：原点在页面左上角，单位 px。
       画布里的元素存成相对画布左上角的 vw（页面宽度的 1%）：各页画布左上角相同，同一数值就是同一位置；屏幕大小不同时一起缩放。
       其他元素存成相对原来位置的移动量（dx、dy）。 */
    const vwPx = () => (window.innerWidth || document.documentElement.clientWidth || 100) / 100;
    function posMode(def, nodes = nodesOf(def)) {
      if (def.kind === "label" || nodes.length > 1) return "offset";
      const node = nodes[0];
      if (node && CANVAS_KINDS.has(def.kind) && /absolute|fixed/.test(getComputedStyle(node).position)) return "canvas";
      return "flow";
    }
    // 本页坐标 ↔ 整个页面的坐标
    const globalX = (localX) => origin.x + localX * origin.scale;
    const globalY = (localY) => origin.y + localY * origin.scale;
    function measuredVirtual(node, prop) {
      if (prop === "x" || prop === "y") {
        const rect = node.getBoundingClientRect();
        return prop === "x" ? globalX(rect.left + window.scrollX) : globalY(rect.top + window.scrollY);
      }
      const cs = getComputedStyle(node);
      return px(prop === "w" ? cs.width : cs.height) * origin.scale;
    }
    function currentTranslate(node) {
      const value = getComputedStyle(node).translate;
      if (!value || value === "none") return [0, 0];
      const parts = value.split(/\s+/).map(px);
      return [parts[0] || 0, parts[1] || 0];
    }
    function canvasRefs(node) {
      const box = node && (node.offsetParent || node.parentElement);
      if (!box) return null;
      const unit = vwPx();
      return { kw: round(box.clientWidth / unit, 4), kh: round(box.clientHeight / unit, 4) };
    }
    function setVirtual(def, prop, value, options = {}) {
      const nodes = nodesOf(def);
      const node = nodes[0];
      if (!node) return;
      const mode = posMode(def, nodes);
      if (prop === "x" || prop === "y") {
        const delta = (value - measuredVirtual(node, prop)) / (origin.scale || 1);
        if (mode === "canvas") {
          const cs = getComputedStyle(node);
          const base = px(prop === "x" ? cs.left : cs.top);
          setStored(def, prop === "x" ? "lvw" : "tvw", (base + delta) / vwPx(), options, { tag: prop, legacy: [prop === "x" ? "left" : "top"], refs: canvasRefs(node) });
        } else {
          const base = currentTranslate(node)[prop === "x" ? 0 : 1];
          setStored(def, prop === "x" ? "dx" : "dy", base + delta, options, { tag: prop });
        }
        return;
      }
      if (mode !== "canvas") return;
      setStored(def, prop === "w" ? "wvw" : "hvw", value / (origin.scale || 1) / vwPx(), options, { tag: prop, legacy: [prop === "w" ? "width" : "h"], refs: canvasRefs(node) });
    }
    const CONTENT_FIELDS = ["text", "img", "imgSel", "imgRatio", "ratioVar"];
    const IMAGE_FIELDS = ["img", "imgSel", "imgRatio", "ratioVar"];
    function clearProps(def, props) {
      const targets = editTargets(def);
      const content = props ? [] : contentTargets(def).filter(hasContent);
      if (!(props ? targets.some((entry) => props.some((p) => hasStored(entry, p))) : targets.some(hasProps)) && !content.length) return;
      beginEdit(`clear|${def.key}|${props ? props.join(",") : "*"}`, true);
      targets.forEach((entry) => { if (props) props.flatMap(storedOf).forEach((p) => delete entry.props[p]); else entry.props = {}; });
      content.forEach((entry) => CONTENT_FIELDS.forEach((f) => delete entry[f]));
      statusNote = "";
      commit({ rebuild: true });
    }
    // 改应用范围：换到更大的范围时，把本页（本阶段）对这个元素的调整一起带过去。
    function setLevel(def, level, content) {
      const list = levels();
      const current = content ? contentLevel(def) : editLevel(def);
      if (!list.includes(level)) return;
      (content ? ui.clevels : ui.levels)[def.key] = level;
      persistUi();
      if (level === current) { renderPanel(); return; }
      const what = content ? "文字 / 图片" : "位置和大小";
      if (list.indexOf(level) > list.indexOf(current)) {
        const moving = list.slice(0, list.indexOf(level)).reverse().map((l) => entryAt(def, l)).filter((entry) => (content ? hasContent(entry) : hasProps(entry)));
        if (moving.length) {
          beginEdit(`level|${def.key}`, true);
          const target = entryFor(def, level);
          for (const entry of moving) {
            if (content) CONTENT_FIELDS.forEach((f) => { if (entry[f] !== undefined) { target[f] = entry[f]; delete entry[f]; } });
            else { Object.assign(target.props, entry.props); entry.props = {}; }
          }
          statusNote = `已改为「${levelLabel(level)}」：刚才在${levelShort(current)}改的${what}，现在用到${levelShort(level)}。`;
          commit({ rebuild: true });
          return;
        }
      }
      statusNote = `之后改${what}：${levelLabel(level)}。`;
      renderPanel();
    }

    /* 元素与数值 */
    function isVisible(node) {
      if (!node || !node.isConnected || !node.getClientRects().length) return false;
      return getComputedStyle(node).visibility !== "hidden";
    }
    function nodesOf(def) {
      let nodes = [];
      try { nodes = Array.from(document.querySelectorAll(def.sel)); } catch (_) {}
      return nodes.filter(isVisible);
    }
    function containerOf(node) { return node.offsetParent || node.parentElement || document.documentElement; }
    function tracks(el) {
      const value = getComputedStyle(el).gridTemplateColumns;
      return value && value !== "none" ? value.split(" ").map(px).filter((n) => n > 0) : [];
    }
    function widthBasis(def, node) {
      if (def.kind === "main") return document.documentElement.clientWidth || window.innerWidth;
      if (def.kind === "canvas") {
        const parent = node.parentElement;
        const t = parent ? tracks(parent) : [];
        return t.length ? t[0] : (parent ? parent.clientWidth : 1);
      }
      return containerOf(node).clientWidth || 1;
    }
    function measured(def, node, prop) {
      const cs = getComputedStyle(node);
      switch (prop) {
        case "left": return px(cs.left) / (containerOf(node).clientWidth || 1) * 100;
        case "top": return px(cs.top) / (containerOf(node).clientHeight || 1) * 100;
        case "width": return px(cs.width) / widthBasis(def, node) * 100;
        case "wpx": return px(cs.width);
        case "hpx": return px(cs.height);
        case "h": return px(cs.height) / (containerOf(node).clientHeight || 1) * 100;
        case "size": return px(cs.width);
        case "gsize": return px(cs.width);
        case "dx": case "dy": return 0;
        case "mt": return px(cs.marginTop);
        case "mb": return px(cs.marginBottom);
        case "pt": return px(cs.paddingTop);
        case "px": return px(cs.paddingLeft);
        case "pb": return px(cs.paddingBottom);
        case "gap": return Math.max(px(cs.rowGap), px(cs.columnGap));
        case "order": return parseInt(cs.order, 10) || 0;
        case "text": return 100;
        case "ar": {
          const parts = String(cs.aspectRatio).replace("auto", "").trim().split("/").map((s) => parseFloat(s));
          if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) return parts[0] / parts[1];
          if (parts.length === 1 && parts[0] > 0) return parts[0];
          const rect = node.getBoundingClientRect();
          return rect.height ? rect.width / rect.height : 1;
        }
        case "colR": { const t = tracks(node); return t.length > 1 ? t[t.length - 1] : 0; }
        case "heroL": { const t = tracks(node); return t.length > 1 ? t[0] / (t[0] + t[1]) * 100 : 50; }
        case "minH": return px(cs.minHeight);
        default: return 0;
      }
    }
    function valueOf(def, node, prop) {
      if (VOTE_PROPS[prop]) return currentVotes()[VOTE_PROPS[prop]];
      if (PROPS[prop].virtual) return round(measuredVirtual(node, prop), 0);
      const stored = effectiveProp(def, prop);
      if (stored != null) return stored;
      return round(measured(def, node, prop), PROPS[prop].digits);
    }
    function propsFor(def, node) {
      const cs = getComputedStyle(node);
      const own = tracks(node);
      const parentDisplay = node.parentElement ? getComputedStyle(node.parentElement).display : "";
      const mode = posMode(def);
      let list = KIND_PROPS[def.kind] || KIND_PROPS.box;
      // 一次调好几个（或跟着数值移动的标注）时，用偏移量，不用坐标。
      if (mode === "offset") list = list.map((p) => (p === "x" ? "dx" : p === "y" ? "dy" : p));
      return list.filter((prop) => {
        if ((prop === "w" || prop === "hh") && mode !== "canvas") return false;
        if (ownProp(def, prop) || generalProp(def, prop)) return true;
        if (prop === "gap") return /grid|flex/.test(cs.display);
        if (prop === "order") return /grid|flex/.test(parentDisplay);
        if (prop === "colR" || prop === "heroL") return own.length > 1;
        return true;
      });
    }
    function dimsFor(def, node) {
      const dims = Object.assign({}, KIND_DIMS[def.kind] || {});
      const props = propsFor(def, node);
      for (const k of ["w", "h", "both", "scale"]) if (dims[k] && !props.includes(dims[k])) delete dims[k];
      return dims;
    }
    function autoKind(node) {
      const cs = getComputedStyle(node);
      const textOnly = !Array.from(node.children).some((child) => !INLINE_TAGS.has(child.tagName) && !child.classList.contains("fraction") && child.tagName !== "SPAN" && child.tagName !== "TEMPLATE");
      if (cs.position === "absolute" || cs.position === "fixed") return textOnly ? "abstext" : "abs";
      if (/grid|flex/.test(cs.display)) return "group";
      if (/^H[1-6]$|^P$/.test(node.tagName) || textOnly) return "text";
      return "box";
    }
    function token(node) {
      if (node.id) return `#${CSS.escape(node.id)}`;
      const tag = node.tagName.toLowerCase();
      for (const attr of ANCHOR_ATTRS) if (node.hasAttribute(attr)) return `${tag}[${attr}="${cssString(node.getAttribute(attr))}"]`;
      for (const attr of FLAG_ATTRS) if (node.hasAttribute(attr)) return `${tag}[${attr}]`;
      const classes = Array.from(node.classList).filter((c) => !SKIP_CLASS.test(c)).map((c) => `.${CSS.escape(c)}`).join("");
      return tag + classes;
    }
    function buildSelector(node) {
      const rootEl = ctx.pickRoot();
      if (node === rootEl && rootEl.id) return `#${CSS.escape(rootEl.id)}`;
      const prefix = rootEl.id ? `#${CSS.escape(rootEl.id)}` : "body";
      const parts = [];
      let current = node;
      while (current && current !== rootEl && current.parentElement) {
        let part = token(current);
        const parent = current.parentElement;
        if (!part.startsWith("#")) {
          const siblings = Array.from(parent.children);
          if (siblings.some((s) => s !== current && s.matches(part))) part += `:nth-child(${siblings.indexOf(current) + 1})`;
        }
        parts.unshift(part);
        const candidate = parts[0].startsWith("#") ? parts.join(" > ") : `${prefix} ${parts.join(" > ")}`;
        try { if (document.querySelectorAll(candidate).length === 1) return candidate; } catch (_) {}
        current = parent;
      }
      return `${prefix} > ${parts.join(" > ")}`;
    }
    function describe(node) {
      const text = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 14);
      const tag = node.tagName.toLowerCase();
      const cls = Array.from(node.classList).filter((c) => !SKIP_CLASS.test(c))[0];
      return `${tag}${cls ? "." + cls : ""}${text ? "「" + text + "」" : ""}`;
    }
    function pickedDefs() {
      const out = [];
      const seen = new Set();
      for (const key of bucketKeysFor(pageKey())) {
        for (const [entryKey, entry] of Object.entries(bucket(key, false) || {})) {
          if (!entryKey.startsWith("pick:") || seen.has(entryKey)) continue;
          seen.add(entryKey);
          out.push({ key: entryKey, sel: entry.sel, label: entry.label, kind: entry.kind, picked: true });
        }
      }
      return out;
    }
    function defForNode(node) {
      for (const def of ctx.registry) {
        const nodes = nodesOf(def);
        if ((nodes.length === 1 || def.kind === "guard") && nodes.includes(node)) return def;
      }
      const sel = buildSelector(node);
      const key = `pick:${sel}`;
      const existing = pickedDefs().find((d) => d.key === key);
      if (existing) return existing;
      return { key, sel, label: describe(node), kind: autoKind(node), picked: true };
    }
    function resolvePickTarget(target) {
      let node = target;
      if (!node || node.nodeType !== 1) node = node && node.parentElement;
      const rootEl = ctx.pickRoot();
      if (!node || !rootEl || !(node === rootEl || rootEl.contains(node))) return null;
      if (node.closest(".beam-layout-tuner")) return null;
      while (node !== rootEl && (INLINE_TAGS.has(node.tagName) || (node.closest(".fraction") && node !== node.closest(".fraction")) || node.classList.contains("math-variable"))) node = node.parentElement;
      const force = node.closest(".force-free-element");
      if (force && (node.tagName === "IMG" || node.tagName === "CANVAS")) node = force;
      const live = node.closest(".force-live-value, .deformation-formula-label, .endpoint-label, .deformation-zero-label");
      if (live) node = live;
      if (node.tagName === "IFRAME") node = node.closest(".preview-panel") || node;
      if (node === document.body || node === document.documentElement) return null;
      return node;
    }

    /* 选中 */
    function select(def, node) {
      selected = def ? { def, node: node || nodesOf(def)[0] || null } : null;
      renderPanel();
    }
    function selectedNodes() {
      if (!selected) return [];
      const nodes = nodesOf(selected.def);
      if (nodes.length) selected.node = nodes[0];
      return nodes;
    }

    /* 文字与图片 */
    function textEditable(node) {
      if (!node || node === appEl || node === document.body) return false;
      if (/^(IMG|CANVAS|INPUT|SELECT|TEXTAREA|IFRAME|SVG)$/i.test(node.tagName)) return false;
      if (node.closest(DYNAMIC_SEL) || node.querySelector(DYNAMIC_SEL)) return false;
      if (node.querySelector(`img, canvas, svg, ${INTERACTIVE_SEL}`)) return false;
      if (node.querySelectorAll("*").length > 60) return false;
      return true;
    }
    function currentSource(def, node) {
      for (const level of levels()) { const entry = entryAt(def, level); if (entry && typeof entry.text === "string") return entry.text; }
      for (const entry of inheritedEntries(def)) if (typeof entry.text === "string") return entry.text;
      if (originalHtml.has(node) && node.querySelector(":scope > template[data-beam-mark]")) return cleanSource(originalHtml.get(node));
      return cleanSource(node.innerHTML).trim();
    }
    function imageTarget(node) {
      if (!node) return null;
      if (node.tagName === "IMG") return node;
      const img = node.querySelector(":scope > img");
      return img || null;
    }
    function setText(def, value) {
      beginEdit(`${def.key}|text`);
      const level = contentLevel(def);
      const entry = entryFor(def, level);
      if (!entry) return;
      statusNote = "";
      entry.text = value;
      clearMoreSpecific(def, level, (e) => { delete e.text; });
      commit();
    }
    function clearText(def) {
      const targets = contentTargets(def).filter((entry) => typeof entry.text === "string");
      if (!targets.length) return;
      beginEdit(`clear-text|${def.key}`, true);
      targets.forEach((entry) => delete entry.text);
      commit({ rebuild: true });
    }
    function applyImage(picked) {
      if (!selected || !picked || typeof picked.data !== "string" || !/^data:image\//.test(picked.data)) return;
      const node = selectedNodes()[0];
      const target = imageTarget(node);
      if (!target) return;
      const def = selected.def;
      beginEdit(`img|${def.key}`, true);
      const level = contentLevel(def);
      const entry = entryFor(def, level);
      if (!entry) return;
      entry.img = picked.data;
      entry.imgSel = target === node ? def.sel : `${def.sel} > img`;
      entry.imgRatio = round(Number(picked.ratio) || 1, 5);
      entry.ratioVar = Boolean(node.style && node.style.getPropertyValue("--element-ratio"));
      clearMoreSpecific(def, level, (e) => IMAGE_FIELDS.forEach((f) => delete e[f]));
      statusNote = `已换成「${picked.name || "新图片"}」。`;
      commit({ rebuild: true });
    }
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      try { const { data, ratio } = await readImage(file); applyImage({ data, ratio, name: file.name }); }
      catch (error) { statusNote = `图片没有换成：${error.message || error}`; renderStatus(); }
    });
    function clearImage(def) {
      const targets = contentTargets(def).filter((entry) => entry.img);
      if (!targets.length) return;
      beginEdit(`clear-img|${def.key}`, true);
      targets.forEach((entry) => IMAGE_FIELDS.forEach((f) => delete entry[f]));
      commit({ rebuild: true });
    }

    /* 面板渲染 */
    function regimeText() {
      const key = workRegime();
      const w = Math.round(window.innerWidth);
      if (ctx.kind === "phone") {
        if (!key) return `<span class="warn">当前宽度 ${w}px，不是手机宽度（小于 700px），这里不能调。</span>`;
        return `手机版面 · 屏幕 ${w}×${Math.round(window.innerHeight)}<br><span class="sub">先继承教师版（宽屏档）的画布排布、改过的文字和图片，再叠加这里的调整；只影响手机上打开的 student.html。蓝色数值是继承来的。</span>`;
      }
      if (!key) return `<span class="warn">当前宽度 ${w}px（手机排版），不在调试范围。请把窗口放大；手机版面请用 student-edit.html 调。</span>`;
      const r = REGIMES[key];
      if (ctx.kind === "console") {
        const mode = consoleFocus() ? "放大预览" : "普通视图";
        return `控制台 · <b>${mode}</b> · ${r.label}档（${r.range}，窗口宽 ${w}px）<br><span class="sub">控制台的调整在 00–03 各阶段都生效。${consoleFocus() ? "" : "学生预览在这里只显示整页缩略图；要改页面内容，请点「放大学生预览」。"}</span>`;
      }
      const tip = key === "wide" ? "" : "（投屏「放大学生预览」若属于宽屏档，请到宽屏档再调）";
      return `正在调：<b>${r.label}档</b>（${r.range}）· 当前宽 ${w}px ${tip}`;
    }
    function renderChips() {
      const chips = $(".chips");
      const scrollTop = chips.scrollTop;
      const list = ctx.registry.filter((def) => nodesOf(def).length);
      const extra = pickedDefs();
      if (selected && selected.def.picked && !extra.some((d) => d.key === selected.def.key)) extra.push(selected.def);
      let html = "";
      let section = null;
      for (const def of list) {
        if (def.section && def.section !== section) { section = def.section; html += `<div class="chip-sep">${escapeHtml(section)}</div>`; }
        html += chipHtml(def);
      }
      if (extra.length) html += `<div class="chip-sep">点选的元素</div>${extra.map(chipHtml).join("")}`;
      chips.innerHTML = html || '<span class="hint">这里没有可调元素。</span>';
      chips.scrollTop = scrollTop;
      chips._defs = [...list, ...extra];
      schedulePost();
    }
    function chipHtml(def) {
      const changed = anyEntry(def) ? '<span class="dot">●</span>' : "";
      const shared = levels().slice(1).some((level) => entryAt(def, level));
      const mark = shared ? '<span class="shared" title="有「通用」的调整（不只本页）">⇄</span>' : "";
      const isSel = selected && selected.def.key === def.key;
      return `<button class="chip${isSel ? " sel" : ""}" data-key="${escapeHtml(def.key)}">${changed}${escapeHtml(def.label)}${mark}</button>`;
    }
    function levelsHtml(def) {
      const list = levels();
      if (list.length < 2) return "";
      const current = editLevel(def);
      return `<div class="levels"><span class="lv-title">应用范围</span>${list.map((level) => `<button class="level${level === current ? " on" : ""}" data-action="level" data-level="${level}">${escapeHtml(levelLabel(level))}${hasProps(entryAt(def, level)) ? " ●" : ""}</button>`).join("")}</div>
        <p class="hint lv-hint">${escapeHtml(levelHint(current))}</p>`;
    }
    function contentLevelsHtml(def, title) {
      const list = levels();
      if (list.length < 2) return "";
      const current = contentLevel(def);
      return `<div class="levels small"><span class="lv-title">${title}</span>${list.map((level) => `<button class="level${level === current ? " on" : ""}" data-action="clevel" data-level="${level}">${escapeHtml(levelShort(level))}${hasContent(entryAt(def, level)) ? " ●" : ""}</button>`).join("")}</div>`;
    }
    function inheritNote(def) {
      const inherited = inheritedEntries(def);
      if (!inherited.length) return "";
      const names = new Set();
      inherited.forEach((entry) => {
        const p = inheritedProps(entry);
        if (p.left != null || p.top != null) names.add("位置");
        if (p.width != null || p.h != null) names.add("大小");
        if (p.ar != null) names.add("宽高比");
        if (p.text != null) names.add("文字大小");
        if (typeof entry.text === "string") names.add("文字内容");
        if (entry.img) names.add("图片");
      });
      return names.size ? `<p class="hint inherit">继承自教师版：${escapeHtml([...names].join("、"))}（位置、大小按画布比例）。在这里改只影响手机。</p>` : "";
    }
    function renderEditor() {
      const editor = $(".editor");
      let html;
      if (!workRegime()) html = "";
      else if (!selected) {
        html = `<p class="hint">从上面的列表选一个元素，或点「🎯 在页面上点选」后直接点页面。<br>选中后：拖元素本身或 ✥ 移动；拖右下角 ◢ 改大小，拖右边、下边的小条只改宽或高；方向键微调（Shift 步长大）。</p>`;
      } else {
        const nodes = selectedNodes();
        if (!nodes.length) html = `<p class="hint">「${escapeHtml(selected.def.label)}」在这里没有显示。</p>`;
        else {
          const def = selected.def;
          const node = nodes[0];
          const props = propsFor(def, node);
          const level = editLevel(def);
          const group = nodes.length > 1 ? `<span class="badge">共 ${nodes.length} 个，一起调整</span>` : "";
          let tip = KIND_TIPS[def.kind] ? `<p class="hint">${KIND_TIPS[def.kind]}</p>` : "";
          if (ctx.kind === "console" && frameOn() && def.key === "c:main") tip += '<p class="hint inherit">带外框时：控制台主体就是屏幕，外框跟着它走。改宽度就是改屏幕宽度（放大预览里，学生预览的页面也会跟着变宽或变窄）。</p>';
          if (def.kind === "canvas") {
            const mainDef = ctx.registry.find((d) => d.kind === "main");
            if (mainDef && effectiveProp(mainDef, "hpx") != null) tip += '<p class="hint inherit">页面主体设了高度：画布的高度跟着页面主体变，这时「宽高比」不起作用。</p>';
          }
          let content = "";
          if (textEditable(node) && nodes.length === 1) {
            const hasText = ownText(def);
            content += `<details class="text-edit"${hasText || openTextKey === def.key ? " open" : ""}><summary>✎ 改文字 / 公式（显示源码）${hasText ? " ●" : ""}</summary>
              ${contentLevelsHtml(def, "文字范围")}
              <textarea class="source" spellcheck="false">${escapeHtml(currentSource(def, node))}</textarea>
              <p class="hint">可以直接写 HTML：&lt;i&gt;F&lt;/i&gt;&lt;sub&gt;yB&lt;/sub&gt; 是斜体加下标，&lt;sup&gt;2&lt;/sup&gt; 是上标，&lt;br&gt; 换行，&lt;b&gt;加粗&lt;/b&gt;，&lt;span style="color:#d71920"&gt;红字&lt;/span&gt;。改完即时显示。</p>
              ${hasText ? '<div class="row"><button data-action="clear-text">恢复原文</button></div>' : ""}</details>`;
          } else if (node.textContent.trim() && !imageTarget(node) && nodes.length === 1 && !VOTE_DEFS.has(def.key)) {
            content += '<p class="hint">这里的文字由程序实时生成（或里面有按钮、输入框），不能改成固定文字。</p>';
          }
          if (imageTarget(node) && nodes.length === 1) {
            const hasImg = ownImage(def);
            content += `<div class="img-row"><div class="row wrap"><button data-action="replace-image">🖼 换一张图片…</button>${hasImg ? '<button data-action="clear-image">恢复原图</button><span class="dot">●</span>' : ""}</div>${textEditable(node) ? "" : contentLevelsHtml(def, "图片范围")}</div>`;
          }
          const originNote = props.includes("x") ? `<p class="hint">坐标原点：${ctx.kind === "phone" ? "手机页面左上角" : ctx.kind === "console" ? "整个页面（浏览器窗口）左上角，和学生预览里的元素是同一套坐标" : embedded ? "整个页面（浏览器窗口）左上角，和顶部栏、控制台是同一套坐标" : "这个页面左上角"}，单位 px。</p>` : "";
          html = `<div class="ed-head"><strong>${escapeHtml(def.label)}</strong>${group}</div>
            <div class="sel-text" title="${escapeHtml(def.sel)}">${escapeHtml(def.sel)}</div>
            ${VOTE_DEFS.has(def.key) ? `<p class="hint">投票人数（不分页、不分范围，教师版和学生页的投票反馈都用这组数；「N 人完成判断」自动等于 A + B + C）：</p>${Object.keys(VOTE_PROPS).map((prop) => rowHtml(def, prop)).join("")}<p class="hint">下面是这个元素的位置和大小：</p>` : ""}
            ${levelsHtml(def)}${inheritNote(def)}${tip}${originNote}
            ${props.map((prop) => rowHtml(def, prop)).join("")}
            ${content}
            <div class="row"><button data-action="reset-element">重置此元素（${levelShort(level)}）</button></div>`;
        }
      }
      // 正在改源码时窗口重画：保留光标和没存进去的字。
      const active = root.activeElement;
      const keep = active && active.classList && active.classList.contains("source") && selected && lastEditorKey === selected.def.key
        ? { value: active.value, start: active.selectionStart, end: active.selectionEnd } : null;
      editor.innerHTML = html;
      lastEditorHtml = html;
      lastEditorKey = selected ? selected.def.key : null;
      if (keep) {
        const area = editor.querySelector("textarea.source");
        if (area) { area.value = keep.value; area.focus(); try { area.setSelectionRange(keep.start, keep.end); } catch (_) {} }
      }
      refreshRows();
      schedulePost();
    }
    function rowHtml(def, prop) {
      const meta = PROPS[prop];
      return `<div class="prop" data-prop="${prop}">
        <span class="name">${meta.label}</span>
        <input type="range" min="${meta.min}" max="${meta.max}" step="${meta.step}">
        <input type="number" step="${meta.step}">
        <span class="unit">${meta.unit}</span>
        <button class="reset" data-reset="${prop}" title="恢复默认" disabled>↺</button>
      </div>`;
    }
    function refreshRows() {
      if (!selected) return;
      const nodes = selectedNodes();
      if (!nodes.length) return;
      const def = selected.def;
      root.querySelectorAll(".prop").forEach((row) => {
        const prop = row.dataset.prop;
        const meta = PROPS[prop];
        const value = valueOf(def, nodes[0], prop);
        const range = row.querySelector('input[type="range"]');
        const number = row.querySelector('input[type="number"]');
        if (meta.virtual) {
          // 坐标、像素宽高：滑块范围跟着页面大小
          const span = prop === "y" ? globalY(Math.max(document.documentElement.scrollHeight, window.innerHeight))
            : prop === "x" ? globalX(window.innerWidth) : (prop === "hh" ? window.innerHeight : window.innerWidth) * origin.scale;
          range.min = prop === "x" || prop === "y" ? "0" : "4";
          range.max = String(Math.round(span));
        }
        if (value < Number(range.min)) range.min = String(Math.floor(value));
        if (value > Number(range.max)) range.max = String(Math.ceil(value));
        if (root.activeElement !== range) range.value = String(value);
        if (root.activeElement !== number) number.value = String(round(value, meta.digits));
        const vote = VOTE_PROPS[prop];
        const own = vote ? currentVotes()[vote] !== defaultVotes()[vote] : ownProp(def, prop);
        const general = !own && !vote && generalProp(def, prop);
        row.classList.toggle("changed", own);
        row.classList.toggle("general", general);
        row.title = general ? (ctx.kind === "phone" ? "继承来的数值（来自教师版或更大的范围）" : "来自更大范围的设置") : "";
        row.querySelector(".reset").disabled = !own;
      });
      schedulePost();
    }
    function renderStatus() {
      const status = $(".status");
      savedCanon = savedCanon || canon(saved);
      const dirty = draftCanon !== savedCanon;
      status.className = `status ${dirty ? "dirty" : "ok"}`;
      status.innerHTML = (dirty ? "● 有改动还没保存到文件（目前只在这台电脑的浏览器里）" : "✓ 与 static/layout-overrides.js 一致")
        + (statusNote ? `<br><span class="note">${escapeHtml(statusNote)}</span>` : "");
      $('[data-action="undo"]').disabled = !undoStack.length;
      $('[data-action="redo"]').disabled = !redoStack.length;
      schedulePost();
    }
    function renderPanel() {
      const key = pageKey();
      $(".page-tag").textContent = ctx.kind === "console" ? (consoleFocus() ? "控制台 · 放大" : "控制台") : (key || "");
      if (pageSelect && key && pageSelect.value !== key) pageSelect.value = key;
      $(".regime").innerHTML = regimeText();
      $(".pick").classList.toggle("on", picking);
      const scopeBtn = $(".scope-btn");
      const scopeLabel = ctx.scopeButton ? ctx.scopeButton() : null;
      scopeBtn.hidden = !scopeLabel;
      if (scopeLabel) { scopeBtn.textContent = scopeLabel.text; scopeBtn.title = scopeLabel.title; }
      renderChips();
      renderEditor();
      renderStatus();
    }

    /* 手机版面：把窗口的内容发给外壳页显示，外壳页里的操作再发回来 */
    let postQueued = false;
    function snapshot() {
      const status = $(".status");
      const scopeBtn = $(".scope-btn");
      return {
        pageTag: $(".page-tag").textContent,
        regime: $(".regime").innerHTML,
        chips: $(".chips").innerHTML,
        editor: lastEditorHtml,
        status: { cls: status.className, html: status.innerHTML },
        page: pageSelect ? pageSelect.value : "",
        picking,
        undo: !undoStack.length,
        redo: !redoStack.length,
        scope: { hidden: scopeBtn.hidden, text: scopeBtn.textContent, title: scopeBtn.title },
        rows: Array.from(root.querySelectorAll(".prop")).map((row) => {
          const range = row.querySelector('input[type="range"]');
          return { prop: row.dataset.prop, range: range.value, min: range.min, max: range.max, number: row.querySelector('input[type="number"]').value,
            changed: row.classList.contains("changed"), general: row.classList.contains("general"), title: row.title, reset: row.querySelector(".reset").disabled };
        }),
      };
    }
    function postNow() { if (remote) remote.post({ type: "beam-tuner-view", view: snapshot() }); }
    function schedulePost() {
      if (!remote || postQueued) return;
      postQueued = true;
      Promise.resolve().then(() => { postQueued = false; postNow(); });
    }
    function replay(evt) {
      if (!evt || typeof evt !== "object") return;
      if (evt.kind === "click") {
        let el = null;
        if (evt.chip != null) el = Array.from(root.querySelectorAll(".chip")).find((c) => c.dataset.key === evt.chip);
        else if (evt.reset) el = Array.from(root.querySelectorAll("[data-reset]")).find((b) => b.dataset.reset === evt.reset);
        else if (evt.action) el = Array.from(root.querySelectorAll("[data-action]")).find((b) => b.dataset.action === evt.action && (evt.level == null || b.dataset.level === evt.level));
        if (el && !el.disabled) el.click();
      } else if (evt.kind === "input") {
        const input = root.querySelector(`.prop[data-prop="${cssString(String(evt.prop))}"] input[type="${evt.from === "range" ? "range" : "number"}"]`);
        if (input) { input.value = String(evt.value); input.dispatchEvent(new Event("input", { bubbles: true })); }
      } else if (evt.kind === "source") {
        const area = root.querySelector("textarea.source");
        if (area) { area.value = String(evt.value); area.dispatchEvent(new Event("input", { bubbles: true })); }
      } else if (evt.kind === "page") {
        if (pageSelect) { pageSelect.value = String(evt.value); pageSelect.dispatchEvent(new Event("change")); }
      } else if (evt.kind === "image") {
        applyImage(evt);
      } else if (evt.kind === "note") {
        statusNote = String(evt.text || "");
        renderStatus();
      } else if (evt.kind === "key") {
        handleKey(evt, Boolean(evt.typing));
      } else if (evt.kind === "hello") {
        postNow();
      }
    }

    /* 高亮框与拖动手柄 */
    let labelCache = new WeakMap();
    function hoverLabel(node) {
      if (!labelCache.has(node)) labelCache.set(node, defForNode(node).label);
      return labelCache.get(node);
    }
    function previewPanelNode() { return document.querySelector("#teacherCockpit .preview-panel"); }
    function drawBoxes() {
      const showing = panelShowing() && workRegime();
      const targets = [];
      if (showing && selected) {
        const nodes = selectedNodes();
        const coords = nodes.length === 1 && selected.def.kind !== "label";
        nodes.forEach((node, index) => {
          let tag = "";
          if (index === 0) {
            tag = selected.def.label;
            if (coords) { const r = node.getBoundingClientRect(); tag += `（${Math.round(globalX(r.left + window.scrollX))}, ${Math.round(globalY(r.top + window.scrollY))}）`; }
          }
          targets.push({ node, cls: index === 0 ? "sel primary" : "sel", tag });
        });
      }
      if (showing && picking && hoverNode && hoverNode.isConnected) targets.push({ node: hoverNode, cls: "hover", tag: hoverLabel(hoverNode) });
      while (boxesEl.children.length < targets.length) boxesEl.appendChild(document.createElement("div"));
      Array.from(boxesEl.children).forEach((box, index) => {
        const target = targets[index];
        if (!target) { box.hidden = true; return; }
        const rect = target.node.getBoundingClientRect();
        box.hidden = false;
        box.className = `box ${target.cls}${picking ? " picking" : ""}`;
        box.style.left = `${rect.left}px`;
        box.style.top = `${rect.top}px`;
        box.style.width = `${Math.max(2, rect.width)}px`;
        box.style.height = `${Math.max(2, rect.height)}px`;
        const tagHtml = target.tag ? `<span class="tag">${escapeHtml(target.tag)}</span>` : "";
        if (box._tag !== tagHtml) { box.innerHTML = tagHtml; box._tag = tagHtml; }
      });
      const first = showing && selected ? selectedNodes()[0] : null;
      const props = first ? propsFor(selected.def, first) : [];
      const dims = first ? dimsFor(selected.def, first) : {};
      const canMove = Boolean(first && (props.includes("x") || props.includes("dx")));
      const canCorner = Boolean(first && (dims.w || dims.h || dims.both || dims.scale));
      // 四条边都能拖：右、下边改宽高（左上角不动）；左、上边连位置一起改（对边不动）。
      handles.move.hidden = !canMove;
      handles.corner.hidden = !canCorner;
      handles.right.hidden = !(first && dims.w);
      handles.bottom.hidden = !(first && dims.h);
      handles.left.hidden = !(first && dims.w && canMove);
      handles.top.hidden = !(first && dims.h && canMove);
      if (first) {
        const rect = first.getBoundingClientRect();
        // 手柄始终留在可见区域内（元素贴边时也能抓到）。
        const clampX = (x, size) => Math.min(Math.max(0, x), window.innerWidth - size);
        const clampY = (y, size) => Math.min(Math.max(0, y), window.innerHeight - size);
        handles.move.style.left = `${clampX(rect.left - 12, 24)}px`;
        handles.move.style.top = `${clampY(rect.top - 12, 24)}px`;
        handles.corner.style.left = `${clampX(rect.right - 12, 24)}px`;
        handles.corner.style.top = `${clampY(rect.bottom - 12, 24)}px`;
        handles.right.style.left = `${clampX(rect.right - 5, 10)}px`;
        handles.right.style.top = `${clampY(rect.top + rect.height / 2 - 14, 28)}px`;
        handles.bottom.style.left = `${clampX(rect.left + rect.width / 2 - 14, 28)}px`;
        handles.bottom.style.top = `${clampY(rect.bottom - 5, 10)}px`;
        handles.left.style.left = `${clampX(rect.left - 5, 10)}px`;
        handles.left.style.top = `${clampY(rect.top + rect.height / 2 - 14, 28)}px`;
        handles.top.style.left = `${clampX(rect.left + rect.width / 2 - 14, 28)}px`;
        handles.top.style.top = `${clampY(rect.top - 5, 10)}px`;
      }
      const primary = boxesEl.querySelector(".box.primary");
      if (primary) primary.classList.toggle("draggable", canMove && !picking);
      // 控制台里点选时，学生预览整块作为一个元素。
      const pv = ctx.kind === "console" && picking && showing ? previewPanelNode() : null;
      shield.hidden = !pv;
      if (pv) {
        const rect = pv.getBoundingClientRect();
        Object.assign(shield.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      }
    }
    function frame() {
      try { drawBoxes(); } catch (error) { console.error(error); }
      requestAnimationFrame(frame);
    }

    function startDrag(event, mode, handleEl) {
      if (!selected) return;
      const node = selectedNodes()[0];
      if (!node) return;
      event.preventDefault();
      event.stopPropagation();
      const def = selected.def;
      const props = propsFor(def, node);
      const dims = dimsFor(def, node);
      const start = { x: event.clientX, y: event.clientY };
      const rect = node.getBoundingClientRect();
      const values = { w0: rect.width, h0: rect.height };
      const container = containerOf(node);
      beginEdit(`drag|${def.key}|${mode}`, true);
      if (mode === "move") {
        if (posMode(def) === "canvas") {
          const cs = getComputedStyle(node);
          values.canvas = true;
          values.left = px(cs.left);
          values.top = px(cs.top);
          // 分隔线的宽度原来由左右两端决定，移动前先定住宽度
          if (def.kind === "bar" && !editTargets(def).concat(levels().map((l) => entryAt(def, l))).some((entry) => hasStored(entry, "w"))) {
            setStored(def, "wvw", px(cs.width) / vwPx(), { noUndo: true, skipPersist: true, keepNote: true }, { legacy: ["width"], refs: canvasRefs(node) });
          }
        } else {
          const t = currentTranslate(node);
          values.dx = t[0];
          values.dy = t[1];
        }
      } else {
        for (const key of ["w", "h", "both", "scale"]) if (dims[key]) values[key] = valueOf(def, node, dims[key]);
        if (def.kind === "main" && dims.h === "hpx") values.h = measured(def, node, "hpx"); // 从看到的高度开始算
        values.r0 = rect.right;
        values.b0 = rect.bottom;
        if (dims.w === "width") values.basis = widthBasis(def, node) || 1;
        if (dims.h === "h") values.ch = container.clientHeight || 1;
        // 记住左上角：拖右、下边时左上角不动（居中的元素也一样）；拖左、上边时对边不动。
        if (props.includes("x")) { values.x0 = measuredVirtual(node, "x"); values.y0 = measuredVirtual(node, "y"); }
        else if (props.includes("dx")) { const t = currentTranslate(node); values.dx0 = t[0]; values.dy0 = t[1]; }
      }
      dragging = true;
      const capture = handleEl || event.currentTarget;
      try { capture.setPointerCapture(event.pointerId); } catch (_) {}
      const onMove = (moveEvent) => {
        const dx = moveEvent.clientX - start.x;
        const dy = moveEvent.clientY - start.y;
        const opts = { noUndo: true, skipPersist: true, keepNote: true };
        if (mode === "move") {
          if (values.canvas) {
            const refs = canvasRefs(node);
            setStored(def, "lvw", (values.left + dx) / vwPx(), opts, { tag: "x", legacy: ["left"], refs });
            setStored(def, "tvw", (values.top + dy) / vwPx(), opts, { tag: "y", legacy: ["top"], refs });
          } else {
            setStored(def, "dx", values.dx + dx, opts);
            setStored(def, "dy", values.dy + dy, opts);
          }
          return;
        }
        const useW = mode === "corner" || mode === "right" || mode === "left";
        const useH = mode === "corner" || mode === "bottom" || mode === "top";
        if (dims.scale) { setProp(def, dims.scale, Math.max(20, values.scale * (values.w0 + dx) / (values.w0 || 1)), opts); return; }
        if (dims.both) { setProp(def, dims.both, Math.max(8, values.both + Math.max(dx, dy)), opts); return; }
        const gw = mode === "left" ? -dx : dx; // 宽度的变化
        const gh = mode === "top" ? -dy : dy; // 高度的变化
        const scale = origin.scale || 1;
        const newW = values.w0 + (useW ? gw : 0);
        const newH = values.h0 + (useH ? gh : 0);
        if (useW && dims.w === "width") setProp(def, "width", Math.max(1, values.w + gw / values.basis * 100), opts);
        else if (useW && dims.w === "wpx") setProp(def, "wpx", Math.max(10, values.w + gw), opts);
        else if (useW && dims.w === "w") setProp(def, "w", Math.max(4, values.w + gw * scale), opts);
        if (useH && dims.h === "hpx") setProp(def, "hpx", Math.max(10, values.h + gh), opts);
        else if (useH && dims.h === "h") setProp(def, "h", Math.max(1, values.h + gh / values.ch * 100), opts);
        else if (useH && dims.h === "hh") setProp(def, "hh", Math.max(2, values.h + gh * scale), opts);
        if (dims.h === "ar") setProp(def, "ar", Math.max(0.3, Math.max(20, newW) / Math.max(20, newH)), opts);
        // 位置：拖左、上边时这一边跟着鼠标走；其他时候左上角保持原位（只有真的跑偏了才记下来）。
        if (values.x0 != null) {
          const tx = mode === "left" ? values.x0 + dx * scale : values.x0;
          if (mode === "left" || Math.abs(measuredVirtual(node, "x") - tx) > 0.5) setProp(def, "x", tx, opts);
          const ty = mode === "top" ? values.y0 + dy * scale : values.y0;
          if (mode === "top" || Math.abs(measuredVirtual(node, "y") - ty) > 0.5) setProp(def, "y", ty, opts);
          // 宽或高已经到最小（比如页面主体最矮到内容放得下）：拖左、上边时，对边仍然不动。
          const r = node.getBoundingClientRect();
          if (mode === "left" && Math.abs(r.right - values.r0) > 0.5) setProp(def, "x", measuredVirtual(node, "x") + (values.r0 - r.right) * scale, opts);
          if (mode === "top" && Math.abs(r.bottom - values.b0) > 0.5) setProp(def, "y", measuredVirtual(node, "y") + (values.b0 - r.bottom) * scale, opts);
        } else if (values.dx0 != null) {
          if (mode === "left") setProp(def, "dx", values.dx0 + dx, opts);
          if (mode === "top") setProp(def, "dy", values.dy0 + dy, opts);
        }
      };
      const onUp = () => {
        dragging = false;
        capture.removeEventListener("pointermove", onMove);
        capture.removeEventListener("pointerup", onUp);
        capture.removeEventListener("pointercancel", onUp);
        draftCanon = canon(draft);
        persistDraft();
        refreshRows();
        renderChips();
        renderStatus();
      };
      capture.addEventListener("pointermove", onMove);
      capture.addEventListener("pointerup", onUp);
      capture.addEventListener("pointercancel", onUp);
    }
    Object.entries(handles).forEach(([mode, el]) => el.addEventListener("pointerdown", (event) => startDrag(event, mode, el)));
    boxesEl.addEventListener("pointerdown", (event) => {
      const box = event.target.closest(".box.primary.draggable");
      if (box) startDrag(event, "move", box);
    });

    /* 点选模式 */
    function setPicking(on) {
      picking = Boolean(on);
      hoverNode = null;
      document.documentElement.style.cursor = picking ? "crosshair" : "";
      const button = $(".pick");
      if (button) button.classList.toggle("on", picking);
      schedulePost();
    }
    const insideTuner = (event) => event.composedPath().includes(host);
    window.addEventListener("pointermove", (event) => {
      if (!picking || insideTuner(event)) return;
      hoverNode = resolvePickTarget(event.target);
    }, true);
    ["pointerdown", "mousedown", "pointerup", "mouseup", "touchstart"].forEach((type) => {
      window.addEventListener(type, (event) => {
        if (!picking || insideTuner(event)) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }, { capture: true, passive: false });
    });
    window.addEventListener("click", (event) => {
      if (!picking || insideTuner(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const node = resolvePickTarget(event.target);
      setPicking(false);
      if (node) select(defForNode(node), node);
    }, true);
    shield.addEventListener("pointermove", () => { hoverNode = previewPanelNode(); });
    shield.addEventListener("click", (event) => {
      event.preventDefault();
      const node = previewPanelNode();
      setPicking(false);
      if (node) select(defForNode(node), node);
    });

    /* 键盘（手机版面里，外壳页收到的按键也会转过来） */
    function handleKey(event, typing) {
      if (event.key === "Escape") {
        if (picking) setPicking(false); else if (selected && !typing) select(null);
        return false;
      }
      if (typing) return false;
      const key = String(event.key || "");
      if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === "z") { if (event.shiftKey) redo(); else undo(); return true; }
      if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === "y") { redo(); return true; }
      if (!selected || !/^Arrow(Up|Down|Left|Right)$/.test(key)) return false;
      const node = selectedNodes()[0];
      if (!node) return false;
      const def = selected.def;
      const props = propsFor(def, node);
      const sx = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0;
      const sy = key === "ArrowUp" ? -1 : key === "ArrowDown" ? 1 : 0;
      if (props.includes("x")) {
        const step = event.shiftKey ? 10 : 1;
        if (sx) setProp(def, "x", measuredVirtual(node, "x") + sx * step);
        if (sy) setProp(def, "y", measuredVirtual(node, "y") + sy * step);
      } else if (props.includes("dx")) {
        const step = event.shiftKey ? 10 : 1;
        if (sx) setProp(def, "dx", valueOf(def, node, "dx") + sx * step);
        if (sy) setProp(def, "dy", valueOf(def, node, "dy") + sy * step);
      }
      return true;
    }
    window.addEventListener("keydown", (event) => {
      if (!panelShowing()) return;
      const typing = event.composedPath().some((n) => n && /^(INPUT|SELECT|TEXTAREA)$/.test(n.tagName));
      if (handleKey(event, typing)) event.preventDefault();
    }, true);

    /* 撤销 / 重做（只撤销本窗口负责的部分） */
    // 撤销记录：一般只记本窗口负责的部分；「全部重置」记整份草稿。
    const isFull = (entry) => Boolean(entry && typeof entry === "object" && typeof entry.full === "string");
    const snapshotLike = (entry) => (isFull(entry) ? { full: JSON.stringify(draft) } : ownPart(draft));
    function restore(entry) {
      if (isFull(entry)) draft = normalize(JSON.parse(entry.full)); else mergeOwnPart(entry);
      commit({ rebuild: true });
    }
    function undo() { if (!undoStack.length) return; const entry = undoStack.pop(); redoStack.push(snapshotLike(entry)); statusNote = "已撤销上一步。"; restore(entry); lastEditTag = ""; }
    function redo() { if (!redoStack.length) return; const entry = redoStack.pop(); undoStack.push(snapshotLike(entry)); statusNote = "已重做。"; restore(entry); lastEditTag = ""; }
    function resetEverything() {
      undoStack.push({ full: JSON.stringify(draft) });
      if (undoStack.length > 60) undoStack.shift();
      redoStack.length = 0;
      lastEditTag = "";
      draft = emptyData();
      selected = null;
      statusNote = "已全部重置：教师版各页、控制台、手机版面、投票人数都恢复原样（可以撤销）。点「保存到文件」后，文件里才会清掉。";
      commit({ rebuild: true });
    }

    /* 翻页 */
    async function gotoPage(key) {
      if (ctx.gotoPage) {
        try { await ctx.gotoPage(key); } catch (error) { console.error(error); }
        ctx.onPageChanged && ctx.onPageChanged();
        return;
      }
      if (typeof api !== "function") return;
      const state = readState() || {};
      try {
        if (key === "WAIT") await api({ type: "set_stage", stage: 0 });
        else if (key === "E") { await api({ type: "set_stage", stage: 1 }); await api({ type: "set_voting", open: true }); }
        else if (key === "E-FB") { await api({ type: "set_stage", stage: 1 }); await api({ type: "show_vote_feedback" }); }
        else if (key.startsWith("A1-")) {
          if (Number(state.stage) !== 2) await api({ type: "set_stage", stage: 2 });
          await api({ type: "set_force_reveal", step: Number(key.slice(3)) });
        } else if (key.startsWith("A2-")) {
          if (Number(state.stage) !== 3) await api({ type: "set_stage", stage: 3 });
          await api({ type: "set_deformation_reveal", step: Number(key.slice(3)) });
        }
        if (typeof tick === "function") await tick();
      } catch (error) { console.error(error); }
      ctx.onPageChanged && ctx.onPageChanged();
    }
    function stepPage(delta) {
      const keys = pages.map(([key]) => key);
      const index = keys.indexOf(pageKey());
      const next = keys[Math.max(0, Math.min(keys.length - 1, (index < 0 ? 0 : index) + delta))];
      if (next) gotoPage(next);
    }

    /* 保存 */
    async function save() {
      const snapshotData = clone(draft);
      const content = fileContent(snapshotData);
      statusNote = "正在保存…";
      renderStatus();
      let result;
      try { result = await ctx.saveFile(content); }
      catch (error) { result = { ok: false, error: String(error && error.message || error) }; }
      if (result && result.ok && result.method === "picker") {
        const expected = canon(cleanData(clone(snapshotData)));
        const onDisk = await readSavedFile();
        if (onDisk !== undefined && canon(normalize(onDisk)) === expected) {
          saved = cleanData(snapshotData);
          savedCanon = canon(saved);
          // 先通知另一个调试窗「文件已更新」，再清草稿。
          try { localStorage.setItem(SAVED_KEY, JSON.stringify({ data: saved, t: Date.now() })); } catch (_) {}
          persistDraft();
          statusNote = ctx.kind === "phone"
            ? `已保存到本副本的 static/${FILE_NAME}。手机上打开 student.html 刷新后即可看到（放在网站上的学生页，要把这个文件一起上传）。`
            : `已保存到本副本的 static/${FILE_NAME}。正常打开 teacher.html（不带 ?edit=1）刷新后即可看到。`;
        } else {
          statusNote = `文件已写出（${result.name}），但本页读取的 static/${FILE_NAME} 仍是旧内容，可能存到了别的文件夹。请点「更多 → 重新选择保存位置」，再保存一次，选本副本的 static 文件夹。`;
        }
      } else if (result && result.ok && result.method === "download") {
        statusNote = `已下载 ${FILE_NAME}：请把它放进本副本的 static 文件夹，替换原来的同名文件，然后刷新页面。`;
      } else if (result && result.cancelled) {
        statusNote = "已取消保存。";
      } else {
        statusNote = `保存没有成功：${result && result.error ? result.error : "未知原因"}。可以用「更多 → 下载配置文件」。`;
      }
      renderStatus();
    }
    function resetBuckets(keys, note) {
      const regimeKey = workRegime();
      const regimePages = regimeKey ? draft.regimes[regimeKey] : null;
      if (!regimePages || !keys.some((k) => regimePages[k])) { statusNote = "这里没有可重置的调整。"; renderStatus(); return; }
      beginEdit("reset", true);
      keys.forEach((k) => delete regimePages[k]);
      selected = null;
      statusNote = note;
      commit({ rebuild: true });
    }

    /* 事件绑定 */
    root.addEventListener("click", (event) => {
      const chip = event.target.closest(".chip");
      if (chip) {
        const def = ($(".chips")._defs || []).find((d) => d.key === chip.dataset.key);
        if (def) select(def);
        return;
      }
      const reset = event.target.closest("[data-reset]");
      if (reset && selected) {
        const vote = VOTE_PROPS[reset.dataset.reset];
        if (vote) setVote(reset.dataset.reset, defaultVotes()[vote], { reset: true }); else clearProps(selected.def, [reset.dataset.reset]);
        return;
      }
      const actionEl = event.target.closest("[data-action]");
      if (!actionEl) return;
      const action = actionEl.dataset.action;
      if (action === "collapse") { ui.collapsed = true; persistUi(); applyVisibility(); }
      else if (action === "flip") {
        const rect = panel.getBoundingClientRect();
        ui.x = rect.left + rect.width / 2 > window.innerWidth / 2 ? 8 : null;
        persistUi();
        placePanel();
      } else if (action === "scope") { ctx.onScopeButton && ctx.onScopeButton(); }
      else if (action === "prev-page") stepPage(-1);
      else if (action === "next-page") stepPage(1);
      else if (action === "pick") setPicking(!picking);
      else if (action === "parent") {
        const node = selected && selectedNodes()[0];
        const rootEl = ctx.pickRoot();
        const parent = node && node !== rootEl ? node.parentElement : null;
        if (parent && parent !== document.body && parent !== document.documentElement && (parent === rootEl || rootEl.contains(parent))) select(defForNode(parent), parent);
      } else if (action === "level" && selected) setLevel(selected.def, actionEl.dataset.level, false);
      else if (action === "clevel" && selected) setLevel(selected.def, actionEl.dataset.level, true);
      else if (action === "replace-image" && selected) { fileInput.value = ""; fileInput.click(); }
      else if (action === "clear-image" && selected) clearImage(selected.def);
      else if (action === "clear-text" && selected) clearText(selected.def);
      else if (action === "reset-element" && selected) clearProps(selected.def, null);
      else if (action === "reset-page") {
        const regimeKey = workRegime();
        if (!regimeKey) return;
        if (ctx.kind === "console") resetBuckets(CONSOLE_KEYS, `已重置控制台（${REGIMES[regimeKey].label}档），可以撤销。`);
        else resetBuckets([pageKey()], `已清除本页单独的调整（${REGIMES[regimeKey].label}档，可以撤销）。「本阶段通用」「所有页通用」的调整还在：要清掉，选中元素后点「重置此元素」，或用「更多」里的全部重置。`);
      } else if (action === "reset-everything") {
        // 点两下才执行：第一下变成「确定全部重置？」，4 秒内再点一下。（手机调试页在外壳页里确认过）
        if (!remote && actionEl.dataset.armed !== "1") {
          actionEl.dataset.armed = "1";
          actionEl.textContent = "确定全部重置？";
          clearTimeout(actionEl._disarm);
          actionEl._disarm = setTimeout(() => { actionEl.dataset.armed = ""; actionEl.textContent = "全部重置"; }, 4000);
          return;
        }
        clearTimeout(actionEl._disarm);
        actionEl.dataset.armed = "";
        actionEl.textContent = "全部重置";
        resetEverything();
      } else if (action === "reset-all") {
        const regimeKey = workRegime();
        if (!regimeKey || !draft.regimes[regimeKey]) { statusNote = "这里没有可重置的调整。"; renderStatus(); return; }
        const keys = Object.keys(draft.regimes[regimeKey]).filter((k) => owns(regimeKey, k));
        resetBuckets(keys, ctx.kind === "phone" ? "已全部恢复成教师版的样子（可以撤销）。" : `已重置所有页（${REGIMES[regimeKey].label}档，可以撤销）。`);
      } else if (action === "undo") undo();
      else if (action === "redo") redo();
      else if (action === "save") save();
      else if (action === "discard") {
        beginEdit("discard", true);
        draft = clone(saved);
        selected = null;
        statusNote = "已放弃所有未保存的改动（可以撤销）。";
        commit({ rebuild: true });
      } else if (action === "download") {
        if (remote) remote.post({ type: "beam-tuner-download", content: fileContent(draft) }); else downloadFile(fileContent(draft));
        statusNote = `已下载 ${FILE_NAME}：放进本副本的 static 文件夹替换原文件即可生效。`;
        renderStatus();
      } else if (action === "forget-file") {
        ctx.forgetFile();
        statusNote = "下次保存时会重新弹出保存对话框。";
        renderStatus();
      } else if (action === "open-phone") {
        window.open(new URL("./student-edit.html", location.href).toString(), "_blank");
      } else if (action === "new-tab") {
        const url = new URL(location.href);
        url.searchParams.set("preview", "1");
        url.searchParams.set("tune", "1");
        window.open(url.toString(), "_blank");
      }
    });
    root.addEventListener("toggle", (event) => {
      const details = event.target;
      if (details && details.classList && details.classList.contains("text-edit") && selected) openTextKey = details.open ? selected.def.key : null;
    }, true);
    root.addEventListener("input", (event) => {
      if (event.target.classList.contains("source")) {
        if (!selected) return;
        const def = selected.def;
        const value = event.target.value;
        clearTimeout(textTimer);
        textTimer = setTimeout(() => setText(def, value), 250);
        return;
      }
      const row = event.target.closest(".prop");
      if (!row || !selected) return;
      const value = Number(event.target.value);
      if (event.target.value === "" || !Number.isFinite(value)) return;
      setProp(selected.def, row.dataset.prop, value);
      if (event.target.type === "range") row.querySelector('input[type="number"]').value = String(round(value, PROPS[row.dataset.prop].digits));
      else row.querySelector('input[type="range"]').value = String(value);
    });
    // 输入框离开时显示实际用的数值（比如页面主体高度被内容撑住时）。
    root.addEventListener("focusout", (event) => { if (event.target.closest && event.target.closest(".prop")) setTimeout(refreshRows); });
    if (pageSelect) pageSelect.addEventListener("change", () => gotoPage(pageSelect.value));
    pill.addEventListener("click", () => { ui.collapsed = false; persistUi(); applyVisibility(); });

    // 拖动面板标题栏
    $("header").addEventListener("pointerdown", (event) => {
      if (remote || event.target.closest("button")) return;
      const rect = panel.getBoundingClientRect();
      const offset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const header = event.currentTarget;
      try { header.setPointerCapture(event.pointerId); } catch (_) {}
      const onMove = (e) => { ui.x = e.clientX - offset.x; ui.y = e.clientY - offset.y; placePanel(); };
      const onUp = () => { header.removeEventListener("pointermove", onMove); header.removeEventListener("pointerup", onUp); persistUi(); };
      header.addEventListener("pointermove", onMove);
      header.addEventListener("pointerup", onUp);
    });

    window.addEventListener("storage", (event) => {
      if (event.key === SAVED_KEY && event.newValue) {
        try { saved = normalize(JSON.parse(event.newValue).data); savedCanon = canon(saved); statusNote = "已保存到文件（由另一个调试窗保存）。"; renderStatus(); } catch (_) {}
        return;
      }
      if (event.key !== DRAFT_KEY || dragging) return;
      try {
        const stored = event.newValue ? JSON.parse(event.newValue) : null;
        if (!stored) {
          // 草稿被清掉 = 刚保存过：以最新保存的内容为准。
          const latest = JSON.parse(localStorage.getItem(SAVED_KEY) || "null");
          if (latest && latest.data) { saved = normalize(latest.data); savedCanon = canon(saved); }
        }
        draft = stored && stored.data ? normalize(stored.data) : clone(saved);
        draftCanon = canon(draft);
        setActiveData(draft);
        renderPanel();
      } catch (_) {}
    });
    let lastRegime = workRegime();
    window.addEventListener("resize", () => {
      placePanel();
      const regimeKey = workRegime();
      if (regimeKey !== lastRegime) { lastRegime = regimeKey; applyContent(); renderPanel(); }
      else { $(".regime").innerHTML = regimeText(); schedulePost(); }
    });

    applyVisibility();
    renderPanel();
    requestAnimationFrame(frame);

    return {
      setAllowed(value) { const next = Boolean(value); if (next === allowed) return; allowed = next; applyVisibility(); if (allowed) renderPanel(); },
      // 控制台发来学生预览在整个页面上的位置：只更新数值，不重画窗口。
      setOrigin(value) {
        if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return;
        const next = { x: value.x, y: value.y, scale: Number.isFinite(value.scale) && value.scale > 0 ? value.scale : 1 };
        if (Math.abs(next.x - origin.x) < 0.01 && Math.abs(next.y - origin.y) < 0.01 && Math.abs(next.scale - origin.scale) < 0.0001) return;
        origin = next;
        refreshRows();
      },
      pageChanged() { labelCache = new WeakMap(); renderPanel(); },
      refresh() { renderPanel(); },
      get draft() { return draft; },
      get saved() { return saved; },
      get stacks() { return { undo: undoStack.length, redo: redoStack.length }; },
      gotoPage,
      save,
      replay,
      select: (key) => { const def = [...ctx.registry, ...pickedDefs()].find((d) => d.key === key); if (def) select(def); },
      setLevel: (key, level, content) => { const def = [...ctx.registry, ...pickedDefs()].find((d) => d.key === key); if (def) setLevel(def, level, Boolean(content)); },
      levelOf: (key, content) => { const def = [...ctx.registry, ...pickedDefs()].find((d) => d.key === key); return def ? (content ? contentLevel(def) : editLevel(def)) : null; },
    };
  }

  const TUNER_CSS = `
    :host { all: initial !important; position: fixed !important; inset: 0 !important; pointer-events: none !important; z-index: 2147483000 !important;
      font: 12.5px/1.45 "Microsoft YaHei", "PingFang SC", system-ui, sans-serif !important; color: #1f2933 !important; }
    :host([hidden]) { display: none !important; }
    :host([data-frame]) .panel { max-height: calc(100vh - 200px); }
    * { box-sizing: border-box; font-family: inherit; }
    [hidden] { display: none !important; }
    .panel { position: fixed; pointer-events: auto; width: 340px; max-height: calc(100vh - 12px); display: flex; flex-direction: column; background: #fff;
      border: 1px solid #c9d6e6; border-radius: 12px; box-shadow: 0 14px 40px rgba(20,40,80,.25); overflow: hidden; }
    header { display: flex; align-items: center; gap: 5px; padding: 7px 9px; background: #24549a; color: #fff; cursor: move; user-select: none; touch-action: none; }
    header strong { font-size: 13.5px; white-space: nowrap; }
    .page-tag { padding: 1px 7px; border-radius: 6px; background: rgba(255,255,255,.2); font-size: 12px; white-space: nowrap; }
    .spacer { flex: 1; }
    .head-btn { background: rgba(255,255,255,.16); border-color: transparent; color: #fff; padding: 1px 7px; white-space: nowrap; }
    .scope-btn { background: #d76322; }
    .body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 8px 10px 10px; }
    .regime { font-size: 12px; margin-bottom: 7px; padding: 5px 7px; border-radius: 7px; background: #f3f7fc; color: #34465c; }
    .regime .sub { color: #6b7785; font-size: 11.5px; }
    .regime .warn { color: #b54f19; }
    .row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
    .row.wrap { flex-wrap: wrap; }
    select { flex: 1; min-width: 0; font-size: 12.5px; border: 1px solid #c9d6e6; border-radius: 7px; padding: 4px 5px; background: #fff; color: #1f2933; }
    button { font-size: 12.5px; border: 1px solid #c9d6e6; border-radius: 7px; background: #f3f7fc; color: #24549a; padding: 4px 8px; cursor: pointer; line-height: 1.3; }
    button:hover:not(:disabled) { border-color: #24549a; }
    button:disabled { opacity: .4; cursor: not-allowed; }
    button.primary { background: #d76322; border-color: #d76322; color: #fff; font-weight: 700; padding: 6px 12px; }
    button.danger { color: #b3261e; border-color: #e7b4ae; background: #fff5f4; }
    button.danger[data-armed="1"] { color: #fff; background: #b3261e; border-color: #b3261e; font-weight: 700; }
    button.on { background: #24549a; color: #fff; }
    .list-title { font-size: 11.5px; color: #6b7785; margin: 2px 0 3px; }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; max-height: 150px; overflow: auto; padding: 5px; border: 1px solid #e3eaf3; border-radius: 8px; background: #fafcff; }
    .chip { font-size: 12px; padding: 2px 8px; border-radius: 999px; background: #fff; color: #24549a; }
    .chip.sel { background: #d76322; border-color: #d76322; color: #fff; }
    .chip.sel .dot, .chip.sel .shared { color: #fff; }
    .dot { color: #d76322; margin-right: 3px; }
    .shared { color: #6b7785; margin-left: 3px; font-size: 11px; }
    .chip-sep { width: 100%; font-size: 11px; color: #6b7785; margin-top: 3px; }
    .editor { margin-top: 8px; border: 1px solid #e3eaf3; border-radius: 8px; padding: 8px; }
    .ed-head { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
    .ed-head strong { font-size: 13px; color: #b54f19; }
    .badge { font-size: 11px; color: #24549a; background: #e8f2fb; border-radius: 5px; padding: 0 5px; }
    .sel-text { font: 10.5px/1.35 Consolas, monospace; color: #8a96a3; margin: 2px 0 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .prop { display: grid; grid-template-columns: 70px minmax(0,1fr) 62px 18px 22px; gap: 4px; align-items: center; margin: 4px 0; }
    .prop .name { font-size: 12px; }
    .prop.changed .name { color: #b54f19; font-weight: 700; }
    .prop.general .name, .prop.general input[type=number] { color: #24549a; }
    .prop.general .name { font-weight: 700; }
    .levels { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: 6px 0 2px; padding: 5px 6px; border-radius: 8px; background: #fff7f0; border: 1px solid #f3d3bd; }
    .levels .lv-title { font-size: 12px; font-weight: 700; color: #b54f19; margin-right: 2px; }
    .level { font-size: 12px; padding: 2px 8px; border-radius: 999px; background: #fff; }
    .level.on { background: #d76322; border-color: #d76322; color: #fff; }
    .lv-hint { margin-top: 2px; }
    .levels.small { background: #f5f8fc; border-color: #e3eaf3; margin: 6px 0 0; }
    .levels.small .lv-title { color: #34465c; font-weight: 400; }
    .hint.inherit { color: #24549a; }
    .prop input[type=range] { width: 100%; accent-color: #d76322; margin: 0; }
    .prop input[type=number] { width: 100%; font-size: 12px; border: 1px solid #c9d6e6; border-radius: 6px; padding: 2px 4px; color: #1f2933; }
    .unit { color: #6b7785; font-size: 11px; }
    .reset { padding: 0; width: 22px; height: 22px; }
    details.text-edit { margin-top: 8px; border-top: 1px dashed #e3eaf3; padding-top: 6px; }
    details.text-edit summary { cursor: pointer; color: #24549a; font-size: 12.5px; font-weight: 700; }
    textarea.source { width: 100%; min-height: 84px; margin-top: 6px; resize: vertical; font: 12px/1.45 Consolas, "Microsoft YaHei", monospace; border: 1px solid #c9d6e6; border-radius: 7px; padding: 6px; color: #1f2933; }
    .img-row { margin-top: 8px; }
    .hint { color: #6b7785; font-size: 11.5px; margin: 4px 0; line-height: 1.5; }
    .footer { position: sticky; bottom: -10px; z-index: 2; background: #fff; border-top: 1px solid #e3eaf3; margin-top: 8px; padding: 8px 0 8px; }
    .status { font-size: 12px; margin: 2px 0 7px; }
    .status.dirty { color: #b54f19; }
    .status.ok { color: #1c7c4d; }
    .status .note { color: #34465c; }
    details.more summary { cursor: pointer; color: #24549a; font-size: 12px; margin-top: 4px; }
    details.more .row { margin-top: 6px; }
    .pill { position: fixed; right: 10px; top: 10px; pointer-events: auto; background: #24549a; color: #fff; border: 0; border-radius: 999px; padding: 6px 12px; box-shadow: 0 6px 18px rgba(20,40,80,.25); font-weight: 700; }
    .boxes .box { position: fixed; pointer-events: none; border: 2px solid #d76322; border-radius: 3px; }
    .boxes .box.primary.draggable { pointer-events: auto; cursor: move; background: rgba(215,99,34,.04); }
    .boxes .box.hover { border: 2px dashed #24549a; background: rgba(36,84,154,.07); }
    .boxes .tag { position: absolute; left: -2px; top: -21px; background: #d76322; color: #fff; font-size: 11.5px; padding: 1px 6px; border-radius: 5px; white-space: nowrap; pointer-events: none; }
    .boxes .box.hover .tag { background: #24549a; }
    .shield { position: fixed; pointer-events: auto; cursor: crosshair; background: rgba(36,84,154,.04); }
    .handle { position: fixed; width: 24px; height: 24px; border-radius: 7px; background: #d76322; color: #fff; display: grid; place-items: center; font-size: 14px;
      pointer-events: auto; cursor: grab; box-shadow: 0 2px 8px rgba(0,0,0,.3); user-select: none; touch-action: none; }
    .handle.corner { cursor: nwse-resize; background: #24549a; }
    .handle.right { width: 10px; height: 28px; border-radius: 5px; cursor: ew-resize; background: #24549a; }
    .handle.bottom { width: 28px; height: 10px; border-radius: 5px; cursor: ns-resize; background: #24549a; }
    .handle.left { width: 10px; height: 28px; border-radius: 5px; cursor: ew-resize; background: #24549a; }
    .handle.top { width: 28px; height: 10px; border-radius: 5px; cursor: ns-resize; background: #24549a; }
  `;
  // student-edit.html 里的窗口：固定在手机右边，占满整列。
  const DOCKED_CSS = `
    :host { position: absolute !important; inset: 0 !important; pointer-events: auto !important; z-index: auto !important; display: block !important; }
    .panel.docked { position: absolute; inset: 0; width: auto; max-height: none; border: 0; border-radius: 0; box-shadow: none; }
    .panel.docked header { cursor: default; padding: 9px 12px; }
    .panel.docked .chips { max-height: 230px; }
  `;
  const HOST_CSS = `
    html, body { margin: 0; height: 100%; overflow: hidden; background: #e8edf4; color: #1f2933; font: 14px/1.45 "Microsoft YaHei", "PingFang SC", system-ui, sans-serif; }
    .bh-top { position: absolute; left: 0; right: 0; top: 0; height: 52px; display: flex; align-items: center; gap: 12px; padding: 0 16px; background: #1d3f73; color: #fff; box-sizing: border-box; white-space: nowrap; }
    .bh-top strong { font-size: 15px; }
    .bh-top label { font-size: 13px; }
    .bh-top select, .bh-top button { font: inherit; font-size: 13px; border: 1px solid rgba(255,255,255,.45); border-radius: 7px; padding: 4px 8px; background: #fff; color: #1d3f73; cursor: pointer; }
    .bh-top .bh-scale { font-size: 12.5px; opacity: .85; }
    .bh-top .bh-spacer { flex: 1; }
    .bh-top a { color: #fff; font-size: 13px; }
    .bh-main { position: absolute; left: 0; right: 0; top: 52px; bottom: 0; display: grid; grid-template-columns: minmax(0, 1fr) 390px; }
    .bh-stage { position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; }
    .bh-wrap { position: relative; flex: none; }
    .bh-phone { position: absolute; left: 0; top: 0; transform-origin: 0 0; padding: 14px; border-radius: 54px; background: #15171c; box-shadow: 0 24px 60px rgba(20,40,80,.35), inset 0 0 0 2px #3a3f48; box-sizing: content-box; }
    .bh-frame { display: block; border: 0; border-radius: 40px; background: #fff; }
    .bh-side { position: relative; border-left: 1px solid #c9d6e6; background: #fff; }
    .bh-tip { position: absolute; left: 16px; bottom: 10px; right: 16px; text-align: center; font-size: 12px; color: #6b7785; pointer-events: none; }
  `;

  /* ---------- 启动 ---------- */
  function boot() {
    if (hostConfig) { bootHost(); return; }
    const fileData = normalize(window.BEAM_LAYOUT_OVERRIDES);
    activeData = fileData;

    if (isConsole) {
      let tuner = null;
      let tunerOn = true;
      let scope = "console";
      const iframeWindow = () => document.getElementById("studentPreview")?.contentWindow || null;
      const postState = () => {
        if (!consoleEdit) return;
        const focus = consoleFocus();
        const frame = document.getElementById("studentPreview");
        let origin = null;
        if (frame) {
          // 学生预览（框内）左上角在整个页面上的坐标；普通视图里还带缩放比例。
          const rect = frame.getBoundingClientRect();
          const scale = frame.offsetWidth ? rect.width / frame.offsetWidth : 1;
          origin = { x: rect.left + window.scrollX + frame.clientLeft * scale, y: rect.top + window.scrollY + frame.clientTop * scale, scale };
        }
        iframeWindow()?.postMessage({ type: "beam-tuner-state", focus, show: tunerOn && focus && scope === "page", origin }, "*");
      };
      const syncVisibility = () => {
        if (tuner) tuner.setAllowed(tunerOn && (!consoleFocus() || scope === "console"));
        postState();
      };
      const scaler = startPreviewScaler((focus) => {
        scope = focus ? "page" : "console";
        applyContent();
        if (tuner) tuner.pageChanged();
        syncVisibility();
      });
      setActiveData(activeData);
      new MutationObserver(() => applyContent()).observe(document.body, { childList: true, subtree: true, characterData: true });

      if (consoleEdit) {
        tuner = createTuner({
          kind: "console",
          registry: CONSOLE_REGISTRY,
          pickRoot: () => document.body,
          saveFile: (content) => saveTopLevel(content),
          forgetFile: () => idbDelete(IDB_HANDLE_KEY),
          scopeButton: () => (consoleFocus() ? { text: "改页面 ↪", title: "切到页面内容的调试窗口" } : null),
          onScopeButton: () => { scope = "page"; syncVisibility(); },
        });
        window.BEAM_LAYOUT_TUNER = tuner;
        window.addEventListener("beam-tuner-toggle", () => { tunerOn = !tunerOn; syncVisibility(); });
        window.addEventListener("message", async (event) => {
          const frame = document.getElementById("studentPreview");
          if (!frame || event.source !== frame.contentWindow || !event.data || typeof event.data !== "object") return;
          const reply = (message) => frame.contentWindow.postMessage(message, "*");
          if (event.data.type === "beam-tuner-save") {
            reply({ type: "beam-tuner-save-ack", id: event.data.id });
            let result;
            try { result = await saveTopLevel(String(event.data.content || "")); }
            catch (error) { result = { ok: false, error: String(error && error.message || error) }; }
            reply({ type: "beam-tuner-save-result", id: event.data.id, result });
          } else if (event.data.type === "beam-tuner-forget-file") {
            await idbDelete(IDB_HANDLE_KEY);
          } else if (event.data.type === "beam-tuner-scope") {
            scope = event.data.scope === "console" ? "console" : "page";
            syncVisibility();
          } else if (event.data.type === "beam-tuner-hello") {
            postState();
          }
        });
        document.getElementById("studentPreview")?.addEventListener("load", postState);
        setInterval(postState, 1000);
        // 顶部栏、命令条等变了以后，学生预览在页面上的位置也会变：位置一变就马上告诉预览，保证坐标统一。
        let lastOrigin = "";
        setInterval(() => {
          const frame = document.getElementById("studentPreview");
          if (!frame) return;
          const rect = frame.getBoundingClientRect();
          const key = `${Math.round((rect.left + window.scrollX) * 10)},${Math.round((rect.top + window.scrollY) * 10)},${Math.round(rect.width)}`;
          if (key !== lastOrigin) { lastOrigin = key; postState(); }
        }, 200);
        syncVisibility();
      }
      window.BEAM_PREVIEW_SCALER = scaler;
      return;
    }

    if (role !== "student" || !appEl) return;
    // 学生页的手机版面要在 student-edit.html 里调（那里有手机尺寸的画面和调试窗口）。
    if (isSelfGuided && !embedded && (params.get("edit") === "1" || params.get("tune") === "1")) {
      location.replace("./student-edit.html");
      return;
    }
    // 学生页 / 预览：标记当前页，套用保存的版面；调试模式下打开调试窗口。
    let tuner = null;
    const updatePage = () => {
      const body = document.body;
      if (body.dataset.beamView !== "page") body.dataset.beamView = "page";
      const key = pageKeyOf(readState());
      if (key && body.dataset.beamPage !== key) {
        body.dataset.beamPage = key;
        const group = groupOf(key);
        if (group) body.dataset.beamGroup = group; else delete body.dataset.beamGroup;
        if (tuner) tuner.pageChanged();
      }
      applyContent();
    };
    setActiveData(activeData);
    updatePage();
    new MutationObserver(updatePage).observe(appEl, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["data-reveal-step", "hidden"] });
    setInterval(updatePage, 400);

    if (pageTune) {
      tuner = createTuner({
        kind: "page",
        registry: PAGE_REGISTRY,
        pages: PAGES,
        pickRoot: () => appEl,
        saveFile: (content) => (embedded ? relaySave(content) : saveTopLevel(content)),
        forgetFile: () => (embedded ? window.parent.postMessage({ type: "beam-tuner-forget-file" }, "*") : idbDelete(IDB_HANDLE_KEY)),
        scopeButton: () => (embedded ? { text: "↩ 改顶部 / 控制台", title: "切到控制台（顶部栏、命令条等）的调试窗口" } : null),
        onScopeButton: () => window.parent.postMessage({ type: "beam-tuner-scope", scope: "console" }, "*"),
        onPageChanged: updatePage,
      });
      window.BEAM_LAYOUT_TUNER = tuner;
      if (embedded) {
        tuner.setAllowed(false);
        window.addEventListener("message", (event) => {
          if (event.source !== window.parent || !event.data || event.data.type !== "beam-tuner-state") return;
          tuner.setAllowed(Boolean(event.data.show));
          tuner.setOrigin(event.data.origin);
        });
        window.parent.postMessage({ type: "beam-tuner-hello" }, "*");
      }
    } else if (phoneTune) {
      // 手机上的滚动条不占宽度：这里也隐藏滚动条，保证宽度和真手机一样。
      const noScrollbar = document.createElement("style");
      noScrollbar.textContent = "html { scrollbar-width: none; } html::-webkit-scrollbar { display: none; }";
      document.head.appendChild(noScrollbar);
      tuner = createTuner({
        kind: "phone",
        registry: [...STUDENT_REGISTRY, ...PAGE_REGISTRY.map((def, index) => (index === 0 ? Object.assign({}, def, { section: "页面内容" }) : def))],
        pages: PHONE_PAGES,
        pickRoot: () => document.body,
        saveFile: (content) => relaySave(content),
        forgetFile: () => window.parent.postMessage({ type: "beam-tuner-forget-file" }, "*"),
        gotoPage: gotoStudentPage,
        onPageChanged: updatePage,
        remote: { post: (message) => window.parent.postMessage(message, "*") },
      });
      window.BEAM_LAYOUT_TUNER = tuner;
      window.addEventListener("message", (event) => {
        if (event.source !== window.parent || !event.data || event.data.type !== "beam-tuner-ui") return;
        tuner.replay(event.data.evt);
      });
    }
  }

  // 学生页翻页：用学生页自己的导航（不影响教师端的课堂进度）。
  async function gotoStudentPage(key) {
    const state = readState() || {};
    if (key === "E" || key === "E-FB") {
      if (typeof api !== "function") return;
      if (Number(state.stage) !== 1) await api({ type: "set_stage", stage: 1 });
      await api(key === "E" ? { type: "set_voting", open: true } : { type: "show_vote_feedback" });
      if (typeof tick === "function") await tick();
    } else if (/^A[12]-\d$/.test(key) && typeof setSelfGuidedPosition === "function") {
      await setSelfGuidedPosition(key[1] === "1" ? 2 : 3, Number(key.slice(3)));
    }
  }

  function relaySave(content) {
    return new Promise((resolve) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let acked = false;
      const finish = (result) => { window.removeEventListener("message", onMessage); resolve(result); };
      const onMessage = (event) => {
        if (event.source !== window.parent || !event.data || event.data.id !== id) return;
        if (event.data.type === "beam-tuner-save-ack") acked = true;
        if (event.data.type === "beam-tuner-save-result") finish(event.data.result || { ok: false });
      };
      window.addEventListener("message", onMessage);
      window.parent.postMessage({ type: "beam-tuner-save", id, content }, "*");
      setTimeout(() => { if (!acked) { downloadFile(content); finish({ ok: true, method: "download", name: FILE_NAME }); } }, 1500);
    });
  }

  /* ---------- student-edit.html：手机尺寸的学生页 + 右侧调试窗口 ---------- */
  function bootHost() {
    const hostUiKey = `${UI_KEY}:phone-host`;
    let hostUi = { device: PHONE_DEVICES[0].key };
    try { Object.assign(hostUi, JSON.parse(localStorage.getItem(hostUiKey) || "{}")); } catch (_) {}
    const pageUrl = hostConfig.page || "./student.html?tune=1";
    const style = document.createElement("style");
    style.textContent = HOST_CSS;
    document.head.appendChild(style);
    document.body.innerHTML = `
      <div class="bh-top">
        <strong>学生页 · 手机版面调试</strong>
        <label>机型 <select class="bh-device">${PHONE_DEVICES.map((d) => `<option value="${d.key}">${escapeHtml(d.label)}</option>`).join("")}</select></label>
        <button type="button" class="bh-reload" title="重新载入手机里的学生页">刷新手机画面</button>
        <span class="bh-scale"></span>
        <span class="bh-spacer"></span>
        <a href="./teacher.html?edit=1" target="_blank" rel="noopener">打开教师版调试 ↗</a>
      </div>
      <div class="bh-main">
        <div class="bh-stage"><div class="bh-wrap"><div class="bh-phone"><iframe class="bh-frame" title="学生页（手机尺寸）"></iframe></div></div>
          <div class="bh-tip">在手机画面里直接点选、拖动；右边窗口调数值。滚轮可以上下滚动手机页面。</div></div>
        <div class="bh-side"></div>
      </div>`;
    const frame = document.querySelector(".bh-frame");
    const phone = document.querySelector(".bh-phone");
    const wrap = document.querySelector(".bh-wrap");
    const stage = document.querySelector(".bh-stage");
    const deviceSelect = document.querySelector(".bh-device");
    const scaleLabel = document.querySelector(".bh-scale");
    const panelHost = document.createElement("div");
    panelHost.className = "beam-layout-tuner-docked";
    const root = panelHost.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${TUNER_CSS}${DOCKED_CSS}</style>${panelMarkup({ kind: "phone", pages: PHONE_PAGES, docked: true })}`;
    document.querySelector(".bh-side").appendChild(panelHost);
    const $ = (sel) => root.querySelector(sel);
    const pageSelect = $(".page-select");
    const fileInput = $(".file-input");
    $(".regime").innerHTML = "正在载入手机画面…";

    const BEZEL = 14;
    function layoutPhone() {
      const device = PHONE_DEVICES.find((d) => d.key === hostUi.device) || PHONE_DEVICES[0];
      if (deviceSelect.value !== device.key) deviceSelect.value = device.key;
      frame.style.width = `${device.w}px`;
      frame.style.height = `${device.h}px`;
      const outerW = device.w + BEZEL * 2;
      const outerH = device.h + BEZEL * 2;
      const scale = Math.min(1, (stage.clientWidth - 32) / outerW, (stage.clientHeight - 48) / outerH);
      phone.style.transform = `scale(${round(scale, 4)})`;
      wrap.style.width = `${round(outerW * scale, 2)}px`;
      wrap.style.height = `${round(outerH * scale, 2)}px`;
      scaleLabel.textContent = `手机屏幕 ${device.w}×${device.h}${scale < 0.999 ? ` · 缩小到 ${Math.round(scale * 100)}% 显示` : ""}`;
    }
    deviceSelect.addEventListener("change", () => {
      hostUi.device = deviceSelect.value;
      try { localStorage.setItem(hostUiKey, JSON.stringify(hostUi)); } catch (_) {}
      layoutPhone();
    });
    window.addEventListener("resize", layoutPhone);
    layoutPhone();

    let last = {};
    const load = () => { last = {}; frame.src = `${pageUrl}${pageUrl.includes("?") ? "&" : "?"}r=${Date.now()}`; };
    document.querySelector(".bh-reload").addEventListener("click", load);
    load();
    const send = (evt) => { if (frame.contentWindow) frame.contentWindow.postMessage({ type: "beam-tuner-ui", evt }, "*"); };
    frame.addEventListener("load", () => { last = {}; setTimeout(() => send({ kind: "hello" }), 300); });

    function setHtml(el, key, html) {
      if (last[key] === html) return false;
      last[key] = html;
      el.innerHTML = html;
      return true;
    }
    let lastView = null;
    function applyView(view) {
      if (!view || typeof view !== "object") return;
      $(".page-tag").textContent = view.pageTag || "";
      setHtml($(".regime"), "regime", view.regime || "");
      const chips = $(".chips");
      const scrollTop = chips.scrollTop;
      setHtml(chips, "chips", view.chips || "");
      chips.scrollTop = scrollTop;
      // 同一个元素的编辑区重画时，保持「改文字」展开，正在输入的内容和光标也保留。
      const editorEl = $(".editor");
      const prevSel = (editorEl.querySelector(".sel-text") || {}).textContent || "";
      const prevOpen = Boolean((editorEl.querySelector("details.text-edit") || {}).open);
      const area = editorEl.querySelector("textarea.source");
      const typing = area && root.activeElement === area ? { value: area.value, start: area.selectionStart, end: area.selectionEnd } : null;
      if (setHtml(editorEl, "editor", view.editor || "") && ((editorEl.querySelector(".sel-text") || {}).textContent || "") === prevSel) {
        const details = editorEl.querySelector("details.text-edit");
        if (details && prevOpen) details.open = true;
        const next = editorEl.querySelector("textarea.source");
        if (next && typing) { next.value = typing.value; next.focus(); try { next.setSelectionRange(typing.start, typing.end); } catch (_) {} }
      }
      const status = $(".status");
      status.className = view.status ? view.status.cls : "status";
      setHtml(status, "status", view.status ? view.status.html : "");
      if (pageSelect && view.page && pageSelect.value !== view.page && root.activeElement !== pageSelect) pageSelect.value = view.page;
      $(".pick").classList.toggle("on", Boolean(view.picking));
      $('[data-action="undo"]').disabled = Boolean(view.undo);
      $('[data-action="redo"]').disabled = Boolean(view.redo);
      (view.rows || []).forEach((r) => {
        const row = Array.from(root.querySelectorAll(".prop")).find((el) => el.dataset.prop === r.prop);
        if (!row) return;
        const range = row.querySelector('input[type="range"]');
        const number = row.querySelector('input[type="number"]');
        range.min = r.min;
        range.max = r.max;
        if (root.activeElement !== range) range.value = r.range;
        if (root.activeElement !== number) number.value = r.number;
        row.classList.toggle("changed", Boolean(r.changed));
        row.classList.toggle("general", Boolean(r.general));
        row.title = r.title || "";
        row.querySelector(".reset").disabled = Boolean(r.reset);
      });
    }

    window.addEventListener("message", async (event) => {
      if (event.source !== frame.contentWindow || !event.data || typeof event.data !== "object") return;
      const msg = event.data;
      const reply = (message) => frame.contentWindow.postMessage(message, "*");
      if (msg.type === "beam-tuner-view") { lastView = msg.view; applyView(msg.view); }
      else if (msg.type === "beam-tuner-save") {
        reply({ type: "beam-tuner-save-ack", id: msg.id });
        let result;
        try { result = await saveTopLevel(String(msg.content || "")); }
        catch (error) { result = { ok: false, error: String(error && error.message || error) }; }
        reply({ type: "beam-tuner-save-result", id: msg.id, result });
      } else if (msg.type === "beam-tuner-forget-file") {
        await idbDelete(IDB_HANDLE_KEY);
      } else if (msg.type === "beam-tuner-download") {
        downloadFile(String(msg.content || ""));
      }
    });

    // 窗口里的操作转给手机画面里的调试程序。
    root.addEventListener("click", (event) => {
      const chip = event.target.closest(".chip");
      if (chip) { send({ kind: "click", chip: chip.dataset.key }); return; }
      const reset = event.target.closest("[data-reset]");
      if (reset) { if (!reset.disabled) send({ kind: "click", reset: reset.dataset.reset }); return; }
      const actionEl = event.target.closest("[data-action]");
      if (!actionEl || actionEl.disabled) return;
      const action = actionEl.dataset.action;
      if (action === "replace-image") { fileInput.value = ""; fileInput.click(); return; }
      if (action === "reset-everything" && actionEl.dataset.armed !== "1") {
        actionEl.dataset.armed = "1";
        actionEl.textContent = "确定全部重置？";
        clearTimeout(actionEl._disarm);
        actionEl._disarm = setTimeout(() => { actionEl.dataset.armed = ""; actionEl.textContent = "全部重置"; }, 4000);
        return;
      }
      if (action === "reset-everything") { clearTimeout(actionEl._disarm); actionEl.dataset.armed = ""; actionEl.textContent = "全部重置"; }
      send({ kind: "click", action, level: actionEl.dataset.level });
    });
    root.addEventListener("input", (event) => {
      const target = event.target;
      if (target.classList.contains("source")) { send({ kind: "source", value: target.value }); return; }
      const row = target.closest(".prop");
      if (!row || target.value === "" || !Number.isFinite(Number(target.value))) return;
      const from = target.type === "range" ? "range" : "number";
      if (from === "range") row.querySelector('input[type="number"]').value = target.value;
      else row.querySelector('input[type="range"]').value = target.value;
      send({ kind: "input", prop: row.dataset.prop, value: Number(target.value), from });
    });
    // 输入框离开时显示实际用的数值（比如页面主体高度被内容撑住时）。
    root.addEventListener("focusout", (event) => { if (lastView && event.target.closest && event.target.closest(".prop")) setTimeout(() => applyView(lastView)); });
    if (pageSelect) pageSelect.addEventListener("change", () => send({ kind: "page", value: pageSelect.value }));
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      try { const { data, ratio } = await readImage(file); send({ kind: "image", data, ratio, name: file.name }); }
      catch (error) { send({ kind: "note", text: `图片没有换成：${error.message || error}` }); }
    });
    window.addEventListener("keydown", (event) => {
      const typing = event.composedPath().some((n) => n && /^(INPUT|SELECT|TEXTAREA)$/.test(n.tagName));
      const key = String(event.key || "");
      const wanted = key === "Escape" || (!typing && (/^Arrow(Up|Down|Left|Right)$/.test(key) || ((event.ctrlKey || event.metaKey) && /^[zy]$/i.test(key))));
      if (!wanted) return;
      if (key !== "Escape") event.preventDefault();
      send({ kind: "key", key, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, typing });
    }, true);
    window.BEAM_PHONE_HOST = { frame, applyView, send, layoutPhone };
  }

  try { boot(); } catch (error) { console.error("[版面调试] 启动失败：", error); }
})();
