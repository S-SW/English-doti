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
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const navBtnGroup = document.getElementById("navBtnGroup");
const exportSnapshotBtn = document.getElementById("exportSnapshotBtn");
const importSnapshotBtn = document.getElementById("importSnapshotBtn");
const importSnapshotInput = document.getElementById("importSnapshotInput");
const resetProgressBtn = document.getElementById("resetProgressBtn");

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
  const targetKey = `EBB_DATA_${fileName}_${totalCount}`;
  const localFileState = localStorage.getItem(targetKey);
  if (localFileState) {
    try {
      const parsed = JSON.parse(localFileState);
      if (parsed.savedVocabList && parsed.savedVocabList.length > 0) {
        return {
          savedVocabList: parsed.savedVocabList,
          currentIndex: parsed.currentIndex || 0
        };
      }
    } catch (e) {
      console.error("读取文件进度失败：", e);
    }
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

document.addEventListener("DOMContentLoaded", () => {
  // 绑定“错题数量”卡片点击事件：点击跳转到 ctph 错题排行界面
  const statWrongCard = document.getElementById("statWrongCard");
  if (statWrongCard) {
    statWrongCard.addEventListener("click", () => {
      const ctphBtn = document.querySelector('.tab-btn[data-tab="ctphTab"]');
      if (ctphBtn) ctphBtn.click(); // 触发 Tab 点击，无缝切换
    });
  }
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
// 文件导入与解析逻辑（真正精确识别：同名保留，异名重置）
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

    // 1. 生成新文件的数据库 Key
    const newDbKey = `EBB_DATA_${file.name}_${rawList.length}`;
    
    // 2. 尝试读取这个文件专属的本地记录
    const savedRecord = loadProgressFromLocal(file.name, rawList.length);

    // 3. 判断：如果该文件之前在 LocalStorage 中有保存过作答进度
    if (savedRecord) {
      // 满足条件：完全恢复该文件之前的作答记录与指针位置！
      vocabList = savedRecord.savedVocabList;
      currentIndex = savedRecord.currentIndex;
      currentDbKey = newDbKey;
    } else {
      // 场景：全新的文件（从没打开过，或者清空过）
      currentDbKey = newDbKey;
      currentIndex = 0;

      // 按全新题库处理：抹去可能存在的全局单词痕迹，强制重置所有数据
      vocabList = rawList.map((item) => {
        const globalWordKey = `EBB_WORD_CORE_${item.word.trim()}`;
        localStorage.removeItem(globalWordKey);

        return {
          ...item,
          errorCount: 0,
          stage: 0,
          userStatus: "unanswered",
          selectedAnswer: null,
          nextReviewTime: 0
        };
      });
    }

    // 4. 重置文件选择器，确保再次点击同一个文件也能触发 change 事件
    vocabFileInput.value = "";

    // 5. 界面显示控制
    if (dashboardZone) {
      dashboardZone.style.opacity = "1";
      dashboardZone.style.pointerEvents = "auto";
    }
    if (answerCardZone) {
      answerCardZone.style.opacity = "1";
      answerCardZone.style.pointerEvents = "auto";
    }
    if (exportWrongBtn) exportWrongBtn.disabled = false;

    if (resetProgressBtn) resetProgressBtn.disabled = false;

    // 6. 重新渲染UI并保存当前激活状态
    renderDashboard();
    renderAnswerCard();
    renderQuizZone();
    saveProgressToLocal();
    updateEbbinghausSummary();
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
// 全卷模式高性能按需渲染 + 事件委托
// ==========================================
let paperObserver = null;

function renderQuizZone() {
  const dynamicContent = document.getElementById("quizDynamicContent");
  if (!dynamicContent || vocabList.length === 0) return;

  const progressContainer = document.getElementById("progressContainer");
  const quizHeader = document.getElementById("quizHeader");

  // 1. 清理旧的 Observer
  if (paperObserver) {
    paperObserver.disconnect();
    paperObserver = null;
  }

  if (isFullPaperMode) {
    if (progressContainer) progressContainer.style.display = "none";
    if (quizHeader) quizHeader.style.display = "none";
    if (navBtnGroup) navBtnGroup.style.display = "none"; // 全卷模式下隐藏导航按钮组

    dynamicContent.innerHTML = "";
    dynamicContent.classList.add("full-paper-scroll");

    // 2. 事件委托：统一监听容器点击
    dynamicContent.onclick = (e) => {
      const btn = e.target.closest(".opt-btn");
      if (!btn || btn.disabled) return;

      const qIndex = parseInt(btn.dataset.qindex, 10);
      const optVal = btn.dataset.optval;

      if (!isNaN(qIndex) && optVal) {
        handleAnswerCore(qIndex, btn, optVal, true);
      }
    };

    // 3. 极轻量占位骨架
    const fragment = document.createDocumentFragment();
    vocabList.forEach((item, index) => {
      const block = document.createElement("div");
      block.className = `paper-item-block ${item.userStatus}`;
      block.id = `paper-q-${index}`;
      block.dataset.index = index;
      block.dataset.isRendered = "false"; 
      
      block.style.minHeight = "160px";

      fragment.appendChild(block);
    });
    dynamicContent.appendChild(fragment);

    // 4. 懒加载观察器：滑动到视口前 300px 时才渲染内部节点
    paperObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const target = entry.target;
            if (target.dataset.isRendered === "false") {
              const index = parseInt(target.dataset.index, 10);
              renderSinglePaperBlock(target, index);
              target.dataset.isRendered = "true";
            }
          }
        });
      },
      {
        root: dynamicContent,
        rootMargin: "300px 0px"
      }
    );

    // 绑定观察
    const blocks = dynamicContent.querySelectorAll(".paper-item-block");
    blocks.forEach((el) => paperObserver.observe(el));

  } else {
    // ---------------- 单题模式逻辑 ----------------
    if (progressContainer) progressContainer.style.display = "block";
    if (quizHeader) quizHeader.style.display = "flex";
    if (navBtnGroup) navBtnGroup.style.display = "flex"; // 单题模式下始终保持显示

    dynamicContent.classList.remove("full-paper-scroll");
    dynamicContent.onclick = null;

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
        if (feed) {
          feed.innerText = item.userStatus === "correct" ? "🎉 回答正确！" : `❌ 正确答案：${item.answer}`;
          feed.style.color = item.userStatus === "correct" ? "var(--success-text)" : "var(--danger-text)";
        }
      } else {
        btn.onclick = () => handleAnswerCore(currentIndex, btn, option, false);
      }
      grid.appendChild(btn);
    });
  }

  updateActiveAnswerCardItem();
}

