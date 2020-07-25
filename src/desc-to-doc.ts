const toMarkdown = require('to-markdown');
const validUrl = require('valid-url');

function prefixLines(s: string, prefix: string) {
  let escapedReplacement = prefix.replace(/\$/g, '$$$$');
  return s.replace(/^.*$/gm, `${escapedReplacement}$&`);
}

const DOC_START = '/**';
const DOC_CONT = ' * ';
const DOC_END = ' */';

/**
 * converts a string to a doc comment
 */
export function toDocComment(content: string) {
  let isSingleLine = !(content.includes('\n') || content.length > 100);
  if (isSingleLine) {
    return DOC_START + ' ' + content + DOC_END;
  }
  return DOC_START + '\n' + prefixLines(content, DOC_CONT) + '\n' + DOC_END;
}

const toMarkdownOptions = {
  converters: [
    // un-linkify links to just fragment identifiers or relative urls meant for chrome docs pages
    {
      filter: (element: HTMLElement) =>
        element.tagName === 'A' && !validUrl.is_web_uri(element.getAttribute('href')),
      replacement: (content: string) => content,
    },
    // variable name
    {
      filter: 'var',
      replacement: (content: string) => `\`${content}\``,
    },
    // markdown has no definition lists, imitate them
    {
      filter: 'dl',
      replacement: (content: string) => `${content}\n`,
    },
    {
      filter: 'dt',
      replacement: (content: string) => `*${content}*:\n`,
    },
    {
      filter: 'dd',
      replacement: (content: string) => `  ${content}  \n`,
    },
  ],
};

/**
 * converts an html description from the extension manifests to markdown for a doc comment
 */
export function descToMarkdown(description: string) {
  // reference to another thing in code
  // > The $(ref:runtime.onConnect) event is fired [...]
  description = description.replace(/\$\(ref:(.*?)\)/g, '<code>$1</code>');
  // link to chrome docs
  // > For more details, see $(topic:messaging)[Content Script Messaging].
  description = description.replace(/\$\(topic:(.*?)\)\[(.*?)]/g, '$2');
  // chrome.* -> browser.*
  description = description.replace(/\bchrome\.(?=[a-zA-Z])/, 'browser.');

  description = toMarkdown(description, toMarkdownOptions);

  // a few descriptions contain "<webview>" which is interpreted as an unclosed tag, fix it
  description = description
    .replace(/<\/webview>$/, '')
    .replace(/<webview>(?!\s)(?!$)/, '<webview> ');

  return description;
}
