import { useEffect, useState, type CSSProperties } from "react";
import {
  Plus,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  ImagePlus,
} from "lucide-react";
import type { API, Card, CardStyle, Revision, State } from "./types";
import { defaultStyle } from "./editorial";
import { useCardRender, type CardRender } from "./useCardRender";
import CardTextEditor, { CardTextPreview } from "./CardTextEditor";

export function CardPreviews({
  revision,
  api,
  onRendered,
}: {
  revision: Revision;
  api: API;
  onRendered?: (id: string) => void;
}) {
  const items = useCardRender(revision, api);
  useEffect(() => {
    const valid =
      items.length === revision.cards.length &&
      items.every((item) => item.image && !item.incomplete && !item.error);
    onRendered?.(valid ? revision.id : "");
  }, [items, revision.id, revision.cards.length, onRendered]);
  return <CardPreviewList revision={revision} items={items} />;
}
function CardPreviewList({
  revision,
  items,
  selected,
  onSelect,
  focusOnly,
}: {
  revision: Revision;
  items: CardRender[];
  selected?: number;
  onSelect?: (n: number) => void;
  focusOnly?: number;
}) {
  const style = revision.style || defaultStyle;
  const fontScale = style.fontScale ?? 1;
  return (
    <>
      <div
        className={
          onSelect
            ? "card-thumbnails"
            : focusOnly !== undefined
              ? "selected-card-preview"
              : "review-cards"
        }
      >
        {revision.cards.map((card, i) => {
          if (focusOnly !== undefined && focusOnly !== i) return null;
          const content = window.studio ? (
            items[i]?.image ? (
              <img src={items[i].image} alt={`Card ${i + 1}: ${card.title}`} />
            ) : (
              <div
                className={
                  items[i]?.error ? "card-render-error" : "card-placeholder"
                }
                role={items[i]?.error ? "alert" : undefined}
              >
                Card {i + 1}
                {items[i]?.error && <p>{items[i].error}</p>}
              </div>
            )
          ) : (
            <div
              className="preview-card"
              style={
                {
                  background: style.background,
                  color: style.textColor,
                  fontFamily: style.font === "serif" ? "Georgia" : "Arial",
                  "--card-font-scale": fontScale,
                } as CSSProperties
              }
            >
              <small>{style.signature}</small>
              <div
                style={
                  { "--card-title-color": style.titleColor } as CSSProperties
                }
              >
                <CardTextPreview card={card} />
              </div>
              <small>
                {i + 1} / {revision.cards.length}
              </small>
            </div>
          );
          return onSelect ? (
            <button
              key={i}
              className={i === selected ? "selected" : ""}
              aria-label={`Editar card ${i + 1}`}
              aria-pressed={i === selected}
              onClick={() => onSelect(i)}
            >
              {content}
              <span>Card {i + 1}</span>
            </button>
          ) : (
            <div key={i}>{content}</div>
          );
        })}
      </div>
    </>
  );
}
export default function CardEditor({
  revision,
  onChange,
  api,
  act,
  busy,
  readOnly,
  state,
  rewrite,
}: {
  revision: Revision;
  onChange: (r: Revision) => void;
  api: API;
  act: (n: string, p?: any) => Promise<any>;
  busy: boolean;
  readOnly: boolean;
  state: State;
  rewrite: (target: "caption" | "card", index?: number) => void;
}) {
  const [index, setIndex] = useState(0);
  const items = useCardRender(revision, api);
  useEffect(
    () => setIndex((n) => Math.min(n, Math.max(0, revision.cards.length - 1))),
    [revision.cards.length],
  );
  const card = revision.cards[index],
    style = revision.style || defaultStyle,
    fontScale = style.fontScale ?? 1;
  const changeCard = (changes: Partial<Card>) =>
    onChange({
      ...revision,
      cards: revision.cards.map((c, i) =>
        i === index ? { ...c, ...changes } : c,
      ),
    });
  const updateStyle = (changes: Partial<CardStyle>) =>
    onChange({ ...revision, style: { ...style, ...changes } });
  const reorder = (delta: number) => {
    const list = [...revision.cards];
    [list[index], list[index + delta]] = [list[index + delta], list[index]];
    onChange({ ...revision, cards: list });
    setIndex(index + delta);
  };
  return (
    <div className="instagram-editor">
      <div className="social-actions">
        <span>{revision.cards.length} de 10 cards</span>
        <button
          disabled={readOnly || revision.cards.length >= 10}
          onClick={() => {
            onChange({
              ...revision,
              cards: [...revision.cards, { title: "", body: "" }],
            });
            setIndex(revision.cards.length);
          }}
        >
          <Plus size={16} />
          Adicionar card
        </button>
      </div>
      <CardPreviewList
        revision={revision}
        items={items}
        selected={index}
        onSelect={setIndex}
      />
      {card ? (
        <div className="card-workspace">
          <div className="active-card-preview">
            <CardPreviewList
              revision={revision}
              items={items}
              focusOnly={index}
            />
          </div>
          <div className="card-fields">
            <div className="split">
              <h3>Card {index + 1}</h3>
              <div className="actions">
                <button
                  aria-label="Mover card para cima"
                  disabled={readOnly || index === 0}
                  onClick={() => reorder(-1)}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  aria-label="Mover card para baixo"
                  disabled={readOnly || index === revision.cards.length - 1}
                  onClick={() => reorder(1)}
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  aria-label="Duplicar card"
                  disabled={readOnly || revision.cards.length >= 10}
                  onClick={() => {
                    const cards = [...revision.cards];
                    cards.splice(index + 1, 0, structuredClone(card));
                    onChange({ ...revision, cards });
                    setIndex(index + 1);
                  }}
                >
                  <Copy size={16} />
                </button>
                <button
                  aria-label="Remover card"
                  disabled={readOnly}
                  onClick={() =>
                    onChange({
                      ...revision,
                      cards: revision.cards.filter((_, i) => i !== index),
                    })
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <CardTextEditor
              key={`title-${index}`}
              value={card.title}
              rich={card.titleRich}
              title
              readOnly={readOnly}
              onChange={(title, titleRich) => changeCard({ title, titleRich })}
            />
            <CardTextEditor
              key={`body-${index}`}
              value={card.body}
              rich={card.bodyRich}
              readOnly={readOnly}
              onChange={(body, bodyRich) => changeCard({ body, bodyRich })}
            />
            <div className="actions">
              <button
                disabled={
                  readOnly || busy || (!card.title.trim() && !card.body.trim())
                }
                onClick={() => rewrite("card", index)}
              >
                Reescrever card com IA
              </button>
              <button
                disabled={readOnly || busy}
                onClick={async () => {
                  const image = await act("importImage");
                  if (image) {
                    onChange({
                      ...revision,
                      style: {
                        ...style,
                        layout:
                          style.layout === "text" ? "split" : style.layout,
                      },
                      cards: revision.cards.map((c, i) =>
                        i === index ? { ...c, image } : c,
                      ),
                    });
                  }
                }}
              >
                <ImagePlus size={16} />
                {card.image ? "Substituir imagem" : "Adicionar imagem"}
              </button>
              {card.image && (
                <button
                  disabled={readOnly}
                  onClick={() => changeCard({ image: undefined })}
                >
                  Remover imagem
                </button>
              )}
            </div>
            {card.image && (
              <fieldset disabled={readOnly}>
                <legend>Enquadramento da imagem</legend>
                {[
                  ["x", "Horizontal", 0, 100, 1],
                  ["y", "Vertical", 0, 100, 1],
                  ["zoom", "Zoom", 1, 3, 0.05],
                ].map(([key, label, min, max, step]) => (
                  <label key={key}>
                    {label}
                    <input
                      type="range"
                      aria-label={`${label} da imagem`}
                      min={min}
                      max={max}
                      step={step}
                      value={card.image![key as "x" | "y" | "zoom"]}
                      onChange={(e) =>
                        changeCard({
                          image: {
                            ...card.image!,
                            [key]: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </fieldset>
            )}
          </div>
          <details className="appearance-panel">
            <summary>Aparência</summary>
            <fieldset disabled={readOnly} className="style-editor">
              <legend>Estilo do carrossel</legend>
              <label>
                Modelo
                <select
                  value={style.layout}
                  onChange={(e) =>
                    updateStyle({
                      layout: e.target.value as CardStyle["layout"],
                    })
                  }
                >
                  <option value="text">Texto</option>
                  <option value="split">Imagem com texto</option>
                  <option value="background">Imagem de fundo</option>
                </select>
              </label>
              <div className="color-grid">
                {[
                  ["background", "Fundo"],
                  ["titleColor", "Título"],
                  ["textColor", "Texto"],
                  ["accent", "Destaque"],
                ].map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      aria-label={`Cor de ${label.toLowerCase()}`}
                      type="color"
                      value={style[key as "background"]}
                      onChange={(e) => updateStyle({ [key]: e.target.value })}
                    />
                  </label>
                ))}
              </div>
              <label>
                Tipografia
                <select
                  value={style.font}
                  onChange={(e) =>
                    updateStyle({ font: e.target.value as CardStyle["font"] })
                  }
                >
                  <option value="sans">Sem serifa</option>
                  <option value="serif">Com serifa</option>
                </select>
              </label>
              <label className="font-size-control">
                <span>
                  Tamanho da fonte
                  <output>{Math.round(fontScale * 100)}%</output>
                </span>
                <input
                  type="range"
                  aria-label="Tamanho da fonte"
                  min="0.85"
                  max="1.15"
                  step="0.05"
                  value={fontScale}
                  onChange={(e) =>
                    updateStyle({ fontScale: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Assinatura
                <input
                  maxLength={60}
                  value={style.signature}
                  onChange={(e) => updateStyle({ signature: e.target.value })}
                />
              </label>
              <button
                disabled={busy}
                onClick={() =>
                  act("settings", {
                    settings: { ...state.settings, cardStyle: style },
                  })
                }
              >
                Salvar como meu padrão
              </button>
              <button
                onClick={() =>
                  onChange({
                    ...revision,
                    style: state.settings.cardStyle || defaultStyle,
                  })
                }
              >
                Usar meu padrão
              </button>
            </fieldset>
          </details>
        </div>
      ) : (
        <p className="inline-note">
          Adicione o primeiro card para começar. Você pode escrever e usar suas
          imagens sem IA.
        </p>
      )}
      <label className="caption-field">
        Legenda do Instagram
        <textarea
          value={revision.caption}
          maxLength={2200}
          readOnly={readOnly}
          onChange={(e) => onChange({ ...revision, caption: e.target.value })}
        />
        <small>{revision.caption.length}/2.200</small>
      </label>
      <button
        disabled={readOnly || busy || !revision.caption.trim()}
        onClick={() => rewrite("caption")}
      >
        Reescrever legenda com IA
      </button>
    </div>
  );
}
