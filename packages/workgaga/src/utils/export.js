/**
 * Copyright (C) 2021 Tencent.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import html2canvas from 'html2canvas';
import { PDFDocument, PDFName, PDFString, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { loadPdfFonts } from './pdfFont';

/**
 * 将预览区域的内容放在body上准备后续导出操作
 * @param {HTMLElement} previewDom 预览区域的dom
 * @param {function} cb 准备好导出后开始执行导出操作
 */
const getReadyToExport = (previewDom, cb) => {
  const cherryPreviewer = /** @type {HTMLElement}*/ (previewDom.cloneNode(true));
  // 当预览区被隐藏时，cherryPreviewer会有cherry-previewer--hidden类，此行用于恢复预览区
  cherryPreviewer.className = cherryPreviewer.className.replace('cherry-previewer--hidden', '');

  cherryPreviewer.style.width = '100%';
  cherryPreviewer.style.height = 'auto';
  cherryPreviewer.style.maxHeight = 'none';

  const mmls = cherryPreviewer.querySelectorAll('mjx-assistive-mml');
  // a fix for html2canvas
  mmls.forEach((e) => {
    if (e instanceof HTMLElement) e.style.setProperty('visibility', 'hidden');
  });

  const cherryWrapper = document.createElement('div');
  cherryWrapper.className = 'cherry-export-wrapper';

  // 复制主题相关的类名，确保CSS变量能够正确应用
  const cherryInstance = previewDom.closest('.cherry');
  if (cherryInstance) {
    cherryWrapper.className = `${cherryWrapper.className} ${cherryInstance.className}`;
  }

  cherryWrapper.appendChild(cherryPreviewer);
  document.body.appendChild(cherryWrapper);

  const bodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'visible';
  cb(cherryPreviewer, () => {
    cherryWrapper.remove();
    document.body.style.overflow = bodyOverflow;
  });
};

function inlinePrintStyles(container) {
  const styleProperties = [
    'background-color',
    'border',
    'border-collapse',
    'border-color',
    'border-spacing',
    'border-style',
    'border-width',
    'color',
    'display',
    'font-family',
    'font-size',
    'font-style',
    'font-weight',
    'line-height',
    'list-style-position',
    'list-style-type',
    'margin',
    'padding',
    'page-break-inside',
    'text-align',
    'text-decoration',
    'vertical-align',
    'white-space',
    'width',
    'word-break',
  ];
  container.querySelectorAll('*').forEach((element) => {
    if (!(element instanceof HTMLElement)) {
      return;
    }
    const computedStyle = window.getComputedStyle(element);
    styleProperties.forEach((property) => {
      element.style.setProperty(property, computedStyle.getPropertyValue(property));
    });
  });
}

/**
 * 下载文件
 * @param {String} downloadUrl 图片本地地址
 * @param {String} fileName 导出图片文件名（包含后缀）
 */
const fileDownload = (downloadUrl, fileName) => {
  const aLink = document.createElement('a');
  aLink.style.display = 'none';
  aLink.href = downloadUrl;
  aLink.download = fileName;
  document.body.appendChild(aLink);
  aLink.click();
  document.body.removeChild(aLink);
};

/**
 * 将预览 DOM 导出为 A4 原生文本 PDF。
 * @param {HTMLElement} previewDom 预览区域的 dom
 * @param {String} fileName 导出 PDF 文件名
 * @returns {Promise<Uint8Array>}
 */
