'use strict';

// ----------------- Default Preference --------------------
let pref = {
  autoUpdateInterval: 0,
  autoUpdateLast: 0,
  content: {},
  globalScriptExcludeMatches: '',
  sync: false,
  template: { css: '', js: '' }
};
// ----------------- /Default Preference -------------------

// ----------------- User Preference -----------------------
class Pref {

  static get() {
    // update pref with the saved version
    return browser.storage.local.get().then(result =>
      Object.keys(result).forEach(item => pref[item] = result[item]));
  }
}
// ----------------- /User Preference ----------------------

// ----------------- Internationalization ------------------
class I18N {

  static get() {
    document.querySelectorAll('[data-i18n]').forEach(node => {
      let [text, attr] = node.dataset.i18n.split('|');
      text = chrome.i18n.getMessage(text);
      attr ? node[attr] = text : node.appendChild(document.createTextNode(text));
    });
  }
}
// ----------------- /Internationalization -----------------

// ----------------- Helper functions ----------------------
function notify(message, title = chrome.i18n.getMessage('extensionName'), id = '') {

  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: 'image/icon.svg',
    title,
    message
  });
}
// ----------------- /Helper functions ---------------------