// 辅助渲染函数
function renderSinglePaperBlock(container, index) {
  const item = vocabList[index];
  if (!item) return;

  if (index === currentIndex) container.classList.add("focused-item");

  let optionsHTML = "";
  item.options.forEach((option) => {
    let extraClass = "";
    let disabledAttr = "";

    if (item.userStatus !== "unanswered") {
      disabledAttr = "disabled";
      if (option === item.answer) extraClass += " correct";
      if (option === item.selectedAnswer && option !== item.answer) extraClass += " wrong";
    }

    optionsHTML += `<button class="opt-btn ${extraClass}" ${disabledAttr} data-qindex="${index}" data-optval="${option}">${option}</button>`;
  });

  let feedHTML = "";
  if (item.userStatus === "correct") {
    feedHTML = `<div class="feedback-msg" style="color:var(--success-text)">🎉 回答正确！</div>`;
  } else if (item.userStatus === "wrong") {
    feedHTML = `<div class="feedback-msg" style="color:var(--danger-text)">❌ 正确答案是：${item.answer}</div>`;
  } else {
    feedHTML = `<div class="feedback-msg"></div>`;
  }

  container.innerHTML = `
    <div class="paper-item-title">${item.id}. ${item.word} [级别: L${item.stage}]</div>
    <div class="options-grid">${optionsHTML}</div>
    ${feedHTML}
  `;

  container.style.minHeight = "auto";
  container.style.height = "auto";
}

// 核心答题响应
function handleAnswerCore(index, btn, selectedOpt, isPaper) {
  const item = vocabList[index];
  if (!item || item.userStatus !== "unanswered") return;

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

  const parentContainer = btn.parentElement;
  const allBtns = parentContainer.querySelectorAll(".opt-btn");
  
  allBtns.forEach((b) => {
    b.disabled = true;
    if (b.dataset.optval === item.answer || b.innerText === item.answer) {
      b.classList.add("correct");
    }
    if (b === btn && selectedOpt !== item.answer) {
      b.classList.add("wrong");
    }
  });

  const block = isPaper ? btn.closest(".paper-item-block") : document.getElementById("quizDynamicContent");
  if (block) {
    if (isPaper) block.className = `paper-item-block ${item.userStatus}`;
    const feed = block.querySelector(".feedback-msg");
    if (feed) {
      feed.innerText = item.userStatus === "correct" ? "🎉 回答正确！" : `❌ 正确答案是：${item.answer}`;
      feed.style.color = item.userStatus === "correct" ? "var(--success-text)" : "var(--danger-text)";
    }
  }

  updateSingleAnswerCardNode(index, item.userStatus);

  setTimeout(() => {
    saveProgressToLocal();
    localStorage.setItem(`EBB_WORD_CORE_${item.word.trim()}`, JSON.stringify({
      errorCount: item.errorCount,
      stage: item.stage,
      userStatus: item.userStatus,
      selectedAnswer: item.selectedAnswer,
      nextReviewTime: item.nextReviewTime
    }));
  }, 0);
  updateEbbinghausSummary();
  updateTopWrongTable(vocabList);
}

