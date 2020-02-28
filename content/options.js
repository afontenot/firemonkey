'use strict';

// ----------------- Internationalization ------------------
document.querySelectorAll('[data-i18n]').forEach(node => {
  let [text, attr] = node.dataset.i18n.split('|');
  text = chrome.i18n.getMessage(text);
  attr ? node[attr] = text : node.appendChild(document.createTextNode(text));
});
// ----------------- /Internationalization -----------------

// ----------------- Options -------------------------------
const prefNode = document.querySelectorAll('#'+Object.keys(pref).join(',#')); // global, get all the preference elements
const submit = document.querySelector('button[type="submit"]'); // submit button
submit && submit.addEventListener('click', checkOptions);
const globalScriptExcludeMatches = document.querySelector('#globalScriptExcludeMatches');

function processOptions() {                                 // set saved pref/defaults OR update saved pref
  // 'this' is ony set when clicking the button to save options
  prefNode.forEach(node => {
    // value: 'select-one', 'textarea', 'text', 'number'
    const attr = node.type === 'checkbox' ? 'checked' : 'value';
    this ? pref[node.id] = node[attr] : node[attr] = pref[node.id];
  });

  this && chrome.storage.local.set(pref);                   // update saved pref

  // ----------------- Syntax Highlighter --------------------
  pref.disableHighlight || highlight.init();
}
// ----------------- /Options ------------------------------

// ----------------- User Preference -----------------------
chrome.storage.local.get(null, result => { // global default set in pref.js
  Object.keys(result).forEach(item => pref[item] = result[item]); // update pref with the saved version
  processOptions();                                         // run after the async operation
  processScript();

  autoUpdateInterval.nextElementSibling.value = autoUpdateInterval.value;
});


// ----------------- /User Preference ----------------------

function checkOptions() {

  // --- check Global Script Exclude Matches
  if(hasInvalidPattern(globalScriptExcludeMatches)) { return; }

  // --- progress bar
  progressBar();

  // --- save options
  processOptions.call(this);
}


// ----------------- Scripts -------------------------------
// ----- global
const liTemplate = document.querySelector('nav li.template');
const legend = document.querySelector('.script legend');
const box = document.querySelector('.script .box');
const highlight = new Highlight(box);
const enable = document.querySelector('#enable');
const autoUpdate = document.querySelector('#autoUpdate');
const userMatches = document.querySelector('#userMatches');
const userExcludeMatches = document.querySelector('#userExcludeMatches');

document.querySelectorAll('.script button[type="button"][data-i18n], nav button[type="button"][data-i18n]').forEach(item =>
  item.addEventListener('click', processButtons));
enable.addEventListener('change', toggleEnable);
autoUpdate.addEventListener('change', toggleAutoUpdate);
document.querySelector('.script .bin').addEventListener('click', deleteScript);

window.addEventListener('beforeunload', (e) => unsavedChanges() && event.preventDefault());

const autoUpdateInterval = document.getElementById('autoUpdateInterval');
autoUpdateInterval.addEventListener('input', function() {
  this.nextElementSibling.textContent = this.value;
});

  const template = {
    js:
`/*
==UserScript==
@name
@match
@version        1.0
==/UserScript==
*/`,

    css:
`/*
==UserCSS==
@name
@match
@version        1.0
@run-at         document-start
==/UserCSS==
*/`
};

// ----------------- Buttons -------------------------------
function processButtons() {

  switch (this.dataset.i18n) {

    case 'saveScript': saveScript(); break;
    case 'update': updateScript(); break;
    case 'newJS|title': newScript('js'); break;
    case 'newCSS|title': newScript('css'); break;
    case 'saveTemplate': saveTemplate(); break;
    case 'exportScript': exportScript(); break;
    case 'exportAllScript': exportAllScript(); break;
  }
}

function newScript(type) {

  box.classList.remove('invalid');
  const last = document.querySelector('nav li.on');
  last && last.classList.remove('on');
  if(unsavedChanges()) { return; }
  box.id = '';
  legend.textContent = '';
  legend.className = type;
  legend.textContent = chrome.i18n.getMessage(type === 'js' ? 'newJS' : 'newCSS');
  box.textContent = pref.template[type] || template[type];
  highlight.process(pref.disableHighlight);
}

