// Goals checklist ("Let's set goals!" in the focus-mode menu).
//
// You write straight into the page (a contenteditable box, shown formatted as you type); it's
// saved as MARKDOWN in goals.md (main process: src/main/windows/goalsWindow.js), a moment after
// you stop typing, and when the window closes. The Markdown it writes and reads:
//   **bold**   *italic*   <u>underline</u> (Markdown has no underline; <u> is the usual stand-in)
//   - a bullet point
//   - [ ] a checkbox      - [x] a ticked checkbox
//   a plain line (an empty line = an empty line)
// Characters that would read as formatting (* \ < and a line starting with "-") are escaped with \.
//
// TOOLBAR (B I U • □): toggles that style for the selection / what you type next, or turns the
// lines you're on into bullet points / checkboxes (and back). A button shows the "selected" art
// while its style is on where the cursor is. Ctrl+B / Ctrl+I / Ctrl+U work too.
// Click a checkbox's box to tick / untick it.

const api = window.sprite || {};
const editor = document.getElementById('editor');
const tools = [...document.querySelectorAll('.tool')];

// Use <div> per line and <b>/<i>/<u> tags (not inline styles), so the Markdown is easy to write.
document.execCommand('defaultParagraphSeparator', false, 'div');
document.execCommand('styleWithCSS', false, false);

// ---------------------------------------------------------------- Markdown → page
const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** One line's inline Markdown (**, *, <u>, \ escapes) → HTML. */
function inlineToHtml(text) {
  let out = '';
  const open = { b: false, i: false, u: false };
  const toggle = (tag) => { out += open[tag] ? `</${tag}>` : `<${tag}>`; open[tag] = !open[tag]; };
  for (let k = 0; k < text.length; k++) {
    const ch = text[k];
    if (ch === '\\' && k + 1 < text.length) { out += escHtml(text[++k]); continue; }
    if (text.startsWith('**', k)) { toggle('b'); k++; continue; }
    if (ch === '*') { toggle('i'); continue; }
    if (text.startsWith('<u>', k) && !open.u) { toggle('u'); k += 2; continue; }
    if (text.startsWith('</u>', k) && open.u) { toggle('u'); k += 3; continue; }
    out += escHtml(ch);
  }
  for (const tag of ['u', 'i', 'b']) if (open[tag]) out += `</${tag}>`; // unclosed: close at line end
  return out || '<br>';
}

function markdownToHtml(md) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  let html = '';
  let list = null; // 'bullets' | 'checklist' while inside a list
  const closeList = () => { if (list) html += '</ul>'; list = null; };
  for (const line of lines) {
    const check = line.match(/^- \[( |x|X)\] ?(.*)$/);
    const bullet = !check && line.match(/^- (.*)$/);
    if (check) {
      if (list !== 'checklist') { closeList(); html += '<ul class="checklist">'; list = 'checklist'; }
      html += `<li${check[1] !== ' ' ? ' data-checked="true"' : ''}>${inlineToHtml(check[2])}</li>`;
    } else if (bullet) {
      if (list !== 'bullets') { closeList(); html += '<ul>'; list = 'bullets'; }
      html += `<li>${inlineToHtml(bullet[1])}</li>`;
    } else {
      closeList();
      html += `<div>${line ? inlineToHtml(line) : '<br>'}</div>`;
    }
  }
  closeList();
  return html;
}

// ---------------------------------------------------------------- page → Markdown
const escMd = (s) => s.replace(/[\\*<]/g, (c) => `\\${c}`);

