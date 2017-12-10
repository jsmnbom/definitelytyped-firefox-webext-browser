const toMarkdown = require('to-markdown');
const {URL} = require('url');

function prefixLines(s, prefix) {
    let escapedReplacement = prefix.replace(/\$/g, '$$$$');
    return s.replace(/^.*$/gm, `${escapedReplacement}$&`);
}

const DOC_START = '/**';
const DOC_CONT = ' * ';
const DOC_END = ' */';

/**
 * converts a string to a doc comment
 */
function toDocComment(content) {
    let isSingleLine = content.indexOf('\n') === content.lastIndexOf('\n');
    if (isSingleLine) {
        return DOC_START + ' ' + content + DOC_END;
    }
    return DOC_START + '\n' + prefixLines(content, DOC_CONT) + '\n' + DOC_END;
}

function convertLinks(html) {
    // reference to another thing in code
    // > The $(ref:runtime.onConnect) event is fired [...]
    html = html.replace(/\$\(ref:(.*?)\)/g, '<code>$1</code>');
    // link to chrome docs
    // > For more details, see $(topic:messaging)[Content Script Messaging].
    html = html.replace(/\$\(topic:(.*?)\)\[(.*?)\]/g, '$2');
    return html;
}

function isValidURL(url) {
    try {
        new URL(url);
        return true;
    } catch (_ignore) {
        return false;
    }
}

const toMarkdownOptions = {
    converters: [
        // un-linkify links to just fragment identifiers or relative urls meant for chrome docs pages
        {
            filter: (element) => (element.tagName === 'A') && !isValidURL(element.getAttribute('href')),
            replacement: (content) => content,
        },
        // variable name
        {
            filter: 'var',
            replacement: (content) => `\`${content}\``,
        },
        // markdown has no definition lists, imitate them
        {
            filter: 'dl',
            replacement: (content) => `${content}\n`,
        },
        {
            filter: 'dt',
            replacement: (content) => `*${content}*:\n`,
        },
        {
            filter: 'dd',
            replacement: (content) => `  ${content}  \n`,
        }
    ]
};

/**
 * converts an html description from the extension manifests to markdown for a doc comment
 */
function descToMarkdown(description) {
    description = convertLinks(description);
    description = toMarkdown(description, toMarkdownOptions);
    return description;
}

exports.descToMarkdown = descToMarkdown;
exports.toDocComment = toDocComment;