function saveTemplate() {

  const metaData = box.textContent.match(metaRegEx);
  if (!metaData) { notify(chrome.i18n.getMessage('errorMeta')); return; }
  const type = metaData[1].toLowerCase() === 'userscript' ? 'js' : 'css';
  pref.template[type] = box.innerText.trim();
  browser.storage.local.set({template: pref.template});     // update saved pref
}

function processScript() {

  // --- clear data
  while (liTemplate.parentNode.children[1]) { liTemplate.parentNode.children[1].remove(); }

  Object.keys(pref.content).sort(Intl.Collator().compare).forEach(item => addScript(pref.content[item]));

  if (box.id) {                                             // refresh previously loaded content

    box.textContent = '';
    document.getElementById(box.id).click();
  }
  getNav();                                                 // run after scripts are loaded
}

function addScript(item) {

  const li = liTemplate.cloneNode(true);
  li.classList.remove('template');
  li.classList.add(item.js ? 'js' : 'css');
  item.enabled || li.classList.add('disabled');
  item.error && li.classList.add('error');
  li.textContent = item.name;
  li.id = item.name;
  liTemplate.parentNode.appendChild(li);
  li.addEventListener('click', showScript);
}


function showScript() {

  // --- if showing another page
  document.getElementById('nav4').checked = true;

  if(unsavedChanges()) { return; }

  // --- reset
  box.classList.remove('invalid');
  userMatches.classList.remove('invalid');
  userExcludeMatches.classList.remove('invalid');

  const last = document.querySelector('nav li.on');
  last && last.classList.remove('on');
  this.classList.add('on');

  const id = this.id;
  box.id = id;
  legend.textContent = '';
  legend.className = this.classList.contains('js') ? 'js' : 'css';
  legend.textContent = id;
  enable.checked = pref.content[id].enabled;
  autoUpdate.checked = pref.content[id].autoUpdate;
  box.textContent = pref.content[id].js || pref.content[id].css;
  highlight.process(pref.disableHighlight);

  if (pref.content[id].error) {
    box.classList.add('invalid');
    notify(pref.content[id].error, id);
  }

  userMatches.value = pref.content[id].userMatches || '';
  userExcludeMatches.value = pref.content[id].userExcludeMatches || '';
}

function noSpace(str) {

  return str.replace(/\s+/g, '');
}

function unsavedChanges() {

  const text = noSpace(box.innerText);
  switch (true) {

    case !text:
    case !box.id && text === noSpace(template.js):
    case !box.id && text === noSpace(template.css):
    case !box.id && text === noSpace(pref.template.js):
    case !box.id && text === noSpace(pref.template.css):
    case box.id &&  text === noSpace(pref.content[box.id].js + pref.content[box.id].css):
    case box.id && pref.content[box.id] && userMatches.value.trim() === pref.content[box.id].userExcludeMatches:
    case box.id && pref.content[box.id] && userExcludeMatches.value.trim() === pref.content[box.id].userExcludeMatches:
      return false;

    default:
      return !confirm(chrome.i18n.getMessage('discardConfirm'));
  }
}

async function toggleEnable() {

  // --- multi toggle
  if (window.getSelection().toString().trim()) {

    const li = getMulti();
    if (li[0]) {

      li.forEach(item => {

        const id = item.id;
        pref.content[id].enabled = this.checked;
        item.classList.toggle('disabled', !this.checked);
      });

      browser.storage.local.set({content: pref.content});   // update saved pref
      return;
    }
  }

  if (!box.id) { return; }

  const id = box.id;
  pref.content[id].enabled = this.checked;
  const last = document.querySelector('nav li.on');
  last && last.classList.toggle('disabled', !this.checked);

  browser.storage.local.set({content: pref.content});       // update saved pref
}

