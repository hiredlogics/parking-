"use client";

import { useEffect, useState } from "react";
import type { AnswerValue, Question } from "@/lib/questions/types";

/**
 * Generic renderer for one adaptive question.
 *
 * The component knows nothing about routes, rules or legal reasoning —
 * it renders whatever the engine sends, per the question JSON contract.
 */
export function AdaptiveQuestion({
  question,
  busy,
  onSubmit,
}: {
  question: Question;
  busy: boolean;
  onSubmit: (value: AnswerValue) => void;
}) {
  const [text, setText] = useState("");
  const [choice, setChoice] = useState<string | null>(null);
  const [multi, setMulti] = useState<string[]>([]);
  const [numValue, setNumValue] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Reset local state whenever a new question arrives.
  useEffect(() => {
    setText("");
    setChoice(null);
    setMulti([]);
    setNumValue("");
    setError(null);
  }, [question.questionId]);

  const submit = () => {
    setError(null);
    let value: AnswerValue = null;

    switch (question.type) {
      case "single_choice":
        value = choice;
        break;
      case "multi_choice":
        value = multi;
        break;
      case "boolean":
        value = choice === "true" ? true : choice === "false" ? false : null;
        break;
      case "number": {
        if (numValue.trim() === "") {
          value = null;
        } else {
          const n = Number(numValue);
          if (Number.isNaN(n)) {
            setError("Please enter a number.");
            return;
          }
          value = n;
        }
        break;
      }
      default:
        value = text;
    }

    const empty =
      value === null ||
      (typeof value === "string" && value.trim() === "") ||
      (Array.isArray(value) && value.length === 0);

    if (question.required && empty) {
      setError("Please answer this question to continue.");
      return;
    }
    onSubmit(value);
  };

  const toggleMulti = (v: string) => {
    setMulti((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    );
  };

  return (
    <div className="app-card">
      <h1 className="text-[20px] font-black leading-snug tracking-tight sm:text-[24px]">
        {question.label}
      </h1>
      {question.helpText && (
        <p className="mt-2 text-[13.5px] leading-relaxed text-brand-mute">
          {question.helpText}
        </p>
      )}

      <div className="mt-5 space-y-2.5">
        {/* Choice-style inputs */}
        {(question.type === "single_choice" || question.type === "boolean") &&
          (question.type === "boolean"
            ? [
                { value: "true", label: "Yes" },
                { value: "false", label: "No" },
              ]
            : (question.options ?? [])
          ).map((opt) => {
            const active = choice === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setChoice(opt.value)}
                aria-pressed={active}
                className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-[14px] transition ${
                  active
                    ? "border-brand-pink bg-brand-pinkPale text-brand-text"
                    : "border-brand-border bg-white text-brand-text hover:border-brand-pink/50"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 inline-flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border-2 ${
                    active ? "border-brand-pink" : "border-brand-border"
                  }`}
                  style={{ height: 18, width: 18 }}
                >
                  {active && (
                    <span className="h-2 w-2 rounded-full bg-brand-pink" />
                  )}
                </span>
                <span>
                  <span className="font-medium">{opt.label}</span>
                  {"hint" in opt && opt.hint && (
                    <span className="mt-0.5 block text-[12.5px] text-brand-mute">
                      {opt.hint}
                    </span>
                  )}
                </span>
              </button>
            );
          })}

        {/* Multi-select */}
        {question.type === "multi_choice" &&
          (question.options ?? []).map((opt) => {
            const active = multi.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleMulti(opt.value)}
                aria-pressed={active}
                className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-[14px] transition ${
                  active
                    ? "border-brand-pink bg-brand-pinkPale text-brand-text"
                    : "border-brand-border bg-white text-brand-text hover:border-brand-pink/50"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 inline-flex shrink-0 items-center justify-center rounded border-2 ${
                    active
                      ? "border-brand-pink bg-brand-pink text-white"
                      : "border-brand-border bg-white"
                  }`}
                  style={{ height: 18, width: 18 }}
                >
                  {active && (
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3 w-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12l4.5 4.5L20 6" />
                    </svg>
                  )}
                </span>
                <span className="font-medium">{opt.label}</span>
              </button>
            );
          })}

        {/* Text inputs */}
        {(question.type === "short_text" ||
          question.type === "date" ||
          question.type === "time") && (
          <input
            className="app-input"
            type={
              question.type === "date"
                ? "date"
                : question.type === "time"
                  ? "time"
                  : "text"
            }
            value={text}
            placeholder={question.placeholder}
            onChange={(e) => setText(e.target.value)}
          />
        )}

        {question.type === "long_text" && (
          <textarea
            className="app-input min-h-28"
            rows={4}
            value={text}
            placeholder={question.placeholder}
            onChange={(e) => setText(e.target.value)}
          />
        )}

        {question.type === "number" && (
          <input
            className="app-input"
            type="number"
            inputMode="numeric"
            min={question.min}
            max={question.max}
            value={numValue}
            onChange={(e) => setNumValue(e.target.value)}
          />
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800"
        >
          {error}
        </div>
      )}

      <div className="mt-6 flex items-center justify-end gap-3">
        {!question.required && (
          <button
            type="button"
            onClick={() => onSubmit(question.type === "multi_choice" ? [] : null)}
            disabled={busy}
            className="btn-brand-ghost"
          >
            None of these
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="btn-brand-primary"
          data-testid="question-continue"
        >
          {busy ? "Saving…" : "Continue"}
        </button>
      </div>
    </div>
  );
}