// 按钮控制：上一题
if (prevBtn) {
  prevBtn.addEventListener("click", () => {
    if (vocabList.length === 0) return;
    if (currentIndex > 0) {
      currentIndex--;
      renderQuizZone();
      saveProgressToLocal();
    } else {
      alert("已经是第一题了！");
    }
  });
}

// 按钮控制：下一题
if (nextBtn) {
  nextBtn.addEventListener("click", () => {
    if (vocabList.length === 0) return;
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

function updateSingleAnswerCardNode(index, status) {
  const node = document.getElementById(`card-item-${index}`);
  if (node) {
    node.className = `answer-item ${status}`;
    if (index === currentIndex) node.classList.add("active");
  }
}

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
  // 👈 在末尾加入这行：自动刷新 Chart.js 图表数据
  if (typeof renderAnalysisCharts === "function") {
    renderAnalysisCharts(vocabList);
  }
}

// ==========================================
// 统计分析中心
// ==========================================
function runDataAnalysis() {
  const total = vocabList.length;
  const answered = vocabList.filter((i) => i.userStatus !== "unanswered").length;
  const correctNum = vocabList.filter((i) => i.userStatus === "correct").length;
  
  // 👈 计算错题总数
  const wrongNum = vocabList.filter((i) => (i.errorCount || 0) > 0 || i.userStatus === "wrong").length;
  
  const acc = answered > 0 ? Math.round((correctNum / answered) * 100) : 0;

  const now = Date.now();
  const forgetWarnings = vocabList.filter(
    (i) => i.nextReviewTime > 0 && now >= i.nextReviewTime
  ).length;

  const statTotal = document.getElementById("statTotal");
  const statAnswered = document.getElementById("statAnswered");
  const statWrongCount = document.getElementById("statWrongCount"); // 👈 错题数 DOM
  const statAccuracy = document.getElementById("statAccuracy");
  const statForgetWarning = document.getElementById("statForgetWarning");

  if (statTotal) statTotal.innerText = total;
  if (statAnswered) statAnswered.innerText = answered;
  if (statWrongCount) statWrongCount.innerText = wrongNum; // 👈 渲染错题数
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
          
          saveProgressToLocal();

          // ----------------【新增：答对自动跳转逻辑】----------------
          setTimeout(() => {
            currentReviewPointer++;
            loadReviewQuestion();
          }, 200); // 600毫秒延迟，既有视觉反馈，刷题节奏又顺畅

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

          // 答错时不跳转，显示“下一题”按钮，由用户手动确认
          if (ebbNextBtn) ebbNextBtn.style.display = "block";
          saveProgressToLocal();
        }
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
// 新增：更新艾宾浩斯复习预测概览
// ==========================================
function updateEbbinghausSummary() {
  if (!vocabList || vocabList.length === 0) return;

  const now = Date.now();
  const MIN_30 = 30 * 60 * 1000;
  const DAY_1 = 24 * 60 * 60 * 1000;
  const DAY_7 = 7 * 24 * 60 * 60 * 1000;

  let expired = 0;
  let in30m = 0;
  let in1d = 0;
  let in7d = 0;
  let safe = 0;

  vocabList.forEach((item) => {
    // 过滤未开始刷的题
    if (!item.nextReviewTime || item.nextReviewTime === 0) return;

    const diff = item.nextReviewTime - now;

    if (diff <= 0) {
      expired++;
    } else if (diff <= MIN_30) {
      in30m++;
    } else if (diff <= DAY_1) {
      in1d++;
    } else if (diff <= DAY_7) {
      in7d++;
    } else {
      safe++;
    }
  });

  // 更新 DOM
  const elExpired = document.getElementById("ebbCountExpired");
  const el30m = document.getElementById("ebbCount30m");
  const el1d = document.getElementById("ebbCount1d");
  const el7d = document.getElementById("ebbCount7d");
  const elSafe = document.getElementById("ebbCountSafe");

  if (elExpired) elExpired.innerText = `${expired} 题`;
  if (el30m) el30m.innerText = `${in30m} 题`;
  if (el1d) el1d.innerText = `${in1d} 题`;
  if (el7d) el7d.innerText = `${in7d} 题`;
  if (elSafe) elSafe.innerText = `${safe} 题`;
}

// ⚠️ 注意：请将 updateEbbinghausSummary() 加入到答题响应函数中
// 在 handleAnswerCore(...) 函数里的 saveProgressToLocal() 后面添加一行：
// updateEbbinghausSummary();

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

        if (resetProgressBtn) resetProgressBtn.disabled = false;

        renderDashboard();
        renderAnswerCard();
        renderQuizZone();
      }
      refreshAllViews();
    } catch (e) {
      console.error("恢复现场失败：", e);
    }
  }
  if (exportSnapshotBtn) exportSnapshotBtn.disabled = false;

  
}