function toggleAutoUpdate() {

  if (!box.id) { return; }

  const id = box.id;
  const canUpdate = pref.content[id].updateURL && pref.content[id].version;
  pref.content[id].autoUpdate = canUpdate ? this.checked : false;
  if (!canUpdate) {
    notify(chrome.i18n.getMessage('errorUpdate'));
    this.checked = false;
    return;
  }

  browser.storage.local.set({content: pref.content});       // update saved pref
}

function getMulti() {

  // --- fitler the visible items in the selection only
  const sel = window.getSelection();
  if (!sel.toString().trim()) { return []; }
  return [...document.querySelectorAll('li.js, li.css')].filter(item =>
          sel.containsNode(item, true) && window.getComputedStyle(item).display !== 'none');
}

async function deleteScript() {

  const li = getMulti();
  if (li[0] ? !confirm(chrome.i18n.getMessage('deleteMultiConfirm', li.length)) :
              !confirm(chrome.i18n.getMessage('deleteConfirm', box.id))) { return; }

  const deleted = [];


  // --- multi delete
  if (li[0]) {

    li.forEach(item => {

      const id = item.id;
      item.remove();                                        // remove from menu list
      delete pref.content[id];
      deleted.push(id);
    });
  }
  // --- single delete
  else {

    if (!box.id) { return; }
    const id = box.id;

    // --- remove from menu list
    document.querySelector('nav li.on').remove();
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

  browser.storage.local.set({content: pref.content});       // update saved pref
}


async function saveScript() {

  // --- reset
  box.classList.remove('invalid');

  // --- check User Matches User Exclude Matches
  if(hasInvalidPattern(userMatches)) { return; }
  if(hasInvalidPattern(userExcludeMatches)) { return; }

  // --- chcek meta data
  const data = getMetaData(box.innerText.trim(), userMatches.value, userExcludeMatches.value);
  if (!data) { throw 'Meta Data Error'; }
  else if (data.error) {
    box.classList.add('invalid');
    notify(chrome.i18n.getMessage('errorMeta'));
    return;
  }

  // --- check name
  if (!data.name) {
    notify(chrome.i18n.getMessage('errorNoName'));
    return;
  }
  if (data.name !== box.id && pref.content[data.name] &&
            !confirm(chrome.i18n.getMessage('errorName'))) { return; }

  // --- check matches
  if (!data.matches[0] && !data.includeGlobs[0]) {
    data.enabled = false;                                   // allow no matches but disable
/*
    box.classList.add('invalid');
    notify(chrome.i18n.getMessage('errorMatches'));
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


  pref.content[data.name] = data;                       // save to pref

  switch (true) {

    // --- new script
    case !box.id:
      addScript(data);
      break;

    // --- update new name
    case data.name !== box.id:
      // remove old registers
      const oldName = box.id;
      delete pref.content[oldName];
      if (pref.hasOwnProperty('_' + oldName)) {                   // move script storage

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

  browser.storage.local.set({content: pref.content});       // update saved pref

  // --- progress bar
  progressBar();
}

// ----------------- Remote Update -------------------------
function updateScript() {                                   // manual update, also for disabled and disabled autoUpdate

  if (!box.id) { return; }

  const id = box.id;

  if (!pref.content[id].updateURL || !pref.content[id].version) {
    notify(chrome.i18n.getMessage('errorUpdate'));
    return;
  }

  getUpdate(pref.content[id], true);
}

async function processResponse(text, name) {

  const data = getMetaData(text);
  if (!data) { throw `${name}: Update Meta Data error`; }

  // --- check version
  if (compareVersion(data.version, pref.content[name].version) !== '>') {
    notify(chrome.i18n.getMessage('noNewUpdate'), name);
    return;
  }

  // --- update from previous version
  data.enabled = pref.content[name].enabled;
  data.autoUpdate = pref.content[name].autoUpdate;

  // --- check name
  if (data.name !== name) {                                 // name has changed

    if (pref.content[data.name]) { throw `${name}: Update new name already exists`; } // name already exists
    else {
      const oldName = name;
      delete pref.content[oldName];
      if (pref.hasOwnProperty('_' + oldName)) {                   // move script storage

        pref['_' + data.name] = pref['_' + oldName];
        await browser.storage.local.remove('_' + oldName);
      }
    }
  }

  notify(chrome.i18n.getMessage('scriptUpdated', data.version), name);
  pref.content[data.name] = data;                           // save to pref
  browser.storage.local.set({content: pref.content});       // update saved pref

  processScript();                                          // update page display
  const on = document.getElementById(data.name);
  on && on.click();                                         // reload the new script
}
// ----------------- /Remote Update ------------------------

// ----------------- /Scripts ------------------------------

// ----------------- Import/Export Script ------------------
document.getElementById('fileScript').addEventListener('change', processFileSelectScript);

let multiCache = [];
async function processFileSelectScript(e) {

  multiCache = [];                                          // reset

  // --- check for Stylus import
  if (e.target.files[0].type === 'application/json') {
    processFileSelectStylus(e);
    return;
  }

  for (const file of e.target.files) {

    switch (true) {

      case !file:
        notify(chrome.i18n.getMessage('error'));
        return;

      case !['text/css', 'application/x-javascript'].includes(file.type): // check file MIME type CSS/JS
        notify(chrome.i18n.getMessage('errorType'));
        return;
    }

    await new Promise((resolve, reject) => {

      const reader  = new FileReader();
      reader.onloadend = () => resolve(readDataScript(reader.result));
      reader.onerror = () => reject(notify(chrome.i18n.getMessage('errorRead')));
      reader.readAsText(file);
    });
  }

  if(!multiCache[0]) { return; }
  processScript();                                          // update page display
  browser.storage.local.set({content: pref.content});       // update saved pref
}

function readDataScript(text) {

  // --- chcek meta data
  const data = getMetaData(text);
  if (!data) { throw 'Meta Data Error'; }
  else if (data.error) {
    notify(chrome.i18n.getMessage('errorMeta'));
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
  }

  // --- update from previous version
  data.enabled = pref.content[data.name] ? pref.content[data.name].enabled : true;
  data.autoUpdate = pref.content[data.name] ? pref.content[data.name].autoUpdate : false;

  pref.content[data.name] = data;                           // save to pref
  multiCache.push(data.name);
}

function processFileSelectStylus(e) {

  const file = e.target.files[0];

  switch (true) {

    case !file:
      notify(chrome.i18n.getMessage('error'));
      return;

    case !['application/json'].includes(file.type): // check file MIME type
      notify(chrome.i18n.getMessage('errorType'));
      return;
  }

  const reader  = new FileReader();
  reader.onloadend = () => prepareStylus(reader.result);
  reader.onerror = () => notify(chrome.i18n.getMessage('errorRead'));
  reader.readAsText(file);
}

function prepareStylus(data) {

  let importData;
  try { importData = JSON.parse(data); }                    // Parse JSON
  catch(e) {
    notify(chrome.i18n.getMessage('errorParse'));           // display the error
    return;
  }


  for (const item of importData) {

    // --- test validity
    if (!item.name || !item.id || !item.sections) {
      notify(chrome.i18n.getMessage('error'));
      return;
    }

    item.sections.forEach((sec, index) => {

      const data = {
        // --- extension related data
        name: item.name + (index ? ' ' + index : ''),
        author: '',
        description: '',
        enabled: item.enabled,
        updateURL: item.updateUrl,
        autoUpdate: false,
        version: '',

        // --- API related data
        allFrames: false,
        js: '',
        css: sec.code,
        excludeGlobs: [],
        excludeMatches: [],
        includeGlobs: [],
        matchAboutBlank: false,
        matches: [],
        runAt: 'document_start'
      };

      // --- check auto-update criteria, must have updateURL & version
      if (data.autoUpdate && (!data.updateURL || !data.version)) { data.autoUpdate = false; }

      // --- merge include into matches
      sec.urls = sec.urls || [];
      sec.urlPrefixes = sec.urlPrefixes || [];
      sec.domains = sec.domains || [];
      data.matches = [...sec.urls, ...sec.urlPrefixes.map(item => `${item}*`), ...sec.domains.map(item => `*://*.${item}/*`)];

      if (pref.content[data.name]) { data.name += ' (Stylus)'; }

      // --- make meta data
      data.css =
      '/*\n==UserCSS==\n' +
      `@name           ${data.name}\n` +
      data.matches.map(item => `@matches        ${item}\n`).join('') +
      (data.version ? `@version        ${data.version}\n` : '') +
      (data.updateURL ? `@updateURL      ${data.updateURL}\n` : '') +
      '@run-at         document-start\n' +
      '==/UserCSS==\n*/\n\n' + data.css;

      pref.content[data.name] = data;                       // save to pref
    });
  }

  processScript();                                          // update page display
  browser.storage.local.set({content: pref.content});       // update saved pref
}