// Inline content → Markdown, written as RUNS: pieces of text with the same bold / italic /
// underline, and only the changes between neighbouring runs as markers. So between two bits of
// text there's at most one "**" and one "*" (plus <u>/</u>), which always reads back the same way.
// (Writing tag by tag could glue markers together, e.g. "****" or "***" between bold and italic
// pieces, which read back as different formatting: bold seemed to come and go after reopening.)
const BOLD = new Set(['B', 'STRONG']);
const ITALIC = new Set(['I', 'EM']);
function collectRuns(node, f, runs) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.nodeValue.replace(/\u00a0/g, ' ').replace(/\n/g, ' ');
    if (!text) return;
    const last = runs[runs.length - 1];
    if (last && last.b === f.b && last.i === f.i && last.u === f.u) last.text += text;
    else runs.push({ text, ...f });
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE || node.tagName === 'BR') return;
  const g = {
    b: f.b || BOLD.has(node.tagName),
    i: f.i || ITALIC.has(node.tagName),
    u: f.u || node.tagName === 'U',
  };
  for (const child of node.childNodes) collectRuns(child, g, runs);
}
function inlineToMd(nodes) {
  const runs = [];
  for (const n of nodes) collectRuns(n, { b: false, i: false, u: false }, runs);
  let out = '';
  const on = { b: false, i: false, u: false };
  const set = (want) => {
    // Close what ends (innermost first), then open what starts.
    if (on.u && !want.u) out += '</u>';
    if (on.i && !want.i) out += '*';
    if (on.b && !want.b) out += '**';
    if (!on.b && want.b) out += '**';
    if (!on.i && want.i) out += '*';
    if (!on.u && want.u) out += '<u>';
    Object.assign(on, want);
  };
  for (const r of runs) {
    // Spaces at the start of a run go after the previous run's closing markers and before this
    // run's opening ones ("**bold** word", not "**bold **word").
    const lead = r.text.match(/^ */)[0];
    set({ b: on.b && r.b, i: on.i && r.i, u: on.u && r.u }); // close what ends here
    out += lead;
    set(r); // open what starts here
    out += escMd(r.text.slice(lead.length));
  }
  set({ b: false, i: false, u: false });
  return out;
}
// A plain line that starts with "-" would come back as a list item: escape it.
const plainLine = (s) => (s.startsWith('-') ? `\\${s}` : s);

// The editor's structure isn't flat: Chromium puts lists INSIDE the line <div>s and ends lines
// with <br>s, so walk it as blocks. Inline bits (text, <b>, ...) collect into the current line;
// a <br> ends the line (an empty one too: that's a blank line); a <div>/<p> is its own line(s);
// a list adds one line per item.
const BLOCKS = new Set(['DIV', 'P', 'UL', 'OL', 'BR', 'H1', 'H2', 'H3', 'BLOCKQUOTE']);
function blocksToLines(container, lines) {
  let buf = [];
  const flush = (force) => {
    if (buf.length || force) lines.push(plainLine(inlineToMd(buf)));
    buf = [];
  };
  for (const node of container.childNodes) {
    if (node.nodeType === Node.ELEMENT_NODE && BLOCKS.has(node.tagName)) {
      if (node.tagName === 'BR') { flush(true); continue; }
      flush(false);
      if (node.tagName === 'UL' || node.tagName === 'OL') {
        const checklist = node.classList.contains('checklist');
        for (const li of node.querySelectorAll(':scope > li')) {
          const text = inlineToMd(li.childNodes).trim();
          lines.push(checklist ? `- [${li.dataset.checked === 'true' ? 'x' : ' '}] ${text}` : `- ${text}`);
        }
      } else {
        blocksToLines(node, lines);
      }
      continue;
    }
    if (node.nodeType === Node.TEXT_NODE && !node.nodeValue.length) continue;
    buf.push(node);
  }
  flush(false);
}

function htmlToMarkdown() {
  const lines = [];
  blocksToLines(editor, lines);
  while (lines.length && lines[lines.length - 1] === '') lines.pop(); // no trailing blank lines
  return lines.length ? `${lines.join('\n')}\n` : '';
}

// ---------------------------------------------------------------- saving
let saveTimer = null;
function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  api.saveGoals?.(htmlToMarkdown());
}
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}
window.addEventListener('beforeunload', () => { if (saveTimer) saveNow(); });

// ---------------------------------------------------------------- lists
/** The <ul> the cursor (start of the selection) is in, or null. */
function currentList() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  let n = sel.getRangeAt(0).startContainer;
  if (n.nodeType === Node.TEXT_NODE) n = n.parentNode;
  const ul = n.closest?.('ul');
  return ul && editor.contains(ul) ? ul : null;
}

/** The list items the selection touches (just the cursor's item when nothing is selected). */
function selectedItems() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return [];
  const range = sel.getRangeAt(0);
  let n = range.startContainer;
  if (n.nodeType === Node.TEXT_NODE) n = n.parentNode;
  const own = n.closest?.('li');
  const items = [...editor.querySelectorAll('li')].filter((li) => range.intersectsNode(li));
  if (own && editor.contains(own) && !items.includes(own)) items.unshift(own);
  return items.filter((li) => li.parentElement?.tagName === 'UL');
}

