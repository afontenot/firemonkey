'use strict';

// ----------------- Context Menu --------------------------
class ContextMenu {

  constructor() {
    const contextMenus = [
      { id: 'options', contexts: ['browser_action'], icons: {16: 'image/gear.svg'} },
      { id: 'newJS', contexts: ['browser_action'], icons: {16: 'image/js.svg'} },
      { id: 'newCSS', contexts: ['browser_action'], icons: {16: 'image/css.svg'} },
      { id: 'help', contexts: ['browser_action'], icons: {16: 'image/help32.png'} },
      { id: 'log', contexts: ['browser_action'], icons: {16: 'image/document.svg'} }
    ];

    contextMenus.forEach(item => {

      if (item.id && !item.title) { item.title = chrome.i18n.getMessage(item.id); } // always use the same ID for i18n
      if (item.id) { item.onclick = this.process; }
      browser.menus.create(item);
    });
  }

  process(info, tab, command){

    switch (info.menuItemId) {

      case 'options': break;
      case 'newJS': localStorage.setItem('nav', 'js'); break;
      case 'newCSS': localStorage.setItem('nav', 'css'); break;
      case 'help': localStorage.setItem('nav', 'help'); break;
      case 'log': localStorage.setItem('nav', 'log'); break;
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

    const frames = await browser.webNavigation.getAllFrames({tabId});
    const urls = [...new Set(frames.map(item => item.url).filter(item => /^(https?|wss?|ftp|file|about:blank)/.test(item)))];
    const gExclude = pref.globalScriptExcludeMatches ? pref.globalScriptExcludeMatches.split(/\s+/) : []; // cache the array
    const count = Object.keys(pref.content).filter(item =>
      pref.content[item].enabled && CheckMatches.get(pref.content[item], urls, gExclude));
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
      runAt: script.runAt
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
    options[target] = [];

    // --- add @require
    const require = script.require || [];
    require.forEach(item => {

      if (item.startsWith('lib/')) { options[target].push({file: item}); }
      else if (pref.content[item] && pref.content[item][target]) {
        options[target].push({code: pref.content[item][target].replace(Meta.regEx, (m) => m.replace(/\*\//g, '* /'))});
      }
    });

    // --- add @requireRemote
    const requireRemote = script.requireRemote || [];
    if (requireRemote[0]) {

      await Promise.all(requireRemote.map(url =>
        fetch(url).then(response => response.text())
        .then(code => options[target].push({code}))
        .catch(() => null)
      ));
    }

    // --- add code
    options[target].push({code: script[target].replace(Meta.regEx, (m) => m.replace(/\*\//g, '* /'))});

    // --- script only
    if (script.js) {

      options.scriptMetadata = {
        name: id,
        resource: script.resource || {},
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
            match: script.matches,
            matches: script.matches,
            includes: script.matches,
            excludes: script.excludeMatches,
            'run-at': script.runAt.replace('_', '-'),
            namespace: null,
            resources: script.resource || {}
          }
        }
      };
    }

    if (script.style[0]) {
      // --- UserStyle Multi-segment Process
      script.style.forEach((item, i) => {

        options.matches = item.matches;
        options.css = [{code: item.css}];
        this.register(id + 'style' + i, options);
      });
    }
    else { this.register(id, options); }
  }

  register(id, options) {

    const API = options.js ? browser.userScripts : browser.contentScripts;
    // --- register page script
    try {                                                   // catches error throws before the Promise
      API.register(options)
      .then(reg => this.registered[id] = reg)               // contentScripts.RegisteredContentScript object
      .catch(error => logger.set(id, `Register ➜ ${error.message}`, 'error'));
    } catch(error) { this.processError(id, error.message); }
  }

  async unregister(id) {

    if (this.registered[id]) {
      await this.registered[id].unregister();
      delete this.registered[id];
    }
  }

  processError(id, error) {

    pref.content[id].error = error;                         // store error message
    pref.content[id].enabled = false;                       // disable the script
    browser.storage.local.set({content: pref.content});     // update saved pref
    logger.set(id, `Register ➜ ${error}`, 'error');        // log message to display in Options -> Log
  }
}
const scriptReg = new ScriptRegister();
// ----------------- /Register Content Script|CSS ----------

// ----------------- User Preference -----------------------
Pref.get().then(() => {
  new ProcessPref();
});

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

    const days = pref.autoUpdateInterval *1;
    const doUpdate =  days && Date.now() > pref.autoUpdateLast + (days + 86400000); // 86400 * 1000 = 24hr

    await scriptReg.init();                                 // await data initialization
    Object.keys(pref.content).forEach(item => {

      scriptReg.process(item);
      doUpdate && pref.content[item].enabled && pref.content[item].autoUpdate && pref.content[item].updateURL &&
        pref.content[item].version && installer.cache.push(item);
    });

    installer.cache[0] && installer.initRemoteUpdate();

    // --- Script Counter
    pref.counter && counter.init();
  }

  processPrefUpdate(changes) {

    if (!Object.keys(changes).find(item => this.notEqual(changes[item].oldValue, changes[item].newValue))) { return; }

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
        const text = chrome.i18n.getMessage('errorSync', (size/1024).toFixed(1));
        Util.notify(text);
        logger.set('Sync', text, 'error');
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

    const version = (localStorage.getItem('migrate') || 0) *1;
    if (version >= 1.36) { return; }

    if (pref.hasOwnProperty('disableHighlight')) {          // v1.31 migrate
      browser.storage.local.remove('disableHighlight');
      delete pref.disableHighlight;
    }

    Object.keys(pref.content).forEach(item => {             // v1.36 migrate

      pref.content[item].require && pref.content[item].require.forEach((lib, i) => {

        switch (lib) {

          case 'lib/jquery-1.12.4.min.jsm': pref.content[item].require[i] = 'lib/jquery-1.jsm'; break;
          case 'lib/jquery-2.2.4.min.jsm': pref.content[item].require[i] = 'lib/jquery-2.jsm'; break;
          case 'lib/jquery-3.4.1.min.jsm': pref.content[item].require[i] = 'lib/jquery-3.jsm'; break;
          case 'lib/jquery-ui-1.12.1.min.jsm': pref.content[item].require[i] = 'lib/jquery-ui-1.jsm'; break;
          case 'lib/bootstrap-4.4.1.min.jsm': pref.content[item].require[i] = 'lib/bootstrap-4.jsm'; break;
          case 'lib/moment-2.24.0.min.jsm': pref.content[item].require[i] = 'lib/moment-2.jsm'; break;
          case 'lib/underscore-1.9.2.min.jsm': pref.content[item].require[i] = 'lib/underscore-1.jsm'; break;
        }
      });
    });

    await browser.storage.local.set({content: pref.content});

    // store migrate version locally
    localStorage.setItem('migrate',  1.36);
  }
}
// ----------------- /User Preference ----------------------

// ----------------- Web/Direct Installer & Remote Update --
class Installer {

  constructor() {
    // class RemoteUpdate in common.js
    RU.callback = this.processResponse.bind(this);

    // --- Web/Direct Installer
    this.webInstall = this.webInstall.bind(this);
    this.directInstall = this.directInstall.bind(this);

    browser.webRequest.onBeforeRequest.addListener(this.webInstall, {
        urls: [ 'https://greasyfork.org/scripts/*.user.js',
                'https://greasyfork.org/scripts/*.user.css',
                'https://openuserjs.org/install/*.user.js'],
        types: ['main_frame']
      },
      ['blocking']
    );

    browser.tabs.onUpdated.addListener(this.directInstall,{
      urls: [ '*://*/*.user.js', '*://*/*.user.css',
              'file:///*.user.js', 'file:///*.user.css' ]
    });

    // --- Remote Update
    this.cache = [];
    this.onIdle = this.onIdle.bind(this);
  }

  // --------------- Web/Direct Installer ------------------
  webInstall(e) {

    let q;
    switch (true) {

      case !e.originUrl: return;                            // end execution if not Web Install

      // --- GreasyFork
      case e.originUrl.startsWith('https://greasyfork.org/') && e.url.startsWith('https://greasyfork.org/'):
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

      chrome.tabs.executeScript({code}, (result = []) => {
        result[0] && RU.getScript({updateURL: e.url, name: result[0]});
      });
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
      if (!pre || !pre.textContent.trim()) { alert(chrome.i18n.getMessage('errorMeta')); return; }
      const name = pre.textContent.match(/(?:\/\/)?\s*@name\s+([^\r\n]+)/);
      if (!name) { alert(chrome.i18n.getMessage('errorMeta')); return; }
      return confirm(chrome.i18n.getMessage('installConfirm', name[1])) ? [pre.textContent, name[1]] : null;
    })();`;

    chrome.tabs.executeScript({code}, (result = []) => {
      result[0] && this.processResponse(result[0][0], result[0][1], tab.url);
    });
  }
  // --------------- /Web|Direct Installer -----------------

  // --------------- Remote Update -------------------------
  initRemoteUpdate() {
    browser.idle.onStateChanged.addListener(this.onIdle);
  }

  terminateRemoteUpdate() {
    browser.idle.onStateChanged.removeListener(this.onIdle);
  }

  onIdle() {

    if (state !== 'idle' || !this.cache[0]) { return; }

    pref.autoUpdateLast = Date.now();
    browser.storage.local.set({autoUpdateLast: pref.autoUpdateLast}); // update saved pref

    // --- do 10 updates at a time
    const sect = this.cache.splice(0, 10);
    this.cache[0] || this.terminate();
    sect.forEach(item => pref.content.hasOwnProperty(item) && RU.getUpdate(pref.content[item])); // check if script wasn't deleted
  }

  processResponse(text, name, updateURL) {                  // from class RemoteUpdate in common.js

    const userMatches = pref.content[name] ? pref.content[name].userMatches : '';
    const userExcludeMatches = pref.content[name] ? pref.content[name].userExcludeMatches : '';

    const data = Meta.get(text, userMatches, userExcludeMatches);
    if (!data) { throw `${name}: Meta Data error`; }

    // --- check version, if update existing, not for local files
    if (!updateURL.startsWith('file:///') && pref.content[name] &&
          !RU.higherVersion(data.version, pref.content[name].version)) { return; }

    // --- check name, if update existing
    if (pref.content[name] && data.name !== name) {         // name has changed

      if (pref.content[data.name]) { throw `${name}: Update new name already exists`; } // name already exists
      else {

        if (pref['_' + name]) {                             // move storage
          pref['_' + data.name] = pref['_' + name];
          delete pref['_' + name];
          browser.storage.local.remove('_' + name);
        }
        delete pref.content[name];
      }

      scriptReg.unregister(name);                           // unregister old name
    }

    // --- check for Web Install, set install URL
    if (updateURL.startsWith('https://greasyfork.org/scripts/') ||
        updateURL.startsWith('https://openuserjs.org/install/')) {
      data.updateURL = updateURL;
      data.autoUpdate = true;
    }

    // --- update from previous version
    if (pref.content[data.name]) {
      data.enabled = pref.content[data.name].enabled;
      data.autoUpdate = pref.content[data.name].autoUpdate;
      logger.set(data.name, `Updated version ${pref.content[data.name].version} to ${data.version}`); // log message to display in Options -> Log
    }
    else {
      logger.set(data.name, `Installed version ${data.version}`); // log message to display in Options -> Log
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
    const storage = '_' + name;
    const hasProperty = (p) => pref[storage] && Object.prototype.hasOwnProperty.call(pref[storage], p);
    let oldValue;

    switch (message.api) {

      case 'setValue':
        pref[storage] || (pref[storage] = {});              // make one if didn't exist
        if (pref[storage][e.key] === e.value) { return true; } // return if value hasn't changed
        oldValue = pref[storage][e.key];                    // need to cache it due to async processes
        pref[storage][e.key] = e.value;
        return browser.storage.local.set({[storage]: pref[storage]}); // Promise with no arguments OR reject with error message

      case 'getValue':
        return Promise.resolve(hasProperty(e.key) ? pref[storage][e.key] : e.defaultValue);

      case 'listValues':
        return Promise.resolve(pref[storage] ? Object.keys(pref[storage]) : []);

      case 'deleteValue':
        if (!hasProperty(e.key)) { return true; }           // return if nothing to delete
        oldValue = pref[storage][e.key];                    // need to cache it due to async processes
        delete pref[storage][e.key];
        return browser.storage.local.set({[storage]: pref[storage]});


      case 'openInTab':
        browser.tabs.create({url: e.url, active: e.active}); // Promise with tabs.Tab OR reject with error message
        break;

      case 'setClipboard':
        navigator.clipboard.writeText(e.text)               // Promise with ? OR reject with error message
        .then(() => {})
        .catch(error => logger.set(name, `${message.api} ➜ ${error.message}`, 'error'));
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
        .then(() => {})
        .catch(error => logger.set(name, `${message.api} ➜ ${error.message}`, 'error'));  // failed notification
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

            switch (e.init.responseType) {

              case 'json': return response.json();
              case 'blob': return response.blob();
              case 'arrayBuffer': return response.arrayBuffer();
              case 'formData': return response.formData();
              default: return response.text();
            }
          })
          .catch(error => logger.set(name, `${message.api} ${url} ➜ ${error.message}`, 'error'));
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
      logger.set(name, `checkURL ${url} ➜ ${error.message}`, 'error');
      return;
    }

    // --- check protocol
    if (!['http:', 'https:', 'ftp:', 'ftps:'].includes(url.protocol)) {
      logger.set(name, `checkURL ${url} ➜ Unsupported Protocol ${url.protocol}`, 'error');
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

// ----------------- Logger --------------------------------
class Logger {

  constructor() {
    this.log = localStorage.getItem('log') || '';
    try { this.log = JSON.parse(this.log); } catch (e) { this.log = []; }
  }

  set(ref, message, error = false) {
    this.log.push([new Date().toString().substring(0, 24), ref, message, error]);
    this.log = this.log.slice(-100);                        // slice to the last 100 entries
    localStorage.setItem('log', JSON.stringify(this.log));
  }
}
const logger = new Logger();
// ----------------- /Logger -------------------------------