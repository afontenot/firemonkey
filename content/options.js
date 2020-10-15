'use strict';

// ----------------- Internationalization ------------------
Util.i18n();

// ----------------- User Preference -----------------------
Pref.get().then(() => {
  options.process();
  script.process();
});
// ----------------- /User Preference ----------------------

// ----------------- Options -------------------------------
class Options {

  constructor(keys) {
    this.prefNode = document.querySelectorAll(keys || '#'+Object.keys(pref).join(',#')); // defaults to pref keys
    document.querySelector('button[type="submit"]').addEventListener('click', () => this.check()); // submit button
    this.pBar = document.querySelector('.progressBar');

    this.globalScriptExcludeMatches = document.querySelector('#globalScriptExcludeMatches');

    // --- from browser pop-up & contextmenu (not in Private Window)
    window.addEventListener('storage', (e) => e.key === 'nav' && this.getNav(e.newValue));
  }

  process(save) {
    // 'save' is ony set when clicking the button to save options
    this.prefNode.forEach(node => {
      // value: 'select-one', 'textarea', 'text', 'number'
      const attr = node.type === 'checkbox' ? 'checked' : 'value';
      save ? pref[node.id] = node[attr] : node[attr] = pref[node.id];
    });

    save && chrome.storage.local.set(pref);                 // update saved pref
  }

  progressBar() {
    this.pBar.classList.toggle('on');
    setTimeout(() => { this.pBar.classList.toggle('on'); }, 2000);
  }

  check() {

    // --- check Global Script Exclude Matches
    if(!Pattern.validate(this.globalScriptExcludeMatches)) { return; }

    // --- progress bar
    this.progressBar();

    // --- save options
    this.process(true);

    // --- process Syntax Highlight
    highlight.process();
  }

  getNav(nav) {

    nav = nav || localStorage.getItem('nav');
    localStorage.removeItem('nav');
    if (!nav) { return; }                                   // end execution if not found

    switch (nav) {

      case 'help':
        document.getElementById('nav1').checked = true;
        break;

      case 'log':
        document.getElementById('nav5').checked = true;
        break;

      case 'js':
      case 'css':
        document.getElementById('nav4').checked = true;
        script.newScript(nav);
        break;

      default:
        document.getElementById(nav).click();
    }
  }
}
const options = new Options('#autoUpdateInterval, #globalScriptExcludeMatches, #sync, #counter');
// ----------------- /Options ------------------------------

// ----------------- Scripts -------------------------------
class Script {

  constructor() {
    // class RemoteUpdate in common.js
    RU.callback = this.processResponse.bind(this);

    this.liTemplate = document.querySelector('nav li.template');
    this.legend = document.querySelector('.script legend');
    const box = document.querySelector('.script .box');
    this.box = box;

    const textBox = box.nextElementSibling;
    textBox.value = '';                                     // Browser retains textarea content on refresh
    this.textBox = textBox;

    this.enable = document.querySelector('#enable');
    this.enable.addEventListener('change', () => this.toggleEnable());

    this.autoUpdate = document.querySelector('#autoUpdate');
    this.autoUpdate.addEventListener('change', () => this.toggleAutoUpdate());

    this.userMatches = document.querySelector('#userMatches');
    this.userExcludeMatches = document.querySelector('#userExcludeMatches');

    // --- Theme
    const script = document.querySelector('.script');
    const dark = document.querySelector('#dark');
    const isDark = localStorage.getItem('dark') === 'true'; // defaults to false
    script.classList.toggle('dark', isDark);
    dark.checked = isDark;
    dark.addEventListener('change', function() {
      localStorage.setItem('dark', this.checked);
      script.classList.toggle('dark', this.checked);
    });

    // --- Syntax Highlighter
    const footer = document.querySelector('footer');
    const doSyntax = localStorage.getItem('syntax') !== 'false'; // defaults to true
    box.classList.toggle('syntax', doSyntax);
    syntax.checked = doSyntax;
    syntax.addEventListener('change', function() {
      localStorage.setItem('syntax', this.checked);
      box.classList.toggle('syntax', this.checked);

      if (this.checked && textBox.value.trim()) {
        box.textContent = textBox.value;
        textBox.value = '';
        highlight.process();
      }
      else {
        textBox.value = box.textContent;
        box.textContent = '';
        footer.textContent = '';
      }
    });

    highlight.init(box, this.legend, footer);


    document.querySelectorAll('.script button[type="button"][data-i18n], nav button[type="button"][data-i18n]').forEach(item =>
      item.addEventListener('click', e => this.processButtons(e)));

    document.querySelector('.script .bin').addEventListener('click', () => this.deleteScript());

    window.addEventListener('beforeunload', () => this.unsavedChanges() && event.preventDefault());


    this.template = {
      js:
`/*
==UserScript==
@name
@match
@version          1.0
==/UserScript==
*/`,

      css:
`/*
==UserCSS==
@name
@match
@version          1.0
@run-at           document-start
==/UserCSS==
*/`
};


    // --- Import/Export Script
    document.getElementById('fileScript').addEventListener('change', (e) => this.processFileSelect(e));

    // --- menu dropdown
    this.closePopup = this.closePopup.bind(this);
    this.details = document.querySelector('.menu details');
    this.details.addEventListener('toggle', () =>
      this.details.open ? document.body.addEventListener('click', this.closePopup) :
        document.body.removeEventListener('click', this.closePopup)
    );
  }

