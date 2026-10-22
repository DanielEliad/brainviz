import * as React from "react";
import { cn } from "@/lib/utils";

export interface SearchableSelectOption {
  value: string;
  label: string;
  searchText?: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Search...",
  disabled = false,
  className,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);
  const [position, setPosition] = React.useState({ top: 0, right: 0, width: 0 });
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  const filteredOptions = React.useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(lower) ||
        o.searchText?.toLowerCase().includes(lower)
    );
  }, [options, search]);

  React.useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredOptions.length]);

  React.useEffect(() => {
    if (isOpen && listRef.current) {
      const highlighted = listRef.current.children[highlightedIndex] as HTMLElement;
      if (highlighted) {
        highlighted.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex, isOpen]);

  // Update position when open, close on scroll
  React.useEffect(() => {
    if (!isOpen || !inputRef.current) return;

    const rect = inputRef.current.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
      width: rect.width,
    });

    const closeDropdown = (e: Event) => {
      // Don't close if scrolling inside the dropdown list
      if (listRef.current?.contains(e.target as Node)) {
        return;
      }
      setIsOpen(false);
      setSearch("");
      inputRef.current?.blur();
    };

    window.addEventListener("scroll", closeDropdown, true);
    window.addEventListener("resize", closeDropdown);
    return () => {
      window.removeEventListener("scroll", closeDropdown, true);
      window.removeEventListener("resize", closeDropdown);
    };
  }, [isOpen]);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setHighlightedIndex((i) => Math.min(i + 1, filteredOptions.length - 1));
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (isOpen && filteredOptions[highlightedIndex]) {
          onChange(filteredOptions[highlightedIndex].value);
          setIsOpen(false);
          setSearch("");
        } else if (!isOpen) {
          setIsOpen(true);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setSearch("");
        break;
    }
  };

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearch("");
    inputRef.current?.blur();
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <input
        ref={inputRef}
        type="text"
        value={isOpen ? search : selectedOption?.label ?? ""}
        onChange={(e) => {
          setSearch(e.target.value);
          if (!isOpen) setIsOpen(true);
        }}
        onFocus={() => {
          setIsOpen(true);
          setSearch("");
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "w-full h-7 rounded-md border border-input bg-background px-2 py-0.5 text-xs",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          selectedOption && !isOpen && "text-foreground",
          !selectedOption && !isOpen && "text-muted-foreground"
        )}
      />
      {value && !disabled && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      {isOpen && filteredOptions.length > 0 && (
        <ul
          ref={listRef}
          className="fixed z-[9999] max-h-60 overflow-auto rounded-md border border-input bg-popover shadow-lg"
          style={{ top: position.top, right: position.right, minWidth: position.width }}
        >
          {filteredOptions.map((option, index) => (
            <li
              key={option.value}
              onClick={() => handleSelect(option.value)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={cn(
                "px-2 py-1 text-xs cursor-pointer whitespace-nowrap",
                index === highlightedIndex && "bg-accent text-accent-foreground",
                option.value === value && "font-medium"
              )}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
      {isOpen && filteredOptions.length === 0 && (
        <div
          className="fixed z-[9999] rounded-md border border-input bg-popover p-2 text-sm text-muted-foreground shadow-lg whitespace-nowrap"
          style={{ top: position.top, right: position.right, minWidth: position.width }}
        >
          No results found
        </div>
      )}
    </div>
  );
}
