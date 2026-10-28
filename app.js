/**
 * ============================================================================
 * Side-by-Side Markdown Live Editor & Previewer — Gamility Tools
 * Standalone pure client-side GitHub-Flavored Markdown engine and workspace.
 * Copyright © 2026 Gamility (All Rights Reserved)
 * ============================================================================
 */

(function () {
  'use strict';

  // --- Constants & Storage Keys ---
  const STORAGE_KEY_CONTENT = 'gamility_markdown_draft';
  const STORAGE_KEY_VIEW = 'gamility_markdown_view_mode';

  // --- DOM Elements ---
  const markdownInput = document.getElementById('markdown-input');
  const previewOutput = document.getElementById('preview-output');
  const previewScrollContainer = document.getElementById('preview-scroll-container');
  const splitWorkspace = document.getElementById('split-workspace');
  const editorLineCol = document.getElementById('editor-line-col');
  const autosaveStatus = document.getElementById('autosave-status');

  // Stats Elements
  const statWords = document.getElementById('stat-words');
  const statChars = document.getElementById('stat-chars');
  const statHeadings = document.getElementById('stat-headings');
  const statReadtime = document.getElementById('stat-readtime');

  // Toolbar & Controls
  const fmtButtons = document.querySelectorAll('.fmt-btn');
  const viewPills = document.querySelectorAll('.view-pill');
  const btnSampleDoc = document.getElementById('btn-sample-doc');
  const btnCopyMd = document.getElementById('btn-copy-md');
  const btnCopyHtml = document.getElementById('btn-copy-html');
  const btnDownloadMd = document.getElementById('btn-download-md');
  const btnDownloadHtml = document.getElementById('btn-download-html');
  const btnClear = document.getElementById('btn-clear');
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');

  let toastTimer = null;
  let autosaveTimer = null;
  let isSyncScrolling = false;

  // --- Sample Markdown Document ---
  const SAMPLE_MARKDOWN = `# 🚀 Welcome to Gamility Markdown Studio

An ultra-responsive, privacy-first **GitHub Flavored Markdown (GFM)** workspace built directly in your browser.

> *"Simplicity is prerequisite for reliability."* — Edsger W. Dijkstra

---

## ⚡ Key Highlights
- **100% Client-Side:** Zero cloud uploads. Your data stays entirely in local memory.
- **Real-Time Rendering:** Instant HTML preview with synchronized scrolling.
- **Rich GFM Support:** Tables, code blocks with copy snippet, task checklists, and more.

## 📊 Feature Comparison Table

| Feature | Gamility Studio | Cloud Editors |
| :--- | :---: | :---: |
| Data Privacy | **100% In-Browser** | Remote Servers |
| Offline Ready | ✅ Yes | ❌ Requires Web |
| Instant HTML Export | ✅ 1-Click | ⚠️ Complex Setup |
| No Sign-Up Needed | ✅ Unrestricted | ❌ Account Required |

## 🛠️ Code Snippet Showcase

\`\`\`javascript
// High-performance live Markdown rendering
function renderMarkdown(sourceText) {
  const sanitized = escapeHtml(sourceText);
  return parseGitHubFlavoredMarkdown(sanitized);
}

console.log("Gamility Markdown Studio initialized successfully!");
\`\`\`

## 📋 Interactive Task Checklist
- [x] Set up split-screen workspace
- [x] Implement real-time document metrics
- [x] Enable 1-click HTML & Markdown export
- [ ] Craft your next great technical article!

## 💡 Quick Tips
1. Use **Ctrl+B** (or **Cmd+B**) for **bold** text.
2. Use **Ctrl+I** (or **Cmd+I**) for *italics*.
3. Press **Tab** inside the editor to indent by two spaces.
4. Try switching views: **Split**, **Write** (Editor only), or **Read** (Preview only).

*Happy writing with [Gamility Tools](https://mahesh-yennam.github.io/Gamility/tools.html)!*`;

  // --- Pure JS Markdown Parser Engine ---
  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseMarkdown(md) {
    if (!md) return '<p class="empty-preview-prompt" style="color:var(--text-dim);font-style:italic;">Nothing to preview yet. Start typing on the left or click "Sample Doc" below!</p>';

    // Normalize newlines
    let src = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 1. Extract Fenced Code Blocks first to prevent formatting collisions
    const codeBlocks = [];
    src = src.replace(/```([a-zA-Z0-9_\-+]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const idx = codeBlocks.length;
      const cleanLang = lang.trim() || 'plaintext';
      const escapedCode = escapeHtml(code.replace(/\n$/, ''));
      codeBlocks.push({
        lang: cleanLang,
        code: escapedCode,
        raw: code
      });
      return `<!--CODEBLOCK_${idx}-->`;
    });

    // 2. Extract Inline Code
    const inlineCodes = [];
    src = src.replace(/`([^`\n]+)`/g, (match, code) => {
      const idx = inlineCodes.length;
      inlineCodes.push(escapeHtml(code));
      return `<!--INLINECODE_${idx}-->`;
    });

    // 3. Process Block Elements
    const lines = src.split('\n');
    const processedLines = [];
    let inList = false;
    let listType = null; // 'ul' | 'ol'
    let inTable = false;
    let tableRows = [];
    let tableAlignments = [];

    function closeList() {
      if (inList) {
        processedLines.push(`</${listType}>`);
        inList = false;
        listType = null;
      }
    }

    function renderTable() {
      if (!tableRows.length) return;
      let html = '<div class="table-container"><table>';
      
      // Header row
      if (tableRows.length > 0) {
        html += '<thead><tr>';
        const headers = tableRows[0];
        headers.forEach((cell, i) => {
          const align = tableAlignments[i] ? ` style="text-align: ${tableAlignments[i]}"` : '';
          html += `<th${align}>${parseInlines(cell)}</th>`;
        });
        html += '</tr></thead>';
      }

      // Body rows (skip row 0 which is header)
      if (tableRows.length > 1) {
        html += '<tbody>';
        for (let r = 1; r < tableRows.length; r++) {
          html += '<tr>';
          const row = tableRows[r];
          row.forEach((cell, i) => {
            const align = tableAlignments[i] ? ` style="text-align: ${tableAlignments[i]}"` : '';
            html += `<td${align}>${parseInlines(cell)}</td>`;
          });
          html += '</tr>';
        }
        html += 'tbody>';
      }

      html += '</table></div>';
      processedLines.push(html);
      tableRows = [];
      tableAlignments = [];
      inTable = false;
    }

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();

      // Check for codeblock placeholder
      if (/^<!--CODEBLOCK_\d+-->$/.test(trimmed)) {
        closeList();
        if (inTable) renderTable();
        processedLines.push(trimmed);
        continue;
      }

      // Table Row Detection: line starts/ends with | or contains |
      if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 2) {
        closeList();
        const cells = trimmed
          .slice(1, -1)
          .split('|')
          .map(c => c.trim());

        // Check if this line is delimiter row like | :--- | :---: | ---: |
        const isDelimiter = cells.every(c => /^:?-+:?$/.test(c));
        if (isDelimiter) {
          tableAlignments = cells.map(c => {
            if (c.startsWith(':') && c.endsWith(':')) return 'center';
            if (c.endsWith(':')) return 'right';
            if (c.startsWith(':')) return 'left';
            return 'left';
          });
          inTable = true;
          continue;
        }

        tableRows.push(cells);
        continue;
      } else {
        if (inTable) {
          renderTable();
        }
      }

      // Horizontal Rule
      if (/^(?:[-*_]){3,}\s*$/.test(trimmed)) {
        closeList();
        processedLines.push('<hr>');
        continue;
      }

      // Headers (# H1 to ###### H6)
      const headerMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (headerMatch) {
        closeList();
        const level = headerMatch[1].length;
        const text = headerMatch[2];
        const headingId = text
          .toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .trim()
          .replace(/\s+/g, '-');
        processedLines.push(`<h${level} id="${headingId}">${parseInlines(text)}</h${level}>`);
        continue;
      }

      // Blockquotes
      if (trimmed.startsWith('>')) {
        closeList();
        const quoteContent = trimmed.replace(/^>\s?/, '');
        processedLines.push(`<blockquote><p>${parseInlines(quoteContent)}</p></blockquote>`);
        continue;
      }

      // Task List items (- [ ] or - [x])
      const taskMatch = trimmed.match(/^[-*+]\s+\[([ xX])\]\s+(.+)$/);
      if (taskMatch) {
        if (!inList || listType !== 'ul') {
          closeList();
          processedLines.push('<ul class="task-list">');
          inList = true;
          listType = 'ul';
        }
        const isChecked = taskMatch[1].toLowerCase() === 'x';
        processedLines.push(
          `<li class="task-list-item"><input type="checkbox" disabled ${isChecked ? 'checked' : ''}> <span>${parseInlines(taskMatch[2])}</span></li>`
        );
        continue;
      }

      // Unordered Lists (- , * , +)
      const ulMatch = trimmed.match(/^[-*+]\s+(.+)$/);
      if (ulMatch) {
        if (!inList || listType !== 'ul') {
          closeList();
          processedLines.push('<ul>');
          inList = true;
          listType = 'ul';
        }
        processedLines.push(`<li>${parseInlines(ulMatch[1])}</li>`);
        continue;
      }

      // Ordered Lists (1. 2.)
      const olMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
      if (olMatch) {
        if (!inList || listType !== 'ol') {
          closeList();
          processedLines.push('<ol>');
          inList = true;
          listType = 'ol';
        }
        processedLines.push(`<li>${parseInlines(olMatch[2])}</li>`);
        continue;
      }

      // Blank line
      if (trimmed === '') {
        closeList();
        continue;
      }

      // Regular paragraph line
      closeList();
      processedLines.push(`<p>${parseInlines(rawLine)}</p>`);
    }

    closeList();
    if (inTable) renderTable();

    let outputHtml = processedLines.join('\n');

    // 4. Restore Fenced Code Blocks with modern syntax wrapper and copy button
    outputHtml = outputHtml.replace(/<!--CODEBLOCK_(\d+)-->/g, (match, idx) => {
      const block = codeBlocks[Number(idx)];
      if (!block) return '';
      return `
        <div class="code-block-wrapper">
          <div class="code-block-header">
            <span class="code-lang-tag">${block.lang}</span>
            <button class="btn-copy-snippet" type="button" data-snippet-idx="${idx}">Copy</button>
          </div>
          <pre><code class="language-${block.lang}">${block.code}</code></pre>
        </div>
      `;
    });

    // 5. Restore Inline Code
    outputHtml = outputHtml.replace(/<!--INLINECODE_(\d+)-->/g, (match, idx) => {
      const code = inlineCodes[Number(idx)];
      return `<code>${code}</code>`;
    });

    return outputHtml;
  }

  // Helper: Inline parser for bold, italic, strikethrough, links, images
  function parseInlines(text) {
    let out = text;

    // Images: ![alt](url "title")
    out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (match, alt, url, title) => {
      const safeUrl = sanitizeUrl(url);
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      return `<img src="${safeUrl}" alt="${escapeHtml(alt)}"${titleAttr} loading="lazy">`;
    });

    // Links: [text](url "title")
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (match, linkText, url, title) => {
      const safeUrl = sanitizeUrl(url);
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer"${titleAttr}>${parseInlines(linkText)}</a>`;
    });

    // Bold + Italic: ***text*** or ___text___
    out = out.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    out = out.replace(/___([^_]+)___/g, '<strong><em>$1</em></strong>');

    // Bold: **text** or __text__
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');

    // Italic: *text* or _text_
    out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    out = out.replace(/_([^_]+)_/g, '<em>$1</em>');

    // Strikethrough: ~~text~~
    out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    // Autolink bare URLs
    out = out.replace(/(^|[^"'])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');

    return out;
  }

  function sanitizeUrl(url) {
    const trimmed = url.trim();
    if (/^(https?:|mailto:|#|\/|\.\/)/i.test(trimmed)) {
      return escapeHtml(trimmed);
    }
    return '#';
  }

  // --- Document Analytics & Metrics ---
  function updateMetrics(text) {
    const chars = text.length;
    const words = text.trim() ? (text.trim().match(/\S+/g) || []).length : 0;
    const headings = (text.match(/^#{1,6}\s+/gm) || []).length;

    // Reading time calculation (~200 words per minute)
    const minutes = Math.floor(words / 200);
    const seconds = Math.floor(((words % 200) / 200) * 60);
    let readTimeStr = '0m 0s';
    if (words > 0) {
      if (minutes === 0) {
        readTimeStr = `${seconds}s`;
      } else {
        readTimeStr = `${minutes}m ${seconds}s`;
      }
    }

    statWords.textContent = words.toLocaleString();
    statChars.textContent = chars.toLocaleString();
    statHeadings.textContent = headings.toLocaleString();
    statReadtime.textContent = readTimeStr;
  }

  // --- Cursor Line & Column Tracker ---
  function updateCursorPosition() {
    const pos = markdownInput.selectionStart;
    const val = markdownInput.value.substring(0, pos);
    const lines = val.split('\n');
    const lineNum = lines.length;
    const colNum = lines[lines.length - 1].length + 1;
    editorLineCol.textContent = `Line ${lineNum}, Col ${colNum}`;
  }

  // --- Main Render Pipeline ---
  function updatePreview() {
    const rawMarkdown = markdownInput.value;
    const renderedHtml = parseMarkdown(rawMarkdown);
    previewOutput.innerHTML = renderedHtml;

    updateMetrics(rawMarkdown);
    attachCodeSnippetCopyHandlers();
    scheduleAutosave();
  }

  function attachCodeSnippetCopyHandlers() {
    const copyBtns = previewOutput.querySelectorAll('.btn-copy-snippet');
    copyBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const pre = btn.closest('.code-block-wrapper').querySelector('pre code');
        if (pre) {
          copyToClipboard(pre.textContent, 'Snippet copied to clipboard!');
          btn.textContent = 'Copied!';
          setTimeout(() => {
            btn.textContent = 'Copy';
          }, 1800);
        }
      });
    });
  }

  // --- Formatting Toolbar Engine ---
  function applyFormatting(fmtType) {
    const textarea = markdownInput;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selection = text.substring(start, end);

    let replacement = '';
    let cursorOffset = 0;

    switch (fmtType) {
      case 'bold':
        replacement = selection ? `**${selection}**` : '**bold text**';
        cursorOffset = selection ? replacement.length : 2;
        break;

      case 'italic':
        replacement = selection ? `*${selection}*` : '*italicized text*';
        cursorOffset = selection ? replacement.length : 1;
        break;

      case 'strike':
        replacement = selection ? `~~${selection}~~` : '~~strikethrough~~';
        cursorOffset = selection ? replacement.length : 2;
        break;

      case 'h1':
        replacement = `\n# ${selection || 'Heading 1'}\n`;
        cursorOffset = replacement.length;
        break;

      case 'h2':
        replacement = `\n## ${selection || 'Heading 2'}\n`;
        cursorOffset = replacement.length;
        break;

      case 'h3':
        replacement = `\n### ${selection || 'Heading 3'}\n`;
        cursorOffset = replacement.length;
        break;

      case 'quote':
        replacement = `\n> ${selection || 'Blockquote quote goes here'}\n`;
        cursorOffset = replacement.length;
        break;

      case 'code':
        replacement = selection ? `\`${selection}\`` : '`inlineCode()`';
        cursorOffset = selection ? replacement.length : 1;
        break;

      case 'codeblock':
        replacement = `\n\`\`\`javascript\n${selection || '// Write code here'}\n\`\`\`\n`;
        cursorOffset = replacement.length - 5;
        break;

      case 'link':
        replacement = `[${selection || 'link title'}](https://example.com)`;
        cursorOffset = replacement.length - 1;
        break;

      case 'image':
        replacement = `![${selection || 'Alt text description'}](https://picsum.photos/600/300)`;
        cursorOffset = replacement.length - 1;
        break;

      case 'ul':
        replacement = selection
          ? selection.split('\n').map(l => `- ${l}`).join('\n')
          : '\n- List item 1\n- List item 2\n- List item 3\n';
        cursorOffset = replacement.length;
        break;

      case 'ol':
        replacement = selection
          ? selection.split('\n').map((l, i) => `${i + 1}. ${l}`).join('\n')
          : '\n1. First step\n2. Second step\n3. Third step\n';
        cursorOffset = replacement.length;
        break;

      case 'task':
        replacement = selection
          ? selection.split('\n').map(l => `- [ ] ${l}`).join('\n')
          : '\n- [ ] Pending task item\n- [x] Completed task item\n';
        cursorOffset = replacement.length;
        break;

      case 'table':
        replacement = `\n| Column 1 | Column 2 | Column 3 |\n| :--- | :---: | ---: |\n| Row 1 Data | Row 1 Center | $120.00 |\n| Row 2 Data | Row 2 Center | $340.50 |\n`;
        cursorOffset = replacement.length;
        break;

      case 'hr':
        replacement = '\n\n---\n\n';
        cursorOffset = replacement.length;
        break;

      default:
        return;
    }

    textarea.focus();
    textarea.setRangeText(replacement, start, end, 'end');
    updatePreview();
    updateCursorPosition();
  }

  // --- Keyboard Handling (Tab & Shortcuts) ---
  markdownInput.addEventListener('keydown', (e) => {
    // Tab key indentation
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = markdownInput.selectionStart;
      const end = markdownInput.selectionEnd;

      if (!e.shiftKey) {
        // Indent 2 spaces
        markdownInput.setRangeText('  ', start, end, 'end');
      } else {
        // Shift+Tab: Unindent current line
        const val = markdownInput.value;
        const lineStart = val.lastIndexOf('\n', start - 1) + 1;
        if (val.substring(lineStart, lineStart + 2) === '  ') {
          markdownInput.setSelectionRange(lineStart, lineStart + 2);
          markdownInput.setRangeText('', lineStart, lineStart + 2, 'start');
        }
      }
      updatePreview();
      updateCursorPosition();
      return;
    }

    // Ctrl+B / Cmd+B for Bold
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      applyFormatting('bold');
      return;
    }

    // Ctrl+I / Cmd+I for Italic
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      applyFormatting('italic');
      return;
    }
  });

  // --- Synchronized Scrolling ---
  function setupScrollSync() {
    markdownInput.addEventListener('scroll', () => {
      if (isSyncScrolling) return;
      isSyncScrolling = true;

      const textareaScrollRatio =
        markdownInput.scrollTop / (markdownInput.scrollHeight - markdownInput.clientHeight || 1);
      previewScrollContainer.scrollTop =
        textareaScrollRatio * (previewScrollContainer.scrollHeight - previewScrollContainer.clientHeight);

      setTimeout(() => {
        isSyncScrolling = false;
      }, 50);
    });

    previewScrollContainer.addEventListener('scroll', () => {
      if (isSyncScrolling) return;
      isSyncScrolling = true;

      const previewScrollRatio =
        previewScrollContainer.scrollTop / (previewScrollContainer.scrollHeight - previewScrollContainer.clientHeight || 1);
      markdownInput.scrollTop =
        previewScrollRatio * (markdownInput.scrollHeight - markdownInput.clientHeight);

      setTimeout(() => {
        isSyncScrolling = false;
      }, 50);
    });
  }

  // --- View Mode Controls ---
  function setViewMode(mode) {
    splitWorkspace.classList.remove('view-split', 'view-editor', 'view-preview');
    splitWorkspace.classList.add(`view-${mode}`);

    viewPills.forEach(pill => {
      if (pill.dataset.view === mode) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });

    try {
      localStorage.setItem(STORAGE_KEY_VIEW, mode);
    } catch (e) {
      // Ignore quota error
    }
  }

  // --- Autosave System ---
  function scheduleAutosave() {
    autosaveStatus.style.opacity = '0.5';
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY_CONTENT, markdownInput.value);
        autosaveStatus.style.opacity = '1';
      } catch (e) {
        console.warn('Could not autosave draft to localStorage:', e);
      }
    }, 400);
  }

  // --- Toast Notification ---
  function showToast(msg) {
    toastMessage.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2400);
  }

  function copyToClipboard(text, successMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast(successMsg);
      }).catch(() => {
        fallbackCopy(text, successMsg);
      });
    } else {
      fallbackCopy(text, successMsg);
    }
  }

  function fallbackCopy(text, successMsg) {
    const temp = document.createElement('textarea');
    temp.value = text;
    temp.style.position = 'fixed';
    temp.style.left = '-9999px';
    document.body.appendChild(temp);
    temp.select();
    try {
      document.execCommand('copy');
      showToast(successMsg);
    } catch (err) {
      showToast('Copy failed. Please copy manually.');
    }
    document.body.removeChild(temp);
  }

  // --- Export Handlers ---
  function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Downloaded ${filename}!`);
  }

  function generateFullHtmlDocument() {
    const bodyContent = previewOutput.innerHTML;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Exported Markdown Document — Gamility</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      max-width: 860px;
      margin: 40px auto;
      padding: 0 20px;
      line-height: 1.65;
      color: #1e293b;
      background: #f8fafc;
    }
    h1, h2, h3, h4 { color: #0f172a; margin-top: 1.5em; margin-bottom: 0.5em; }
    h1 { border-bottom: 2px solid #e2e8f0; padding-bottom: 0.3em; }
    h2 { border-bottom: 1px solid #e2e8f0; padding-bottom: 0.2em; }
    a { color: #0284c7; text-decoration: underline; }
    blockquote { border-left: 4px solid #0284c7; margin: 1em 0; padding: 0.5em 1em; background: #f0f9ff; color: #334155; }
    table { width: 100%; border-collapse: collapse; margin: 1.5em 0; }
    th, td { border: 1px solid #cbd5e1; padding: 10px 14px; text-align: left; }
    th { background: #f1f5f9; font-weight: 700; }
    tr:nth-child(even) { background: #f8fafc; }
    code { font-family: monospace; background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    pre { background: #0f172a; color: #f8fafc; padding: 16px; border-radius: 8px; overflow-x: auto; }
    pre code { background: transparent; padding: 0; color: #f8fafc; }
    hr { border: none; height: 1px; background: #cbd5e1; margin: 2em 0; }
    ul, ol { margin: 1em 0 1em 1.5em; }
    .task-list { list-style: none; padding-left: 0; }
    .task-list-item input { margin-right: 8px; }
  </style>
</head>
<body>
${bodyContent}
</body>
</html>`;
  }

  // --- Event Listeners Setup ---
  function initEvents() {
    // Input changes
    markdownInput.addEventListener('input', () => {
      updatePreview();
      updateCursorPosition();
    });

    // Cursor tracking on click and arrow keys
    markdownInput.addEventListener('click', updateCursorPosition);
    markdownInput.addEventListener('keyup', updateCursorPosition);

    // Toolbar format buttons
    fmtButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const fmtType = btn.dataset.fmt;
        if (fmtType) applyFormatting(fmtType);
      });
    });

    // View mode pills
    viewPills.forEach(pill => {
      pill.addEventListener('click', () => {
        const mode = pill.dataset.view;
        if (mode) setViewMode(mode);
      });
    });

    // Sample Document Button
    btnSampleDoc.addEventListener('click', () => {
      markdownInput.value = SAMPLE_MARKDOWN;
      updatePreview();
      updateCursorPosition();
      showToast('Loaded sample Markdown document!');
    });

    // Copy MD
    btnCopyMd.addEventListener('click', () => {
      copyToClipboard(markdownInput.value, 'Markdown copied to clipboard!');
    });

    // Copy HTML
    btnCopyHtml.addEventListener('click', () => {
      copyToClipboard(previewOutput.innerHTML, 'Rendered HTML copied to clipboard!');
    });

    // Download MD
    btnDownloadMd.addEventListener('click', () => {
      downloadFile('document.md', markdownInput.value, 'text/markdown;charset=utf-8');
    });

    // Download HTML
    btnDownloadHtml.addEventListener('click', () => {
      downloadFile('document.html', generateFullHtmlDocument(), 'text/html;charset=utf-8');
    });

    // Clear Workspace
    btnClear.addEventListener('click', () => {
      if (!markdownInput.value.trim() || confirm('Clear the current Markdown document?')) {
        markdownInput.value = '';
        updatePreview();
        updateCursorPosition();
        showToast('Document cleared.');
      }
    });

    // Initialize Scroll Sync
    setupScrollSync();
  }

  // --- Application Bootstrap ---
  function initApp() {
    initEvents();

    // Restore saved view mode
    try {
      const savedView = localStorage.getItem(STORAGE_KEY_VIEW);
      if (savedView && ['split', 'editor', 'preview'].includes(savedView)) {
        setViewMode(savedView);
      }
    } catch (e) {
      // Fallback default
    }

    // Restore saved content or load sample
    try {
      const savedContent = localStorage.getItem(STORAGE_KEY_CONTENT);
      if (savedContent !== null && savedContent.length > 0) {
        markdownInput.value = savedContent;
      } else {
        markdownInput.value = SAMPLE_MARKDOWN;
      }
    } catch (e) {
      markdownInput.value = SAMPLE_MARKDOWN;
    }

    updatePreview();
    updateCursorPosition();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
