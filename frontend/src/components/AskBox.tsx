import { useState } from "react";
import { api } from "../api";
import type { AiAnswer } from "../types";

/** Answers come only from server-held evidence: the client sends ids, never figures. */
export function AskBox({ reportId, segmentIds, placeholder }: { reportId?: string; segmentIds?: string[]; placeholder: string }) {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<AiAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(question?: string) {
    setBusy(true);
    setError(null);
    try {
      setAnswer(await api.ask({ report_id: reportId, segment_ids: segmentIds, question }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 text-sm">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(q.trim() || undefined);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="bg-tar border-line/60 focus:border-sign min-w-0 flex-1 rounded border px-2 py-1 outline-none"
        />
        <button className="btn" disabled={busy}>
          {busy ? "Thinking" : "Ask AI"}
        </button>
      </form>
      {error && <p className="text-severe mt-2">{error}</p>}
      {answer && (
        <div className="bg-tar mt-2 rounded p-2">
          <p className="whitespace-pre-wrap">{answer.text}</p>
          <p className="text-muted mt-2 text-xs">
            AI interpretation by {answer.provider} / {answer.model}. Figures above in this panel are the computed ones.
          </p>
          {answer.unverified_numbers.length > 0 && (
            <p className="text-heavy mt-1 text-xs font-bold">
              Warning: these numbers are not in the evidence, ignore them: {answer.unverified_numbers.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