// ==========================================
// 全量数据快照导出逻辑 (包含题目、作答记录、遗忘曲线)
// ==========================================
if (exportSnapshotBtn) {
  exportSnapshotBtn.addEventListener("click", () => {
    if (!vocabList || vocabList.length === 0) {
      alert("当前暂无题库数据可供导出！");
      return;
    }

    // 构建完整数据快照对象
    const snapshotData = {
      version: "1.0",
      exportTime: new Date().toLocaleString(),
      exportTimestamp: Date.now(),
      dbKey: currentDbKey,
      currentIndex: currentIndex,
      totalCount: vocabList.length,
      // 包含每道题的完整题目数据、作答历史记录、遗忘曲线 stage 及 nextReviewTime
      vocabList: vocabList.map((item) => ({
        id: item.id,
        word: item.word,
        answer: item.answer,
        options: item.options,
        rawOptions: item.rawOptions,
        errorCount: item.errorCount,
        stage: item.stage,                      // 艾宾浩斯记忆阶段 (L0-L8)
        userStatus: item.userStatus,            // 用户作答状态 (unanswered/correct/wrong)
        selectedAnswer: item.selectedAnswer,    // 用户的选择
        nextReviewTime: item.nextReviewTime     // 下一次临界复习时间戳
      }))
    };

    // 转换为格式化的 JSON 文本并下载
    const jsonStr = JSON.stringify(snapshotData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);

    // 解析当前使用的文件名
    let fileName = "题库全量快照";
    if (currentDbKey && currentDbKey.startsWith("EBB_DATA_")) {
      const prefixLen = "EBB_DATA_".length;
      const lastUnderscoreIndex = currentDbKey.lastIndexOf("_");
      if (lastUnderscoreIndex > prefixLen) {
        fileName = currentDbKey.substring(prefixLen, lastUnderscoreIndex);
      }
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    link.download = `${fileName}_全量快照_${dateStr}.json`;
    link.click();
  });
}
// ==========================================
// 全量数据快照导入与恢复逻辑 (已适配当前脚本方法)
// ==========================================

// 点击“导入并恢复快照”按钮触发文件选择框
if (importSnapshotBtn && importSnapshotInput) {
  importSnapshotBtn.addEventListener("click", () => {
    importSnapshotInput.value = ""; // 清空上次选择，允许重复导入同一文件
    importSnapshotInput.click();
  });

  // 监听快照文件上传
  importSnapshotInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
      try {
        const snapshotData = JSON.parse(evt.target.result);

        // 验证快照格式是否合法
        if (!snapshotData || !Array.isArray(snapshotData.vocabList)) {
          alert("导入失败：文件格式不符合标准快照要求！");
          return;
        }

        // 提示用户确认覆盖
        const confirmRestore = confirm(
          `确定要恢复该快照吗？\n` +
          `• 导出时间：${snapshotData.exportTime || "未知"}\n` +
          `• 题目数量：${snapshotData.vocabList.length} 题\n` +
          `警告：当前正在进行的答题进度将被覆盖！`
        );

        if (!confirmRestore) return;

        // 1. 恢复内存中的全局变量状态
        vocabList = snapshotData.vocabList;
        currentIndex = typeof snapshotData.currentIndex === "number" ? snapshotData.currentIndex : 0;
        
        // 生成或使用数据库 Key
        currentDbKey = snapshotData.dbKey || `EBB_RESTORED_${Date.now()}`;

        // 边界检查：防止索引越界
        if (currentIndex >= vocabList.length) {
          currentIndex = Math.max(0, vocabList.length - 1);
        }

        // 2. 将恢复后的数据写入 LocalStorage 进行持久化
        saveProgressToLocal();

        // 3. 更新界面顶部文件名显示
        const fileStatusText = document.getElementById("fileStatusText");
        if (fileStatusText && currentDbKey.startsWith("EBB_DATA_")) {
          const prefixLen = "EBB_DATA_".length;
          const lastUnderscoreIndex = currentDbKey.lastIndexOf("_");
          if (lastUnderscoreIndex > prefixLen) {
            const fileName = currentDbKey.substring(prefixLen, lastUnderscoreIndex);
            fileStatusText.innerText = `${fileName} (来自快照)`;
            fileStatusText.style.color = "var(--success-text)";
          }
        }

        // 4. 解锁右侧面板容器及功能按钮
        if (dashboardZone) {
          dashboardZone.style.opacity = "1";
          dashboardZone.style.pointerEvents = "auto";
        }
        if (answerCardZone) {
          answerCardZone.style.opacity = "1";
          answerCardZone.style.pointerEvents = "auto";
        }
        if (exportWrongBtn) exportWrongBtn.disabled = false;
        if (exportSnapshotBtn) exportSnapshotBtn.disabled = false;

        if (resetProgressBtn) resetProgressBtn.disabled = false;

        // 5. 调用系统自带函数重新渲染全部 UI 页面
        renderDashboard();           // 重新生成仪表盘
        renderAnswerCard();          // 重新生成右侧答题卡
        renderQuizZone();            // 重新装载刷题主区域
        updateEbbinghausSummary();    // 更新艾宾浩斯复习预测概览

        alert("🎉 恭喜！全量数据快照已成功恢复！");

      } catch (err) {
        console.error("解析快照文件出错：", err);
        alert("导入失败：读取快照文件时发生错误，请确认是否为正确的 JSON 快照文件。");
      }
    };

    reader.readAsText(file, "utf-8");
  });
}

