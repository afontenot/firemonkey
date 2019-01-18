'use strict';

// ----- global
const registered = {};
const registeredTrack = {};
const update =[];
const tabCache = {};

// ----------------- User Preference -----------------------
chrome.storage.local.get(null, result => {
  Object.keys(result).forEach(item => pref[item] = result[item]); // update pref with the saved version
  
  const days = pref.autoUpdateInterval *1;
  const doUpdate =  days && Date.now() > pref.autoUpdateLast + (days + 86400000); // 86400 * 1000 = 24hr
  
  Object.keys(pref.content).forEach(item => {
    register(item);

    doUpdate && pref.content[item].enabled && pref.content[item].autoUpdate &&
    pref.content[item].updateURL && pref.content[item].version && update.puch(pref.content[item].name);
  });
  
  update[0] && browser.idle.onStateChanged.addListener(onIdle); // FF51+
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

  // --- preppare scrip options
  const options = {

    matchAboutBlank: pref.content[id].matchAboutBlank,
    allFrames: pref.content[id].allFrames,
    runAt: pref.content[id].runAt
  };

  ['matches', 'excludeMatches', 'includeGlobs', 'excludeGlobs'].forEach(item => {
    pref.content[id][item][0] && (options[item] = pref.content[id][item]);
  });

  // --- register page script
  try { registerTrack(id, options); } catch(error) { processError(id, error.message); }

  // --- stop if script is not enabled
  if (!pref.content[id].enabled) { return; }

  // --- add CSS & JS
  if (pref.content[id].css) { options.css = [{code: pref.content[id].css}]; }
  else if (pref.content[id].js) {

    options.js = [{code: pref.content[id].js}];
    options.scriptMetadata = {
      name: id
    };
  }

  const API = pref.content[id].js ? browser.userScripts : browser.contentScripts;

  API.register(options)
  .then(reg => registered[id] = reg)                      // contentScripts.RegisteredContentScript object
  .catch(console.error);
}

async function unregister(id) {

  if (registered[id]) {
    await registered[id].unregister();
    delete registered[id];
  }
}

function registerTrack(id, options) {

  options.js = [{code:
    `browser.runtime.onMessage.addListener(() => browser.runtime.sendMessage({id: ${JSON.stringify(id)}}));`
  }];

  browser.contentScripts.register(options)
  .then(reg => registeredTrack[id] = reg)                   // contentScripts.RegisteredContentScript object
  .catch(console.error);
}

async function unregisterTrack(id) {                        // only in case of chnaging name or deleting script/css

  if (registeredTrack[id]) {
    await registeredTrack[id].unregister();
    delete registeredTrack[id];
  }
}

function processError(id, error) {

  pref.content[id].error = error;                           // store error message
  pref.content[id].enabled = false;                         // disable the script
  browser.storage.local.set(pref);                          // update saved pref  
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

  switch (message.api) {
    
    case 'openInTab':
      browser.tabs.create({url: e.url, active: e.active});
      break;

    case 'setClipboard':
      navigator.clipboard.writeText(e.text)
      .then(() => {})
      .catch(error => { console.error(error); notify(chrome.i18n.getMessage('errorClipboard')); }); // failed copy notification
      break;

    case 'notification': notify(e.text, null, message.name); break;

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
        e.responseType && (xhr.responseType = e.responseType);
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
          responseText:     xhr.responseText,
          responseType:     xhr.responseType,
          responseURL:      xhr.responseURL,
          responseXML:      xhr.responseXML,
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
  browser.storage.local.set(pref);                          // update saved pref
  
  // --- do 10 updates at a time
  const sect = update.splice(0, 10);
  update[0] || browser.idle.onStateChanged.removeListener(onIdle);
  sect.forEach(item => pref.content.hasOwnProperty(item) && getUpdate(pref.content[item])); // check if script wasn't deleted
}

function processResponse(text, name) {

  const data = getMetaData(text);
  if (!data) { throw `${name}: Update Meta Data error`; }

  // --- check version
  if (compareVersion(data.version, pref.content[name].version) !== '>') { return; }

  // --- check name
  if (data.name !== name) {                                 // name has changed

    if (pref.content[data.name]) { throw `${name}: Update new name already exists`; } // name already exists
    else { delete pref.content[name]; }
  }
  
  // --- update from previous version
  data.enabled = pref.content[data.name].enabled;
  data.autoUpdate = pref.content[data.name].autoUpdate;  
  
  // --- unregister old version
  unregister(name);
  unregisterTrack(name);  

  console.log(name, 'updated to version', data.version);
  pref.content[data.name] = data;                           // save to pref
  browser.storage.local.set(pref);                          // update saved pref

  if (data.enabled) {
    register(data.name);
    registerTrack(data.name);
  }
}
// ----------------- /Remote Update ------------------------

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