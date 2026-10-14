import { useEffect, useState } from "react";

function parse(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/**
 * A number field that lets you clear it and retype. It tells the parent only
 * about valid values (or null when emptied and `nullable`), and on leaving the
 * field snaps back to the last valid value.
 */
export function NumberInput({
  id,
  label,
  value,
  onChange,
  nullable,
  min,
  max,
  placeholder,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  /** Whether the field may be empty (meaning "no value"). */
  nullable: boolean;
  min?: number;
  max?: number;
  placeholder?: string;
}) {
  const show = (v: number | null) => (v === null ? "" : String(v));
  const [text, setText] = useState(show(value));

  // Follow outside changes, such as "Clear filters", without fighting the user's typing.
  useEffect(() => {
    setText((current) => (parse(current) === value ? current : show(value)));
  }, [value]);

  return (
    <label className="number-field" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        placeholder={placeholder}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          const parsed = parse(event.target.value);
          if (parsed !== null) onChange(parsed);
          else if (nullable && event.target.value.trim() === "") onChange(null);
        }}
        onBlur={() => setText(show(value))}
      />
    </label>
  );
}
