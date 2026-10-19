import SanitizeHTML from 'sanitize-html';

const config = {
  allowedTags: [
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'blockquote',
    'p',
    'a',
    'ul',
    'ol',
    'li',
    'b',
    'i',
    'strong',
    'em',
    'strike',
    'del',
    'br',
    'div',
    'sup',
    'sub',
  ],
  allowedAttributes: {
    a: ['href', 'name', 'target', 'class'],
    img: ['src'],
  },
  // Lots of these won't come up by default because we don't allow them
  selfClosing: ['img', 'br', 'hr', 'area', 'base', 'basefont', 'input', 'link', 'meta'],
  // URL schemes we permit
  allowedSchemes: ['http', 'https', 'ftp', 'mailto'],
  allowedSchemesByTag: {},
};

const inlineConfig = { ...config, allowedTags: [] as string[] };

export const sanitized: (unsafe: string) => string = (unsafe) => {
  return SanitizeHTML(unsafe, config);
};

export const sanitizedInline: (unsafe: string) => string = (unsafe) => {
  return SanitizeHTML(unsafe.replace('</', ' </'), inlineConfig);
};

export const sanitizeHtmlMessageBody: (text: string) => string = (text) => {
  return SanitizeHTML(text).replaceAll(/<br\s*\/?>/gi, '</p><p>');
};
