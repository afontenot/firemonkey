'use strict';

// ----------------- Parse Metadata Block ------------------
// bg options
class Meta {
  
  static get (str, userMatches = '', userExcludeMatches = '') {

    // --- get all
    const metaData = str.match(this.regEx);
    if (!metaData) { return null; }
    
    const optionPage = typeof script !== 'undefined';
  
    const js = metaData[1].toLowerCase() === 'userscript';
    const userStyle = metaData[1].toLowerCase() === 'userstyle';
    // Metadata Block
    const data = {
      // --- extension related data
      name: '',
      author: '',
      description: '',
      updateURL: '',
      // enable & autoUpdate are defined in options.js but not from background.js
      enabled: optionPage ? script.enable.checked : true,
      autoUpdate: optionPage ? script.autoUpdate.checked : false,
      version: '',
  
      require: [],
      requireRemote: [],
      resource: {},
      userMatches,
      userExcludeMatches,
  
      // --- API related data
      allFrames: false,
      js: js ? str : '',
      css: !js ? str.replace(/[\u200B-\u200D\uFEFF]/g, '') : '', // avoid CSS parse error on invisible characters
      style: [],
      matches: [],
      excludeMatches: [],
      includeGlobs: [],
      excludeGlobs: [],
      matchAboutBlank: false,
      runAt: userStyle ? 'document_start' : 'document_idle'  // "document_start" "document_end" "document_idle" (default)
    };
  
    metaData[2].split(/[\r\n]+/).forEach(item =>  {           // lines
  
      item = item.trim();
      let [,prop, value] = item.match(/^(?:\/\/)?\s*@([\w-]+)\s+(.+)/) || [];
      if (!prop) { return; }                                  // continue to next
  
      value = value.trim();
  
      switch (prop) {
  
        // --- disallowed properties
        case 'js':
        case 'css':
        case 'userMatches':
        case 'userExcludeMatches':
        case 'requireRemote':
          value = '';                                       // no more processing
          break;
  
        case 'noframes':
          data.allFrames = false;                           // convert @noframes to allFrames: false
          value = '';                                       // no more processing
          break;
  
  
        case 'match':                                       // convert match/include to matches
        case 'include':
          prop = 'matches';
          break;
  
        case 'exclude':                                     // convert exclude|exclude-match to excludeMatches
        case 'exclude-match':
          prop = 'excludeMatches';
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
            case js && url.startsWith('https://lib.baomitu.com/jquery/latest/'):
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
  
    // --- convert to match pattern
    data.matches = data.matches.flatMap(this.checkPattern);        // flatMap() FF62
    data.excludeMatches = data.excludeMatches.flatMap(this.checkPattern);
  
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
  
    // --- convert some common incompatibilities with matches API
    switch (true) {
  
      // No change
      case p[0] === '/' && p[1] !== '/': return p;            // RegEx: can't fix
      case p === '<all_urls>': return p;
  
      // fix complete pattern
      case p === '*':  return '*://*/*';
      case p === 'http://*': return 'http://*/*';
      case p === 'https://*': return 'https://*/*';
      case p === 'http*://*': return '*://*/*';
  
  
      // fix scheme
      case p.startsWith('http*'): p = p.substring(4); break;  // *://.....
      case p.startsWith('*//'): p = '*:' + p.substring(1); break; // bad protocol wildcard
      case p.startsWith('//'): p = '*:' + p; break;           // Protocol-relative URL
      case !p.includes('://'): p = '*://' + p; break;         // no protocol
    }
  
    let [scheme, host, ...path] = p.split(/:\/{2,3}|\/+/);
  
  
    if (scheme === 'file') { return p; }                      // handle file only
  
    // http/https schemes
    if (!['http', 'https', 'file', '*'].includes(scheme.toLowerCase())) { scheme = '*'; } // bad scheme
    if (host.includes(':')) { host = host.replace(/:.+/, ''); } // host with port
    if (host.endsWith('.co*.*')) { host = host.slice(0, -5) + 'TLD'; } // TLD wildcard google.co*.*
    if (host.endsWith('.*')) { host = host.slice(0, -1) + 'TLD'; } // TLD wildcard google.*
    if (host.startsWith('*') && host[1] && host[1] !== '.') { host = '*.' + host.substring(1); } // starting wildcard *google.com
    p = scheme +  '://' + [host, ...path].join('/');          // rebuild pattern
  
    if (!path[0] && !p.endsWith('/')) { p += '/'; }           // fix trailing slash
  
  
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
  
  
    if (/:\/\/[^/]+\.tld\/.*/i.test(p)) {
  
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
                      manual && Util.notify(chrome.i18n.getMessage('noNewUpdate'), item.name))
    .catch(console.error);
  }
  
  needUpdate(text, item) { // here
    // --- check version
    const version = text.match(/@version\s+(\S+)/);
    return version && this.higherVersion(version[1], item.version);
  }
  
  getScript(item) { // here bg 1
  
    fetch(item.updateURL)
    .then(response => response.text())
//    .then(text => this.processResponse(text, item.name, item.updateURL))
    .then(text => this.callback(text, item.name, item.updateURL))
    .catch(console.error);
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
const RU = new RemoteUpdate(); 
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
  
      // --- matches & globs
      case !this.isMatch(urls, [...item.matches, ...userMatches, ...styleMatches]):
      case item.excludeMatches[0] && this.isMatch(urls, item.excludeMatches):
      case item.includeGlobs[0] && !this.isMatch(urls, item.includeGlobs, true):
      case item.excludeGlobs[0] && this.isMatch(urls, item.excludeGlobs, true):
      case item.userExcludeMatches && this.isMatch(urls, item.userExcludeMatches.split(/\s+/)):
        return false;
  
      default: return true;
    }
  }

  // here
  static isMatch(urls, arr, glob) {
  
    if (arr.includes('<all_urls>')) { return true; }
  
    // checking *://*/* for http/https
    const idx = arr.indexOf('*://*/*');
    if (idx !== -1) {
      if(urls.find(item => item.startsWith('http'))) { return true; }
  
      if (!arr[1])  { return false; }                         // it only has one item *://*/*
      arr.splice(idx, 1);                                     // remove *://*/*
    }
  
    return !!urls.find(u => new RegExp(this.prepareMatches(arr, glob), 'i').test(u));
  }
  
  // here
  static prepareMatches(arr, glob) {
  
    const regexSpChar = glob ? /[-\/\\^$+.()|[\]{}]/g : /[-\/\\^$+?.()|[\]{}]/g; // Regular Expression Special Characters minus * ?
    const str = arr.map(item => '^' +
        item.replace(regexSpChar, '\\$&').replace(/\*/g, '.*').replace('/.*\\.', '/(.*\\.)?') + '$').join('|');
    return glob ? str.replace(/\?/g, '.') : str;
  }
}
// ----------------- /Match Pattern Check ------------------
