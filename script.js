// ==========================================
// 全局状态管理
// ==========================================
let vocabList = [];
let currentIndex = 0;
let isFullPaperMode = false;
let currentDbKey = ""; // 当前文件的本地缓存唯一识别 Key
let isAutoNextEnabled = true;
let isAutoSpeakEnabled = true; // ✨ 新增：下一题自动朗读单词开关状态（默认开启）
let isEbbWordHidden = false; // ✨ 标识艾宾浩斯复习模式下是否隐藏单词

// 艾宾浩斯复习时间间隔定义 (单位: 毫秒)
const EBB_INTERVALS = [
  5 * 60 * 60 * 1000,      // L0 -> L1: 5小时
  1 * 24 * 60 * 60 * 1000, // L1 -> L2: 1天
  2 * 24 * 60 * 60 * 1000, // L2 -> L3: 2天
  4 * 24 * 60 * 60 * 1000, // L3 -> L4: 4天
  7 * 24 * 60 * 60 * 1000, // L4 -> L5: 7天
  15 * 24 * 60 * 60 * 1000,// L5 -> L6: 15天
  25 * 24 * 60 * 60 * 1000,// L6 -> L7: 25天
  30 * 24 * 60 * 60 * 1000 // L7 -> L8: 30天
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
const autoNextToggle = document.getElementById("autoNextToggle");

// ==========================================
// 缓存持久化逻辑
// ==========================================
function saveProgressToLocal() {
  if (!currentDbKey || vocabList.length === 0) return;

  const fileState = {
    currentIndex: currentIndex,
    savedVocabList: vocabList,
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
          currentIndex: parsed.currentIndex || 0,
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

    // ✨ 全卷模式不需要切题，自动隐藏“自动跳转”开关；单题模式下显示
    const autoNextSwitchBox = document.getElementById("autoNextSwitchBox");
    if (autoNextSwitchBox) {
      autoNextSwitchBox.style.display = isFullPaperMode ? "none" : "flex";
    }
    renderQuizZone();
  });
}

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

// 初始化答对自动跳转开关状态
if (autoNextToggle) {
  // 读取用户保存在本地的偏好设置
  const savedAutoNext = localStorage.getItem("EBB_AUTO_NEXT_ENABLED");
  if (savedAutoNext !== null) {
    isAutoNextEnabled = savedAutoNext === "true";
    autoNextToggle.checked = isAutoNextEnabled;
  }

  autoNextToggle.addEventListener("change", (e) => {
    isAutoNextEnabled = e.target.checked;
    localStorage.setItem("EBB_AUTO_NEXT_ENABLED", isAutoNextEnabled);
  });
}

// ✨ 初始化“艾宾浩斯隐藏单词开关”
const ebbHideWordToggle = document.getElementById("ebbHideWordToggle");
if (ebbHideWordToggle) {
  const savedHideState = localStorage.getItem("EBB_HIDE_WORD_ENABLED");
  if (savedHideState !== null) {
    isEbbWordHidden = savedHideState === "true";
    ebbHideWordToggle.checked = isEbbWordHidden;
  }

  ebbHideWordToggle.addEventListener("change", (e) => {
    isEbbWordHidden = e.target.checked;
    localStorage.setItem("EBB_HIDE_WORD_ENABLED", isEbbWordHidden);
    // 切换开关时重新载入当前复习题目以更新显示状态
    loadReviewQuestion();
  });
}

// ✨【新增】初始化“下一题自动朗读单词”开关状态
const autoSpeakToggle = document.getElementById("autoSpeakToggle");
if (autoSpeakToggle) {
  const savedAutoSpeak = localStorage.getItem("EBB_AUTO_SPEAK_ENABLED");
  if (savedAutoSpeak !== null) {
    isAutoSpeakEnabled = savedAutoSpeak === "true";
    autoSpeakToggle.checked = isAutoSpeakEnabled;
  } else {
    autoSpeakToggle.checked = true; // 默认开启
  }

  autoSpeakToggle.addEventListener("change", (e) => {
    isAutoSpeakEnabled = e.target.checked;
    localStorage.setItem("EBB_AUTO_SPEAK_ENABLED", isAutoSpeakEnabled);
  });
}

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
    themeToggleBtn.innerHTML =
      savedTheme === "dark" ? "<span>☀️</span>" : "<span>🌙</span>";
  }
}

if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", () => {
    const isDark =
      document.documentElement.getAttribute("data-theme") === "dark";
    const nextTheme = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", nextTheme);
    themeToggleBtn.innerHTML =
      nextTheme === "dark" ? "<span>☀️</span>" : "<span>🌙</span>";
    localStorage.setItem("theme", nextTheme);
  });
}
initTheme();