// Selection by node references: survives moving nodes around (the nodes themselves stay).
function saveSelection() {
  const sel = window.getSelection();
  return sel.rangeCount ? [sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset] : null;
}
function restoreSelection(saved) {
  if (!saved || !saved[0]?.isConnected || !saved[2]?.isConnected) return;
  try { window.getSelection().setBaseAndExtent(...saved); } catch { /* offsets out of range: leave it */ }
}

/**
 * Turn just these items into checkboxes (or bullet points), splitting their list around them:
 * items above and below keep their type. (The whole list used to switch: a checkbox on the line
 * after some bullets turned all those bullets into checkboxes too.)
 */
function retypeItems(items, checklist) {
  const saved = saveSelection();
  const byList = new Map();
  for (const li of items) {
    if (!byList.has(li.parentElement)) byList.set(li.parentElement, []);
    byList.get(li.parentElement).push(li);
  }
  for (const [ul, lis] of byList) {
    const all = [...ul.children];
    const first = all.indexOf(lis[0]);
    const last = all.indexOf(lis[lis.length - 1]);
    const mid = document.createElement('ul');
    if (checklist) mid.className = 'checklist';
    const after = ul.cloneNode(false);
    ul.after(mid, after);
    all.forEach((li, k) => {
      if (k >= first && k <= last) mid.appendChild(li);
      else if (k > last) after.appendChild(li);
    });
    if (!checklist) mid.querySelectorAll('li').forEach((li) => li.removeAttribute('data-checked'));
    for (const list of [ul, after]) if (!list.children.length) list.remove();
  }
  restoreSelection(saved);
}

function toggleList(kind) {
  editor.focus();
  const wantChecklist = kind === 'checklist';
  let items = selectedItems();
  const isType = (li) => li.parentElement.classList.contains('checklist') === wantChecklist;
  if (items.length && items.every(isType)) {
    document.execCommand('insertUnorderedList'); // already that type: back to plain lines
  } else if (items.length) {
    retypeItems(items, wantChecklist); // bullets ↔ checkboxes, only for these lines
  } else {
    document.execCommand('insertUnorderedList'); // plain lines → a list...
    items = selectedItems();
    // ...which the browser may merge into a list right above: give just these lines the type.
    if (items.length && !items.every(isType)) retypeItems(items, wantChecklist);
  }
  // A list turned back into lines can leave a stray attribute on the new <div>s.
  editor.querySelectorAll(':scope > div[data-checked]').forEach((d) => d.removeAttribute('data-checked'));
  changed();
}

// ---------------------------------------------------------------- toolbar
function updateToolbar() {
  const item = selectedItems()[0];
  const ul = item ? item.parentElement : currentList();
  const state = {
    bold: document.queryCommandState('bold'),
    italic: document.queryCommandState('italic'),
    underline: document.queryCommandState('underline'),
    bullets: Boolean(ul && !ul.classList.contains('checklist')),
    checklist: Boolean(ul?.classList.contains('checklist')),
  };
  for (const t of tools) t.setAttribute('aria-pressed', String(Boolean(state[t.dataset.cmd])));
}

for (const t of tools) {
  // Keep the text selection while clicking a button.
  t.addEventListener('mousedown', (e) => e.preventDefault());
  t.addEventListener('click', () => {
    const cmd = t.dataset.cmd;
    if (cmd === 'bullets' || cmd === 'checklist') toggleList(cmd);
    else {
      editor.focus();
      document.execCommand(cmd);
      changed();
    }
    updateToolbar();
  });
}
document.addEventListener('selectionchange', () => {
  if (editor.contains(window.getSelection().anchorNode)) updateToolbar();
});

