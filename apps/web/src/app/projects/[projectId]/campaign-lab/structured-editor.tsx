"use client";

import { useId, useState } from "react";
import styles from "./workspace.module.css";

function labelFor(key: string) {
  return key
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function ValueField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  if (Array.isArray(value)) {
    return (
      <details
        className={styles.fieldGroup}
        onToggle={(event) => setExpanded(event.currentTarget.open)}
      >
        <summary>
          {label} <span>({value.length})</span>
        </summary>
        {expanded &&
          value.map((item, index) => (
            <div className={styles.arrayItem} key={index}>
              <ValueField
                label={`${label} ${index + 1}`}
                value={item}
                onChange={(next) =>
                  onChange(
                    value.map((current, position) =>
                      position === index ? next : current,
                    ),
                  )
                }
              />
              <button
                className="button-quiet"
                type="button"
                onClick={() =>
                  onChange(value.filter((_, position) => position !== index))
                }
              >
                Remove {label.toLowerCase()} {index + 1}
              </button>
            </div>
          ))}
        <button
          className="button-quiet"
          type="button"
          onClick={() =>
            onChange([
              ...value,
              typeof value[0] === "object" ? structuredClone(value[0]) : "",
            ])
          }
        >
          Add {label.toLowerCase()}
        </button>
      </details>
    );
  }
  if (value !== null && typeof value === "object") {
    return (
      <details
        className={styles.fieldGroup}
        onToggle={(event) => setExpanded(event.currentTarget.open)}
      >
        <summary>{label}</summary>
        <div className={styles.fields}>
          {expanded &&
            Object.entries(value)
              .filter(
                ([key]) =>
                  label !== "Configuration" ||
                  [
                    "panel_size",
                    "repetitions",
                    "rounds",
                    "random_seed",
                    "timeout_seconds",
                  ].includes(key),
              )
              .map(([key, item]) => (
                <ValueField
                  key={key}
                  label={labelFor(key)}
                  value={item}
                  onChange={(next) => onChange({ ...value, [key]: next })}
                />
              ))}
        </div>
      </details>
    );
  }
  if (typeof value === "boolean") {
    return (
      <label className={styles.checkField} htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={value}
          onChange={(event) => onChange(event.target.checked)}
        />
        {label}
      </label>
    );
  }
  if (
    typeof value === "string" &&
    /^(content|objective|description|methodology|collection methodology|privacy notice|consent text|license or usage rights)$/i.test(
      label,
    )
  ) {
    return (
      <div className={`${styles.field} ${styles.multiline}`}>
        <label htmlFor={id}>{label}</label>
        <textarea
          id={id}
          rows={3}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    );
  }
  return (
    <div className={styles.field}>
      <label htmlFor={id}>
        {label}
        {value === null ? " (optional)" : ""}
      </label>
      <input
        id={id}
        type={typeof value === "number" ? "number" : "text"}
        step={typeof value === "number" ? "any" : undefined}
        value={value === null ? "" : String(value)}
        onChange={(event) =>
          onChange(
            typeof value === "number"
              ? Number.isFinite(event.target.valueAsNumber)
                ? event.target.valueAsNumber
                : 0
              : event.target.value || (value === null ? null : ""),
          )
        }
      />
    </div>
  );
}

export function StructuredEditor({
  id,
  label,
  value,
  onChange,
  fields,
}: {
  id: string;
  fields?: readonly string[];
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  let parsed: unknown;
  let invalid = false;
  try {
    parsed = JSON.parse(value);
  } catch {
    invalid = true;
  }
  const update = (next: unknown) => onChange(JSON.stringify(next, null, 2));
  return (
    <fieldset className={styles.editor}>
      <legend>{label}</legend>
      {invalid ? (
        <p role="alert">
          The advanced data is invalid. Correct it below to restore the form.
        </p>
      ) : (
        <div className={styles.fields}>
          {parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (
            Object.entries(parsed)
              .filter(([key]) => !fields || fields.includes(key))
              .map(([key, item]) => (
                <ValueField
                  key={key}
                  label={labelFor(key)}
                  value={item}
                  onChange={(next) =>
                    update({ ...(parsed as object), [key]: next })
                  }
                />
              ))
          ) : (
            <ValueField label={label} value={parsed} onChange={update} />
          )}
        </div>
      )}
      <details className={styles.advanced} open={invalid || undefined}>
        <summary>Advanced: edit {label.toLowerCase()} as JSON</summary>
        <label htmlFor={id}>{label} JSON</label>
        <textarea
          id={id}
          rows={10}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
        />
      </details>
    </fieldset>
  );
}
