import CodeMirror from "codemirror";
import "codemirror/lib/codemirror.css";
import "codemirror/addon/edit/closebrackets";
import "codemirror/addon/edit/matchbrackets";
import "codemirror/addon/comment/comment";
import "codemirror/mode/javascript/javascript";
import "codemirror/mode/xml/xml";
import "codemirror/mode/css/css";
import "codemirror/mode/htmlmixed/htmlmixed";
import "codemirror/mode/python/python";
import "codemirror/mode/markdown/markdown";
import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ gfm: true, breaks: true });

window.Clip9Editor = {
  CodeMirror,
  renderMarkdown(markdown) {
    return DOMPurify.sanitize(marked.parse(markdown || ""), {
      USE_PROFILES: { html: true },
    });
  },
};