// ---------------------------------------------------------------- checkbox items
// The box is the li's ::before (goals.css): a click within its width ticks / unticks.
const boxHit = (li, e) => {
  const em = parseFloat(getComputedStyle(li).fontSize);
  return e.clientX - li.getBoundingClientRect().left <= 1.2 * em * (Number(document.documentElement.style.zoom) || 1);
};
const checkItemAt = (e) => {
  const li = e.target.closest?.('ul.checklist > li');
  return li && editor.contains(li) && boxHit(li, e) ? li : null;
};
editor.addEventListener('mousedown', (e) => {
  const li = checkItemAt(e);
  if (!li) return;
  e.preventDefault(); // don't move the cursor
  li.dataset.checked = li.dataset.checked === 'true' ? 'false' : 'true';
  if (li.dataset.checked === 'false') li.removeAttribute('data-checked');
  changed();
  // Ticked (not unticked): tell Starby, with how many goals there are and how many are done, so
  // he can cheer (and cheer extra when they're all done). Which line and the cooldowns:
  // src/renderer/pet/events/focus.js onGoalChecked().
  if (li.dataset.checked === 'true') {
    const goals = editor.querySelectorAll('ul.checklist > li');
    const done = editor.querySelectorAll('ul.checklist > li[data-checked="true"]');
    api.goalChecked?.({ total: goals.length, checked: done.length });
  }
});
let hovered = null;
editor.addEventListener('mousemove', (e) => {
  const li = checkItemAt(e);
  if (li === hovered) return;
  hovered?.classList.remove('box-hover');
  hovered = li;
  hovered?.classList.add('box-hover');
  editor.style.cursor = li ? 'pointer' : '';
});
editor.addEventListener('mouseleave', () => { hovered?.classList.remove('box-hover'); hovered = null; editor.style.cursor = ''; });

// ---------------------------------------------------------------- tidying (the bold bug)
// When lines or list items get joined or moved (Backspace / Delete across a line break, a list
// turned back into lines), Chromium keeps how the text LOOKED by copying its computed style onto it
// as inline styles: e.g. <span style="font-weight: bold">, or style="-webkit-text-stroke-color:
// initial". That broke bold: our bold look is an outline on <b> tags (goals.css), so a bold SPAN
// showed as plain text (while the B button said bold), copied stroke styles could fight the
// outline, and the saved Markdown (which reads tags) lost the bold. So after every edit: inline
// bold / italic / underline become <b> / <i> / <u> tags, all other inline styles are dropped
// (this editor never uses any), and leftover empty <span>s are unwrapped. The cursor stays put.
function tidy() {
  if (!editor.querySelector('[style], span, font, b:empty, strong:empty, i:empty, em:empty, u:empty')) return;
  const saved = saveSelection();
  for (const el of editor.querySelectorAll('[style]')) {
    const st = el.style;
    const fw = st.fontWeight;
    const wants = [
      ['u', /underline/.test(st.textDecorationLine || st.textDecoration || '')],
      ['i', st.fontStyle === 'italic' || st.fontStyle === 'oblique'],
      ['b', fw === 'bold' || fw === 'bolder' || parseInt(fw, 10) >= 600],
    ];
    el.removeAttribute('style');
    for (const [tag, want] of wants) {
      if (!want || el.closest(tag)) continue; // (already inside one)
      const wrap = document.createElement(tag);
      while (el.firstChild) wrap.appendChild(el.firstChild);
      el.appendChild(wrap);
    }
  }
  for (const el of [...editor.querySelectorAll('span, font')]) {
    if (!el.attributes.length) el.replaceWith(...el.childNodes);
  }
  // Empty <b>/<i>/<u> left behind by edits (but not one the cursor is sitting in).
  const anchor = saved?.[0];
  for (const el of [...editor.querySelectorAll('b, strong, i, em, u')]) {
    if (!el.textContent && !el.querySelector('br') && !(anchor && el.contains(anchor))) el.remove();
  }
  restoreSelection(saved);
}

// ---------------------------------------------------------------- editing
function changed() {
  tidy();
  // An item emptied out (its text cut / deleted) starts over unticked.
  for (const li of editor.querySelectorAll('li[data-checked]')) {
    if (!li.textContent.trim()) li.removeAttribute('data-checked');
  }
  editor.classList.toggle('is-empty', !editor.textContent.trim() && !editor.querySelector('li'));
  saveSoon();
}
// Ctrl+B / Ctrl+I / Ctrl+U: do it ourselves, so the button updates the moment you press it (the
// browser's own shortcut only showed up in the toolbar once you typed).
const SHORTCUTS = { b: 'bold', i: 'italic', u: 'underline' };
editor.addEventListener('keydown', (e) => {
  const cmd = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && SHORTCUTS[e.key.toLowerCase()];
  if (!cmd) return;
  e.preventDefault();
  document.execCommand(cmd);
  changed();
  updateToolbar();
});