  closePopup(e) {
    !this.details.contains(e.explicitOriginalTarget) && (this.details.open = false);
  }

  processButtons(e) {

    switch (e.target.dataset.i18n) {

      case 'saveScript': this.saveScript(); break;
      case 'update': this.updateScript(); break;
      case 'newJS|title': this.newScript('js'); break;
      case 'newCSS|title': this.newScript('css'); break;
      case 'saveTemplate': this.saveTemplate(); break;
      case 'exportScript': this.exportScript(); break;
      case 'exportAllScript': this.exportAllScript(); break;
    }
  }

  newScript(type) {

    const box = this.box;
    const legend = this.legend;
    const textBox = this.textBox;

    box.classList.remove('invalid');
    textBox.classList.remove('invalid');
    const last = document.querySelector('nav li.on');
    last && last.classList.remove('on');
    if(this.unsavedChanges()) { return; }
    box.id = '';
    legend.textContent = '';
    legend.className = type;
    legend.textContent = chrome.i18n.getMessage(type === 'js' ? 'newJS' : 'newCSS');

    const text = pref.template[type] || this.template[type];
    box.classList.contains('syntax') ? box.textContent = text : textBox.value = text;
    highlight.process();
  }

  saveTemplate() {

    const box = this.box;

    const text = box.classList.contains('syntax') ? box.textContent : this.textBox.value;
    const metaData = text.match(Meta.regEx);

    if (!metaData) { Util.notify(chrome.i18n.getMessage('errorMeta')); return; }
    const type = metaData[1].toLowerCase() === 'userscript' ? 'js' : 'css';
    pref.template[type] = text.trimStart();
    browser.storage.local.set({template: pref.template});   // update saved pref
  }

  process() {

    const box = this.box;

    // --- clear data
    while (this.liTemplate.parentNode.children[1]) { this.liTemplate.parentNode.children[1].remove(); }

    Object.keys(pref.content).sort(Intl.Collator().compare).forEach(item => this.addScript(pref.content[item]));

    if (box.id) {                                           // refresh previously loaded content

      box.textContent = '';
      document.getElementById(box.id).click();
    }
    options.getNav();                                       // run after scripts are loaded
  }

  addScript(item) {

    const li = this.liTemplate.cloneNode(true);
    li.classList.remove('template');
    li.classList.add(item.js ? 'js' : 'css');
    item.enabled || li.classList.add('disabled');
    item.error && li.classList.add('error');
    li.textContent = item.name;
    li.id = item.name;
    this.liTemplate.parentNode.appendChild(li);
    li.addEventListener('click', e => this.showScript(e));
  }

