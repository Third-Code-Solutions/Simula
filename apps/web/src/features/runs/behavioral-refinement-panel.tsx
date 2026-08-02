function defaultRefinedVariant(sourceVariant: string): string {
  const candidate = `${sourceVariant}_refined`;
  return /^[a-z][a-z0-9_]{0,63}$/.test(candidate) ? candidate : "refined";
}

export function BehavioralRefinementPanel({
  error,
  isSubmitting,
  onSubmit,
  sourceVariant,
}: Readonly<{
  error?: string;
  isSubmitting: boolean;
  onSubmit: (content: string, variantKey: string) => void;
  sourceVariant: string;
}>) {
  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const content = form.get("content");
    const variantKey = form.get("variant_key");
    if (
      typeof content === "string" &&
      typeof variantKey === "string" &&
      content.length >= 1 &&
      content.length <= 5_000 &&
      /^[a-z][a-z0-9_]{0,63}$/.test(variantKey)
    ) {
      onSubmit(content, variantKey);
    }
  }

  return (
    <section
      aria-labelledby="behavioral-refinement-title"
      className="panel behavioral-refinement"
    >
      <p className="eyebrow">Iterative synthetic check</p>
      <h2 id="behavioral-refinement-title">Refine and retest</h2>
      <p className="field-note" id="behavioral-refinement-disclosure">
        This creates a new immutable stimulus version and a separate synthetic
        run. The source version and report remain unchanged. Do not enter
        personal or sensitive data.
      </p>
      {error === undefined ? null : (
        <p className="problem" role="alert">
          {error}
        </p>
      )}
      <form className="form-stack" onSubmit={submit}>
        <label htmlFor="behavioral-refinement-content">Refined message</label>
        <textarea
          aria-describedby="behavioral-refinement-disclosure"
          disabled={isSubmitting}
          id="behavioral-refinement-content"
          maxLength={5000}
          name="content"
          required
          rows={7}
        />
        <label htmlFor="behavioral-refinement-variant">Variant key</label>
        <input
          autoComplete="off"
          defaultValue={defaultRefinedVariant(sourceVariant)}
          disabled={isSubmitting}
          id="behavioral-refinement-variant"
          maxLength={64}
          name="variant_key"
          pattern="[a-z][a-z0-9_]{0,63}"
          required
        />
        <button disabled={isSubmitting} type="submit">
          {isSubmitting
            ? "Creating immutable revision…"
            : "Create revision and run retest"}
        </button>
      </form>
      <p className="field-note">
        A matched comparison remains available only when both runs satisfy the
        frozen-design checks. This workflow does not declare a winner or lift.
      </p>
    </section>
  );
}