let isCtphAnsHidden = false; // ✨ 标识全库错题面板是否隐藏中文答案

document.addEventListener("DOMContentLoaded", () => {
  // ✨ 初始化全库错题界面的“眼睛开关”
  const ctphToggleAnsBtn = document.getElementById("ctphToggleAnsBtn");
  if (ctphToggleAnsBtn) {
    const savedState = localStorage.getItem("CTPH_HIDE_ANS_ENABLED");
    if (savedState !== null) {
      isCtphAnsHidden = savedState === "true";
      updateCtphEyeUI();
    }

    ctphToggleAnsBtn.addEventListener("click", () => {
      isCtphAnsHidden = !isCtphAnsHidden;
      localStorage.setItem("CTPH_HIDE_ANS_ENABLED", isCtphAnsHidden);
      updateCtphEyeUI();
      updateTopWrongTable(vocabList); // 重新更新表格
    });
  }
});

// 更新眼睛按钮的 UI 显示状态
function updateCtphEyeUI() {
  const eyeIcon = document.getElementById("ctphEyeIcon");
  const eyeText = document.getElementById("ctphEyeText");
  if (eyeIcon && eyeText) {
    if (isCtphAnsHidden) {
      eyeIcon.innerText = "🙈";
      eyeText.innerText = "显示答案";
    } else {
      eyeIcon.innerText = "👁️";
      eyeText.innerText = "隐藏答案";
    }
  }
}

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
          nextReviewTime: 0,
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
    if (navBtnGroup) navBtnGroup.style.display = "none";

    dynamicContent.innerHTML = "";
    dynamicContent.classList.add("full-paper-scroll");

    // 事件委托：统一监听容器点击
    dynamicContent.onclick = (e) => {
      const btn = e.target.closest(".opt-btn");
      if (!btn || btn.disabled) return;

      const qIndex = parseInt(btn.dataset.qindex, 10);
      const optVal = btn.dataset.optval;

      if (!isNaN(qIndex) && optVal) {
        handleAnswerCore(qIndex, btn, optVal, true);
      }
    };

    // 占位骨架
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

    // 懒加载观察器
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
      { root: dynamicContent, rootMargin: "300px 0px" },
    );

    const blocks = dynamicContent.querySelectorAll(".paper-item-block");
    blocks.forEach((el) => paperObserver.observe(el));
  } else {
    // ---------------- ✨ 单题模式（今日刷题） ----------------
    if (progressContainer) progressContainer.style.display = "block";
    if (quizHeader) quizHeader.style.display = "flex";
    if (navBtnGroup) navBtnGroup.style.display = "flex";

    dynamicContent.classList.remove("full-paper-scroll");
    dynamicContent.onclick = null;

    dynamicContent.innerHTML = `
      <div class="word-display" id="wordDisplay"></div>
      <div class="options-grid" id="optionsGrid"></div>
      <div id="feedback" class="feedback-msg"></div>
      <div id="mnemonicContainer" style="margin-top: 15px;"></div>
    `;

    // 防越界保护
    if (currentIndex >= vocabList.length) {
      currentIndex = vocabList.length - 1;
    }
    if (currentIndex < 0) currentIndex = 0;

    const item = vocabList[currentIndex];

    // 更新索引 & 熟练度 Badge
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

    // 1.渲染单词与发音按钮
    const wordDisplay = document.getElementById("wordDisplay");
    if (wordDisplay) {
      wordDisplay.innerHTML = `
        <span>${item.word}</span>
        <button type="button" class="audio-play-btn" title="朗读发音" onclick="speakWord('${item.word.replace(/'/g, "\\'")}')">
          🔊
        </button>
      `;
    }

    // 2. 渲染助记信息 (在渲染完单词和选项后调用)
    const mnemonicContainer = document.getElementById("mnemonicContainer");
    if (mnemonicContainer && item.word) {
      // 如果题库 txt 中自带了助记 (比如某些txt格式里包含了拆解信息)，直接用自带的；
      // 否则使用 analyzeWordMnemonic() 自动识别拆解！
      const autoMnemonicHtml = analyzeWordMnemonic(item.word);
      mnemonicContainer.innerHTML = autoMnemonicHtml;
    }

    // 渲染选项按钮
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
          feed.innerText =
            item.userStatus === "correct"
              ? "🎉 回答正确！"
              : `❌ 正确答案：${item.answer}`;
          feed.style.color =
            item.userStatus === "correct"
              ? "var(--success-text)"
              : "var(--danger-text)";
        }
      } else {
        btn.onclick = () => handleAnswerCore(currentIndex, btn, option, false);
      }
      grid.appendChild(btn);
    });

    // ✨【核心修复】：在单题渲染成功后，确保处于“自动朗读开启”状态时立刻朗读当前单词！
    if (typeof isAutoSpeakEnabled === "undefined" || isAutoSpeakEnabled) {
      speakWord(item.word);
    }
  }

  // 同步更新右侧答题卡高亮
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
      if (option === item.selectedAnswer && option !== item.answer)
        extraClass += " wrong";
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
    const interval =
      EBB_INTERVALS[item.stage - 1] || EBB_INTERVALS[EBB_INTERVALS.length - 1];
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

  const block = isPaper
    ? btn.closest(".paper-item-block")
    : document.getElementById("quizDynamicContent");
  if (block) {
    if (isPaper) block.className = `paper-item-block ${item.userStatus}`;
    const feed = block.querySelector(".feedback-msg");
    if (feed) {
      feed.innerText =
        item.userStatus === "correct"
          ? "🎉 回答正确！"
          : `❌ 正确答案是：${item.answer}`;
      feed.style.color =
        item.userStatus === "correct"
          ? "var(--success-text)"
          : "var(--danger-text)";
    }
  }

  updateSingleAnswerCardNode(index, item.userStatus);

  setTimeout(() => {
    saveProgressToLocal();
    localStorage.setItem(
      `EBB_WORD_CORE_${item.word.trim()}`,
      JSON.stringify({
        errorCount: item.errorCount,
        stage: item.stage,
        userStatus: item.userStatus,
        selectedAnswer: item.selectedAnswer,
        nextReviewTime: item.nextReviewTime,
      }),
    );
  }, 0);
  updateEbbinghausSummary();
  updateTopWrongTable(vocabList);

  // ✨【新增】：单题模式下，若答对且开启了自动跳转，延迟 350ms 后切入下一题
  if (!isPaper && selectedOpt === item.answer && isAutoNextEnabled) {
    setTimeout(() => {
      if (currentIndex < vocabList.length - 1) {
        currentIndex++;
        renderQuizZone();
        saveProgressToLocal();
      } else {
        alert("🎉 恭喜！当前题库已全部刷完！");
      }
    }, 200); // 350ms 延迟：既能看到“回答正确”的绿色高亮反馈，又能顺畅切题
  }
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
        if (target)
          target.scrollIntoView({ behavior: "smooth", block: "center" });
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
  const answered = vocabList.filter(
    (i) => i.userStatus !== "unanswered",
  ).length;
  const correctNum = vocabList.filter((i) => i.userStatus === "correct").length;

  // 👈 计算错题总数
  const wrongNum = vocabList.filter(
    (i) => (i.errorCount || 0) > 0 || i.userStatus === "wrong",
  ).length;

  const acc = answered > 0 ? Math.round((correctNum / answered) * 100) : 0;

  const now = Date.now();
  const forgetWarnings = vocabList.filter(
    (i) => i.nextReviewTime > 0 && now >= i.nextReviewTime,
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
      "初学记忆 L1 (5小时/1天)",
      "巩固阶段 L2 (2-4天周期)",
      "熟练精通 L3+ (7天以上长期记忆)",
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
    const remainSec = Math.max(
      0,
      Math.round((item.nextReviewTime - now) / 1000),
    );
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
  const grid = document.getElementById("ebbOptionsGrid");
  const feed = document.getElementById("ebbFeedback");
  const ebbNextBtn = document.getElementById("ebbNextBtn");
  const ebbMnemonicContainer = document.getElementById("ebbMnemonicContainer"); // ✨ 获取助记容器

  if (currentReviewPointer >= currentReviewIndexList.length) {
    alert("✨ 恭喜！当前批次的到期复习题目已全部剿灭！");
    renderEbbinghausView();
    updateEbbinghausSummary();
    return;
  }

  const mainIdx = currentReviewIndexList[currentReviewPointer];
  const item = vocabList[mainIdx];
  if (!item) return;

  if (feed) feed.innerText = "";
  if (ebbNextBtn) ebbNextBtn.style.display = "none";

  // ✨【新增】加载题目时，自动解析并在下一题按钮下方渲染助记内容
  if (
    ebbMnemonicContainer &&
    item.word &&
    typeof analyzeWordMnemonic === "function"
  ) {
    ebbMnemonicContainer.innerHTML = analyzeWordMnemonic(item.word);
  }

  const ebbWordDisplay = document.getElementById("ebbWordDisplay");
  if (ebbWordDisplay) {
    // ✨ 根据开关状态判断是显示单词本身还是显示占位遮罩
    const displayWordText = isEbbWordHidden ? "❓ ❓ ❓" : item.word;

    ebbWordDisplay.innerHTML = `
      <span>【复习第 ${item.id} 题】 ${displayWordText}</span>
      <button type="button" class="audio-play-btn" title="朗读发音" onclick="speakWord('${item.word.replace(/'/g, "\\'")}')">
        🔊
      </button>
    `;

    // 自动朗读单词发音（隐藏单词模式下依靠声音听辨选择）
    if (typeof isAutoSpeakEnabled === "undefined" || isAutoSpeakEnabled) {
      speakWord(item.word);
    }
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

        // ✨ 答题后取消遮罩，揭晓原单词
        if (ebbWordDisplay) {
          ebbWordDisplay.querySelector("span").innerText =
            `【复习第 ${item.id} 题】 ${item.word}`;
        }

        if (option === item.answer) {
          // ---------------- 【答对逻辑】 ----------------
          btn.classList.add("correct");
          if (feed) {
            feed.innerText = "🎉 复习成功！记忆评级已升级提升。";
            feed.style.color = "var(--success-text)";
          }
          if (item.stage < 8) item.stage++;
          item.nextReviewTime =
            Date.now() +
            (EBB_INTERVALS[item.stage - 1] ||
              EBB_INTERVALS[EBB_INTERVALS.length - 1]);
          item.userStatus = "correct";

          saveProgressToLocal();
          updateEbbinghausSummary(); // 即时更新顶部概览

          setTimeout(() => {
            currentReviewPointer++;
            renderEbbinghausView(); // 自动跳转前刷新侧边栏
            loadReviewQuestion();
          }, 350); // 留出 350ms 视觉反馈时间
        } else {
          // ---------------- 【答错逻辑】 ----------------
          btn.classList.add("wrong");
          if (feed) {
            feed.innerText = `❌ 复习再次犯错！惩罚降回 L0，5小时后重新排队。正确答案是：${item.answer}`;
            feed.style.color = "var(--danger-text)";
          }
          item.stage = 0;
          item.errorCount++;
          item.nextReviewTime = Date.now() + EBB_INTERVALS[0];
          item.userStatus = "wrong";

          buttons.forEach((b) => {
            if (b.innerText === item.answer) b.classList.add("correct");
          });

          // 显示“下一题”按钮，停留在当前页等待用户确认
          if (ebbNextBtn) ebbNextBtn.style.display = "block";

          saveProgressToLocal();
          updateEbbinghausSummary();
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
    renderEbbinghausView();
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
          `${i.word}|${i.rawOptions[0]}|${i.rawOptions[1]}|${i.rawOptions[2]}|${i.rawOptions[3]}|${i.answer}`,
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
            const recoveredFileName = activeKey.substring(
              prefixLen,
              lastUnderscoreIndex,
            );
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
        stage: item.stage, // 艾宾浩斯记忆阶段 (L0-L8)
        userStatus: item.userStatus, // 用户作答状态 (unanswered/correct/wrong)
        selectedAnswer: item.selectedAnswer, // 用户的选择
        nextReviewTime: item.nextReviewTime, // 下一次临界复习时间戳
      })),
    };

    // 转换为格式化的 JSON 文本并下载
    const jsonStr = JSON.stringify(snapshotData, null, 2);
    const blob = new Blob([jsonStr], {
      type: "application/json;charset=utf-8;",
    });
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
            `警告：当前正在进行的答题进度将被覆盖！`,
        );

        if (!confirmRestore) return;

        // 1. 恢复内存中的全局变量状态
        vocabList = snapshotData.vocabList;
        currentIndex =
          typeof snapshotData.currentIndex === "number"
            ? snapshotData.currentIndex
            : 0;

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
            const fileName = currentDbKey.substring(
              prefixLen,
              lastUnderscoreIndex,
            );
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
        renderDashboard(); // 重新生成仪表盘
        renderAnswerCard(); // 重新生成右侧答题卡
        renderQuizZone(); // 重新装载刷题主区域
        updateEbbinghausSummary(); // 更新艾宾浩斯复习预测概览

        alert("🎉 恭喜！全量数据快照已成功恢复！");
      } catch (err) {
        console.error("解析快照文件出错：", err);
        alert(
          "导入失败：读取快照文件时发生错误，请确认是否为正确的 JSON 快照文件。",
        );
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
        "重置后数据无法直接撤销（建议先导出快照备份）。",
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
    renderDashboard(); // 重新渲染仪表盘
    renderAnswerCard(); // 重新生成答题卡
    renderQuizZone(); // 重新刷新刷题主面板
    updateEbbinghausSummary(); // 重置艾宾浩斯复习预测面板数据

    alert("✨ 当前题库的作答痕迹与遗忘曲线数据已全部重置！");
  });
}

