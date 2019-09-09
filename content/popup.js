'use strict';

// ----------------- Internationalization ------------------
document.querySelectorAll('[data-i18n]').forEach(node => {
  let [text, attr] = node.dataset.i18n.split('|');
  text = chrome.i18n.getMessage(text);
  attr ? node[attr] = text : node.appendChild(document.createTextNode(text));
});
// ----------------- /Internationalization -----------------

// ----------------- User Preference -----------------------
chrome.storage.local.get(null, result => { // global default set in pref.js
  Object.keys(result).forEach(item => pref[item] = result[item]); // update pref with the saved version
  processScript();
});
// ----------------- /User Preference ----------------------

// ----------------- Actions -------------------------------
// ----- global
document.querySelectorAll('button').forEach(item => item.addEventListener('click', process));
const info = document.querySelector('section.info');
info.querySelector('h3 span').addEventListener('click', () => info.parentNode.style.transform = 'translateX(0%)');

const liTemplate = document.querySelector('li.template');
const ulTab = document.querySelector('ul.tab');
const ulOther = document.querySelector('ul.other');


function process() {

  switch (this.dataset.i18n) {
    case 'edit': editScript('edit', this.id); break;
    case 'options': chrome.runtime.openOptionsPage(); window.close(); break;
    case 'newJS|title': editScript('new', 'js'); break;
    case 'newCSS|title': editScript('new', 'css'); break;
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

function editScript(edit, id) {

  localStorage.setItem(edit, id);
  chrome.runtime.openOptionsPage();
  chrome.runtime.sendMessage({edit, id});                    // in case Option page is already open
  window.close();
}
