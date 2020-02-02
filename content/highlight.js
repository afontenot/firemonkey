'use strict';

const highlight = {

  original: '',
  box: null,

  init() {

    this.original = box.textContent;
    box.addEventListener('keydown', this.keydown.bind(this));
    box.addEventListener('blur', this.blur.bind(this));
    box.addEventListener('copy', this.copy.bind(this));
    box.addEventListener('paste', this.paste.bind(this));
  },

  keydown(e) {

    switch (true) {

      case e.ctrlKey && e.key === 's':                    // Ctrl + s
        e.preventDefault();
        saveScript();
        break;

      case e.key === 'Tab':                               // Tab key
        const sel = window.getSelection();
        const range = sel.getRangeAt(0);
        e.preventDefault();

        switch (true) {

          case e.shiftKey && !!window.getSelection().toString():
            this.getSelected(sel).forEach(item =>
              item.firstChild.nodeValue.substring(0, 2).trim() || (item.firstChild.nodeValue = item.firstChild.nodeValue.substring(2))
            );
            break;

          case e.shiftKey:
            const startContainer = range.startContainer;
            const text = startContainer.nodeValue;
            const startOffset = range.startOffset;
            if (startOffset > 1 && !text.substring(startOffset-2, startOffset).trim()) {
             startContainer.nodeValue =  text.substring(0, startOffset-2) + text.substring(startOffset);
             range.setStart(startContainer, startOffset-2);
            }
            break;

          case !!window.getSelection().toString():
            this.getSelected(sel).forEach(item => item.firstChild.nodeValue = '  ' + item.firstChild.nodeValue);
            break;

          default:
            document.execCommand('insertText', false, '  ');
        }
        break;
    }
  },

  blur(e) {
    // not when clicking save
    this.box.textContent !== this.original &&
      (!e.relatedTarget || e.relatedTarget.dataset.i18n !== 'saveScript') && this.process();
  },

  copy(e) {

      e.preventDefault();
      const text = window.getSelection().toString().trim().replace(/[ ]*(\r?\n)/g, '$1');
      e.clipboardData.setData('text/plain', text);
  },

  paste(e) {

    e.preventDefault();
    const index = this.getIndex(e.target);
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
    this.process();
    this.goto(index);
  },

  getSelected(sel) {

    return [...document.querySelectorAll('pre div')].filter(item => sel.containsNode(item, true));
  },

  getIndex(node) {

    const box = this.box;
    switch (true) {
      case node.nodeName === 'PRE': return 0;
      case node.nodeName === 'DIV': return [...box.children].indexOf(node);
      case node.parentNode.nodeName === 'DIV': return [...box.children].indexOf(node.parentNode);
      case node.parentNode.parentNode.nodeName === 'DIV': return [...box.children].indexOf(node.parentNode.parentNode);
    }
  },

  goto(index) {

    const box = this.box;
    const range = document.createRange();
    const sel = window.getSelection();
    range.setStart(box.children[index], 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  },

  process(disableHighlight) {

    const box = this.box;

    // disabled syntax highlighting
    box.classList.toggle('plain', disableHighlight);
    if (disableHighlight) {
      box.removeEventListener('keydown', this.keydown);
      box.removeEventListener('blur', this.blur);
      box.removeEventListener('copy', this.copy);
      box.removeEventListener('paste', this.paste);
      return;
    }

    const start = performance.now();
    box.classList.remove('invalid');                        // reset
    const text = box.innerText.trim();                      // innerText to keep new lines and igonre <br>
    if (!text) { return; }

    const metaRegex = /==(UserScript|UserCSS)==([\s\S]+)==\/\1==/i;
    const metaData = text.match(metaRegex);

    if (!metaData) {

      box.classList.add('invalid');
      notify(chrome.i18n.getMessage('errorMeta'));
      return;
    }

    box.textContent = '';                                     // clear box
    const type = metaData[1].toLowerCase() === 'userscript' ? 'js' : 'css';
    const docfrag = document.createDocumentFragment();
    const line = document.createElement('div');

    // --- convert each line to DOM
    text.split(/\r?\n/).forEach(item => {
      const node = line.cloneNode();
      node.textContent = item;
      this.domify(node, type);
      docfrag.appendChild(node);
    });

    // --- search for multi-line comments
    this.getMultiLineComment(docfrag);
    box.appendChild(docfrag);

    this.original = box.textContent;
    box.parentNode.nextElementSibling.textContent = `Syntax Highlight ${performance.now() - start} ms`;
  },

  domify(node, type) {

    node.textContent = node.textContent.trimEnd();            // FF61+
    if(!node.textContent) {                                   // for better display
      node.textContent = ' ';                                 // fix copy not recognising newline
      return;
    }

    const regex = {
      css: /\/\*.*\*\/|::?[\w-]+|!important|[^\s!:;~+>(){}\[\]]+/g,
      js:  /\/\/.+|\/\*.*\*\/|'[^']*'|"[^"]*"|[^\s!,:;.(){}\[\]]+|[:;]/g
    }

    const match = node.textContent.match(regex[type]);
    if (!match) { return; }                                   // end execution if not found

    const text = node.textContent.split(regex[type]);
    node.textContent = '';                                    // clear content
    const span = document.createElement('span');

    for (let i = 0, len = text.length; i < len; i++) {

      node.appendChild(document.createTextNode(text[i]));
      if (!match[i]) { continue; }                            // continue if not found

      const [aClass, startEnd] = this.processWord(match[i], type) || [];

      if (!aClass) { node.appendChild(document.createTextNode(match[i])); }
      else {
        const sp = span.cloneNode();
        sp.textContent = match[i];
        startEnd ? sp.classList.add(aClass, startEnd) : sp.classList.add(aClass);
        node.appendChild(sp);
      }
    }
  },

  processWord(text, type) {

    const js =  this.js;
    const css = this.css;

    if (type === 'css') {

      switch (true) {

        case text.startsWith('/*'):
          return text.endsWith('*/') ? ['comment'] : ['comment', 'start'];

        case text.endsWith('*/'): return ['comment', 'end'];
        case text === '!important': return ['important'];
        case css.property.includes(text): return ['property'];
        case css.value.includes(text): return ['value'];
        case css.html.includes(text): return ['html'];
        case text.startsWith(':') && css.pseudo.includes(text): return ['pseudo'];
        case css.font.includes(text): return ['font'];
        case css.color.includes(text): return ['color'];
      }
    }
    else if (type === 'js') {

      switch (true) {

        case text.startsWith('//'): return ['comment'];
        case text.startsWith('/*'):
          return text.endsWith('*/') ? ['comment'] : ['comment', 'start'];

        case text.endsWith('*/'): return ['comment', 'end'];

        case text.startsWith('"') && text.endsWith('"'):
        case text.startsWith("'") && text.endsWith("'"):
          return ['string'];

        case js.keyword.includes(text): return ['keyword'];
        case js.objects.includes(text): return ['object'];
        case js.property.includes(text): return ['property'];
        case js.method.includes(text): return ['method'];
        case js.gm.includes(text): return ['gm'];
      }
    }
  },

  getMultiLineComment(docfrag) {

    let start, end;
    const changeList = [];
    docfrag.querySelectorAll('div, span').forEach(node => {

      switch (true) {

        case node.classList.contains('start'):
          {
            start = true; end = false;
            let next = node.nextSibling;
            while(next) {
              if (next.nodeName === '#text') { next.nodeValue.trim() && changeList.push([next, true]); }
              else { next.className = 'comment'; }
              next = next.nextSibling;
            }
          }
          break;

        case node.classList.contains('end'):
          {
            end = true; start = false;
            let next = node.nextSibling;
            while(next) {
              if (next.nodeName === '#text') { next.nodeValue.trim() && changeList.push([next, false]); }
              next = next.nextSibling;
            }
          }
          break;

        case start && !end:
          node.nodeName === 'DIV' ? node.classList.add('comment') : node.className = 'comment';
          break;
      }
    });

    if (changeList[0]) {

      const span = document.createElement('span');
      changeList.forEach(([item, com]) => {
        const sp = span.cloneNode();
        sp.textContent = item.nodeValue;
        com ? sp.classList.add('comment') : sp.classList.add('plain');
        item.parentNode && item.parentNode.replaceChild(sp, item);
      });
    }
  },

  // ----------------- Word List -------------------------------
  js: {

    keyword: [
      "abstract", "arguments", "await", "boolean", "break", "byte",
      "case", "catch", "char", "class", "const", "continue",
      "debugger", "default", "delete", "do", "double",
      "else", "enum", "export", "extends",
      "false", "final", "finally", "float", "for", "function", "goto", "if",
      "implements", "import", "in", "instanceof", "int", "interface",
      "let", "long", "native", "new", "null", "of",
      "package", "private", "protected", "public",
      "return", "short", "static", "super", "switch", "synchronized", "this",
      "throw", "throws", "transient", "true", "try", "typeof",
      "var", "void", "volatile", "while", "with", "yield",
      "async", "await"
    ],

    objects: [
      "arguments", "Array", "ArrayBuffer", "Boolean", "DataView", "Date", "decodeURI", "decodeURIComponent",
      "encodeURI", "encodeURIComponent", "Error", "eval", "EvalError", "Float32Array", "Float64Array",
      "Function", "Generator", "GeneratorFunction", "Infinity", "Int16Array", "Int32Array", "Int8Array",
      "InternalError", "Intl", "Collator", "DateTimeFormat", "NumberFormat", "isFinite",
      "isNaN", "JSON", "Map", "Math", "NaN", "null", "Number", "Object", "parseFloat", "parseInt",
      "Promise", "RangeError", "ReferenceError", "RegExp", "Set", "String", "Symbol", "SyntaxError",
      "TypeError", "Uint16Array", "Uint32Array", "Uint8Array", "Uint8ClampedArray", "undefined",
      "URIError", "WeakMap", "WeakSet",
      "WebAssembly", "WebAssembly.CompileError", "WebAssembly.Instance", "WebAssembly.LinkError",
      "WebAssembly.Memory", "WebAssembly.Module", "WebAssembly.RuntimeError", "WebAssembly.Table"
    ],

    property: [
      "accessKey", "activeElement", "alt", "altKey", "anchors", "appCodeName", "appName",
      "appVersion", "applets", "attributes", "availHeight", "availWidth", "baseURI",
      "background", "backgroundColor", "backgroundImage", "backgroundSize", "body",
      "border", "borderLeft", "borderRight", "borderTop", "borderBottom", "bubbles", "button",
      "cancelable", "characterSet", "checked", "childElementCount", "childNodes", "children", "classList",
      "className", "clientHeight", "clientLeft", "clientTop", "clientWidth", "clientX", "clientY",
      "closed", "color", "colorDepth", "compatMode", "console", "constructor", "contentType", "cookie",
      "cookieEnabled", "cssRules", "cssText", "ctrlKey", "currentScript", "currentTarget", "dataset",
      "defaultStatus", "defaultView", "designMode", "disabled", "display", "doctype", "documentElement",
      "documentURI", "documentURIObject", "domain", "embeds", "eventPhase", "firstChild", "firstElementChild",
      "form", "forms", "frameElement", "frames", "hash", "head", "height", "hidden", "host", "hostname",
      "href", "id", "images", "implementation", "innerHTML", "innerHeight", "innerText", "innerWidth",
      "keyIdentifier", "keyLocation", "label", "language", "lastChild", "lastElementChild", "lastModified",
      "lastStyleSheetSet", "length", "links", "localName", "marginBottom", "marginLeft", "marginRight",
      "marginTop", "metaKey", "mozFullScreen", "mozFullScreenElement", "mozFullScreenEnabled",
      "mozSyntheticdocument", "multiple", "name", "namespaceURI", "naturalHeight", "naturalWidth",
      "nextElementSibling", "nextSibling", "nodeName", "nodePrincipal", "nodeType", "nodeValue",
      "onLine", "onabort", "onafterscriptexecute", "onbeforescriptexecute", "onblur", "onchange",
      "onclick", "oncontextmenu", "oncopy", "oncut", "ondblclick", "ondragstart", "onerror",
      "onsuccess", "onupgradeneeded", "onfocus", "onkeydown", "onkeypress", "onkeyup",
      "onload", "onmousedown", "onmousemove", "onmouseout", "onmouseover", "onmouseup",
      "ononline", "onpaste", "onprogress", "onreset", "onresize", "onscroll", "onselect",
      "onsubmit", "ontimeout", "onunload", "onwheel", "opacity", "opener", "origin",
      "outerHTML", "outerHeight", "outerWidth", "ownerDocument", "pageXOffset", "pageYOffset",
      "parent", "parentElement", "parentNode", "parentStyleSheet", "pathname", "pixelDepth",
      "platform", "plugins", "pointerLockElement", "port", "preferredStyleSheetSet", "prefix",
      "previousElementSibling", "previousSibling", "product", "protocol", "prototype",
      "readyState", "referrer", "relatedTarget", "responseHeaders", "responseText",
      "responseXML", "screen", "screenLeft", "screenTop", "screenX", "screenY",
      "scripts", "scrollHeight", "scrollLeft", "scrollTop", "scrollWidth", "selected",
      "selectedIndex", "selectedStyleSheetSet", "selectorText", "self", "shiftKey", "size",
      "source", "src", "status", "statusText", "style", "styleSheetSets", "styleSheets",
      "tagName", "target", "textContent", "textDecoration", "timeStamp", "title",
      "tooltipNode", "top", "type", "userAgent", "value", "verticalAlign", "visibility", "width"
    ],

    method: [
      "abs", "acos", "add", "addEventListener", "adoptNode", "alert", "appendChild", "apply",
      "asin", "assign", "atan", "atan2", "atob", "back", "bind", "blur", "btoa", "bound",
      "call", "caretPositionFromPoint", "ceil", "charAt", "charCodeAt", "clear", "clearInterval",
      "clearTimeout", "click", "cloneNode", "close", "colSpan", "compareDocumentPosition", "concat",
      "confirm", "contains", "cos", "createAttribute", "createCDATASection", "createComment",
      "createDocumentFragment", "createElement", "createElementNS", "createEntityReference",
      "createEvent", "createExpression", "createIndex", "createObjectStore", "createNSResolver",
      "createNodeIterator", "createPopup", "createProcessingInstruction", "createRange", "createTextNode",
      "createTreeWalker", "createdocumentFragment", "dir", "disconnect",
      "dispatchEvent", "documentMode", "elementFromPoint", "enableStyleSheetsForSet",
      "endsWith", "error", "eval", "evaluate", "exec", "execCommand", "exitPointerLock",
      "exp", "fetch", "filter", "find", "findIndex", "floor", "focus", "forEach", "forward", "fromCharCode", "get",
      "getAll", "getAttribute", "getAttributeNS", "getAttributeNode", "getAttributeNodeNS", "getBoundingClientRect",
      "getBoxObjectFor", "getClientRects", "getComputedStyle", "getDate", "getDay", "getElementById",
      "getElementsByClassName", "getElementsByName", "getElementsByTagName", "getElementsByTagNameNS",
      "getFeature", "getFullYear", "getHours", "getItem", "getMilliseconds", "getMinutes", "getMonth",
      "getSeconds", "getSelection", "getTime", "getTimezoneOffset", "getUTCDate", "getUTCDay", "getUTCFullYear",
      "getUTCHours", "getUTCMilliseconds", "getUTCMinutes", "getUTCMonth", "getUTCSeconds", "getUserData",
      "go", "group", "groupCollapsed", "groupEnd", "handleEvent", "hasAttribute", "hasAttributeNS",
      "hasAttributes", "hasChildNodes", "hasFocus", "hasOwnProperty", "home", "index", "importNode",
      "indexOf", "initEvent", "initKeyboardEvent", "initMouseEvent", "insertAdjacentHTML", "insertBefore",
      "includes", "isArray", "isDefaultNamespace", "isEqualNode", "isFinite", "isNaN", "isSameNode",
      "isSupported", "javaEnabled", "join", "keys", "lastIndexOf", "load", "loadOverlay", "localeCompare",
      "log", "lookupNamespaceURI", "lookupPrefix", "lowerBound", "map", "match", "matches", "max", "min",
      "moveBy", "moveTo", "mozCancelFullScreen", "mozSetImageElement", "nextNode", "normalize",
      "normalizeDocument", "observe", "open", "padEnd", "padStart", "parse", "parseFloat", "parseFromString",
      "parseInt", "pop", "pow", "preventDefault", "print", "prompt", "push", "put", "objectStore", "only",
      "openCursor", "openKeyCursor", "queryCommandSupported", "querySelector", "querySelectorAll", "random",
      "reduce", "releaseCapture", "reload", "remove", "removeAttribute", "removeAttributeNS", "removeAttributeNode",
      "removeChild", "removeEventListener", "removeItem", "renameNode", "replace", "replaceChild", "requestFullscreen",
      "requestPointerLock", "resizeBy", "resizeTo", "reverse", "round", "scroll", "scrollBy", "scrollIntoView",
      "scrollTo", "search", "select", "setAttribute", "setAttributeNS", "setAttributeNode", "setAttributeNodeNS",
      "setCapture", "setDate", "setFullYear", "setHours", "setInterval", "setItem", "setMilliseconds", "setMinutes",
      "setMonth", "setSeconds", "setTime", "setTimeout", "setUTCDate", "setUTCFullYear", "setUTCHours",
      "setUTCMilliseconds", "setUTCMinutes", "setUTCMonth", "setUTCSeconds", "setUserData", "shift", "sin",
      "singleNodeValue", "slice", "sort", "splice", "split", "sqrt", "startsWith", "stop", "stopImmediatePropagation",
      "stopPropagation", "strictErrorChecking", "stringify", "submit", "substr", "substring", "supports",
      "tan", "test", "then", "time", "timeEnd", "timeLog", "toDateString", "toExponential", "toFixed",
      "toggle", "toISOString", "toJSON", "toLocaleDateString", "toLocaleLowerCase", "toLocaleString",
      "toLocaleTimeString", "toLocaleUpperCase", "toLowerCase", "toPrecision", "toSource", "toString",
      "toTimeString", "toUTCString", "toUpperCase", "trace", "trim", "transaction", "upperBound", "unshift",
      "valueOf", "warn", "write", "writeln"
    ],
    gm: [
      "GM", "deleteValue", "getResourceUrl", "getValue", "info", "listValues", "notification",
      "openInTab", "setClipboard", "setValue", "xmlHttpRequest",
      "GM_deleteValue", "GM_getResourceURL", "GM_getValue", "GM_info", "GM_listValues", "GM_notification",
      "GM_openInTab", "GM_setClipboard", "GM_setValue", "GM_xmlhttpRequest", "GM_fetch",
      "unsafeWindow"
    ]
  },

  css: {

    property: [
      "align-content", "align-items", "align-self", "all", "animation", "animation-delay", "animation-direction",
      "animation-duration", "animation-fill-mode", "animation-iteration-count", "animation-name", "animation-play-state",
      "animation-timing-function", "backface-visibility", "background", "background-attachment", "background-blend-mode",
      "background-clip", "background-color", "background-image", "background-origin", "background-position",
      "background-repeat", "background-size", "border", "border-bottom", "border-bottom-color", "border-bottom-left-radius",
      "border-bottom-right-radius", "border-bottom-style", "border-bottom-width", "border-collapse", "border-color",
      "border-image", "border-image-outset", "border-image-repeat", "border-image-slice", "border-image-source",
      "border-image-width", "border-left", "border-left-color", "border-left-style", "border-left-width",
      "border-radius", "border-right", "border-right-color", "border-right-style", "border-right-width",
      "border-spacing", "border-style", "border-top", "border-top-color", "border-top-left-radius",
      "border-top-right-radius", "border-top-style", "border-top-width", "border-width", "bottom",
      "box-decoration-break", "box-shadow", "box-sizing", "break-after", "break-before", "break-inside",
      "caption-side", "caret-color", "@charset", "clear", "clip", "color", "column-count", "column-fill",
      "column-gap", "column-rule", "column-rule-color", "column-rule-style", "column-rule-width",
      "column-span", "column-width", "columns", "content", "counter-increment", "counter-reset",
      "cursor", "direction", "display", "empty-cells", "fill", "filter", "flex", "flex-basis", "flex-direction",
      "flex-flow", "flex-grow", "flex-shrink", "flex-wrap", "float", "font", "@font-face", "font-family",
      "font-feature-settings", "@font-feature-values", "font-kerning", "font-language-override", "font-size",
      "font-size-adjust", "font-stretch", "font-style", "font-synthesis", "font-variant", "font-variant-alternates",
      "font-variant-caps", "font-variant-east-asian", "font-variant-ligatures", "font-variant-numeric",
      "font-variant-position", "font-weight", "grid", "grid-area", "grid-auto-columns", "grid-auto-flow",
      "grid-auto-rows", "grid-column", "grid-column-end", "grid-column-gap", "grid-column-start", "grid-gap",
      "grid-row", "grid-row-end", "grid-row-gap", "grid-row-start", "grid-template", "grid-template-areas",
      "grid-template-columns", "grid-template-rows", "hanging-punctuation", "height", "hyphens", "image-rendering",
      "@import", "isolation", "justify-content", "@keyframes", "left", "letter-spacing", "line-break",
      "line-height", "list-style", "list-style-image", "list-style-position", "list-style-type", "margin",
      "margin-bottom", "margin-left", "margin-right", "margin-top", "max-height", "max-width", "@media",
      "min-height", "min-width", "mix-blend-mode", "object-fit", "object-position", "opacity", "order",
      "orphans", "outline", "outline-color", "outline-offset", "outline-style", "outline-width",
      "overflow", "overflow-wrap", "overflow-x", "overflow-y", "padding", "padding-bottom", "padding-left",
      "padding-right", "padding-top", "page-break-after", "page-break-before", "page-break-inside",
      "perspective", "perspective-origin", "pointer-events", "position", "quotes", "resize", "right",
      "scroll-behavior", "tab-size", "table-layout", "text-align", "text-align-last", "text-combine-upright",
      "text-decoration", "text-decoration-color", "text-decoration-line", "text-decoration-style",
      "text-indent", "text-justify", "text-orientation", "text-overflow", "text-shadow", "text-transform",
      "text-underline-position", "top", "transform", "transform-origin", "transform-style", "transition",
      "transition-delay", "transition-duration", "transition-property", "transition-timing-function",
      "unicode-bidi", "user-select", "vertical-align", "visibility", "white-space", "widows", "width",
      "word-break", "word-spacing", "word-wrap", "writing-mode", "z-index"
    ],

    value: [
      "absolute", "after-edge", "after", "all-scroll", "all", "alphabetic", "always", "antialiased", "armenian",
      "auto", "avoid-column", "avoid-page", "avoid", "balance", "baseline", "before-edge", "before", "below",
      "bidi-override", "block-line-height", "block", "bold", "bolder", "border-box", "both", "bottom", "box",
      "break-all", "break-word", "capitalize", "caps-height", "caption", "center", "central", "char", "circle",
      "cjk-ideographic", "clone", "close-quote", "col-resize", "collapse", "column", "consider-shifts",
      "contain", "content-box", "cover", "crosshair", "cubic-bezier", "dashed", "decimal-leading-zero",
      "decimal", "default", "disabled", "disc", "disregard-shifts", "distribute-all-lines", "distribute-letter",
      "distribute-space", "distribute", "dotted", "double", "e-resize", "ease-in", "ease-in-out", "ease-out",
      "ease", "ellipsis", "end", "exclude-ruby", "fixed", "georgian", "glyphs", "grid-height", "groove",
      "hand", "hanging", "hebrew", "help", "hidden", "hiragana-iroha", "hiragana", "horizontal", "icon",
      "ideograph-alpha", "ideograph-numeric", "ideograph-parenthesis", "ideograph-space", "ideographic",
      "inactive", "include-ruby", "inherit", "initial", "inline-block", "inline-box", "inline-line-height",
      "inline-table", "inline", "inset", "inside", "inter-ideograph", "inter-word", "invert", "italic",
      "justify", "katakana-iroha", "katakana", "keep-all", "last", "left", "lighter", "line-edge",
      "line-through", "line", "linear", "list-item", "local", "loose", "lower-alpha", "lower-greek",
      "lower-latin", "lower-roman", "lowercase", "lr-tb", "ltr", "mathematical", "max-height", "max-size",
      "medium", "menu", "message-box", "middle", "move", "n-resize", "ne-resize", "newspaper", "no-change",
      "no-close-quote", "no-drop", "no-open-quote", "no-repeat", "none", "normal", "not-allowed", "nowrap",
      "nw-resize", "oblique", "open-quote", "outset", "outside", "overline", "padding-box", "page", "pointer",
      "pre-line", "pre-wrap", "pre", "preserve-3d", "progress", "relative", "repeat-x", "repeat-y", "repeat",
      "replaced", "reset-size", "ridge", "right", "round", "row-resize", "rtl", "s-resize", "scroll", "se-resize",
      "separate", "slice", "small-caps", "small-caption", "solid", "space", "square", "start", "static",
      "status-bar", "step-end", "step-start", "steps", "stretch", "strict", "sub", "super", "sw-resize",
      "table-caption", "table-cell", "table-column-group", "table-column", "table-footer-group", "table-header-group",
      "table-row-group", "table-row", "table", "tb-rl", "text-after-edge", "text-before-edge", "text-bottom",
      "text-size", "text-top", "text", "thick", "thin", "transparent", "underline", "upper-alpha", "upper-latin",
      "upper-roman", "uppercase", "use-script", "vertical-ideographic", "vertical-text", "visible",
      "w-resize", "wait", "whitespace", "z-index", "zero", "zoom"
    ],

    html: [
      "a", "abbr", "address", "area", "article", "aside", "audio",
      "b", "base", "bdi", "bdo", "blockquote", "body", "br", "button",
      "canvas", "caption", "cite", "code", "col", "colgroup",
      "data", "datalist", "dd", "del", "details", "dfn", "dialog", "div", "dl", "dt",
      "em", "embed", "fieldset", "figcaption", "figure", "footer", "form",
      "h1 to h6", "head", "header", "hr", "html", "i", "iframe", "img", "input", "ins",
      "kbd", "label", "legend", "li", "link", "main", "map", "mark", "meta", "meter", "nav", "noscript",
      "object", "ol", "optgroup", "option", "output", "p", "param", "picture", "pre", "progress", "q",
      "rp", "rt", "ruby", "s", "samp", "script", "section", "select", "small", "source", "span",
      "strong", "style", "sub", "summary", "sup", "svg",
      "table", "tbody", "td", "template", "textarea", "tfoot", "th", "thead", "time", "title", "tr", "track",
      "u", "ul", "var", "video", "wbr"
    ],

    font: [
      "arial", "century", "comic", "courier", "cursive", "fantasy", "garamond", "georgia",
      "helvetica", "impact", "lucida", "symbol", "system", "tahoma", "times", "trebuchet",
      "utopia", "verdana", "webdings", "sans-serif", "serif", "monospace"
    ],

    color: [
      "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure",
      "beige", "bisque", "black", "blanchedalmond", "blue", "blueviolet", "brown", "burlywood",
      "cadetblue", "chartreuse", "chocolate", "coral", "cornflowerblue", "cornsilk", "crimson", "cyan",
      "darkblue", "darkcyan", "darkgoldenrod", "darkgray", "darkgreen", "darkgrey", "darkkhaki",
      "darkmagenta", "darkolivegreen", "darkorange", "darkorchid", "darkred", "darksalmon",
      "darkseagreen", "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise", "darkviolet",
      "deeppink", "deepskyblue", "dimgray", "dimgrey", "dodgerblue",
      "firebrick", "floralwhite", "forestgreen", "fuchsia",
      "gainsboro", "ghostwhite", "gold", "goldenrod", "gray", "green", "greenyellow", "grey",
      "honeydew", "hotpink",
      "indianred", "indigo", "ivory", "khaki",
      "lavender", "lavenderblush", "lawngreen", "lemonchiffon", "lightblue", "lightcoral", "lightcyan",
      "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey", "lightpink", "lightsalmon",
      "lightseagreen", "lightskyblue", "lightslategray", "lightslategrey", "lightsteelblue",
      "lightyellow", "lime", "limegreen", "linen",
      "magenta", "maroon", "mediumaquamarine", "mediumblue", "mediumorchid", "mediumpurple",
      "mediumseagreen", "mediumslateblue", "mediumspringgreen", "mediumturquoise",
      "mediumvioletred", "midnightblue", "mintcream", "mistyrose", "moccasin",
      "navajowhite", "navy",
      "oldlace", "olive", "olivedrab", "orange", "orangered", "orchid",
      "palegoldenrod", "palegreen", "paleturquoise", "palevioletred", "papayawhip",
      "peachpuff", "peru", "pink", "plum", "powderblue", "purple",
      "rebeccapurple", "red", "rosybrown", "royalblue",
      "saddlebrown", "salmon", "sandybrown", "seagreen", "seashell", "sienna", "silver",
      "skyblue", "slateblue", "slategray", "slategrey", "snow", "springgreen", "steelblue",
      "tan", "teal", "thistle", "tomato", "turquoise",
      "violet", "wheat", "white", "whitesmoke", "yellow", "yellowgreen"
    ],

    pseudo: [
      "::after", "::before", "::first-letter", "::first-line", "::selection",
      ":active", ":checked", ":disabled", ":empty", ":enabled", ":first-child", ":first-of-type",
      ":focus", ":hover", ":in-range", ":invalid", ":lang", ":last-child", ":last-of-type",
      ":link", ":not", ":nth-child", ":nth-last-child", ":nth-last-of-type", ":nth-of-type",
      ":only-of-type", ":only-child", ":optional", ":out-of-range", ":read-only", ":read-write",
      ":required", ":root", ":target", ":valid", ":visited"
    ]
  }
};