window.addEventListener("DOMContentLoaded", autoRecoverOnRefresh);

// ==========================================
// 艾宾浩斯专属切题与提交逻辑（强规则约束）
// ==========================================

/**
 * 艾宾浩斯复习：查看上一题
 */
function ebbGoPrevQuestion() {
  if (!currentReviewIndexList || currentReviewIndexList.length === 0) return;

  if (currentReviewPointer > 0) {
    currentReviewPointer--;
    loadReviewQuestion();
  } else {
    const feed = document.getElementById("ebbFeedback");
    if (feed) {
      feed.innerText = "ℹ️ 当前已经是复习队列的第一题了！";
      feed.style.color = "var(--primary-color, #3498db)";
    }
  }
}

/**
 * 艾宾浩斯复习：按右方向键提交/进入下一题
 */
function ebbSubmitOrNextQuestion() {
  if (!currentReviewIndexList || currentReviewIndexList.length === 0) return;

  const mainIdx = currentReviewIndexList[currentReviewPointer];
  const item = vocabList[mainIdx];
  if (!item) return;

  // 🔒 规则拦截：当前题目尚未完成作答，不允许直接进入下一题！
  if (item.userStatus === "unanswered") {
    const feed = document.getElementById("ebbFeedback");
    if (feed) {
      feed.innerText =
        "⚠️ 请先做出选择完成当前题目后，再按右方向键 (→) 或点击下一题！";
      feed.style.color = "var(--danger-text, #e74c3c)";
    }
    return;
  }

  // 当前题目已完成，正常切到下一题
  currentReviewPointer++;
  renderEbbinghausView();
  loadReviewQuestion();
}