// ==========================================
// 清除当前题库作答痕迹与遗忘曲线逻辑
// ==========================================
if (resetProgressBtn) {
  resetProgressBtn.addEventListener("click", () => {
    if (!vocabList || vocabList.length === 0) {
      alert("当前没有可重置的题库数据！");
      return;
    }

    // 确认二次提醒，防止误触
    const confirmReset = confirm(
      "⚠️ 警告：确定要重置当前题库的所有作答记录吗？\n\n" +
      "此操作将清除：\n" +
      "1. 所有题目做题历史与已选答案\n" +
      "2. 错题统计与错误次数\n" +
      "3. 艾宾浩斯遗忘曲线熟练度 (全部重置为 L0)\n" +
      "4. 下一次复习时间点\n\n" +
      "重置后数据无法直接撤销（建议先导出快照备份）。"
    );

    if (!confirmReset) return;

    // 1. 重置内存中的题库数据状态为初始未答状态
    vocabList.forEach((item) => {
      item.errorCount = 0;
      item.stage = 0;
      item.userStatus = "unanswered";
      item.selectedAnswer = null;
      item.nextReviewTime = 0;

      // 同时清理个别单字独立存储的全局缓存痕迹
      const globalWordKey = `EBB_WORD_CORE_${item.word.trim()}`;
      localStorage.removeItem(globalWordKey);
    });

    // 2. 指针复位到第一题
    currentIndex = 0;

    // 3. 将重置后的干净数据写回本地存储
    saveProgressToLocal();

    // 4. 重新渲染全局 UI 界面
    renderDashboard();           // 重新渲染仪表盘
    renderAnswerCard();          // 重新生成答题卡
    renderQuizZone();            // 重新刷新刷题主面板
    updateEbbinghausSummary();    // 重置艾宾浩斯复习预测面板数据

    alert("✨ 当前题库的作答痕迹与遗忘曲线数据已全部重置！");
  });
}


window.addEventListener("DOMContentLoaded", autoRecoverOnRefresh);
// ==========================================
// 键盘快捷键监听逻辑
// ==========================================
document.addEventListener('keydown', (e) => {
  // 避免用户在输入框、文本域中打字时误触发快捷键
  const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
  if (activeTag === 'input' || activeTag === 'textarea') return;

  const key = e.key;

  // 1. 切题逻辑：A / LeftArrow (上一题)
  if (key === 'a' || key === 'A' || key === 'ArrowLeft') {
    e.preventDefault();
    if (prevBtn) prevBtn.click();
  }

  // 2. 切题逻辑：D / RightArrow (下一题)
  if (key === 'd' || key === 'D' || key === 'ArrowRight') {
    e.preventDefault();
    if (nextBtn) nextBtn.click();
  }

  // 3. 提交/确认逻辑：W / Enter
  if (key === 'w' || key === 'W' || key === 'Enter') {
    e.preventDefault();
    // 单题模式下尝试触发“下一题”或艾宾浩斯复习页面的“下一题”
    const ebbNextBtn = document.getElementById('ebbNextBtn');
    if (ebbNextBtn && ebbNextBtn.style.display !== 'none') {
      ebbNextBtn.click();
    } else if (nextBtn) {
      nextBtn.click();
    }
  }

  // 4. 数字键选择逻辑：1 - 4（主键盘及小键盘）
  if (['1', '2', '3', '4'].includes(key)) {
    e.preventDefault();
    const optIndex = parseInt(key, 10) - 1;

    // 优先匹配当前单题模式容器
    const currentContainer = document.getElementById('optionsGrid') || document.getElementById('ebbOptionsGrid');
    if (currentContainer) {
      const options = currentContainer.querySelectorAll('.opt-btn');
      if (options && options[optIndex] && !options[optIndex].disabled) {
        options[optIndex].click();
      }
    }
  }
});

