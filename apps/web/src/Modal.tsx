import { useEffect, useId, useRef, type ReactNode } from "react";

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement;
    const panel = panelRef.current;
    const field = panel?.querySelector<HTMLElement>("input, select, textarea");
    const fallback = panel?.querySelector<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])");
    (field ?? fallback)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previous instanceof HTMLElement) {
        previous.focus();
      }
    };
  }, [onClose]);

  return (
    <div className="modal-root" role="presentation">
      <button className="modal-backdrop" type="button" aria-label="Close dialog" onClick={onClose} />
      <div
        ref={panelRef}
        className="modal-panel card stack"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button className="secondary modal-close" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
