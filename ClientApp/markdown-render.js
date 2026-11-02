import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";

const md = MarkdownIt('zero', { breaks: true, linkify: true })
    .enable(['newline', 'escape', 'emphasis', 'strikethrough', 'backticks', 'fence', 'blockquote', 'list', 'link', 'linkify']);

export function renderMessage(text) {
    return DOMPurify.sanitize(md.render(text));
}

DOMPurify.addHook('afterSanitizeAttributes', node => {
    if (node.tagName === 'A') {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
    }
});

window.markdown = {
    renderMessage,
};