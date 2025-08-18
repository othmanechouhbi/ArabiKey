// content.js — settings now include keyboardColor; we compute focused letter color from it
const DEFAULT_SETTINGS = {
  theme: "light",
  size: "medium",
  opacity: 1,
  translucent: false,
  draggable: true,
  showIcon: true,
  autoOpen: false,
  layout: "standard",
  keysPerRow: 12,
  showTransliteration: false,
  persistPosition: true,
  closeOnBlur: true,
  customKeys: "",
  keyboardColor: "" // hex like "#rrggbb"
};

let settings = { ...DEFAULT_SETTINGS };
let targetEl = null;
let iconEl = null;
let keyboardContainer = null;

const LAYOUTS = {
  // Standard Arabic order (as in image / Arabic 101-like)
  standard: [
    "ض","ص","ث","ق","ف","غ","ع","ه","خ","ح","ج","د",
    "ش","س","ي","ب","ل","ا","ت","ن","م","ك","ط","⌫",
    "ئ","ء","ؤ","ر","لا","ى","ة","و","ز","ظ","␣"
  ],
  phonetic: [
    "ق","و","ع","ر","ت","ي","ى","ح","س","د","ف","غ",
    "ك","ل","م","ن","ه","ب","ا","ش","ص","ض","ط","⌫",
    "ذ","ئ","ء","ؤ","لا","ة","ظ","ز","ج","خ","␣"
  ]
};

function loadSettings() {
  return new Promise((resolve) => {
    if (!chrome?.storage?.sync) {
      settings = { ...DEFAULT_SETTINGS };
      resolve(settings);
      return;
    }
    chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS), (items) => {
      settings = { ...DEFAULT_SETTINGS, ...items };
      settings.opacity = Number(settings.opacity) || DEFAULT_SETTINGS.opacity;
      settings.keysPerRow = Number(settings.keysPerRow) || DEFAULT_SETTINGS.keysPerRow;
      resolve(settings);
    });
  });
}

// color helpers
function hexToRgb(hex) {
  if (!hex) return null;
  hex = hex.replace("#", "");
  const r = parseInt(hex.substring(0,2),16);
  const g = parseInt(hex.substring(2,4),16);
  const b = parseInt(hex.substring(4,6),16);
  return { r, g, b };
}
function rgbToHex(r,g,b) {
  const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
  return "#" + [r,g,b].map(clamp).map(v => v.toString(16).padStart(2,"0")).join("");
}
function rgbToHsl(r,g,b){
  r/=255;g/=255;b/=255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h=0, s=0, l=(max+min)/2;
  if(max!==min){
    const d = max-min;
    s = l>0.5? d/(2-max-min) : d/(max+min);
    switch(max){
      case r: h = (g-b)/d + (g<b?6:0); break;
      case g: h = (b-r)/d + 2; break;
      case b: h = (r-g)/d + 4; break;
    }
    h /= 6;
  }
  return {h: h*360, s: s*100, l: l*100};
}
function hslToRgb(h,s,l){
  h/=360; s/=100; l/=100;
  let r,g,b;
  if(s===0){ r=g=b=l*255; }
  else {
    const hue2rgb = (p,q,t) => {
      if(t<0) t+=1; if(t>1) t-=1;
      if(t<1/6) return p + (q-p)*6*t;
      if(t<1/2) return q;
      if(t<2/3) return p + (q-p)*(2/3 - t)*6;
      return p;
    };
    const q = l<0.5 ? l*(1+s) : l + s - l*s;
    const p = 2*l - q;
    r = hue2rgb(p,q,h+1/3)*255;
    g = hue2rgb(p,q,h)*255;
    b = hue2rgb(p,q,h-1/3)*255;
  }
  return { r, g, b };
}
function adjustLightness(hex, deltaPercent) {
  const rgb = hexToRgb(hex);
  if(!rgb) return hex;
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  hsl.l = Math.max(0, Math.min(100, hsl.l + deltaPercent));
  const nrgb = hslToRgb(hsl.h, hsl.s, hsl.l);
  return rgbToHex(nrgb.r, nrgb.g, nrgb.b);
}
function isValidHex(h) {
  return typeof h === "string" && /^#([0-9a-fA-F]{6})$/.test(h.trim());
}

