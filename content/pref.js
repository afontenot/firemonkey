'use strict';

// ----------------- User Preference -----------------------
let pref = {                                                // global default
  autoUpdateInterval: 0,
  autoUpdateLast: 0,
  content: {},
  globalScriptExcludeMatches: '',
  sync: false,
  template: { css: '', js: '' }
};

class Pref {

  constructor() {
    // update pref with the saved version
    return browser.storage.local.get().then(result =>
      Object.keys(result).forEach(item => pref[item] = result[item]));
  }
}
// ----------------- /User Preference ----------------------

// ----------------- Internationalization ------------------
class I18N {

  constructor() {
    document.querySelectorAll('[data-i18n]').forEach(node => {
      let [text, attr] = node.dataset.i18n.split('|');
      text = chrome.i18n.getMessage(text);
      attr ? node[attr] = text : node.appendChild(document.createTextNode(text));
    });
  }
}
// ----------------- /Internationalization -----------------