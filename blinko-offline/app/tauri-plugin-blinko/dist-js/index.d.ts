export declare function setStatusBarColor(hexColor: string): Promise<null>;
export declare function openAppSettings(): Promise<void>;
export type PresentShareSheetRequest = {
    path: string;
    mime?: string | null;
    filename?: string | null;
};
export declare function presentShareSheet(payload: PresentShareSheetRequest): Promise<void>;
export declare function getPendingSharePayload(): Promise<string | null>;
export declare function clearPendingSharePayload(): Promise<void>;