// Markdown-style shortcut: "- " typed at the start of a plain line turns it into a bullet point.
function maybeStartList(e) {
  if (e.inputType !== 'insertText' || e.data !== ' ') return false;
  const sel = window.getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return false;
  let n = sel.anchorNode;
  if (n.nodeType === Node.TEXT_NODE) n = n.parentNode;
  if (n.closest?.('li')) return false; // already in a list
  const line = n.closest?.('div, p') || editor;
  if (!editor.contains(line)) return false;
  const before = document.createRange();
  before.setStart(line, 0);
  before.setEnd(sel.anchorNode, sel.anchorOffset);
  if (before.toString().replace(/ /g, ' ') !== '- ') return false;
  // Right after this event: Chromium won't run an editing command from inside another one's
  // input event (scripted typing, undo/redo), so the list is made a moment later.
  const typed = sel.anchorNode;
  setTimeout(() => {
    const now = window.getSelection();
    if (now.anchorNode !== typed) return; // moved on already
    document.execCommand('delete');
    document.execCommand('delete');
    toggleList('bullets');
    updateToolbar();
  }, 0);
  return true;
}

editor.addEventListener('input', (e) => {
  if (maybeStartList(e)) { changed(); return; }
  // Enter on a ticked item makes a new item: start it unticked.
  if (e.inputType === 'insertParagraph') {
    const sel = window.getSelection();
    let n = sel.anchorNode;
    if (n?.nodeType === Node.TEXT_NODE) n = n.parentNode;
    const li = n?.closest?.('li');
    if (li && !li.textContent.trim()) li.removeAttribute('data-checked');
  }
  // Emptied completely: keep one empty line so typing starts a normal line.
  if (!editor.firstChild) editor.innerHTML = '<div><br></div>';
  changed();
  updateToolbar();
});
// ---------------------------------------------------------------- copy / cut / paste
// Copy and paste keep the checklist's own formatting, and only that: bold, italic, underline,
// bullet points, checkboxes (ticked or not) and line breaks. Anything else in pasted HTML (fonts,
// colours, sizes, pictures, links, tables...) is dropped, its text kept. Pasting from other apps
// keeps their bold / italic / underline / lists too (e.g. a web page's or Word's), and a web page's
// checkbox list (<li><input type="checkbox">...) becomes checkboxes.

/** Clean HTML holding only the formatting this editor supports. `source` is a node to read from. */
function cleanHtml(source) {
  const out = document.createElement('div');
  const tagFor = (el) => {
    const t = el.tagName;
    if (BOLD.has(t)) return 'b';
    if (ITALIC.has(t)) return 'i';
    if (t === 'U' || t === 'INS') return 'u';
    if (t === 'UL' || t === 'OL') return 'ul';
    if (t === 'LI') return 'li';
    if (t === 'BR') return 'br';
    if (/^(DIV|P|H[1-6]|BLOCKQUOTE|PRE|SECTION|ARTICLE|HEADER|FOOTER|TR)$/.test(t)) return 'div';
    return null; // anything else: just its contents
  };
  const walk = (node, into) => {
    for (const n of node.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) {
        // Line breaks in HTML source are just formatting (the editor shows whitespace as typed,
        // so they'd become stray blank lines / spaces): drop whitespace-only bits that contain
        // one, and turn the rest into a single space, the way a web page shows them.
        if (/\n/.test(n.nodeValue) && !n.nodeValue.trim()) continue;
        into.appendChild(document.createTextNode(n.nodeValue.replace(/\s*\n\s*/g, ' ')));
        continue;
      }
      if (n.nodeType !== Node.ELEMENT_NODE) continue;
      if (/^(SCRIPT|STYLE|TEMPLATE|HEAD|TITLE|META|LINK|IMG|SVG|VIDEO|AUDIO|IFRAME|OBJECT|BUTTON|SELECT|TEXTAREA)$/.test(n.tagName)) continue;
      if (n.tagName === 'INPUT') continue; // (a checkbox is read by its <li> below)
      let tag = tagFor(n);
      let el = tag ? document.createElement(tag) : null;
      // Inline styles from other apps (Word, Google Docs...): bold / italic / underline as tags.
      const st = n.style;
      const wraps = [];
      if (st) {
        if (st.fontWeight === 'bold' || parseInt(st.fontWeight, 10) >= 600) wraps.push('b');
        if (st.fontStyle === 'italic') wraps.push('i');
        if (/underline/.test(st.textDecorationLine || st.textDecoration || '')) wraps.push('u');
      }
      if (tag === 'ul') {
        const box = n.querySelector(':scope > li > input[type="checkbox"]');
        if (n.classList.contains('checklist') || box) el.className = 'checklist';
      }
      if (tag === 'li') {
        const box = n.querySelector(':scope > input[type="checkbox"]');
        if (n.dataset.checked === 'true' || box?.checked || box?.hasAttribute('checked')) el.dataset.checked = 'true';
      }
      let target = el || into;
      if (el) into.appendChild(el);
      for (const w of wraps) {
        if (w === tag) continue;
        const wrap = document.createElement(w);
        target.appendChild(wrap);
        target = wrap;
      }
      if (tag !== 'br') walk(n, target);
    }
  };
  walk(source, out);
  // List items outside a list (e.g. copying a few items out of the middle of one): wrap them.
  for (const li of [...out.querySelectorAll('li')]) {
    if (li.parentElement.tagName === 'UL') continue;
    const ul = document.createElement('ul');
    li.before(ul);
    ul.appendChild(li);
    while (ul.nextSibling?.tagName === 'LI') ul.appendChild(ul.nextSibling);
  }
  return out.innerHTML;
}

