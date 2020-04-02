'use strict';

// ----------------- Internationalization ------------------
new I18N();

// ----------------- User Preference -----------------------
new Pref().then(processScript);

// ----------------- Actions -------------------------------
// ----- global
document.querySelectorAll('button').forEach(item => item.addEventListener('click', process));
const info = document.querySelector('section.info');
info.querySelector('h3 span').addEventListener('click', () => info.parentNode.style.transform = 'translateX(0%)');

const liTemplate = document.querySelector('li.template');
const ulTab = document.querySelector('ul.tab');
const ulOther = document.querySelector('ul.other');

// ----- Theme  
document.body.classList.toggle('dark', localStorage.getItem('dark') === 'true'); // defaults to false


function process() {

  let nav;
  switch (this.dataset.i18n) {

    case 'options': break;
    case 'newJS|title': nav = 'js'; break;
    case 'newCSS|title': nav = 'css'; break;
    case 'help': nav = 'help'; break;
    case 'edit': nav = this.id; break;
  }

  nav && localStorage.setItem('nav', nav);
  chrome.runtime.openOptionsPage();
  window.close();
}

async function processScript() {

  const tabs = await browser.tabs.query({currentWindow: true, active: true});
  const tabId = tabs[0].id;                                 // active tab id

  const frames = await browser.webNavigation.getAllFrames({tabId});
  const urls = [...new Set(frames.map(item => item.url).filter(item => /^(https?|wss?|ftp|file|about:blank)/.test(item)))];
  const gExclude = pref.globalScriptExcludeMatches ? pref.globalScriptExcludeMatches.split(/\s+/) : []; // cache the array
  Object.keys(pref.content).sort(Intl.Collator().compare).forEach(item =>
    addScript(pref.content[item], checkMatches(pref.content[item], urls, gExclude))
  );

  // --- check commands if there are active scripts in tab
  if(ulTab.querySelector('li.js:not(.disabled)')) {
    browser.runtime.onMessage.addListener((message, sender) => sender.tab.id === tabId && addCommand(tabId, message));
    browser.tabs.sendMessage(tabId, {listCommand: []});
  }
}


function addScript(item, tab) {

  const li = liTemplate.cloneNode(true);
  li.classList.replace('template', item.js ? 'js' : 'css');
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

function toggleState() {

  const li = this.parentNode;
  const id = li.id;
  if (!id) { return; }

  li.classList.toggle('disabled');
  pref.content[id].enabled = !li.classList.contains('disabled');
  browser.storage.local.set({content: pref.content});       // update saved pref
}

function showInfo() {

  const id = this.parentNode.id;

  const dl = info.querySelector('dl');
  dl.textContent = '';                                      // clearing previous content
  const dtTemp = document.createElement('dt');
  const ddTemp = document.createElement('dd');
  const infoArray = ['name', 'description', 'author', 'version', 'matches',
                      'excludeMatches', 'require', 'userMatches', 'userExcludeMatches'];
  pref.content[id].error && infoArray.push('error');

  infoArray.forEach(item => {
    
    const arr = pref.content[id][item] ? 
        (Array.isArray(pref.content[id][item]) ? pref.content[id][item] : pref.content[id][item].split(/\r?\n/)) : [];
        
    switch (item) {
  
      case 'require':                                     // --- add requireRemote to require
        pref.content[id].requireRemote && arr.push(...pref.content[id].requireRemote);
        break;
      
      case 'matches':                                     // --- add UserStyle matches to matches
        pref.content[id].style && pref.content[id].style[0] && arr.push(...pref.content[id].style.flatMap(i => i.matches));
        break;
    }      
    
    if (arr[0]) {
      const dt = dtTemp.cloneNode();
      item === 'error' && dt.classList.add('error');
      dt.textContent = item;
      dl.appendChild(dt);
      
      arr.forEach(item => {
        const dd = ddTemp.cloneNode();
        dd.textContent = item;
        dl.appendChild(dd);
      });
    }
  });

  document.querySelector('button.edit').id = id;
  info.parentNode.style.transform = 'translateX(-50%)';
}


// ----------------- Script Commands -----------------------
const command = document.querySelector('h3.command');
const ulCommand = command.nextElementSibling;

function addCommand(tabId, message) {

  //{name, command: Object.keys(command)}
  if (!message.command[0]) { return; }
  
  command.classList.toggle('on', true);
  const li = liTemplate.cloneNode();
  li.classList.replace('template', 'head');
  li.textContent = message.name;
  ulCommand.appendChild(li);  
  
  message.command.forEach(item => {

    const li = liTemplate.cloneNode();
    li.classList.remove('template');
    li.textContent = item;
    li.addEventListener('click', () => browser.tabs.sendMessage(tabId, {name: message.name, command: item}));
    ulCommand.appendChild(li);
  });
}

