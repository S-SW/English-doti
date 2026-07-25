// ==========================================
// 全局状态管理
// ==========================================
let vocabList = [];
let currentIndex = 0;
let isFullPaperMode = false;
let currentDbKey = ""; // 当前文件的本地缓存唯一识别 Key

// 艾宾浩斯时间跨度表 (单位：毫秒)
const EBB_INTERVALS = [
  5 * 60 * 1000,          // L0 -> L1: 5分钟
  30 * 60 * 1000,         // L1 -> L2: 30分钟
  12 * 60 * 60 * 1000,    // L2 -> L3: 12小时
  1 * 24 * 60 * 60 * 1000, // L3 -> L4: 1天
  2 * 24 * 60 * 60 * 1000, // L4 -> L5: 2天
  4 * 24 * 60 * 60 * 1000, // L5 -> L6: 4天
  7 * 24 * 60 * 60 * 1000, // L6 -> L7: 7天
  15 * 24 * 60 * 60 * 1000 // L7 -> L8: 15天
];

// DOM 节点引用
const vocabFileInput = document.getElementById("vocabFile");
const dashboardZone = document.getElementById("dashboardZone");
const answerCardZone = document.getElementById("answerCardZone");
const themeToggleBtn = document.getElementById("themeToggleBtn");
const modeToggle = document.getElementById("modeToggle");
const exportWrongBtn = document.getElementById("exportWrongBtn");
const nextBtn = document.getElementById("nextBtn");

// ==========================================
// 缓存持久化逻辑
// ==========================================
function saveProgressToLocal() {
  if (!currentDbKey || vocabList.length === 0) return;

  const fileState = {
    currentIndex: currentIndex,
    savedVocabList: vocabList
  };
  
  localStorage.setItem(currentDbKey, JSON.stringify(fileState));
  localStorage.setItem("EBB_QUIZ_CURRENT_ACTIVE_KEY", currentDbKey);
}

function loadProgressFromLocal(fileName, totalCount) {
  currentDbKey = `EBB_DATA_${fileName}_${totalCount}`;
  const localFileState = localStorage.getItem(currentDbKey);
  if (localFileState) {
    try {
      const parsed = JSON.parse(localFileState);
      currentIndex = parsed.currentIndex || 0;
      if (parsed.savedVocabList && parsed.savedVocabList.length > 0) {
        return parsed.savedVocabList;
      }
    } catch (e) {
      console.error("读取文件进度失败：", e);
    }
  } else {
    currentIndex = 0;
  }
  return null;
}

// ==========================================
// 界面交互与初始化
// ==========================================
if (modeToggle) {
  modeToggle.addEventListener("change", (e) => {
    isFullPaperMode = e.target.checked;
    renderQuizZone();
  });
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));

    btn.classList.add("active");
    const targetTab = btn.getAttribute("data-tab");
    const targetEl = document.getElementById(targetTab);
    if (targetEl) targetEl.classList.add("active");

    const modeSwitchBox = document.getElementById("modeSwitchBox");
    if (modeSwitchBox) {
      modeSwitchBox.style.display = targetTab === "quizTab" ? "flex" : "none";
    }

    if (vocabList.length > 0) {
      if (targetTab === "analysisTab") runDataAnalysis();
      if (targetTab === "ebbinghausTab") renderEbbinghausView();
    }
  });
});

function initTheme() {
  const savedTheme = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);
  if (themeToggleBtn) {
    themeToggleBtn.innerHTML = savedTheme === "dark" ? "<span>☀️</span>" : "<span>🌙</span>";
  }
}

if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const nextTheme = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", nextTheme);
    themeToggleBtn.innerHTML = nextTheme === "dark" ? "<span>☀️</span>" : "<span>🌙</span>";
    localStorage.setItem("theme", nextTheme);
  });
}
initTheme();