// Copy / cut: put the selection on the clipboard as clean HTML (so pasting keeps checkboxes,
// ticks and styles, here or in another window) plus plain text for other apps.
function copySelection(e) {
  const sel = window.getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  const box = document.createElement('div');
  box.appendChild(range.cloneContents());
  // Several items copied out of one list: the copy holds bare <li>s; give them their list's type.
  const common = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
  // All of ONE item's text selected: copy it as that item (keeps its checkbox / tick), not as a
  // plain line. (Part of an item's text is copied as just that text.)
  const item = common?.closest?.('li');
  if (item && editor.contains(item) && range.toString().trim() && range.toString().trim() === item.textContent.trim()) {
    const ul = document.createElement('ul');
    ul.className = item.parentElement.className;
    const li = document.createElement('li');
    if (item.dataset.checked === 'true') li.dataset.checked = 'true';
    while (box.firstChild) li.appendChild(box.firstChild);
    ul.appendChild(li);
    box.appendChild(ul);
  }
  const list = common?.closest?.('ul');
  if (list && box.querySelector(':scope > li')) {
    const ul = document.createElement('ul');
    ul.className = list.className;
    while (box.firstChild) ul.appendChild(box.firstChild);
    box.appendChild(ul);
  }
  e.clipboardData.setData('text/html', cleanHtml(box));
  e.clipboardData.setData('text/plain', sel.toString());
  e.preventDefault();
  return true;
}
editor.addEventListener('copy', copySelection);
editor.addEventListener('cut', (e) => {
  if (copySelection(e)) document.execCommand('delete');
});

editor.addEventListener('paste', (e) => {
  e.preventDefault();
  const html = e.clipboardData.getData('text/html');
  if (html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const clean = cleanHtml(doc.body);
    if (clean.trim()) {
      document.execCommand('insertHTML', false, clean);
      changed(); // tidies whatever the browser added while inserting
      updateToolbar();
      return;
    }
  }
  document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
});

// ---------------------------------------------------------------- window buttons
document.getElementById('minimize').addEventListener('click', () => api.minimizeGoals?.());
document.getElementById('close').addEventListener('click', () => {
  saveNow(); // (sent before the close, so it's written first)
  api.closeGoals?.();
});

// ---------------------------------------------------------------- start
(async () => {
  const md = (await api.loadGoals?.().catch(() => '')) || '';
  editor.innerHTML = markdownToHtml(md.replace(/\n$/, ''));
  tidy();
  editor.classList.toggle('is-empty', !md.trim());
  editor.focus();
  // Cursor at the end of the text.
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  updateToolbar();
})();