function exportScript() {

  if (!box.id) { return; }

  const id = box.id;
  const ext = pref.content[id].js ? '.js' : '.css';
  const data = pref.content[id].js || pref.content[id].css;
  exportfile(data, ext, id);
}

function exportAllScript() {

  Object.keys(pref.content).forEach(id => {

    const ext = pref.content[id].js ? '.js' : '.css';
    const data = pref.content[id].js || pref.content[id].css;
    exportfile(data, ext, 'FireMonkey/' + id, false);
  });
}

function exportfile(data, ext, id, saveAs = true) {

  const blob = new Blob([data], {type : 'text/plain;charset=utf-8'});
  const filename = id + ext;

  chrome.downloads.download({
    url: URL.createObjectURL(blob),
    filename,
    saveAs,
    conflictAction: 'uniquify'
  });
}
// ----------------- /Import/Export Script -----------------

// ----------------- Import/Export Preferences -------------
document.getElementById('file').addEventListener('change', processFileSelect);
document.getElementById('export').addEventListener('click', () => exportData(JSON.stringify(pref, null, 2), '.json'));

function processFileSelect(e) {

  const file = e.target.files[0];

  switch (true) {

    case !file:
      notify(chrome.i18n.getMessage('error'));
      return;

    case !['text/plain', 'application/json'].includes(file.type): // check file MIME type
      notify(chrome.i18n.getMessage('errorType'));
      return;
  }

  const reader  = new FileReader();
  reader.onloadend = () => readData(reader.result);
  reader.onerror = () => notify(chrome.i18n.getMessage('errorRead'));
  reader.readAsText(file);
}

