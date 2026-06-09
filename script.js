// 全局状态管理
let vocabList = [];
let currentIndex = 0;
let isFullPaperMode = false;
let currentDbKey = ""; // 当前文件的本地缓存唯一识别 Key

// 艾宾浩斯时间跨度表 (单位：毫秒)
const EBB_INTERVALS = [
  5 * 60 * 1000, // L0 -> L1: 5分钟
  30 * 60 * 1000, // L1 -> L2: 30分钟
  12 * 60 * 60 * 1000, // L2 -> L3: 12小时
  1 * 24 * 60 * 60 * 1000, // L3 -> L4: 1天
  2 * 24 * 60 * 60 * 1000, // L4 -> L5: 2天
  4 * 24 * 60 * 60 * 1000, // L5 -> L6: 4天
  7 * 24 * 60 * 60 * 1000, // L6 -> L7: 7天
  15 * 24 * 60 * 60 * 1000, // L7 -> L8: 15天
];

// DOM 节点定义
const vocabFileInput = document.getElementById("vocabFile");
const dashboardZone = document.getElementById("dashboardZone");
const answerCardZone = document.getElementById("answerCardZone");
const themeToggleBtn = document.getElementById("themeToggleBtn");
const modeToggle = document.getElementById("modeToggle");
const exportWrongBtn = document.getElementById("exportWrongBtn");
const resetBtn = document.getElementById("resetBtn");
const nextBtn = document.getElementById("nextBtn");

// 音效合成
const SoundFX = {
  ctx: null,
  init() {
    if (!this.ctx)
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  },
  playCorrect() {
    this.init();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    const now = this.ctx.currentTime;
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, now);
    osc.frequency.setValueAtTime(880.0, now + 0.08);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.start(now);
    osc.stop(now + 0.35);
  },
  playWrong() {
    this.init();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    const now = this.ctx.currentTime;
    osc.type = "triangle";
    osc.frequency.setValueAtTime(180.0, now);
    osc.frequency.linearRampToValueAtTime(110.0, now + 0.25);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.start(now);
    osc.stop(now + 0.4);
  },
};

// 【升级版：核心逻辑】全局单词共享持久化保存引擎
function saveProgressToLocal() {
  if (!currentDbKey || vocabList.length === 0) return;

  // 1. 💥【修复刷新BUG的关键】不仅存索引，把当前文件的完整词表数据和特征一并打包存入
  const fileState = {
    currentIndex: currentIndex,
    savedVocabList: vocabList, // 将带有当前状态的词表全量备份，供刷新后瞬时恢复
  };
  localStorage.setItem(currentDbKey, JSON.stringify(fileState));
  localStorage.setItem("EBB_QUIZ_CURRENT_ACTIVE_KEY", currentDbKey);

  // 2. 💥【跨题库核心】将每个单词的“记忆曲线数据”独立剥离，存储到全局单词本中
  vocabList.forEach((item) => {
    // 使用单词本身作为全局唯一 Key
    const globalWordKey = `EBB_WORD_CORE_${item.word.trim()}`;
    const wordMemory = {
      errorCount: item.errorCount,
      stage: item.stage,
      userStatus: item.userStatus,
      selectedAnswer: item.selectedAnswer,
      nextReviewTime: item.nextReviewTime,
    };
    localStorage.setItem(globalWordKey, JSON.stringify(wordMemory));
  });
}

// 【升级版：核心逻辑】全局单词共享持久化读取引擎
function loadProgressFromLocal(fileName, totalCount) {
  currentDbKey = `EBB_DATA_${fileName}_${totalCount}`;

  // 1. 先尝试读取该文件的进度（第几题）
  const localFileState = localStorage.getItem(currentDbKey);
  if (localFileState) {
    try {
      const parsed = JSON.parse(localFileState);
      currentIndex = parsed.currentIndex || 0;
      // 如果已经有缓存的词表，直接返回，供外部恢复
      if (parsed.savedVocabList && parsed.savedVocabList.length > 0) {
        return parsed.savedVocabList;
      }
    } catch (e) {
      console.error("读取文件进度失败：", e);
    }
  } else {
    currentIndex = 0; // 新文件从第 0 题开始
  }
  return null;
}

