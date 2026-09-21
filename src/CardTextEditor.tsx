import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  EditorContent,
  useEditor,
  type Editor,
  type JSONContent,
} from "@tiptap/react";
import { Extension } from "@tiptap/core";
import { EditorState, Plugin } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { OrderedList } from "@tiptap/extension-list";
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  IndentIncrease,
  IndentDecrease,
  Undo2,
  Redo2,
} from "lucide-react";
import {
  textDocument,
  richTextPlain,
  richTextBlocks,
  type RichNode,
  type RichCardText,
} from "../core/card-rich-text.mjs";

function indentParagraphs(editor: Editor, delta: number, apply = true) {
  const { from, to } = editor.state.selection;
  const tr = editor.state.tr;
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== "paragraph") return;
    const indent = Math.max(0, Math.min(3, (node.attrs.indent || 0) + delta));
    if (indent !== node.attrs.indent)
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent });
  });
  if (apply && tr.docChanged) editor.view.dispatch(tr);
  return tr.docChanged;
}
function indent(editor: Editor, delta: number, apply = true) {
  if (editor.isActive("listItem")) {
    const chain = apply ? editor.chain().focus() : editor.can().chain();
    return delta > 0
      ? chain.sinkListItem("listItem").run()
      : chain.liftListItem("listItem").run();
  }
  if (apply) editor.commands.focus();
  return indentParagraphs(editor, delta, apply);
}
const CardIndent = Extension.create({
  name: "cardIndent",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph"],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el: HTMLElement) =>
              Math.max(
                0,
                Math.min(3, Number(el.getAttribute("data-indent")) || 0),
              ),
            renderHTML: (attrs: Record<string, number>) =>
              attrs.indent
                ? {
                    "data-indent": attrs.indent,
                    style: `margin-left: ${attrs.indent * 1.5}em`,
                  }
                : {},
          },
        },
      },
    ];
  },
  addKeyboardShortcuts() {
    return {
      "Mod-]": () => indent(this.editor, 1),
      "Mod-[": () => indent(this.editor, -1),
    };
  },
});

