'use strict';

// ----------------- Default Preference --------------------
let pref = {
  autoUpdateInterval: 0,
  autoUpdateLast: 0,
  content: {},
  counter: true,
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
  
  static importExport(callback) {
    this.callback = callback;
    document.getElementById('file').addEventListener('change', this.import);
    document.getElementById('export').addEventListener('click', this.export);
  }

  static import(e) {

    const file = e.target.files[0];
    switch (true) {

      case !file: Util.notify(chrome.i18n.getMessage('error')); return;
      case !['text/plain', 'application/json'].includes(file.type): // check file MIME type
        Util.notify(chrome.i18n.getMessage('errorType'));
        return;
    }

    const reader  = new FileReader();
    reader.onloadend = () => Pref.readData(reader.result);
    reader.onerror = () => Util.notify(chrome.i18n.getMessage('errorRead'));
    reader.readAsText(file);
  }

  static readData(data) {

    let importData;
    try { importData = JSON.parse(data); }                  // Parse JSON
    catch(e) {
      Util.notify(chrome.i18n.getMessage('errorParse'));    // display the error
      return;
    }

    Object.keys(pref).forEach(item =>
      importData.hasOwnProperty(item) && (pref[item] = importData[item])); // update pref with the saved version
    
    this.callback();                                        // successful import
  }

  static export() {

    const data = JSON.stringify(pref, null, 2);
    const blob = new Blob([data], {type : 'text/plain;charset=utf-8'});
    const filename = chrome.i18n.getMessage('extensionName') + '_' + new Date().toISOString().substring(0, 10) + '.json';

    chrome.downloads.download({
      url: URL.createObjectURL(blob),
      filename,
      saveAs: true,
      conflictAction: 'uniquify'
    });
  }
}
// ----------------- /User Preference ----------------------

// ----------------- Helper functions ----------------------
class Util {
  // --- Internationalization
  static i18n() {
    document.querySelectorAll('[data-i18n]').forEach(node => {
      let [text, attr] = node.dataset.i18n.split('|');
      text = chrome.i18n.getMessage(text);
      attr ? node[attr] = text : node.appendChild(document.createTextNode(text));
    });
  }
  
  static notify(message, title = chrome.i18n.getMessage('extensionName'), id = '') {

    chrome.notifications.create(id, {
      type: 'basic',
      iconUrl: 'image/icon.svg',
      title,
      message
    });
  }
}
// ----------------- /Helper functions ----------------------