// 多标签页多维跳转切换中心
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".tab-btn")
      .forEach((b) => b.classList.remove("active"));
    document
      .querySelectorAll(".tab-content")
      .forEach((c) => c.classList.remove("active"));

    btn.classList.add("active");
    const targetTab = btn.getAttribute("data-tab");
    document.getElementById(targetTab).classList.add("active");

    document.getElementById("modeSwitchBox").style.display =
      targetTab === "quizTab" ? "flex" : "none";

    if (vocabList.length > 0) {
      if (targetTab === "analysisTab") runDataAnalysis();
      if (targetTab === "ebbinghausTab") renderEbbinghausView();
    }
  });
});

// 主题处理
function initTheme() {
  const savedTheme = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);
  themeToggleBtn.innerHTML =
    savedTheme === "dark" ? "<span>☀️</span>" : "<span>🌙</span>";
}
themeToggleBtn.addEventListener("click", () => {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const nextTheme = isDark ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", nextTheme);
  themeToggleBtn.innerHTML =
    nextTheme === "dark" ? "<span>☀️</span>" : "<span>🌙</span>";
  localStorage.setItem("theme", nextTheme);
});
initTheme();

// 选择文件一键全自动导入（融合全局单词记忆）
vocabFileInput.addEventListener("change", async () => {
  if (!vocabFileInput.files.length) return;
  SoundFX.init();

  const file = vocabFileInput.files[0];

  // 💥【新增联动】选中文件后动态把文件名同步写到精美的按钮卡片上，并变成高亮绿色
  const fileStatusText = document.getElementById("fileStatusText");
  if (fileStatusText) {
    fileStatusText.innerText = file.name;
    fileStatusText.style.color = "var(--success-text)";
  }

  const rawList = await parseNewFormatFile(file);
  if (rawList.length === 0) {
    alert("文件格式不正确，解析失败！");
    return;
  }

  // 触发读档（获取当前文件的 currentIndex 进度）
  loadProgressFromLocal(file.name, rawList.length);

  // 💥【跨题库核心】遍历新文件里的所有单词，去全局本地存储里撞库，匹配历史记忆
  vocabList = rawList.map((item) => {
    const globalWordKey = `EBB_WORD_CORE_${item.word.trim()}`;
    const savedMemory = localStorage.getItem(globalWordKey);
    if (savedMemory) {
      try {
        const memory = JSON.parse(savedMemory);
        // 如果这个单词以前背过，无缝继承它的熟练度、错题数和下一次复习时间！
        return {
          ...item,
          errorCount: memory.errorCount || 0,
          stage: memory.stage || 0,
          userStatus: memory.userStatus || "unanswered",
          selectedAnswer: memory.selectedAnswer || null,
          nextReviewTime: memory.nextReviewTime || 0,
        };
      } catch (e) {
        console.error("融合单词历史失败：", e);
      }
    }
    return item; // 没背过的单词保持全新状态
  });

  dashboardZone.style.opacity = "1";
  dashboardZone.style.pointerEvents = "auto";
  answerCardZone.style.opacity = "1";
  answerCardZone.style.pointerEvents = "auto";
  exportWrongBtn.disabled = false;
  resetBtn.disabled = false;

  renderDashboard();
  renderAnswerCard();
  renderQuizZone();
  saveProgressToLocal(); // 同步一次最新现场
});

// 选择文件一键全自动导入（融合全局单词记忆）
vocabFileInput.addEventListener("change", async () => {
  if (!vocabFileInput.files.length) return;
  SoundFX.init();

  const file = vocabFileInput.files[0];
  const rawList = await parseNewFormatFile(file);
  if (rawList.length === 0) {
    alert("文件格式不正确，解析失败！");
    return;
  }

  // 触发读档（获取当前文件的 currentIndex 进度）
  loadProgressFromLocal(file.name, rawList.length);

  // 💥【跨题库核心】遍历新文件里的所有单词，去全局本地存储里撞库，匹配历史记忆
  vocabList = rawList.map((item) => {
    const globalWordKey = `EBB_WORD_CORE_${item.word.trim()}`;
    const savedMemory = localStorage.getItem(globalWordKey);
    if (savedMemory) {
      try {
        const memory = JSON.parse(savedMemory);
        // 如果这个单词以前背过，无缝继承它的熟练度、错题数和下一次复习时间！
        return {
          ...item,
          errorCount: memory.errorCount || 0,
          stage: memory.stage || 0,
          userStatus: memory.userStatus || "unanswered",
          selectedAnswer: memory.selectedAnswer || null,
          nextReviewTime: memory.nextReviewTime || 0,
        };
      } catch (e) {
        console.error("融合单词历史失败：", e);
      }
    }
    return item; // 没背过的单词保持全新状态
  });

  dashboardZone.style.opacity = "1";
  dashboardZone.style.pointerEvents = "auto";
  answerCardZone.style.opacity = "1";
  answerCardZone.style.pointerEvents = "auto";
  exportWrongBtn.disabled = false;
  resetBtn.disabled = false;

  renderDashboard();
  renderAnswerCard();
  renderQuizZone();
  saveProgressToLocal(); // 同步一次最新现场
});

function parseNewFormatFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const lines = e.target.result.split(/\r?\n/);
      const list = lines
        .map((line, index) => {
          if (!line.trim()) return null;
          const parts = line.split("|").map((p) => p.trim());
          if (parts.length === 6) {
            const ansKey = parts[5].toUpperCase();
            let correctText = parts[5];
            if (ansKey === "A") correctText = parts[1];
            else if (ansKey === "B") correctText = parts[2];
            else if (ansKey === "C") correctText = parts[3];
            else if (ansKey === "D") correctText = parts[4];

            return {
              id: index + 1,
              word: parts[0],
              answer: correctText,
              options: [parts[1], parts[2], parts[3], parts[4]],
              rawOptions: [parts[1], parts[2], parts[3], parts[4]],
              errorCount: 0,
              stage: 0,
              userStatus: "unanswered",
              selectedAnswer: null,
              nextReviewTime: 0,
            };
          }
          return null;
        })
        .filter((item) => item !== null);
      resolve(list);
    };
    reader.readAsText(file, "UTF-8");
  });
}

// 渲染今日刷题主视图面板（包含单题/全卷模式切换、熟练度徽章彩虹变色逻辑）
function renderQuizZone() {
  const dynamicContent = document.getElementById("quizDynamicContent");
  if (vocabList.length === 0) return;

  if (isFullPaperMode) {
    // ==================== 【全卷模式】 ====================
    document.getElementById("progressContainer").style.display = "none";
    document.getElementById("quizHeader").style.display = "none";
    nextBtn.style.display = "none";
    dynamicContent.innerHTML = "";
    dynamicContent.classList.add("full-paper-scroll");

    vocabList.forEach((item, index) => {
      const block = document.createElement("div");
      block.className = `paper-item-block ${item.userStatus}`;
      block.id = `paper-q-${index}`;
      if (index === currentIndex) block.classList.add("focused-item");

      const title = document.createElement("div");
      title.className = "paper-item-title";
      title.innerText = `${item.id}. ${item.word} [级别: L${item.stage}]`;

      const grid = document.createElement("div");
      grid.className = "options-grid";

      item.options.forEach((option) => {
        const btn = document.createElement("button");
        btn.className = "opt-btn";
        btn.innerText = option;
        if (item.userStatus !== "unanswered") {
          btn.disabled = true;
          if (option === item.answer) btn.classList.add("correct");
          if (option === item.selectedAnswer && option !== item.answer)
            btn.classList.add("wrong");
        } else {
          btn.onclick = () => handleAnswerCore(index, btn, option, true);
        }
        grid.appendChild(btn);
      });

      const feed = document.createElement("div");
      feed.className = "feedback-msg";
      if (item.userStatus === "correct") {
        feed.innerText = "🎉 回答正确！";
        feed.style.color = "var(--success-text)";
      } else if (item.userStatus === "wrong") {
        feed.innerText = `❌ 正确答案是：${item.answer}`;
        feed.style.color = "var(--danger-text)";
      }

      block.appendChild(title);
      block.appendChild(grid);
      block.appendChild(feed);
      dynamicContent.appendChild(block);
    });
  } else {
    // ==================== 【单题模式】 ====================
    document.getElementById("progressContainer").style.display = "block";
    document.getElementById("quizHeader").style.display = "flex";
    dynamicContent.classList.remove("full-paper-scroll");
    dynamicContent.innerHTML = `<div class="word-display" id="wordDisplay"></div><div class="options-grid" id="optionsGrid"></div><div id="feedback" class="feedback-msg"></div>`;

    if (currentIndex >= vocabList.length) {
      alert("🎉 当前所有题目已练习完！");
      currentIndex = vocabList.length - 1;
    }

    const item = vocabList[currentIndex];
    document.getElementById("quizIndex").innerText =
      `题目：${currentIndex + 1} / ${vocabList.length}`;

    // 💥【核心美化联动】动态更新熟练度徽章的文字和渐变色 CSS 类名（注入 stage-0 到 stage-8）
    const stageBadge = document.getElementById("wordStage");
    if (stageBadge) {
      stageBadge.innerText = `熟练度: L${item.stage}`;
      stageBadge.className = `badge stage-${item.stage}`; // 触发 style.css 中的彩虹渐变背景
    }

    document.getElementById("progressBar").style.width =
      `${((currentIndex + 1) / vocabList.length) * 100}%`;
    document.getElementById("wordDisplay").innerText = item.word;

    const grid = document.getElementById("optionsGrid");
    item.options.forEach((option) => {
      const btn = document.createElement("button");
      btn.className = "opt-btn";
      btn.innerText = option;
      if (item.userStatus !== "unanswered") {
        btn.disabled = true;
        if (option === item.answer) btn.classList.add("correct");
        if (option === item.selectedAnswer && option !== item.answer)
          btn.classList.add("wrong");
        nextBtn.style.display = "block";
        const feed = document.getElementById("feedback");
        feed.innerText =
          item.userStatus === "correct"
            ? "🎉 回答正确！"
            : `❌ 正确答案：${item.answer}`;
        feed.style.color =
          item.userStatus === "correct"
            ? "var(--success-text)"
            : "var(--danger-text)";
      } else {
        btn.onclick = () => handleAnswerCore(currentIndex, btn, option, false);
        nextBtn.style.display = "none";
      }
      grid.appendChild(btn);
    });
  }
  renderAnswerCard();
}