// ==========================================
// 文件导入与解析逻辑
// ==========================================
if (vocabFileInput) {
  vocabFileInput.addEventListener("change", async () => {
    if (!vocabFileInput.files.length) return;

    const file = vocabFileInput.files[0];
    const fileStatusText = document.getElementById("fileStatusText");
    if (fileStatusText) {
      fileStatusText.innerText = file.name;
      fileStatusText.style.color = "var(--success-text)";
    }

    const rawList = await parseNewFormatFile(file);
    if (rawList.length === 0) {
      alert("文件格式不正确或解析为空！");
      return;
    }

    const savedData = loadProgressFromLocal(file.name, rawList.length);
    if (savedData && savedData.length === rawList.length) {
      vocabList = savedData;
    } else {
      vocabList = rawList.map((item) => {
        const globalWordKey = `EBB_WORD_CORE_${item.word.trim()}`;
        const savedMemory = localStorage.getItem(globalWordKey);
        if (savedMemory) {
          try {
            const memory = JSON.parse(savedMemory);
            return {
              ...item,
              errorCount: memory.errorCount || 0,
              stage: memory.stage || 0,
              userStatus: memory.userStatus || "unanswered",
              selectedAnswer: memory.selectedAnswer || null,
              nextReviewTime: memory.nextReviewTime || 0
            };
          } catch (e) {
            console.error("融合单词历史失败：", e);
          }
        }
        return item;
      });
    }

    if (dashboardZone) {
      dashboardZone.style.opacity = "1";
      dashboardZone.style.pointerEvents = "auto";
    }
    if (answerCardZone) {
      answerCardZone.style.opacity = "1";
      answerCardZone.style.pointerEvents = "auto";
    }
    if (exportWrongBtn) exportWrongBtn.disabled = false;

    renderDashboard();
    renderAnswerCard();
    renderQuizZone();
    saveProgressToLocal();
  });
}

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
              nextReviewTime: 0
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

// ==========================================
// 答题区核心渲染逻辑
// ==========================================
function renderQuizZone() {
  const dynamicContent = document.getElementById("quizDynamicContent");
  if (!dynamicContent || vocabList.length === 0) return;

  const progressContainer = document.getElementById("progressContainer");
  const quizHeader = document.getElementById("quizHeader");

  if (isFullPaperMode) {
    if (progressContainer) progressContainer.style.display = "none";
    if (quizHeader) quizHeader.style.display = "none";
    if (nextBtn) nextBtn.style.display = "none";

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
          if (option === item.selectedAnswer && option !== item.answer) {
            btn.classList.add("wrong");
          }
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
    if (progressContainer) progressContainer.style.display = "block";
    if (quizHeader) quizHeader.style.display = "flex";
    dynamicContent.classList.remove("full-paper-scroll");
    dynamicContent.innerHTML = `
      <div class="word-display" id="wordDisplay"></div>
      <div class="options-grid" id="optionsGrid"></div>
      <div id="feedback" class="feedback-msg"></div>
    `;

    if (currentIndex >= vocabList.length) {
      currentIndex = vocabList.length - 1;
    }

    const item = vocabList[currentIndex];
    const quizIndex = document.getElementById("quizIndex");
    if (quizIndex) {
      quizIndex.innerText = `题目：${currentIndex + 1} / ${vocabList.length}`;
    }

    const stageBadge = document.getElementById("wordStage");
    if (stageBadge) {
      stageBadge.innerText = `熟练度: L${item.stage}`;
      stageBadge.className = `badge stage-${item.stage}`;
    }

    const progressBar = document.getElementById("progressBar");
    if (progressBar) {
      progressBar.style.width = `${((currentIndex + 1) / vocabList.length) * 100}%`;
    }

    const wordDisplay = document.getElementById("wordDisplay");
    if (wordDisplay) wordDisplay.innerText = item.word;

    const grid = document.getElementById("optionsGrid");
    const feed = document.getElementById("feedback");

    item.options.forEach((option) => {
      const btn = document.createElement("button");
      btn.className = "opt-btn";
      btn.innerText = option;
      if (item.userStatus !== "unanswered") {
        btn.disabled = true;
        if (option === item.answer) btn.classList.add("correct");
        if (option === item.selectedAnswer && option !== item.answer) {
          btn.classList.add("wrong");
        }
        if (nextBtn) nextBtn.style.display = "block";
        if (feed) {
          feed.innerText = item.userStatus === "correct" ? "🎉 回答正确！" : `❌ 正确答案：${item.answer}`;
          feed.style.color = item.userStatus === "correct" ? "var(--success-text)" : "var(--danger-text)";
        }
      } else {
        btn.onclick = () => handleAnswerCore(currentIndex, btn, option, false);
        if (nextBtn) nextBtn.style.display = "none";
      }
      grid.appendChild(btn);
    });
  }
  
  // 更新答题卡的选中焦点态
  updateActiveAnswerCardItem();
}