// 监听 Tab 切换，防止隐藏状态下的 Chart.js 渲染为空白
const navTabs = document.querySelectorAll(".nav-tabs .tab-btn");
navTabs.forEach((btn) => {
  btn.addEventListener("click", () => {
    const targetTabId = btn.getAttribute("data-tab");
    
    // 切换 active 类
    document.querySelectorAll(".tab-content").forEach((tab) => {
      tab.classList.remove("active");
    });
    navTabs.forEach((t) => t.classList.remove("active"));

    btn.classList.add("active");
    const targetTab = document.getElementById(targetTabId);
    if (targetTab) {
      targetTab.classList.add("active");
    }

    // 切换到数据分析页时，延迟 50ms 等待 DOM 显示，然后重新渲染/调整图表尺寸
    if (targetTabId === "analysisTab" && typeof renderAnalysisCharts === "function") {
      setTimeout(() => {
        renderAnalysisCharts(vocabList);
      }, 50);
    }
  });
});

// ==========================================
// 全局 Chart 图表实例引用（放置在文件顶部或函数上方）
// ==========================================
let ebbCurveChartInstance = null;
let accuracyPieChartInstance = null;
let stageBarChartInstance = null;
let futureReviewChartInstance = null;

// ==========================================
// 数据分析面板核心渲染逻辑（完美对齐 HTML ID）
// ==========================================
function renderAnalysisCharts(list) {
  const dataList = list || (typeof vocabList !== "undefined" ? vocabList : []);
  if (!dataList || dataList.length === 0) return;

  // ----------------------------------------------------
  // 1. 📉 艾宾浩斯理论衰减 vs 实际记忆保留率曲线
  // ----------------------------------------------------
  const canvasEbb = document.getElementById("ebbinghausCurveChart");
  if (canvasEbb && typeof Chart !== "undefined") {
    // 理论保留率数据点 (艾宾浩斯经典曲线 approx)
    const theoryData = [100, 58.2, 44.2, 35.8, 33.7, 27.8, 25.4, 21.1];
    
    // 计算实际保留率：各个阶段（L0-L8）题目中，非错误题目的占比
    const totalCount = dataList.length;
    const stageCorrectCounts = Array(8).fill(0);
    
    dataList.forEach((item) => {
      const s = Math.min(Math.max(item.stage || 0, 0), 7);
      if (item.userStatus === "correct" || item.stage > 0) {
        stageCorrectCounts[s]++;
      }
    });

    // 计算实际保留百分比
    let accumulated = 0;
    const actualData = stageCorrectCounts.map((count) => {
      accumulated += count;
      return totalCount > 0 ? Math.round((accumulated / totalCount) * 100) : 0;
    });

    if (window.ebbCurveChartInstance) window.ebbCurveChartInstance.destroy();

    const ctxEbb = canvasEbb.getContext("2d");
    window.ebbCurveChartInstance = new Chart(ctxEbb, {
      type: "line",
      data: {
        labels: ["5分钟", "30分钟", "12小时", "1天", "2天", "4天", "7天", "15天"],
        datasets: [
          {
            label: "艾宾浩斯理论遗忘曲线 (%)",
            data: theoryData,
            borderColor: "#e74c3c",
            backgroundColor: "rgba(231, 76, 60, 0.1)",
            borderDash: [5, 5],
            fill: false,
            tension: 0.4
          },
          {
            label: "实际记忆保留率 (%)",
            data: actualData,
            borderColor: "#2ecc71",
            backgroundColor: "rgba(46, 204, 113, 0.15)",
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: "#2ecc71"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top" }
        },
        scales: {
          y: { beginAtZero: true, max: 100 }
        }
      }
    });
  }

  // ----------------------------------------------------
  // 2. 🍩 题目答题状态与正误分布 (匹配 HTML 中的 accuracyPieChart)
  // ----------------------------------------------------
  const canvasRate = document.getElementById("accuracyPieChart");
  if (canvasRate && typeof Chart !== "undefined") {
    let rightCount = 0;
    let wrongCount = 0;
    let unanswerCount = 0;

    dataList.forEach((item) => {
      // 修正：这里的状态对应答题逻辑中的 "correct"
      if (item.userStatus === "correct") rightCount++;
      else if (item.userStatus === "wrong") wrongCount++;
      else unanswerCount++;
    });

    if (window.accuracyPieChartInstance) window.accuracyPieChartInstance.destroy();

    const ctxRate = canvasRate.getContext("2d");
    window.accuracyPieChartInstance = new Chart(ctxRate, {
      type: "doughnut",
      data: {
        labels: ["正确", "错误", "未答"],
        datasets: [{
          data: [rightCount, wrongCount, unanswerCount],
          backgroundColor: ["#2ecc71", "#e74c3c", "#95a5a6"],
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" }
        }
      }
    });
  }

  // ----------------------------------------------------
  // 3. 📊 记忆熟练度级别分布 (匹配 HTML 中的 stageBarChart)
  // ----------------------------------------------------
  const canvasStage = document.getElementById("stageBarChart");
  if (canvasStage && typeof Chart !== "undefined") {
    const stageCounts = [0, 0, 0, 0]; // L0, L1, L2, L3+
    dataList.forEach((item) => {
      const s = item.stage || 0;
      if (s === 0) stageCounts[0]++;
      else if (s === 1) stageCounts[1]++;
      else if (s === 2) stageCounts[2]++;
      else stageCounts[3]++; // L3及以上合并为最高级
    });

    if (window.stageBarChartInstance) window.stageBarChartInstance.destroy();

    const ctxStage = canvasStage.getContext("2d");
    window.stageBarChartInstance = new Chart(ctxStage, {
      type: "bar",
      data: {
        labels: ["L0 刚刷/错题", "L1 初始记忆", "L2 巩固阶段", "L3+ 精通熟练"],
        datasets: [{
          label: "题目数量",
          data: stageCounts,
          backgroundColor: ["#e74c3c", "#f1c40f", "#3498db", "#2ecc71"],
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } }
        }
      }
    });
  }

  // ----------------------------------------------------
  // 4. 📅 未来 7 天复习预测图表
  // ----------------------------------------------------
  const canvasFuture = document.getElementById("futureReviewChart");
  if (canvasFuture && typeof Chart !== "undefined") {
    const futureDays = Array(7).fill(0);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;

    dataList.forEach((item) => {
      if (item.nextReviewTime && item.stage > 0) {
        const diffDays = Math.floor((item.nextReviewTime - todayStart) / oneDayMs);
        if (diffDays >= 0 && diffDays < 7) {
          futureDays[diffDays]++;
        }
      }
    });

    const labels = ["今天", "明天", "后天", "第4天", "第5天", "第6天", "第7天"];

    if (window.futureReviewChartInstance) window.futureReviewChartInstance.destroy();

    const ctxFuture = canvasFuture.getContext("2d");
    window.futureReviewChartInstance = new Chart(ctxFuture, {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          label: "预计复习量",
          data: futureDays,
          borderColor: "#3498db",
          backgroundColor: "rgba(52, 152, 219, 0.15)",
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: "#3498db"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } }
        }
      }
    });
  }

  // 5. 同步更新高频错题榜单
  updateTopWrongTable(dataList);
}

