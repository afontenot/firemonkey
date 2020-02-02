'use strict';

// ----------------- Parse Metadata Block ------------------
// ----- global
const metaRegEx = /==(UserScript|UserCSS)==([\s\S]+)==\/\1==/i;

function getMetaData(str) {

  // --- get all
  const metaData = str.match(metaRegEx);
  if (!metaData) { return null; }

  const type = metaData[1].toLowerCase() === 'userscript' ? 'js' : 'css';

  const data = {
    // --- extension related data
    name: '',
    author: '',
    description: '',
    enabled: typeof enable !== 'undefined' ? enable.checked : true, // enable is defined in options.js but not from background.js
    updateURL: '',
    autoUpdate: typeof autoUpdate !== 'undefined'  ? autoUpdate.checked : false, // autoUpdate is defined in options.js but not from background.js
    version: '',

    // --- API related data
    allFrames: false,
    js: type === 'js' ? str : '',
    css: type === 'css' ? str.replace(/[\u200B-\u200D\uFEFF]/g, '') : '', // avoid CSS parse error on invisible characters
    matches: [],
    excludeMatches: [],
    includeGlobs: [],
    excludeGlobs: [],
    matchAboutBlank: false,

    require: [],

    runAt: 'document_idle'                                  // "document_start" "document_end" "document_idle" (default)
  };

  metaData[2].split('\n').forEach(item =>  {                // lines

    item = item.trim();
    let [,prop, value] = item.match(/^(?:\/\/)?\s*@([\w-]+)\s+(.+)/) || ['', '', ''];
    value = value.trim();
    
    if (!value && /^(?:\/\/)?\s*@noframes$/.test(item)) { data.matchAboutBlank = false; } // convert @noframes to allFrames: false
    else if (prop && value) {

      switch (prop) {

        case 'match': prop = 'matches'; break;                // convert match to matches
        case 'include': prop = 'matches'; break;              // convert include to matches
        case 'exclude': prop = 'excludeMatches'; break;       // convert exclude to excludeMatches
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
  

        // add @require
        case 'require':
          const url = value.toLowerCase().replace(/^(https?:)?\/\//, 'https://'); // change starting http:// & Protocol-relative URL // 
          switch (true) {

            case url === 'jquery3':
            case url.startsWith('https://code.jquery.com/jquery-3.'):
            case url.startsWith('https://ajax.googleapis.com/ajax/libs/jquery/3.'):
            case url.startsWith('https://unpkg.com/jquery@3.'):
            case url.startsWith('https://cdnjs.cloudflare.com/ajax/libs/jquery/3.'):
            case url.startsWith('https://cdn.jsdelivr.net/npm/jquery@3.'):
              value = 'lib/jquery3.jsm';
              break;

            case url === 'jquery2':
            case url.startsWith('https://code.jquery.com/jquery-2.'):
            case url.startsWith('https://ajax.googleapis.com/ajax/libs/jquery/2.'):
            case url.startsWith('https://unpkg.com/jquery@2.'):
            case url.startsWith('https://cdnjs.cloudflare.com/ajax/libs/jquery/2.'):
            case url.startsWith('https://cdn.jsdelivr.net/npm/jquery@2.'):
              value = 'lib/jquery2.jsm';
              break;

            case url === 'jquery1':
            case url.startsWith('https://code.jquery.com/jquery-1.'):
            case url.startsWith('https://ajax.googleapis.com/ajax/libs/jquery/1.'):
            case url.startsWith('https://unpkg.com/jquery@1.'):
            case url.startsWith('https://cdnjs.cloudflare.com/ajax/libs/jquery/1.'):
            case url.startsWith('https://cdn.jsdelivr.net/npm/jquery@1.'):
              value = 'lib/jquery1.jsm';
              break;

            case url === 'jquery-ui1':
            case url.startsWith('https://code.jquery.com/ui/1.'):
            case url.startsWith('https://ajax.googleapis.com/ajax/libs/jqueryui/1.'):
            //case url.startsWith('https://unpkg.com/jquery@1.'):
            case url.startsWith('https://cdnjs.cloudflare.com/ajax/libs/jqueryui/1.'):
            case url.startsWith('https://cdn.jsdelivr.net/npm/jquery-ui-dist@1.'):
              value = 'lib/jquery-ui1.jsm';
              break;
             
            case url.startsWith('https://'):                // unsupported URL
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
  
  
  // 

  // --- check auto-update criteria, must have updateURL & version
  if (data.autoUpdate && (!data.updateURL || !data.version)) { data.autoUpdate = false; }

  // --- convert to match pattern
  data.matches = data.matches.map(checkPattern);
  data.excludeMatches = data.excludeMatches.map(checkPattern);

  // --- remove duplicates
  Object.keys(data).forEach(item => Array.isArray(data[item]) && (data[item] = [...new Set(data[item])]));

  return data;
}

function checkPattern(p) {

  // --- convert some common incompatibilities with matches API
  switch (true) {

    case p === '*': return '*://*/*';
    case p === 'http://*': return 'http://*/*';
    case p === 'https://*': return 'https://*/*';
    case p === 'http*://*': return '*://*/*';
    case p.startsWith('http*'): return p.replace(/^http\*/, '*');
  }

  // keep it as it is for now
  return p;
}
// ----------------- /Parse Metadata Block -----------------

// ----------------- Remote Update -------------------------
function getUpdate(item) {

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
function checkMatches(item, urls) {

  switch (true) {

    // scripts/css withoiut matches/includeGlobs
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