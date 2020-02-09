'use strict';

browser.userScripts.onBeforeScript.addListener(script => {

  const name = script.metadata.name;

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
        data: {key, value}
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
        data: {key}
      });
    },

    openInTab(url, open_in_background) {

      return browser.runtime.sendMessage({
        name,
        api: 'openInTab',
        data: {url, active: !open_in_background}
      });
    },

    setClipboard(text) {

      return browser.runtime.sendMessage({
        name,
        api: 'setClipboard',
        data: {text}
      });
    },

    notification(text) {

      return browser.runtime.sendMessage({
        name,
        api: 'notification',
        data: {text}
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

    getResourceURL() {
      return null;
    },

    addStyle(css) {
      try {
        const style = document.createElement('style');
        style.textContent = css;
        (document.head || document.body || document.documentElement).appendChild(style);
      } catch(error) { console.error(name, error.message); }
    },

    info: script.metadata.info
  };

  script.defineGlobals({

    GM,
    GM_setValue:        GM.setValue,
    GM_getValue:        GM.getValue,
    GM_deleteValue:     GM.deleteValue,
    GM_listValues:      GM.listValues,
    GM_openInTab:       GM.openInTab,
    GM_setClipboard:    GM.setClipboard,
    GM_notification:    GM.notification,
    GM_xmlhttpRequest:  GM.xmlHttpRequest,
    GM_getResourceURL:  GM.getResourceUrl,
    GM_info:            GM.info,
    GM_addStyle:        GM.addStyle,
    
    GM_fetch:           GM.fetch
  });
});