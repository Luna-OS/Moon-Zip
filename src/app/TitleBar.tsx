import type { ReactNode } from "react";
import { TITLE_BAR_HEIGHT } from "../theme/frame-colors";

/**
 * The 40px custom title bar of the frameless window (Moon Explorer's and Moon Browser's): the logo,
 * the app name, whatever the view puts in the middle, and the free space on the right where the
 * native window buttons are drawn.
 */
export function TitleBar({ children, actions }: { children?: ReactNode; actions?: ReactNode }) {
  return (
    <header
      className="mz-titlebar relative z-10 flex shrink-0 items-center gap-3 pl-3"
      style={{ height: TITLE_BAR_HEIGHT, paddingRight: 146 }}
    >
      <img src="./moon-zip-logo.svg" alt="" width={22} height={22} draggable={false} />
      <span className="mz-title text-[0.9375rem] font-semibold tracking-tight">Moon Zip</span>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
      {actions && <div className="flex items-center gap-1">{actions}</div>}
    </header>
  );
}
