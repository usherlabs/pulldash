import { createContext, useContext, type ReactNode } from "react";

// ============================================================================
// Platform Detection
// ============================================================================

export function isElectron(): boolean {
  // Check for Electron-specific globals
  if (typeof window !== "undefined") {
    // Check userAgent for Electron
    if (navigator.userAgent.toLowerCase().includes("electron")) {
      return true;
    }
    // Check for Electron's process object
    if (
      typeof (
        window as unknown as { process?: { versions?: { electron?: string } } }
      ).process?.versions?.electron === "string"
    ) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// Event Types
// ============================================================================

export type TelemetryEvent =
  | "review_submitted"
  | "pr_viewed"
  | "pr_merged"
  | "comment_added"
  | "file_viewed"
  | "app_opened";

export interface ReviewSubmittedProperties {
  pr_number: number;
  owner: string;
  repo: string;
  review_type: "APPROVE" | "REQUEST_CHANGES" | "COMMENT";
  comment_count: number;
  files_reviewed: number;
}

export interface PRViewedProperties {
  pr_number: number;
  owner: string;
  repo: string;
  file_count: number;
  additions: number;
  deletions: number;
}

export interface CommentAddedProperties {
  pr_number: number;
  owner: string;
  repo: string;
  is_pending: boolean;
  has_range: boolean;
}

export interface FileViewedProperties {
  pr_number: number;
  owner: string;
  repo: string;
  file_path: string;
}

export type TelemetryProperties =
  | ReviewSubmittedProperties
  | PRViewedProperties
  | CommentAddedProperties
  | FileViewedProperties
  | Record<string, unknown>;

// ============================================================================
// Context
// ============================================================================

interface TelemetryContextValue {
  track: (event: TelemetryEvent, properties?: TelemetryProperties) => void;
}

const TelemetryContext = createContext<TelemetryContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

const telemetry: TelemetryContextValue = { track: () => {} };

export function TelemetryProvider({ children }: { children: ReactNode }) {
  return (
    <TelemetryContext.Provider value={telemetry}>
      {children}
    </TelemetryContext.Provider>
  );
}

// ============================================================================
// Hooks
// ============================================================================

export function useTelemetry(): TelemetryContextValue {
  const context = useContext(TelemetryContext);
  if (!context) {
    throw new Error("useTelemetry must be used within TelemetryProvider");
  }
  return context;
}
