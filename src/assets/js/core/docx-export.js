/* Dependency-free editable DOCX export for the page currently open in the editor. */
(function () {
  'use strict';
  const encoder = new TextEncoder();
  const escapeXml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
  const EMU_PER_PX = 9525;
  const TWIPS_PER_PX = 15;
  function safeHex(value, fallback = '111111') {
    const raw = String(value ?? '').trim();
    if (/^#[\da-f]{6}$/i.test(raw))
      return raw.slice(1).toUpperCase();
    if (/^#[\da-f]{3}$/i.test(raw))
      return raw.slice(1).split('').map((part) => part + part).join('').toUpperCase();
    return fallback;
  }
  function xmlRunsFromText(value, style = {}) {
    const parts = String(value ?? '').split(/\r?\n/);
    const properties = [];
    const font = String(style.fontFamily || 'Times New Roman').replace(/["'<>]/g, '').split(',')[0].trim().slice(0, 64) || 'Times New Roman';
    const size = Math.round(clamp(style.fontSizePx ?? 16, 6, 96) * 1.5);
    // Word is strict about child order inside w:rPr: rFonts, b, i, color, sz, u.
    properties.push(`<w:rFonts w:ascii="${escapeXml(font)}" w:hAnsi="${escapeXml(font)}" w:eastAsia="${escapeXml(font)}"/>`);
    if (style.bold)
      properties.push('<w:b/><w:bCs/>');
    if (style.italic)
      properties.push('<w:i/><w:iCs/>');
    properties.push(`<w:color w:val="${safeHex(style.color)}"/>`);
    properties.push(`<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`);
    if (style.underline)
      properties.push('<w:u w:val="single"/>');
    const rPr = `<w:rPr>${properties.join('')}</w:rPr>`;
    const output = [];
    parts.forEach((part, index) => {
      if (index)
        output.push('<w:r><w:br/></w:r>');
      if (part.length)
        output.push(`<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(part)}</w:t></w:r>`);
    });
    return output.join('') || `<w:r>${rPr}<w:t xml:space="preserve"></w:t></w:r>`;
  }
  function styleFromNode(node, base) {
    const style = { ...base };
    const tag = node?.tagName?.toUpperCase();
    if (tag === 'B' || tag === 'STRONG')
      style.bold = true;
    if (tag === 'I' || tag === 'EM')
      style.italic = true;
    if (tag === 'U')
      style.underline = true;
    const css = node?.style;
    if (css) {
      if (css.fontFamily)
        style.fontFamily = css.fontFamily;
      if (css.color)
        style.color = css.color;
      if (css.fontSize) {
        const parsed = Number.parseFloat(css.fontSize);
        if (Number.isFinite(parsed))
          style.fontSizePx = css.fontSize.endsWith('pt') ? parsed * 4 / 3 : parsed;
      }
      if (css.fontWeight)
        style.bold = css.fontWeight === 'bold' || Number.parseInt(css.fontWeight, 10) >= 600;
      if (css.fontStyle)
        style.italic = css.fontStyle === 'italic' || css.fontStyle === 'oblique';
      if (css.textDecoration)
        style.underline = css.textDecoration.includes('underline');
    }
    return style;
  }
  function richRuns(node, style) {
    if (!node)
      return '';
    if (node.nodeType === Node.TEXT_NODE)
      return xmlRunsFromText(node.nodeValue || '', style);
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE)
      return '';
    if (node.nodeType === Node.ELEMENT_NODE && node.tagName.toUpperCase() === 'BR')
      return '<w:r><w:br/></w:r>';
    const nextStyle = node.nodeType === Node.ELEMENT_NODE ? styleFromNode(node, style) : style;
    let output = [...node.childNodes].map((child) => richRuns(child, nextStyle)).join('');
    if (node.nodeType === Node.ELEMENT_NODE && ['DIV', 'P'].includes(node.tagName.toUpperCase()) && node.nextSibling) {
      output += '<w:r><w:br/></w:r>';
    }
    return output;
  }
  function elementMarkup(element) {
    let content = element.customContent !== undefined
      ? sanitizeRichContent(element.customContent)
      : replaceTokens(String(element.text ?? ''), currentFormData);
    content = content.replace(/\\textbf\{([^{}]*)\}/g, '<strong>$1</strong>');
    return sanitizeRichContent(content).replace(/\n/g, '<br>');
  }
  function paragraphProperties(element, beforeTwips, pageWidthTwips, leading = '') {
    const left = clamp(Math.round((Number(element.x) || 0) * TWIPS_PER_PX), 0, Math.max(0, pageWidthTwips - 120));
    const boxWidth = Number(element.w) > 0 ? Number(element.w) * TWIPS_PER_PX : pageWidthTwips - left;
    const right = clamp(Math.round(pageWidthTwips - left - boxWidth), 0, pageWidthTwips - left);
    const alignment = ({ left: 'left', right: 'right', center: 'center', justify: 'both' })[element.align] || 'center';
    // Mirror the on-canvas rule: per-element line height scaled by the global line-spacing control.
    const globalSpacing = (Number(document.getElementById('f_lineSpacing')?.value) || 135) / 100;
    const lineHeight = clamp(element.lineHeight ? Number(element.lineHeight) * globalSpacing / 1.35 : globalSpacing, 0.8, 3);
    const fontScale = (Number(document.getElementById('f_fontScale')?.value) || 100) / 100;
    // lineRule="atLeast" takes twips (15 per px). The "auto" rule expects 240ths of a line,
    // so a 16px line would become 0.17 of a line and Word would draw the lines on top of each other.
    const line = Math.round(clamp((Number(element.size) || 16) * fontScale, 6, 96) * TWIPS_PER_PX * lineHeight);
    return `<w:pPr>${leading}<w:spacing w:before="${clamp(beforeTwips, 0, 30000)}" w:after="0" w:line="${line}" w:lineRule="atLeast"/><w:ind w:left="${left}" w:right="${right}"/><w:jc w:val="${alignment}"/>`;
  }
  function makeTextParagraph(element, beforeTwips, pageWidthTwips) {
    if (element.type === 'shape') {
      const color = safeHex(element.bg || element.color);
      const thickness = clamp(Math.round((Number(element.h) || 1) * 6), 2, 48);
      const border = `<w:pBdr><w:bottom w:val="single" w:sz="${thickness}" w:space="0" w:color="${color}"/></w:pBdr>`;
      return `<w:p>${paragraphProperties(element, beforeTwips, pageWidthTwips, border)}</w:pPr><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>`;
    }
    const props = paragraphProperties(element, beforeTwips, pageWidthTwips);
    let markup = elementMarkup(element);
    const holder = document.createElement('div');
    holder.innerHTML = markup;
    const base = {
      fontFamily: element.font || document.getElementById('f_fontFamily')?.value || 'Times New Roman',
      fontSizePx: (Number(element.size) || 16) * ((Number(document.getElementById('f_fontScale')?.value) || 100) / 100),
      color: element.color || '#111111',
      bold: element.weight ? element.weight === 'bold' || Number.parseInt(element.weight, 10) >= 600 : true,
      italic: Boolean(element.italic),
      underline: Boolean(element.underline)
    };
    const runs = richRuns(holder, base);
    return `<w:p>${props}</w:pPr>${runs}</w:p>`;
  }
  function tableCell(value, width, header = false, align = 'left') {
    const size = header ? 18 : 16;
    const run = xmlRunsFromText(value, { fontFamily: 'Times New Roman', fontSizePx: size * 2 / 3, color: '#111111', bold: header });
    const fill = header ? '<w:shd w:val="clear" w:color="auto" w:fill="E9EEF3"/>' : '';
    return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${fill}<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="${align}"/><w:spacing w:after="0"/></w:pPr>${run}</w:p></w:tc>`;
  }
  function experimentTableXml(element, pageWidthTwips, beforeTwips) {
    const headers = ['Sr. No.', 'Title', 'Page No.', 'Date', 'Signature'];
    const sourceRows = Array.isArray(experimentsList) && experimentsList.length ? experimentsList : [{ no: 1, title: '', page: '', date: '' }];
    const rows = [headers, ...sourceRows.map((row) => [row.no ?? '', row.title ?? '', row.page ?? '', String(row.date ?? '').replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1'), ''])];
    const width = clamp(Math.round((Number(element.w) || 660) * TWIPS_PER_PX), 3600, pageWidthTwips);
    const left = clamp(Math.round((Number(element.x) || 40) * TWIPS_PER_PX), 0, pageWidthTwips - width);
    const weights = [0.09, 0.50, 0.12, 0.14, 0.15];
    const widths = weights.map((weight) => Math.round(width * weight));
    const tableRows = rows.map((row, rowIndex) => `<w:tr>${row.map((cell, index) => tableCell(cell, widths[index], rowIndex === 0, index === 0 || index === 2 || index === 3 ? 'center' : 'left')).join('')}</w:tr>`).join('');
    const borders = '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="777777"/><w:left w:val="single" w:sz="4" w:color="777777"/><w:bottom w:val="single" w:sz="4" w:color="777777"/><w:right w:val="single" w:sz="4" w:color="777777"/><w:insideH w:val="single" w:sz="4" w:color="A0A0A0"/><w:insideV w:val="single" w:sz="4" w:color="A0A0A0"/></w:tblBorders>';
    const spacer = `<w:p><w:pPr><w:spacing w:before="${clamp(beforeTwips, 0, 30000)}" w:after="0" w:line="1" w:lineRule="exact"/></w:pPr><w:r><w:rPr><w:sz w:val="2"/></w:rPr><w:t xml:space="preserve"> </w:t></w:r></w:p>`;
    return `${spacer}<w:tbl><w:tblPr><w:tblW w:w="${width}" w:type="dxa"/><w:tblInd w:w="${left}" w:type="dxa"/>${borders}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${widths.map((columnWidth) => `<w:gridCol w:w="${columnWidth}"/>`).join('')}</w:tblGrid>${tableRows}</w:tbl>`;
  }
  async function captureLogoPng() {
    const logo = document.querySelector('#page .logo-box');
    if (!logo)
      return null;
    const source = logo.querySelector('img')?.currentSrc || logo.querySelector('img')?.src || '';
    const directPng = /^data:image\/png;base64,([a-z0-9+/=\s]+)$/i.exec(source);
    if (directPng && directPng[1].length <= 6 * 1024 * 1024) {
      try {
        const binary = atob(directPng[1].replace(/\s/g, ''));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++)
          bytes[i] = binary.charCodeAt(i);
        const signature = [137, 80, 78, 71, 13, 10, 26, 10];
        if (signature.every((value, index) => bytes[index] === value))
          return bytes;
      } catch (_) { /* Fall through to safe raster capture. */ }
    }
    await window.coverdraftEnsurePdfLibs?.();
    if (typeof window.html2canvas !== 'function')
      return null;
    try {
      const canvas = await window.html2canvas(logo, { scale: 1.25, useCORS: true, logging: false, backgroundColor: null });
      if (!canvas || !canvas.width || !canvas.height)
        return null;
      const dataUrl = canvas.toDataURL('image/png');
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++)
        bytes[i] = binary.charCodeAt(i);
      canvas.width = 1;
      canvas.height = 1;
      return bytes;
    } catch (error) {
      console.warn('DOCX logo capture skipped:', error);
      return null;
    }
  }
  function pictureRun(cx, cy) {
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="1" name="Coverdraft emblem"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="emblem.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImage1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  }
  function logoParagraph(element, beforeTwips, pageWidthTwips) {
    const props = paragraphProperties({ ...element, align: 'center' }, beforeTwips, pageWidthTwips);
    const cx = Math.round(clamp(Number(element.w) || 100, 12, 600) * EMU_PER_PX);
    const cy = Math.round(clamp(Number(element.h) || Number(element.w) || 100, 12, 600) * EMU_PER_PX);
    return `<w:p>${props}</w:pPr>${pictureRun(cx, cy)}</w:p>`;
  }
  function buildCrcTable() {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++)
        c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  }
  const crcTable = buildCrcTable();
  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (const byte of bytes)
      crc = crcTable[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function zipStored(files) {
    const localParts = [], centralParts = [];
    let offset = 0;
    const now = new Date();
    const dosTime = ((now.getHours() & 31) << 11) | ((now.getMinutes() & 63) << 5) | (Math.floor(now.getSeconds() / 2) & 31);
    const dosDate = (((Math.max(1980, now.getFullYear()) - 1980) & 127) << 9) | (((now.getMonth() + 1) & 15) << 5) | (now.getDate() & 31);
    const header = (length, fill) => {
      const bytes = new Uint8Array(length);
      fill(new DataView(bytes.buffer));
      return bytes;
    };
    files.forEach(({ name, data }) => {
      const filename = encoder.encode(name);
      const body = typeof data === 'string' ? encoder.encode(data) : data;
      const checksum = crc32(body);
      const local = header(30 + filename.length, (view) => {
        view.setUint32(0, 0x04034B50, true);
        view.setUint16(4, 20, true);
        view.setUint16(6, 0x0800, true);
        view.setUint16(8, 0, true);
        view.setUint16(10, dosTime, true);
        view.setUint16(12, dosDate, true);
        view.setUint32(14, checksum, true);
        view.setUint32(18, body.length, true);
        view.setUint32(22, body.length, true);
        view.setUint16(26, filename.length, true);
        view.setUint16(28, 0, true);
      });
      local.set(filename, 30);
      localParts.push(local, body);
      const central = header(46 + filename.length, (view) => {
        view.setUint32(0, 0x02014B50, true);
        view.setUint16(4, 20, true);
        view.setUint16(6, 20, true);
        view.setUint16(8, 0x0800, true);
        view.setUint16(10, 0, true);
        view.setUint16(12, dosTime, true);
        view.setUint16(14, dosDate, true);
        view.setUint32(16, checksum, true);
        view.setUint32(20, body.length, true);
        view.setUint32(24, body.length, true);
        view.setUint16(28, filename.length, true);
        view.setUint16(30, 0, true);
        view.setUint16(32, 0, true);
        view.setUint16(34, 0, true);
        view.setUint16(36, 0, true);
        view.setUint32(38, 0, true);
        view.setUint32(42, offset, true);
      });
      central.set(filename, 46);
      centralParts.push(central);
      offset += local.length + body.length;
    });
    const centralOffset = offset;
    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const end = header(22, (view) => {
      view.setUint32(0, 0x06054B50, true);
      view.setUint16(4, 0, true);
      view.setUint16(6, 0, true);
      view.setUint16(8, files.length, true);
      view.setUint16(10, files.length, true);
      view.setUint32(12, centralSize, true);
      view.setUint32(16, centralOffset, true);
      view.setUint16(20, 0, true);
    });
    const allParts = [...localParts, ...centralParts, end];
    const totalLength = allParts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(totalLength);
    let cursor = 0;
    allParts.forEach((part) => {
      output.set(part, cursor);
      cursor += part.length;
    });
    return output;
  }
  async function createCurrentPageDocx() {
    const pageKey = typeof currentPageKey === 'string' ? currentPageKey : 'cover';
    const dimensions = window.coverdraftPageDimensions?.() || { width: 794, height: 1123 };
    const pageWidthTwips = clamp(Math.round((Number(dimensions.width) || 794) * TWIPS_PER_PX), 6000, 20000);
    const pageHeightTwips = clamp(Math.round((Number(dimensions.height) || 1123) * TWIPS_PER_PX), 9000, 30000);
    documentPages[pageKey] = canvasElements;
    let elements = Array.isArray(documentPages[pageKey]) ? documentPages[pageKey].slice() : [];
    if (!elements.length && pageKey === 'index' && typeof buildIndexTemplate === 'function') {
      elements = window.coverdraftScaleA4Layout?.(buildIndexTemplate()) || buildIndexTemplate();
    }
    const sorted = elements.slice().sort((a, b) => (Number(a?.y) || 0) - (Number(b?.y) || 0) || (Number(a?.x) || 0) - (Number(b?.x) || 0));
    const logoPresent = sorted.some((element) => element?.type === 'logo');
    const logoBytes = logoPresent ? await captureLogoPng() : null;
    const paragraphs = [];
    let previousBottom = 0;
    let skippedOriginal = false;
    sorted.forEach((element) => {
      if (!element || typeof element !== 'object')
        return;
      // Drafts can contain background images or overlay masks that cannot be represented
      // as editable Word text. Skip those objects and report the reduced DOCX fidelity.
      if (element.type === 'image' || element.preserveOriginalMask) {
        skippedOriginal = true;
        return;
      }
      const y = clamp(Number(element.y) || 0, 0, Number(dimensions.height) || 1123);
      const estimatedHeight = clamp(Number(element.h) || (Number(element.size) || 16) * (String(element.text || '').split('\n').length + 0.5), 2, 600);
      const before = Math.round(Math.max(0, y - previousBottom) * TWIPS_PER_PX);
      previousBottom = Math.max(previousBottom, y + estimatedHeight);
      if (element.type === 'expTable') {
        paragraphs.push(experimentTableXml(element, pageWidthTwips, before));
      } else if (element.type === 'logo') {
        if (logoBytes)
          paragraphs.push(logoParagraph(element, before, pageWidthTwips));
      } else {
        paragraphs.push(makeTextParagraph(element, before, pageWidthTwips));
      }
    });
    if (!paragraphs.length)
      paragraphs.push('<w:p><w:r><w:t xml:space="preserve"></w:t></w:r></w:p>');
    const fontScale = (Number(document.getElementById('f_fontScale')?.value) || 100) / 100;
    const borderEnabled = document.getElementById('f_showBorder')?.checked;
    const borderColor = safeHex(document.getElementById('f_borderColor')?.value || '#111111');
    const borderWidth = clamp(Number(document.getElementById('f_borderWidth')?.value || 2) * 6, 2, 48);
    const pageBorders = borderEnabled ? `<w:pgBorders w:offsetFrom="page"><w:top w:val="single" w:sz="${borderWidth}" w:space="20" w:color="${borderColor}"/><w:left w:val="single" w:sz="${borderWidth}" w:space="20" w:color="${borderColor}"/><w:bottom w:val="single" w:sz="${borderWidth}" w:space="20" w:color="${borderColor}"/><w:right w:val="single" w:sz="${borderWidth}" w:space="20" w:color="${borderColor}"/></w:pgBorders>` : '';
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${paragraphs.join('')}<w:sectPr><w:pgSz w:w="${pageWidthTwips}" w:h="${pageHeightTwips}"/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/>${pageBorders}</w:sectPr></w:body></w:document>`;
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${logoBytes ? '<Default Extension="png" ContentType="image/png"/>' : ''}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;
    const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
    const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${logoBytes ? '<Relationship Id="rIdImage1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/emblem.png"/>' : ''}<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`;
    const files = [
      { name: '[Content_Types].xml', data: contentTypes },
      { name: '_rels/.rels', data: rootRels },
      { name: 'word/document.xml', data: documentXml },
      { name: 'word/styles.xml', data: stylesXml },
      { name: 'word/_rels/document.xml.rels', data: documentRels }
    ];
    if (logoBytes)
      files.push({ name: 'word/media/emblem.png', data: logoBytes });
    const bytes = zipStored(files);
    const pageName = ({ cover: 'Cover', index: 'Index' })[pageKey] || 'Page';
    const owner = window.coverdraftSafePdfFilePart?.(currentFormData?.name || currentFormData?.uid || currentFormData?.usn || currentFormData?.sid || currentFormData?.roll || 'submission') || 'submission';
    return { bytes, filename: `${owner}_${pageName}.docx`, pageKey, fontScale, skippedOriginal };
  }
  window.coverdraftCreateCurrentPageDocx = createCurrentPageDocx;
  window.coverdraftDownloadCurrentPageDocx = async function () {
    if (typeof window.coverdraftBeginExport === 'function' && !window.coverdraftBeginExport())
      return;
    const button = document.getElementById('downloadDocxBtn');
    try {
      if (button)
        button.setAttribute('aria-busy', 'true');
      showToast('Preparing editable Word document…', true);
      const result = await createCurrentPageDocx();
      const blob = new Blob([result.bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      const kind = result.pageKey === 'index' ? 'Index' : result.pageKey === 'cover' ? 'Cover' : 'page';
      showToast(`Editable ${kind} DOCX download started${result.skippedOriginal ? '. Some image/background elements were not included; only editable text was exported.' : ''}`, !result.skippedOriginal);
    } catch (error) {
      console.error('DOCX export failed:', error);
      showToast(`DOCX export failed: ${error?.message || 'Please try again.'}`, false);
    } finally {
      if (button)
        button.setAttribute('aria-busy', 'false');
      window.coverdraftEndExport?.();
    }
  };
  document.getElementById('downloadDocxBtn')?.addEventListener('click', () => {
    const run = () => window.coverdraftDownloadCurrentPageDocx?.();
    if (typeof window.coverdraftRunExportPreflight === 'function')
      window.coverdraftRunExportPreflight(run, { scope: 'current' });
    else
      run();
  });
})();
