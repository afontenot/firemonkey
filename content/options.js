import {pref, App, Meta, RemoteUpdate} from './app.js';
const RU = new RemoteUpdate();

// ----------------- Internationalization ------------------
App.i18n();

// ----------------- User Preference -----------------------
App.getPref().then(() => {
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
    window.addEventListener('storage', (e) => {
      if (e.key === 'nav') { this.getNav(e.newValue); }
      else if (e.key === 'log') { showLog.update(e.newValue); }
    });
    
    // --- add custom style
    document.querySelector('style').textContent = pref.customCSS;
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
    
    // Custom CodeMirror Options
    const allowed = {
      indentWithTabs: false,
      indentUnit: 4,
      tabSize: 4,
      lint: {
        curly: true,
        devel: true,
        eqeqeq: true,
        freeze: true,
        latedef: 'nofunc',
        leanswitch: true,
        maxerr: 100,
        noarg: true,
        nonbsp: true,
        undef: true,
        unused: true,
        varstmt: true
      }
    };
    const cmOptionsNode = document.querySelector('#cmOptions');
    cmOptionsNode.value = cmOptionsNode.value.trim();
    if (cmOptionsNode.value) {
      let cmOptions = App.JSONparse(cmOptionsNode.value);
      if (!cmOptions) { 
        App.notify(chrome.i18n.getMessage('cmOptionsError')) ;
        return;
      }
      Object.keys(cmOptions).forEach(item => !allowed.hasOwnProperty(item) && delete cmOptions[item]);
      cmOptions.lint && Object.keys(cmOptions.lint).forEach(item => !allowed.lint.hasOwnProperty(item) && delete cmOptions.lint[item]);
      cmOptionsNode.value = JSON.stringify(cmOptions, null, 2); // reset value with allowed options    
    }
    // --- progress bar
    this.progressBar();

    // --- save options
    this.process(true);
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
const options = new Options('#autoUpdateInterval, #globalScriptExcludeMatches, #sync, #counter, #customCSS, #cmOptions');
// ----------------- /Options ------------------------------

// ----------------- Scripts -------------------------------
class Script {

  constructor() {
    // class RemoteUpdate in common.js
    RU.callback = this.processResponse.bind(this);

    this.docfrag = document.createDocumentFragment();
    this.liTemplate = document.querySelector('nav template').content.firstElementChild;
    this.navUL = document.querySelector('nav ul')
    this.legend = document.querySelector('.script legend');
    this.box = document.querySelector('.script .box');
    this.box.value = '';                                    // Browser retains textarea content on refresh

    this.enable = document.querySelector('#enable');
    this.enable.addEventListener('change', () => this.toggleEnable());

    this.autoUpdate = document.querySelector('#autoUpdate');
    this.autoUpdate.addEventListener('change', () => this.toggleAutoUpdate());

    this.userMatches = document.querySelector('#userMatches');
    this.userMatches.value = '';
    this.userExcludeMatches = document.querySelector('#userExcludeMatches');
    this.userExcludeMatches.value = '';

    document.querySelectorAll('.script button[type="button"][data-i18n], .script li.button, nav button[type="button"][data-i18n]').forEach(item =>
      item.addEventListener('click', e => this.processButtons(e)));

    document.querySelector('.script .bin').addEventListener('click', () => this.deleteScript());

    window.addEventListener('beforeunload', () => {
      this.unsavedChanges() ? event.preventDefault() : this.box.value = '';
    });


    this.template = {
      js:
`// ==UserScript==
// @name
// @match
// @version          1.0
// ==/UserScript==`,

      css:
`/*
==UserCSS==
@name
@match
@version          1.0
==/UserCSS==
*/`
};


    // --- Import/Export Script
    document.getElementById('fileScript').addEventListener('change', (e) => this.processFileSelect(e));

    // --- menu dropdown
    const details = document.querySelectorAll('.menu details');
    document.body.addEventListener('click', (e) =>
      details.forEach(item => !item.contains(e.explicitOriginalTarget) && (item.open = false))
    );

    // --- textarea resize
    const divUser = document.querySelector('.menu details div.user');
    divUser.parentNode.addEventListener('toggle', e => !e.target.open && divUser.classList.remove('expand'));
    divUser.querySelectorAll('textarea').forEach(item => {
      item.addEventListener('focus', () => divUser.classList.toggle('expand', true));
    });

    // --- i18n
    this.lang = navigator.language;

    // --- CodeMirror & Theme
    this.cm;
    this.footer = document.querySelector('footer');
    const script = document.querySelector('.script');
    script.classList.toggle('dark', localStorage.getItem('dark') === 'true');

    const themeSelect = document.querySelector('#theme');
    this.theme = localStorage.getItem('theme') || 'defualt';
    themeSelect.value = this.theme;
    if (themeSelect.selectedIndex === -1) {                 // bad value correction
      this.theme = 'default';
      themeSelect.value = this.theme;
    }

    themeSelect.addEventListener('change', (e) => {
      const opt = themeSelect.selectedOptions[0];
      this.theme = opt.value;
      localStorage.setItem('theme', this.theme);
      this.cm && this.cm.setOption('theme', this.theme);

      const dark = opt.parentNode.dataset.type === 'dark';
      localStorage.setItem('dark', dark);
      script.classList.toggle('dark', dark);
    });
  }

  setCodeMirror() {

    const js =  this.legend.classList.contains('js');
    const jslint = {
        browser: true,
        curly: true,
        devel: true,
        eqeqeq: true,
        esversion: 10,
       /* forin: true,*/
        freeze: true,
        globals: {
          GM: false, GM_addScript: false, GM_addStyle: false, GM_addValueChangeListener: false, GM_deleteValue: false,
          GM_download: false, GM_fetch: false, GM_getResourceText: false, GM_getResourceURL: false, GM_info: false,
          GM_log: false, GM_notification: false, GM_openInTab: false, GM_popup: false,
          GM_registerMenuCommand: false, GM_removeValueChangeListener: false, GM_setClipboard: false,
          GM_setValue: false, GM_unregisterMenuCommand: false, GM_xmlhttpRequest: false, unsafeWindow: false
        },
        jquery: js && !!this.box.id && !!pref.content[this.box.id].require.find(item => /lib\/jquery-\d/.test(item)),
        latedef: 'nofunc',
        leanswitch: true,
        maxerr: 100,
        noarg: true,
        nonbsp: true,
        undef: true,
        unused: true,
        varstmt: true
      };

    const options = {

      lineNumbers: true,
      theme: this.theme,
      mode: js ? 'javascript' : 'css',
      tabSize: 2,
      matchBrackets: true,
      continueComments: 'Enter',
      showTrailingSpace: true,
      styleActiveLine: true,
      autoCloseBrackets: true,
      search: {bottom: true},
      lint: js ? jslint : true,
//      hint: {hintOptions: {}},
      foldGutter: true,
      gutters: ['CodeMirror-lint-markers', 'CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
      //extraKeys: {"Ctrl-Q": function(cm){ cm.foldCode(cm.getCursor()); }},

      extraKeys: {
//        'Ctrl-Q': (cm)=> cm.foldCode(cm.getCursor()), // conflict with 'toggleComment'
        'Ctrl-Q': 'toggleComment',
        'Ctrl-Space': 'autocomplete',
        'Alt-F': 'findPersistent',
//        Tab: (cm) => cm.replaceSelection('  '), // conflict with multi-line selection
        F11: (cm) => cm.setOption('fullScreen', !cm.getOption('fullScreen')),
        Esc: (cm) => cm.getOption('fullScreen') && cm.setOption('fullScreen', false)
      }
    };
    
    // Custom CodeMirror Options
    const cmOptions = App.JSONparse(pref.cmOptions) || {};
    Object.keys(cmOptions).forEach(item => item !== 'lint' && (options[item] = cmOptions[item]));
    cmOptions.lint && Object.keys(cmOptions.lint).forEach(item => jslint[item] = cmOptions.lint[item]);
    this.cm = CodeMirror.fromTextArea(this.box, options);
    CodeMirror.commands.save = () => this.saveScript();

    // --- stats
    this.makeStats(js);
  }

  makeStats(js, text = this.box.value) {

    const nf = new Intl.NumberFormat();
//    const js =  this.legend.classList.contains('js');

    const stats = [];

//    stats.push(js ? 'JavaScript' : 'CSS');
    stats.push('Size  ' + nf.format(parseFloat((text.length/1024).toFixed(1))) + ' KB');
    stats.push('Lines ' + nf.format(this.cm.lineCount()));
//    stats.push(/\r\n/.test(text) ? 'DOS' : 'UNIX');

    const tab = text.match(/\t/g);
    tab && stats.push('Tabs ' + nf.format(tab.length));

    const tr = text.match(/[ ]+((?=\r?\n))/g);
    tr && stats.push('Trailing Spaces ' + nf.format(tr.length));

    this.footer.textContent = stats.join(' \u{1f539} ');
  }

  processButtons(e) {

    const action = e.target.dataset.i18n;
    switch (action) {

      case 'saveScript': return this.saveScript();
      case 'update': return this.updateScript();
      case 'newJS': return this.newScript('js');
      case 'newCSS': return this.newScript('css');
      case 'saveTemplate': return this.saveTemplate();
      case 'exportScript': return this.exportScript();
      case 'exportAllScript': return this.exportAllScript();

      case 'tabToSpaces':
      case 'trimTrailingSpaces':
      case 'toLowerCase':
      case 'toUpperCase':
        return this.edit(action);
    }
  }

  edit(action) {

    if (!this.cm) { return; }

    let text;

    switch (action) {

      case 'tabToSpaces':
        text = this.cm.getValue().replace(/\t/g, '  ');
        this.cm.setValue(text);
        this.makeStats(text);
        break;

      case 'trimTrailingSpaces':
        text = this.cm.getValue().trimEnd().replace(/[ ]+((?=\r?\n))/g, '');
        this.cm.setValue(text);
        this.makeStats(text);
        break;

      case 'toLowerCase':
        this.cm.replaceSelection(this.cm.getSelection().toLowerCase());
        return;

      case 'toUpperCase':
        this.cm.replaceSelection(this.cm.getSelection().toUpperCase());
        return;
    }
  }


  newScript(type) {

    const box = this.box;
    const legend = this.legend;

    const last = document.querySelector('nav li.on');
    last && last.classList.remove('on');

    this.cm && this.cm.save();                              // save CodeMirror to textarea
    if(this.unsavedChanges()) { return; }
    this.cm && this.cm.toTextArea();                        // reset CodeMirror

    box.id = '';
    legend.textContent = '';
    legend.className = type;
    legend.textContent = chrome.i18n.getMessage(type === 'js' ? 'newJS' : 'newCSS');

    const text = pref.template[type] || this.template[type];
    box.value = text;

    // --- CodeMirror
    this.setCodeMirror();
  }

  saveTemplate() {

    this.cm && this.cm.save();                              // save CodeMirror to textarea
    const box = this.box;
    const text = this.box.value;
    const metaData = text.match(Meta.regEx);

    if (!metaData) { App.notify(chrome.i18n.getMessage('metaError')); return; }
    const type = metaData[1].toLowerCase() === 'userscript' ? 'js' : 'css';
    pref.template[type] = text.trimStart();
    browser.storage.local.set({template: pref.template});   // update saved pref
  }

  process() {

    this.navUL.textContent = '';                            // clear data

    Object.keys(pref.content).sort(Intl.Collator().compare).forEach(item => this.addScript(pref.content[item]));
    this.navUL.appendChild(this.docfrag);

    if (this.box.id) {                                      // refresh previously loaded content
      this.box.textContent = '';
      document.getElementById(this.box.id).click();
    }
    options.getNav();                                       // run after scripts are loaded
  }

  addScript(item) {

    const li = this.liTemplate.cloneNode(true);
    li.classList.add(item.js ? 'js' : 'css');
    item.enabled || li.classList.add('disabled');
    item.error && li.classList.add('error');
    li.textContent = item.name;
    li.id = item.name;
    this.docfrag.appendChild(li);
    li.addEventListener('click', e => this.showScript(e));
  }

  showScript(e) {

    const box = this.box;
    const legend = this.legend;
    const enable = this.enable;
    const autoUpdate = this.autoUpdate;
    const li = e.target;

    // --- if showing another page
    document.getElementById('nav4').checked = true;

    this.cm && this.cm.save();                              // save CodeMirror to textarea
    if(this.unsavedChanges()) { return; }
    this.cm && this.cm.toTextArea();                        // reset CodeMirror

    // --- reset
    [this.userMatches, this.userExcludeMatches].forEach(item => item.classList.remove('invalid'));

    const last = document.querySelector('nav li.on');
    last && last.classList.remove('on');
    li.classList.add('on');

    const id = li.id;
    box.id = id;
    legend.textContent = '';
    legend.className = li.classList.contains('js') ? 'js' : 'css';
    pref.content[id].enabled || legend.classList.add('disabled');
    legend.textContent = id;
    if (pref.content[id].i18n.name[this.lang] && pref.content[id].i18n.name[this.lang] !== id) { // i18n if different
      const sp = document.createElement('span');
      sp.textContent =  pref.content[id].i18n.name[this.lang];
      legend.appendChild(sp);
    }

    enable.checked = pref.content[id].enabled;
    autoUpdate.checked = pref.content[id].autoUpdate;

    const text = pref.content[id].js || pref.content[id].css;
    box.value = text;


    if (pref.content[id].error) {
      App.notify(pref.content[id].error, id);
    }
    
    if (pref.content[id].antifeature) {
      this.legend.classList.add('antifeature');
    }    

    this.userMatches.value = pref.content[id].userMatches || '';
    this.userExcludeMatches.value = pref.content[id].userExcludeMatches || '';

    // --- CodeMirror
    this.setCodeMirror();
  }

  noSpace(str) {
    return str.replace(/\s+/g, '');
  }

  unsavedChanges() {

    const box = this.box;
    const text = this.noSpace(this.box.value);

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
    this.legend.classList.toggle('disabled', !enable.checked);

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
      App.notify(chrome.i18n.getMessage('updateUrlError'));
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
    this.cm && this.cm.toTextArea();                        // reset CodeMirror
    legend.className = '';
    legend.textContent = chrome.i18n.getMessage('script');
    box.id = '';
    box.value = '';
    


    // --- delete script storage
    const del = deleted.map(name => '_' + name);
    del.forEach(item => delete pref[item]);
    await browser.storage.local.remove(del);

    browser.storage.local.set({content: pref.content});     // update saved pref
  }

  async saveScript() {

    const box = this.box;
    const legend = this.legend;
    this.cm && this.cm.save();                              // save CodeMirror to textarea

    // --- check User Matches User Exclude Matches
    if(!Pattern.validate(this.userMatches)) { return; }
    if(!Pattern.validate(this.userExcludeMatches)) { return; }

    // --- chcek meta data
    let text;
    text = box.value;

    const data = Meta.get(text.trim(), this.userMatches.value, this.userExcludeMatches.value);
    if (!data) { throw 'Meta Data Error'; }
    else if (data.error) {
      App.notify(chrome.i18n.getMessage('metaError'));
      return;
    }

    // --- check name
    if (!data.name) {
      App.notify(chrome.i18n.getMessage('noNameError'));
      return;
    }
    if (data.name !== box.id && pref.content[data.name] &&
              !confirm(chrome.i18n.getMessage('nameError'))) { return; }

    // --- check matches
    if (!data.matches[0] && !data.includeGlobs[0] && !data.style[0]) {
      data.enabled = false;                                 // allow no matches but disable
    }

    // --- check for Web Install, set install URL
    if (!data.updateURL && pref.content[data.name] &&
        (pref.content[data.name].updateURL.startsWith('https://greasyfork.org/scripts/') ||
          pref.content[data.name].updateURL.startsWith('https://openuserjs.org/install/') || 
          pref.content[data.name].updateURL.startsWith('https://userstyles.org/styles/'))
        ) {
      data.updateURL = pref.content[data.name].updateURL;
      data.autoUpdate = true;
    }


    pref.content[data.name] = data;                         // save to pref
    const li = document.querySelector('nav li.on');
    li && li.classList.remove('error');                     // reset error

    switch (true) {

      // --- new script
      case !box.id:
        this.addScript(data);
        const index = [...this.navUL.children].findIndex(item => Intl.Collator().compare(item.id, data.name) > 0);
        index !== -1 ? this.navUL.insertBefore(this.docfrag, this.navUL.children[index]) : this.navUL.appendChild(this.docfrag);
        this.navUL.children[index].classList.toggle('on', true);
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
      App.notify(chrome.i18n.getMessage('updateUrlError'));
      return;
    }

    RU.getUpdate(pref.content[id], true);                   // to class RemoteUpdate in common.js
  }

  async processResponse(text, name, updateURL) {            // from class RemoteUpdate in common.js

    const data = Meta.get(text);
    if (!data) { throw `${name}: Update Meta Data error`; }

    // --- check version
    if (!RU.higherVersion(data.version, pref.content[name].version)) {
      App.notify(chrome.i18n.getMessage('noNewUpdate'), name);
      return;
    }

    // --- update from previous version
    data.updateURL = pref.content[name].updateURL
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

    App.notify(chrome.i18n.getMessage('scriptUpdated', data.version), name);
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

        case !file: App.notify(chrome.i18n.getMessage('error')); return;
        case !['text/css', 'application/x-javascript'].includes(file.type): // check file MIME type CSS/JS
          App.notify(chrome.i18n.getMessage('fileTypeError'));
          return;
      }

      const reader  = new FileReader();
      reader.onloadend = () => script.readDataScript(reader.result);
      reader.onerror = () => App.notify(chrome.i18n.getMessage('fileReadError'));
      reader.readAsText(file);
    });
  }

  readDataScript(text) {

    // --- chcek meta data
    const data = Meta.get(text);
    if (!data) { throw 'Meta Data Error'; }
    else if (data.error) {
      App.notify(chrome.i18n.getMessage('metaError'));
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
    reader.onerror = () => App.notify(chrome.i18n.getMessage('fileReadError'));
    reader.readAsText(file);
  }

  prepareStylus(data) {

    const importData = App.JSONparse(data);
    if (!importData) {
      App.notify(chrome.i18n.getMessage('fileParseError'));           // display the error
      return;
    }

    importData.forEach(item => {

      // --- test validity
      if (!item.name || !item.id || !item.sections) {
        App.notify(chrome.i18n.getMessage('error'));
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

    navigator.oscpu.includes('Windows') && (data = data.replace(/\r?\n/g, '\r\n'));
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
App.importExport(() => {

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
        
        App.notify(`${chrome.i18n.getMessage(node.id)}\n${item}\n${error}`);
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
class ShowLog {

  constructor() {

    const logTemplate = document.querySelector('.log template');
    this.template = logTemplate.content.firstElementChild;
    this.tbody = logTemplate.parentNode;

    this.log = App.JSONparse(localStorage.getItem('log')) || [];
    this.log[0] && this.process(this.log);
    const logSize = document.querySelector('#logSize');
    logSize.value = localStorage.getItem('logSize') || 100;
    logSize.addEventListener('change', function(){ localStorage.setItem('logSize', this.value); });
  }

  process(list) {

    list.forEach(([time, ref, message, type]) => {

      const tr = this.template.cloneNode(true);
      type && tr.classList.add(type);
      const td = tr.children;
      td[0].textContent = time;
      td[1].title = ref;
      td[1].textContent = ref;
      td[2].textContent = message;
      this.tbody.insertBefore(tr, this.tbody.firstElementChild); // in reverse order, new on top
    });

  }

  update(newLog) {

    newLog = App.JSONparse(newLog) || [];
    if (!newLog[0]) { return; }

    const old = this.log.map(item => item.toString());      // need to conver to array of strings for Array.includes()
    const newItems = newLog.filter(item => !old.includes(item.toString()));

    if (newItems[0]) {
      this.log = newLog;
      this.process(newItems);
    }
  }
}
const showLog = new ShowLog();
// ---------------- /Log ----------------------------------
