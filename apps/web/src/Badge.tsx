import type { ReactNode } from "react";

/**
 * Badges are told apart by text and border style, never by color:
 * solid, dashed, dotted, faint (light border) or bold (thick border).
 */
export type BadgeStyle = "solid" | "dashed" | "dotted" | "faint" | "faint-dashed" | "bold";

export function Badge({ style, title, children }: { style: BadgeStyle; title?: string; children: ReactNode }) {
  return (
    <span className={`badge badge-${style}`} title={title}>
      {children}
    </span>
  );
}
