import { useEffect, useMemo, useState } from "react";
import type { API, Revision } from "./types";
export type CardRender = {
  image?: string;
  error?: string;
  incomplete?: boolean;
};
export function useCardRender(revision: Revision, api: API) {
  const key = JSON.stringify([revision.cards, revision.style]);
  const keys = revision.cards.map((card, i) =>
    JSON.stringify([card, revision.style, i, revision.cards.length]),
  );
  const [result, setResult] = useState<{
    key: string;
    keys: string[];
    items: CardRender[];
  }>({ key: "", keys: [], items: [] });
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (!window.studio) return;
      api
        .previewCards({ cards: revision.cards, style: revision.style })
        .then((items: CardRender[]) => {
          if (active) setResult({ key, keys, items });
        })
        .catch((error: Error) => {
          if (active)
            setResult({
              key,
              keys,
              items: revision.cards.map(() => ({ error: error.message })),
            });
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key, api]);
  return useMemo(
    () =>
      result.key === key
        ? result.items
        : keys.map((itemKey, i) =>
            result.keys[i] === itemKey ? result.items[i] : {},
          ),
    [result, key],
  );
}