// apply CSS variable colors using settings.keyboardColor (if provided)
function applyColorVars(container) {
  if (!container) return;
  if (settings.keyboardColor && isValidHex(settings.keyboardColor)) {
    const bg = settings.keyboardColor;
    // compute key background and text color:
    // - keys slightly lighter/darker than bg (depending on bg lightness)
    // - text color "more concentrated": reduce lightness by 20 if bg is light, else increase lightness by 30
    const rgb = hexToRgb(bg);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    let keyBg, textColor, keyBorder;
    if (hsl.l > 55) {
      // light background -> keys slightly darker, text much darker
      keyBg = adjustLightness(bg, -10);
      textColor = adjustLightness(bg, -35);
      keyBorder = adjustLightness(bg, -20);
    } else {
      // dark background -> keys slightly lighter, text lighter (but concentrated)
      keyBg = adjustLightness(bg, 8);
      textColor = adjustLightness(bg, 28);
      keyBorder = adjustLightness(bg, 12);
    }
    container.style.setProperty("--kb-bg", bg);
    container.style.setProperty("--kb-key-bg", keyBg);
    container.style.setProperty("--kb-key-border", keyBorder);
    container.style.setProperty("--kb-text", textColor);
  } else {
    // reset to defaults (let CSS root handle)
    container.style.removeProperty("--kb-bg");
    container.style.removeProperty("--kb-key-bg");
    container.style.removeProperty("--kb-key-border");
    container.style.removeProperty("--kb-text");
  }
}

if (chrome?.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    let shouldRebuild = false;
    for (const k in changes) {
      settings[k] = changes[k].newValue;
      if (["theme","size","translucent","opacity","layout","keysPerRow","showTransliteration","keyboardColor"].includes(k)) shouldRebuild = true;
    }
    if (!settings.showIcon) removeIcon();
    if (keyboardContainer && shouldRebuild) rebuildKeyboard();
  });
}

