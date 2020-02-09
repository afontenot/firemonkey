'use strict';

// ----- global
const registered = {};
const update =[];
const FMV = browser.runtime.getManifest().version;          // FireMonkey version
const FMUrl = browser.runtime.getURL('');

// ----------------- User Preference -----------------------
chrome.storage.local.get(null, result => {
  Object.keys(result).forEach(item => pref[item] = result[item]); // update pref with the saved version

  const days = pref.autoUpdateInterval *1;
  const doUpdate =  days && Date.now() > pref.autoUpdateLast + (days + 86400000); // 86400 * 1000 = 24hr

  Object.keys(pref.content).forEach(name => {

    register(name);
    doUpdate && pref[name].enabled && pref[name].autoUpdate && pref[name].updateURL &&
      pref[name].version && update.puch(name);
  });

  update[0] && browser.idle.onStateChanged.addListener(onIdle); // FF51+

  // --- Script Counter
  browser.tabs.onUpdated.addListener(counter, {urls: ['http://*/*', 'https://*/*', 'file:///*']});
  browser.browserAction.setBadgeBackgroundColor({color: '#cd853f'});
  browser.browserAction.setBadgeTextColor({color: '#fff'}); // FF63+
});

chrome.storage.onChanged.addListener((changes, area) => {   // Change Listener
  Object.keys(changes).forEach(item => pref[item] = changes[item].newValue); // update pref with the saved version
  changes.globalScriptExcludeMatches && 
    changes.globalScriptExcludeMatches.oldValue !== changes.globalScriptExcludeMatches.newValue &&
      Object.keys(pref.content).forEach(register);
});

function updatePref(result) {
  Object.keys(result).forEach(item => pref[item] = result[item]); // update pref
}

// ----------------- Web/Direct Install Listener ------------------
browser.webRequest.onBeforeRequest.addListener(processWebInstall,
  {
    urls: [
      'https://greasyfork.org/scripts/*.user.js'
    ]
    , types: ['main_frame']
  },
  ['blocking']
);

browser.tabs.onUpdated.addListener(processDirectInstall,
  {
    urls: [
        'https://greasyfork.org/scripts/*.user.js',
        'file:///*/*.user.js'
      ]
});

function processWebInstall(e) {

  switch (true) {

    // --- Greasy Fork
    case e.originUrl && e.originUrl.startsWith('https://greasyfork.org/') && e.url.startsWith('https://greasyfork.org/'):
      const GF = String.raw`(() => {
        const title = location.href.endsWith('/code') ? document.title.replace(/\s+-[\s\w]+$/, '') : document.title;
        return confirm(chrome.i18n.getMessage('installConfirm', title)) ? title : null;
      })();`;

      chrome.tabs.executeScript({code: GF}, (result = []) => {
        result[0] && getUpdate({updateURL: e.url, name: result[0]});
      });
      return {cancel: true};
  }
}

function processDirectInstall(tabId, changeInfo, tab) {

  if (changeInfo.status !== 'complete') { return; }        // end execution if not found

  const DS = String.raw`(() => {
    const pre = document.querySelector('pre');
    if (!pre || !pre.textContent.trim()) { notify(chrome.i18n.getMessage('errorMeta')); return; }
    const name = pre.textContent.match(/(?:\/\/)?\s*@name\s+([^\r\n]+)/);
    if (!name) { notify(chrome.i18n.getMessage('errorMeta')); return; }
    return confirm(chrome.i18n.getMessage('installConfirm', name[1])) ? [pre.textContent, name[1]] : null;
  })();`;

  chrome.tabs.executeScript({code: DS}, (result = []) => {
    result[0] && processResponse(result[0][0], result[0][1], tab.url);
  });
}

// ----------------- Context Menu --------------------------
const contextMenus = [

  { id: 'options', contexts: ['browser_action'], icons: {16: 'image/gear.svg'} } // FF53+
];


for (const item of contextMenus) {

  if (item.id && !item.title) { item.title = chrome.i18n.getMessage(item.id); } // always use the same ID for i18n
  if (item.id) { item.onclick = process; }
  chrome.contextMenus.create(item);
}

function process(info, tab, command){

  switch (info.menuItemId) {

    case 'options': chrome.runtime.openOptionsPage(); break;
  }
}

