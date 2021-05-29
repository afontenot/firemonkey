browser.userScripts.onBeforeScript.addListener(script => {

  const name = script.metadata.name;
  const resource = script.metadata.resource;

  // --------------- Script Storage ------------------------
  const id = '_' + name;                                    // set id as _name
  let storage = script.metadata.storage;
  browser.storage.local.get(id).then((result = {}) => storage = result[id].storage);

  const cache = {};
  const valueChange = {};

  function storageChange(changes, area) {

    if (changes.hasOwnProperty(id)) {

      const oldValue = changes[id].storage.oldValue || {};
      const newValue = changes[id].storage.newValue || {};

      // process addValueChangeListener (only for remote) (key, oldValue, newValue, remote)
      Object.keys(valueChange).forEach(item =>
         oldValue[item] !== newValue[item] &&
          (valueChange[item])(item, oldValue[item], newValue[item], newValue[item] !== cache[item])
      );
    }
  }

  // ----- synch APIs
  function GM_getValue(key, defaultValue) {
    return storage.hasOwnProperty(key) ? storage[key] : defaultValue;
  }

  function GM_listValues() {
    return script.export(Object.keys(storage));
  }

  // --------------- Script Command ------------------------
  const scriptCommand = {};
  browser.runtime.onMessage.addListener((message, sender) => {

    switch (true) {
      // --- to popup.js for registerMenuCommand
      case message.hasOwnProperty('listCommand'):
        const command = Object.keys(scriptCommand);
        command[0] && browser.runtime.sendMessage({name, command});
        break;

      // from popup.js for registerMenuCommand
      case message.name === name && message.hasOwnProperty('command'):
        (scriptCommand[message.command])();
        break;
    }
  });

  // --------------- xmlHttpRequest callback ---------------
  /*
    Ref: robwu (Rob Wu)
    In order to make callback functions visible
    ONLY for GM.xmlHttpRequest(GM_xmlhttpRequest)
  */
  function callUserScriptCallback(object, name, ...args) {
    try {
      const cb = object.wrappedJSObject[name];
      typeof cb === 'function' && cb(...args);
    } catch(error) { log(`callUserScriptCallback ➜ ${error.message}`, 'error'); }
  }

  // --------------- log from background -------------------
  function log(message, type) {
    browser.runtime.sendMessage({
      name,
      api: 'log',
      data: {message, type}
    });
  }

  // ----- auxiliary regex include/exclude test function
  function matchURL() {
    const url = location.href;
    const includes = script.metadata.info.script.includes;
    const excludes = script.metadata.info.script.excludes;
    return (!includes[0] || arrayTest(includes, url)) && (!excludes[0] || !arrayTest(excludes, url));
  }

  function arrayTest(arr, url) {
    return new RegExp(arr.map(item => `(${item.slice(1, -1)})`).join('|'), 'i').test(url);
  }

  // ----- cloneInto wrapper for object methods
  function cloneIntoFM(obj, target, options = {}) {
    return cloneInto(options.cloneFunctions ? obj.wrappedJSObject : obj, target, options);
  }

  // --------------- GM4 Object based functions ------------
  const GM = {

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

    async setValue(key, value) {

      if (!['string', 'number', 'boolean'].includes(typeof value)) { throw `${name}: Unsupported value in setValue()`; }
      cache[key] = value;
      return await browser.runtime.sendMessage({
        name,
        api: 'setValue',
        data: {key, value}
      });
    },

    async deleteValue(key) {

      delete cache[key];
      return await browser.runtime.sendMessage({
        name,
        api: 'deleteValue',
        data: {key}
      });
    },

    addValueChangeListener(key, callback) {

      browser.storage.onChanged.hasListener(storageChange) || browser.storage.onChanged.addListener(storageChange)
      valueChange[key] = callback;
      return key;
    },

    removeValueChangeListener(key) { delete valueChange[key]; },

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

    async getResourceText(resourceName) {

      const response = await browser.runtime.sendMessage({
        name,
        api: 'fetch',
        data: {url: resource[resourceName], init: {}}
      });

      return response ? script.export(response) : null;
    },

    getResourceUrl(resourceName) {                          // GreaseMonkey | TamperMonkey
      return resource[resourceName];
    },

    getResourceURL(resourceName) {                          // ViolentMonkey
      return resource[resourceName];
    },

    registerMenuCommand(text, onclick, accessKey) {
      scriptCommand[text] = onclick;
    },

    unregisterMenuCommand(text) {
      delete scriptCommand[text];
    },

    async download(url, filename) {

      return await browser.runtime.sendMessage({
        name,
        api: 'download',
        data: {url, filename, base: location.href}
      });
    },

    addStyle(css) {

      if (!css) { return; }
      try {
        const node = document.createElement('style');
        node.textContent = css;
        node.dataset.src = name + '.user.js';
        (document.head || document.body || document.documentElement || document).appendChild(node);
      } catch(error) { log(`addStyle ➜ ${error.message}`, 'error'); }
    },

    addScript(js) {

      if (!js) { return; }
      try {
        const node = document.createElement('script');
        node.textContent = js;
        if (script.metadata.injectInto !== 'page') {
          node.textContent +=
            `\n\n//# sourceURL=user-script:FireMonkey/${encodeURI(name)}/GM.addScript_${Math.random().toString(36).substring(2)}.js`;
        }
        (document.body || document.head || document.documentElement || document).appendChild(node);
        node.remove();
      } catch(error) { log(`addScript ➜ ${error.message}`, 'error'); }
    },

    popup({type = 'center', modal = true} = {}) {

      const host = document.createElement('gm-popup');    // shadow DOM host
      const shadow = host.attachShadow({mode: 'closed'});

      const style = document.createElement('style');
      shadow.appendChild(style);

      const content = document.createElement('div');      // main content
      content.className = 'content';
      shadow.appendChild(content);

      const close = document.createElement('span');       // close button
      close.className = 'close';
      close.textContent = '✖';
      content.appendChild(close);

      [host, content].forEach(item => item.classList.add(type)); // process options
      host.classList.toggle('modal', type.startsWith('panel-') ? modal : true); // process modal

      style.textContent = `
        :host, *, ::before, ::after {
          box-sizing: border-box;
        }

        :host {
          display: none;
          align-items: center;
          justify-content: center;
          background: transparent;
          margin: 0;
          position: fixed;
          z-index: 10000;
          transition: all 0.5s ease-in-out;
        }

        :host(.on) { display: flex; }
        .content { background: #fff; }
        .content.center, .content[class*="slide-"] {
          min-width: 10em;
          min-height: 10em;
        }

        .close {
          color: #ccc;
          margin: 0.1em 0.3em;
          float: right;
          font-size: 1.5em;
          border: 0px solid #ddd;
          border-radius: 2em;
          cursor: pointer;
        }
        .close:hover { color: #f70; }
        .panel-right .close { float: left; }
        .panel-top .close, .panel-bottom .close { margin-right: 0.5em; }

        :host(.panel-left), :host(.panel-right), .panel-left, .panel-right { min-width: 14em;  height: 100%; }
        :host(.panel-top), :host(.panel-bottom), .panel-top, .panel-bottom { width: 100%; min-height: 4em; }

        :host(.panel-left)        { top: 0; left: 0; justify-content: start; }
        :host(.panel-right)       { top: 0; right: 0; justify-content: end; }
        :host(.panel-top)         { top: 0; left: 0; align-items: start; }
        :host(.panel-bottom)      { bottom: 0; left: 0; align-items: end; }

        :host(.on) .center        { animation: center 0.5s ease-in-out; }
        :host(.on) .slide-top     { animation: slide-top 0.5s ease-in-out; }
        :host(.on) .slide-bottom  { animation: slide-bottom 0.5s ease-in-out; }
        :host(.on) .slide-left    { animation: slide-left 0.5s ease-in-out; }
        :host(.on) .slide-right   { animation: slide-right 0.5s ease-in-out; }

        :host(.on) .panel-top     { animation: panel-top 0.5s ease-in-out; }
        :host(.on) .panel-bottom  { animation: panel-bottom 0.5s ease-in-out; }
        :host(.on) .panel-left    { animation: panel-left 0.5s ease-in-out; }
        :host(.on) .panel-right   { animation: panel-right 0.5s ease-in-out; }

        :host(.modal) { width: 100%; height: 100%; top: 0; left: 0; background: rgba(0, 0, 0, 0.4); }

        @keyframes center {
            0%  { transform: scale(0.8); }
          100%  { transform: scale(1); }
        }

        @keyframes slide-top {
            0%  { transform: translateY(-200%) scale(0.8); }
          100%  { transform: translateY(0) scale(1); }
        }

        @keyframes slide-bottom {
            0%  { transform: translateY(200%) scale(0.8); }
          100%  { transform: translateY(0) scale(1); }
        }

        @keyframes slide-left {
            0%  { transform: translateX(-200%) scale(0.8); }
          100%  { transform: translateX(0) scale(1); }
        }

        @keyframes slide-right {
            0%  { transform: translateX(200%) scale(0.8); }
          100%  { transform: translateX(0) scale(1); }
        }

        @keyframes panel-top {
            0%  { transform: translateY(-100%); }
          100%  { transform: translateY(0); }
        }

        @keyframes panel-bottom {
            0%  { transform: translateY(100%); }
          100%  { transform: translateY(0); }
        }

        @keyframes panel-left {
            0%  { transform: translateX(-100%); }
          100%  { transform: translateX(0); }
        }

        @keyframes panel-right {
            0%  { transform: translateX(100%); }
          100%  { transform: translateX(0); }
        }
      `;

      document.body.appendChild(host);

      const obj = {
        host,
        style,
        content,
        close,

        addStyle(css) {
          style.textContent += '\n\n' + css;
        },

        append(...arg) {
          typeof arg[0] === 'string' && /^<.+>$/.test(arg[0].trim()) ?
            content.append(document.createRange().createContextualFragment(arg[0].trim())) :
              content.append(...arg);
        },

        show() {
          host.style.opacity = 1;
          host.classList.toggle('on', true);
        },

        hide(e) {
          if (!e || [host, close].includes(e.originalTarget)) {
            host.style.opacity = 0;
            setTimeout(() => { host.classList.toggle('on', false); }, 500);
          }
        },

        remove() {
          host.remove();
        }
      };

      host.addEventListener('click', obj.hide);

      return script.export(obj);
    },

    log(...text) { console.log(name + ':', ...text); },
    info: script.metadata.info
  };


  script.defineGlobals({

    GM,
    GM_getValue,
    GM_listValues,
    GM_deleteValue:               GM.deleteValue,
    GM_setValue:                  GM.setValue,
    GM_addValueChangeListener:    GM.addValueChangeListener,
    GM_removeValueChangeListener: GM.removeValueChangeListener,

    GM_openInTab:                 GM.openInTab,
    GM_setClipboard:              GM.setClipboard,
    GM_notification:              GM.notification,
    GM_xmlhttpRequest:            GM.xmlHttpRequest,
    GM_fetch:                     GM.fetch,
    GM_download:                  GM.download,
    GM_getResourceText:           GM.getResourceText,
    GM_getResourceURL:            GM.getResourceUrl,
    GM_registerMenuCommand:       GM.registerMenuCommand,
    GM_unregisterMenuCommand:     GM.unregisterMenuCommand,

    GM_addStyle:                  GM.addStyle,
    GM_addScript:                 GM.addScript,
    GM_popup:                     GM.popup,

    GM_log:                       GM.log,
    GM_info:                      GM.info,

    exportFunction,
    cloneInto:                    cloneIntoFM,
    matchURL
  });
});
