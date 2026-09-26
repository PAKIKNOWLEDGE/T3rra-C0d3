// 样张共用脚本：切状态、演示流程、少量交互。没有网络、没有引擎。
// 约定（两版 HTML 共用）：
//   html[data-state]            当前状态：approval / running / halted / idle
//   [data-show="a b"]           只在列出的状态下显示（CSS 负责隐藏）
//   [data-go=state]             切换状态（顶栏样张开关）
//   [data-act]                  批准类动作 → 进入 running
//   [data-todo="名称"]          样张未实现的动作 → 弹提示
//   [data-seg] > button         同组单选
//   [data-detail=id]            工单卡：同一 [data-tiles] 内单选，显示对应详情
//   [data-jump=id]              滚动到某条工单并闪一下
//   [data-focus=id]             聚焦某元素（「继续」→ 指令框）
//   [role=switch]               开关
(function () {
  var root = document.documentElement;
  var $ = function (id) { return document.getElementById(id); };
  var prompt = $("prompt");
  var toastEl = $("toast");
  var log = $("log");
  var LINT = [
    "> t3rra-dashboard@0.4.0 lint:css",
    '> stylelint "src/**/*.css"',
    "",
    "src/theme/tokens.css       ✓",
    "src/dashboard/shell.css    ✓",
    "src/dashboard/panels.css   ✓",
    "src/legacy/_colors.css     ✓"
  ];
  var timers = [];
  var toastTimer = 0;

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function mmss(s) { return pad(Math.floor(s / 60)) + ":" + pad(s % 60); }
  function setText(id, text) { var el = $(id); if (el) el.textContent = text; }
  function clearTimers() { timers.forEach(clearInterval); timers = []; }
  function toBottom() { if (log) log.scrollTop = log.scrollHeight; }

  function toast(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2200);
  }

  function go(state) {
    clearTimers();
    root.dataset.state = state;
    document.querySelectorAll("[data-go]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.go === state));
    });
    if (prompt) {
      var key = "ph" + state.charAt(0).toUpperCase() + state.slice(1);
      if (prompt.dataset[key]) prompt.placeholder = prompt.dataset[key];
    }
    if (state === "approval") startApproval();
    if (state === "running") startRunning();
    if (state === "halted") setText("haltOut", LINT.slice(0, 4).join("\n") + "\n— 输出在此中断 —");
    toBottom();
  }

  function startApproval() {
    var wait = 38;
    setText("waitT", mmss(wait));
    timers.push(setInterval(function () { wait++; setText("waitT", mmss(wait)); }, 1000));
  }

  // 运行：逐行吐 lint 输出，吐完进入「完成」
  function startRunning() {
    var out = $("lintOut");
    var i = 0, s = 0;
    if (out) out.innerHTML = '<span class="caret"></span>';
    setText("lintT", "0s");
    setText("runT", "00:00");
    timers.push(setInterval(function () {
      s++;
      setText("lintT", s + "s");
      setText("runT", mmss(s));
    }, 1000));
    timers.push(setInterval(function () {
      if (i >= LINT.length) { go("idle"); return; }
      if (out) out.insertBefore(document.createTextNode(LINT[i++] + "\n"), out.lastChild);
      toBottom();
    }, 850));
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-go],[data-act],[data-todo],[data-detail],[data-jump],[data-focus],[role=switch],[data-seg] > button,#haltBtn");
    if (!t) return;
    if (t.dataset.go) { go(t.dataset.go); return; }
    if (t.dataset.act) { go("running"); return; }
    if (t.dataset.todo) { toast("样张未实现：" + t.dataset.todo); return; }
    if (t.id === "haltBtn") { go("halted"); return; }
    if (t.dataset.detail) { pickTile(t); return; }
    if (t.dataset.jump) { jump(t.dataset.jump); return; }
    if (t.dataset.focus) { var f = $(t.dataset.focus); if (f) f.focus(); return; }
    if (t.getAttribute("role") === "switch") {
      var on = t.getAttribute("aria-checked") !== "true";
      t.setAttribute("aria-checked", String(on));
      toast((t.dataset.label || "开关") + (on ? "：已开启（样张不生效）" : "：已关闭"));
      return;
    }
    var group = t.parentElement;
    group.querySelectorAll(":scope > button").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b === t));
    });
  });

  // 工单卡：同组单选，显示对应详情；再点一次收起
  function pickTile(tile) {
    var group = tile.closest("[data-tiles]");
    var already = tile.getAttribute("aria-pressed") === "true";
    group.querySelectorAll("[data-detail]").forEach(function (b) {
      b.setAttribute("aria-pressed", "false");
      var d = $(b.dataset.detail);
      if (d) d.hidden = true;
    });
    if (already) return;
    tile.setAttribute("aria-pressed", "true");
    var detail = $(tile.dataset.detail);
    if (detail) detail.hidden = false;
  }

  function jump(id) {
    var el = $(id);
    if (!el) { toast("这条工单在当前状态下不存在"); return; }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
  }

  var composer = $("composer");
  if (composer) composer.addEventListener("submit", function (e) {
    e.preventDefault();
    toast("样张未接引擎：指令不会发送");
  });
  if (prompt) prompt.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); toast("样张未接引擎：指令不会发送"); }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && root.dataset.state === "running") { go("halted"); return; }
    if (document.activeElement === prompt || root.dataset.state !== "approval") return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    var k = e.key.toLowerCase();
    if (k === "y" || k === "a") go("running");
    if (k === "n") toast("样张未实现：拒绝分支");
  });

  // 进场：带 data-enter 的容器，子元素逐个滑入
  document.querySelectorAll("[data-enter] > *").forEach(function (el, i) {
    el.classList.add("enter");
    el.style.setProperty("--i", Math.min(i % 18, 14));
  });

  go(root.dataset.state || "approval");
})();
