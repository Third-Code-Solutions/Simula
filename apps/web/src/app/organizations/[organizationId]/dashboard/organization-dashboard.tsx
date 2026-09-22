"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { SignOutButton } from "@/app/sign-out-button";
import { WorkspaceSidebar } from "@/app/workspace-sidebar";
import {
  ApiProblem,
  type OrganizationDashboard,
  type ProductRecord,
  createOrganizationInvitation,
  deleteOrganization,
  getOrganizationAudit,
  getOrganizationDashboard,
  listOrganizationFeatureFlags,
  listOrganizationInvitations,
  setOrganizationFeatureFlag,
} from "@/lib/api";
import { isCancelledRequest } from "@/lib/view-request";

import { DashboardOverview } from "./dashboard-overview";
import styles from "./dashboard.module.css";
import { OwnerControls } from "./owner-controls";

function problemMessage(error: unknown): string {
  if (error instanceof ApiProblem) {
    return error.correlationId
      ? `${error.message} Correlation: ${error.correlationId}.`
      : error.message;
  }
  return "SIMULA could not load this dashboard. Retry shortly.";
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function bool(value: unknown): boolean {
  return value === true;
}

export function OrganizationDashboardWorkspace({
  organizationId,
}: Readonly<{ organizationId: string }>) {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<OrganizationDashboard>();
  const [invitations, setInvitations] = useState<ProductRecord[]>([]);
  const [flags, setFlags] = useState<ProductRecord[]>([]);
  const [audit, setAudit] = useState<ProductRecord[]>([]);
  const [invitationToken, setInvitationToken] = useState<string>();
  const [error, setError] = useState<string>();
  const [ownerError, setOwnerError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string>();

  const lifetime = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => {
      controller.abort();
      lifetime.current = null;
    };
  }, []);

  const loadOwnerData = useCallback(async (): Promise<void> => {
    const signal = lifetime.current?.signal;
    const [loadedInvitations, loadedFlags, loadedAudit] = await Promise.all([
      listOrganizationInvitations(organizationId, signal),
      listOrganizationFeatureFlags(organizationId, signal),
      getOrganizationAudit(organizationId, signal),
    ]);
    if (signal?.aborted) return;
    setInvitations(loadedInvitations.items);
    setFlags(loadedFlags.items);
    setAudit(loadedAudit.items);
    setOwnerError(undefined);
  }, [organizationId]);

  const loadDashboard = useCallback(async (): Promise<void> => {
    const signal = lifetime.current?.signal;
    try {
      const loadedDashboard = await getOrganizationDashboard(
        organizationId,
        signal,
      );
      if (signal?.aborted) return;
      setDashboard(loadedDashboard);
      setError(undefined);
      if (
        loadedDashboard.organization_status === "active" &&
        loadedDashboard.permissions.can_manage_settings
      ) {
        try {
          await loadOwnerData();
        } catch (ownerLoadError) {
          if (isCancelledRequest(ownerLoadError)) return;
          setOwnerError(problemMessage(ownerLoadError));
        }
      } else {
        setInvitations([]);
        setFlags([]);
        setAudit([]);
        setOwnerError(undefined);
      }
    } catch (loadError) {
      if (isCancelledRequest(loadError)) return;
      setError(problemMessage(loadError));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [loadOwnerData, organizationId]);

  useEffect(() => {
    const controller = new AbortController();
    let stale = false;

    async function load(): Promise<void> {
      try {
        const loadedDashboard = await getOrganizationDashboard(
          organizationId,
          controller.signal,
        );
        if (stale) return;
        setDashboard(loadedDashboard);
        setError(undefined);
        if (
          loadedDashboard.organization_status === "active" &&
          loadedDashboard.permissions.can_manage_settings
        ) {
          try {
            const [loadedInvitations, loadedFlags, loadedAudit] =
              await Promise.all([
                listOrganizationInvitations(organizationId, controller.signal),
                listOrganizationFeatureFlags(organizationId, controller.signal),
                getOrganizationAudit(organizationId, controller.signal),
              ]);
            if (stale) return;
            setInvitations(loadedInvitations.items);
            setFlags(loadedFlags.items);
            setAudit(loadedAudit.items);
            setOwnerError(undefined);
          } catch (ownerLoadError) {
            if (isCancelledRequest(ownerLoadError)) return;
            if (!stale) setOwnerError(problemMessage(ownerLoadError));
          }
        }
      } catch (loadError) {
        if (isCancelledRequest(loadError)) return;
        if (!stale) setError(problemMessage(loadError));
      } finally {
        if (!stale) setLoading(false);
      }
    }

    void load();
    return () => {
      stale = true;
      controller.abort();
    };
  }, [organizationId]);

  function retryDashboard(): void {
    setError(undefined);
    if (!dashboard) setLoading(true);
    void loadDashboard();
  }

  async function refreshDashboard(): Promise<void> {
    setRefreshing(true);
    setError(undefined);
    try {
      await loadDashboard();
    } finally {
      setRefreshing(false);
    }
  }

  async function inviteMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const email = form.get("email");
    const role = form.get("role");
    if (typeof email !== "string" || (role !== "editor" && role !== "viewer")) {
      return;
    }
    setBusy("invitation");
    setOwnerError(undefined);
    try {
      const response = await createOrganizationInvitation(organizationId, {
        email: email.trim(),
        role,
        expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      });
      setInvitationToken(text(response.data.invitation_token));
      await loadOwnerData();
      formElement.reset();
    } catch (inviteError) {
      if (isCancelledRequest(inviteError)) return;
      setOwnerError(problemMessage(inviteError));
    } finally {
      setBusy(undefined);
    }
  }

  async function saveFlag(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const flagKey = form.get("flagKey");
    const reason = form.get("reason");
    if (typeof flagKey !== "string" || typeof reason !== "string") return;
    setBusy("flag");
    setOwnerError(undefined);
    try {
      await setOrganizationFeatureFlag(organizationId, flagKey.trim(), {
        enabled: form.get("enabled") === "on",
        reason: reason.trim(),
      });
      await loadOwnerData();
      formElement.reset();
    } catch (flagError) {
      if (isCancelledRequest(flagError)) return;
      setOwnerError(problemMessage(flagError));
    } finally {
      setBusy(undefined);
    }
  }

  async function toggleFlag(flag: ProductRecord): Promise<void> {
    const flagKey = text(flag.flag_key);
    if (!flagKey) return;
    setBusy(`flag:${flagKey}`);
    setOwnerError(undefined);
    try {
      await setOrganizationFeatureFlag(organizationId, flagKey, {
        enabled: !bool(flag.enabled),
        reason: "Changed by organization owner from secured dashboard.",
      });
      await loadOwnerData();
    } catch (flagError) {
      if (isCancelledRequest(flagError)) return;
      setOwnerError(problemMessage(flagError));
    } finally {
      setBusy(undefined);
    }
  }

  async function deleteWorkspace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dashboard) return;
    const confirmation = new FormData(event.currentTarget).get("confirmation");
    if (
      typeof confirmation !== "string" ||
      confirmation.trim() !== dashboard.organization_name
    ) {
      setOwnerError(
        "Enter the exact workspace name before permanent deletion.",
      );
      return;
    }
    setBusy("deletion");
    setOwnerError(undefined);
    try {
      await deleteOrganization(organizationId, confirmation.trim());
      router.replace("/organizations");
    } catch (deletionError) {
      if (isCancelledRequest(deletionError)) return;
      setOwnerError(problemMessage(deletionError));
      await loadDashboard();
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <main
      className="workspace-main workspace-main-wide"
      id="main-content"
      tabIndex={-1}
    >
      <header className="workspace-header">
        <Link className="wordmark" href="/organizations">
          SIMULA
        </Link>
        <SignOutButton />
      </header>
      <WorkspaceSidebar current="dashboard" organizationId={organizationId} />
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/organizations">Organizations</Link>
        <span aria-hidden="true"> / </span>
        <span>Dashboard</span>
      </nav>

      {loading ? (
        <section
          aria-label="Loading secured dashboard"
          aria-live="polite"
          className={styles.dashboardSkeleton}
        >
          <span className={styles.skeletonTitle} />
          <span className={styles.skeletonLine} />
          <div>
            <span />
            <span />
            <span />
            <span />
          </div>
        </section>
      ) : null}

      {!loading && error && !dashboard ? (
        <section className="panel" aria-labelledby="dashboard-unavailable">
          <p className="eyebrow">Organization dashboard</p>
          <h1 id="dashboard-unavailable">Dashboard unavailable</h1>
          <p className="field-note">
            This workspace could not be opened. No organization details are
            shown.
          </p>
          <Link href="/organizations">Return to organizations</Link>
        </section>
      ) : null}

      {error ? (
        <div className={styles.errorRow} role="alert">
          <p>{error}</p>
          <button onClick={retryDashboard} type="button">
            Retry dashboard
          </button>
        </div>
      ) : null}

      {dashboard ? (
        <>
          <DashboardOverview
            dashboard={dashboard}
            onRefresh={() => void refreshDashboard()}
            organizationId={organizationId}
            refreshing={refreshing}
          />
          {!loading && dashboard.permissions.can_manage_team ? (
            <OwnerControls
              audit={audit}
              busy={busy}
              flags={flags}
              invitationToken={invitationToken}
              invitations={invitations}
              organizationName={dashboard.organization_name}
              organizationStatus={dashboard.organization_status}
              onDelete={(event) => void deleteWorkspace(event)}
              onInvite={(event) => void inviteMember(event)}
              onSaveFlag={(event) => void saveFlag(event)}
              onToggleFlag={(flag) => void toggleFlag(flag)}
              ownerError={ownerError}
            />
          ) : null}
        </>
      ) : null}
    </main>
  );
}
