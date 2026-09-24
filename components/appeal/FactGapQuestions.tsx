"use client";

import { useCallback, useEffect, useState } from "react";
import {
  answerFactGap,
  fetchFactGap,
  type FactQuestionView,
} from "@/features/appeal/caseSync";

/**
 * One question at a time, chosen by the system.
 *
 * WHAT THE CUSTOMER IS AND IS NOT ASKED
 * -------------------------------------
 * There is no list of appeal reasons here. The grounds are worked out
 * from the notice and from what the customer says happened, and this
 * only ever asks for a specific missing fact that an already-active
 * issue requires — see lib/facts/gapResolver.ts. The customer is never
 * put in the position of choosing a legal argument, which is the job
 * they are paying not to have to do.
 *
 * The identified issues are shown, in plain language, so the page is
 * legible rather than mysterious. They are output, not input: there is
 * nothing to tick.
 *
 * Every question may be skipped. "I'm not sure" is a real answer to a
 * question about something that happened weeks ago, and a fact left
 * unresolved simply drops the grounds that needed it rather than
 * blocking the appeal.
 */
export function FactGapQuestions({
  caseId,
  onComplete,
  onAnswered,
}: {
  caseId: string;
  onComplete?: () => void;
  /** Fired after each saved answer, so the page can refresh its own view. */
  onAnswered?: () => void;
}) {
  const [view, setView] = useState<FactQuestionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Draft answer for the question on screen.
  const [text, setText] = useState("");
  const [choices, setChoices] = useState<string[]>([]);

  const load = useCallback(async () => {
    const res = await fetchFactGap(caseId);
    if (!res.ok) {
      /*
       * A case that is not yet confirmed has no issues to ask about.
       * That is a sequencing fact, not an error worth showing.
       */
      if (res.code !== "NOT_CONFIRMED") setError(res.message);
      setLoading(false);
      return;
    }
    setView(res.data);
    setLoading(false);
    if (res.data.complete) onComplete?.();
  }, [caseId, onComplete]);

  useEffect(() => {
    void load();
  }, [load]);

  const question = view?.question ?? null;

  const submit = async (value: string | string[] | number | boolean | null) => {
    if (!question) return;
    setSaving(true);
    setError(null);
    const res = await answerFactGap(caseId, question.factKey, value);
    setSaving(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setText("");
    setChoices([]);
    setView(res.data);
    onAnswered?.();
    if (res.data.complete) onComplete?.();
  };

  /** Turn the draft into the shape this fact accepts. */
  const submitDraft = () => {
    if (!question) return;
    if (question.valueType === "MULTI_ENUM") {
      return submit(choices.length > 0 ? choices : null);
    }
    const trimmed = text.trim();
    if (trimmed.length === 0) return submit(null);
    if (question.valueType === "NUMBER") {
      const n = Number(trimmed);
      if (!Number.isFinite(n)) {
        setError("Please enter a number.");
        return;
      }
      return submit(n);
    }
    return submit(trimmed);
  };

  if (loading) {
    return (
      <section className="mb-6 rounded-2xl border border-brand-border bg-brand-canvas p-4 sm:p-5">
        <p className="text-[13px] text-brand-mute">Working out what else we need…</p>
      </section>
    );
  }

  if (!view) return null;

  return (
    <section
      className="mb-6 rounded-2xl border border-brand-border bg-brand-canvas p-4 sm:p-5"
      data-testid="fact-gap-section"
    >
      {view.issues.length > 0 && (
        <div className="mb-4">
          <p className="text-[13px] font-semibold text-brand-text">
            From your notice, we&apos;re looking at:
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {view.issues.map((i) => (
              <li
                key={i.code}
                data-testid={`fact-gap-issue-${i.code}`}
                className="rounded-full bg-brand-pinkPale px-3 py-1 text-[12px] font-medium text-brand-text"
              >
                {i.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p role="alert" data-testid="fact-gap-error" className="mb-3 text-[13px] font-medium text-red-700">
          {error}
        </p>
      )}

      {!question && (
        <p className="text-[13px] leading-relaxed text-brand-mute" data-testid="fact-gap-complete">
          Thanks — we have what we need to prepare your appeal.
        </p>
      )}

      {question && (
        <div data-testid={`fact-gap-question-${question.factKey}`}>
          <h2 className="text-[16px] font-bold leading-snug text-brand-text">
            {question.text}
          </h2>
          {question.help && (
            <p className="mt-1 text-[13px] leading-relaxed text-brand-mute">
              {question.help}
            </p>
          )}

          {question.options.length > 0 ? (
            <fieldset className="mt-3 space-y-2">
              <legend className="sr-only">{question.text}</legend>
              {question.options.map((opt) => {
                const multi = question.valueType === "MULTI_ENUM";
                const checked = multi
                  ? choices.includes(opt)
                  : text === opt;
                return (
                  <label
                    key={opt}
                    className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-brand-border bg-white px-3 py-2.5 text-[14px] text-brand-text"
                  >
                    <input
                      type={multi ? "checkbox" : "radio"}
                      name={question.factKey}
                      value={opt}
                      checked={checked}
                      data-testid={`fact-gap-option-${opt}`}
                      onChange={() => {
                        if (multi) {
                          setChoices((prev) =>
                            prev.includes(opt)
                              ? prev.filter((p) => p !== opt)
                              : [...prev, opt],
                          );
                        } else {
                          setText(opt);
                        }
                      }}
                      className="h-4 w-4 accent-brand-pink"
                    />
                    {humanise(opt)}
                  </label>
                );
              })}
            </fieldset>
          ) : (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={question.valueType === "STRING" ? 3 : 1}
              data-testid="fact-gap-input"
              className="mt-3 w-full rounded-xl border border-brand-border bg-white px-3 py-2.5 text-[14px] text-brand-text"
              placeholder="Your answer"
            />
          )}

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => void submit(null)}
              disabled={saving}
              data-testid="fact-gap-skip"
              className="text-[13px] font-medium text-brand-mute underline disabled:opacity-50"
            >
              I&apos;m not sure
            </button>
            <button
              type="button"
              onClick={() => void submitDraft()}
              disabled={saving}
              data-testid="fact-gap-submit"
              className="btn-brand-primary disabled:opacity-50"
            >
              {saving ? "Saving…" : "Continue"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Fact vocabularies are machine values ("mechanical_failure",
 * "ATTEMPTED_FAILED"). Presenting them raw would undo the point of
 * generating readable questions.
 */
function humanise(value: string): string {
  const spaced = value.replace(/[_-]+/g, " ").trim().toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
