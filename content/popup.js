'use strict';

// ----------------- Internationalization ------------------
Util.i18n();

// ----------------- User Preference -----------------------
Pref.get().then(() => popup.process());

// ----------------- Popup ---------------------------------
class Popup {

  constructor() {
    document.querySelectorAll('button').forEach(item => item.addEventListener('click', this.processButtons));

    // ----- Scripts
    this.liTemplate = document.querySelector('li.template');
    this.ulTab = document.querySelector('ul.tab');
    this.ulOther = document.querySelector('ul.other');

    // ----- Info
    this.info = document.querySelector('section.info');
    this.info.querySelector('h3 span').addEventListener('click', () =>
        this.info.parentNode.style.transform = 'translateX(0%)');

    this.infoList = this.info.querySelector('dl.infoList');
    this.commandList = this.info.querySelector('dl.commandList');
    this.scratchpad = this.info.querySelector('div.scratchpad');
    this.dtTemp = document.createElement('dt');
    this.ddTemp = document.createElement('dd');

    // ----- Script Commands
    document.querySelector('h3.command img').addEventListener('click', () => {
      this.toggleOn(this.commandList);
      this.info.parentNode.style.transform = 'translateX(-50%)';
    });
    this.buttonDiv =  this.info.querySelector('div.button');

    // ----- Scratchpad
    this.js = document.querySelector('#js');
    this.js.value = localStorage.getItem('scraptchpadJS') || ''; // recall last entry
    this.css = document.querySelector('#css');
    this.css.value = localStorage.getItem('scraptchpadCSS') || ''; // recall last entry

    document.querySelector('h3.scratchpad img').addEventListener('click', () => {
      this.toggleOn(this.scratchpad);
      this.info.parentNode.style.transform = 'translateX(-50%)';
    });
    document.querySelector('img.scraptchpadJS').addEventListener('click', () => {
      this.js.value = '';
      localStorage.setItem('scraptchpadJS', '');
    });
    document.querySelector('img.scraptchpadCSS').addEventListener('click', () => {
      this.css.value = '';
      localStorage.setItem('scraptchpadCSS', '');
    });

    // ----- Theme
    document.body.classList.toggle('dark', localStorage.getItem('dark') === 'true'); // defaults to false
  }

  processButtons() {

    switch (this.dataset.i18n) {

      case 'options': break;
      case 'newJS|title': localStorage.setItem('nav', 'js'); break;
      case 'newCSS|title': localStorage.setItem('nav', 'css'); break;
      case 'help': localStorage.setItem('nav', 'help'); break;
      case 'edit': localStorage.setItem('nav', this.id); break;
      case 'run':  popup.runScratchpad(); return;
    }
    chrome.runtime.openOptionsPage();
    window.close();
  }

  async process() {

    const tabs = await browser.tabs.query({currentWindow: true, active: true});
    const tabId = tabs[0].id;                                 // active tab id

    const frames = await browser.webNavigation.getAllFrames({tabId});
    const urls = [...new Set(frames.map(item => item.url).filter(item => /^(https?|wss?|file|about:blank)/.test(item)))];
    const gExclude = pref.globalScriptExcludeMatches ? pref.globalScriptExcludeMatches.split(/\s+/) : []; // cache the array
    Object.keys(pref.content).sort(Intl.Collator().compare).forEach(item =>
      this.addScript(pref.content[item], CheckMatches.get(pref.content[item], urls, gExclude))
    );

    // --- check commands if there are active scripts in tab
    if(this.ulTab.querySelector('li.js:not(.disabled)')) {
      browser.runtime.onMessage.addListener((message, sender) => sender.tab.id === tabId && this.addCommand(tabId, message));
      browser.tabs.sendMessage(tabId, {listCommand: []});
    }
  }

  addScript(item, tab) {

    const li = this.liTemplate.cloneNode(true);
    li.classList.replace('template', item.js ? 'js' : 'css');
    item.enabled || li.classList.add('disabled');
    li.children[1].textContent = item.name;
    li.id = item.name;

    if (item.error) {
      li.children[0].textContent = '\u2718';
      li.children[0].style.color = '#f00';
    }
    else { li.children[0].addEventListener('click', this.toggleState); }
    li.children[2].addEventListener('click', e => this.showInfo(e));
    (tab ? this.ulTab : this.ulOther).appendChild(li);
  }

  toggleState() {

    const li = this.parentNode;
    const id = li.id;
    if (!id) { return; }

    li.classList.toggle('disabled');
    pref.content[id].enabled = !li.classList.contains('disabled');
    browser.storage.local.set({content: pref.content});     // update saved pref
  }

  toggleOn(node) {

    [this.infoList, this.commandList, this.scratchpad].forEach(item => item.classList.toggle('on', item === node));
  }

  showInfo(e) {

    const id = e.target.parentNode.id;
    this.infoList.textContent = '';                         // clearing previous content
    this.toggleOn(this.infoList);

    const dl = this.infoList;
    const dtTemp = this.dtTemp;
    const ddTemp = this.ddTemp;

    const infoArray = ['name', 'description', 'author', 'version', 'updateURL', 'matches',
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
    this.info.parentNode.style.transform = 'translateX(-50%)';
  }

  // ----------------- Script Commands -----------------------
  addCommand(tabId, message) {

    //{name, command: Object.keys(command)}
    if (!message.command || !message.command[0]) { return; }

    const dl = this.commandList;
    const dtTemp = this.dtTemp;
    const ddTemp = this.ddTemp;

    const dt = dtTemp.cloneNode();
    dt.textContent = message.name;
    dl.appendChild(dt);

    message.command.forEach(item => {

      const dd = ddTemp.cloneNode();
      dd.textContent = item;
      dd.addEventListener('click', () => browser.tabs.sendMessage(tabId, {name: message.name, command: item}));
      dl.appendChild(dd);
    });
  }

  // ----------------- Scratchpad --------------------------
  runScratchpad() {

    const js = this.js.value.trim();
    const css = this.css.value.trim();
    
    if (js) {
      localStorage.setItem('scraptchpadJS', js); // save last entry
      browser.tabs.executeScript({code: js})
      .then(() => {})
      .catch(error => Util.notify('JavaScript: ' + chrome.i18n.getMessage('errorInsert')));
    }

    if (css) {
      localStorage.setItem('scraptchpadCSS', css); // save last entry
      browser.tabs.insertCSS({code: css})
      .then(() => {})
      .catch(error => Util.notify('CSS: ' + chrome.i18n.getMessage('errorInsert')));
    }
  }
}
const popup = new Popup();