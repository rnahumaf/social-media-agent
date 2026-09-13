import { Marked, Renderer } from "marked";

const renderer = new Renderer();
renderer.link = function (token) {
  if (!/^(https?:\/\/|mailto:|#)/i.test(token.href.trim()))
    return this.parser.parseInline(token.tokens);
  return Renderer.prototype.link.call(this, token);
};
renderer.image = function (token) {
  if (!/^https?:\/\//i.test(token.href.trim()))
    return this.parser.parseInline(token.tokens || []);
  return Renderer.prototype.image.call(this, token);
};
const parser = new Marked({ renderer });
export function renderBlog(markdown) {
  return parser.parse(markdown.replace(/</g, "&lt;"), { async: false });
}