  showScript(e) {

    const box = this.box;
    const legend = this.legend;
    const textBox = this.textBox;
    const enable = this.enable;
    const autoUpdate = this.autoUpdate;
    const li = e.target;

    // --- if showing another page
    document.getElementById('nav4').checked = true;

    if(this.unsavedChanges()) { return; }

    // --- reset
    [box, textBox, this.userMatches, this.userExcludeMatches].forEach(item => item.classList.remove('invalid'));

    const last = document.querySelector('nav li.on');
    last && last.classList.remove('on');
    li.classList.add('on');

    const id = li.id;
    box.id = id;
    legend.textContent = '';
    legend.className = li.classList.contains('js') ? 'js' : 'css';
    legend.textContent = id;
    enable.checked = pref.content[id].enabled;
    autoUpdate.checked = pref.content[id].autoUpdate;

    const text = pref.content[id].js || pref.content[id].css;
    box.classList.contains('syntax') ? box.textContent = text : textBox.value = text;
    highlight.process();


    if (pref.content[id].error) {
      box.classList.add('invalid');
      textBox.classList.add('invalid');
      Util.notify(pref.content[id].error, id);
    }

    this.userMatches.value = pref.content[id].userMatches || '';
    this.userExcludeMatches.value = pref.content[id].userExcludeMatches || '';
  }

  noSpace(str) {

    return str.replace(/\s+/g, '');
  }

  unsavedChanges() {

    const box = this.box;

    const text = this.noSpace(box.classList.contains('syntax') ? box.textContent : this.textBox.value);
    switch (true) {

      case !text:
      case !box.id && text === this.noSpace(pref.template.js || this.template.js):
      case !box.id && text === this.noSpace(pref.template.css || this.template.css):
      case  box.id && text === this.noSpace(pref.content[box.id].js + pref.content[box.id].css) &&
              this.userMatches.value.trim() === (pref.content[box.id].userMatches || '') &&
              this.userExcludeMatches.value.trim() === (pref.content[box.id].userExcludeMatches || ''):

        return false;

      default:
        return !confirm(chrome.i18n.getMessage('discardConfirm'));
    }
  }

  toggleEnable() {

    const box = this.box;
    const enable = this.enable;

    // --- multi toggle
    if (window.getSelection().toString().trim()) {

      const li = this.getMulti();
      if (li[0]) {

        li.forEach(item => {

          const id = item.id;
          pref.content[id].enabled = enable.checked;
          item.classList.toggle('disabled', !enable.checked);
        });

        browser.storage.local.set({content: pref.content}); // update saved pref
        return;
      }
    }

    if (!box.id) { return; }

    const id = box.id;
    pref.content[id].enabled = enable.checked;
    const last = document.querySelector('nav li.on');
    last && last.classList.toggle('disabled', !enable.checked);

    browser.storage.local.set({content: pref.content});     // update saved pref
  }

  toggleAutoUpdate() {

    const box = this.box;
    const autoUpdate = this.autoUpdate;

    if (!box.id) { return; }

    const id = box.id;
    const canUpdate = pref.content[id].updateURL && pref.content[id].version;
    pref.content[id].autoUpdate = canUpdate ? autoUpdate.checked : false;
    if (!canUpdate) {
      Util.notify(chrome.i18n.getMessage('errorUpdate'));
      autoUpdate.checked = false;
      return;
    }

    browser.storage.local.set({content: pref.content});     // update saved pref
  }

  getMulti() {

    // --- fitler the visible items in the selection only
    const sel = window.getSelection();
    if (!sel.toString().trim()) { return []; }
    return [...document.querySelectorAll('li.js, li.css')].filter(item =>
            sel.containsNode(item, true) && window.getComputedStyle(item).display !== 'none');
  }

  async deleteScript() {

    const box = this.box;
    const legend = this.legend;

    const li = this.getMulti();
    if (li[0] ? !confirm(chrome.i18n.getMessage('deleteMultiConfirm', li.length)) :
                !confirm(chrome.i18n.getMessage('deleteConfirm', box.id))) { return; }

    const deleted = [];


    // --- multi delete
    if (li[0]) {

      li.forEach(item => {

        const id = item.id;
        item.remove();                                      // remove from menu list
        delete pref.content[id];
        deleted.push(id);
      });
    }
    // --- single delete
    else {

      if (!box.id) { return; }
      const id = box.id;

      // --- remove from menu list
      const li = document.getElementById(id);
      li && li.remove();
      delete pref.content[id];
      deleted.push(id);
    }

    // --- reset box
    legend.className = '';
    legend.textContent = chrome.i18n.getMessage('script');
    box.id = '';
    box.textContent = '';

    // --- delete script storage
    await browser.storage.local.remove(deleted.map(name => '_' + name));

    browser.storage.local.set({content: pref.content});     // update saved pref
  }

