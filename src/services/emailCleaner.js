// src/services/emailCleaner.js

// ─────────────────────────────────────────────────────────
//  Advanced Email Cleaning Utilities
// ─────────────────────────────────────────────────────────

function decodeHtmlEntities(input) {
    const text = String(input || '');
    const named = {
      amp: '&',
      lt: '<',
      gt: '>',
      quot: '"',
      apos: "'",
      nbsp: ' ',
    };
  
    return text
      .replace(/&([a-zA-Z]+);/g, (m, name) => (named[name] != null ? named[name] : m))
      .replace(/&#(\d+);/g, (m, dec) => {
        const code = Number(dec);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      })
      .replace(/&#x([0-9a-fA-F]+);/g, (m, hex) => {
        const code = Number.parseInt(hex, 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      });
  }
  
  function mojibakeScore(text) {
    return (String(text).match(/(?:Ãƒ.|Ã‚.|Ã¢[^\s]?|\uFFFD)/g) || []).length;
  }
  
  function maybeFixMojibake(text) {
    const input = String(text || '');
    if (!/[ÃƒÃ‚Ã¢]/.test(input)) return input;
  
    try {
      const repaired = Buffer.from(input, 'latin1').toString('utf8');
      return mojibakeScore(repaired) + 1 < mojibakeScore(input) ? repaired : input;
    } catch {
      return input;
    }
  }
  
  function replaceCommonBrokenSequences(text) {
    return String(text || '')
      .replace(/\u00e2\u20ac\u2122|\u00e2\u20ac\u02dc/g, "'")
      .replace(/\u00e2\u20ac\u0153|\u00e2\u20ac\u009d/g, '"')
      .replace(/\u00e2\u20ac\u201c|\u00e2\u20ac\u201d/g, '-')
      .replace(/\u00e2\u20ac\u00a6/g, '...')
      .replace(/\u00c2/g, ' ')
      .replace(/Ã¢â‚¬â„¢|Ã¢â‚¬Ëœ/g, "'")
      .replace(/Ã¢â‚¬Å“|Ã¢â‚¬\u009d/g, '"')
      .replace(/Ã¢â‚¬â€œ|Ã¢â‚¬â€\u009d/g, '-')
      .replace(/Ã¢â‚¬Â¦/g, '...')
      .replace(/Ã‚ /g, ' ')
      .replace(/\u00a0/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\u0000/g, '');
  }
  
  function decodeNormalize(text) {
    let out = String(text || '').replace(/\r\n?/g, '\n');
    for (let i = 0; i < 3; i += 1) {
      const prev = out;
      out = decodeHtmlEntities(out);
      if (out === prev) break;
    }
    out = maybeFixMojibake(out);
    out = replaceCommonBrokenSequences(out);
    try {
      return out.normalize('NFC');
    } catch {
      return out;
    }
  }
  
  function decodeMimeEncodedWords(value) {
    const input = String(value || '');
    return input.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_, charset, encoding, encodedText) => {
      try {
        const normalizedCharset = String(charset || '').toLowerCase();
        const codec = normalizedCharset.includes('8859-1') ? 'latin1' : 'utf8';
  
        if (String(encoding).toUpperCase() === 'B') {
          return Buffer.from(encodedText, 'base64').toString(codec);
        }
  
        const qp = encodedText
          .replace(/_/g, ' ')
          .replace(/=([0-9A-Fa-f]{2})/g, (m, hex) => {
            const code = parseInt(hex, 16);
            return Number.isFinite(code) ? String.fromCharCode(code) : m;
          });
        return Buffer.from(qp, 'latin1').toString(codec);
      } catch {
        return encodedText;
      }
    });
  }
  
  function stripHeaderLabel(value, label) {
    return String(value || '')
      .replace(new RegExp(`^\\s*${label}s?\\s*:\\s*`, 'i'), '')
      .replace(/^\s*subjects?\s*:\s*/i, '')
      .replace(/^\s*from\s*:\s*/i, '')
      .replace(/^\s*to\s*:\s*/i, '');
  }
  
  const REPLY_FORWARD_PREFIX_RE = /^\s*(?:\[[^\]\n]{1,60}\]\s*)*(?:(?:re|fw|fwd|aw|wg|sv|rv)\s*(?:\[[0-9]+\])?\s*:|forwarded\s*(?:message)?\s*:?|(?:\u7b54\u590d|\u56de\u590d|\u56de\u8986|\u8f6c\u53d1|\u8f49\u5bc4)\s*[:\uff1a])\s*/i;
  
  function stripReplyForwardPrefixes(text) {
    let output = String(text || '');
    for (let i = 0; i < 8; i += 1) {
      const next = output.replace(REPLY_FORWARD_PREFIX_RE, '').trimStart();
      if (next === output) break;
      output = next;
    }
    return output;
  }
  
  function stripEmojis(text) {
    try {
      return String(text || '').replace(/\p{Extended_Pictographic}|\uFE0F/gu, ' ');
    } catch {
      return String(text || '');
    }
  }
  
  function normalizeHeaderColumn(value, label, removeAngleBrackets = false) {
    let output = decodeMimeEncodedWords(String(value || ''));
    output = decodeNormalize(output);
    output = stripHeaderLabel(output, label);
    if (removeAngleBrackets) output = output.replace(/[<>]/g, ' ');
    output = output.replace(/"/g, ' ');
    return output.replace(/\s+/g, ' ').trim();
  }
  
  function normalizeSubjectColumn(value) {
    let output = normalizeHeaderColumn(value, 'subject', false);
    output = stripReplyForwardPrefixes(output);
    output = output
      .replace(/\uFFFD{1,}\s*:/g, ' ')
      .replace(/\uFFFD+/g, ' ');
    output = stripEmojis(output);
    output = output
      .replace(/\p{Script=Han}+/gu, ' ')
      .replace(/[\u3000-\u303F]/g, ' ')
      .replace(/[\uFF0C\uFF1A\uFF1B\uFF1F\uFF01\u3001\u3002]/g, ' ');
    return output.replace(/\s+/g, ' ').trim();
  }
  
  function normalizePO(po) {
    const trimmed = String(po || '').trim().toUpperCase();
    if (!trimmed) return '';
    if (/^[A-Z]/.test(trimmed)) return trimmed;
  
    const prefixMap = {
      '1': 'JT',
      '2': 'ED',
      '3': 'TH',
      '5': 'SC',
      '6': 'TAL',
      '7': 'AR',
      '8': 'EN',
    };
  
    const prefix = prefixMap[trimmed[0]];
    return prefix ? `${prefix}${trimmed}` : trimmed;
  }
  
  function extractPONumbers(subject) {
    const input = String(subject || '');
    if (!input) return [];
  
    const poNumbers = new Set();
    let match;
  
    const prefixedPattern = /\b(JT\d{4}|TH\d{4}|(?:SC|5C)\d{4}|(?:ART|AR)\d{3,4}|ED\d{4}|TALB?\d{4,5}|EN\d{4})\b/gi;
    while ((match = prefixedPattern.exec(input)) !== null) {
      let po = String(match[1] || '').toUpperCase();
      po = po.replace(/^5C/, 'SC').replace(/^ART/, 'AR');
      poNumbers.add(po);
    }
  
    const poPattern = /PO\s*#?\s*(\d{4})\b/gi;
    while ((match = poPattern.exec(input)) !== null) {
      poNumbers.add(normalizePO(match[1]));
    }
  
    const standalonePattern = /(?:^|[^A-Z0-9])(\d{4})(?!\d)/gi;
    while ((match = standalonePattern.exec(input)) !== null) {
      const num = String(match[1] || '');
      const numValue = parseInt(num, 10);
  
      if (numValue >= 1900 && numValue <= 2099) continue;
  
      if (['1', '2', '3', '5', '6', '7', '8'].includes(num[0])) {
        poNumbers.add(normalizePO(num));
      }
    }
  
    return Array.from(poNumbers);
  }
  
  function looksLikeHtml(text) {
    const input = String(text || '');
    return /<[a-z][\s\S]*>/i.test(input) || /<!doctype html/i.test(input);
  }
  
  function htmlToTextFallback(input) {
    let out = String(input || '');
    if (!out) return '';
    if (!looksLikeHtml(out)) return out;
  
    out = out
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h1|h2|h3|h4|h5|h6)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '- ')
      // Keep only anchor text, not href URL
      .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1')
      .replace(/<[^>]+>/g, ' ');
  
    return out;
  }
  
  const THREAD_LINE_PATTERNS = [
    /^On .+ wrote:\s*$/i,
    /^wrote:\s*$/i,
    /^-----Original Message-----\s*$/i,
    /^-{2,}\s*Replied Message\s*-{2,}\s*$/i,
    /^[-_]{2,}\s*Forwarded message\s*[-_]{2,}\s*$/i,
    /^Begin forwarded message:?$/i,
    /^\s*From:\s*/i,
    /^\s*To:\s*/i,
    /^\s*Subject:\s*/i,
  ];
  
  const INLINE_THREAD_MARKERS = [
    /(?:^|\n)\s*On[\s\S]{0,220}?\bwrote:\s*/i,
    /(?:^|\n)\s*At\s+.+?\bwrote:\s*/i,
    /-{2,}\s*Replied Message\s*-{2,}\s*/i,
    /\bBegin forwarded message:?/i,
    /(?:^|\n)\s*From:\s+.+?\bSent:\s+.+?\bTo:\s+.+?\bSubject:\s+/i,
    /(?:^|\n)\s*在\s*\d{4}\s*年[\s\S]{0,160}?写道[:：]\s*/i,
    /(?:^|\n)\s*写道[:：]\s*/i,
  ];
  
  const FOOTER_HINTS = [
    'unsubscribe',
    'manage preferences',
    'privacy policy',
    'confidentiality notice',
    'intended recipient',
    'this message and any attachments',
    'sent from my iphone',
    'sent from my android',
    'state and liberty clothing company',
    'stateandliberty.com',
    'co-founder',
    'operations manager',
    'supply chain analyst',
    'product development and production manager',
    'special projects',
  ];
  
  const SIGNATURE_NAME_RE = /^[A-Z][A-Za-z.'-]{1,24}(?:\s+[A-Z][A-Za-z.'-]{1,24}){0,2}$/;
  const PHONE_RE = /\b(?:\+?\d{1,2}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]\d{4}\b/;
  
  function stripQuotedThread(text) {
    const lines = String(text || '').split('\n');
    let cutAt = lines.length;
    let nonEmptySeen = 0;
  
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (line) nonEmptySeen += 1;
      if (nonEmptySeen < 2) continue;
  
      if (/^On\s.+$/i.test(line)) {
        const next = (lines[i + 1] || '').trim();
        if (/^wrote:\s*$/i.test(next)) {
          cutAt = i;
          break;
        }
      }
  
      if (THREAD_LINE_PATTERNS.some((p) => p.test(line))) {
        cutAt = i;
        break;
      }
    }
  
    return lines.slice(0, cutAt).join('\n');
  }
  
  function cutInlineThreadMarkers(text) {
    let out = String(text || '');
    for (const marker of INLINE_THREAD_MARKERS) {
      const m = marker.exec(out);
      if (m && m.index > 20) {
        out = out.slice(0, m.index);
        break;
      }
    }
    return out;
  }
  
  function stripFooterTail(text) {
    const lines = String(text || '').split('\n');
    let cutAt = lines.length;
    let signatureStarted = false;
  
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i].trim();
      const lower = line.toLowerCase();
  
      if (!line) {
        if (signatureStarted) cutAt = i;
        continue;
      }
  
      if (/^--\s*$/.test(line)) {
        cutAt = i;
        signatureStarted = true;
        continue;
      }
  
      if (FOOTER_HINTS.some((k) => lower.includes(k))) {
        cutAt = i;
        signatureStarted = true;
        continue;
      }
  
      if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(line)) {
        cutAt = i;
        signatureStarted = true;
        continue;
      }
  
      if (PHONE_RE.test(line)) {
        cutAt = i;
        signatureStarted = true;
        continue;
      }
  
      if (signatureStarted && SIGNATURE_NAME_RE.test(line) && line.length <= 40) {
        cutAt = i;
        continue;
      }
  
      break;
    }
  
    return lines.slice(0, cutAt).join('\n');
  }
  
  function stripChineseCharacters(text) {
    try {
      return String(text || '')
        .replace(/\p{Script=Han}+/gu, ' ')
        .replace(/[\u3000-\u303F]/g, ' ')
        .replace(/[\uFF0C\uFF1A\uFF1B\uFF1F\uFF01\u3001\u3002]/g, ' ');
    } catch {
      return String(text || '');
    }
  }
  
  function collapseWhitespace(text) {
    return String(text || '')
      .replace(/\r\n?/g, '\n')
      .replace(/(?:^|\s)(?:>\s*){1,}(?=\s|$)/gm, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  
  function cleanBodyText(raw) {
    const htmlFlattened = htmlToTextFallback(raw);
    const normalized = decodeNormalize(htmlFlattened);
    const noThreadInline = cutInlineThreadMarkers(normalized);
    const noThread = stripQuotedThread(noThreadInline);
    const noFooter = stripFooterTail(noThread);
    const noEmoji = stripEmojis(noFooter);
    const noChinese = stripChineseCharacters(noEmoji);
  
    return collapseWhitespace(noEmoji ? noChinese : noFooter)
      .replace(/\n+/g, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }
  
  function stripTags(html) {
    return String(html || '').replace(/<[^>]+>/g, ' ');
  }

module.exports = {
  cleanBodyText,
  normalizeSubjectColumn,
  extractPONumbers,
  decodeNormalize,
  htmlToTextFallback
};