function handleAnswerCore(index, btn, selectedOpt, isPaper) {
  const item = vocabList[index];
  
  if (item.userStatus !== "unanswered") return;

  item.selectedAnswer = selectedOpt;
  const now = Date.now();

  if (selectedOpt === item.answer) {
    item.userStatus = "correct";
    if (item.stage < 8) item.stage++;
    const interval = EBB_INTERVALS[item.stage - 1] || EBB_INTERVALS[EBB_INTERVALS.length - 1];
    item.nextReviewTime = now + interval;
  } else {
    item.userStatus = "wrong";
    item.errorCount++;
    item.stage = 0;
    item.nextReviewTime = now + EBB_INTERVALS[0];
  }

  if (isPaper) currentIndex = index;

  // 1. 即时高亮选项样式（零延迟）
  const parentContainer = btn.parentElement;
  const allBtns = parentContainer.querySelectorAll(".opt-btn");
  
  allBtns.forEach((b) => {
    b.disabled = true;
    if (b.innerText === item.answer) {
      b.classList.add("correct");
    }
    if (b === btn && selectedOpt !== item.answer) {
      b.classList.add("wrong");
    }
  });

  // 2. 即时更新局部反馈与徽章
  if (!isPaper) {
    const feed = document.getElementById("feedback");
    if (feed) {
      feed.innerText = item.userStatus === "correct" ? "🎉 回答正确！" : `❌ 正确答案：${item.answer}`;
      feed.style.color = item.userStatus === "correct" ? "var(--success-text)" : "var(--danger-text)";
    }
    if (nextBtn) nextBtn.style.display = "block";
    
    const stageBadge = document.getElementById("wordStage");
    if (stageBadge) {
      stageBadge.innerText = `熟练度: L${item.stage}`;
      stageBadge.className = `badge stage-${item.stage}`;
    }
  } else {
    const block = document.getElementById(`paper-q-${index}`);
    if (block) {
      block.className = `paper-item-block ${item.userStatus}`;
      const feed = block.querySelector(".feedback-msg");
      if (feed) {
        feed.innerText = item.userStatus === "correct" ? "🎉 回答正确！" : `❌ 正确答案是：${item.answer}`;
        feed.style.color = item.userStatus === "correct" ? "var(--success-text)" : "var(--danger-text)";
      }
    }
  }

  // 3. 极速局部更新答题卡节点（免去重绘整张答题卡 DOM）
  updateSingleAnswerCardNode(index, item.userStatus);

  // 4. 异步落盘，保障流畅动画
  requestAnimationFrame(() => {
    saveProgressToLocal();
    // 单词全局历史状态独立备份，便于下次跨库复用
    localStorage.setItem(`EBB_WORD_CORE_${item.word.trim()}`, JSON.stringify({
      errorCount: item.errorCount,
      stage: item.stage,
      userStatus: item.userStatus,
      selectedAnswer: item.selectedAnswer,
      nextReviewTime: item.nextReviewTime
    }));
  });
}

if (nextBtn) {
  nextBtn.addEventListener("click", () => {
    if (currentIndex < vocabList.length - 1) {
      currentIndex++;
      renderQuizZone();
      saveProgressToLocal();
    } else {
      alert("🎉 恭喜！当前题库已练习至最后一题！");
    }
  });
}

// ==========================================
// 答题卡局部高亮与构建逻辑
// ==========================================
function renderAnswerCard() {
  const grid = document.getElementById("answerCardGrid");
  if (!grid) return;
  grid.innerHTML = "";
  if (vocabList.length === 0) {
    grid.innerHTML = `<div style="color:var(--text-muted); font-size:13px; text-align:center; grid-column:1/-1;">暂无数据</div>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  vocabList.forEach((item, index) => {
    const itemBtn = document.createElement("div");
    itemBtn.className = `answer-item ${item.userStatus}`;
    itemBtn.id = `card-item-${index}`;
    if (index === currentIndex) itemBtn.classList.add("active");
    itemBtn.innerText = item.id;
    itemBtn.onclick = () => {
      currentIndex = index;
      renderQuizZone();
      if (isFullPaperMode) {
        const target = document.getElementById(`paper-q-${index}`);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      saveProgressToLocal();
    };
    fragment.appendChild(itemBtn);
  });
  grid.appendChild(fragment);
}

// 仅更新单个答题卡小块的状态（极致流畅体验）
function updateSingleAnswerCardNode(index, status) {
  const node = document.getElementById(`card-item-${index}`);
  if (node) {
    node.className = `answer-item ${status}`;
    if (index === currentIndex) node.classList.add("active");
  }
}

// 仅更新当前焦点的答题卡项
function updateActiveAnswerCardItem() {
  const currentActive = document.querySelector(".answer-item.active");
  if (currentActive) currentActive.classList.remove("active");
  const targetNode = document.getElementById(`card-item-${currentIndex}`);
  if (targetNode) targetNode.classList.add("active");
}

function renderDashboard() {
  const tbody = document.getElementById("dashboardBody");
  if (!tbody) return;
  tbody.innerHTML = "";
  if (vocabList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">暂无数据</td></tr>`;
    return;
  }

  const fragment = document.createDocumentFragment();
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
    fragment.appendChild(tr);
  });
  tbody.appendChild(fragment);
}

