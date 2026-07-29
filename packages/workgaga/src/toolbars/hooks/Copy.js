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
// import juice from 'juice';
import MenuBase from '@/toolbars/MenuBase';
import { copyToClip } from '@/utils/copy';
/**
 * 复制按钮，用来复制预览区的html内容
 * 该操作会将预览区的css样式以行内样式的形式插入到html内容里，从而保证粘贴时样式一致
 */
export default class Copy extends MenuBase {
  constructor($cherry) {
    super($cherry);
    this.previewer = $cherry.previewer;
    this.isLoading = false;
    this.updateMarkdown = false;
    this.setName('copy', 'copy');
    this.lastIconOuterHtml = '';
  }

  async adaptWechat(rawHtml) {
    // 转化链接
    // Array.from(document.querySelectorAll('a')).forEach((item) => {
    //   item.removeAttribute('href');
    // });
    // 防止echarts标签被转成p时丢失样式
    const figureRegex = /(<figure data-lines=.+?<)div(.+?<\/)div(>.*?<\/figure>)/g;
    const html = rawHtml.replace(figureRegex, (match, prefix, content, suffix) => {
      return `${prefix}p${content}p${suffix}`;
    });
    // 图片转base64，防止无法自动上传
    const imgRegex = /(<img.+?src=")(.+?)(".*?>)/g;
    /** @type {(Promise<string>)[]} */
    const promises = [];
    html.replace(imgRegex, (match, prefix, src) => {
      promises.push(convertImgToBase64(src));
    });
    const urls = await Promise.all(promises);
    return html.replace(imgRegex, (match, prefix, src, suffix) => prefix + urls.shift() + suffix);
  }

  getStyleFromSheets(keyword) {
    const sheets = Array.from(document.styleSheets).filter(
      (item) => item.cssRules[0] && item.cssRules[0].cssText.indexOf(keyword) > -1,
    );
    return `<style>${sheets.reduce((html, sheet) => {
      return html + Array.from(sheet.cssRules).reduce((html, rule) => html + rule.cssText, '');
    }, '')}</style>`;
  }

  computeStyle() {
    // 计算需要append进富文本的style
    const mathStyle = this.getStyleFromSheets('mjx-container');
    const cherryStyle = this.getStyleFromSheets('cherry');
    const echartStyle =
      '<style>figure>p{overflow:hidden;position:relative;width:500px;height:300px;background:transparent;}</style>';
    return {
      mathStyle,
      echartStyle,
      cherryStyle,
    };
  }

  getPreviewHtml() {
    if (this.previewer.isPreviewerHidden()) {
      return this.previewer.options.previewerCache.html;
    }

    const previewerDom = this.previewer.getDomContainer();
    const clonedDom = /** @type {HTMLElement} */ (previewerDom.cloneNode(true));
    inlineComputedStyles(previewerDom, clonedDom);
    return clonedDom.innerHTML;
  }

  getPreviewText() {
    if (!this.previewer.isPreviewerHidden()) {
      return getRenderedText(this.previewer.getDomContainer());
    }

    const textContainer = document.createElement('div');
    textContainer.innerHTML = this.previewer.options.previewerCache.html;
    textContainer.style.position = 'absolute';
    textContainer.style.left = '-100000px';
    textContainer.style.width = '1px';
    document.body.appendChild(textContainer);
    const text = getRenderedText(textContainer);
    textContainer.remove();
    return text;
  }

  /**
   * 由于复制操作会随着预览区域的内容增加而耗时变长，所以需要增加“正在复制”的状态回显
   * 同时该状态也用于限频
   */
  toggleLoading() {
    // 切换loading状态
    if (this.isLoading) {
      this.dom.lastElementChild.outerHTML = this.lastIconOuterHtml;
      this.lastIconOuterHtml = '';
    } else {
      this.lastIconOuterHtml = this.dom.lastElementChild.outerHTML;
      this.dom.lastElementChild.outerHTML = '<div class="icon-loading loading"></div>';
    }
    this.isLoading = !this.isLoading;
  }

  /**
   * 显示复制成功状态
   */
  showSuccess() {
    if (!this.lastIconOuterHtml) {
      this.lastIconOuterHtml = this.dom.lastElementChild.outerHTML;
    }
    this.dom.lastElementChild.outerHTML = '<i class="ch-icon ch-icon-ok"></i>';
    setTimeout(() => {
      if (this.lastIconOuterHtml) {
        this.dom.lastElementChild.outerHTML = this.lastIconOuterHtml;
        this.lastIconOuterHtml = '';
      }
    }, 1500);
  }

  /**
   * 响应点击事件
   * 该按钮不会引发编辑区域的内容改动，所以不用处理用户在编辑区域的选中内容
   * @param {Event} e 点击事件
   */
  onClick(e) {
    this.toggleLoading();
    const inlineCodeTheme = document.querySelector('.cherry').getAttribute('data-inline-code-theme');
    const codeBlockTheme = document.querySelector('.cherry').getAttribute('data-code-block-theme');
    const { mathStyle, echartStyle, cherryStyle } = this.computeStyle();
    const html = this.getPreviewHtml();

    // 获取预览区渲染后的纯文本内容
    const plainText = this.getPreviewText();

    // 将css样式以行内样式的形式插入到html内容里
    this.adaptWechat(html).then((adaptedHtml) => {
      const htmlContent = `${mathStyle + echartStyle + cherryStyle}
        <div data-inline-code-theme="${inlineCodeTheme}" data-code-block-theme="${codeBlockTheme}">
          <div class="workgaga">${adaptedHtml}</div>
        </div>`;

      // 传递渲染后的纯文本作为 text/plain，HTML 作为富文本
      copyToClip(plainText, htmlContent);
      this.toggleLoading();
      this.showSuccess();
    });
  }
}

function getRenderedText(container) {
  return container.innerText || container.textContent || '';
}

function inlineComputedStyles(source, target) {
  if (!(source instanceof HTMLElement) || !(target instanceof HTMLElement)) {
    return;
  }

  const computedStyle = window.getComputedStyle(source);
  Array.from(computedStyle).forEach((property) => {
    target.style.setProperty(property, computedStyle.getPropertyValue(property), computedStyle.getPropertyPriority(property));
  });

  Array.from(source.children).forEach((child, index) => {
    inlineComputedStyles(child, target.children[index]);
  });
}

/**
 * 将图片转成base64，防止出现由于图片防盗链功能导致图裂的情况
 * @param {string} url 图片的地址
 * @param {Function} [callback] 回调函数，本函数不处理该参数
 * @param {string} [outputFormat]
 * @returns {Promise<string>} img node
 */
function convertImgToBase64(url, callback, outputFormat) {
  return new Promise((resolve) => {
    let canvas = /** @type {HTMLCanvasElement}*/ (document.createElement('CANVAS'));
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = function () {
      canvas.height = img.height;
      canvas.width = img.width;
      ctx.drawImage(img, 0, 0);
      const dataURL = canvas.toDataURL(outputFormat || 'image/png');
      resolve(dataURL);
      canvas = null;
    };
    img.src = url;
  });
}
