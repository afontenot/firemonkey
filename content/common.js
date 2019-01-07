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
    include: [],                                            // will be merged into matches
//    namespace: '',
    version: '',
    registered: null,
    storage: {},

    // --- API related data
    allFrames: false,
    js: type === 'js' ? str : '',
    css: type === 'css' ? str.replace(/[\u200B-\u200D\uFEFF]/g, '') : '', // avoid CSS parse error on invisible characters
    excludeGlobs: [],
    excludeMatches: [],
    includeGlobs: [],
    matchAboutBlank: false,
    matches: [],
    runAt: 'document_idle'                                  // "document_start" "document_end" "document_idle" (default)
  };

  const items = metaData[2].match(/@\S+[^\r\n]+/g) || [];

  items.forEach(item => {

    let [,prop, value] = item.match(/@([\w-]+)\s+(.+)/) || ['', '', ''];
    value = value.trim();
    if (prop === 'run-at') {                                // convert run-at
      prop = 'runAt';
      value = value.replace('-', '_');
    }

    if(data.hasOwnProperty(prop) && value !== '') {
      switch (typeof data[prop]) {

        case 'boolean': data[prop] = value === 'true'; break;
        case 'object': data[prop].push(value); break;
        case 'string': data[prop] = value; break;
      }
    }
  });

  // --- check auto-update criteria, must have updateURL & version
  if (data.autoUpdate && (!data.updateURL || !data.version)) { data.autoUpdate = false; }

  // --- merge include into matches
  data.matches = [...data.matches, ...data.include];
  delete data.include;

  // --- remove dunplicates
  Object.keys(data).forEach(item => Array.isArray(data[item]) && (data[item] = [...new Set(data[item])]));

  // --- check runAt
  !data.runAt || ['document_start', 'document_end', 'document_idle'].includes(data.runAt) || (data.runAt = 'document_idle');

  return data;
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
