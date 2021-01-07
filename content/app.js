export {pref, App, Meta, RemoteUpdate, CheckMatches};

// ----------------- Default Preference --------------------
let pref = {
  autoUpdateInterval: 0,
  autoUpdateLast: 0,
  content: {},
  counter: true,
  globalScriptExcludeMatches: '',
  sync: false,
  template: { css: '', js: '' },
  customCSS: '',
  cmOptions: ''
};
// ----------------- /Default Preference -------------------

class App {

  // ----------------- User Preference -----------------------
  static getPref() {

    // update pref with the saved version
    return browser.storage.local.get().then(result => {
      Object.keys(result).forEach(item => pref[item] = result[item]);
    });
  }

  static importExport(callback) {
    this.callback = callback;
    document.getElementById('file').addEventListener('change', this.import);
    document.getElementById('export').addEventListener('click', this.export);
  }

  static import(e) {

    const file = e.target.files[0];
    switch (true) {

      case !file: App.notify(chrome.i18n.getMessage('error')); return;
      case !['text/plain', 'application/json'].includes(file.type): // check file MIME type
        App.notify(chrome.i18n.getMessage('fileTypeError'));
        return;
    }

    const reader  = new FileReader();
    reader.onloadend = () => App.readData(reader.result);
    reader.onerror = () => App.notify(chrome.i18n.getMessage('fileReadError'));
    reader.readAsText(file);
  }

  static readData(data) {

    let importData;
    try { importData = JSON.parse(data); }                  // Parse JSON
    catch(e) {
      App.notify(chrome.i18n.getMessage('fileParseError'));     // display the error
      return;
    }

    Object.keys(pref).forEach(item =>
      importData.hasOwnProperty(item) && (pref[item] = importData[item])); // update pref with the saved version

    this.callback();                                        // successful import
  }

  static export() {

    const data = JSON.stringify(pref, null, 2);
    const blob = new Blob([data], {type : 'text/plain;charset=utf-8'});
    const filename = chrome.i18n.getMessage('extensionName') + '_' + new Date().toISOString().substring(0, 10) + '.json';

    chrome.downloads.download({
      url: URL.createObjectURL(blob),
      filename,
      saveAs: true,
      conflictAction: 'uniquify'
    });
  }

  // ----------------- Helper functions ----------------------
  // --- Internationalization
  static i18n() {
    document.querySelectorAll('[data-i18n]').forEach(node => {
      let [text, attr] = node.dataset.i18n.split('|');
      text = chrome.i18n.getMessage(text);
      attr ? node[attr] = text : node.appendChild(document.createTextNode(text));
    });
  }

  static notify(message, title = chrome.i18n.getMessage('extensionName'), id = '') {

    chrome.notifications.create(id, {
      type: 'basic',
      iconUrl: '/image/icon.svg',
      title,
      message
    });
  }

  static log(ref, message, type = '') {

    let log = App.JSONparse(localStorage.getItem('log')) || [];
    log.push([new Date().toString().substring(0, 24), ref, message, type]);
    log = log.slice(-(localStorage.getItem('logSize')*1 || 100)); // slice to the last n entries. default 100
    localStorage.setItem('log', JSON.stringify(log));
  }

  static JSONparse(str) {

    try { return JSON.parse(str); } catch (e) { return null; }
  }
}

// ----------------- Parse Metadata Block ------------------
// bg options
class Meta {

