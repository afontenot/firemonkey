'use strict';

// ----------------- Internationalization ------------------
for (const node of document.querySelectorAll('[data-i18n]')) {
  let [text, attr] = node.dataset.i18n.split('|');
  text = chrome.i18n.getMessage(text);
  attr ? node[attr] = text : node.appendChild(document.createTextNode(text));
}
// ----------------- /Internationalization -----------------

// ----------------- User Preference -----------------------
chrome.storage.local.get(null, result => { // global default set in pref.js
  Object.keys(result).forEach(item => pref[item] = result[item]); // update pref with the saved version
  processScript();
});
// ----------------- /User Preference ----------------------

// ----------------- Actions -------------------------------
// ----- global
[...document.querySelectorAll('button')].forEach(item => item.addEventListener('click', process));
const info = document.querySelector('section.info');
info.querySelector('h3 span').addEventListener('click', () => info.parentNode.style.transform = 'translateX(0%)');

const liTemplate = document.querySelector('li.template');
const ulTab = document.querySelector('ul.tab');
const ulOther = document.querySelector('ul.other');


function process() {

  switch (this.dataset.i18n) {
    case 'edit': editScript(this.id); break;
    case 'options': chrome.runtime.openOptionsPage(); window.close(); break;
  }
}

async function processScript() {

  const tabs = await browser.tabs.query({currentWindow: true, active: true});
  const frames = await browser.webNavigation.getAllFrames({tabId: tabs[0].id});
  const urls = [...new Set(frames.map(item => item.url).filter(item => /^(https?|wss?|ftp|file|about:blank)/.test(item)))];

  Object.keys(pref.content).sort(Intl.Collator().compare).forEach(item =>
    addScript(pref.content[item], checkMatches(pref.content[item], urls))
  );
}

function addScript(item, tab) {

  const li = liTemplate.cloneNode(true);
  li.classList.remove('template');
  li.classList.add(item.js ? 'js' : 'css');
  item.enabled || li.classList.add('disabled');
  li.children[1].textContent = item.name;
  li.id = item.name;

  if (item.error) {
    li.children[0].textContent = '\u2718';
    li.children[0].style.color = '#f00';
  }
  else { li.children[0].addEventListener('click', toggleState); }
  li.children[2].addEventListener('click', showInfo);
  (tab ? ulTab : ulOther).appendChild(li);
}

async function toggleState() {

  const li = this.parentNode;

  const id = li.id;
  if (!id) { return; }

  li.classList.toggle('disabled');

  pref.content[id].enabled = !li.classList.contains('disabled');
  browser.storage.local.set({content: pref.content});       // update saved pref

  // --- register/unregister
  const bg = await browser.runtime.getBackgroundPage();
  bg.updatePref(pref);
  pref.content[id].enabled ? bg.register(id) : bg.unregister(id);
}

function showInfo() {

  const id = this.parentNode.id;

  const dl = info.querySelector('dl');
  dl.textContent = '';                                      // clearing previous content
  const dtTemp = document.createElement('dt');
  const ddTemp = document.createElement('dd');
  const infoArray = ['name', 'description', 'author', 'version', 'matches'];
  pref.content[id].error && infoArray.push('error');

  infoArray.forEach(item => {

    const dt = dtTemp.cloneNode();
    item === 'error' && dt.classList.add('error');
    dt.textContent = item;
    dl.appendChild(dt);
    const arr = Array.isArray(pref.content[id][item]) ? pref.content[id][item] : [pref.content[id][item]];
    arr.forEach(item => {
      const dd = ddTemp.cloneNode();
      dd.textContent = item || ' ... ';
      dl.appendChild(dd);
    });
  });

  document.querySelector('button.edit').id = id;
  info.parentNode.style.transform = 'translateX(-50%)';
}

function editScript(id) {

  localStorage.setItem('editID', id);
  chrome.runtime.openOptionsPage();
  chrome.runtime.sendMessage({edit: id});                   // in case Option page is already open
  window.close();
}

// ----------------- Match Pattern Check -------------------
function checkMatches(item, urls) {

  switch (true) {

    // --- about:blank
    case urls.includes('about:blank') && item.matchAboutBlank: return true;

    // --- matches & globs
    case !matches(urls, item.matches):
    case item.excludeMatches[0] && matches(urls, item.excludeMatches):
    case item.includeGlobs[0] && !matches(urls, item.includeGlobs, true):
    case item.excludeGlobs[0] && matches(urls, item.excludeGlobs, true):
      return false;

    default: return true;
  }
}

function matches(urls, arr, glob) {

  if (urls.includes('<all_urls>') || urls.includes('*://*/*')) { return true; }

  return !!urls.find(u => new RegExp(prepareMatches(arr, glob), 'i').test(u));
}

function prepareMatches(arr, glob) {

  const regexSpChar = glob ? /[-\/\\^$+.()|[\]{}]/g : /[-\/\\^$+?.()|[\]{}]/g; // Regular Expression Special Characters minus * ?
  const str = arr.map(item => '\\b' + item.replace(regexSpChar, '\\$&').replace(/\*/g, '.*') + '\\b').join('|');
  return glob ? str.replace(/\?/g, '.') : str;
}
// ----------------- /Match Pattern Check ------------------