// ==========================================
// 统计分析中心
// ==========================================
function runDataAnalysis() {
  const total = vocabList.length;
  const answered = vocabList.filter((i) => i.userStatus !== "unanswered").length;
  const correctNum = vocabList.filter((i) => i.userStatus === "correct").length;
  const acc = answered > 0 ? Math.round((correctNum / answered) * 100) : 0;

  const now = Date.now();
  const forgetWarnings = vocabList.filter(
    (i) => i.nextReviewTime > 0 && now >= i.nextReviewTime
  ).length;

  const statTotal = document.getElementById("statTotal");
  const statAnswered = document.getElementById("statAnswered");
  const statAccuracy = document.getElementById("statAccuracy");
  const statForgetWarning = document.getElementById("statForgetWarning");

  if (statTotal) statTotal.innerText = total;
  if (statAnswered) statAnswered.innerText = answered;
  if (statAccuracy) statAccuracy.innerText = `${acc}%`;
  if (statForgetWarning) statForgetWarning.innerText = forgetWarnings;

  const stageCounts = [0, 0, 0, 0];
  vocabList.forEach((i) => {
    if (i.stage === 0) stageCounts[0]++;
    else if (i.stage === 1) stageCounts[1]++;
    else if (i.stage === 2) stageCounts[2]++;
    else stageCounts[3]++;
  });

  const distList = document.getElementById("stageDistributionList");
  if (distList) {
    distList.innerHTML = "";
    const labels = [
      "入门起点 L0 (刚刷/错题)",
      "初学记忆 L1 (5-30分级)",
      "稳固阶段 L2 (半天冷却)",
      "熟练精通 L3+ (跨天记忆)"
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
  }

  const topWrong = [...vocabList]
    .filter((i) => i.errorCount > 0)
    .sort((a, b) => b.errorCount - a.errorCount)
    .slice(0, 5);

  const topBody = document.getElementById("topWrongBody");
  if (topBody) {
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
}

// ==========================================
// 艾宾浩斯复习引擎
// ==========================================
let currentReviewIndexList = [];
let currentReviewPointer = 0;

function renderEbbinghausView() {
  const container = document.getElementById("ebbStageContainer");
  if (!container) return;
  container.innerHTML = "";

  const now = Date.now();
  const activeItems = vocabList.filter((i) => i.nextReviewTime > 0);

  if (activeItems.length === 0) {
    container.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding:20px;">题库空空如也，赶快进入第一页刷题激活记忆曲线吧！</p>`;
    initReviewEngine([]);
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
    const remainSec = Math.max(0, Math.round((item.nextReviewTime - now) / 1000));
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
  if (!statusBar || !zone) return;

  if (expiredItems.length === 0) {
    statusBar.innerText = "🎉 太棒了！当前没有任何题目处于遗忘区，记忆状态极佳！";
    statusBar.className = "review-status-bar safe";
    zone.style.display = "none";
    return;
  }

  statusBar.innerText = `🔥 警告！当前有 ${expiredItems.length} 道题已达临界点，正在进入复习舱。`;
  statusBar.className = "review-status-bar danger";
  zone.style.display = "block";

  currentReviewIndexList = expiredItems.map((item) =>
    vocabList.findIndex((v) => v.id === item.id)
  );
  currentReviewPointer = 0;
  loadReviewQuestion();
}

function loadReviewQuestion() {
  const grid = document.getElementById("ebbOptionsGrid");
  const feed = document.getElementById("ebbFeedback");
  const ebbNextBtn = document.getElementById("ebbNextBtn");

  if (currentReviewPointer >= currentReviewIndexList.length) {
    alert("✨ 恭喜！当前批次的到期复习题目已全部剿灭！");
    renderEbbinghausView();
    return;
  }

  const mainIdx = currentReviewIndexList[currentReviewPointer];
  const item = vocabList[mainIdx];
  if (!item) return;

  if (feed) feed.innerText = "";
  if (ebbNextBtn) ebbNextBtn.style.display = "none";
  
  const ebbWordDisplay = document.getElementById("ebbWordDisplay");
  if (ebbWordDisplay) {
    ebbWordDisplay.innerText = `【复习第 ${item.id} 题】 ${item.word}`;
  }

  if (grid) {
    grid.innerHTML = "";
    item.options.forEach((option) => {
      const btn = document.createElement("button");
      btn.className = "opt-btn";
      btn.innerText = option;
      btn.onclick = () => {
        const buttons = grid.querySelectorAll(".opt-btn");
        buttons.forEach((b) => (b.disabled = true));

        if (option === item.answer) {
          btn.classList.add("correct");
          if (feed) {
            feed.innerText = "🎉 复习成功！记忆评级已升级提升。";
            feed.style.color = "var(--success-text)";
          }
          if (item.stage < 8) item.stage++;
          item.nextReviewTime =
            Date.now() + (EBB_INTERVALS[item.stage - 1] || EBB_INTERVALS[EBB_INTERVALS.length - 1]);
          item.userStatus = "correct";
          
        } else {
          btn.classList.add("wrong");
          if (feed) {
            feed.innerText = `❌ 复习再次犯错！惩罚降回L0，5分钟后重新排队。 正确答案是：${item.answer}`;
            feed.style.color = "var(--danger-text)";
          }
          item.stage = 0;
          item.errorCount++;
          item.nextReviewTime = Date.now() + EBB_INTERVALS[0];
          item.userStatus = "wrong";
          buttons.forEach((b) => {
            if (b.innerText === item.answer) b.classList.add("correct");
          });
        }
        if (ebbNextBtn) ebbNextBtn.style.display = "block";
        
        // 艾宾浩斯复习答题同步保存进度
        saveProgressToLocal();
      };
      grid.appendChild(btn);
    });
  }
}

const ebbNextBtn = document.getElementById("ebbNextBtn");
if (ebbNextBtn) {
  ebbNextBtn.addEventListener("click", () => {
    currentReviewPointer++;
    loadReviewQuestion();
  });
}

// ==========================================
// 错题导出逻辑
// ==========================================
if (exportWrongBtn) {
  exportWrongBtn.addEventListener("click", () => {
    const wrong = vocabList.filter((i) => i.errorCount > 0);
    if (!wrong.length) {
      alert("无错题记录。");
      return;
    }
    const out = wrong
      .map(
        (i) =>
          `${i.word}|${i.rawOptions[0]}|${i.rawOptions[1]}|${i.rawOptions[2]}|${i.rawOptions[3]}|${i.answer}`
      )
      .join("\n");
    const blob = new Blob([out], { type: "text/plain;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `错题集_${new Date().toLocaleDateString()}.txt`;
    link.click();
  });
}

// ==========================================
// 恢复现场逻辑
// ==========================================
function autoRecoverOnRefresh() {
  const activeKey = localStorage.getItem("EBB_QUIZ_CURRENT_ACTIVE_KEY");
  if (!activeKey) return;

  const localData = localStorage.getItem(activeKey);
  if (localData) {
    try {
      const parsed = JSON.parse(localData);

      if (parsed && parsed.savedVocabList && parsed.savedVocabList.length > 0) {
        currentDbKey = activeKey;
        currentIndex = parsed.currentIndex || 0;
        vocabList = parsed.savedVocabList;

        const fileStatusText = document.getElementById("fileStatusText");
        if (fileStatusText && activeKey.startsWith("EBB_DATA_")) {
          const prefixLen = "EBB_DATA_".length;
          const lastUnderscoreIndex = activeKey.lastIndexOf("_");
          if (lastUnderscoreIndex > prefixLen) {
            const recoveredFileName = activeKey.substring(prefixLen, lastUnderscoreIndex);
            fileStatusText.innerText = recoveredFileName;
            fileStatusText.style.color = "var(--success-text)";
          }
        }

        if (dashboardZone) {
          dashboardZone.style.opacity = "1";
          dashboardZone.style.pointerEvents = "auto";
        }
        if (answerCardZone) {
          answerCardZone.style.opacity = "1";
          answerCardZone.style.pointerEvents = "auto";
        }
        if (exportWrongBtn) exportWrongBtn.disabled = false;

        renderDashboard();
        renderAnswerCard();
        renderQuizZone();
      }
    } catch (e) {
      console.error("恢复现场失败：", e);
    }
  }
}

window.addEventListener("DOMContentLoaded", autoRecoverOnRefresh);