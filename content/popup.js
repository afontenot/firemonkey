import {pref, App, Meta, CheckMatches} from './app.js';

// ----------------- Internationalization ------------------
App.i18n();

// ----------------- User Preference -----------------------
App.getPref().then(() => popup.process());

// ----------------- Android -------------------------------
document.body.classList.toggle('android', navigator.userAgent.includes('Android'));

// ----------------- Popup ---------------------------------
class Popup {

  constructor() {
    document.querySelectorAll('button').forEach(item => item.addEventListener('click', this.processButtons));

    // ----- Scripts
    this.liTemplate = document.querySelector('template').content.firstElementChild;
    this.ulTab = document.querySelector('ul.tab');
    this.ulOther = document.querySelector('ul.other');

    // ----- Info
    this.info = document.querySelector('section.info');
    this.info.querySelector('h3 span').addEventListener('click', () =>
        this.info.parentNode.style.transform = 'translateX(0%)');

    this.infoListDL = this.info.querySelector('.infoList dl');
    this.commandList = this.info.querySelector('dl.commandList');
    this.scratchpad = this.info.querySelector('div.scratchpad');
    this.dtTemp = document.createElement('dt');
    this.ddTemp = document.createElement('dd');

    // ----- Script Commands
    document.querySelector('h3.command').addEventListener('click', () => {
      this.toggleOn(this.commandList);
      this.info.parentNode.style.transform = 'translateX(-50%)';
    });
//    this.buttonDiv =  this.info.querySelector('div.button');

    // ----- Scratchpad
    this.js = document.querySelector('#js');
    this.js.value = localStorage.getItem('scraptchpadJS') || ''; // recall last entry
    this.css = document.querySelector('#css');
    this.css.value = localStorage.getItem('scraptchpadCSS') || ''; // recall last entry

    document.querySelector('h3.scratch').addEventListener('click', () => {
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

    // ----- Find Scripts
    this.url = '';
    document.querySelector('h3.findScript').addEventListener('click', () => {
      const [scheme, host, ...path] = this.url.split(/:\/{2,3}|\/+/);
      if (scheme.startsWith('http') && host) {
        browser.tabs.create({url: 'https://greasyfork.org/en/scripts/by-site/' + host.replace(/^www\./, '')});
        window.close();
      }
    });

    // ----- Theme
    document.body.classList.toggle('dark', localStorage.getItem('dark') === 'true'); // defaults to false

    // --- i18n
    this.lang = navigator.language;
  }

  processButtons() {

    switch (this.dataset.i18n) {

      case 'options': break;
      case 'newJS|title': localStorage.setItem('nav', 'js'); break;
      case 'newCSS|title': localStorage.setItem('nav', 'css'); break;
      case 'help': localStorage.setItem('nav', 'help'); break;
      case 'edit': localStorage.setItem('nav', this.parentNode.id); break;
      case 'run':                                           // infoRun if not already injected in the tab
        this.id === 'infoRun' ? popup.infoRun(this.parentNode.id) : popup.scratchpadRun(this.id);
        return;
      case 'undo':
        this.id === 'infoUndo' ? popup.infoUndo(this.parentNode.id) : popup.scratchpadUndo();
        return;
    }
    chrome.runtime.openOptionsPage();
    window.close();
  }

  async process() {

    const tabs = await browser.tabs.query({currentWindow: true, active: true});
    const tabId = tabs[0].id;                                 // active tab id
    this.url = tabs[0].url;                                   // used in find scripts

    const [Tab, Other, frames] = await CheckMatches.process(tabId, this.url);
    document.querySelector('h3 span.frame').textContent = frames.length; // display frame count

    Tab.forEach(item => this.ulTab.appendChild(this.addScript(pref[item])));
    Other.forEach(item => this.ulOther.appendChild(this.addScript(pref[item])));

    // --- check commands if there are active scripts in tab
    if(this.ulTab.querySelector('li.js:not(.disabled)')) {
      browser.runtime.onMessage.addListener((message, sender) => sender.tab.id === tabId && this.addCommand(tabId, message));
      browser.tabs.sendMessage(tabId, {listCommand: []});
    }
  }

  addScript(item) {

    const li = this.liTemplate.cloneNode(true);
    li.classList.add(item.js ? 'js' : 'css');
    item.enabled || li.classList.add('disabled');
    li.children[1].textContent = item.name;
    li.id = '_' + item.name;

    if (item.error) {
      li.children[0].textContent = '\u2718';
      li.children[0].style.color = '#f00';
    }

    li.children[0].addEventListener('click', this.toggleState);
    li.children[1].addEventListener('click', e => this.showInfo(e));
    return li;
  }

  toggleState() {

    const li = this.parentNode;
    const id = li.id;
    if (!id) { return; }

    li.classList.toggle('disabled');
    pref[id].enabled = !li.classList.contains('disabled');
    browser.storage.local.set({[id]: pref[id]});            // update saved pref
    localStorage.setItem('enable-' + id, pref[id].enabled);
  }

  toggleOn(node) {

    [this.infoListDL.parentNode, this.commandList, this.scratchpad].forEach(item => item.classList.toggle('on', item === node));
  }

  showInfo(e) {

    const li = e.target.parentNode;
    const id = li.id;
    this.infoListDL.textContent = '';                       // clearing previous content
    this.toggleOn(this.infoListDL.parentNode);

    this.infoListDL.className = '';                         // reset
    this.infoListDL.classList.add(...li.classList);

    const dtTemp = this.dtTemp;
    const ddTemp = this.ddTemp;
    const docfrag = document.createDocumentFragment();
    const script =  pref[id];

    const infoArray = ['name', 'description', 'author', 'version', 'size', 'updateURL', 'matches',
                        'excludeMatches', 'includes', 'excludes', 'includeGlobs', 'excludeGlobs',
                        'require', 'userMatches', 'userExcludeMatches', 'injectInto', 'runAt', 'userRunAt'];
    script.error && infoArray.push('error');

    infoArray.forEach(item => {

      if (!script[item]) { return; }                        // skip to next

      const arr = Array.isArray(script[item]) ? script[item] : script[item].split(/\r?\n/);
      if (!arr[0]) { return; }                              // skip to next

      switch (item) {

        case 'name':                                        // i18n if different
        case 'description':
          script.i18n[item][this.lang] && script.i18n[item][this.lang] !== script[item] && arr.push(script.i18n[item][this.lang]);
          break;

        case 'require':                                     // --- add requireRemote to require
          script.requireRemote && arr.push(...script.requireRemote);
          break;

        case 'matches':                                     // --- add UserStyle matches to matches
          script.style && script.style[0] && arr.push(...script.style.flatMap(i => i.matches));
          break;

        case 'size':
          const text = script.js || script.css;
          arr.push(new Intl.NumberFormat().format(parseFloat((text.length/1024).toFixed(1))) + ' KB');
          break;

        case 'injectInto':
          item = 'inject-into';
          break;

        case 'runAt':
          item = 'run-at';
          arr[0] = arr[0].replace('_', '-');
          break;

        case 'userRunAt':
          item = 'user run-at';
          arr[0] = arr[0].replace('_', '-');
          break;
      }

      const dt = dtTemp.cloneNode();
      item === 'error' && dt.classList.add('error');
      dt.textContent = item;
      docfrag.appendChild(dt);

      arr.forEach(item => {
        const dd = ddTemp.cloneNode();
        dd.textContent = item;
        docfrag.appendChild(dd);
      });
    });

    this.infoListDL.appendChild(docfrag);
    const edit = document.querySelector('div.edit');
    edit.id = id;
    const active = e.target.parentNode.parentNode.classList.contains('tab') && script.enabled;
    edit.children[1].disabled = active;
    edit.children[2].disabled = active;
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

  // ----------------- Info Run/Undo -----------------------
  infoRun(id) {

    const item = pref[id];
    const code = (item.js || item.css).replace(Meta.regEx, (m) => m.replace(/\*\//g, '* /'));
    if (!code.trim()) { return; }                           // e.g. in case of userStyle

    (item.js ? browser.tabs.executeScript({code}) : browser.tabs.insertCSS({code, cssOrigin: 'user'}))
    .catch(error => App.notify(id.substring(1) + '\n' + chrome.i18n.getMessage('insertError') + '\n\n' + error.message));
  }

  infoUndo(id) {

    const item = pref[id];
    if (!item.css) { return; }                              // only for userCSS

    const code = item.css.replace(Meta.regEx, (m) => m.replace(/\*\//g, '* /'));
    if (!code.trim()) { return; }                           // e.g. in case of userStyle

    browser.tabs.removeCSS({code, cssOrigin: 'user'})
    .catch(error => App.notify(id.substring(1) + '\n\n' + error.message));
  }

  // ----------------- Scratchpad --------------------------
  scratchpadRun(id) {

    const js = id === 'jsBtn';
    const code = (js ? this.js : this.css).value.trim();
    if (!code) { return; }
    localStorage.setItem(js ? 'scraptchpadJS' : 'scraptchpadCSS', code); // save last entry

    (js ? browser.tabs.executeScript({code}) : browser.tabs.insertCSS({code, cssOrigin: 'user'}))
    .catch(error => App.notify((js ? 'JavaScript' : 'CSS') + '\n' + chrome.i18n.getMessage('insertError') + '\n\n' + error.message));
  }

  scratchpadUndo() {

    const code = this.css.value.trim();
    if (!code) { return; }
    browser.tabs.removeCSS({code, cssOrigin: 'user'})
    .catch(error => App.notify('CSS\n' + error.message));
  }
}
const popup = new Popup();