// ==========================================
// 全局键盘快捷键响应中心 (适配多 Tab)
// ==========================================
document.addEventListener("keydown", (e) => {
  // 避开输入框打字场景
  const activeTag = document.activeElement
    ? document.activeElement.tagName.toLowerCase()
    : "";
  if (activeTag === "input" || activeTag === "textarea") return;

  const key = e.key;

  // 判断当前处于哪一个 Tab
  const activeTabBtn = document.querySelector(".nav-tabs .tab-btn.active");
  const activeTabId = activeTabBtn ? activeTabBtn.getAttribute("data-tab") : "";

  // --------------------------------------------------
  // 场景 A：当前处于【⏳ 艾宾浩斯复习】界面
  // --------------------------------------------------
  if (activeTabId === "ebbinghausTab") {
    const ebbZone = document.getElementById("ebbReviewZone");
    if (ebbZone && ebbZone.style.display !== "none") {
      // ⬅️ 左方向键 (←) / A 键：查看上一题
      if (key === "ArrowLeft" || key === "a" || key === "A") {
        e.preventDefault();
        ebbGoPrevQuestion();
      }

      // ➔ 右方向键 (→) / Enter / Space：提交并切换下一题
      if (
        key === "ArrowRight" ||
        key === "d" ||
        key === "D" ||
        key === "Enter" ||
        key === " "
      ) {
        e.preventDefault();
        ebbSubmitOrNextQuestion();
      }

      // 数字键 1-4：选择对应选项
      if (["1", "2", "3", "4"].includes(key)) {
        e.preventDefault();
        const optIndex = parseInt(key, 10) - 1;
        const ebbGrid = document.getElementById("ebbOptionsGrid");
        if (ebbGrid) {
          const btns = ebbGrid.querySelectorAll(".opt-btn");
          if (btns && btns[optIndex] && !btns[optIndex].disabled) {
            btns[optIndex].click();
          }
        }
      }
    }
    return;
  }

  // --------------------------------------------------
  // 场景 B：【📝 今日刷题】界面（主页）
  // --------------------------------------------------
  if (key === "a" || key === "A" || key === "ArrowLeft") {
    e.preventDefault();
    if (prevBtn) prevBtn.click();
  }

  if (key === "d" || key === "D" || key === "ArrowRight") {
    e.preventDefault();
    if (nextBtn) nextBtn.click();
  }

  // 快捷键 W 保持切下一题
  if (key === "w" || key === "W") {
    e.preventDefault();
    if (nextBtn) nextBtn.click();
  }

  // ✨【核心修改】：主页按 Enter 键再次朗读当前单词
  if (key === "Enter") {
    e.preventDefault();
    if (vocabList.length > 0 && vocabList[currentIndex]) {
      speakWord(vocabList[currentIndex].word);
    }
  }

  // 数字键 1-4：选择对应选项
  if (["1", "2", "3", "4"].includes(key)) {
    e.preventDefault();
    const optIndex = parseInt(key, 10) - 1;
    const currentContainer = document.getElementById("optionsGrid");
    if (currentContainer) {
      const options = currentContainer.querySelectorAll(".opt-btn");
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
    if (
      targetTabId === "analysisTab" &&
      typeof renderAnalysisCharts === "function"
    ) {
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

    // 1. 统计各个艾宾浩斯阶段（L0~L7）中【已作答题目数】与【正确/已巩固题目数】
    const stageTotalCounts = Array(8).fill(0); // 每个阶段已做过的总题数
    const stageCorrectCounts = Array(8).fill(0); // 每个阶段答对/保留的题数

    dataList.forEach((item) => {
      // 过滤未作答的题目，未答题目不参与保留率计算
      if (!item.userStatus || item.userStatus === "unanswered") return;

      const s = Math.min(Math.max(item.stage || 0, 0), 7);
      stageTotalCounts[s]++;

      // 只要该题状态是 correct 或者熟练度处于巩固阶段 (stage > 0)
      if (item.userStatus === "correct" || item.stage > 0) {
        stageCorrectCounts[s]++;
      }
    });

    // 2. 统计全局已作答的整体保留率，作为各阶段的备用参考基准
    const grandTotalAnswered = dataList.filter(
      (i) => i.userStatus && i.userStatus !== "unanswered",
    ).length;
    const grandTotalCorrect = dataList.filter(
      (i) => i.userStatus === "correct" || i.stage > 0,
    ).length;
    const overallRetention =
      grandTotalAnswered > 0
        ? Math.round((grandTotalCorrect / grandTotalAnswered) * 100)
        : 0;

    // 3. 对应计算 8 个节点的实际保留率 (%)
    const actualData = stageTotalCounts.map((total, idx) => {
      if (total > 0) {
        // 如果该节点有作答数据，按该节点比例计算
        return Math.round((stageCorrectCounts[idx] / total) * 100);
      } else {
        // 如果该阶段暂时没有样本数据：
        // 若整体有答题数据，则平滑显示整体正确率；若一道题都没做过，则返回 0
        return overallRetention;
      }
    });

    if (window.ebbCurveChartInstance) window.ebbCurveChartInstance.destroy();

    const ctxEbb = canvasEbb.getContext("2d");
    window.ebbCurveChartInstance = new Chart(ctxEbb, {
      type: "line",
      data: {
        labels: ["5小时", "1天", "2天", "4天", "7天", "15天", "25天", "30天"],
        datasets: [
          {
            label: "艾宾浩斯理论遗忘曲线 (%)",
            data: theoryData,
            borderColor: "#e74c3c",
            backgroundColor: "rgba(231, 76, 60, 0.1)",
            borderDash: [5, 5],
            fill: false,
            tension: 0.4,
          },
          {
            label: "实际记忆保留率 (%)",
            data: actualData,
            borderColor: "#2ecc71",
            backgroundColor: "rgba(46, 204, 113, 0.15)",
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: "#2ecc71",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top" },
        },
        scales: {
          y: { beginAtZero: true, max: 100 },
        },
      },
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

    if (window.accuracyPieChartInstance)
      window.accuracyPieChartInstance.destroy();

    const ctxRate = canvasRate.getContext("2d");
    window.accuracyPieChartInstance = new Chart(ctxRate, {
      type: "doughnut",
      data: {
        labels: ["正确", "错误", "未答"],
        datasets: [
          {
            data: [rightCount, wrongCount, unanswerCount],
            backgroundColor: ["#2ecc71", "#e74c3c", "#95a5a6"],
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" },
        },
      },
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
        datasets: [
          {
            label: "题目数量",
            data: stageCounts,
            backgroundColor: ["#e74c3c", "#f1c40f", "#3498db", "#2ecc71"],
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    });
  }

  // ----------------------------------------------------
  // 4. 📅 未来 7 天复习预测图表
  // ----------------------------------------------------
  const canvasFuture = document.getElementById("futureReviewChart");
  if (canvasFuture && typeof Chart !== "undefined") {
    const futureDays = Array(7).fill(0);
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;

    dataList.forEach((item) => {
      if (item.nextReviewTime && item.stage > 0) {
        const diffDays = Math.floor(
          (item.nextReviewTime - todayStart) / oneDayMs,
        );
        if (diffDays >= 0 && diffDays < 7) {
          futureDays[diffDays]++;
        }
      }
    });

    const labels = ["今天", "明天", "后天", "第4天", "第5天", "第6天", "第7天"];

    if (window.futureReviewChartInstance)
      window.futureReviewChartInstance.destroy();

    const ctxFuture = canvasFuture.getContext("2d");
    window.futureReviewChartInstance = new Chart(ctxFuture, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "预计复习量",
            data: futureDays,
            borderColor: "#3498db",
            backgroundColor: "rgba(52, 152, 219, 0.15)",
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: "#3498db",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    });
  }

  // 5. 同步更新高频错题榜单
  updateTopWrongTable(dataList);
}

// ==========================================
// 独立全局函数 - 更新高频错题排行榜（支持全部显示、朗读、答案显隐与多级筛选）
// ==========================================
function updateTopWrongTable(list) {
  const dataList = list || (typeof vocabList !== "undefined" ? vocabList : []);
  if (!dataList || dataList.length === 0) return;

  // 1. 过滤出所有有错误记录的题目，按错误次数降序排列
  const wrongList = dataList
    .filter(
      (item) =>
        (item.errorCount || item.wrongCount || 0) > 0 ||
        item.userStatus === "wrong",
    )
    .sort(
      (a, b) =>
        (b.errorCount || b.wrongCount || 1) -
        (a.errorCount || a.wrongCount || 1),
    );

  // 2. 获取 DOM 容器
  const tbodyMain = document.getElementById("topWrongBody"); // 数据分析面板 Top5
  const tbodyEbb = document.getElementById("topWrongBodyEbb"); // 艾宾浩斯面板 Top10
  const tbodyCtph = document.getElementById("ctphWrongBody"); // 错题排行专属 Tab (展示全部)
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
  // 3. 渲染 ⚠️ 错题排行 Tab 页面 (显示全部 + 带发音按钮 + 支持答案显隐控制)
  // ----------------------------------------------------
  if (tbodyCtph) {
    // 获取用户选择的筛选阈值
    const filterSelect = document.getElementById("ctphFilterSelect");
    const minErrCount = filterSelect
      ? parseInt(filterSelect.value, 10) || 0
      : 0;

    // 过滤满足错误次数要求的错题列表
    const filteredList = wrongList.filter(
      (item) => (item.errorCount || item.wrongCount || 1) >= minErrCount,
    );

    // 更新标题处的题目数量提示
    if (tipCount) {
      tipCount.innerText = `(共 ${filteredList.length} 道错题${minErrCount > 0 ? `，已过滤 ≥${minErrCount} 次` : ""})`;
    }

    if (filteredList.length === 0) {
      tbodyCtph.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 40px 0;">🔍 没有找到答错次数 ≥ ${minErrCount} 次的题目</td></tr>`;
    } else {
      tbodyCtph.innerHTML = filteredList
        .map((item, index) => {
          const errTimes = item.errorCount || item.wrongCount || 1;
          const cleanWord = (item.word || item.title || "").replace(
            /'/g,
            "\\'",
          );

          // 根据眼睛开关判定答案显示遮罩或文本
          const displayAns = isCtphAnsHidden ? "🙈 ***" : item.answer || "--";

          return `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td style="padding: 12px; font-weight: bold; color: ${index < 3 ? "#e74c3c" : "inherit"};">#${index + 1}</td>
            <td style="padding: 12px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <strong>${item.word || item.title || "未命名题目"}</strong>
                <!-- ✨ 单词旁的朗读发音按钮 -->
                <button type="button" class="audio-play-btn" title="朗读发音" style="padding: 2px 6px; font-size: 13px;" onclick="speakWord('${cleanWord}')">
                  🔊
                </button>
              </div>
            </td>
            <!-- ✨ 支持遮罩/显隐的中文答案 -->
            <td style="padding: 12px; color: ${isCtphAnsHidden ? "var(--text-muted)" : "var(--success-text)"};">${displayAns}</td>
            <td style="padding: 12px; text-align: center; color: #e74c3c; font-weight: bold;">${errTimes} 次</td>
            <td style="padding: 12px; text-align: center;"><span class="badge">L${item.stage !== undefined ? item.stage : 0}</span></td>
          </tr>
        `;
        })
        .join("");
    }
  }

  // ----------------------------------------------------
  // 4. 渲染 数据分析面板 (Top 5) & 艾宾浩斯面板 (Top 10)
  // ----------------------------------------------------
  const top10List = wrongList.slice(0, 10);
  const rowsHtml = top10List
    .map(
      (item, index) => `
    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
      <td style="padding: 10px; font-weight: bold; color: ${index < 3 ? "#e74c3c" : "inherit"};">#${index + 1}</td>
      <td style="padding: 10px;"><strong>${item.word || item.title || "未命名题目"}</strong></td>
      <td style="padding: 10px; text-align: center; color: #e74c3c; font-weight: bold;">${item.errorCount || item.wrongCount || 1} 次</td>
      <td style="padding: 10px; text-align: center;"><span class="badge">L${item.stage !== undefined ? item.stage : 0}</span></td>
    </tr>
  `,
    )
    .join("");

  if (tbodyMain)
    tbodyMain.innerHTML = wrongList
      .slice(0, 5)
      .map(
        (item, index) => `
    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
      <td style="padding: 10px; font-weight: bold; color: ${index < 3 ? "#e74c3c" : "inherit"};">#${index + 1}</td>
      <td style="padding: 10px;"><strong>${item.word || item.title || "未命名题目"}</strong></td>
      <td style="padding: 10px; text-align: center; color: #e74c3c; font-weight: bold;">${item.errorCount || item.wrongCount || 1} 次</td>
      <td style="padding: 10px; text-align: center;"><span class="badge">L${item.stage !== undefined ? item.stage : 0}</span></td>
    </tr>
  `,
      )
      .join("");

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
// ==========================================
// 单词发音 (TTS 语音合成)
// ==========================================
function speakWord(word) {
  if (!word) return;
  // 停止当前正在播放的声音
  window.speechSynthesis.cancel();

  // 提取单词部分（防止把音标 [ad'vaiz] 一起读出来）
  const cleanWord = word.split("[")[0].trim();

  const utterance = new SpeechSynthesisUtterance(cleanWord);
  utterance.lang = "en-US"; // 设置为美式英语 (如果是英式可设为 'en-GB')
  utterance.rate = 0.8; // 语速设置为 0.8，稍微慢一点更清晰

  window.speechSynthesis.speak(utterance);
}

// ==========================================
// 全局错题导出 Excel 功能 (精简版：仅保留图片中的 6 列)
// ==========================================
function exportWrongToExcel() {
  if (typeof XLSX === "undefined") {
    alert("❌ Excel 导出库 (xlsx.js) 未加载成功，请刷新页面或检查网络链接！");
    return;
  }

  if (!vocabList || vocabList.length === 0) {
    alert("⚠️ 当前没有载入任何题库数据！");
    return;
  }

  // 1. 获取当前筛选阀值
  const filterSelect = document.getElementById("ctphFilterSelect");
  const minErrCount = filterSelect ? parseInt(filterSelect.value, 10) || 0 : 0;

  // 2. 筛选错题 (错题次数 >= minErrCount 且 > 0)
  const wrongList = vocabList
    .filter(
      (item) =>
        (item.errorCount || item.wrongCount || 0) > 0 &&
        (item.errorCount || item.wrongCount || 0) >= minErrCount,
    )
    .sort(
      (a, b) =>
        (b.errorCount || b.wrongCount || 0) -
        (a.errorCount || a.wrongCount || 0),
    );

  if (wrongList.length === 0) {
    alert("⚠️ 当前筛选条件下没有任何错题可供导出！");
    return;
  }

  // 3. 仅映射指定的 6 个核心列
  const excelRows = wrongList.map((item, index) => {
    return {
      错题排名: index + 1,
      题目ID: item.id || index + 1,
      "单词 / 核心题目": item.word || item.title || "",
      正确答案: item.answer || "",
      答错次数: item.errorCount || item.wrongCount || 1,
      艾宾浩斯熟练度: `L${item.stage !== undefined ? item.stage : 0}`,
    };
  });

  // 4. 生成 WorkSheet 与 WorkBook
  const worksheet = XLSX.utils.json_to_sheet(excelRows);

  // 设置精准匹配的列宽
  worksheet["!cols"] = [
    { wch: 10 }, // 错题排名
    { wch: 10 }, // 题目ID
    { wch: 25 }, // 单词 / 核心题目
    { wch: 30 }, // 正确答案
    { wch: 12 }, // 答错次数
    { wch: 16 }, // 艾宾浩斯熟练度
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "错题集汇总");

  // 5. 导出文件
  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `错题排行榜_${dateStr}.xlsx`);
}
// ==========================================
// 页面加载完成后自动绑定事件
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  // 1. 绑定错题 Excel 导出按钮点击事件
  const exportExcelBtn = document.getElementById("ctphExportExcelBtn");
  if (exportExcelBtn) {
    exportExcelBtn.addEventListener("click", exportWrongToExcel);
  }

  // 2. 如果页面上有筛选器变更事件，也可在这里绑定自动刷新
  const filterSelect = document.getElementById("ctphFilterSelect");
  if (filterSelect) {
    filterSelect.addEventListener("change", () => {
      if (typeof updateTopWrongTable === "function") {
        updateTopWrongTable();
      }
    });
  }
});