export async function exportPDF(previewDom, fileName = '', options = {}) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 42;
  const scale = 72 / 96;
  const { regular: pdfFont, bold: pdfBold, italic: pdfItalic, boldItalic: pdfBoldItalic } = await loadPdfFonts(pdfDoc, options.fontUrl);
  const form = pdfDoc.getForm();
  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let cursorY = pageHeight - margin;

  const color = (value, fallback = '#000000') => {
    const match = (value || fallback).match(/#([0-9a-f]{3,8})/i);
    if (!match) return rgb(0, 0, 0);
    const hex = match[1].length === 3 ? match[1].split('').map((v) => v + v).join('') : match[1];
    return rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);
  };
  const styleOf = (element) => window.getComputedStyle(element);
  const nextPage = () => {
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    cursorY = pageHeight - margin;
  };
  const ensureSpace = (height) => {
    if (cursorY - height < margin) nextPage();
  };
  const selectFont = (style) => {
    const bold = Number.parseInt(style.fontWeight, 10) >= 600 || style.fontWeight === 'bold';
    const italic = style.fontStyle === 'italic' || style.fontStyle === 'oblique';
    return bold && italic ? pdfBoldItalic : bold ? pdfBold : italic ? pdfItalic : pdfFont;
  };
  const drawBackground = (element, x, y, width, height, style) => {
    if (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent') {
      page.drawRectangle({ x, y: y - height, width, height, color: color(style.backgroundColor) });
    }
  };
  const drawText = (value, style, indent = 0, link = null) => {
    const text = value.replace(/[\t ]+/g, ' ').replace(/\n+/g, '\n').trim();
    if (!text) return;
    const size = Math.max(5, Number.parseFloat(style.fontSize || '16') * scale);
    const lineHeightValue = Number.parseFloat(style.lineHeight);
    const lineHeight = Math.max(size * 1.25, (Number.isFinite(lineHeightValue) ? lineHeightValue * scale : size * 1.25));
    const font = selectFont(style);
    const maxWidth = pageWidth - margin * 2 - indent;
    const words = Array.from(text);
    let line = '';
    const lines = [];
    words.forEach((word) => {
      if (word === '\n') {
        if (line) lines.push(line);
        line = '';
        return;
      }
      const candidate = line + word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = candidate;
    });
    if (line) lines.push(line);
    lines.forEach((lineText) => {
      ensureSpace(lineHeight);
      const x = margin + indent;
      const baseline = cursorY - size;
      page.drawText(lineText, { x, y: baseline, size, font, color: color(style.color) });
      if (style.textDecorationLine === 'underline') page.drawLine({ start: { x, y: baseline - 1 }, end: { x: x + font.widthOfTextAtSize(lineText, size), y: baseline - 1 }, thickness: 0.5, color: color(style.color) });
      if (link) {
        const linkRef = page.doc.context.register(page.doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [x, baseline - 2, x + font.widthOfTextAtSize(lineText, size), baseline + size + 2], Border: [0, 0, 0], A: { Type: 'Action', S: 'URI', URI: PDFString.of(link) } }));
        page.node.set(PDFName.of('Annots'), page.doc.context.obj([linkRef]));
      }
      cursorY -= lineHeight;
    });
  };
  const loadImage = async (src) => {
    try {
      const response = await fetch(src);
      if (!response.ok) return null;
      const bytes = await response.arrayBuffer();
      return src.match(/\\.jpe?g($|\\?)/i) ? pdfDoc.embedJpg(bytes) : pdfDoc.embedPng(bytes);
    } catch (error) {
      return null;
    }
  };
  const drawNode = async (node, indent = 0, inheritedStyle = null) => {
    if (node.nodeType === Node.TEXT_NODE) {
      drawText(node.textContent || '', inheritedStyle || window.getComputedStyle(previewDom), indent);
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const tag = node.tagName.toLowerCase();
    const style = styleOf(node);
    if (['script', 'style', 'noscript'].includes(tag)) return;
    if (['input', 'textarea', 'select'].includes(tag)) {
      /** @type {any} */
      const control = node;
      const fieldName = control.name || control.id || `field-${Math.random().toString(36).slice(2)}`;
      /** @type {any} */
      const field = tag === 'textarea' ? form.createTextField(fieldName) : tag === 'select' ? form.createDropdown(fieldName) : form.createTextField(fieldName);
      if (tag === 'select') Array.from(control.options).forEach((option) => field.addOption(option.text));
      if (control.value) {
        if (tag === 'select') field.select(control.value);
        else field.setText(control.value);
      }
      const fieldWidth = Math.min(280, pageWidth - margin * 2 - indent);
      const fieldHeight = tag === 'textarea' ? Math.min(72, Math.max(36, Number.parseFloat(style.height) * scale || 36)) : 18;
      ensureSpace(fieldHeight + 8);
      field.addToPage(page, { x: margin + indent, y: cursorY - fieldHeight, width: fieldWidth, height: fieldHeight, borderWidth: 1, textColor: color(style.color), backgroundColor: color(style.backgroundColor || '#ffffff') });
      cursorY -= fieldHeight + 8;
      return;
    }
    if (tag === 'a') {
      const linkNode = /** @type {HTMLAnchorElement} */ (node);
      drawText(linkNode.textContent || linkNode.href, style, indent, linkNode.href || null);
      return;
    }
    if (tag === 'br') {
      ensureSpace(16);
      cursorY -= 16;
      return;
    }
    if (tag === 'hr') { ensureSpace(10); page.drawLine({ start: { x: margin + indent, y: cursorY - 4 }, end: { x: pageWidth - margin, y: cursorY - 4 }, thickness: 0.7, color: color(style.borderTopColor || style.color) }); cursorY -= 12; return; }
    if (tag === 'img') {
      /** @type {HTMLImageElement} */
      const imageNode = /** @type {HTMLImageElement} */ (node);
      const image = await loadImage(imageNode.currentSrc || imageNode.src);
      if (!image) return;
      const width = Math.min((Number.parseFloat(node.getAttribute('width') || style.width) || image.width) * scale, pageWidth - margin * 2 - indent);
      const height = width * image.height / image.width;
      ensureSpace(height + 8);
      page.drawImage(image, { x: margin + indent, y: cursorY - height, width, height });
      cursorY -= height + 8;
      return;
    }
    if (tag === 'table') {
      const rows = Array.from(node.querySelectorAll(':scope > tbody > tr, :scope > tr'));
      const cells = rows.map((row) => Array.from(row.children));
      const columns = Math.max(1, ...cells.map((row) => row.length));
      const width = pageWidth - margin * 2 - indent;
      const cellWidth = width / columns;
      for (const row of cells) {
        const values = row.map((cell) => cell.textContent?.trim() || '');
        const rowHeight = 22;
        ensureSpace(rowHeight);
        const rowTop = cursorY;
        let rowBottom = rowTop - rowHeight;
        values.forEach((value, index) => {
          const x = margin + indent + index * cellWidth;
          page.drawRectangle({ x, y: rowTop - rowHeight, width: cellWidth, height: rowHeight, borderColor: color(style.borderColor || '#888888'), borderWidth: 0.5, color: color(style.backgroundColor || '#ffffff') });
          const cellCursor = cursorY;
          cursorY = rowTop - 4;
          drawText(value, style, indent + index * cellWidth + 4);
          rowBottom = Math.min(rowBottom, cursorY);
          cursorY = cellCursor;
        });
        cursorY = Math.min(rowBottom, rowTop - rowHeight) - 4;
      }
      cursorY -= 6;
      return;
    }
    const isBlock = /^(h[1-6]|p|div|section|article|blockquote|pre|ul|ol|li|table|figure)$/.test(tag);
    if (isBlock) {
      const marginTop = Number.parseFloat(style.marginTop) * scale || 0;
      cursorY -= marginTop;
      if (tag.match(/^h[1-6]$/)) {
        drawText(node.textContent || '', style, indent);
      } else if (tag === 'li') {
        const list = node.parentElement?.tagName.toLowerCase();
        const index = Array.from(node.parentElement?.children || []).indexOf(node) + 1;
        drawText(`${list === 'ol' ? `${index}.` : '•'} ${node.textContent || ''}`, style, indent);
      } else if (tag === 'pre' || tag === 'code') {
        drawBackground(node, margin + indent, cursorY, pageWidth - margin * 2 - indent, 24, style);
        drawText(node.textContent || '', style, indent + 6);
      } else if (tag === 'blockquote') {
        page.drawLine({ start: { x: margin + indent, y: cursorY }, end: { x: margin + indent, y: cursorY - 24 }, thickness: 2, color: color(style.borderLeftColor || '#999999') });
        await Promise.all(Array.from(node.childNodes).map((child) => drawNode(child, indent + 12, style)));
      } else {
        for (const child of node.childNodes) await drawNode(child, indent + (tag === 'ul' || tag === 'ol' ? 12 : 0), style);
      }
      cursorY -= Number.parseFloat(style.marginBottom) * scale || 6;
    } else {
      for (const child of node.childNodes) await drawNode(child, indent, style);
    }
  };

  for (const child of previewDom.childNodes) await drawNode(child);
  const bytes = await pdfDoc.save();
  if (fileName) {
    const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    fileDownload(url, `${fileName}.pdf`);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return bytes;
}

/**
 * 利用canvas将html内容导出成图片
 * @param {HTMLElement} previewDom 预览区域的dom
 * @param {String} fileName 导出图片文件名
 */
export function exportScreenShot(previewDom, fileName) {
  getReadyToExport(previewDom, (/** @type {HTMLElement}*/ cherryPreviewer, /** @type {function}*/ thenFinish) => {
    window.scrollTo(0, 0);
    // 去掉audio和video标签
    cherryPreviewer.innerHTML = cherryPreviewer.innerHTML.replace(/<audio [^>]+?>([^\n]*?)<\/audio>/g, '$1');
    cherryPreviewer.innerHTML = cherryPreviewer.innerHTML.replace(/<video [^>]+?>([^\n]*?)<\/video>/g, '$1');
    // 强制展开所有代码块
    cherryPreviewer.innerHTML = cherryPreviewer.innerHTML.replace(
      /class="cherry-code-unExpand("| )/g,
      'class="cherry-code-expand$1',
    );
    html2canvas(cherryPreviewer, {
      allowTaint: true,
      height: cherryPreviewer.clientHeight,
      width: cherryPreviewer.clientWidth,
      scrollY: 0,
      scrollX: 0,
      logging: false,
      ignoreElements: (element) => {
        if (cherryPreviewer === element || cherryPreviewer.contains(element) || element.contains(cherryPreviewer)) {
          return false;
        }
        const tagName = element.tagName?.toUpperCase();
        if (tagName === 'HEAD' || tagName === 'STYLE' || tagName === 'LINK' || tagName === 'META') {
          return false;
        }
        if (element.querySelector && element.querySelector('style, link')) {
          return false;
        }
        return true;
      },
    }).then((canvas) => {
      const imgData = canvas.toDataURL('image/png');
      fileDownload(imgData, `${fileName}.png`);
      thenFinish();
    });
  });
}