function readData(data) {

  let importData;
  try { importData = JSON.parse(data); }                    // Parse JSON
  catch(e) {
    notify(chrome.i18n.getMessage('errorParse'));           // display the error
    return;
  }

  Object.keys(pref).forEach(item =>
    importData.hasOwnProperty(item) && (pref[item] = importData[item])); // update pref with the saved version

  processOptions();                                         // set options after the pref update
  processScript();                                          // update page display
}

function exportData(data, ext) {

  const blob = new Blob([data], {type : 'text/plain;charset=utf-8'});
  const filename = chrome.i18n.getMessage('extensionName') + '_' + new Date().toISOString().substring(0, 10) + ext;

  chrome.downloads.download({
    url: URL.createObjectURL(blob),
    filename,
    saveAs: true,
    conflictAction: 'uniquify'
  });
}
// ----------------- /Import/Export Preferences ------------



// ----------------- Edit from browser pop-up --------------
// ----- message listeners from popup page
chrome.runtime.onMessage.addListener((message, sender) => {
  message.hasOwnProperty('nav') && getNav(message.nav);
});

function getNav(nav) {

  nav = nav || localStorage.getItem('nav');
  localStorage.removeItem('nav');
  if (!nav) { return; }                                     // end execution if not found

  switch (nav) {

    case 'js':
    case 'css':
      document.getElementById('nav4').checked = true;
      newScript(nav);
      break;

    case 'help':
      document.getElementById('nav1').checked = true;
      break;
      
    default:
      document.getElementById('nav4').checked = true;
      document.getElementById(nav).click();
  }
}


// ----------------- Progress Bar --------------------------
function progressBar() {

  const pBar = document.querySelector('.progressBar');
  pBar.classList.toggle('on');
  setTimeout(() => { pBar.classList.toggle('on'); }, 2000);
}
// ----------------- /Progress Bar -------------------------