// ----------------- Register Content Script & CSS ---------
async function register(id) {

  // --- reset previous registers
  if (registered[id]) {
    await registered[id].unregister();
    delete registered[id];
  }

  // --- stop if script is not enabled
  if (!pref.content[id].enabled) { return; }

  // --- preppare script options
  const options = {

    matchAboutBlank: pref.content[id].matchAboutBlank,
    allFrames: pref.content[id].allFrames,
    runAt: pref.content[id].runAt
  };

  ['matches', 'excludeMatches', 'includeGlobs', 'excludeGlobs'].forEach(item => {
    pref.content[id][item][0] && (options[item] = pref.content[id][item]);
  });
  
  // --- add Global Script Exclude Matches
  if (pref.globalScriptExcludeMatches) { 
    console.log(pref.content[id].excludeMatches);
    options.excludeMatches = [... pref.content[id].excludeMatches, ...pref.globalScriptExcludeMatches.split(/\s+/)];
    console.log(options.excludeMatches);
  }

  // --- add CSS & JS
  // Removing metaBlock since there would be an error with /* ... *://*/* ... */
  if (pref.content[id].css) {

    options.css = [];
    if (pref.content[id].require && pref.content[id].require[0]) { // add @require
      pref.content[id].require.forEach(item => pref.content[item] && pref.content[item].css &&
        options.css.push({code: pref.content[item].css.replace(metaRegEx, '')}));
    }
    options.css.push({code: pref.content[id].css.replace(metaRegEx, '')});
  }
  else if (pref.content[id].js) {

    options.js = [{code: 'const unsafeWindow = window.wrappedJSObject;'}]; // unsafeWindow implementation
    if (pref.content[id].require && pref.content[id].require[0]) { // add @require
      pref.content[id].require.forEach(item => {
      
        if (item.startsWith('lib/')) { options.js.unshift({file: item}); }
        else if (pref.content[item] && pref.content[item].js) {
          options.js.unshift({code: pref.content[item].js.replace(metaRegEx, '')})
        }
      });
    }
    options.js.push({code: pref.content[id].js.replace(metaRegEx, '')});

    options.scriptMetadata = {
      name: id,
      info: {                                               // GM.info data
        scriptHandler: 'FireMonkey',
        version: FMV,
        scriptMetaStr: null,
        script: {
          name: id,
          version: pref.content[id].version,
          description: pref.content[id].description,
          matches: pref.content[id].matches,
          includes: pref.content[id].matches,
          excludes: pref.content[id].excludeMatches,
          'run-at': pref.content[id].runAt.replace('_', '-'),
          namespace: null,
          resources: null
        }
      }
    };
  }

  const API = pref.content[id].js ? browser.userScripts : browser.contentScripts;

  // --- register page script
  try {                                                     // matches error throws before the Promise

    API.register(options)
    .then(reg => registered[id] = reg)                      // contentScripts.RegisteredContentScript object
    .catch(console.error);

  } catch(error) { processError(id, error.message); }
}

async function unregister(id) {

  if (registered[id]) {
    await registered[id].unregister();
    delete registered[id];
  }
}

function processError(id, error) {

  pref.content[id].error = error;                           // store error message
  pref.content[id].enabled = false;                         // disable the script
  browser.storage.local.set({content: pref.content});       // update saved pref
}
// ----------------- /Register Content Script & CSS --------

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


browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {

  const e = message.data;
  const name = message.name;
  const storage = '_' + name;
  const hasProperty = (p) => pref[storage] && Object.prototype.hasOwnProperty.call(pref[storage], p);


  switch (message.api) {

    case 'setValue':
      pref[storage] || (pref[storage] = {});                // make one if didn't exist
      if (pref[storage][e.key] === e.value) { return true; } // return if value hasn't changed
      pref[storage][e.key] = e.value;
      return await browser.storage.local.set({[storage]: pref[storage]});

    case 'getValue':
      return hasProperty(e.key) ? pref[storage][e.key] : e.defaultValue;

    case 'listValues':
      return pref[storage] ? Object.keys(pref[storage]) : [];

    case 'deleteValue':
      if (!hasProperty(e.key)) { return true; }             // return if nothing to delete
      delete pref[storage][e.key];
      return await browser.storage.local.set({[storage]: pref[storage]});

    case 'openInTab':
      browser.tabs.create({url: e.url, active: e.active});
      break;

    case 'setClipboard':
      navigator.clipboard.writeText(e.text)
      .then(() => {})
      .catch(error => { console.error(error); notify(chrome.i18n.getMessage('errorClipboard')); }); // failed copy notification
      break;

    case 'notification': notify(e.text, null, name); break;

    case 'fetch':
      // --- check url
      const url = checkURL(e.url, e.base);
      if (!url) { return; }

      const init = {};
      ['method', 'headers', 'body', 'mode', 'credentials', 'cache', 'redirect', 'referrer', 'referrerPolicy',
        'integrity', 'keepalive', 'signal'].forEach(item => e.init.hasOwnProperty(item) && (init[item] = e.init[item]));

      // --- remove forbidden headers
      init.headers && processForbiddenHeaders(init.headers);

      return await fetch(url, init)
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

      return await new Promise((resolve, reject) => {

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

  const data = getMetaData(text, pref.content[name].userMatches, pref.content[name].userExcludeMatches);
  if (!data) { throw `${name}: Meta Data error`; }

  // --- check version, if update existing
  if (pref.content[name] && compareVersion(data.version, pref.content[name].version) !== '>') { return; }

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

    unregister(name);                                       // --- unregister old name
  }

  // --- update from previous version
  if (pref.content[data.name]) {
    data.enabled = pref.content[data.name].enabled;
    data.autoUpdate = pref.content[data.name].autoUpdate;

    console.log(data.name, 'updated to version', data.version);
  }

  // --- check for Web Install, set install URL
  if (!data.updateURL && updateURL.startsWith('https://greasyfork.org/scripts/')) {
    data.updateURL = updateURL;
    data.autoUpdate = true;
  }

  pref.content[data.name] = data;                           // save to pref
  browser.storage.local.set({content: pref.content});       // update saved pref
  data.enabled && register(data.name);
}
// ----------------- /Remote Update ------------------------

// ----------------- Script Counter ------------------------
async function counter(tabId, changeInfo, tab) {

  if (changeInfo.status !== 'complete') { return; }        // end execution if not found

  const frames = await browser.webNavigation.getAllFrames({tabId});
  const urls = [...new Set(frames.map(item => item.url).filter(item => /^(https?|wss?|ftp|file|about:blank)/.test(item)))];
  const count = Object.keys(pref.content).filter(item => checkMatches(pref.content[item], urls));
  browser.browserAction.setBadgeText({tabId, text: (count[0] ? count.length.toString() : '')});
}
// ----------------- /Script Counter -----------------------

// ----------------- Helper functions ----------------------
function notify(message, id = '', title = chrome.i18n.getMessage('extensionName')) {

  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: 'image/icon.svg',
    title,
    message
  });
}
// ----------------- /Helper functions ---------------------