/**
 * 利用canvas将dom节点导出成图片
 * @param {HTMLElement} dom 目标dom节点
 * @param {String} fileName 导出图片文件名
 * @param {Object} options 导出选项
 */
export function canvas2img(dom, fileName, options = {}) {
  // 如果是png格式，则使用透明背景。反之获取dom所属的.cherry-previewer的背景色
  const previewer = dom.closest('.cherry-previewer');
  const { format = 'png' } = options;
  const bg = format === 'png' ? 'transparent' : getComputedStyle(previewer).backgroundColor;
  const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
  html2canvas(dom, {
    allowTaint: true,
    backgroundColor: bg,
    height: dom.clientHeight + 10,
    width: dom.clientWidth + 10,
    x: -5,
    y: -5,
    logging: false,
    ignoreElements: (element) => {
      // 保留目标节点及其子节点
      if (dom === element || dom.contains(element)) {
        return false;
      }
      // 保留目标节点的祖先节点（用于继承样式）
      if (element.contains(dom)) {
        return false;
      }
      const tagName = element.tagName?.toUpperCase();
      // 保留 head 及其内部的样式表
      if (tagName === 'HEAD' || tagName === 'STYLE' || tagName === 'LINK' || tagName === 'META') {
        return false;
      }
      // 如果该节点内部包含 style 或 link 标签，也需要保留，以防丢失样式
      if (element.querySelector && element.querySelector('style, link')) {
        return false;
      }
      // 忽略其他所有节点，极大提升性能
      return true;
    },
  }).then((canvas) => {
    const imgData = canvas.toDataURL(mimeType);
    fileDownload(imgData, `${fileName}.${format}`);
  });
}

/**
 * 导出 markdown 文件
 * @param {String} markdownText markdown文本
 * @param {String} fileName 导出markdown文件名
 */
export function exportMarkdownFile(markdownText, fileName) {
  const blob = new Blob([markdownText], { type: 'text/markdown;charset=utf-8' });
  const aLink = document.createElement('a');
  aLink.style.display = 'none';
  aLink.href = URL.createObjectURL(blob);
  aLink.download = `${fileName}.md`;
  document.body.appendChild(aLink);
  aLink.click();
  document.body.removeChild(aLink);
}

/**
 * 导出预览区 HTML 文件
 * @param {String} HTMLText HTML文本
 * @param {String} fileName 导出HTML文件名
 */
export function exportHTMLFile(HTMLText, fileName) {
  const blob = new Blob([HTMLText], { type: 'text/markdown;charset=utf-8' });
  const aLink = document.createElement('a');
  aLink.style.display = 'none';
  aLink.href = URL.createObjectURL(blob);
  aLink.download = `${fileName}.html`;
  document.body.appendChild(aLink);
  aLink.click();
  document.body.removeChild(aLink);
}

// Word 导出功能
export { exportWordFile } from './exportWord';
