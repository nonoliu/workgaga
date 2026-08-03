export function handlePreviewerCopy(event, previewerContainer) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

  const range = selection.getRangeAt(0);
  const ancestor = range.commonAncestorContainer;
  if (!previewerContainer.contains(ancestor) && !ancestor.contains(previewerContainer)) return;

  const clone = document.createElement('div');
  clone.appendChild(range.cloneContents());
  applyInlineStylesAndFixes(clone);

  const html = clone.innerHTML;
  const text = getClipboardText(clone);
  if (!html && !text) return;

  event.preventDefault();
  event.clipboardData?.setData('text/html', html);
  event.clipboardData?.setData('text/plain', text);
}

function getClipboardText(container) {
  const clone = /** @type {HTMLElement} */ (container.cloneNode(true));
  clone.querySelectorAll('script, style, button').forEach((element) => element.remove());
  return serializeText(clone).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function serializeText(node, context = {}) {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
  if (!(node instanceof HTMLElement)) return '';

  const tag = node.tagName.toLowerCase();
  if (tag === 'br') return '\n';
  if (tag === 'img') return node.getAttribute('alt') || '';
  if (tag === 'hr') return '\n────────\n';

  const children = () => Array.from(node.childNodes).map((child) => serializeText(child, context)).join('');
  if (tag === 'pre') return `\n${node.textContent || ''}\n`;
  if (tag === 'blockquote') {
    return `\n${children().split('\n').map((line) => line ? `> ${line}` : '>').join('\n')}\n`;
  }
  if (tag === 'li') {
    const list = node.parentElement;
    const siblings = list ? Array.from(list.children).filter((child) => child.tagName === 'LI') : [];
    const index = Math.max(0, siblings.indexOf(node)) + 1;
    const depth = list ? getListDepth(list) : 1;
    const marker = list?.tagName === 'OL' ? `${index}. ` : '- ';
    const nestedLists = Array.from(node.children).filter((child) => ['UL', 'OL'].includes(child.tagName));
    const content = Array.from(node.childNodes)
      .filter((child) => !(child instanceof HTMLElement && ['UL', 'OL'].includes(child.tagName)))
      .map((child) => serializeText(child, context)).join('')
      .trim();
    const nested = nestedLists.map((child) => serializeText(child, context)).join('');
    return `\n${'  '.repeat(depth - 1)}${marker}${content}${nested}`;
  }
  if (tag === 'table') {
    return `\n${Array.from(node.querySelectorAll('tr')).map((row) => `| ${Array.from(row.children).map((cell) => serializeText(cell, context).trim()).join(' | ')} |`).join('\n')}\n`;
  }
  if (tag === 'a') return children() || node.getAttribute('href') || '';

  const block = ['address', 'article', 'dd', 'div', 'dl', 'dt', 'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'li', 'main', 'ol', 'p', 'section', 'table', 'ul'].includes(tag);
  const value = children();
  return block ? `\n${value}\n` : value;
}

function getListDepth(list) {
  let depth = 1;
  let parent = list.parentElement;
  while (parent) {
    if (parent.tagName === 'UL' || parent.tagName === 'OL') depth += 1;
    parent = parent.parentElement;
  }
  return depth;
}

function applyInlineStylesAndFixes(container) {
  // Fix WPS List Issue: Remove <p> tags directly inside <li>
  const listItems = container.querySelectorAll('li');
  listItems.forEach(li => {
    const paragraphs = li.querySelectorAll('p');
    paragraphs.forEach(p => {
      // Move all children of <p> before the <p>
      while (p.firstChild) {
        p.parentNode.insertBefore(p.firstChild, p);
      }
      p.parentNode.removeChild(p);
    });
  });

  const elements = container.querySelectorAll('*');
  
  elements.forEach(el => {
    const tag = el.tagName.toLowerCase();
    let cssText = '';

    switch (tag) {
      case 'h1':
        cssText = 'font-size: 2em; font-weight: bold; margin: 0.67em 0; padding-bottom: 0.3em; border-bottom: 1px solid #eaecef; line-height: 1.25;';
        break;
      case 'h2':
        cssText = 'font-size: 1.5em; font-weight: bold; margin: 0.83em 0; padding-bottom: 0.3em; border-bottom: 1px solid #eaecef; line-height: 1.25;';
        break;
      case 'h3':
        cssText = 'font-size: 1.25em; font-weight: bold; margin: 1em 0; line-height: 1.25;';
        break;
      case 'h4':
        cssText = 'font-size: 1em; font-weight: bold; margin: 1.33em 0; line-height: 1.25;';
        break;
      case 'h5':
        cssText = 'font-size: 0.87em; font-weight: bold; margin: 1.67em 0; line-height: 1.25;';
        break;
      case 'h6':
        cssText = 'font-size: 0.85em; font-weight: bold; margin: 2.33em 0; color: #6a737d; line-height: 1.25;';
        break;
      case 'p':
        cssText = 'margin-top: 0; margin-bottom: 16px; line-height: 1.6;';
        break;
      case 'a':
        cssText = 'color: #0366d6; text-decoration: none;';
        break;
      case 'strong':
      case 'b':
        cssText = 'font-weight: 600;';
        break;
      case 'em':
      case 'i':
        cssText = 'font-style: italic;';
        break;
      case 'del':
        cssText = 'text-decoration: line-through;';
        break;
      case 'ul':
      case 'ol':
        cssText = 'padding-left: 20px; margin-top: 0; margin-bottom: 16px;';
        break;
      case 'li':
        cssText = 'margin-bottom: 4px; line-height: 1.6;';
        break;
      case 'blockquote':
        cssText = 'margin: 0 0 16px 0; padding: 10px 15px; color: #6a737d; border-left: 4px solid #dfe2e5; background-color: #f9f9f9; display: block;';
        break;
      case 'pre':
        cssText = 'background-color: #f6f8fa; padding: 16px; overflow: auto; line-height: 1.45; border-radius: 3px; white-space: pre-wrap; word-wrap: break-word; font-family: Consolas, Monaco, "Courier New", monospace; margin-top: 0; margin-bottom: 16px;';
        break;
      case 'code':
        if (el.parentNode.tagName.toLowerCase() !== 'pre') {
          cssText = 'background-color: #f6f8fa; border-radius: 3px; font-size: 85%; margin: 0; padding: 0.2em 0.4em; font-family: Consolas, Monaco, "Courier New", monospace; color: #e96900;';
        } else {
          cssText = 'background-color: transparent; border: 0; display: inline; line-height: inherit; margin: 0; overflow: visible; padding: 0; white-space: pre-wrap; word-wrap: break-word; font-size: 85%; font-family: Consolas, Monaco, "Courier New", monospace; color: #333;';
        }
        break;
      case 'table':
        cssText = 'border-spacing: 0; border-collapse: collapse; margin-top: 0; margin-bottom: 16px; width: 100%; overflow: auto; border: 1px solid #dfe2e5;';
        el.setAttribute('border', '1');
        el.setAttribute('cellpadding', '0');
        el.setAttribute('cellspacing', '0');
        break;
      case 'tr':
        cssText = 'background-color: #fff; border-top: 1px solid #c6cbd1;';
        break;
      case 'th':
      case 'td':
        cssText = 'padding: 6px 13px; border: 1px solid #dfe2e5;';
        if (tag === 'th') {
          cssText += ' font-weight: 600; background-color: #f6f8fa;';
        }
        break;
      case 'img':
        cssText = 'max-width: 100%; box-sizing: content-box; background-color: #fff; border-style: none;';
        break;
      case 'hr':
        cssText = 'height: 0.25em; padding: 0; margin: 24px 0; background-color: #e1e4e8; border: 0; overflow: hidden;';
        break;
    }

    if (cssText) {
      el.style.cssText = cssText;
    }
    
    // Clean up Cherry-specific classes to prevent external CSS interference
    el.removeAttribute('class');
    // Clean up data attributes
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.startsWith('data-') && attr.name !== 'data-src') {
        el.removeAttribute(attr.name);
      }
    });
  });
}
