"use client";

import { useEffect, useState } from "react";
import type { AnswerValue } from "@/lib/facts/types";
import type { Question } from "@/lib/questions/types";

/**
 * Generic renderer for one adaptive question.
 *
 * Situation (Q-WHAT-HAPPENED) is multi-select so customers can raise
 * several grounds; follow-ups then run for each selected tag.
 */
export function AdaptiveQuestion({
  question,
  busy,
  onSubmit,
}: {
  question: Question;
  busy: boolean;
  onSubmit: (value: AnswerValue, meta?: { situation_other?: string }) => void;
}) {
  const [text, setText] = useState("");
  const [choice, setChoice] = useState<string | null>(null);
  const [multi, setMulti] = useState<string[]>([]);
  const [numValue, setNumValue] = useState<string>("");
  const [otherText, setOtherText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isSituation = question.questionId === "Q-WHAT-HAPPENED";

  useEffect(() => {
    setText("");
    setChoice(null);
    setMulti([]);
    setNumValue("");
    setOtherText("");
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

    if (isSituation && multi.includes("other_grounds") && !otherText.trim()) {
      setError("Please briefly describe what happened.");
      return;
    }

    const empty =
      value === null ||
      (typeof value === "string" && value.trim() === "") ||
      (Array.isArray(value) && value.length === 0);

    if (question.required && empty) {
      setError("Please answer this question to continue.");
      return;
    }
    onSubmit(
      value,
      isSituation && multi.includes("other_grounds")
        ? { situation_other: otherText.trim() }
        : undefined,
    );
  };

  const pickMulti = (v: string) => {
    setMulti((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    );
  };

  return (
    <div data-testid="adaptive-question">
      <div className="text-center sm:text-left">
        <h1
          className="text-[22px] font-bold leading-tight tracking-tight text-brand-text sm:text-[26px]"
          data-testid="question-label"
        >
          {question.label}
        </h1>
        {question.helpText && (
          <p className="mt-2 text-[14px] leading-relaxed text-brand-mute">
            {question.helpText}
          </p>
        )}
      </div>

      <div className="mt-6 space-y-2.5">
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
                className={[
                  "flex w-full items-center gap-3 rounded-xl border bg-white px-4 py-3.5 text-left text-[14px] transition",
                  active
                    ? "border-brand-pink bg-brand-pinkPale"
                    : "border-brand-border hover:border-brand-pink/50",
                ].join(" ")}
              >
                <span
                  className={[
                    "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                    active ? "border-brand-pink" : "border-[#D1D5DB]",
                  ].join(" ")}
                >
                  {active && <span className="h-2.5 w-2.5 rounded-full bg-brand-pink" />}
                </span>
                <span className="font-medium text-brand-text">{opt.label}</span>
              </button>
            );
          })}

        {question.type === "multi_choice" &&
          (question.options ?? []).map((opt) => {
            const active = multi.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => pickMulti(opt.value)}
                aria-pressed={active}
                className={[
                  "flex w-full items-center gap-3 rounded-xl border bg-white px-4 py-3.5 text-left text-[14px] transition",
                  active
                    ? "border-brand-pink bg-brand-pinkPale"
                    : "border-brand-border hover:border-brand-pink/50",
                ].join(" ")}
              >
                <span
                  className={[
                    "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border-2",
                    active
                      ? "border-brand-pink bg-brand-pink text-white"
                      : "border-[#D1D5DB]",
                  ].join(" ")}
                >
                  {active && (
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3 w-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        d="M5 12l4.5 4.5L20 6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <span className="font-medium text-brand-text">{opt.label}</span>
              </button>
            );
          })}

        {isSituation && multi.includes("other_grounds") && (
          <textarea
            className="mt-1 w-full rounded-xl border border-brand-border bg-white px-3.5 py-2.5 text-[14px] text-brand-text placeholder:text-brand-mute/60 focus:border-brand-pink focus:outline-none focus:ring-2 focus:ring-brand-pink/30"
            rows={3}
            placeholder="Please briefly describe what happened"
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
          />
        )}

        {(question.type === "short_text" ||
          question.type === "long_text" ||
          question.type === "date" ||
          question.type === "time") && (
          <input
            className="w-full rounded-xl border border-brand-border bg-white px-3.5 py-2.5 text-[14px] focus:border-brand-pink focus:outline-none focus:ring-2 focus:ring-brand-pink/30"
            type={
              question.type === "date"
                ? "date"
                : question.type === "time"
                  ? "time"
                  : "text"
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        )}

        {question.type === "number" && (
          <input
            className="w-full rounded-xl border border-brand-border bg-white px-3.5 py-2.5 text-[14px] focus:border-brand-pink focus:outline-none focus:ring-2 focus:ring-brand-pink/30"
            type="number"
            value={numValue}
            onChange={(e) => setNumValue(e.target.value)}
            min={question.min}
            max={question.max}
          />
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-[13px] font-medium text-red-700">
          {error}
        </p>
      )}

      <div className="mt-8">
        <button
          type="button"
          data-testid="question-continue"
          disabled={busy}
          onClick={submit}
          className="flex w-full items-center justify-center rounded-xl bg-brand-pink px-5 py-3.5 text-[15px] font-semibold text-white shadow-sm transition hover:bg-brand-pinkDark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Saving…" : "Continue"}
        </button>
      </div>
    </div>
  );
}
