'use strict';

// ----- global
const registered = {};
const update =[];

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
});

function updatePref(result) {
  Object.keys(result).forEach(item => pref[item] = result[item]); // update pref
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

  // --- preppare scrip options
  const options = {

    matchAboutBlank: pref.content[id].matchAboutBlank,
    allFrames: pref.content[id].allFrames,
    runAt: pref.content[id].runAt
  };

  ['matches', 'excludeMatches', 'includeGlobs', 'excludeGlobs'].forEach(item => {
    pref.content[id][item][0] && (options[item] = pref.content[id][item]);
  });

  // --- add CSS & JS
  // Removing metaBlock since there would be an error with /* ... *://*/* ... */
  if (pref.content[id].css) { 
    options.css = [{code: pref.content[id].css.replace(metaRegEx, '')}]; 
  }
  else if (pref.content[id].js) {
    options.js = [{code: pref.content[id].js.replace(metaRegEx, '')}];
    options.scriptMetadata = {
      name: id
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
function removeForbiddenHeaders(headers) {

  const forbiddenHeader = ['Accept-Charset', 'Accept-Encoding', 'Access-Control-Request-Headers',
    'Access-Control-Request-Method', 'Connection', 'Content-Length', 'Cookie', 'Cookie2',
    'Date', 'DNT', 'Expect', 'Host', 'Keep-Alive', 'Origin', 'Referer', 'TE',
    'Trailer', 'Transfer-Encoding', 'Upgrade', 'Via'];

  // --- remove forbidden headers (Attempt to set a forbidden header was denied: Referer)
  Object.keys(headers).forEach(item =>  {
    if (item.startsWith('Proxy-') || item.startsWith('Sec-') || forbiddenHeader.includes(item)) {
      delete headers[item];
    }
  });
}

browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {

  const e = message.data;
  const name = message.name;
  const storage = '_' + name;
  const hasProperty = (p) => pref[storage] && Object.prototype.hasOwnProperty.call(pref[storage], p);


  switch (message.api) {

    case 'setValue':
      if (!['string', 'number', 'boolean'].includes(typeof e.value)) { throw `${name}: Unsupported value in setValue()`; }
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
      init.headers && removeForbiddenHeaders(init.headers);

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
           removeForbiddenHeaders(e.headers);
           Object.keys(e.headers).forEach(item => xhr.setRequestHeader(item, e.headers[item]));
        }
        xhr.send(e.data);

        xhr.onload = () => resolve({
          readyState:       xhr.readyState,
          response:         xhr.response,
          responseHeaders:  xhr.getAllResponseHeaders(),
          responseText:     ['', 'text'].includes(xhr.responseType) ? xhr.responseText : '', // responseText is only available if responseType is '' or 'text'.
          responseType:     xhr.responseType,
          responseURL:      xhr.responseURL,
          responseXML:      ['', 'document'].includes(xhr.responseType) ? xhr.responseXML : '', // responseXML is only available if responseType is '' or 'document'.
          status:           xhr.status,
          statusText:       xhr.statusText,
          finalUrl:         xhr.responseURL
        });
        xhr.onerror = () => resolve({
          error:            'error',
          responseHeaders:  xhr.getAllResponseHeaders(),
          status:           xhr.status,
          statusText:       xhr.statusText
        });
        xhr.ontimeout = () => resolve({
          error:            'timeout',
          responseHeaders:  xhr.getAllResponseHeaders(),
          status:           xhr.status,
          statusText:       xhr.statusText
        });
        xhr.onabort = () => resolve({
          error:            'abort',
          responseHeaders:  xhr.getAllResponseHeaders(),
          status:           xhr.status,
          statusText:       xhr.statusText
        });
        xhr.onprogress = () => { };
      });
      break;
  }
});

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

async function processResponse(text, name) {

  const data = getMetaData(text);
  if (!data) { throw `${name}: Update Meta Data error`; }

  // --- check version
  if (compareVersion(data.version, pref.content[name].version) !== '>') { return; }

  // --- check name
  if (data.name !== name) {                                 // name has changed

    if (pref.content[data.name]) { throw `${name}: Update new name already exists`; } // name already exists
    else {

      if (pref['_' + name]) {                               // move storage
        pref['_' + data.name] = pref['_' + name];
        delete pref['_' + name];
        browser.storage.local.remove('_' + name);
      }
      delete pref.content[name];
    }
  }

  // --- update from previous version
  data.enabled = pref.content[data.name].enabled;
  data.autoUpdate = pref.content[data.name].autoUpdate;

  console.log(name, 'updated to version', data.version);
  pref.content[data.name] = data;                           // save to pref
  browser.storage.local.set({content: pref.content});       // update saved pref

  if (data.name !== name) { bg.unregister(name); }          // --- unregister old name 
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