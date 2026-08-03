import { StandardFonts } from 'pdf-lib';

// Cache loaded font bytes by URL to avoid repeated network requests.
const fontCache = new Map();

const getFontUrl = () => {
  if (typeof document === 'undefined') return null;
  const baseUrl = document.baseURI || window.location.href;
  return new URL('@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff2', baseUrl).href;
};

export async function loadPdfFonts(pdfDoc, configuredFontUrl = '') {
  const fontUrl = configuredFontUrl || getFontUrl();
  if (!fontUrl) {
    return {
      regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
      bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
      italic: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
      boldItalic: await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique),
    };
  }

  try {
    let bytes = fontCache.get(fontUrl);
    if (!bytes) {
      const response = await fetch(fontUrl);
      if (!response.ok) throw new Error(`中文字体加载失败: ${response.status}`);
      bytes = await response.arrayBuffer();
      fontCache.set(fontUrl, bytes);
    }
    const regular = await pdfDoc.embedFont(bytes);
    return { regular, bold: regular, italic: regular, boldItalic: regular };
  } catch (error) {
    throw new Error('无法加载中文字体，请检查 @fontsource/noto-sans-sc 资源是否已打包');
  }
}
