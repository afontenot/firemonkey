'use strict';

const update = []; // global

// ----------------- Context Menu --------------------------
class ContextMenu {

  constructor() {
    const contextMenus = [
      { id: 'options', contexts: ['browser_action'], icons: {16: 'image/gear.svg'} }, // FF53+
      { id: 'help', contexts: ['browser_action'], icons: {16: 'image/help32.png'} }
    ];

    contextMenus.forEach(item => {

      if (item.id && !item.title) { item.title = chrome.i18n.getMessage(item.id); } // always use the same ID for i18n
      if (item.id) { item.onclick = this.process; }
      chrome.contextMenus.create(item);
    });
  }

  process(info, tab, command){

    switch (info.menuItemId) {

      case 'options': break;
      case 'help': localStorage.setItem('nav', 'help'); break;
    }
    chrome.runtime.openOptionsPage();
  }
}

const menus = new ContextMenu();
// ----------------- /Context Menu -------------------------

// ----------------- Script Counter ------------------------
class Counter {

  constructor() {
    browser.browserAction.setBadgeBackgroundColor({color: '#cd853f'});
    browser.browserAction.setBadgeTextColor({color: '#fff'}); // FF63+
    browser.tabs.onUpdated.addListener(this.count, {urls: ['http://*/*', 'https://*/*', 'file:///*']});
  }

  async count(tabId, changeInfo, tab) {

    if (changeInfo.status !== 'complete') { return; }

    const frames = await browser.webNavigation.getAllFrames({tabId});
    const urls = [...new Set(frames.map(item => item.url).filter(item => /^(https?|wss?|ftp|file|about:blank)/.test(item)))];
    const gExclude = pref.globalScriptExcludeMatches ? pref.globalScriptExcludeMatches.split(/\s+/) : []; // cache the array
    const count = Object.keys(pref.content).filter(item =>
      pref.content[item].enabled && checkMatches(pref.content[item], urls, gExclude));
    browser.browserAction.setBadgeText({tabId, text: (count[0] ? count.length.toString() : '')});
  }
}
// ----------------- /Script Counter -----------------------

// ----------------- Register Content Script & CSS ---------
class ScriptRegister {

  constructor() {
    this.registered = {};
    this.FMV = browser.runtime.getManifest().version;         // FireMonkey version
  }

  async init() {
    this.platformInfo = await browser.runtime.getPlatformInfo();
    this.browserInfo = await browser.runtime.getBrowserInfo();
  }

