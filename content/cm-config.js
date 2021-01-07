'use strict';

class Config {

  constructor() {
    
    this.lint = this.lint.bind(this);


    // add custom meta lint in fm-lint.js 167-168
    CodeMirror.registerHelper('firemonkey', 'lint', this.lint);


    // add to window global for lint & hint fm-javascript.js 132-134
    window.GM = {
      addScript: {}, addStyle: {}, addValueChangeListener: {}, deleteValue: {}, download: {}, fetch: {},
      getResourceText: {}, getResourceURL: {}, getValue: {}, info: {}, listValues: {}, log: {},
      notification: {}, openInTab: {}, popup: {}, registerMenuCommand: {}, removeValueChangeListener: {},
      setClipboard: {}, setValue: {}, unregisterMenuCommand: {}, xmlhttpRequest: {}
    };

    const gm = [
      'GM_addScript', 'GM_addStyle', 'GM_addValueChangeListener', 'GM_deleteValue', 'GM_download',
      'GM_fetch', 'GM_getResourceText', 'GM_getResourceURL', 'GM_getValue', 'GM_info',
      'GM_listValues', 'GM_log', 'GM_notification', 'GM_openInTab', 'GM_popup',
      'GM_registerMenuCommand', 'GM_removeValueChangeListener', 'GM_setClipboard',
      'GM_setValue', 'GM_unregisterMenuCommand', 'GM_xmlhttpRequest', 'unsafeWindow'
    ];
    gm.forEach(item => window[item] = {});


    this.reportUL = document.querySelector('div.report ul');
    this.reportDefault = this.reportUL.firstElementChild.cloneNode(true);
    
    // CCS Mode
    Object.assign(CodeMirror.mimeModes['text/css'].colorKeywords, {
      'darkgrey': true,
      'darkslategrey': true,
      'dimgrey': true,
      'grey': true,
      'lightgrey': true,
      'lightslategrey': true,
      'slategrey': true,
    });
    
/*
  CodeMirror.defineOption('fmColor', {}, function(cm, val, prev) {
    
    if (cm.options.mode 1== 'css') { return; }
    console.log(cm, val, prev);

  });
    */
  }

