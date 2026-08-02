"use client";

import { useEffect, useRef, useState } from "react";

import {
  ApiProblem,
  STIMULUS_ASSET_MAX_BYTES,
  STIMULUS_ASSET_MEDIA_TYPES,
  type StimulusAsset,
  type StimulusAssetDownload,
  type StimulusAssetMediaType,
  type StimulusAssetReserveInput,
  type VisualStimulusProfileRecord,
  createStimulusVisualProfile,
  deleteStimulusAsset,
  downloadStimulusAsset,
  getStimulusVisualProfile,
  listStimulusAssets,
  reserveStimulusAsset,
  uploadStimulusAsset,
} from "@/lib/api";

const SAFE_FILENAME_PATTERN = /^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9_. -]{0,119}$/;
const IMAGE_MEDIA_TYPES = new Set<StimulusAssetMediaType>([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type UploadOperation = {
  asset?: StimulusAsset;
  intent: string;
  reserveKey: string;
  retentionUntil: string;
  uploadKey: string;
};

type Preview = Readonly<{
  assetId: string;
  filename: string;
  mediaType: StimulusAssetMediaType;
  url: string;
}>;

export type StimulusAssetClient = Readonly<{
  createVisualProfile: (
    asset: StimulusAsset,
    idempotencyKey?: string,
  ) => Promise<VisualStimulusProfileRecord>;
  deleteAsset: (
    asset: StimulusAsset,
    idempotencyKey?: string,
  ) => Promise<StimulusAsset>;
  downloadAsset: (asset: StimulusAsset) => Promise<StimulusAssetDownload>;
  listAssets: (stimulusId: string) => Promise<readonly StimulusAsset[]>;
  getVisualProfile: (
    asset: StimulusAsset,
  ) => Promise<VisualStimulusProfileRecord>;
  reserveAsset: (
    stimulusId: string,
    input: StimulusAssetReserveInput,
    idempotencyKey?: string,
  ) => Promise<StimulusAsset>;
  uploadAsset: (
    asset: StimulusAsset,
    bytes: ArrayBuffer,
    idempotencyKey?: string,
  ) => Promise<StimulusAsset>;
}>;

const defaultStimulusAssetClient: StimulusAssetClient = {
  createVisualProfile: createStimulusVisualProfile,
  deleteAsset: deleteStimulusAsset,
  downloadAsset: downloadStimulusAsset,
  getVisualProfile: getStimulusVisualProfile,
  listAssets: listStimulusAssets,
  reserveAsset: reserveStimulusAsset,
  uploadAsset: uploadStimulusAsset,
};

function message(error: unknown): string {
  if (error instanceof ApiProblem) {
    return error.correlationId
      ? `${error.message} Correlation: ${error.correlationId}.`
      : error.message;
  }
  return "SIMULA could not complete that request. Retry shortly.";
}

function upsertAsset(
  assets: readonly StimulusAsset[],
  next: StimulusAsset,
): StimulusAsset[] {
  const index = assets.findIndex((asset) => asset.asset_id === next.asset_id);
  if (index < 0) {
    return [next, ...assets];
  }
  return assets.map((asset) =>
    asset.asset_id === next.asset_id ? next : asset,
  );
}

function statusLabel(status: StimulusAsset["status"]): string {
  switch (status) {
    case "pending_upload":
      return "Pending upload";
    case "available":
      return "Available";
    case "deletion_requested":
      return "Deletion pending";
    case "deleted":
      return "Deleted";
  }
}

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function signalLabel(key: string): string {
  return key
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (value) => value.toString(16).padStart(2, "0"),
  ).join("");
}

function isSupportedMediaType(value: string): value is StimulusAssetMediaType {
  return (STIMULUS_ASSET_MEDIA_TYPES as readonly string[]).includes(value);
}

export function StimulusAssetsPanel({
  client = defaultStimulusAssetClient,
  canMutate,
  stimulusId,
  stimulusName,
  visualProfileEnabled = false,
}: Readonly<{
  client?: StimulusAssetClient;
  canMutate: boolean;
  stimulusId: string;
  stimulusName: string;
  visualProfileEnabled?: boolean;
}>) {
  const [assets, setAssets] = useState<readonly StimulusAsset[]>([]);
  const [busy, setBusy] = useState<string>("load");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [observedAt, setObservedAt] = useState(0);
  const [preview, setPreview] = useState<Preview>();
  const [visualProfiles, setVisualProfiles] = useState<
    ReadonlyMap<string, VisualStimulusProfileRecord>
  >(new Map());
  const previewUrl = useRef<string | undefined>(undefined);
  const uploadOperation = useRef<UploadOperation | undefined>(undefined);
  const deletionKeys = useRef(new Map<string, string>());
  const visualProfileKeys = useRef(new Map<string, string>());

  function replacePreview(next?: Preview): void {
    if (previewUrl.current) {
      URL.revokeObjectURL(previewUrl.current);
    }
    previewUrl.current = next?.url;
    setPreview(next);
  }

  useEffect(() => {
    let stale = false;
    async function load(): Promise<void> {
      try {
        const loaded = await client.listAssets(stimulusId);
        if (!stale) {
          setAssets(loaded);
          setObservedAt(Date.now());
          setError(undefined);
        }
      } catch (loadError) {
        if (!stale) {
          setError(message(loadError));
        }
      } finally {
        if (!stale) {
          setBusy("");
        }
      }
    }
    void load();
    return () => {
      stale = true;
      if (previewUrl.current) {
        URL.revokeObjectURL(previewUrl.current);
        previewUrl.current = undefined;
      }
    };
  }, [client, stimulusId]);

  async function upload(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    const formElement = event.currentTarget;
    const fileInput = formElement.elements.namedItem("asset");
    const retentionInput = formElement.elements.namedItem("retentionDays");
    const fileValue =
      fileInput instanceof HTMLInputElement ? fileInput.files?.item(0) : null;
    const retentionValue =
      retentionInput instanceof HTMLSelectElement
        ? retentionInput.value
        : undefined;
    if (!fileValue || fileValue.size < 1) {
      setError("Choose one supported file.");
      return;
    }
    if (
      !SAFE_FILENAME_PATTERN.test(fileValue.name) ||
      !isSupportedMediaType(fileValue.type) ||
      fileValue.size > STIMULUS_ASSET_MAX_BYTES
    ) {
      setError(
        "Use a PDF, JPEG, PNG, WebP, or MP4 up to 16 MB with a safe filename.",
      );
      return;
    }
    const retentionDays =
      typeof retentionValue === "string" ? Number(retentionValue) : NaN;
    if (![7, 30, 90].includes(retentionDays)) {
      setError("Choose a supported retention window.");
      return;
    }

    setBusy("upload");
    setError(undefined);
    setNotice("Verifying file bytes locally…");
    try {
      const bytes = await fileValue.arrayBuffer();
      const contentSha256 = await sha256(bytes);
      const intent = [
        stimulusId,
        fileValue.name,
        fileValue.type,
        fileValue.size,
        contentSha256,
        retentionDays,
      ].join(":");
      let operation = uploadOperation.current;
      if (!operation || operation.intent !== intent) {
        operation = {
          intent,
          reserveKey: crypto.randomUUID(),
          retentionUntil: new Date(
            Date.now() + retentionDays * 24 * 60 * 60 * 1000,
          ).toISOString(),
          uploadKey: crypto.randomUUID(),
        };
        uploadOperation.current = operation;
      }
      if (!operation.asset) {
        setNotice("Reserving governed private storage…");
        operation.asset = await client.reserveAsset(
          stimulusId,
          {
            byte_size: fileValue.size,
            content_sha256: contentSha256,
            filename: fileValue.name,
            media_type: fileValue.type,
            retention_until: operation.retentionUntil,
          },
          operation.reserveKey,
        );
        setAssets((current) => upsertAsset(current, operation.asset!));
      }
      if (operation.asset.status === "available") {
        uploadOperation.current = undefined;
        setNotice(`${fileValue.name} is already verified and available.`);
        formElement.reset();
        return;
      }
      if (operation.asset.status !== "pending_upload") {
        throw new ApiProblem(
          409,
          "asset_unavailable",
          "That upload reservation is no longer available.",
        );
      }
      setNotice("Uploading and verifying the private object…");
      const uploaded = await client.uploadAsset(
        operation.asset,
        bytes,
        operation.uploadKey,
      );
      setAssets((current) => upsertAsset(current, uploaded));
      uploadOperation.current = undefined;
      setNotice(`${fileValue.name} is verified and available.`);
      formElement.reset();
    } catch (uploadError) {
      setError(message(uploadError));
      setNotice(
        "Upload was not confirmed. Select the same file and retry to reuse the safe operation.",
      );
    } finally {
      setBusy("");
    }
  }

  async function verifyAccess(asset: StimulusAsset): Promise<void> {
    setBusy(`access:${asset.asset_id}`);
    setError(undefined);
    setNotice(`Verifying ${asset.filename} before private access…`);
    try {
      const downloaded = await client.downloadAsset(asset);
      const url = URL.createObjectURL(downloaded.blob);
      if (
        IMAGE_MEDIA_TYPES.has(asset.media_type) ||
        asset.media_type === "application/pdf"
      ) {
        replacePreview({
          assetId: asset.asset_id,
          filename: downloaded.filename,
          mediaType: asset.media_type,
          url,
        });
        setNotice(`${asset.filename} passed browser integrity verification.`);
      } else {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = downloaded.filename;
        anchor.rel = "noopener";
        anchor.click();
        URL.revokeObjectURL(url);
        setNotice(`${asset.filename} passed verification and was downloaded.`);
      }
    } catch (accessError) {
      setError(message(accessError));
    } finally {
      setBusy("");
    }
  }

  async function confirmDeletion(asset: StimulusAsset): Promise<void> {
    const key = deletionKeys.current.get(asset.asset_id) ?? crypto.randomUUID();
    deletionKeys.current.set(asset.asset_id, key);
    setBusy(`delete:${asset.asset_id}`);
    setError(undefined);
    setNotice(`Deleting ${asset.filename} from private storage…`);
    try {
      const deleted = await client.deleteAsset(asset, key);
      deletionKeys.current.delete(asset.asset_id);
      setAssets((current) => upsertAsset(current, deleted));
      setVisualProfiles((current) => {
        const next = new Map(current);
        next.delete(asset.asset_id);
        return next;
      });
      setConfirmDeleteId(undefined);
      if (preview?.assetId === asset.asset_id) {
        replacePreview();
      }
      setNotice(`${asset.filename} was permanently deleted.`);
    } catch (deleteError) {
      setError(message(deleteError));
      setNotice("Deletion was not confirmed. Retry the same operation.");
    } finally {
      setBusy("");
    }
  }

  async function profileImage(
    asset: StimulusAsset,
    create: boolean,
  ): Promise<void> {
    const key =
      visualProfileKeys.current.get(asset.asset_id) ?? crypto.randomUUID();
    if (create) {
      visualProfileKeys.current.set(asset.asset_id, key);
    }
    setBusy(`profile:${asset.asset_id}`);
    setError(undefined);
    setNotice(
      create
        ? `Measuring technical image signals for ${asset.filename}…`
        : `Loading the technical image profile for ${asset.filename}…`,
    );
    try {
      const result = create
        ? await client.createVisualProfile(asset, key)
        : await client.getVisualProfile(asset);
      visualProfileKeys.current.delete(asset.asset_id);
      setVisualProfiles((current) => {
        const next = new Map(current);
        next.set(asset.asset_id, result);
        return next;
      });
      setNotice(
        `${asset.filename} has a verified technical image-signal profile. No behavioral response was inferred.`,
      );
    } catch (profileError) {
      setError(message(profileError));
      setNotice(
        create
          ? "Profiling was not confirmed. Retry to reuse the same safe operation."
          : "No technical profile could be loaded.",
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <section
      aria-labelledby={`assets-${stimulusId}`}
      className="stimulus-assets"
    >
      <div>
        <p className="eyebrow">Private source files</p>
        <h4 id={`assets-${stimulusId}`}>Campaign assets</h4>
        <p className="field-note">
          Storage only. SIMULA has not analyzed, interpreted, or scored these
          file contents.
        </p>
        {visualProfileEnabled ? (
          <p className="field-note">
            Technical profiling is explicit and limited to decoded image
            dimensions, color, luminance, saturation, transparency, and edge
            signals. It performs no OCR, object recognition, emotion,
            persuasion, or behavioral prediction.
          </p>
        ) : null}
      </div>
      {error ? (
        <p className="problem" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p aria-live="polite">{notice}</p> : null}
      {busy === "load" ? (
        <p aria-live="polite">Loading private assets…</p>
      ) : null}
      {canMutate ? (
        <form className="asset-upload form-stack" onSubmit={upload}>
          <label htmlFor={`asset-file-${stimulusId}`}>
            Attach file to {stimulusName}
          </label>
          <input
            accept={STIMULUS_ASSET_MEDIA_TYPES.join(",")}
            disabled={busy === "upload"}
            id={`asset-file-${stimulusId}`}
            name="asset"
            required
            type="file"
          />
          <label htmlFor={`asset-retention-${stimulusId}`}>Retention</label>
          <select
            defaultValue="30"
            disabled={busy === "upload"}
            id={`asset-retention-${stimulusId}`}
            name="retentionDays"
          >
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
          </select>
          <p className="field-note">
            PDF, JPEG, PNG, WebP, or MP4. Maximum 16 MB. Do not upload personal
            or sensitive data.
          </p>
          <button disabled={busy === "upload"} type="submit">
            {busy === "upload" ? "Verifying and uploading…" : "Attach file"}
          </button>
        </form>
      ) : null}
      {busy !== "load" && assets.length === 0 ? (
        <p className="empty-state">No private files attached.</p>
      ) : null}
      {assets.length > 0 ? (
        <ul className="asset-list">
          {assets.map((asset) => {
            const expired =
              observedAt > 0 && Date.parse(asset.retention_until) <= observedAt;
            const deleting = busy === `delete:${asset.asset_id}`;
            const accessing = busy === `access:${asset.asset_id}`;
            const profiling = busy === `profile:${asset.asset_id}`;
            const visualProfile = visualProfiles.get(asset.asset_id);
            const canProfile =
              visualProfileEnabled &&
              asset.status === "available" &&
              !expired &&
              IMAGE_MEDIA_TYPES.has(asset.media_type);
            return (
              <li key={asset.asset_id}>
                <div className="asset-heading">
                  <strong>{asset.filename}</strong>
                  <span className={`asset-status asset-status-${asset.status}`}>
                    {statusLabel(asset.status)}
                  </span>
                </div>
                <p className="resource-meta">
                  {asset.media_type} · {formatBytes(asset.expected_byte_size)} ·
                  retained until{" "}
                  <time dateTime={asset.retention_until}>
                    {new Date(asset.retention_until).toLocaleDateString()}
                  </time>
                </p>
                <p className="resource-meta">
                  SHA-256:{" "}
                  <code title={asset.expected_content_sha256}>
                    {asset.expected_content_sha256}
                  </code>
                </p>
                {expired && asset.status !== "deleted" ? (
                  <p className="field-note">Retention window ended.</p>
                ) : null}
                <div className="asset-actions">
                  {asset.status === "available" && !expired ? (
                    <button
                      disabled={accessing}
                      onClick={() => void verifyAccess(asset)}
                      type="button"
                    >
                      {accessing
                        ? "Verifying…"
                        : asset.media_type === "video/mp4"
                          ? "Verify and download"
                          : "Verify and preview"}
                    </button>
                  ) : null}
                  {canProfile ? (
                    <button
                      disabled={profiling}
                      onClick={() => void profileImage(asset, canMutate)}
                      type="button"
                    >
                      {profiling
                        ? "Profiling…"
                        : canMutate
                          ? "Profile technical signals"
                          : "Load technical profile"}
                    </button>
                  ) : null}
                  {canMutate && asset.status !== "deleted" ? (
                    confirmDeleteId === asset.asset_id ? (
                      <span className="asset-delete-confirmation">
                        <span>Delete permanently?</span>
                        <button
                          disabled={deleting}
                          onClick={() => void confirmDeletion(asset)}
                          type="button"
                        >
                          {deleting ? "Deleting…" : "Confirm deletion"}
                        </button>
                        <button
                          disabled={deleting}
                          onClick={() => setConfirmDeleteId(undefined)}
                          type="button"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(asset.asset_id)}
                        type="button"
                      >
                        {asset.status === "deletion_requested"
                          ? "Complete deletion"
                          : "Delete file"}
                      </button>
                    )
                  ) : null}
                </div>
                {visualProfile ? (
                  <section
                    aria-labelledby={`visual-profile-${asset.asset_id}`}
                    className="visual-profile"
                  >
                    <p className="eyebrow">Experimental technical profile</p>
                    <h5 id={`visual-profile-${asset.asset_id}`}>
                      Image signals ·{" "}
                      {visualProfile.profile.dimensions.width_px}×
                      {visualProfile.profile.dimensions.height_px} ·{" "}
                      {visualProfile.profile.dimensions.orientation}
                    </h5>
                    <p className="field-note">
                      Technical image signals only. No objects, text, meaning,
                      emotion, persuasion, human response, or campaign
                      performance were inferred.
                    </p>
                    <dl className="visual-signal-grid">
                      {visualProfile.profile.signals.map((signal) => (
                        <div key={signal.key}>
                          <dt>{signalLabel(signal.key)}</dt>
                          <dd>{(signal.value * 100).toFixed(1)}%</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="resource-meta">
                      Method {visualProfile.profile.methodology_version} ·
                      provider {visualProfile.profile.provider.provider_version}{" "}
                      · {visualProfile.profile.validation_label}
                    </p>
                    <ul className="field-note">
                      {visualProfile.profile.limitations.map((limitation) => (
                        <li key={limitation}>{limitation}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {preview ? (
        <div className="asset-preview">
          <div className="asset-heading">
            <strong>Verified private preview · {preview.filename}</strong>
            <button onClick={() => replacePreview()} type="button">
              Close preview
            </button>
          </div>
          {IMAGE_MEDIA_TYPES.has(preview.mediaType) ? (
            // eslint-disable-next-line @next/next/no-img-element -- private blob previews have no stable image-loader URL
            <img
              alt={`Private preview of ${preview.filename}`}
              src={preview.url}
            />
          ) : (
            <iframe
              sandbox=""
              src={preview.url}
              title={`Private PDF preview of ${preview.filename}`}
            />
          )}
        </div>
      ) : null}
    </section>
  );
}
