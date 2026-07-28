// mnemonic.js - 词根词缀与助记引擎

// 1. 常见前缀、词根、后缀映射表 (已扩展优化)
const PREFIXES = {
  // --- 新增/补全前缀 ---
  "ab": "离去，相反，偏离",
  "abs": "抽离，偏离",
  "auto": "自动，自身",
  "ac": "向，朝向，加强",
  "ad": "向，朝向，加强",
  "ap": "向，朝向，加强",
  "ar": "向，朝向，加强",
  "as": "向，朝向，加强",
  "at": "向，朝向，加强",
  
  // --- 原有前缀 ---
  "un": "不，无 (表示否定)",
  "dis": "不，分开 (表示否定或相反)",
  "re": "再次，重新，向后",
  "in": "不，向内",
  "im": "不，向内 (用于b/m/p前)",
  "con": "共同，一起",
  "com": "共同，一起",
  "pre": "前，预先",
  "pro": "向前，赞同",
  "sub": "在...下面，次级",
  "trans": "穿过，转变",
  "anti": "反对，抗",
  "inter": "在...之间",
  "ex": "向外，前任"
};

const SUFFIXES = {
  // --- 新增/补全后缀 ---
  "ance": "性质，状态，行为 (名词)",
  "ence": "性质，状态，行为 (名词)",
  "ty": "性质，状态 (名词)",
  
  // --- 原有后缀 ---
  "able": "能...的，具有...性质的 (形容词)",
  "ible": "能...的 (形容词)",
  "tion": "行为，过程，状态 (名词)",
  "sion": "状态，行为 (名词)",
  "ment": "行为，结果，组织 (名词)",
  "ful": "充满...的 (形容词)",
  "less": "无...的，不...的 (形容词)",
  "ly": "地 (副词) / 具有...性质的",
  "ive": "有...倾向的，具有...性质的 (形容词)",
  "ize": "使...化 (动词)",
  "ise": "使...化 (动词)",
  "ous": "充满...的，具有...性质的 (形容词)",
  "er": "人，做...的人或物 (名词)",
  "or": "人，物 (名词)"
};

const ROOTS = {
  "vis": "看 (spect/vis)",
  "vid": "看",
  "spect": "看",
  "struct": "建造，构建",
  "port": "拿，运，港口",
  "form": "形状，形成",
  "dict": "说，言",
  "tract": "拉，抽",
  "press": "压，挤",
  "scrib": "写",
  "script": "写",
  "bio": "生命",
  "geo": "地球，地理",
  "log": "言语，科学",
  "ped": "脚，儿童",
  "man": "手"
};

/**
 * 自动分析单词的词根词缀
 * @param {string} word - 待拆解单词
 * @returns {string} 格式化的助记拆解HTML
 */
function analyzeWordMnemonic(word) {
  if (!word) return "";
  
  // 清理单词（去除音标、空格、转小写）
  let cleanWord = word.split('[')[0].trim().toLowerCase();
  
  let foundPrefix = "";
  let foundSuffix = "";
  let foundRoot = "";
  let tempWord = cleanWord;

  // 1. 匹配前缀
  for (let pre in PREFIXES) {
    if (tempWord.startsWith(pre) && tempWord.length - pre.length >= 3) {
      foundPrefix = pre;
      tempWord = tempWord.slice(pre.length);
      break;
    }
  }

  // 2. 匹配后缀
  for (let suf in SUFFIXES) {
    if (tempWord.endsWith(suf) && tempWord.length - suf.length >= 2) {
      foundSuffix = suf;
      tempWord = tempWord.slice(0, -suf.length);
      break;
    }
  }

  // 3. 匹配词根 (在剩余部分或原词中查找)
  for (let root in ROOTS) {
    if (cleanWord.includes(root)) {
      foundRoot = root;
      break;
    }
  }

  // 构建分析结果 HTML
  let details = [];
  if (foundPrefix) {
    details.push(`<span style="color:#e67e22;"><b>前缀:</b> ${foundPrefix}- (${PREFIXES[foundPrefix]})</span>`);
  }
  if (foundRoot) {
    details.push(`<span style="color:#2980b9;"><b>词根:</b> -${foundRoot}- (${ROOTS[foundRoot]})</span>`);
  }
  if (foundSuffix) {
    details.push(`<span style="color:#2ecc71;"><b>后缀:</b> -${foundSuffix} (${SUFFIXES[foundSuffix]})</span>`);
  }

  if (details.length > 0) {
    return `<div class="mnemonic-box">💡 <b>词根词缀拆解：</b> ${details.join(" + ")}</div>`;
  } else {
    // 未拆解出规则词根时的默认提示/联想
    return `<div class="mnemonic-box text-muted">💡 <b>记忆辅助：</b> 尝试将 [${cleanWord}] 分拆重组或使用谐音法记忆。</div>`;
  }
}