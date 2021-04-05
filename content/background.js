import {pref, App, Meta, RemoteUpdate, CheckMatches} from './app.js';
const RU = new RemoteUpdate();

// ----------------- Context Menu --------------------------
class ContextMenu {

  constructor() {
    const contextMenus = [
      { id: 'options', contexts: ['browser_action'], icons: {16: '/image/gear.svg'} },
      { id: 'newJS', contexts: ['browser_action'], icons: {16: '/image/js.svg'} },
      { id: 'newCSS', contexts: ['browser_action'], icons: {16: '/image/css.svg'} },
      { id: 'help', contexts: ['browser_action'], icons: {16: '/image/help.svg'} },
      { id: 'log', contexts: ['browser_action'], icons: {16: '/image/document.svg'} },
      { id: 'localeMaker', contexts: ['browser_action'], icons: {16: '/locale-maker/locale-maker.svg'} },

      { id: 'stylish', contexts: ['all'], documentUrlPatterns: ['https://userstyles.org/styles/*/*'] }
    ];

    contextMenus.forEach(item => {

      if (item.id) {
        item.title = item.title || chrome.i18n.getMessage(item.id);  // always use the same ID for i18n
        item.onclick = this.process;
      }
      !navigator.userAgent.includes('Android') && browser.menus.create(item); // prepare for Andriod
    });
  }

  process(info, tab, command){

    switch (info.menuItemId) {

      case 'options': break;
      case 'newJS': localStorage.setItem('nav', 'js'); break;
      case 'newCSS': localStorage.setItem('nav', 'css'); break;
      case 'help': localStorage.setItem('nav', 'help'); break;
      case 'log': localStorage.setItem('nav', 'log'); break;
      case 'localeMaker': browser.tabs.create({url: '/locale-maker/locale-maker.html'}); return;
      case 'stylish': installer.stylish(tab.url); return;
    }
    chrome.runtime.openOptionsPage();
  }
}
new ContextMenu();
// ----------------- /Context Menu -------------------------

// ----------------- Script Counter ------------------------
class Counter {

  constructor() {
    browser.browserAction.setBadgeBackgroundColor({color: '#cd853f'});
    browser.browserAction.setBadgeTextColor({color: '#fff'}); // FF63+
    this.process = this.process.bind(this);
  }

  init() {
    browser.tabs.onUpdated.addListener(this.process, {urls: ['http://*/*', 'https://*/*', 'file:///*']});
  }

  terminate() {
    browser.tabs.onUpdated.removeListener(this.process);
  }

  async process(tabId, changeInfo, tab) {

    if (changeInfo.status !== 'complete') { return; }

    const count = await CheckMatches.process(tabId, tab.url, true);
    browser.browserAction.setBadgeText({tabId, text: (count[0] ? count.length.toString() : '')});
    browser.browserAction.setTitle({tabId, title: (count[0] ? count.join('\n') : '')});
  }
}
const counter = new Counter();
// ----------------- /Script Counter -----------------------

// ----------------- Register Content Script|CSS -----------
class ScriptRegister {

  constructor() {
    this.registered = {};
    this.FMV = browser.runtime.getManifest().version;       // FireMonkey version
  }

  async init() {
    this.process = this.process.bind(this);
    this.platformInfo = await browser.runtime.getPlatformInfo();
    this.browserInfo = await browser.runtime.getBrowserInfo();
  }

