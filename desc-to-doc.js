const toMarkdown = require("to-markdown");

function prefixLines(s, prefix) {
    const escapedReplacement = prefix.replace(/\$/g, "$$$$");
    return s.replace(/^.*$/gm, `${escapedReplacement}$&`);
}

/**
 * converts a string to a doc comment
 */
function toDocComment(content) {
    return "/**\n" + prefixLines(content, " * ") + "\n */";
}

function convertLinks(html) {
    // reference to another thing in code
    // todo: what's the jsdoc equivalent?
    // > The $(ref:runtime.onConnect) event is fired [...]
    html = html.replace(/\$\(ref:(.*?)\)/g, "<code>$1</code>");
    // link to chrome docs
    // > For more details, see $(topic:messaging)[Content Script Messaging].
    html = html.replace(/\$\(topic:(.*?)\)\[(.*?)\]/g, "$2");
    return html;
}

/**
 * converts an html description from the extension manifests to markdown for a doc comemnt
 */
function descToMarkdown(description) {
    description = convertLinks(description);
    description = toMarkdown(description);
    return description;
}

exports.descToMarkdown = descToMarkdown;
exports.toDocComment = toDocComment;
