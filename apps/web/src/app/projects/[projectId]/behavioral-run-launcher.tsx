"use client";

export function BehavioralRunLauncher({
  disabled,
  isStarting,
  onStart,
  version,
}: Readonly<{
  disabled: boolean;
  isStarting: boolean;
  onStart: (variantKey: string) => void;
  version: number;
}>) {
  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("variant_key");
    if (typeof value === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(value)) {
      onStart(value);
    }
  }

  return (
    <form className="behavioral-launcher" onSubmit={submit}>
      <div>
        <p className="eyebrow">Synthetic behavioral pressure test</p>
        <h4>Run governed behavioral simulation</h4>
        <p className="field-note">
          Deterministic synthetic agents only. Scores are experimental
          heuristics—not observed people, lift, or a population forecast.
        </p>
      </div>
      <label htmlFor={`variant-key-${version}`}>Variant key</label>
      <input
        autoComplete="off"
        defaultValue="baseline"
        disabled={disabled || isStarting}
        id={`variant-key-${version}`}
        maxLength={64}
        name="variant_key"
        pattern="[a-z][a-z0-9_]{0,63}"
        required
      />
      <button disabled={disabled || isStarting} type="submit">
        {isStarting ? "Starting behavioral run…" : `Test version ${version}`}
      </button>
    </form>
  );
}
