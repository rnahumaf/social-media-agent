import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { renderBlog } from "../core/blog-html.mjs";
import DOMPurify from "dompurify";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Link,
  Undo2,
  Redo2,
} from "lucide-react";

export function BlogPreview({ value }: { value: string }) {
  const html = DOMPurify.sanitize(renderBlog(value), {
    FORBID_TAGS: ["img", "iframe", "style", "script"],
    FORBID_ATTR: ["style"],
  });
  return (
    <>
      {/!\[/.test(value) && (
        <p className="inline-note">
          As imagens externas referenciadas no Markdown são preservadas na
          publicação. Esta prévia mostra o texto do artigo.
        </p>
      )}
      <article
        className="blog-preview"
        dangerouslySetInnerHTML={{
          __html: html.replace(
            /<a /g,
            '<a target="_blank" rel="noopener noreferrer" ',
          ),
        }}
      />
    </>
  );
}
export default function BlogEditor({
  value,
  onChange,
  readOnly = false,
}: {
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
}) {
  const unsupported =
    /<\/?[a-z][^>]*>|!\[|\[\^[^\]]+\]|\n[^\n]*\|[^\n]*\n[ \t|:-]{3,}|(^|\n)\s*\[[^\]]+\]:|(^|\n)\s*[-*+]\s+\[[ x]\]/im.test(
      value,
    );
  const [mode, setMode] = useState<"visual" | "markdown" | "preview">(
    unsupported ? "markdown" : "visual",
  );
  const [link, setLink] = useState<string | null>(null);
  const changed = useRef(onChange);
  changed.current = onChange;
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: false } }),
      Markdown,
    ],
    content: value,
    contentType: "markdown",
    editable: !readOnly,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: { "aria-label": "Texto do blog", class: "visual-editor" },
    },
    onUpdate: ({ editor }) => changed.current(editor.getMarkdown()),
  });
  useEffect(() => {
    if (editor && editor.getMarkdown() !== value)
      editor.commands.setContent(value, {
        contentType: "markdown",
        emitUpdate: false,
      });
  }, [value, editor]);
  useEffect(() => {
    editor?.setEditable(!readOnly, false);
  }, [readOnly, editor]);
  const command = (fn: () => void) => {
    if (!readOnly) fn();
  };
  return (
    <div className="blog-editor">
      <div className="editor-mode" role="group" aria-label="Modo do editor">
        <button
          disabled={unsupported}
          aria-pressed={mode === "visual"}
          onClick={() => setMode("visual")}
        >
          Visual
        </button>
        <button
          aria-pressed={mode === "markdown"}
          onClick={() => setMode("markdown")}
        >
          Markdown
        </button>
        <button
          aria-pressed={mode === "preview"}
          onClick={() => setMode("preview")}
        >
          Prévia
        </button>
      </div>
      {unsupported && (
        <p className="inline-note">
          Este texto usa formatação que o editor visual ainda não preserva.
          Edite em Markdown para manter o conteúdo original.
        </p>
      )}
      {mode === "visual" && !unsupported && editor && (
        <>
          <div
            className="format-toolbar"
            role="toolbar"
            aria-label="Formatação do blog"
          >
            <select
              aria-label="Estilo do parágrafo"
              disabled={readOnly}
              value={
                editor.isActive("heading")
                  ? String(editor.getAttributes("heading").level)
                  : "p"
              }
              onChange={(e) =>
                command(() =>
                  e.target.value === "p"
                    ? editor.chain().focus().setParagraph().run()
                    : editor
                        .chain()
                        .focus()
                        .setHeading({
                          level: Number(e.target.value) as
                            1 | 2 | 3 | 4 | 5 | 6,
                        })
                        .run(),
                )
              }
            >
              <option value="p">Parágrafo</option>
              {[1, 2, 3, 4, 5, 6].map((level) => (
                <option key={level} value={level}>
                  Título {level}
                </option>
              ))}
            </select>
            {[
              [
                Bold,
                "Negrito",
                () => editor.chain().focus().toggleBold().run(),
              ],
              [
                Italic,
                "Itálico",
                () => editor.chain().focus().toggleItalic().run(),
              ],
              [
                List,
                "Lista",
                () => editor.chain().focus().toggleBulletList().run(),
              ],
              [
                ListOrdered,
                "Lista numerada",
                () => editor.chain().focus().toggleOrderedList().run(),
              ],
              [
                Quote,
                "Citação",
                () => editor.chain().focus().toggleBlockquote().run(),
              ],
              [
                Link,
                "Inserir link",
                () => setLink(editor.getAttributes("link").href || ""),
              ],
              [Undo2, "Desfazer", () => editor.chain().focus().undo().run()],
              [Redo2, "Refazer", () => editor.chain().focus().redo().run()],
            ].map(([Icon, label, fn]: any) => (
              <button
                key={label}
                title={label}
                aria-label={label}
                disabled={readOnly}
                onClick={() => command(fn)}
              >
                <Icon size={17} />
              </button>
            ))}
          </div>
          {link !== null && (
            <form
              className="link-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!link.trim()) editor.chain().focus().unsetLink().run();
                else if (/^https?:\/\//i.test(link))
                  editor
                    .chain()
                    .focus()
                    .extendMarkRange("link")
                    .setLink({ href: link })
                    .run();
                else return;
                setLink(null);
              }}
            >
              <label>
                Endereço do link
                <input
                  type="url"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://exemplo.com"
                />
              </label>
              <button>Aplicar link</button>
              <button type="button" onClick={() => setLink(null)}>
                Cancelar
              </button>
            </form>
          )}
          <EditorContent editor={editor} />
        </>
      )}
      {(mode === "markdown" || (mode === "visual" && unsupported)) && (
        <textarea
          className="article"
          aria-label="Artigo em Markdown"
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {mode === "preview" && <BlogPreview value={value} />}
    </div>
  );
}