  static get (str, userMatches = '', userExcludeMatches = '') {

    // --- get all
    const metaData = str.match(this.regEx);
    if (!metaData) { return null; }

    const js = metaData[1].toLowerCase() === 'userscript';
    const userStyle = metaData[1].toLowerCase() === 'userstyle';
    // Metadata Block
    const data = {
      // --- extension related data
      name: '',
      author: '',
      description: '',
      updateURL: '',
      // this.enable & this.autoUpdate are defined in options.js but not from background.js
      enabled: this.enable ? this.enable.checked : true,
      autoUpdate: this.autoUpdate ? this.autoUpdate.checked : false,
      version: '',
      antifeatures: [],

      require: [],
      requireRemote: [],
      resource: {},
      userMatches,
      userExcludeMatches,
      i18n: {
        name: {},
        description: {}
      },
      error: '',                                            // reset error on save

      // --- API related data
      allFrames: false,
      js: js ? str : '',
      css: !js ? str.replace(/[\u200b-\u200d\ufeff]/g, '') : '', // avoid CSS parse error on invisible characters
      style: [],
      matches: [],
      excludeMatches: [],
      includeGlobs: [],
      excludeGlobs: [],
      includes: [],
      excludes: [],
      matchAboutBlank: false,
      runAt: !js ? 'document_start' : 'document_idle'  // "document_start" "document_end" "document_idle" (default)
    };

    metaData[2].split(/[\r\n]+/).forEach(item =>  {           // lines

      item = item.trim();
      let [,prop, value] = item.match(/^(?:\/\/)?\s*@([\w-:]+)\s+(.+)/) || [];
      if (!prop) { return; }                                  // continue to next

      value = value.trim();

      switch (prop) {

        // --- disallowed properties
        case 'js':
        case 'css':
        case 'userMatches':
        case 'userExcludeMatches':
        case 'requireRemote':
        case 'i18n':
          value = '';                                       // no more processing
          break;

        case 'noframes':
          data.allFrames = false;                           // convert @noframes to allFrames: false
          value = '';                                       // no more processing
          break;


        case 'match': prop = 'matches'; break;
        case 'exclude-match': prop = 'excludeMatches'; break;
        case 'includeGlob': prop = 'includeGlobs'; break;
        case 'excludeGlob': prop = 'excludeGlobs'; break;
        case 'antifeature': prop = 'antifeatures'; break;

        case 'include':                                     // keep regex in include, rest in includeGlobs
          prop = value.startsWith('/') &&  value.endsWith('/') ? 'includes' : 'includeGlobs';
          break;
          
        case 'exclude':                                     // keep regex in exclude rest in excludeGlobs
          prop = value.startsWith('/') &&  value.endsWith('/') ? 'excludes' : 'excludeGlobs';
          break;

        case 'updateURL':                                   // disregarding .meta.js
          if (value.endsWith('.meta.js')) { prop = 'updateURLnull'; }
          break;

        case 'downloadURL':                                 // convert downloadURL/installURL to updateURL
        case 'installURL':
          prop = 'updateURL';
          break;

        case 'run-at':                                        // convert run-at/runAt to runAt
        case 'runAt':
          prop = 'runAt';
          value = value.replace('-', '_');
          ['document_start', 'document_end'].includes(value) || (value = 'document_idle');
          break;


        case 'resource':
          const [resName, resURL] = value.split(/\s+/);
          if(resName && resURL) { data.resource[resName] = resURL; }
          value = '';                                       // no more processing
          break;


        // --- add @require
        case 'require':
          const url = value.toLowerCase().replace(/^(http:)?\/\//, 'https://'); // change starting http:// & Protocol-relative URL //
          const [protocol, host] = url.split(/:?\/+/);
          const cdnHosts = ['ajax.aspnetcdn.com', 'ajax.googleapis.com', 'apps.bdimg.com', 'cdn.bootcss.com',
                            'cdn.jsdelivr.net', 'cdn.staticfile.org', 'cdnjs.cloudflare.com', 'code.jquery.com',
                            'lib.baomitu.com', 'libs.baidu.com', 'pagecdn.io', 'unpkg.com'];
          const cdn = host && cdnHosts.includes(host);
          switch (true) {

            case js && url.includes('/gm4-polyfill.'):      // not applicable
            case url.startsWith('lib/'):                    // disallowed value
              value = '';
              break;

            case js && url === 'jquery-3':
            case js && cdn && url.includes('/jquery-3.'):
            case js && cdn && url.includes('/jquery/3.'):
            case js && cdn && url.includes('/jquery@3'):
            case js && cdn && url.includes('/jquery/latest/'):
              value = 'lib/jquery-3.jsm';
              break;

            case js && url === 'jquery-2':
            case js && cdn && url.includes('/jquery-2.'):
            case js && cdn && url.includes('/jquery/2.'):
            case js && cdn && url.includes('/jquery@2'):
              value = 'lib/jquery-2.jsm';
              break;

            case js && url === 'jquery-1':
            case js && cdn && url.includes('/jquery-1.'):
            case js && cdn && url.includes('/jquery/1.'):
            case js && cdn && url.includes('/jquery@1'):
            case js && url.startsWith('https://ajax.googleapis.com/ajax/libs/jquery/1'):
            case js && url.startsWith('https://code.jquery.com/jquery-latest.'):
            case js && url.startsWith('https://code.jquery.com/jquery.'):
              value = 'lib/jquery-1.jsm';
              break;

            case js && url === 'jquery-ui-1':
            case js && cdn && url.includes('/jqueryui/1.'):
            case js && cdn && url.includes('/jquery.ui/1.'):
            case js && url.startsWith('https://cdn.jsdelivr.net/npm/jquery-ui-dist@1.'):
            case js && url.startsWith('https://code.jquery.com/ui/1.'):
              value = 'lib/jquery-ui-1.jsm';
              break;

            case js && url === 'bootstrap-4':
            case js && cdn && url.includes('/bootstrap.min.js'):
            case js && cdn && url.endsWith('/bootstrap.js'):
              value = 'lib/bootstrap-4.jsm';
              break;

            case js && url === 'moment-2':
            case js && cdn && url.includes('/moment.min.js'):
            case js && cdn && url.endsWith('/moment.js'):
              value = 'lib/moment-2.jsm';
              break;

            case js && url === 'underscore-1':
            case js && cdn && url.includes('/underscore.js'):
            case js && cdn && url.includes('/underscore-min.js'):
              value = 'lib/underscore-1.jsm';
              break;

            case url.startsWith('https://'):                // unsupported URL
              prop = 'requireRemote';
              break;
          }
          break;

          default:                                          // i18n
            const m = prop.match(/^(name|description):([A-Za-z-]+)$/);
            m && (data.i18n[m[1]][m[2]] = value);
      }

      if (data.hasOwnProperty(prop) && value !== '') {

        switch (typeof data[prop]) {

          case 'boolean': data[prop] = value === 'true'; break;
          case 'object': data[prop].push(value); break;
          case 'string': data[prop] = value; break;
        }
      }
    });

    // --- check auto-update criteria, must have updateURL & version
    if (data.autoUpdate && (!data.updateURL || !data.version)) { data.autoUpdate = false; }

    // --- convert TLD
    data.matches = data.matches.flatMap(this.checkPattern);        // flatMap() FF62
    data.excludeMatches = data.excludeMatches.flatMap(this.checkPattern);
    
    // --- prepare for include/exclude
    (data.includes[0] || data.excludes[0] || data.includeGlobs[0] || data.excludeGlobs[0]) && 
          data.matches.push('*://*/*', 'file:///*');

    // --- remove duplicates
    Object.keys(data).forEach(item => Array.isArray(data[item]) && (data[item] = [...new Set(data[item])]));

    // --- process UserStyle
    if (userStyle) {

      // split all sections
      str.split(/@-moz-document\s+/).slice(1).forEach(moz => {

        const st = moz.indexOf('{');
        const end = moz.lastIndexOf('}');
        if (st === -1 || end === -1) { return; }

        const rule = moz.substring(0, st).trim();
        const css = moz.substring(st+1, end).trim();

        const obj = {
          matches: [],
          css: css.trim()
        };

        const r = rule.split(/\s*[\s()'",]+\s*/);             // split into pairs
        for (let i = 0, len = r.length; i < len; i+=2) {

          if(!r[i+1]) { break; }
          const func = r[i];
          const value = r[i+1];

          switch (func) {

            case 'domain': obj.matches.push(`*://*.${value}/*`); break;
            case 'url': obj.matches.push(value); break;
            case 'url-prefix':
              obj.matches.push(value + (value.split(/:?\/+/).length > 2 ? '*' : '/*')); // fix no path
              break;

            case 'regexp': // convert basic regexp, ignore the rest
              switch (value) {
                case '.*':                                    // catch-all
                case 'https:.*':
                  obj.matches.push('*://*/*');
                  break;
              }
              break;
          }
        }

        obj.matches[0] && data.style.push(obj);
      });
    }

    return data;
  }

  static checkPattern(p) {

    // --- process TLD
    const TLD = ['.com', '.au', '.br', '.ca', '.ch', '.cn', '.co.uk', '.de', '.es', '.fr',
                '.in', '.it', '.jp', '.mx', '.nl', '.no', '.pl', '.ru', '.se', '.uk', '.us'];
    const amazon = ['.ca', '.cn', '.co.jp', '.co.uk', '.com', '.com.au', '.com.br', '.com.mx',
      '.com.sg', '.com.tr', '.de', '.es', '.fr', '.in', '.it', '.nl'];
    const ebay = ['.at', '.be', '.ca', '.ch', '.cn', '.co.th', '.co.uk', '.com.au', '.com.cn',
      '.com.hk', '.com.my', '.com.sg', '.com.tw', '.com', '.de', '.dk', '.es', '.fi', '.fr',
      '.gr', '.hu', '.ie', '.in', '.it', '.nl', '.no', '.ph', '.ph', '.pl', '.ru', '.vn'];
    const google = ['.ae', '.al', '.am', '.as', '.at', '.az', '.ba', '.be', '.bf', '.bg', '.bi',
      '.bj', '.bs', '.bt', '.by', '.ca', '.cat', '.cd', '.cf', '.cg', '.ch', '.ci', '.cl', '.cm',
      '.cn', '.co.ao', '.co.bw', '.co.ck', '.co.cr', '.co.id', '.co.il', '.co.in', '.co.jp',
      '.co.ke', '.co.kr', '.co.ls', '.co.ma', '.co.mz', '.co.nz', '.co.th', '.co.tz', '.co.ug',
      '.co.uk', '.co.uz', '.co.ve', '.co.vi', '.co.za', '.co.zm', '.co.zw', '.com', '.com.af',
      '.com.ag', '.com.ai', '.com.ar', '.com.au', '.com.bd', '.com.bh', '.com.bn', '.com.bo',
      '.com.br', '.com.bz', '.com.co', '.com.cu', '.com.cy', '.com.do', '.com.ec', '.com.eg',
      '.com.et', '.com.fj', '.com.gh', '.com.gi', '.com.gt', '.com.hk', '.com.jm', '.com.kh',
      '.com.kw', '.com.lb', '.com.ly', '.com.mm', '.com.mt', '.com.mx', '.com.my', '.com.na',
      '.com.nf', '.com.ng', '.com.ni', '.com.np', '.com.om', '.com.pa', '.com.pe', '.com.pg',
      '.com.ph', '.com.pk', '.com.pr', '.com.py', '.com.qa', '.com.sa', '.com.sb', '.com.sg',
      '.com.sl', '.com.sv', '.com.tj', '.com.tr', '.com.tw', '.com.ua', '.com.uy', '.com.vc',
      '.com.vn', '.cv', '.cz', '.de', '.dj', '.dk', '.dm', '.dz', '.ee', '.es', '.fi', '.fm',
      '.fr', '.ga', '.ge', '.gg', '.gl', '.gm', '.gp', '.gr', '.gy', '.hn', '.hr', '.ht', '.hu',
      '.ie', '.im', '.iq', '.is', '.it', '.je', '.jo', '.kg', '.ki', '.kz', '.la', '.li', '.lk',
      '.lt', '.lu', '.lv', '.md', '.me', '.mg', '.mk', '.ml', '.mn', '.ms', '.mu', '.mv', '.mw',
      '.ne', '.ng', '.nl', '.no', '.nr', '.nu', '.pl', '.pn', '.ps', '.pt', '.ro', '.rs', '.ru',
      '.rw', '.sc', '.se', '.sh', '.si', '.sk', '.sm', '.sn', '.so', '.sr', '.st', '.td', '.tg',
      '.tk', '.tl', '.tm', '.tn', '.to', '.tt', '.vg', '.vu', '.ws'];


    if (/^(https?|file):\/\/[^/]+\.tld\/.*/i.test(p)) {

      const plc = p.toLowerCase();
      const index = plc.indexOf('.tld/');
      const st = p.substring(0, index);
      const end = p.substring(index + 4);

      switch (true) {

        case plc.includes('.amazon.tld'): p = amazon.map(tld => st + tld + end); break;
        case plc.includes('.ebay.tld'):   p =   ebay.map(tld => st + tld + end); break;
        case plc.includes('.google.tld'): p = google.map(tld => st + tld + end); break;

        default: p = TLD.map(tld => st + tld + end);
      }
    }

    return p;
  }
}
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes
// Static (class-side) data properties and prototype data properties must be defined outside of the ClassBody declaration
Meta.regEx = /==(UserScript|UserCSS|UserStyle)==([\s\S]+)==\/\1==/i;
// ----------------- /Parse Metadata Block -----------------



// ----------------- Remote Update -------------------------
// bg options
class RemoteUpdate {

  getUpdate(item, manual) { // bg 1 opt 1

    switch (true) {
      // --- get meta.js
      case item.updateURL.startsWith('https://greasyfork.org/scripts/'):
      case item.js && item.updateURL.startsWith('https://openuserjs.org/install/'):
        this.getMeta(item, manual);
        break;

      case /^https:\/\/userstyles\.org\/styles\/\d+\/.+\.css$/.test(item.updateURL):
        this.getStlylishVersion(item, manual);
        break;

      // --- direct update
      default:
        this.getScript(item);
    }
  }

  getMeta(item, manual) { // here

    const url = item.updateURL.replace(/\.user\.(js|css)/i, '.meta.$1');
    fetch(url)
    .then(response => response.text())
    .then(text => this.needUpdate(text, item) ? this.getScript(item) :
                      manual && App.notify(chrome.i18n.getMessage('noNewUpdate'), item.name))
    .catch(error => App.log(item.name, `getMeta ${url} ➜ ${error.message}`, 'error'));
  }

  getStlylishVersion(item, manual) {

    const url = item.updateURL.replace(/(\d+\/.+)css$/i, 'userjs/$1user.js');
    fetch(url)
    .then(response => response.text())
    .then(text => {
      const m = text.match(/@version\s+(\S+)/);
      const version = m ? m[1].substring(2,10) : '';
      version > item.version ? this.getStylish(item, version) : manual && App.notify(chrome.i18n.getMessage('noNewUpdate'), item.name);
    })
    .catch(error => App.log(item.name, `getMeta ${url} ➜ ${error.message}`, 'error'));
  }


  getStylish(item, version) {

 const metaData =
`/*
==UserStyle==
@name           ${item.name}
@description    ${item.description}
@author         ${item.author}
@version        ${version}
@homepage       ${item.updateURL.slice(0, -4)}
==/UserStyle==
*/`;

    fetch(item.updateURL)
    .then(response => response.text())
    .then(text =>  this.callback(metaData + '\n\n' + text, name, updateURL))
    .catch(error => App.log(item.name, `getStylish ${cssURL} ➜ ${error.message}`, 'error'));
  }

  needUpdate(text, item) { // here
    // --- check version
    const version = text.match(/@version\s+(\S+)/);
    return version && this.higherVersion(version[1], item.version);
  }

  getScript(item) { // here bg 1

    fetch(item.updateURL)
    .then(response => response.text())
    .then(text => this.callback(text, item.name, item.updateURL))
    .catch(error => App.log(item.name, `getScript ${item.updateURL} ➜ ${error.message}`, 'error'));
  }

  higherVersion(a, b) { // here bg 1 opt 1

    a = a.split('.');
    b = b.split('.');

    for (let i = 0, len = Math.max(a.length, b.length); i < len; i++) {
      if (!a[i]) { return false; }
      else if ((a[i] && !b[i]) || a[i] > b[i]) { return true; }
      else if (a[i] < b[i]) { return false; }
    }
    return false;
  }
}
// ----------------- /Remote Update ------------------------

// ----------------- Match Pattern Check -------------------
class CheckMatches {
  // bg popup
  static get(item, urls, gExclude = []) {

    const styleMatches = item.style && item.style[0] ? item.style.flatMap(i => i.matches) : [];
    const userMatches = item.userMatches ? item.userMatches.split(/\s+/) : [];

    switch (true) {

      // --- Global Script Exclude Matches
      case gExclude[0] && this.isMatch(urls, gExclude): return false;

      // --- scripts/css without matches/includeGlobs/style
      case !item.matches[0] && !item.includeGlobs[0] && !styleMatches[0]: return false;

      // --- about:blank
      case urls.includes('about:blank') && item.matchAboutBlank: return true;

      // --- includes & matches & globs
      case item.userExcludeMatches && this.isMatch(urls, item.userExcludeMatches.split(/\s+/)):
      case !this.isMatch(urls, [...item.matches, ...userMatches, ...styleMatches]):
      case item.includeGlobs[0] && !this.isMatch(urls, item.includeGlobs, true):
      case item.includes[0] && !this.isMatch(urls, item.includes, false, true):
      
      case item.excludeMatches[0] && this.isMatch(urls, item.excludeMatches):
      case item.excludeGlobs[0] && this.isMatch(urls, item.excludeGlobs, true):
      case item.excludes[0] && this.isMatch(urls, item.excludes, false, true):    
      
        return false;

      default: return true;
    }
  }

  // here
  static isMatch(urls, arr, glob, regex) {
    
    if (regex) {
      return urls.some(u => new RegExp(this.prepareRegEx(arr), 'i').test(u));
    }
    
    if (glob) {
      return urls.some(u => new RegExp(this.prepareGlob(arr), 'i').test(u));
    }

    // catch all checks
    switch (true) {
  
      case arr.includes('<all_urls>'):
      case arr.includes('*://*/*') && urls.some(item => item.startsWith('http')):
      case arr.includes('file:///*') && urls.some(item => item.startsWith('file:///')):
        return true;
    }
    
    return urls.some(u => new RegExp(this.prepareMatch(arr), 'i').test(u));
  }

  // here
  static prepareMatch(arr) {

    const regexSpChar = /[-\/\\^$+?.()|[\]{}]/g;            // Regular Expression Special Characters
    const str = arr.map(item => '(^' +
        item.replace(regexSpChar, '\\$&').replace(/\*/g, '.*').replace('/.*\\.', '/(.*\\.)?') + '$)').join('|');
    return str;
  }

  static prepareGlob(arr) {

    const regexSpChar = /[-\/\\^$+.()|[\]{}]/g;             // Regular Expression Special Characters minus * ?
    const str = arr.map(item => '(^' + item.replace(regexSpChar, '\\$&').replace(/\*/g, '.*') + '$)').join('|');
    return str.replace(/\?/g, '.');
  }
  
  static prepareRegEx(arr) {
    return arr.map(item => `(${item.slice(1, -1)})`).join('|');
  }
}
// ----------------- /Match Pattern Check ------------------
