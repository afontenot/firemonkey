'use strict';

// ----------------- Parse Metadata Block ------------------
// ----- global
const metaRegEx = /==(UserScript|UserCSS)==([\s\S]+)==\/\1==/i;

function getMetaData(str, userMatches = '', userExcludeMatches = '') {

  // --- get all
  const metaData = str.match(metaRegEx);
  if (!metaData) { return null; }

  const type = metaData[1].toLowerCase() === 'userscript' ? 'js' : 'css';
  // Metadata Block
  const data = {
    // --- extension related data
    name: '',
    author: '',
    description: '',
    enabled: typeof enable !== 'undefined' ? enable.checked : true, // enable is defined in options.js but not from background.js
    updateURL: '',
    autoUpdate: typeof autoUpdate !== 'undefined'  ? autoUpdate.checked : false, // autoUpdate is defined in options.js but not from background.js
    version: '',

    require: [],
    requireRemote: [],
    resource: {},
    userMatches,
    userExcludeMatches,

    // --- API related data
    allFrames: false,
    js: type === 'js' ? str : '',
    css: type === 'css' ? str.replace(/[\u200B-\u200D\uFEFF]/g, '') : '', // avoid CSS parse error on invisible characters
    matches: [],
    excludeMatches: [],
    includeGlobs: [],
    excludeGlobs: [],
    matchAboutBlank: false,
    runAt: 'document_idle'                                  // "document_start" "document_end" "document_idle" (default)
  };

  metaData[2].split(/[\r\n]+/).forEach(item =>  {           // lines

    item = item.trim();
    let [,prop, value] = item.match(/^(?:\/\/)?\s*@([\w-]+)\s+(.+)/) || ['', '', ''];
    value = value.trim();

    if (prop) {

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


        case 'match': prop = 'matches'; break;                // convert match to matches
        case 'include': prop = 'matches'; break;              // convert include to matches
        case 'exclude':
        case 'exclude-match':
          prop = 'excludeMatches'; break;       // convert exclude|exclude-match to excludeMatches
        case 'updateURL': if (value.endsWith('.meta.js')) { prop = 'updateURLnull'; } break; // disregarding .meta.js
        case 'downloadURL':
        case 'installURL':
          prop = 'updateURL'; break;                          // convert downloadURL/installURL to updateURL
        case 'run-at':                                        // convert run-at to runAt
        case 'runAt':
          prop = 'runAt';
          value = value.replace('-', '_');
          ['document_start', 'document_end'].includes(value) || (value = 'document_idle');
          break;


        case 'resource':
          const [resName, resURL] = value.split(/\s+/);
          if(resName && resUrl) { data.resoruce[resName] = resURL; }
          value = '';                                       // no more processing
          break;


        // --- add @require
        case 'require':
          const url = value.toLowerCase().replace(/^(http:)?\/\//, 'https://'); // change starting http:// & Protocol-relative URL //
          switch (true) {

            case url === 'jquery3':
            case url.startsWith('https://ajax.aspnetcdn.com/ajax/jQuery/jquery-3.'):      // Microsoft CDN   
            case url.startsWith('https://ajax.googleapis.com/ajax/libs/jquery/3.'):       // Google CDN      
            case url.startsWith('https://cdn.bootcss.com/jquery/3.'):                     // China           
            case url.startsWith('https://cdn.jsdelivr.net/jquery/3.'):
            case url.startsWith('https://cdn.jsdelivr.net/npm/jquery@3.'):
            case url.startsWith('https://cdn.staticfile.org/jquery/3.'):
            case url.startsWith('https://cdnjs.cloudflare.com/ajax/libs/jquery/3.'):
            case url.startsWith('https://code.jquery.com/jquery-3.'):
            case url.startsWith('https://pagecdn.io/lib/jquery/3.'):
            case url.startsWith('https://unpkg.com/jquery@3'):
            case url.startsWith('https://lib.baomitu.com/jquery/3.'):
            case url.startsWith('https://lib.baomitu.com/jquery/latest/'):
              value = 'lib/jquery-3.4.1.min.jsm';
              break;

            case url === 'jquery2':
            case url.startsWith('https://ajax.aspnetcdn.com/ajax/jQuery/jquery-2.'):
            case url.startsWith('https://ajax.googleapis.com/ajax/libs/jquery/2.'):
            case url.startsWith('https://cdn.bootcss.com/jquery/2.'):
            case url.startsWith('https://cdn.jsdelivr.net/jquery/2.'):
            case url.startsWith('https://cdn.jsdelivr.net/npm/jquery@2.'):
            case url.startsWith('https://cdn.staticfile.org/jquery/2.'):
            case url.startsWith('https://cdnjs.cloudflare.com/ajax/libs/jquery/2.'):
            case url.startsWith('https://code.jquery.com/jquery-2.'):
            case url.startsWith('https://pagecdn.io/lib/jquery/2.'):
            case url.startsWith('https://unpkg.com/jquery@2'):
            case url.startsWith('https://apps.bdimg.com/libs/jquery/2.'):
            case url.startsWith('https://libs.baidu.com/jquery/2.'):
            case url.startsWith('https://lib.baomitu.com/jquery/2.'):
              value = 'lib/jquery-2.2.4.min.jsm';
              break;

            case url === 'jquery1':
            case url.startsWith('https://ajax.aspnetcdn.com/ajax/jQuery/jquery-1.'):
                                         
            case url.startsWith('https://ajax.googleapis.com/ajax/libs/jquery/1'):
            case url.startsWith('https://cdn.bootcss.com/jquery/1.'):
            case url.startsWith('https://cdn.jsdelivr.net/jquery/1.'):
            case url.startsWith('https://cdn.jsdelivr.net/npm/jquery@1.'):
            case url.startsWith('https://cdn.staticfile.org/jquery/1.'):
            case url.startsWith('https://cdnjs.cloudflare.com/ajax/libs/jquery/1.'):
            case url.startsWith('https://code.jquery.com/jquery-1.'):
            case url.startsWith('https://code.jquery.com/jquery-latest.'):
            case url.startsWith('https://code.jquery.com/jquery.'):
            case url.startsWith('https://pagecdn.io/lib/jquery/1.'):
            case url.startsWith('https://unpkg.com/jquery@1'):
            case url.startsWith('https://apps.bdimg.com/libs/jquery/1.'):
            case url.startsWith('https://libs.baidu.com/jquery/1.'):
            case url.startsWith('https://lib.baomitu.com/jquery/1.'):
              value = 'lib/jquery-1.12.4.min.jsm';
              break;

            case url === 'jquery-ui1':
            case url.startsWith('https://ajax.aspnetcdn.com/ajax/jquery.ui/1.'):         
            case url.startsWith('https://ajax.googleapis.com/ajax/libs/jqueryui/1.'):   
            case url.startsWith('https://cdn.bootcss.com/jqueryui/1.'):
            case url.startsWith('https://cdn.jsdelivr.net/npm/jquery-ui-dist@1.'):
            case url.startsWith('https://cdn.staticfile.org/jqueryui/1.'):
            case url.startsWith('https://cdnjs.cloudflare.com/ajax/libs/jqueryui/1.'):
            case url.startsWith('https://pagecdn.io/lib/jqueryui/1.'):
            case url.startsWith('https://code.jquery.com/ui/1.'):  
            case url.startsWith('https://apps.bdimg.com/libs/jqueryui/1.'):   
            case url.startsWith('https://libs.baidu.com/jqueryui/1.'):       
              value = 'lib/jquery-ui-1.12.1.min.jsm';
              break;


            case url.includes('/underscore-min.js'): 
            case url.includes('/underscore.js'):           
              value = 'lib/underscore-1.9.2.min.jsm';
              break;


            case url.includes('/gm4-polyfill.'):            // not applicable
              value = '';
              break;
              
            
            case url.startsWith('https://'):                // unsupported URL
              prop = 'requireRemote';
              break;
              
            case url.startsWith('lib/'):                    // disallowed value
              value = '';
              break;
          }
          break;
      }

      if(data.hasOwnProperty(prop) && value !== '') {

        switch (typeof data[prop]) {

          case 'boolean': data[prop] = value === 'true'; break;
          case 'object': data[prop].push(value); break;
          case 'string': data[prop] = value; break;
        }
      }
    }
  });

  // --- check auto-update criteria, must have updateURL & version
  if (data.autoUpdate && (!data.updateURL || !data.version)) { data.autoUpdate = false; }

  // --- check userMatches, userExcludeMatches
  data.userMatches = userMatches;
  data.userExcludeMatches = userExcludeMatches;
  userMatches && (data.matches = [...data.matches, ...userMatches.split(/\s+/)]);
  userExcludeMatches && (data.excludeMatches = [...data.excludeMatches, ...userExcludeMatches.split(/\s+/)]);

  // --- convert to match pattern
  data.matches = data.matches.flatMap(checkPattern);        // flatMap() FF62
  data.excludeMatches = data.excludeMatches.flatMap(checkPattern);

  // --- remove duplicates
  Object.keys(data).forEach(item => Array.isArray(data[item]) && (data[item] = [...new Set(data[item])]));

  return data;
}