  async saveScript() {

    const box = this.box;
    const legend = this.legend;
    const textBox = this.textBox;

    // --- reset
    box.classList.remove('invalid');
    textBox.classList.remove('invalid');

    // --- check User Matches User Exclude Matches
    if(!Pattern.validate(this.userMatches)) { return; }
    if(!Pattern.validate(this.userExcludeMatches)) { return; }

    // --- chcek meta data
    let text;
    if (box.classList.contains('syntax')) {
      const nl = /\r\n/.test(box.textContent) ? '\r\n' : '\n';
      box.querySelectorAll('br').forEach(item => item.replaceWith(nl));
      text = box.textContent.trim().replace(new RegExp(String.fromCharCode(160), 'g'), nl);
    }
    else {text = textBox.value; }

    const data = Meta.get(text.trim(), this.userMatches.value, this.userExcludeMatches.value);
    if (!data) { throw 'Meta Data Error'; }
    else if (data.error) {
      box.classList.add('invalid');
      Util.notify(chrome.i18n.getMessage('errorMeta'));
      return;
    }

    // --- check name
    if (!data.name) {
      Util.notify(chrome.i18n.getMessage('errorNoName'));
      return;
    }
    if (data.name !== box.id && pref.content[data.name] &&
              !confirm(chrome.i18n.getMessage('errorName'))) { return; }

    // --- check matches
    if (!data.matches[0] && !data.includeGlobs[0] && !data.style[0]) {
      data.enabled = false;                                 // allow no matches but disable
  /*
      box.classList.add('invalid');
      Util.notify(chrome.i18n.getMessage('errorMatches'));
      return;
  */
    }

    // --- check for Web Install, set install URL
    if (!data.updateURL && pref.content[data.name] &&
        (pref.content[data.name].updateURL.startsWith('https://greasyfork.org/scripts/') ||
          pref.content[data.name].updateURL.startsWith('https://openuserjs.org/install/')) ) {
      data.updateURL = pref.content[data.name].updateURL;
      data.autoUpdate = true;
    }


    pref.content[data.name] = data;                         // save to pref

    switch (true) {

      // --- new script
      case !box.id:
        this.addScript(data);
        break;

      // --- update new name
      case data.name !== box.id:
        // remove old registers
        const oldName = box.id;
        delete pref.content[oldName];
        if (pref.hasOwnProperty('_' + oldName)) {           // move script storage

          pref['_' + data.name] = pref['_' + oldName];
          await browser.storage.local.remove('_' + oldName);
        }

        // update old one in menu list & legend
        const li = document.querySelector('nav li.on');
        li.textContent = data.name;
        li.id = data.name;
        break;
    }

    box.id = data.name;
    legend.textContent = data.name;

    browser.storage.local.set({content: pref.content});     // update saved pref

    // --- progress bar
    options.progressBar();
  }

  // --- Remote Update
  updateScript() {                                          // manual update, also for disabled and disabled autoUpdate

    const box = this.box;
    if (!box.id) { return; }

    const id = box.id;

    if (!pref.content[id].updateURL || !pref.content[id].version) {
      Util.notify(chrome.i18n.getMessage('errorUpdate'));
      return;
    }

    RU.getUpdate(pref.content[id], true);                   // to class RemoteUpdate in common.js
  }

  async processResponse(text, name) {                       // from class RemoteUpdate in common.js

    const data = Meta.get(text);
    if (!data) { throw `${name}: Update Meta Data error`; }

    // --- check version
    if (!RU.higherVersion(data.version, pref.content[name].version)) {
      Util.notify(chrome.i18n.getMessage('noNewUpdate'), name);
      return;
    }

    // --- update from previous version
    data.enabled = pref.content[name].enabled;
    data.autoUpdate = pref.content[name].autoUpdate;

    // --- check name
    if (data.name !== name) {                               // name has changed

      if (pref.content[data.name]) { throw `${name}: Update new name already exists`; } // name already exists
      else {
        const oldName = name;
        delete pref.content[oldName];
        if (pref.hasOwnProperty('_' + oldName)) {           // move script storage

          pref['_' + data.name] = pref['_' + oldName];
          await browser.storage.local.remove('_' + oldName);
        }
      }
    }

    Util.notify(chrome.i18n.getMessage('scriptUpdated', data.version), name);
    pref.content[data.name] = data;                         // save to pref
    browser.storage.local.set({content: pref.content});     // update saved pref

    this.process();                                         // update page display
    const on = document.getElementById(data.name);
    on && on.click();                                       // reload the new script
  }

