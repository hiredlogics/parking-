"use client";

import { useState, type ReactNode } from "react";

export interface TabDef {
  key: string;
  label: string;
  content: ReactNode;
}

export function Tabs({ tabs, initial }: { tabs: TabDef[]; initial?: string }) {
  const [active, setActive] = useState<string>(initial ?? tabs[0]?.key);
  const current = tabs.find((t) => t.key === active) ?? tabs[0];
  return (
    <div>
      <div className="mb-4 flex items-center gap-4 overflow-x-auto border-b border-brand-borderSoft">
        {tabs.map((t) => {
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              className={`whitespace-nowrap border-b-2 pb-3 pt-1 text-[13px] font-semibold uppercase tracking-wide transition ${
                isActive
                  ? "border-brand-pink text-brand-pink"
                  : "border-transparent text-brand-mute hover:text-brand-text"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div>{current?.content}</div>
    </div>
  );
}
