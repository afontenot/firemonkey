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
info.querySelector('h3 img').addEventListener('click', () => info.parentNode.style.transform = 'translateX(0%)');

const liTemplate = document.querySelector('li.template');
const ulTab = document.querySelector('ul.tab');
const ulOther = document.querySelector('ul.other');


function process() {

  switch (this.dataset.i18n) {
    case 'edit': editScript(this); break;
    case 'options': chrome.runtime.openOptionsPage(); window.close(); break;
  }
}

async function processScript() {

  Object.keys(pref.content).sort(Intl.Collator().compare).forEach(item => addScript(pref.content[item]));

  const tabs = await browser.tabs.query({currentWindow: true, active: true});

  if (!/^(https?|wss?|ftp|file|about:blank)/.test(tabs[0].url)) { return; } // only run on possible schemes

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {

    if(!message.id) { return; }
    const node = document.getElementById(message.id);
    if (!node) { return; }

    const li = [...ulTab.children].find(li => Intl.Collator().compare(li.id, node.id) === 1);
    li ? ulTab.insertBefore(node, li) : ulTab.appendChild(node);
  });
  browser.tabs.sendMessage(tabs[0].id, {target: 'page'});
}

function addScript(item) {

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
  ulOther.appendChild(li);
}

async function toggleState() {

  const li = this.parentNode;

  const id = li.id;
  if (!id) { return; }

  li.classList.toggle('disabled');

  pref.content[id].enabled = !li.classList.contains('disabled');
  browser.storage.local.set(pref);                          // update saved pref

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

function editScript(button) {

  const id = button.id;
  if (!id) { throw 'No ID'; }

  localStorage.setItem('editID', id);
  chrome.runtime.openOptionsPage();
  chrome.runtime.sendMessage({edit: id});                   // in case Option page is already open
  window.close();
}