  // ----------------- Import Script -----------------------
  processFileSelect(e) {

    // --- check for Stylus import
    if (e.target.files[0].type === 'application/json') {
      this.processFileSelectStylus(e);
      return;
    }

    this.fileLength = e.target.files.length;

    [...e.target.files].forEach(file => {

      switch (true) {

        case !file: Util.notify(chrome.i18n.getMessage('error')); return;
        case !['text/css', 'application/x-javascript'].includes(file.type): // check file MIME type CSS/JS
          Util.notify(chrome.i18n.getMessage('errorType'));
          return;
      }

      const reader  = new FileReader();
      reader.onloadend = () => script.readDataScript(reader.result);
      reader.onerror = () => Util.notify(chrome.i18n.getMessage('errorRead'));
      reader.readAsText(file);
    });
  }

  readDataScript(text) {

    // --- chcek meta data
    const data = Meta.get(text);
    if (!data) { throw 'Meta Data Error'; }
    else if (data.error) {
      Util.notify(chrome.i18n.getMessage('errorMeta'));
      return;
    }

    // --- check name
    if (pref.content[data.name]) {

      const dataType = data.js ? 'js' : 'css';
      const targetType = pref.content[data.name].js ? 'js' : 'css';
      if (dataType !== targetType) { // same name exist in another type
        data.name += ` (${dataType})`;
        if (pref.content[data.name]) { throw `${data.name}: Update new name already exists`; } // name already exists
      }

      // --- update/import from previous version
      data.enabled = pref.content[data.name].enabled;
      data.autoUpdate = pref.content[data.name].autoUpdate;
      data.userMatches = pref.content[data.name].userMatches;
      data.userExcludeMatches = pref.content[data.name].userExcludeMatches;
    }

    pref.content[data.name] = data;                           // save to pref
    this.fileLength--;                                        // one less file to process
    if(this.fileLength) { return; }                           // not 0 yet

    this.process();                                     // update page display
    browser.storage.local.set({content: pref.content});       // update saved pref
  }
  // ----------------- /Import Script ----------------------

  // ----------------- Import Stylus -----------------------
  processFileSelectStylus(e) {

    const file = e.target.files[0];

    const reader  = new FileReader();
    reader.onloadend = () => script.prepareStylus(reader.result);
    reader.onerror = () => Util.notify(chrome.i18n.getMessage('errorRead'));
    reader.readAsText(file);
  }

  prepareStylus(data) {

    let importData;
    try { importData = JSON.parse(data); }                    // Parse JSON
    catch(e) {
      Util.notify(chrome.i18n.getMessage('errorParse'));           // display the error
      return;
    }

    importData.forEach(item => {

      // --- test validity
      if (!item.name || !item.id || !item.sections) {
        Util.notify(chrome.i18n.getMessage('error'));
        return;
      }

      const updateUrl = item.updateUrl || '';               // new Stylus "updateUrl": null, | old Stylus "updateUrl": "",

      // rebuild UserStyle
      let text =
`/*
==UserStyle==
@name           ${item.name}
@updateURL      ${updateUrl}
@run-at         document-start
==/UserStyle==
*/`;

      item.sections.forEach(sec => {

        const r = [];
        sec.urls && sec.urls.forEach(i => r.push(`url('${i}')`));
        sec.urlPrefixes && sec.urlPrefixes.forEach(i => r.push(`url-prefix('${i}')`));
        sec.domains && sec.domains.forEach(i => r.push(`domain('${i}')`));
        sec.regexps && sec.regexps.forEach(i => r.push(`regexp('${i}')`));

        r[0] && (text += '\n\n@-moz-document ' + r.join(', ') +' {\n  ' + sec.code + '\n}');
      });

      const data = Meta.get(text);
      data.enabled = item.enabled;
      if (pref.content[data.name]) { data.name += ' (Stylus)'; }
      pref.content[data.name] = data;                       // save to pref
    });

    this.process();                                         // update page display
    browser.storage.local.set({content: pref.content});     // update saved pref
  }
  // ----------------- /Import Stylus ----------------------