document.addEventListener("focusin", (e) => {
  try {
    const t = e.target;
    if (!t) return;
    const isInput = (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    if (isInput) {
      targetEl = t;
      if (settings.showIcon) {
        try { showKeyboardIcon(t); } catch (err) {}
      }
      if (settings.autoOpen) openKeyboardForTarget(t);
    }
  } catch (err) {
    console.error("Arabic keyboard (focusin):", err);
  }
});

// Correction: Meilleure gestion du focusout
document.addEventListener("focusout", (e) => {
  if (!keyboardContainer || !settings.closeOnBlur) return;
  
  // Temporisation pour laisser le temps au nouveau focus de s'établir
  setTimeout(() => {
    const activeElement = document.activeElement;
    
    // Ne pas fermer si:
    // 1. Le focus est toujours sur l'élément cible
    // 2. Le focus est sur le clavier lui-même
    // 3. Le focus est sur un élément du clavier
    if (
      activeElement === targetEl ||
      activeElement === keyboardContainer ||
      (keyboardContainer && keyboardContainer.contains(activeElement))
    ) {
      return;
    }
    
    // Fermer le clavier seulement si le focus est vraiment perdu
    removeKeyboard();
  }, 100);
});

function showKeyboardIcon(target) {
  removeIcon();
  if (!target || typeof target.getBoundingClientRect !== "function") return;
  const rect = target.getBoundingClientRect();
  if (!rect) return;
  iconEl = document.createElement("div");
  iconEl.id = "arabic-keyboard-icon";
  iconEl.setAttribute("aria-label", "Open Arabic keyboard");
  iconEl.textContent = "⌨️";
  Object.assign(iconEl.style, {
    position: "absolute",
    left: `${Math.max(8, rect.right + window.scrollX - 28)}px`,
    top: `${Math.max(8, rect.top + window.scrollY - 10)}px`,
    fontSize: "22px",
    background: "#fff",
    border: "1px solid #ccc",
    borderRadius: "6px",
    padding: "4px",
    cursor: "pointer",
    boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
    zIndex: 2147483647,
    userSelect: "none"
  });
  iconEl.addEventListener("click", () => openKeyboardForTarget(target));
  document.body.appendChild(iconEl);
}

function removeIcon() {
  if (iconEl && iconEl.parentNode) iconEl.parentNode.removeChild(iconEl);
  iconEl = null;
}

async function openKeyboardForTarget(target) {
  await loadSettings();
  targetEl = target || targetEl;
  openKeyboard();
}

function openKeyboard() {
  if (document.getElementById("arabic-keyboard-container")) return;

  keyboardContainer = document.createElement("div");
  keyboardContainer.id = "arabic-keyboard-container";
  keyboardContainer.setAttribute("dir", "rtl");
  keyboardContainer.setAttribute("lang", "ar");
  keyboardContainer.className = "";
  if (settings.theme === "dark") keyboardContainer.classList.add("arabic-kb--dark");
  keyboardContainer.classList.add(`arabic-kb--size-${settings.size || "medium"}`);
  if (settings.translucent) keyboardContainer.classList.add("arabic-kb--translucent");
  keyboardContainer.style.opacity = settings.opacity != null ? String(settings.opacity) : "1";

  if (settings.persistPosition) {
    const stored = localStorage.getItem("arabic_kb_pos");
    if (stored) {
      try {
        const pos = JSON.parse(stored);
        keyboardContainer.style.position = "fixed";
        keyboardContainer.style.left = pos.left;
        keyboardContainer.style.top = pos.top;
        keyboardContainer.style.right = "auto";
        keyboardContainer.style.bottom = "auto";
      } catch (err) {}
    } else {
      keyboardContainer.style.bottom = "20px";
      keyboardContainer.style.right = "20px";
    }
  } else {
    keyboardContainer.style.bottom = "20px";
    keyboardContainer.style.right = "20px";
  }

  keyboardContainer.innerHTML = `
    <div class="arabic-kb__header">
      <div style="display:flex;gap:8px;align-items:center">
        <div class="arabic-kb__drag-handle" title="Drag to move">☰</div>
        <strong style="font-size:14px">لوحة المفاتيح العربية</strong>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <button id="arabic-toggle-layout" title="Change layout" style="padding:6px;border-radius:8px;border:1px solid transparent;cursor:pointer">Layout</button>
        <button id="arabic-toggle-translit" title="Toggle transliteration" style="padding:6px;border-radius:8px;border:1px solid transparent;cursor:pointer">${settings.showTransliteration ? "⇄" : "⇆"}</button>
        <button id="arabic-close" title="Close" style="padding:6px;border-radius:8px;border:1px solid transparent;background:none;cursor:pointer">✕</button>
      </div>
    </div>
    <div class="arabic-kb__body">
      <div class="arabic-kb__grid" id="arabic-kb-grid"></div>
    </div>
    <div class="arabic-kb__footer">
      <div style="opacity:0.8">Layout: ${settings.layout}</div>
      <div style="opacity:0.7">Theme: ${settings.theme}</div>
    </div>
  `;

  document.body.appendChild(keyboardContainer);

  // apply dynamic colors if user set keyboardColor
  applyColorVars(keyboardContainer);

  buildKeys();

  keyboardContainer.querySelector("#arabic-close")?.addEventListener("click", removeKeyboard);
  keyboardContainer.querySelector("#arabic-toggle-layout")?.addEventListener("click", () => {
    const order = ["standard", "phonetic", "custom"];
    const idx = order.indexOf(settings.layout);
    const next = order[(idx + 1) % order.length];
    settings.layout = next;
    chrome.storage?.sync?.set?.({ layout: next });
    rebuildKeyboard();
  });
  keyboardContainer.querySelector("#arabic-toggle-translit")?.addEventListener("click", () => {
    settings.showTransliteration = !settings.showTransliteration;
    chrome.storage?.sync?.set?.({ showTransliteration: settings.showTransliteration });
    rebuildKeyboard();
  });

  if (settings.draggable) {
    const handle = keyboardContainer.querySelector(".arabic-kb__drag-handle");
    if (handle) enableDrag(keyboardContainer, handle);
  }

  removeIcon();
}

function buildKeys() {
  if (!keyboardContainer) return;
  const grid = keyboardContainer.querySelector("#arabic-kb-grid");
  if (!grid) return;
  grid.innerHTML = "";

  let keyArray = [];
  if (settings.layout === "standard") keyArray = LAYOUTS.standard;
  else if (settings.layout === "phonetic") keyArray = LAYOUTS.phonetic;
  else if (settings.layout === "custom") {
    keyArray = (settings.customKeys || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (keyArray.length === 0) keyArray = LAYOUTS.standard;
  } else keyArray = LAYOUTS.standard;

  const perRow = Math.max(6, Math.min(14, Number(settings.keysPerRow) || 12));
  grid.style.gridTemplateColumns = `repeat(${perRow}, 1fr)`;
  grid.style.gap = "6px";

  keyArray.forEach(k => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "arabic-kb__key";
    btn.style.userSelect = "none";

    if (k === "␣" || k === " ") {
      btn.textContent = "␣";
      btn.classList.add("arabic-kb__key--space");
    } else if (k === "⌫") {
      btn.textContent = "⌫";
      btn.classList.add("arabic-kb__key--wide");
    } else {
      btn.textContent = k;
    }

    if (settings.showTransliteration) {
      const sub = document.createElement("div");
      sub.className = "arabic-kb__sub";
      sub.textContent = transliterate(k);
      btn.appendChild(sub);
    }

    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      handleKey(k);
    });

    grid.appendChild(btn);
  });
}