  async process(id) {

    const script = JSON.parse(JSON.stringify(pref.content[id])); // deep clone pref object
    script.style = script.style || [];                      // preset

    // --- reset previous registers  (UserStyle Multi-segment Process)
    script.style[0] ? script.style.forEach((item, i) => this.unregister(id + 'style' + i)) : this.unregister(id);

    // --- stop if script is not enabled or no mandatory matches
    if (!script.enabled || (!script.matches[0] && !script.style[0])) { return; }

    // --- preppare script options
    const options = {
      matches: script.matches,
      excludeMatches: script.excludeMatches,
      includeGlobs: script.includeGlobs,
      excludeGlobs: script.excludeGlobs,
      matchAboutBlank: script.matchAboutBlank,
      allFrames: script.allFrames,
      runAt: script.userRunAt || script.runAt
    };

    // --- add Global Script Exclude Matches
    script.js && pref.globalScriptExcludeMatches && options.excludeMatches.push(...pref.globalScriptExcludeMatches.split(/\s+/));

    // --- add userMatches, userExcludeMatches
    script.userMatches && options.matches.push(...script.userMatches.split(/\s+/));
    script.userExcludeMatches && options.excludeMatches.push(...script.userExcludeMatches.split(/\s+/));

    // --- remove empty arrays (causes error)
    ['excludeMatches', 'includeGlobs', 'excludeGlobs'].forEach(item => {
      if (!options[item][0]) { delete options[item]; };
    });

    // --- add CSS & JS
    // Removing metaBlock since there would be an error with /* ... *://*/* ... */
    const target = script.js ? 'js' : 'css';
    const js = target === 'js';
    const page = js && script.injectInto === 'page';
    const pageURL = page ? '%20(page-context)'  : '';
    const encodeId = encodeURI(id);
    const sourceURL = `\n\n//# sourceURL=user-script:FireMonkey/${encodeId}${pageURL}/`;
    options[target] = [];

    const require = script.require || [];
    const requireRemote = script.requireRemote || [];

    // --- add @require
    require.forEach(item => {

      if (item.startsWith('lib/')) {
        page ? requireRemote.push('/' + item) : options[target].push({file: '/' + item});
      }
      else if (pref.content[item] && pref.content[item][target]) {
        options[target].push({code: pref.content[item][target].replace(Meta.regEx, (m) => m.replace(/\*\//g, '* /'))});
      }
    });

    // --- add @requireRemote
    if (requireRemote[0]) {

      await Promise.all(requireRemote.map(url =>
        fetch(url).then(response => response.text())
        .then(code => {
          url.startsWith('/lib/') && (url = url.slice(1, -1));
          js && (code += sourceURL + encodeURI(url));
          page && (code = `GM_addScript(${JSON.stringify(code)})`);
          options[target].push({code});
        })
        .catch(() => null)
      ));
    }


    // --- script only
    if (js) {

      const includes = script.includes || [];
      const excludes = script.excludes || [];
      options.scriptMetadata = {
        name: id,
        resource: script.resource || {},
        storage: pref['_' + id] || {},
        info: {                                             // GM.info data
          scriptHandler: 'FireMonkey',
          version: this.FMV,
          scriptMetaStr: null,
          platform: this.platformInfo,
          browser: this.browserInfo,
          script: {
            name: id,
            version: script.version,
            description: script.description,
            includes,
            excludes,
            matches: script.matches,
            excludeMatches: script.excludeMatches,
            includeGlobs: script.includeGlobs,
            excludeGlobs: script.excludeGlobs,
            'run-at': script.runAt.replace('_', '-'),
            namespace: null,
            resources: script.resource || {}
          }
        }
      };

      // --- add debug
      script.js += sourceURL + encodeId + '.user.js';

      // --- process inject-into page context
      if (page) {
        script.js = `GM_addScript('((unsafeWindow, GM, GM_info = GM.info) => {(() => { ' + ${JSON.stringify(script.js + '\n')} +
                      '})();})(window, ${JSON.stringify({info:options.scriptMetadata.info})});');`;
      }

      // --- unsafeWindow implementation & Regex include/exclude workaround
      const code = (includes[0] || excludes[0] ? `if (!matchURL()) { throw ''; } ` : '') +
                    (page ? '' : 'const unsafeWindow = window.wrappedJSObject;');

      code.trim() && options.js.push({code});
    }

    // --- add code
    options[target].push({code: script[target].replace(Meta.regEx, (m) => m.replace(/\*\//g, '* /'))});

    if (script.style[0]) {
      // --- UserStyle Multi-segment Process
      script.style.forEach((item, i) => {

        options.matches = item.matches;
        options.css = [{code: item.css}];
        this.register(id + 'style' + i, options, id);
      });
    }
    else { this.register(id, options); }
  }

  register(id, options, originId) {

    const API = options.js ? browser.userScripts : browser.contentScripts;
    // --- register page script
    try {                                                   // catches error throws before the Promise
      API.register(options)
      .then(reg => this.registered[id] = reg)               // contentScripts.RegisteredContentScript object
      .catch(error => App.log(originId || id, `Register ➜ ${error.message}`, 'error'));
    } catch(error) { this.processError(originId || id, error.message); }
  }

  async unregister(id) {

    if (this.registered[id]) {
      await this.registered[id].unregister();
      delete this.registered[id];
    }
  }

  processError(id, error) {

    pref.content[id].error = error;                         // store error message
    browser.storage.local.set({content: pref.content});     // update saved pref
    App.log(id, `Register ➜ ${error}`, 'error');           // log message to display in Options -> Log
  }
}
const scriptReg = new ScriptRegister();
// ----------------- /Register Content Script|CSS ----------

// ----------------- User Preference -----------------------
App.getPref().then(() => new ProcessPref());

class ProcessPref {

  constructor() {
    this.process();
  }

  async process() {

    // --- storage sync check
    if (pref.sync) {

      await browser.storage.sync.get(null, result => {
        Object.keys(result).forEach(item => pref[item] = result[item]); // update pref with the saved version
      });
      await browser.storage.local.set(pref);                // update local saved pref
    }

    await this.migrate();                                   // migrate after storage sync check

    chrome.storage.onChanged.addListener((changes, area) => { // Change Listener
      Object.keys(changes).forEach(item => pref[item] = changes[item].newValue); // update pref with the saved version
      this.processPrefUpdate(changes);                      // apply changes
    });

    await scriptReg.init();                                 // await data initialization
    Object.keys(pref.content).forEach(item => scriptReg.process(item));

    // --- Script Counter
    pref.counter && counter.init();
  }

  processPrefUpdate(changes) {

    if (!Object.keys(changes).some(item => this.notEqual(changes[item].oldValue, changes[item].newValue))) { return; }

    // --- check counter preference has changed
    if (changes.counter && changes.counter.newValue !== changes.counter.oldValue) {
      changes.counter.newValue ? counter.init() : counter.terminate();
    }

    // --- find changed scripts
    if (changes.globalScriptExcludeMatches &&
      changes.globalScriptExcludeMatches.oldValue !== changes.globalScriptExcludeMatches.newValue) {
      Object.keys(pref.content).forEach(scriptReg.process);  // re-register all
    }
    else if (changes.hasOwnProperty('content') && this.notEqual(changes.content.oldValue, changes.content.newValue)) {

      Object.keys(changes.content.oldValue).forEach(item => {

        if (!changes.content.newValue[item]) {              // script was deleted
          const script = changes.content.oldValue[item];
          const id = script.name;
          // --- reset previous registers  (UserStyle Multi-segment Process)
          script.style[0] ? script.style.forEach((item, i) => scriptReg.unregister(id + 'style' + i)) : scriptReg.unregister(id);
        }
        else if (!changes.content.newValue[item].error && this.notEqual(changes.content.oldValue[item], changes.content.newValue[item])) {
          scriptReg.process(item);
        }
      });
      // --- look for newly added
      Object.keys(changes.content.newValue).forEach(item => !changes.content.oldValue[item] && scriptReg.process(item));
    }

    // --- storage sync update
    if (pref.sync) {
      const size = JSON.stringify(pref).length;
      if (size > 102400) {
        const text = chrome.i18n.getMessage('syncError', (size/1024).toFixed(1));
        App.notify(text);
        App.log('Sync', text, 'error');
        pref.sync = false;
        browser.storage.local.set({sync: false});
      }
      else { browser.storage.sync.set(pref); }
    }
  }

  notEqual(a, b) {
    return JSON.stringify(a) !== JSON.stringify(b);
  }

  async migrate() {

    const m = 2.05;
    const version = localStorage.getItem('migrate') || 0;
    if (version*1 >= m) { return; }

    // --- v2.5 migrate 2020-12-14
    Object.keys(pref.content).forEach(item => {

      pref.content[item].includes = pref.content[item].includes || [];
      pref.content[item].excludes = pref.content[item].excludes || [];
      pref.content[item].antifeatures = pref.content[item].antifeatures || [];
      pref.content[item].updateURL = pref.content[item].updateURL || '';
    });

    // --- v2.0 migrate 2020-12-08
    localStorage.getItem('dark') === 'true' && localStorage.setItem('theme', 'darcula');
    localStorage.removeItem('syntax');
    Object.keys(pref.content).forEach(item => {
      pref.content[item].i18n || (pref.content[item].i18n = {name: {}, description: {}});
    });

    // --- v1.36 migrate 2020-05-25
    Object.keys(pref.content).forEach(item => {

      pref.content[item].require && pref.content[item].require.forEach((lib, i) => {

        switch (lib) {

          case 'lib/jquery-1.12.4.min.jsm':     pref.content[item].require[i] = 'lib/jquery-1.jsm'; break;
          case 'lib/jquery-2.2.4.min.jsm':      pref.content[item].require[i] = 'lib/jquery-2.jsm'; break;
          case 'lib/jquery-3.4.1.min.jsm':      pref.content[item].require[i] = 'lib/jquery-3.jsm'; break;
          case 'lib/jquery-ui-1.12.1.min.jsm':  pref.content[item].require[i] = 'lib/jquery-ui-1.jsm'; break;
          case 'lib/bootstrap-4.4.1.min.jsm':   pref.content[item].require[i] = 'lib/bootstrap-4.jsm'; break;
          case 'lib/moment-2.24.0.min.jsm':     pref.content[item].require[i] = 'lib/moment-2.jsm'; break;
          case 'lib/underscore-1.9.2.min.jsm':  pref.content[item].require[i] = 'lib/underscore-1.jsm'; break;
        }
      });
    });

    // --- v1.31 migrate 2020-03-13
    if (pref.hasOwnProperty('disableHighlight')) {
      browser.storage.local.remove('disableHighlight');
      delete pref.disableHighlight;
    }

    await browser.storage.local.set({content: pref.content});

    localStorage.setItem('migrate', m);                     // store migrate version locally
  }
}
// ----------------- /User Preference ----------------------

// ----------------- Web/Direct Installer & Remote Update --
class Installer {

  constructor() {
    // class RemoteUpdate in app.js
    RU.callback = this.processResponse.bind(this);

    // --- Web/Direct Installer
    this.webInstall = this.webInstall.bind(this);
    this.directInstall = this.directInstall.bind(this);

    browser.webRequest.onBeforeRequest.addListener(this.webInstall, {
        urls: [ 'https://greasyfork.org/scripts/*.user.js',
                'https://greasyfork.org/scripts/*.user.css',
                'https://sleazyfork.org/scripts/*.user.js',
                'https://sleazyfork.org/scripts/*.user.css',
                'https://openuserjs.org/install/*.user.js'],
        types: ['main_frame']
      },
      ['blocking']
    );

    // prepare for Andriod, extraParameters not supported on FF for Android
    !navigator.userAgent.includes('Android') && browser.tabs.onUpdated.addListener(this.directInstall, {
      urls: [ '*://*/*.user.js', '*://*/*.user.css',
              'file:///*.user.js', 'file:///*.user.css' ]
    });

    // --- Remote Update
    this.cache = [];
    this.onIdle = this.onIdle.bind(this);
    browser.idle.onStateChanged.addListener(this.onIdle);
  }

  // --------------- Web/Direct Installer ------------------
  webInstall(e) {

    let q;
    switch (true) {

      case !e.originUrl: return;                            // end execution if not Web Install

      // --- GreasyFork & sleazyfork
      case e.originUrl.startsWith('https://greasyfork.org/') && e.url.startsWith('https://greasyfork.org/'):
      case e.originUrl.startsWith('https://sleazyfork.org/') && e.url.startsWith('https://sleazyfork.org/'):
        q = 'header h2';
        break;

      // --- OpenUserJS
      case e.originUrl.startsWith('https://openuserjs.org/') && e.url.startsWith('https://openuserjs.org/'):
        q = 'a[class="script-name"]';
        break;
    }

    if (q) {

      const code = `(() => {
        let title = document.querySelector('${q}');
        title = title ? title.textContent : document.title;
        return confirm(chrome.i18n.getMessage('installConfirm', title)) ? title : null;
      })();`;

      chrome.tabs.executeScript({code}, (result = []) =>
        result[0] && RU.getScript({updateURL: e.url, name: result[0]})
      );
      return {cancel: true};
    }
  }

  directInstall(tabId, changeInfo, tab) {

    if (changeInfo.status !== 'complete') { return; }       // end execution if not found
    if (tab.url.startsWith('https://github.com/')) { return; } // not on https://github.com/*/*.user.js

    // work-around for https://bugzilla.mozilla.org/show_bug.cgi?id=1411641
    // using https://cdn.jsdelivr.net mirror
    if (tab.url.startsWith('https://raw.githubusercontent.com/')) {
      // https://raw.githubusercontent.com/<username>/<repo>/<branch>/path/to/file.js
      const p = tab.url.split(/:?\/+/);
      browser.tabs.update({url: `https://cdn.jsdelivr.net/gh/${p[2]}/${p[3]}@${p[4]}/${p.slice(5).join('/')}` });
      return;
    }

    const code = String.raw`(() => {
      const pre = document.body;
      if (!pre || !pre.textContent.trim()) { alert(chrome.i18n.getMessage('metaError')); return; }
      const name = pre.textContent.match(/(?:\/\/)?\s*@name\s+([^\r\n]+)/);
      if (!name) { alert(chrome.i18n.getMessage('metaError')); return; }
      return confirm(chrome.i18n.getMessage('installConfirm', name[1])) ? [pre.textContent, name[1]] : null;
    })();`;

    chrome.tabs.executeScript({code}, (result = []) => {
      result[0] && this.processResponse(result[0][0], result[0][1], tab.url);
    });
  }

  async stylish(url) {                                      // userstyles.org

    if (!/^https:\/\/userstyles\.org\/styles\/\d+/.test(url)) { return; }

    const code = `(() => {
      const name = document.querySelector('meta[property="og:title"]').content.trim();
      const description = document.querySelector('meta[name="twitter:description"]').content.trim().replace(/\s*<br>\s*/g, '').replace(/\s\s+/g, ' ');
      const author = document.querySelector('#style_author a').textContent.trim();
      const lastUpdate = document.querySelector('#left_information > div:last-of-type > div:last-of-type').textContent.trim();
      const updateURL = (document.querySelector('link[rel="stylish-update-url"]') || {href: ''}).href;
      return {name, description, author, lastUpdate, updateURL};
    })();`;

    const [{name, description, author, lastUpdate, updateURL}] = await browser.tabs.executeScript({code});
    if (!name || !updateURL) { App.notify(chrome.i18n.getMessage('error')); return; }

    const version = lastUpdate ? new Date(lastUpdate).toLocaleDateString("en-GB").split('/').reverse().join('') : '';

    const metaData =
`/*
==UserStyle==
@name           ${name}
@description    ${description}
@author         ${author}
@version        ${version}
@homepage       ${url}
==/UserStyle==
*/`;

    fetch(updateURL)
    .then(response => response.text())
    .then(text =>  {
      if (text.includes('@-moz-document')) {
        this.processResponse(metaData + '\n\n' + text, name, updateURL);
        App.notify(`${name}\nInstalled version ${version}`);
      }
      else { App.notify(chrome.i18n.getMessage('error')); } // <head><title>504 Gateway Time-out</title></head>
    })
    .catch(error => Util.log(item.name, `stylish ${updateURL} ➜ ${error.message}`, 'error'));
  }
  // --------------- /Web|Direct Installer -----------------

  // --------------- Remote Update -------------------------
  onIdle(state) {

    if (state !== 'idle') { return; }

    const now = Date.now();
    const days = pref.autoUpdateInterval *1;
    const doUpdate =  days && now > pref.autoUpdateLast + (days * 86400000); // 86400 * 1000 = 24hr
    if (!doUpdate) { return; }

    if (!this.cache[0]) {                                   // rebuild the cache if empty
      this.cache = Object.keys(pref.content).filter(item => {
        const i = pref.content[item];
        return i.autoUpdate && i.updateURL && i.version;
      });
    }

    // --- do 10 updates at a time & check if script wasn't deleted
    this.cache.splice(0, 10).forEach(item => pref.content.hasOwnProperty(item) && RU.getUpdate(pref.content[item]));

    // --- set autoUpdateLast after updates are finished
    !this.cache[0] && browser.storage.local.set({autoUpdateLast: now}); // update saved pref
  }

  async processResponse(text, name, updateURL) {            // from class RU.callback in app.js

    const userMatches = pref.content[name] ? pref.content[name].userMatches : '';
    const userExcludeMatches = pref.content[name] ? pref.content[name].userExcludeMatches : '';

    const data = Meta.get(text, userMatches, userExcludeMatches);
    if (!data) { throw `${name}: Meta Data error`; }

    // --- revert https://cdn.jsdelivr.net/gh/ URL to https://raw.githubusercontent.com/
    if (updateURL.startsWith('https://cdn.jsdelivr.net/gh/')) {
      updateURL = 'https://raw.githubusercontent.com/' + updateURL.substring(28).replace('@', '/')
    }

    // --- check version, if update existing, not for local files
    if (!updateURL.startsWith('file:///') && pref.content[name] &&
          !RU.higherVersion(data.version, pref.content[name].version)) { return; }

    // --- check name, if update existing
    if (pref.content[name] && data.name !== name) {         // name has changed

      if (pref.content[data.name]) { throw `${name}: Update new name already exists`; } // name already exists
      else { await App.prepareRename(name, data.name, true); }

      scriptReg.unregister(name);                           // unregister old name
    }

    // --- check for Web Install, set install URL
    if (updateURL.startsWith('https://greasyfork.org/scripts/') ||
        updateURL.startsWith('https://sleazyfork.org/scripts/') ||
        updateURL.startsWith('https://openuserjs.org/install/') ||
        updateURL.startsWith('https://userstyles.org/styles/') ||
        updateURL.startsWith('https://raw.githubusercontent.com/') ) {
      data.updateURL = updateURL;
      data.autoUpdate = true;
    }

    // --- update from previous version
    if (pref.content[data.name]) {
      data.enabled = pref.content[data.name].enabled;
      data.autoUpdate = pref.content[data.name].autoUpdate;
      App.log(data.name, `Updated version ${pref.content[data.name].version} to ${data.version}`); // log message to display in Options -> Log
    }
    else {
      App.log(data.name, `Installed version ${data.version}`); // log message to display in Options -> Log
    }

    pref.content[data.name] = data;                         // save to pref
    browser.storage.local.set({content: pref.content});     // update saved pref
  }
  // --------------- /Remote Update ------------------------
}
const installer = new Installer();
// ----------------- /Web|Direct Installer & Remote Update -

// ----------------- Content Message Handler ---------------
class API {

  constructor() {
    this.FMUrl = browser.runtime.getURL('');
    browser.webRequest.onBeforeSendHeaders.addListener(e => this.allowSpecialHeaders(e),
      {urls: ['<all_urls>'], types: ['xmlhttprequest']},
      ['blocking', 'requestHeaders']
    );
    browser.runtime.onMessage.addListener((message, sender) => this.process(message, sender));
  }

  processForbiddenHeaders(headers) {
    // lowercase test
    const forbiddenHeader = ['accept-charset', 'accept-encoding', 'access-control-request-headers',
      'access-control-request-method', 'connection', 'content-length', 'cookie2',
      'date', 'dnt', 'expect', 'keep-alive', 'te',
      'trailer', 'transfer-encoding', 'upgrade', 'via'];

    const specialHeader = ['cookie', 'host', 'origin', 'referer'];

    // --- remove forbidden headers (Attempt to set a forbidden header was denied: Referer)
    // --- allow specialHeader
    Object.keys(headers).forEach(item =>  {
      item = item.toLowerCase();
      if (item.startsWith('proxy-') || item.startsWith('sec-') || forbiddenHeader.includes(item)) {
        delete headers[item];
      }
      else if (specialHeader.includes(item)) {
        headers['FM-' + item] = headers[item];              // set a new FM header
        delete headers[item];                               // delete original header
      }
    });
  }

  allowSpecialHeaders(e) {

    let found = false;
    e.originUrl && e.originUrl.startsWith(this.FMUrl) && e.requestHeaders.forEach((item, index) => {
      if (item.name.startsWith('FM-')) {
        e.requestHeaders.push({name: item.name.substring(3), value: item.value});
        e.requestHeaders.splice(index, 1);
        found = true;
      }
      // Webextension UUID leak via Fetch requests - Fixed mozilla73
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1405971
      else if (item.name === 'Origin' && item.value.includes('moz-extension://')) {
        e.requestHeaders.push({name: item.name, value: 'null'});
        e.requestHeaders.splice(index, 1);
        found = true;
      }
    });
    if (found) { return {requestHeaders: e.requestHeaders}; }
  }

  process(message, sender) {

    if (!message.api) { return; }

    const e = message.data;
    const name = message.name;
    const store = '_' + name;
    const hasProperty = (p) => pref[store] && Object.prototype.hasOwnProperty.call(pref[store], p);

    switch (message.api) {

      case 'log':
        App.log(name, e.message, e.type);
        break;

      case 'getValue':
        return Promise.resolve(hasProperty(e.key) ? pref[store][e.key] : e.defaultValue);

      case 'listValues':
        return Promise.resolve(pref[store] ? Object.keys(pref[store]) : []);

      case 'setValue':
        pref[store] || (pref[store] = {});                  // make one if didn't exist
        if (pref[store][e.key] === e.value) { return true; } // return if value hasn't changed
        pref[store][e.key] = e.value;
        return browser.storage.local.set({[store]: pref[store]}); // Promise with no arguments OR reject with error message

      case 'deleteValue':
        if (!hasProperty(e.key)) { return true; }           // return if nothing to delete
        delete pref[store][e.key];
        return browser.storage.local.set({[store]: pref[store]});

      case 'openInTab':
        browser.tabs.create({url: e.url, active: e.active}); // Promise with tabs.Tab OR reject with error message
        break;

      case 'setClipboard':
        navigator.clipboard.writeText(e.text)               // Promise with ? OR reject with error message
        .catch(error => App.log(name, `${message.api} ➜ ${error.message}`, 'error'));
        break;

      case 'notification':
        return browser.notifications.create('', {
          type: 'basic',
          iconUrl: e.image || 'image/icon.svg',
          title: name,
          message: e.text
        });
        break;

      case 'download':
        // --- check url
        const dUrl = this.checkURL(name, e.url, e.base);
        if (!dUrl) { return; }

        browser.downloads.download({                        // Promise with id OR reject with error message
          url: dUrl,
          filename: e.filename ? e.filename : null,
          saveAs: true,
          conflictAction: 'uniquify'
        })
        .catch(error => App.log(name, `${message.api} ➜ ${error.message}`, 'error'));  // failed notification
        break;

      case 'fetch':
        // --- check url
        const url = this.checkURL(name, e.url, e.base);
        if (!url) { return; }

        const init = {};
        ['method', 'headers', 'body', 'mode', 'credentials', 'cache', 'redirect', 'referrer', 'referrerPolicy',
          'integrity', 'keepalive', 'signal'].forEach(item => e.init.hasOwnProperty(item) && (init[item] = e.init[item]));

        // --- remove forbidden headers
        init.headers && this.processForbiddenHeaders(init.headers);

        return fetch(url, init)
          .then(response => {

            if (e.init.method === 'HEAD') {
              const res = {headers: {}};
              response.headers.forEach((value, name) => res.headers[name] = value);
              ['ok', 'redirected', 'status', 'statusText', 'type', 'url'].forEach(item => res[item] = response[item]);
              return res;
            }

            switch (e.init.responseType) {

              case 'json': return response.json();
              case 'blob': return response.blob();
              case 'arrayBuffer': return response.arrayBuffer();
              case 'formData': return response.formData();
              default: return response.text();
            }
          })
          .catch(error => App.log(name, `${message.api} ${url} ➜ ${error.message}`, 'error'));
        break;

      case 'xmlHttpRequest':
        const xhrUrl = this.checkURL(name, e.url, e.base);
        if (!xhrUrl) { return; }

        return new Promise((resolve, reject) => {

          const xhr = new XMLHttpRequest();
          xhr.open(e.method, xhrUrl, true, e.user, e.password);
          e.overrideMimeType && xhr.overrideMimeType(e.overrideMimeType);
          xhr.responseType = e.responseType;
          e.timeout && (xhr.timeout = e.timeout);
          e.hasOwnProperty('withCredentials') && (xhr.withCredentials = e.withCredentials);
          if (e.headers) {
             // --- remove forbidden headers
             this.processForbiddenHeaders(e.headers);
             Object.keys(e.headers).forEach(item => xhr.setRequestHeader(item, e.headers[item]));
          }
          xhr.send(e.data);

          xhr.onload =      () => resolve(this.makeResponse(xhr, 'onload'));
          xhr.onerror =     () => resolve(this.makeResponse(xhr, 'onerror'));
          xhr.ontimeout =   () => resolve(this.makeResponse(xhr, 'ontimeout'));
          xhr.onabort =     () => resolve(this.makeResponse(xhr, 'onabort'));
          xhr.onprogress =  () => {};
        });
        break;
    }
  }

  checkURL(name, url, base) {

    try { url = new URL(url, base); }
    catch (error) {
      App.log(name, `checkURL ${url} ➜ ${error.message}`, 'error');
      return;
    }

    // --- check protocol
    if (!['http:', 'https:', 'ftp:', 'ftps:'].includes(url.protocol)) {
      App.log(name, `checkURL ${url} ➜ Unsupported Protocol ${url.protocol}`, 'error');
      return;
    }
    return url.href;
  }

  makeResponse(xhr, type) {

    return {
      type,
      readyState:       xhr.readyState,
      response:         xhr.response,
      responseHeaders:  xhr.getAllResponseHeaders(),
      responseText:     ['', 'text'].includes(xhr.responseType) ? xhr.responseText : '', // responseText is only available if responseType is '' or 'text'.
      responseType:     xhr.responseType,
      responseURL:      xhr.responseURL,
      responseXML:      ['', 'document'].includes(xhr.responseType) ? xhr.responseXML : '', // responseXML is only available if responseType is '' or 'document'.
      status:           xhr.status,
      statusText:       xhr.statusText,
      timeout:          xhr.timeout,
      withCredentials:  xhr.withCredentials,
      finalUrl:         xhr.responseURL
    };
  }
}
new API();
// ----------------- /Content Message Handler --------------