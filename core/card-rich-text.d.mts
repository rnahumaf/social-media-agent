export type RichNode = {
  type:
    | "doc"
    | "paragraph"
    | "text"
    | "hardBreak"
    | "bulletList"
    | "orderedList"
    | "listItem";
  text?: string;
  attrs?: { indent?: number; start?: number };
  marks?: { type: "bold" | "italic" | "underline" }[];
  content?: RichNode[];
};
export type RichCardText = {
  title: string;
  body: string;
  titleRich?: RichNode | null;
  bodyRich?: RichNode | null;
};
export function textDocument(text: string, bold?: boolean): RichNode;
export function richTextPlain(node: RichNode): string;
export function richTextBlocks(doc: RichNode): {
  indent: number;
  marker: string;
  markerSpace: string;
  spans: { text: string; bold: boolean; italic: boolean; underline: boolean }[];
}[];
export function cardText(card: RichCardText): RichCardText;
export function cardTextKey(card: RichCardText): string;
