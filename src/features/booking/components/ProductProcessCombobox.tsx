import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Props<T> {
  placeholder: string;
  value: string;
  options: T[];
  getLabel: (option: T) => string;
  getSubtext?: (option: T) => string;
  onSelect: (option: T | null) => void;
  error?: boolean;
  inputClassName?: string;
}

export function ProductProcessCombobox<T>({
  placeholder,
  value,
  options,
  getLabel,
  getSubtext,
  onSelect,
  error,
  inputClassName = "",
}: Props<T>) {
  const [query, setQuery] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const closeMenu = () => {
    setIsOpen(false);
    setMenuRect(null);
  };

  const openMenu = () => {
    setMenuRect(inputRef.current?.getBoundingClientRect() ?? null);
    setIsOpen(true);
  };

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        closeMenu();
        setQuery(value);
      }
    };
    const handleScrollOrResize = () => {
      if (isOpen)
        setMenuRect(inputRef.current?.getBoundingClientRect() ?? null);
    };
    document.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [value, isOpen]);

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || query === value) return options.slice(0, 30);
    return options
      .filter((option) => {
        const label = getLabel(option).toLowerCase();
        const subtext = getSubtext ? getSubtext(option).toLowerCase() : "";
        return label.includes(q) || subtext.includes(q);
      })
      .slice(0, 30);
  }, [options, query, value, getLabel, getSubtext]);

  const menuWidth = menuRect ? Math.min(360, window.innerWidth - 16) : 0;
  const menuLeft = menuRect
    ? Math.max(8, Math.min(menuRect.left, window.innerWidth - menuWidth - 8))
    : 0;

  return (
    <div ref={rootRef} className="relative min-w-0 w-full">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(event) => {
          const val = event.target.value;
          setQuery(val);
          openMenu();
          if (value || !val) onSelect(null);
        }}
        onFocus={openMenu}
        className={`input-field text-sm ${inputClassName} ${error ? "input-field-error" : ""}`}
        placeholder={placeholder}
        autoComplete="off"
      />
      {isOpen &&
        menuRect &&
        createPortal(
          <div
            className="fixed z-[1000] max-h-80 overflow-auto rounded border border-[#d5c0d5] bg-white shadow-lg"
            style={{
              left: menuLeft,
              top: menuRect.bottom + 4,
              width: Math.max(menuRect.width, menuWidth),
            }}
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option, idx) => (
                <button
                  key={`${getLabel(option)}::${idx}`}
                  type="button"
                  className={`block w-full px-3 py-2 text-left text-xs hover:bg-[#f1ebf4] ${
                    getLabel(option) === value
                      ? "bg-[#fdf8ff] font-semibold"
                      : ""
                  }`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onSelect(option);
                    setQuery(getLabel(option));
                    closeMenu();
                  }}
                >
                  <span className="block truncate font-medium text-[#514253]">
                    {getLabel(option)}
                  </span>
                  {getSubtext && (
                    <span className="block truncate text-[#888888] text-xs mt-0.5">
                      {getSubtext(option)}
                    </span>
                  )}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-xs text-[#888888]">
                Không có kết quả
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