function rebuildKeyboard() {
  if (!keyboardContainer) return;
  const saved = {
    left: keyboardContainer.style.left,
    top: keyboardContainer.style.top,
    right: keyboardContainer.style.right,
    bottom: keyboardContainer.style.bottom,
    transform: keyboardContainer.style.transform
  };
  
  // Correction: Utilisation plus sûre de remove()
  const parent = keyboardContainer.parentNode;
  if (parent) {
    parent.removeChild(keyboardContainer);
  }
  
  keyboardContainer = null;
  openKeyboard();
  
  // Restaurer la position
  if (saved.left) keyboardContainer.style.left = saved.left;
  if (saved.top) keyboardContainer.style.top = saved.top;
  if (saved.right) keyboardContainer.style.right = saved.right;
  if (saved.bottom) keyboardContainer.style.bottom = saved.bottom;
  if (saved.transform) keyboardContainer.style.transform = saved.transform;
}

function removeKeyboard() {
  if (keyboardContainer && keyboardContainer.parentNode) {
    keyboardContainer.parentNode.removeChild(keyboardContainer);
  }
  keyboardContainer = null;
}

function handleKey(k) {
  if (!k) return;
  if (k === "⌫") {
    if (targetEl && targetEl.isContentEditable) {
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const r = sel.getRangeAt(0);
      r.setStart(r.startContainer, Math.max(0, r.startOffset - 1));
      r.deleteContents();
      targetEl.dispatchEvent(new Event("input", { bubbles: true }));
      targetEl.focus();
    } else if (targetEl && typeof targetEl.selectionStart === "number") {
      const start = targetEl.selectionStart, end = targetEl.selectionEnd;
      if (start === end && start > 0) {
        targetEl.value = targetEl.value.slice(0, start - 1) + targetEl.value.slice(end);
        const pos = start - 1;
        targetEl.selectionStart = targetEl.selectionEnd = pos;
        targetEl.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        targetEl.value = targetEl.value.slice(0, start) + targetEl.value.slice(end);
        targetEl.selectionStart = targetEl.selectionEnd = start;
        targetEl.dispatchEvent(new Event("input", { bubbles: true }));
      }
      targetEl.focus();
    }
    return;
  }

  const text = (k === "␣" || k === " ") ? " " : k;
  insertAtCaret(targetEl, text);
}

function insertAtCaret(el, text) {
  if (!text) return;
  if (el && el.isContentEditable) {
    const sel = window.getSelection();
    if (!sel.rangeCount) {
      el.appendChild(document.createTextNode(text));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
  } else if (el && typeof el.selectionStart === "number") {
    const start = el.selectionStart, end = el.selectionEnd;
    const val = el.value || "";
    el.value = val.slice(0, start) + text + val.slice(end);
    const pos = start + text.length;
    el.selectionStart = el.selectionEnd = pos;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
  } else if (el) {
    el.value = (el.value || "") + text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
  } else {
    console.warn("Arabic keyboard: no focused field to insert into. Focus a field then press keys.");
  }
}

function transliterate(k) {
  const map = {
    "ض":"ḍ","ص":"ṣ","ث":"th","ق":"q","ف":"f","غ":"gh","ع":"ʿ","ه":"h","خ":"kh","ح":"ḥ","ج":"j","د":"d",
    "ش":"sh","س":"s","ي":"y","ب":"b","ل":"l","ا":"a","ت":"t","ن":"n","م":"m","ك":"k","ط":"ṭ",
    "ئ":"ʼ","ء":"ʼ","ؤ":"ʼ","ر":"r","لا":"la","ى":"á","ة":"h","و":"w","ز":"z","ظ":"ẓ"," ":"␣"
  };
  return map[k] || k;
}

function enableDrag(container, handle) {
  let dragging = false;
  let startX = 0, startY = 0, startLeft = 0, startTop = 0;

  function onMouseDown(e) {
    if (e.button !== 0) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = container.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    e.preventDefault();
  }
  function onMouseMove(e) {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    let left = startLeft + dx;
    let top = startTop + dy;
    left = Math.min(window.innerWidth - container.offsetWidth - 8, Math.max(8, left));
    top = Math.min(window.innerHeight - container.offsetHeight - 8, Math.max(8, top));
    container.style.left = `${left}px`;
    container.style.top = `${top}px`;
    container.style.right = "auto";
    container.style.bottom = "auto";
    container.style.position = "fixed";
  }
  function onMouseUp() {
    if (!dragging) return;
    dragging = false;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    if (settings.persistPosition) {
      try {
        localStorage.setItem("arabic_kb_pos", JSON.stringify({ left: container.style.left, top: container.style.top }));
      } catch (err) {}
    }
  }

  handle.addEventListener("mousedown", onMouseDown);
}

loadSettings().then(() => {
  const active = document.activeElement;
  if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) {
    targetEl = active;
    if (settings.showIcon) {
      try { showKeyboardIcon(active); } catch (err) {}
    }
    if (settings.autoOpen) openKeyboardForTarget(active);
  }
});

if (chrome && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.action === "openKeyboard") {
      loadSettings().then(() => {
        openKeyboard();
        sendResponse && sendResponse({ ok: true });
      });
      return true;
    }
  });
}