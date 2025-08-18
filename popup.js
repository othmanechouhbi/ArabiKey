// popup.js — manages the settings UI in popup.html
const DEFAULTS = {
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
  customKeys: ""
};

function $(id){ return document.getElementById(id); }

function load() {
  chrome.storage.sync.get(Object.keys(DEFAULTS), (items) => {
    const s = { ...DEFAULTS, ...items };
    $("theme").value = s.theme;
    $("size").value = s.size;
    $("opacity").value = s.opacity;
    $("opacityVal").textContent = s.opacity;
    $("translucent").checked = !!s.translucent;
    $("draggable").checked = !!s.draggable;
    $("showIcon").checked = !!s.showIcon;
    $("autoOpen").checked = !!s.autoOpen;
    $("persistPosition").checked = !!s.persistPosition;
    $("closeOnBlur").checked = !!s.closeOnBlur;
    $("layout").value = s.layout;
    $("keysPerRow").value = s.keysPerRow || 12;
    $("showTransliteration").checked = !!s.showTransliteration;
    $("customKeys").value = s.customKeys || "";
  });
}

function save() {
  const toSave = {
    theme: $("theme").value,
    size: $("size").value,
    opacity: Number($("opacity").value),
    translucent: !!$("translucent").checked,
    draggable: !!$("draggable").checked,
    showIcon: !!$("showIcon").checked,
    autoOpen: !!$("autoOpen").checked,
    persistPosition: !!$("persistPosition").checked,
    closeOnBlur: !!$("closeOnBlur").checked,
    layout: $("layout").value,
    keysPerRow: Number($("keysPerRow").value) || 12,
    showTransliteration: !!$("showTransliteration").checked,
    customKeys: $("customKeys").value
  };
  chrome.storage.sync.set(toSave, () => {
    // simple feedback: close popup so changes propagate
    window.close();
  });
}

function reset() {
  chrome.storage.sync.clear(() => {
    chrome.storage.sync.set(DEFAULTS, () => {
      load();
    });
  });
}

function openKeyboardInActiveTab() {
  // send a message to the active tab's content script to open the keyboard
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0]) return;
    const tabId = tabs[0].id;
    if (typeof chrome.tabs.sendMessage === "function") {
      chrome.tabs.sendMessage(tabId, { action: "openKeyboard" }, (resp) => {
        // ignore response; popup will close
      });
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  load();
  $("save").addEventListener("click", save);
  $("reset").addEventListener("click", reset);
  $("openKeyboard").addEventListener("click", () => {
    // send message to active tab to open keyboard, then close popup
    openKeyboardInActiveTab();
    window.close();
  });
  $("opacity").addEventListener("input", (e) => {
    $("opacityVal").textContent = e.target.value;
  });
});