  // ----------------- Export ------------------------------
  exportScript() {

    const box = this.box;
    if (!box.id) { return; }

    const id = box.id;
    const ext = pref.content[id].js ? '.js' : '.css';
    const data = pref.content[id].js || pref.content[id].css;
    this.export(data, ext, id);
  }

  exportAllScript() {

    Object.keys(pref.content).forEach(id => {

      const ext = pref.content[id].js ? '.js' : '.css';
      const data = pref.content[id].js || pref.content[id].css;
      this.export(data, ext, id, 'FireMonkey/', false);
    });
  }

  export(data, ext, id, folder = '', saveAs = true) {

    const blob = new Blob([data], {type : 'text/plain;charset=utf-8'});
    const filename = folder + id.replace(/[<>:"/\\|?*]/g, '') + '.user' + ext; // removing disallowed characters

    chrome.downloads.download({
      url: URL.createObjectURL(blob),
      filename,
      saveAs,
      conflictAction: 'uniquify'
    });
  }



}
const script = new Script();

// ----------------- Import/Export Preferences -------------
Pref.importExport(() => {

  options.process();                                        // set options after the pref update
  script.process();                                         // update page display
  chrome.storage.local.set(pref);                           // update saved pref
});
// ----------------- /Import/Export Preferences ------------

// ----------------- Match Pattern Tester ------------------
class Pattern {

  static validate(node) {

    node.classList.remove('invalid');
    node.value = node.value.trim();

    if (!node.value) { return true; }                       // emtpy

    for (const item of node.value.split(/\s+/)) {           // use for loop to be able to break

      const error = this.check(item.toLowerCase());
      if (error) {
        node.classList.add('invalid');
        Util.notify(`${item}\n${error}`);
        return false;                                       // end execution
      }
    }
    return true;
  }

  static check(pattern) {

    const [scheme, host, path] = pattern.split(/:\/{2,3}|\/+/);

    // --- specific patterns
    switch (pattern) {

      case '*': return 'Invalid Pattern';

      case '<all_urls>':
      case '*://*/*':
      case 'http://*/*':
      case 'https://*/*':
        return false;
    }

    // --- other patterns
    switch (true) {

      case !['http', 'https', 'file', '*'].includes(scheme.toLowerCase()): return 'Unsupported scheme';
      case scheme === 'file' && !pattern.startsWith('file:///'): return 'file:/// must have 3 slashes';
      case scheme !== 'file' && host.includes(':'): return 'Host must not include a port number';
      case scheme !== 'file' && !path && host === '*': return 'Empty path: this should be "*://*/*"';
      case scheme !== 'file' && !path && !pattern.endsWith('/'): return 'Pattern must include trailing slash';
      case scheme !== 'file' && host[0] === '*' && host[1] !== '.': return '"*" in host must be the only character or be followed by "."'
      case host.substring(1).includes('*'): return '"*" in host must be at the start';
    }
    return false;
  }
}
// ----------------- /Match Pattern Tester -----------------

// ----------------- Log -----------------------------------
class LogDisply {
  
  constructor() {
    this.log = localStorage.getItem('log') || '';
    try { this.log = JSON.parse(this.log); } catch (e) { this.log = []; }
    this.log[0] && this.process();
  } 
  
  process() {
    
    const trTemp = document.querySelector('.log tr.template');
    const tbody = trTemp.parentNode.nextElementSibling;
    this.log.reverse().forEach(([time, ref, message, error]) => {
      
      const tr = trTemp.cloneNode(true);
      tr.classList.remove('template');
      error && tr.classList.add('error');
      const td = tr.children;
      td[0].textContent = time;
      td[1].title = ref;
      td[1].textContent = ref;
      td[2].textContent = message;
      tbody.appendChild(tr);  
    });
  }
}
new LogDisply();
// ---------------- /Log ----------------------------------