function checkPattern(p) {

  // --- convert some common incompatibilities with matches API
  switch (true) {

    case p === '*': p = '*://*/*'; break;
    case p === 'http://*': p = 'http://*/*'; break;
    case p === 'https://*': p = 'https://*/*'; break;
    case p === 'http*://*': p = '*://*/*'; break;
    case p.startsWith('http*'): p = p.substring(4); break;  // *://.....
    case p.startsWith('*//'): p = '*:' + p.substring(1); break; // bad protocol wildcard
    case p.startsWith('//'): p = '*:' + p; break;           // Protocol-relative URL
  }

  // --- process TLD
  const TLD = ['.com',
              '.au', '.br', '.ca', '.ch', '.cn', '.co.uk', '.de', '.es', '.fr',
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
// ----------------- /Parse Metadata Block -----------------

// ----------------- Match Pattern Tester ------------------
function hasInvalidPattern(node) {

  node.classList.remove('invalid');
  node.value = node.value.trim();

  if (!node.value) { return false; }                        // emtpy

  for (const pattern of node.value.split(/\s+/)) {          // use for loop to be able to break

    const error = invalidPattern(pattern.toLowerCase());
    if (error) {
      node.classList.add('invalid');
      notify(`${pattern}\n${error}`);
      return true;                                          // end execution
    }
  }
  return false;
}

function invalidPattern(pattern) {

  const [scheme, host, path] = pattern.split(/:?\/+/);

  // --- specific patterns
  switch (pattern) {

    case '*': return 'Invalid Pattern';
    case '<all_urls>': return false;
    case '*://*/*': return false;
    case 'http://*/*': return false;
    case 'https://*/*': return false;

  }

  // --- other patterns
  switch (true) {

    case !['http', 'https', 'file', '*'].includes(scheme): return 'Unsupported scheme';
    case scheme === 'file' && !pattern.startsWith('file:///'): return 'file:/// must have 3 slashes';
    case scheme !== 'file' && !path && host === '*': return 'Empty path: this should be "*://*/*"';
    case scheme !== 'file' && !path && !pattern.endsWith('/'): return 'Pattern must include trailing slash';
    case scheme !== 'file' && host[0] === '*' && host[1] !== '.': return '"*" in host must be the only character or be followed by "."'
    case host.substring(1).includes('*'): return '"*" in host must be at the start';
    case host.includes(':'): return 'Host must not include a port number.';
  }
  return false;
}
// ----------------- /Match Pattern Tester -----------------

// ----------------- Remote Update -------------------------
function getUpdate(item, manual) {


  switch (true) {
    // --- get meta.js
    case item.updateURL.startsWith('https://greasyfork.org/scripts/'):
    case item.updateURL.startsWith('https://openuserjs.org/install/'):
      getMeta(item, manual);
      break;
    // --- direct update
    default:
      getScript(item);
  }
}

function getMeta(item, manual) {

  const url = item.updateURL.replace(/\.user\.js/i, '.meta.js');
  fetch(url)
  .then(response => response.text())
  .then(text => needUpdate(text, item) ? getScript(item) : manual && notify(chrome.i18n.getMessage('noNewUpdate'), name))
  .catch(console.error);
}

function needUpdate(text, item) {
  // --- check version
  const version = text.match(/@version\s+(\S+)/);
  return version && compareVersion(version[1], item.version) === '>';
}

function getScript(item) {

  fetch(item.updateURL)
  .then(response => response.text())
  .then(text => processResponse(text, item.name, item.updateURL))
  .catch(console.error);
}

function compareVersion(a, b) {

  a = a.split('.');
  b = b.split('.');

  for (let i = 0, len = Math.max(a.length, b.length); i < len; i++) {
    if (!a[i]) { return '<'; }
    else if ((a[i] && !b[i]) || a[i] > b[i]) { return '>'; }
    else if (a[i] < b[i]) { return '<'; }
  }
  return '=';
}
// ----------------- /Remote Update ------------------------

// ----------------- Match Pattern Check -------------------
function checkMatches(item, urls, gExclude = []) {

  switch (true) {

    // --- Global Script Exclude Matches
    case gExclude[0] && matches(urls, gExclude): return false;

    // --- scripts/css without matches/includeGlobs
    case !item.matches[0] && !item.includeGlobs[0]: return false;

    // --- about:blank
    case urls.includes('about:blank') && item.matchAboutBlank: return true;

    // --- matches & globs
    case !matches(urls, item.matches):
    case item.excludeMatches[0] && matches(urls, item.excludeMatches):
    case item.includeGlobs[0] && !matches(urls, item.includeGlobs, true):
    case item.excludeGlobs[0] && matches(urls, item.excludeGlobs, true):
      return false;

    default: return true;
  }
}

function matches(urls, arr, glob) {

  if (arr.includes('<all_urls>')) { return true; }

  // checking *://*/* for http/https
  const idx = arr.indexOf('*://*/*');
  if (idx !== -1) {
    if(urls.find(item => item.startsWith('http'))) { return true; }

    if (!arr[1])  { return false; }                         // it only has one item *://*/*
    arr.splice(idx, 1);                                     // remove *://*/*
  }

  return !!urls.find(u => new RegExp(prepareMatches(arr, glob), 'i').test(u));
}

function prepareMatches(arr, glob) {

  const regexSpChar = glob ? /[-\/\\^$+.()|[\]{}]/g : /[-\/\\^$+?.()|[\]{}]/g; // Regular Expression Special Characters minus * ?
  const str = arr.map(item => '^' +
      item.replace(regexSpChar, '\\$&').replace(/\*/g, '.*').replace('/.*\\.', '/(.*\\.)?') + '$').join('|');
  return glob ? str.replace(/\?/g, '.') : str;
}
// ----------------- /Match Pattern Check ------------------

// ----------------- Helper functions ----------------------
function notify(message, title = chrome.i18n.getMessage('extensionName'), id = '') {

  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: 'image/icon.svg',
    title,
    message
  });
}
// ----------------- /Helper functions ---------------------