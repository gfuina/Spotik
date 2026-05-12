"use client";

import { useCallback, useEffect, useState } from "react";
import type { SpotCommentRow } from "@/types/spotComment";

type Props = {
  sourceId: number;
};

function formatFr(iso: string) {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function StarsDisplay({ value }: { value: number }) {
  return (
    <span
      className="inline-flex gap-px font-mono text-base leading-none text-spotik-orange"
      aria-label={`${value} sur 5`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= value ? "text-spotik-orange" : "text-spotik-border"}>
          ★
        </span>
      ))}
    </span>
  );
}

function StarsPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="mb-2">
      <span className="spotik-label mb-1 block">NOTE /5</span>
      <div className="flex gap-0 border border-spotik-border" role="group" aria-label="Note sur 5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`min-h-11 min-w-0 flex-1 border-r border-spotik-border py-2 font-mono text-lg leading-none last:border-r-0 ${
              n <= value ? "bg-spotik-orange text-black" : "bg-black text-spotik-muted hover:bg-white/5"
            }`}
            aria-pressed={n <= value}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

export function SpotComments({ sourceId }: Props) {
  const [comments, setComments] = useState<SpotCommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [rating, setRating] = useState(5);
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/spots/${sourceId}/comments`);
      const data = (await res.json()) as {
        comments?: SpotCommentRow[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? res.statusText);
        setComments([]);
        return;
      }
      setComments(data.comments ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [sourceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || posting) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/spots/${sourceId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, rating }),
      });
      const data = (await res.json()) as {
        comment?: SpotCommentRow;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? res.statusText);
        return;
      }
      if (data.comment) {
        setComments((prev) => [data.comment!, ...prev]);
        setDraft("");
        setRating(5);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="mt-4 border-t border-spotik-border pt-4">
      <p className="spotik-label mb-2">NOTES · COMMUNAUTÉ</p>
      <p className="mb-3 font-mono text-[10px] leading-relaxed text-spotik-muted">
        Pas de compte : tout le monde lit et écrit les mêmes notes pour ce spot. Note sur 5 + commentaire.
      </p>

      {error ? (
        <p className="mb-2 border border-red-600/80 bg-black px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-red-500">
          {error}
        </p>
      ) : null}

      <div className="mb-3 max-h-40 overflow-y-auto border border-spotik-border bg-black">
        {loading ? (
          <p className="p-3 font-mono text-[10px] uppercase tracking-widest text-spotik-muted">
            Chargement…
          </p>
        ) : comments.length === 0 ? (
          <p className="p-3 font-mono text-[10px] uppercase tracking-widest text-spotik-muted">
            Aucune note pour l’instant.
          </p>
        ) : (
          <ul className="divide-y divide-spotik-border">
            {comments.map((c) => (
              <li key={c.id} className="px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-mono text-[9px] uppercase tracking-widest text-spotik-orange">
                    {formatFr(c.createdAt)}
                  </div>
                  {c.rating != null ? (
                    <StarsDisplay value={c.rating} />
                  ) : (
                    <span className="font-mono text-[9px] text-spotik-muted">— /5</span>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words font-mono text-xs leading-snug text-white">
                  {c.text}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <StarsPicker value={rating} onChange={setRating} />

      <label className="spotik-label mb-1 block">COMMENTAIRE</label>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={2000}
        rows={3}
        placeholder="Barres neuves, eau, horaires…"
        className="mb-2 w-full resize-y border border-spotik-border bg-black px-2 py-2 font-mono text-xs text-white placeholder:text-spotik-muted focus:border-spotik-orange focus:outline-none"
      />
      <button
        type="button"
        disabled={posting || !draft.trim()}
        onClick={() => void submit()}
        className="spotik-btn w-full disabled:cursor-not-allowed disabled:opacity-40"
      >
        {posting ? "ENVOI…" : "PUBLIER"}
      </button>
    </div>
  );
}