  async process(id) {

    const script = pref.content[id];
    script.style = script.style || [];                        // preset

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
        options[target].push({code: pref.content[item][target].replace(metaRegEx, '')});
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
    options[target].push({code: script[target].replace(metaRegEx, '')});

    // --- script only
    if (script.js) {

      // --- unsafeWindow implementation
      options.js.unshift({code: 'const unsafeWindow = window.wrappedJSObject;'});

      options.scriptMetadata = {
        name: id,
        resource: script.resource || {},
        info: {                                               // GM.info data
          scriptHandler: 'FireMonkey',
          version: this.FMV,
          scriptMetaStr: null,
          platform: this.platformInfo,
          browser: this.browserInfo,
          script: {
            name: id,
            version: script.version,
            description: script.description,
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
      script.style.forEach((st, i) => {

        options.matches = st.matches;
        options.css = [{code: st.css}];
        this.register(id, options);
      });
    }
    else { this.register(id, options); }
  }

  register(id, options) {

    const API = options.js ? browser.userScripts : browser.contentScripts;
    // --- register page script
    try {                                                 // catches error throws before the Promise
      API.register(options)
      .then(reg => this.registered[id] = reg)             // contentScripts.RegisteredContentScript object
      .catch(console.error);
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
  }
}

const scriptReg = new ScriptRegister();
// ----------------- /Register Content Script & CSS --------

// ----------------- User Preference -----------------------
Pref.get().then(async() => {

  if (pref.hasOwnProperty('disableHighlight')) {            // v1.31 migrate
    browser.storage.local.remove('disableHighlight');
    delete pref.disableHighlight;
  }

  // --- storage sync check
  if (pref.sync) {

    await browser.storage.sync.get(null, result => {
      Object.keys(result).forEach(item => pref[item] = result[item]); // update pref with the saved version
    });
    browser.storage.local.set(pref);                        // update local saved pref
  }

  const days = pref.autoUpdateInterval *1;
  const doUpdate =  days && Date.now() > pref.autoUpdateLast + (days + 86400000); // 86400 * 1000 = 24hr


  await scriptReg.init();                                   // await data initialization
  Object.keys(pref.content).forEach(item => {

    scriptReg.process(item);
    doUpdate && pref.content[item].enabled && pref.content[item].autoUpdate && pref.content[item].updateURL &&
      pref.content[item].version && update.push(item);
  });

  update[0] && browser.idle.onStateChanged.addListener(onIdle);

  // --- Script Counter
  new Counter();
});

chrome.storage.onChanged.addListener((changes, area) => {   // Change Listener

  const changesKeys = Object.keys(changes);
  if (!changesKeys.find(item => notEqual(changes[item].oldValue, changes[item].newValue))) { return; }

  changesKeys.forEach(item => pref[item] = changes[item].newValue); // update pref with the saved version

  // --- find changed scripts
  if (changes.globalScriptExcludeMatches &&
    changes.globalScriptExcludeMatches.oldValue !== changes.globalScriptExcludeMatches.newValue) {
    Object.keys(pref.content).forEach(scriptReg.process);  // re-register all
  }
  else if (changes.hasOwnProperty('content') && notEqual(changes.content.oldValue, changes.content.newValue)) {

    Object.keys(changes.content.oldValue).forEach(item => {

      if (!changes.content.newValue[item]) {                // script was deleted
        const script = changes.content.oldValue[item];
        const id = script.name;
        // --- reset previous registers  (UserStyle Multi-segment Process)
        script.style[0] ? script.style.forEach((item, i) => scriptReg.unregister(id + 'style' + i)) : scriptReg.unregister(id);
      }
      else if (!changes.content.newValue[item].error && notEqual(changes.content.oldValue[item], changes.content.newValue[item])) {
        scriptReg.process(item);
      }
    });
  }

  // --- storage sync update
  if (pref.sync) {
    const size = JSON.stringify(pref).length;
    if (size > 102400) {
      notify(chrome.i18n.getMessage('errorSync', (size/1024).toFixed(1)));
      pref.sync = false;
      browser.storage.local.set({sync: false});
    }
    else { browser.storage.sync.set(pref); }
  }
});

function notEqual(a, b) {
  return JSON.stringify(a) !== JSON.stringify(b);
}

// ----------------- Web/Direct Install Listener ------------------
browser.webRequest.onBeforeRequest.addListener(processWebInstall, {
    urls: [ 'https://greasyfork.org/scripts/*.user.js',
            'https://greasyfork.org/scripts/*.user.css',
            'https://openuserjs.org/install/*.user.js'],
    types: ['main_frame']
  },
  ['blocking']
);

browser.tabs.onUpdated.addListener(processDirectInstall,{
  urls: [ '*://*/*.user.js', '*://*/*.user.css',
          'file:///*.user.js', 'file:///*.user.css' ]
});

function processWebInstall(e) {

  let q;
  switch (true) {

    case !e.originUrl: return;                              // end execution if not Web Install

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
      title = title ? title.textContent : 'Unknown';
      return confirm(chrome.i18n.getMessage('installConfirm', title)) ? title : null;
    })();`;

    chrome.tabs.executeScript({code}, (result = []) => {
      result[0] && getScript({updateURL: e.url, name: result[0]});
    });
    return {cancel: true};
  }
}

function processDirectInstall(tabId, changeInfo, tab) {

  if (changeInfo.status !== 'complete') { return; }        // end execution if not found
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
    result[0] && processResponse(result[0][0], result[0][1], tab.url);
  });
}



// ----------------- Content Message Handler ---------------
function processForbiddenHeaders(headers) {

  const forbiddenHeader = ['Accept-Charset', 'Accept-Encoding', 'Access-Control-Request-Headers',
    'Access-Control-Request-Method', 'Connection', 'Content-Length', 'Cookie2',
    'Date', 'DNT', 'Expect', 'Keep-Alive', 'TE',
    'Trailer', 'Transfer-Encoding', 'Upgrade', 'Via'];

  const specialHeader = ['Cookie', 'Host', 'Origin', 'Referer'];

  // --- remove forbidden headers (Attempt to set a forbidden header was denied: Referer)
  // --- allow specialHeader
  Object.keys(headers).forEach(item =>  {
    if (item.startsWith('Proxy-') || item.startsWith('Sec-') || forbiddenHeader.includes(item)) {
      delete headers[item];
    }
    else if (specialHeader.includes(item)) {
      headers['FM-' + item] = headers[item];                // set a new FM header
      delete headers[item];                                 // delete original header
    }
  });
}

// --- allow specialHeader
const FMUrl = browser.runtime.getURL(''); //global
browser.webRequest.onBeforeSendHeaders.addListener(e => {

    let found = false;
    e.originUrl && e.originUrl.startsWith(FMUrl) && e.requestHeaders.forEach((item, index) => {
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
  },
  {
    urls: ['<all_urls>'],
    types: ['xmlhttprequest']
  },
  ['blocking', 'requestHeaders']
);


browser.runtime.onMessage.addListener((message, sender) => {

  if (!message.api) { return; }

  const e = message.data;
  const name = message.name;
  const storage = '_' + name;
  const hasProperty = (p) => pref[storage] && Object.prototype.hasOwnProperty.call(pref[storage], p);
  let oldValue;

  switch (message.api) {

    case 'setValue':
      pref[storage] || (pref[storage] = {});                // make one if didn't exist
      if (pref[storage][e.key] === e.value) { return true; } // return if value hasn't changed
      oldValue = pref[storage][e.key];                      // need to cache it due to async processes
      e.broadcast && browser.tabs.query({}).then(tabs => {
        tabs.forEach(tab => browser.tabs.sendMessage(tab.id,
          {name, valueChange: {key: e.key, oldValue, newValue: e.value, remote: tab.id !== sender.tab.id}}));
      });
      pref[storage][e.key] = e.value;
      return browser.storage.local.set({[storage]: pref[storage]}); // Promise with no arguments OR reject with error message

    case 'getValue':
      return Promise.resolve(hasProperty(e.key) ? pref[storage][e.key] : e.defaultValue);

    case 'listValues':
      return Promise.resolve(pref[storage] ? Object.keys(pref[storage]) : []);

    case 'deleteValue':
      if (!hasProperty(e.key)) { return true; }             // return if nothing to delete
      oldValue = pref[storage][e.key];                      // need to cache it due to async processes
      e.broadcast && browser.tabs.query({}).then(tabs => {
        tabs.forEach(tab => browser.tabs.sendMessage(tab.id,
          {name, valueChange: {key: e.key, oldValue, newValue: e.value, remote: tab.id !== sender.tab.id}}));
      });
      delete pref[storage][e.key];
      return browser.storage.local.set({[storage]: pref[storage]});

    case 'openInTab':
      browser.tabs.create({url: e.url, active: e.active});  // Promise with tabs.Tab OR reject with error message
      break;

    case 'setClipboard':
      navigator.clipboard.writeText(e.text)                 // Promise with ? OR reject with error message
      .then(() => {})
      .catch(error => { console.error(error); notify(chrome.i18n.getMessage('errorClipboard')); }); // failed copy notification
      break;

    case 'notification': notify(e.text, name); break;

    case 'download':
      // --- check url
      const dUrl = checkURL(e.url, e.base);
      if (!dUrl) { return; }

      browser.downloads.download({                          // Promise with id OR reject with error message
        url: dUrl,
        filename: e.filename ? e.filename : null,
        saveAs: true,
        conflictAction: 'uniquify'
      })
      .then(() => {})
      .catch(error => notify(error.message, name));                 // failed notification
      break;


    case 'fetch':
      // --- check url
      const url = checkURL(e.url, e.base);
      if (!url) { return; }

      const init = {};
      ['method', 'headers', 'body', 'mode', 'credentials', 'cache', 'redirect', 'referrer', 'referrerPolicy',
        'integrity', 'keepalive', 'signal'].forEach(item => e.init.hasOwnProperty(item) && (init[item] = e.init[item]));

      // --- remove forbidden headers
      init.headers && processForbiddenHeaders(init.headers);

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
        .catch(console.error);
      break;

    case 'xmlHttpRequest':
      const xhrUrl = checkURL(e.url, e.base);
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
           processForbiddenHeaders(e.headers);
           Object.keys(e.headers).forEach(item => xhr.setRequestHeader(item, e.headers[item]));
        }
        xhr.send(e.data);

        xhr.onload =      () => resolve(makeResponse(xhr, 'onload'));
        xhr.onerror =     () => resolve(makeResponse(xhr, 'onerror'));
        xhr.ontimeout =   () => resolve(makeResponse(xhr, 'ontimeout'));
        xhr.onabort =     () => resolve(makeResponse(xhr, 'onabort'));
        xhr.onprogress =  () => { };
      });
      break;
  }
});

function makeResponse(xhr, type) {

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

function checkURL(url, base) {

  try { url = new URL(url, base); }
  catch (error) {
    console.error(error.message);
    return;
  }

  // --- check protocol
  if (!['http:', 'https:', 'ftp:', 'ftps:'].includes(url.protocol)) {
    console.error('Unsupported Protocol ' + url.protocol);
    return;
  }
  return url.href;
}
// ----------------- /Content Message Handler --------------

// ----------------- Remote Update -------------------------
function onIdle() {

  if (state !== 'idle' || !update[0]) { return; }

  pref.autoUpdateLast = Date.now();
  browser.storage.local.set({autoUpdateLast: pref.autoUpdateLast}); // update saved pref

  // --- do 10 updates at a time
  const sect = update.splice(0, 10);
  update[0] || browser.idle.onStateChanged.removeListener(onIdle);
  sect.forEach(item => pref.content.hasOwnProperty(item) && getUpdate(pref.content[item])); // check if script wasn't deleted
}

function processResponse(text, name, updateURL) {

  const userMatches = pref.content[name] ? pref.content[name].userMatches : '';
  const userExcludeMatches = pref.content[name] ? pref.content[name].userExcludeMatches : '';

  const data = getMetaData(text, userMatches, userExcludeMatches);
  if (!data) { throw `${name}: Meta Data error`; }

  // --- check version, if update existing
  if (pref.content[name] && !higherVersion(data.version, pref.content[name].version)) { return; }

  // --- check name, if update existing
  if (pref.content[name] && data.name !== name) {           // name has changed

    if (pref.content[data.name]) { throw `${name}: Update new name already exists`; } // name already exists
    else {

      if (pref['_' + name]) {                               // move storage
        pref['_' + data.name] = pref['_' + name];
        delete pref['_' + name];
        browser.storage.local.remove('_' + name);
      }
      delete pref.content[name];
    }

    scriptReg.unregister(name);                             // --- unregister old name
  }

  // --- update from previous version
  if (pref.content[data.name]) {
    data.enabled = pref.content[data.name].enabled;
    data.autoUpdate = pref.content[data.name].autoUpdate;

    console.log(data.name, 'updated to version', data.version);
  }

  // --- check for Web Install, set install URL
  if (updateURL.startsWith('https://greasyfork.org/scripts/') ||
      updateURL.startsWith('https://openuserjs.org/install/')) {
    data.updateURL = updateURL;
    data.autoUpdate = true;
  }

  pref.content[data.name] = data;                           // save to pref
  browser.storage.local.set({content: pref.content});       // update saved pref
  data.enabled && scriptReg.process(data.name);
}
// ----------------- /Remote Update ------------------------