// ==========================================
// 独立全局函数 - 更新高频错题排行榜（支持全部显示与多级筛选）
// ==========================================
function updateTopWrongTable(list) {
  const dataList = list || (typeof vocabList !== "undefined" ? vocabList : []);
  if (!dataList || dataList.length === 0) return;

  // 1. 过滤出所有有错误记录的题目，按错误次数降序排列
  const wrongList = dataList
    .filter((item) => (item.errorCount || item.wrongCount || 0) > 0 || item.userStatus === "wrong")
    .sort((a, b) => (b.errorCount || b.wrongCount || 1) - (a.errorCount || a.wrongCount || 1));

  // 2. 获取 DOM 容器
  const tbodyMain = document.getElementById("topWrongBody");    // 数据分析面板 Top5
  const tbodyEbb = document.getElementById("topWrongBodyEbb");  // 艾宾浩斯面板 Top10
  const tbodyCtph = document.getElementById("ctphWrongBody");   // 错题排行专属 Tab (展示全部)
  const tipCount = document.getElementById("ctphTotalCountTip");

  // 空错题处理
  if (wrongList.length === 0) {
    const emptyHtml = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 30px 0;">🎉 暂无错题记录，状态极佳！</td></tr>`;
    if (tbodyMain) tbodyMain.innerHTML = emptyHtml;
    if (tbodyEbb) tbodyEbb.innerHTML = emptyHtml;
    if (tbodyCtph) tbodyCtph.innerHTML = emptyHtml;
    if (tipCount) tipCount.innerText = "(共 0 道错题)";
    return;
  }

  // ----------------------------------------------------
  // 3. 渲染 ⚠️ 错题排行 Tab 页面 (显示全部 + 支持动态筛选)
  // ----------------------------------------------------
  if (tbodyCtph) {
    // 获取用户选择的筛选阈值
    const filterSelect = document.getElementById("ctphFilterSelect");
    const minErrCount = filterSelect ? parseInt(filterSelect.value, 10) || 0 : 0;

    // 过滤满足错误次数要求的错题列表
    const filteredList = wrongList.filter(
      (item) => (item.errorCount || item.wrongCount || 1) >= minErrCount
    );

    // 更新标题处的题目数量提示
    if (tipCount) {
      tipCount.innerText = `(共 ${filteredList.length} 道错题${minErrCount > 0 ? `，已过滤 ≥${minErrCount} 次` : ""})`;
    }

    if (filteredList.length === 0) {
      tbodyCtph.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 40px 0;">🔍 没有找到答错次数 ≥ ${minErrCount} 次的题目</td></tr>`;
    } else {
      // 不截断（slice），完整渲染符合条件的所有错题
      tbodyCtph.innerHTML = filteredList.map((item, index) => {
        const errTimes = item.errorCount || item.wrongCount || 1;
        return `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td style="padding: 12px; font-weight: bold; color: ${index < 3 ? '#e74c3c' : 'inherit'};">#${index + 1}</td>
            <td style="padding: 12px;"><strong>${item.word || item.title || "未命名题目"}</strong></td>
            <td style="padding: 12px; color: var(--success-text);">${item.answer || "--"}</td>
            <td style="padding: 12px; text-align: center; color: #e74c3c; font-weight: bold;">${errTimes} 次</td>
            <td style="padding: 12px; text-align: center;"><span class="badge">L${item.stage !== undefined ? item.stage : 0}</span></td>
          </tr>
        `;
      }).join("");
    }
  }

  // ----------------------------------------------------
  // 4. 渲染 数据分析面板 (Top 5) & 艾宾浩斯面板 (Top 10)
  // ----------------------------------------------------
  const top10List = wrongList.slice(0, 10);
  const rowsHtml = top10List.map((item, index) => `
    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
      <td style="padding: 10px; font-weight: bold; color: ${index < 3 ? '#e74c3c' : 'inherit'};">#${index + 1}</td>
      <td style="padding: 10px;"><strong>${item.word || item.title || "未命名题目"}</strong></td>
      <td style="padding: 10px; text-align: center; color: #e74c3c; font-weight: bold;">${item.errorCount || item.wrongCount || 1} 次</td>
      <td style="padding: 10px; text-align: center;"><span class="badge">L${item.stage !== undefined ? item.stage : 0}</span></td>
    </tr>
  `).join("");

  if (tbodyMain) tbodyMain.innerHTML = wrongList.slice(0, 5).map((item, index) => `
    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
      <td style="padding: 10px; font-weight: bold; color: ${index < 3 ? '#e74c3c' : 'inherit'};">#${index + 1}</td>
      <td style="padding: 10px;"><strong>${item.word || item.title || "未命名题目"}</strong></td>
      <td style="padding: 10px; text-align: center; color: #e74c3c; font-weight: bold;">${item.errorCount || item.wrongCount || 1} 次</td>
      <td style="padding: 10px; text-align: center;"><span class="badge">L${item.stage !== undefined ? item.stage : 0}</span></td>
    </tr>
  `).join("");

  if (tbodyEbb) tbodyEbb.innerHTML = rowsHtml;
}

// ----------------------------------------------------
// 绑定下拉框筛选事件：切换条件时即时重新刷新列表
// ----------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  const filterSelect = document.getElementById("ctphFilterSelect");
  if (filterSelect) {
    filterSelect.addEventListener("change", () => {
      updateTopWrongTable(vocabList);
    });
  }
});


// ==========================================
// 全局一键刷新所有分析与预测视图
// ==========================================
function refreshAllViews() {
  if (!vocabList || vocabList.length === 0) return;

  // 1. 刷新艾宾浩斯复习预测概览
  if (typeof updateEbbinghausSummary === "function") {
    updateEbbinghausSummary();
  }

  // 2. 刷新数据多维分析指标与图表
  if (typeof runDataAnalysis === "function") {
    runDataAnalysis();
  }
  if (typeof renderAnalysisCharts === "function") {
    renderAnalysisCharts(vocabList);
  }

  // 3. 刷新高频错题排行榜
  if (typeof updateTopWrongTable === "function") {
    updateTopWrongTable(vocabList);
  }
}
