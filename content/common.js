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
    enabled: enable ? enable.checked : true,
    updateURL: '',
    autoUpdate: autoUpdate ? autoUpdate.checked : false,
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

    runAt: 'document_idle'                                  // "document_start" "document_end" "document_idle" (default)
  };

  metaData[2].split('\n').forEach(item =>  {                // lines

    item = item.trim();
    let [,prop, value] = item.match(/^(?:\/\/)?\s*@([\w-]+)\s+(.+)/) || ['', '', ''];
    value = value.trim();

    if (prop && value) {

      switch (prop) {

        case 'match': prop = 'matches'; break;                // convert match to matches
        case 'include': prop = 'matches'; break;              // convert include to matches
        case 'exclude': prop = 'excludeMatches'; break;       // convert exclude to excludeMatches
        case 'run-at':                                        // convert run-at to runAt
          prop = 'runtAt';
          value = value.replace('-', '_');
          ['document_start', 'document_end'].includes(value) || (value = 'document_idle');
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

  // --- convert to match pattern
  data.matches = data.matches.map(checkPattern);
  data.excludeMatches = data.excludeMatches.map(checkPattern);

  // --- remove dunplicates
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
  .then(text => processResponse(text, item.name))
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
