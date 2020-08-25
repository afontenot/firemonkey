'use strict';

browser.userScripts.onBeforeScript.addListener(script => {

  const name = script.metadata.name;
  const resource = script.metadata.resource;
  const scriptOptions = {
    command: {},
    valueChange: {}
  };
  
  browser.runtime.onMessage.addListener((message, sender) => {

    switch (true) {
      // --- to popup.js for registerMenuCommand
      case message.hasOwnProperty('listCommand'):
        const command = Object.keys(scriptOptions.command);
        command[0] && browser.runtime.sendMessage({name, command});
        break;

      // from popup.js for registerMenuCommand
      case message.name === name && message.hasOwnProperty('command'):
        (scriptOptions.command[message.command])();
        break;

      // from script for addValueChangeListener
      case message.name === name && message.hasOwnProperty('valueChange'):
        const e = message.valueChange;
        (scriptOptions.valueChange[e.key])(e.key, e.oldValue, e.newValue, e.remote);
        break;
    }
  });

  /*
    Ref: robwu (Rob Wu)
    In order to make callback functions visible
    ONLY for GM.xmlHttpRequest(GM_xmlhttpRequest)
  */
  function callUserScriptCallback(object, name, ...args) {
    try {
      const cb = object.wrappedJSObject[name];
      typeof cb === 'function' && cb(...args);
    } catch(error) { console.error(name, error.message); }
  }

  // --- GM4 Object based functions
  const GM = {

    async setValue(key, value) {

      if (!['string', 'number', 'boolean'].includes(typeof value)) { throw `${name}: Unsupported value in setValue()`; }
      return await browser.runtime.sendMessage({
        name,
        api: 'setValue',
        data: {key, value, broadcast: scriptOptions.valueChange.hasOwnProperty(key)}
      });
    },

    async getValue(key, defaultValue) {

      return await browser.runtime.sendMessage({
        name,
        api: 'getValue',
        data: {key, defaultValue}
      });
    },

    async listValues() {

      const response = await browser.runtime.sendMessage({
        name,
        api: 'listValues',
        data: {}
      });
      return script.export(response);
    },

    async deleteValue(key) {

     return await browser.runtime.sendMessage({
        name,
        api: 'deleteValue',
        data: {key, broadcast: scriptOptions.valueChange.hasOwnProperty(key)}
      });
    },

    async openInTab(url, open_in_background) {

      return await browser.runtime.sendMessage({
        name,
        api: 'openInTab',
        data: {url, active: !open_in_background}
      });
    },

    async setClipboard(text) {

      return await browser.runtime.sendMessage({
        name,
        api: 'setClipboard',
        data: {text}
      });
    },

    async notification(text, title, image, onclick) {
      // (text, title, image, onclick) | ({text, title, image, onclick})
      const txt = typeof text === 'string' ? text : text.text;
      if (typeof txt !== 'string' || !txt.trim()) { return; }
      return await browser.runtime.sendMessage({
        name,
        api: 'notification',
        data: typeof text === 'string' ? {text, title, image, onclick} : text
      });
    },

    async fetch(url, init = {}) {

      const response = await browser.runtime.sendMessage({
        name,
        api: 'fetch',
        data: {url, init, base: location.href}
      });

      // cloneInto() work around for https://bugzilla.mozilla.org/show_bug.cgi?id=1583159
      return response ? (typeof response === 'string' ? script.export(response) : cloneInto(response, window)) : null;
    },

    async xmlHttpRequest(init) {

      const data = {
        method: 'GET',
        data: null,
        user: null,
        password: null,
        responseType: '',
        base: location.href
      };

      ['url', 'method', 'headers', 'data', 'overrideMimeType', 'user', 'password',
        'timeout', 'withCredentials', 'responseType'].forEach(item => init.hasOwnProperty(item) && (data[item] = init[item]));

      const response = await browser.runtime.sendMessage({
        name,
        api: 'xmlHttpRequest',
        data
      });

      if (!response) { throw 'There was an error with the xmlHttpRequest request.'; }

      // only these 4 callback functions are processed
      // cloneInto() work around for https://bugzilla.mozilla.org/show_bug.cgi?id=1583159
      const type = response.type;
      delete response.type;
      callUserScriptCallback(init, type,
         typeof response.response === 'string' ? script.export(response) : cloneInto(response, window));
    },

    addStyle(css) {
      try {
        const style = document.createElement('style');
        style.textContent = css;
        (document.head || document.body || document.documentElement || document).appendChild(style);
      } catch(error) { console.error(name, error.message); }
    },


    async getResourceText(resourceName) {

      const response = await browser.runtime.sendMessage({
        name,
        api: 'fetch',
        data: {url: resource[resourceName], init: {}, base: ''}
      });

      return response ? script.export(response) : null;
    },

    getResourceURL(resourceName) { return resource[resourceName]; },

    registerMenuCommand(text, onclick, accessKey) { scriptOptions.command[text] = onclick; },

    unregisterMenuCommand(text) { delete scriptOptions.command[text]; },

    addValueChangeListener(key, callback) {

      scriptOptions.valueChange[key] = callback;
      return key;
    },

    removeValueChangeListener(key) { delete scriptOptions.valueChange[key]; },

    async download(url, filename) {

      return browser.runtime.sendMessage({
        name,
        api: 'download',
        data: {url, filename, base: location.href}
      });
    },

    log(...text) { console.log(name + ':', ...text); },
    info: script.metadata.info
  };

  script.defineGlobals({

    GM,
    GM_setValue:                  GM.setValue,
    GM_getValue:                  GM.getValue,
    GM_deleteValue:               GM.deleteValue,
    GM_listValues:                GM.listValues,
    GM_openInTab:                 GM.openInTab,
    GM_setClipboard:              GM.setClipboard,
    GM_notification:              GM.notification,
    GM_xmlhttpRequest:            GM.xmlHttpRequest,
    GM_info:                      GM.info,
    GM_addStyle:                  GM.addStyle,

    GM_getResourceText:           GM.getResourceText,
    GM_getResourceURL:            GM.getResourceUrl,
    GM_registerMenuCommand:       GM.registerMenuCommand,
    GM_unregisterMenuCommand:     GM.unregisterMenuCommand,
    GM_log:                       GM.log,

    GM_addValueChangeListener:    GM.addValueChangeListener,
    GM_removeValueChangeListener: GM.removeValueChangeListener,
    GM_download:                  GM.download,

    GM_fetch:                     GM.fetch
  });
});