export default function CardTextEditor({
  value,
  rich,
  title = false,
  readOnly,
  onChange,
}: {
  value: string;
  rich?: RichNode | null;
  title?: boolean;
  readOnly: boolean;
  onChange: (text: string, rich: RichNode) => void;
}) {
  const label = title ? "Título do card" : "Texto do card";
  const maximum = title ? 90 : 420;
  const helpId = useId();
  const [error, setError] = useState("");
  const changed = useRef(onChange);
  changed.current = onChange;
  const received = useRef(JSON.stringify([value, rich]));
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        link: false,
        strike: false,
        trailingNode: false,
        orderedList: false,
        hardBreak: { keepMarks: false },
      }),
      OrderedList.extend({
        addAttributes() {
          return {
            start: {
              default: 1,
              parseHTML: (el: HTMLElement) =>
                Math.max(
                  1,
                  Math.min(99, Number(el.getAttribute("start")) || 1),
                ),
            },
          };
        },
      }),
      CardIndent,
      Extension.create({
        name: "cardLimits",
        addProseMirrorPlugins: () => [
          new Plugin({
            filterTransaction: (tr) => {
              if (!tr.docChanged) return true;
              const doc = tr.doc.toJSON() as RichNode;
              const blocks = richTextBlocks(doc);
              if (richTextPlain(doc).length > maximum) {
                setError(
                  `O limite é de ${maximum} caracteres. Reduza o trecho antes de inserir.`,
                );
                return false;
              }
              if (
                blocks.length > 32 ||
                blocks.some((block) => block.indent > 4)
              ) {
                setError(
                  "Use no máximo três níveis adicionais de recuo e 32 parágrafos.",
                );
                return false;
              }
              setError("");
              return true;
            },
          }),
        ],
      }),
    ],
    content: (rich || textDocument(value, title)) as JSONContent,
    editable: !readOnly,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: "card-text-input",
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
        "aria-describedby": helpId,
      },
    },
    onUpdate: ({ editor }) => {
      const doc = editor.getJSON() as RichNode;
      const text = richTextPlain(doc);
      received.current = JSON.stringify([text, doc]);
      changed.current(text, doc);
    },
  });
  useEffect(() => {
    const incoming = JSON.stringify([value, rich]);
    if (editor && incoming !== received.current) {
      editor.commands.setContent(
        (rich || textDocument(value, title)) as JSONContent,
        { emitUpdate: false },
      );
      // A different card/revision must not inherit this field's undo history.
      editor.view.updateState(
        EditorState.create({
          doc: editor.state.doc,
          plugins: editor.state.plugins,
        }),
      );
      received.current = incoming;
      setError("");
    }
  }, [value, rich, title, editor]);
  useEffect(() => {
    editor?.setEditable(!readOnly, false);
  }, [readOnly, editor]);
  const controls = editor
    ? [
        {
          Icon: Bold,
          label: "Negrito",
          active: editor.isActive("bold"),
          run: () => editor.chain().focus().toggleBold().run(),
        },
        {
          Icon: Italic,
          label: "Itálico",
          active: editor.isActive("italic"),
          run: () => editor.chain().focus().toggleItalic().run(),
        },
        {
          Icon: Underline,
          label: "Sublinhado",
          active: editor.isActive("underline"),
          run: () => editor.chain().focus().toggleUnderline().run(),
        },
        {
          Icon: List,
          label: "Lista com marcadores",
          active: editor.isActive("bulletList"),
          run: () => editor.chain().focus().toggleBulletList().run(),
        },
        {
          Icon: ListOrdered,
          label: "Lista numerada",
          active: editor.isActive("orderedList"),
          run: () => editor.chain().focus().toggleOrderedList().run(),
        },
        {
          Icon: IndentDecrease,
          label: "Diminuir recuo",
          enabled: indent(editor, -1, false),
          run: () => indent(editor, -1),
        },
        {
          Icon: IndentIncrease,
          label: "Aumentar recuo",
          enabled: indent(editor, 1, false),
          run: () => indent(editor, 1),
        },
        {
          Icon: Undo2,
          label: "Desfazer",
          enabled: editor.can().undo(),
          run: () => editor.chain().focus().undo().run(),
        },
        {
          Icon: Redo2,
          label: "Refazer",
          enabled: editor.can().redo(),
          run: () => editor.chain().focus().redo().run(),
        },
      ]
    : [];
  return (
    <div className="card-text-field">
      <span className="card-field-label">{label}</span>
      <div className={`card-rich-editor${title ? " card-title-editor" : ""}`}>
        <div
          className="format-toolbar"
          role="group"
          aria-label={`Formatação do ${title ? "título" : "texto"} do card`}
        >
          {controls.map(({ Icon, label, active, enabled, run }) => (
            <button
              type="button"
              key={label}
              title={label}
              aria-label={label}
              aria-pressed={active}
              disabled={readOnly || enabled === false}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => !readOnly && run()}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>
        <EditorContent editor={editor} />
      </div>
      <small id={helpId}>
        {value.length}/{maximum}
        {!title && " · Com imagens, textos menores ficam mais legíveis."}
      </small>
      {error && (
        <p className="inline-note" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function RichTextView({
  value,
  rich,
}: {
  value: string;
  rich?: RichNode | null;
}) {
  const render = (node: RichNode, key: number): ReactNode => {
    const children = node.content?.map(render);
    switch (node.type) {
      case "doc":
        return children;
      case "paragraph":
        return (
          <p
            key={key}
            style={{ marginLeft: `${(node.attrs?.indent || 0) * 1.5}em` }}
          >
            {children || <br />}
          </p>
        );
      case "bulletList":
        return <ul key={key}>{children}</ul>;
      case "orderedList":
        return (
          <ol key={key} start={node.attrs?.start || 1}>
            {children}
          </ol>
        );
      case "listItem":
        return <li key={key}>{children}</li>;
      case "hardBreak":
        return <br key={key} />;
      case "text":
        return (
          <span
            key={key}
            style={{
              fontWeight: node.marks?.some((m) => m.type === "bold")
                ? "bold"
                : "normal",
              fontStyle: node.marks?.some((m) => m.type === "italic")
                ? "italic"
                : "normal",
              textDecoration: node.marks?.some((m) => m.type === "underline")
                ? "underline"
                : "none",
            }}
          >
            {node.text}
          </span>
        );
    }
  };
  return (
    <div className="rich-text-preview">{rich ? render(rich, 0) : value}</div>
  );
}
export function CardTextPreview({ card }: { card: RichCardText }) {
  return (
    <div className="card-text-preview">
      <div className="card-rich-title">
        <RichTextView value={card.title} rich={card.titleRich} />
      </div>
      <RichTextView value={card.body} rich={card.bodyRich} />
    </div>
  );
}