// 统一核心答题触发并自动触发持久化存档
function handleAnswerCore(index, btn, selectedOpt, isPaper) {
  const item = vocabList[index];
  item.selectedAnswer = selectedOpt;
  const now = Date.now();

  if (selectedOpt === item.answer) {
    item.userStatus = "correct";
    if (item.stage < 8) item.stage++;
    const interval =
      EBB_INTERVALS[item.stage - 1] || EBB_INTERVALS[EBB_INTERVALS.length - 1];
    item.nextReviewTime = now + interval;
    SoundFX.playCorrect();
  } else {
    item.userStatus = "wrong";
    item.errorCount++;
    item.stage = 0;
    item.nextReviewTime = now + EBB_INTERVALS[0];
    SoundFX.playWrong();
  }

  if (isPaper) currentIndex = index;
  renderQuizZone();
  renderDashboard();
  saveProgressToLocal(); // 💥【关键改动】只要用户答题，实时无缝存盘
}

nextBtn.addEventListener("click", () => {
  currentIndex++;
  renderQuizZone();
  saveProgressToLocal(); // 切换题目也进行存盘
});

function renderAnswerCard() {
  const grid = document.getElementById("answerCardGrid");
  grid.innerHTML = "";
  vocabList.forEach((item, index) => {
    const itemBtn = document.createElement("div");
    itemBtn.className = `answer-item ${item.userStatus}`;
    if (index === currentIndex) itemBtn.classList.add("active");
    itemBtn.innerText = item.id;
    itemBtn.onclick = () => {
      currentIndex = index;
      renderQuizZone();
      if (isFullPaperMode) {
        const target = document.getElementById(`paper-q-${index}`);
        if (target)
          target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      saveProgressToLocal();
    };
    grid.appendChild(itemBtn);
  });
}

function renderDashboard() {
  const tbody = document.getElementById("dashboardBody");
  tbody.innerHTML = "";
  vocabList.forEach((item) => {
    const tr = document.createElement("tr");
    if (item.errorCount > 2) tr.className = "high-error-row";
    tr.innerHTML = `
            <td>${item.id}</td>
            <td style="max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><strong>${item.word}</strong></td>
            <td>${item.answer.substring(0, 10)}</td>
            <td style="color:${item.errorCount > 0 ? "var(--danger-text)" : "var(--text-muted)"}; font-weight:bold">${item.errorCount}</td>
            <td><span class="badge">L${item.stage}</span></td>
        `;
    tbody.appendChild(tr);
  });
}

// 数据多维分析引擎
function runDataAnalysis() {
  const total = vocabList.length;
  const answered = vocabList.filter(
    (i) => i.userStatus !== "unanswered",
  ).length;
  const correctNum = vocabList.filter((i) => i.userStatus === "correct").length;
  const acc = answered > 0 ? Math.round((correctNum / answered) * 100) : 0;

  const now = Date.now();
  const forgetWarnings = vocabList.filter(
    (i) => i.nextReviewTime > 0 && now >= i.nextReviewTime,
  ).length;

  document.getElementById("statTotal").innerText = total;
  document.getElementById("statAnswered").innerText = answered;
  document.getElementById("statAccuracy").innerText = `${acc}%`;
  document.getElementById("statForgetWarning").innerText = forgetWarnings;

  const stageCounts = [0, 0, 0, 0];
  vocabList.forEach((i) => {
    if (i.stage === 0) stageCounts[0]++;
    else if (i.stage === 1) stageCounts[1]++;
    else if (i.stage === 2) stageCounts[2]++;
    else stageCounts[3]++;
  });

  const distList = document.getElementById("stageDistributionList");
  distList.innerHTML = "";
  const labels = [
    "入门起点 L0 (刚刷/错题)",
    "初学记忆 L1 (5-30分级)",
    "稳固阶段 L2 (半天冷却)",
    "熟练精通 L3+ (跨天记忆)",
  ];

  stageCounts.forEach((count, idx) => {
    const pct = total > 0 ? (count / total) * 100 : 0;
    const row = document.createElement("div");
    row.className = "chart-progress-row";
    row.innerHTML = `
            <div class="label-txt"><span>${labels[idx]}</span> <strong>${count} 题</strong></div>
            <div class="bar-outer"><div class="bar-inner" style="width: ${pct}%; background: var(--primary)"></div></div>
        `;
    distList.appendChild(row);
  });

  const topWrong = [...vocabList]
    .filter((i) => i.errorCount > 0)
    .sort((a, b) => b.errorCount - a.errorCount)
    .slice(0, 5);
  const topBody = document.getElementById("topWrongBody");
  topBody.innerHTML = "";
  if (topWrong.length === 0) {
    topBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">暂无错题上榜</td></tr>`;
  } else {
    topWrong.forEach((item) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${item.id}</td><td>${item.word}</td><td style="color:var(--danger-text); font-weight:bold">${item.errorCount} 次</td><td><span class="badge">L${item.stage}</span></td>`;
      topBody.appendChild(tr);
    });
  }
}

// 艾宾浩斯智能复习管理器
let currentReviewIndexList = [];
let currentReviewPointer = 0;

function renderEbbinghausView() {
  const container = document.getElementById("ebbStageContainer");
  container.innerHTML = "";

  const now = Date.now();
  const activeItems = vocabList.filter((i) => i.nextReviewTime > 0);

  if (activeItems.length === 0) {
    container.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding:20px;">题库空空如也，赶快进入第一页刷题激活记忆曲线吧！</p>`;
    return;
  }

  const expiredItems = activeItems.filter((i) => now >= i.nextReviewTime);
  const waitingItems = activeItems
    .filter((i) => now < i.nextReviewTime)
    .sort((a, b) => a.nextReviewTime - b.nextReviewTime);

  if (expiredItems.length > 0) {
    const block = document.createElement("div");
    block.className = "ebb-timeline-node expired";
    block.innerHTML = `<h4>🚨 应当马上复习 (${expiredItems.length} 题已超出临界点)</h4><p>记忆处于极度模糊状态，请立刻点击右侧进行紧急深度特训！</p>`;
    container.appendChild(block);
  }

  waitingItems.forEach((item) => {
    const node = document.createElement("div");
    node.className = "ebb-timeline-node";
    const remainSec = Math.round((item.nextReviewTime - now) / 1000);
    let timeStr = `${remainSec} 秒`;
    if (remainSec > 60) timeStr = `${Math.round(remainSec / 60)} 分钟`;
    if (remainSec > 3600) timeStr = `${Math.round(remainSec / 3600)} 小时`;
    if (remainSec > 86400) timeStr = `${Math.round(remainSec / 86400)} 天`;

    node.innerHTML = `<div class="node-time">⏳ 剩余约 ${timeStr} 后到期</div><div class="node-desc">第 <strong>${item.id}</strong> 题：${item.word.substring(0, 30)}... [当前熟练度: L${item.stage}]</div>`;
    container.appendChild(node);
  });

  initReviewEngine(expiredItems);
}

function initReviewEngine(expiredItems) {
  const statusBar = document.getElementById("reviewStatusBar");
  const zone = document.getElementById("ebbReviewZone");

  if (expiredItems.length === 0) {
    statusBar.innerText =
      "🎉 太棒了！当前没有任何题目处于遗忘区，记忆状态极佳！";
    statusBar.className = "review-status-bar safe";
    zone.style.display = "none";
    return;
  }

  statusBar.innerText = `🔥 警告！当前有 ${expiredItems.length} 道题已达临界点，正在进入复习舱。`;
  statusBar.className = "review-status-bar danger";
  zone.style.display = "block";

  currentReviewIndexList = expiredItems.map((item) =>
    vocabList.findIndex((v) => v.id === item.id),
  );
  currentReviewPointer = 0;
  loadReviewQuestion();
}

function loadReviewQuestion() {
  if (currentReviewPointer >= currentReviewIndexList.length) {
    alert("✨ 恭喜！当前批次的错题/到期复习题目已全部剿灭！");
    renderEbbinghausView();
    return;
  }

  const mainIdx = currentReviewIndexList[currentReviewPointer];
  const item = vocabList[mainIdx];

  document.getElementById("ebbFeedback").innerText = "";
  document.getElementById("ebbNextBtn").style.display = "none";
  document.getElementById("ebbWordDisplay").innerText =
    `【复习第 ${item.id} 题】 ${item.word}`;

  const grid = document.getElementById("ebbOptionsGrid");
  grid.innerHTML = "";

  item.options.forEach((option) => {
    const btn = document.createElement("button");
    btn.className = "opt-btn";
    btn.innerText = option;
    btn.onclick = () => {
      const buttons = grid.querySelectorAll(".opt-btn");
      buttons.forEach((b) => (b.disabled = true));
      const feed = document.getElementById("ebbFeedback");

      if (option === item.answer) {
        btn.classList.add("correct");
        feed.innerText = "🎉 复习成功！记忆评级已升级提升。";
        feed.style.color = "var(--success-text)";
        if (item.stage < 8) item.stage++;
        item.nextReviewTime =
          Date.now() +
          (EBB_INTERVALS[item.stage - 1] ||
            EBB_INTERVALS[EBB_INTERVALS.length - 1]);
        item.userStatus = "correct";
        SoundFX.playCorrect();
      } else {
        btn.classList.add("wrong");
        feed.innerText = `❌ 复习再次犯错！惩罚降回L0，5分钟后重新排队。 正确答案是：${item.answer}`;
        feed.style.color = "var(--danger-text)";
        item.stage = 0;
        item.errorCount++;
        item.nextReviewTime = Date.now() + EBB_INTERVALS[0];
        item.userStatus = "wrong";
        buttons.forEach((b) => {
          if (b.innerText === item.answer) b.classList.add("correct");
        });
        SoundFX.playWrong();
      }
      document.getElementById("ebbNextBtn").style.display = "block";
      renderDashboard();
      saveProgressToLocal(); // 复习答题也进行数据同步保存
    };
    grid.appendChild(btn);
  });
}

document.getElementById("ebbNextBtn").addEventListener("click", () => {
  currentReviewPointer++;
  loadReviewQuestion();
});

// 每3秒自循环轮询
function startEbbTimer() {
  setInterval(() => {
    if (
      vocabList.length > 0 &&
      document.getElementById("ebbinghausTab").classList.contains("active")
    ) {
      renderEbbinghausView();
    }
  }, 3000);
}
startEbbTimer(); // 默认允许底层轮询准备

// 导出与备份
exportWrongBtn.addEventListener("click", () => {
  const wrong = vocabList.filter((i) => i.errorCount > 0);
  if (!wrong.length) {
    alert("无错题记录。");
    return;
  }
  const out = wrong
    .map(
      (i) =>
        `${i.word}|${i.rawOptions[0]}|${i.rawOptions[1]}|${i.rawOptions[2]}|${i.rawOptions[3]}|${i.answer}`,
    )
    .join("\n");
  const blob = new Blob([out], { type: "text/plain;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `错题集_${new Date().toLocaleDateString()}.txt`;
  link.click();
});

// 重置功能（同步清除本地存储）
resetBtn.addEventListener("click", () => {
  if (
    !vocabList.length ||
    !confirm("确定重置吗？这将清空当前文件的所有本地作答及遗忘曲线历史！")
  )
    return;
  currentIndex = 0;
  vocabList.forEach((i) => {
    i.errorCount = 0;
    i.stage = 0;
    i.userStatus = "unanswered";
    i.selectedAnswer = null;
    i.nextReviewTime = 0;
  });

  if (currentDbKey) {
    localStorage.removeItem(currentDbKey); // 清除该题库对应的缓存
  }
  // 💥 关键修复：同时移除当前活跃标记，让页面回归初始待上传状态
  localStorage.removeItem("EBB_QUIZ_CURRENT_ACTIVE_KEY");

  // 清空文件选择框的残留
  vocabFileInput.value = "";

  // 让界面重新变回初始灰色状态
  dashboardZone.style.opacity = "0.4";
  dashboardZone.style.pointerEvents = "none";
  answerCardZone.style.opacity = "0.4";
  answerCardZone.style.pointerEvents = "none";
  exportWrongBtn.disabled = true;
  resetBtn.disabled = true;
  document.getElementById("quizDynamicContent").innerHTML =
    `<div class="word-display" id="wordDisplay">请在右侧上传一体化题库文件即可开始...</div><div class="options-grid" id="optionsGrid"></div><div id="feedback" class="feedback-msg"></div>`;
  document.getElementById("progressBar").style.width = `0%`;
  document.getElementById("quizIndex").innerText = `题目：0 / 0`;

  alert("当前进度已完全重置，已退回到初始状态。");
});
// 💥【终极修复】页面刷新时，全自动静默恢复上次的刷题现场、题目列表以及所有的看板界面
function autoRecoverOnRefresh() {
  const activeKey = localStorage.getItem("EBB_QUIZ_CURRENT_ACTIVE_KEY");
  if (!activeKey) return;

  const localData = localStorage.getItem(activeKey);
  if (localData) {
    try {
      const parsed = JSON.parse(localData);

      // 检查是否有备份的题目列表
      if (parsed && parsed.savedVocabList && parsed.savedVocabList.length > 0) {
        // 1. 恢复全局状态核心变量
        currentDbKey = activeKey;
        currentIndex = parsed.currentIndex || 0;
        vocabList = parsed.savedVocabList;

        // 💥【新增联动】从本地缓存 Key（例如 EBB_DATA_高考核心题库.txt_200）中完美解析并还原出文件名
        const fileStatusText = document.getElementById("fileStatusText");
        if (fileStatusText && activeKey.startsWith("EBB_DATA_")) {
          // 截取 EBB_DATA_ 到倒数第二个下划线之间的文件名部分
          const prefixLen = "EBB_DATA_".length;
          const lastUnderscoreIndex = activeKey.lastIndexOf("_");
          if (lastUnderscoreIndex > prefixLen) {
            const recoveredFileName = activeKey.substring(
              prefixLen,
              lastUnderscoreIndex,
            );
            fileStatusText.innerText = recoveredFileName;
            fileStatusText.style.color = "var(--success-text)";
          }
        }

        // 2. 解锁被禁用的界面元素，恢复可见度与点击
        dashboardZone.style.opacity = "1";
        dashboardZone.style.pointerEvents = "auto";
        answerCardZone.style.opacity = "1";
        answerCardZone.style.pointerEvents = "auto";
        exportWrongBtn.disabled = false;
        resetBtn.disabled = false;

        // 3. 重新渲染整个页面的所有视图
        renderDashboard();
        renderAnswerCard();
        renderQuizZone();

        console.log(
          `[自动续刷成功] 完美恢复现场！上次停留在第 ${currentIndex + 1} 题。`,
        );
      }
    } catch (e) {
      console.error("全自动刷新恢复现场失败：", e);
    }
  }
}

// 确保 DOM 树加载完毕后，立刻执行现场恢复
window.addEventListener("DOMContentLoaded", autoRecoverOnRefresh);
