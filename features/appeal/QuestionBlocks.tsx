"use client";

import type { ReactNode } from "react";

/**
 * Light-theme question primitives used across the appeal questionnaire.
 * They avoid showing any internal identifiers (rule / paragraph / variable
 * names) to the customer.
 */

export function QuestionCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="app-card">
      <legend className="text-[14px] font-bold text-brand-text sm:text-[15px]">
        {title}
      </legend>
      {hint && <p className="mt-1 text-[13px] text-brand-mute">{hint}</p>}
      <div className="mt-4">{children}</div>
    </fieldset>
  );
}

export function ChoiceRow({
  name,
  value,
  onChange,
  options,
  testIdPrefix,
}: {
  name: string;
  value: string | undefined;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  testIdPrefix?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <label
            key={o.value}
            className={`app-tile ${active ? "app-tile-active" : ""}`}
          >
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={o.value}
              checked={active}
              data-testid={`${testIdPrefix ?? name}-${o.value}`}
              onChange={() => onChange(o.value)}
            />
            <span
              aria-hidden="true"
              className={`inline-block h-3.5 w-3.5 rounded-full border ${
                active ? "border-brand-pink bg-brand-pink" : "border-brand-border bg-white"
              }`}
            />
            {o.label}
          </label>
        );
      })}
    </div>
  );
}

export function CheckboxRow({
  values,
  onChange,
  options,
  testIdPrefix,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  options: Array<{ value: string; label: string }>;
  testIdPrefix: string;
}) {
  const toggle = (v: string) => {
    if (values.includes(v)) onChange(values.filter((x) => x !== v));
    else onChange([...values, v]);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = values.includes(o.value);
        return (
          <label
            key={o.value}
            className={`app-tile ${active ? "app-tile-active" : ""}`}
          >
            <input
              type="checkbox"
              className="sr-only"
              value={o.value}
              checked={active}
              data-testid={`${testIdPrefix}-${o.value}`}
              onChange={() => toggle(o.value)}
            />
            <span
              aria-hidden="true"
              className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${
                active
                  ? "border-brand-pink bg-brand-pink text-white"
                  : "border-brand-border bg-white"
              }`}
            >
              {active && (
                <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12l4 4L20 6" />
                </svg>
              )}
            </span>
            {o.label}
          </label>
        );
      })}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  testId,
  hint,
  type = "text",
}: {
  label: string;
  value: string | number | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  testId?: string;
  hint?: string;
  type?: "text" | "number";
}) {
  return (
    <div>
      <label className="app-label">{label}</label>
      <input
        className="app-input"
        type={type}
        placeholder={placeholder}
        value={value == null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
      />
      {hint && <p className="app-hint">{hint}</p>}
    </div>
  );
}

/**
 * Kept as an alias of QuestionCard for existing callers that used a
 * "RadioGroup" or "CheckboxGroup" wrapper. New code should use
 * QuestionCard + ChoiceRow / CheckboxRow directly.
 */
export function RadioGroup({
  name,
  label,
  value,
  onChange,
  options,
  hint,
}: {
  name: string;
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  hint?: string;
}) {
  return (
    <QuestionCard title={label} hint={hint}>
      <ChoiceRow name={name} value={value} onChange={onChange} options={options} testIdPrefix={`radio-${name}`} />
    </QuestionCard>
  );
}

export function CheckboxGroup({
  label,
  values,
  onChange,
  options,
  hint,
  testIdPrefix,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  options: Array<{ value: string; label: string }>;
  hint?: string;
  testIdPrefix: string;
}) {
  return (
    <QuestionCard title={label} hint={hint}>
      <CheckboxRow values={values} onChange={onChange} options={options} testIdPrefix={testIdPrefix} />
    </QuestionCard>
  );
}