  lint(cm, annotationsNotSorted) {

    const text = cm.getValue();
    const js = cm.options.mode === 'javascript';

    // ------------- Lint Filter ---------------------------
    annotationsNotSorted.forEach((item, index) => {

      const m = item.message.match(/'(GM_getValue|GM_listValues|GM_getTabs?|GM_saveTab)' is not defined/)
      
      switch (true) {
        
        case m && ['GM_getValue', 'GM_listValues'].includes(m[1]):
          item.message = m[1] + ' is partially supported. Read the Help for more information.';
          break;
                  
        case m && ['GM_getTab', 'GM_getTabs', 'GM_saveTab'].includes(m[1]):
          item.message = m[1] + ' is not supported.';
          item.severity = 'error';
          break;

        case item.message === '`var` declarations are forbidden. Use `let` or `const` instead.':
          item.message = '`var` declarations are deprecated since ECMAScript 6 (2015). Use `let` or `const` instead.';
          break;
      }
    });

    // ------------- /Lint Filter --------------------------

    // ------------- Metadata Block lint -------------------
    const supported = ['@name', '@author', '@description', '@version', '@updateURL', '@match',
          '@matches', '@include', '@exclude', '@exclude-match', '@excludeMatches', '@includeGlobs',
          '@excludeGlobs', '@matchAboutBlank', '@allFrames', '@noframes', '@require', '@resource',
          '@run-at', '@runAt', '@downloadURL'];

    const unsupported = ['@namespace', '@grant', '@icon', '@inject-into', '@supportURL',
          '@homepageURL', '@connect', '@unwrap', '@nocompat'];


    const meta = text.match(/^([\s\S]+)==(UserScript|UserCSS|UserStyle)==([\s\S]+)==\/\2==/i);
    if (!meta) { return; }

    const b4 = meta[1].split(/\r?\n/).length;
    const sticky = null;

    meta[3].split(/\r?\n/).forEach((item, index) =>  {      // lines

      let [,com, prop, value] = item.match(/^\s*(\/\/)?\s*(\S+)(?:\s*)(.*)/) || [];
      if (!prop) { return; }                                // continue to next

      value = value.trim();
      let message;
      let severity = 'warning';
      const line = b4 + index -1;
      let ch = item.indexOf(prop);
      const propLC = prop.toLowerCase();

      // ----- property check
      switch (true) {

        case js && prop === '//':
        case supported.includes(prop):
        case /^@(name|description):[a-z]{2}(-[A-Z]{2})?/.test(prop): // i18n
          break;

        case !prop.startsWith('@'):
          message = com ? 'It is recommended to put comments outside the Metadata Block.' : `${prop} is not supported.`;
          break;

        case prop === '@antifeature':
          message = 'Includes unexpected content e.g. ads, mineres etc.';
          severity = 'error';
          break;

        case unsupported.includes(prop):
          message = `${prop} is not processed.`;
          break;

        case supported.includes(propLC):
        case unsupported.includes(propLC):
          message = `${prop} is not supported, use ${propLC} instead.`;
          severity = 'error';
          break;



        case prop.startsWith('@'):
          message = `${prop} is not processed.`;
          break;

        default:                                            // unsuported
          message = `${prop} is not supported.`;
          severity = 'error';
      }

      message && annotationsNotSorted.push({
        message,
        severity,
        from: {line, ch, sticky},
        to: {line, ch: ch + prop.length, sticky}
      });


      // ----- value check
      message = '';
      switch (true) {

        case prop === '@include' && /^\/[^/]{1}.+\/$/.test(value):
        case prop === '@exclude' && /^\/[^/]{1}.+\/$/.test(value):
          message = '@match performance is more efficient than Regular Expression.';
          break;


        case prop === '@include':
        case prop === '@exclude':
          ch = item.indexOf(value);
          cm.markText({line, ch},{line, ch: ch + value.length}, {
            className: 'fm-convert', 
            attributes: {'data-line': line, 'data-index': ch}
          });
          break;



        case !js || prop !== '@grant': break;
        // all js & grant
        case ['GM_getValue', 'GM_listValues'].includes(value):
          message = value + ' is partially supported. Read the Help for more information.';
          severity = 'error';
          break;

        case ['GM_setValue', 'GM_deleteValue'].includes(value):
          message = `${value} is asynchronous in FireMonkey but in most cases does not cause an issue.`;
          break;

        case /^(GM(\.|_)(getTabs?|saveTab)$)/.test(value):
          message = `${value} is not supported.`;
          break;

      }

      ch = item.indexOf(value);
      message && annotationsNotSorted.push({
        message,
        severity,
        from: {line, ch, sticky},
        to: {line, ch: ch + value.length, sticky}
      });

    });
    // ------------- /Metadata Block lint ------------------

    // ------------- regexp check --------------------------
    const lines = text.split(/\r?\n/);
    const regex = js ? /(GM\.getTabs?|GM\.saveTab)(?=\s*\()/ : /@-moz-document\s+regexp\s*\(('|")(.+?)\1\)/;
    lines.forEach((item, index) => {

      const m = item.match(regex);
      m && annotationsNotSorted.push({
        message: js ? `${m[1]} is not supported.` : 'Regular Expression is not supported.',
        severity: 'error',
        from: {line: index, ch: m.index, sticky},
        to:   {line: index, ch: m.index + m[0].length, sticky}
      });
    });
    // ------------- /regexp check -------------------------


    this.report(cm, annotationsNotSorted);
  }

  report(cm, lint) {

    const nf = new Intl.NumberFormat();
    const docfrag = document.createDocumentFragment();
    this.reportUL.textContent = '';
    const liTemp = this.reportDefault.cloneNode();

    if (!lint[0]) {
      this.reportUL.appendChild(this.reportDefault.cloneNode(true));
      return;
    }

    lint.sort((a, b) => a.from.line - b.from.line);
    lint.forEach(item => {

      const li = liTemp.cloneNode();
      li.className = 'CodeMirror-lint-message-' + item.severity;
      li.dataset.line = nf.format(item.from.line +1);
      li.textContent = item.message;
      li.addEventListener('click', () => cm.setCursor(item.from.line, item.from.ch));
      docfrag.appendChild(li);
    });

    this.reportUL.appendChild(docfrag);
  }
}
new Config();
