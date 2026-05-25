import { platform } from '@tauri-apps/plugin-os'
import { save } from '@tauri-apps/plugin-dialog'
import { helper } from './helper'
import { RootStore } from '@/store'
import { ToastPlugin } from '@/store/module/Toast/Toast'
import i18n from './i18n'
import { UserStore } from '@/store/user'
import { download } from '@tauri-apps/plugin-upload'
import { appDataDir, downloadDir, join } from '@tauri-apps/api/path'
import { setStatusBarColor } from 'tauri-plugin-blinko-api'
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getBlinkoEndpoint } from './blinkoEndpoint';
import { openPath, openUrl } from '@tauri-apps/plugin-opener';
import { mkdir } from '@tauri-apps/plugin-fs';

export interface PermissionStatus {
    audio: boolean;
    camera: boolean;
}

function hasTauriRuntime(): boolean {
    try {
        // @ts-ignore
        return typeof window !== 'undefined' && window.__TAURI__ !== undefined;
    } catch {
        return false;
    }
}

/**
 * isAndroid
 * @returns wether the platform is android
 */
export function isAndroid() {
    if (!hasTauriRuntime()) return false;
    try {
        return platform() === 'android';
    } catch (error) {
        return false
    }
}

export function isIOS() {
    if (!hasTauriRuntime()) return false;
    try {
        return platform() === 'ios';
    } catch (error) {
        return false
    }
}

export function isDesktop() {
    if (!hasTauriRuntime()) return false;
    try {
       return platform() === 'macos' || platform() === 'windows' || platform() === 'linux';
    } catch (error) {
        return false
    }
}

export function isWindows() {
    if (!hasTauriRuntime()) return false;
    try {
        return platform() === 'windows';
    } catch (error) {
        return false
    }
}

export function isInTauri() {
    return hasTauriRuntime();
}

/**
 * downloadFromLink
 * @param uri download link
 * @param filename optional file name, if not provided, it will be extracted from the link
 * https://v2.tauri.app/plugin/file-system/#ios 
 */
export async function downloadFromLink(uri: string, filename?: string) {
    if (!isInTauri()) {
        helper.download.downloadByLink(uri)
        return;
    }

    try {
        const resolvedUri = (() => {
            if (!uri) return '';
            if (uri.startsWith('http://') || uri.startsWith('https://') || uri.startsWith('tauri://')) {
                return uri;
            }
            return getBlinkoEndpoint(uri);
        })();

        let parsedUrl: URL | null = null;
        if (resolvedUri) {
            try {
                parsedUrl = new URL(resolvedUri);
            } catch {
                try {
                    parsedUrl = new URL(resolvedUri, window.location.origin);
                } catch {
                    parsedUrl = null;
                }
            }
        }

        if (!parsedUrl) {
            RootStore.Get(ToastPlugin).error(`${i18n.t('download-failed')}: Invalid URL`);
            return;
        }

        RootStore.Get(ToastPlugin).loading(i18n.t('downloading'), { id: 'downloading' })

        if (!filename) {
            filename = parsedUrl.pathname.split('/').pop() || 'downloaded_file';
        }

        const token = RootStore.Get(UserStore).tokenData.value?.token;
        const downloadUrl = new URL(parsedUrl.toString());
        if (token) {
            downloadUrl.searchParams.set('token', token);
        }

        if (isAndroid()) {
            const downloadDirPath = await downloadDir();
            await download(
                downloadUrl.toString(),
                `${downloadDirPath}/${filename}`,
                ({ progress, total }) => {
                    console.log(`download progress: ${progress} / ${total} bytes`);
                },
                new Map([['Content-Type', 'application/octet-stream']])
            );

            RootStore.Get(ToastPlugin).dismiss('downloading');
            RootStore.Get(ToastPlugin).success(i18n.t('download-success') + ' ' + downloadDirPath);
        } else if (platform() === 'ios') {
            const base = await appDataDir();
            const dir = await join(base, 'blinko', 'downloads');
            await mkdir(dir, { recursive: true });
            const targetPath = await join(dir, sanitizeFilename(filename));

            await download(
                downloadUrl.toString(),
                targetPath,
                () => {},
                new Map([['Content-Type', 'application/octet-stream']])
            );

            const { presentShareSheet } = await import('tauri-plugin-blinko-api');
            await presentShareSheet({ path: targetPath, mime: null, filename });
            RootStore.Get(ToastPlugin).dismiss('downloading');
            RootStore.Get(ToastPlugin).success(i18n.t('download-success'));
        } else {
            const savePath = await save({
                filters: [
                    {
                        name: 'All Files',
                        extensions: ['*']
                    }
                ],
                defaultPath: filename
            });

            if (savePath) {
                await download(
                    downloadUrl.toString(),
                    savePath,
                    ({ progress, total }) => {
                        // console.log(`download progress: ${progress} / ${total} bytes`);
                    },
                    new Map([['Content-Type', 'application/octet-stream']])
                );

                RootStore.Get(ToastPlugin).dismiss('downloading');
                RootStore.Get(ToastPlugin).success(i18n.t('download-success'));
            }
        }
    } catch (error) {
        RootStore.Get(ToastPlugin).dismiss('downloading');
        RootStore.Get(ToastPlugin).error(`${i18n.t('download-failed')}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

function sanitizeFilename(input: string): string {
    const name = (input || 'downloaded_file').trim() || 'downloaded_file';
    // Conservative filename sanitization across Windows/macOS/Linux.
    return name
        .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_')
        .replace(/\s+/g, ' ')
        .slice(0, 180);
}

type ResolvedDownload = {
    downloadUrl: URL;
    filename: string;
}

function resolveDownloadUrl(uri: string, filename?: string): ResolvedDownload | null {
    const resolvedUri = (() => {
        if (!uri) return '';
        if (uri.startsWith('http://') || uri.startsWith('https://') || uri.startsWith('tauri://')) {
            return uri;
        }
        return getBlinkoEndpoint(uri);
    })();

    let parsedUrl: URL | null = null;
    if (resolvedUri) {
        try {
            parsedUrl = new URL(resolvedUri);
        } catch {
            try {
                parsedUrl = new URL(resolvedUri, window.location.origin);
            } catch {
                parsedUrl = null;
            }
        }
    }

    if (!parsedUrl) return null;

    const derived = filename || parsedUrl.pathname.split('/').pop() || 'downloaded_file';
    const safeFilename = sanitizeFilename(derived);

    const token = RootStore.Get(UserStore).tokenData.value?.token;
    const downloadUrl = new URL(parsedUrl.toString());
    if (token) {
        downloadUrl.searchParams.set('token', token);
    }

    return { downloadUrl, filename: safeFilename };
}

/**
 * Downloads (if needed) and opens a file using the system default app (PDF viewer, Office suite, etc.).
 *
 * - Desktop: downloads to `$APPCACHE/blinko/open-with-default/` and opens the file.
 * - Android: downloads to the Downloads directory (so external apps can access it) and opens the file.
 * - Web: opens the URL in a new tab.
 */
export async function openFromLinkInDefaultApp(uri: string, filename?: string) {
    const resolved = resolveDownloadUrl(uri, filename);
    if (!resolved) {
        RootStore.Get(ToastPlugin).error(`${i18n.t('download-failed')}: Invalid URL`);
        return;
    }

    if (!isInTauri()) {
        window.open(resolved.downloadUrl.toString(), '_blank');
        return;
    }

    if (platform() === 'ios') {
        try {
            RootStore.Get(ToastPlugin).loading(i18n.t('downloading'), { id: 'opening-document' });
            const base = await appDataDir();
            const dir = await join(base, 'blinko', 'open-with-default');
            await mkdir(dir, { recursive: true });
            const targetPath = await join(dir, resolved.filename);

            await download(
                resolved.downloadUrl.toString(),
                targetPath,
                () => {},
                new Map([['Content-Type', 'application/octet-stream']])
            );

            const { presentShareSheet } = await import('tauri-plugin-blinko-api');
            await presentShareSheet({ path: targetPath, mime: null, filename: resolved.filename });
            RootStore.Get(ToastPlugin).dismiss('opening-document');
        } catch (error) {
            RootStore.Get(ToastPlugin).dismiss('opening-document');
            await openUrl(resolved.downloadUrl.toString());
        }
        return;
    }

    try {
        RootStore.Get(ToastPlugin).loading(i18n.t('downloading'), { id: 'opening-document' });

        // Save to the system Downloads folder so other apps can access it (Android)
        // and to stay within the `$DOWNLOAD` scope (desktop).
        const dir = await downloadDir();

        const targetPath = await join(dir, resolved.filename);
        await download(
            resolved.downloadUrl.toString(),
            targetPath,
            ({ progress, total }) => {
                // Useful for debugging large downloads.
                // console.log(`download progress: ${progress} / ${total} bytes`);
            },
            new Map([['Content-Type', 'application/octet-stream']])
        );

        RootStore.Get(ToastPlugin).dismiss('opening-document');
        await openPath(targetPath);
    } catch (error) {
        RootStore.Get(ToastPlugin).dismiss('opening-document');
        RootStore.Get(ToastPlugin).error(`${i18n.t('download-failed')}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export async function setTauriTheme(theme: any) {
    if (isAndroid()) {
        const lightColor = '#f8f8f8';
        const darkColor = '#000000';
        setStatusBarColor(theme === 'light' ? lightColor : darkColor);
    } else if (isDesktop()) {
        try {
            await invoke('set_desktop_theme', { theme });
        } catch (error) {
            console.error('Failed to set desktop theme:', error);
        }
    }
}




export const requestMicrophonePermission = async (): Promise<boolean> => {
    try {
        // Check cached permission first
        const cachedPermission = localStorage.getItem('microphone_permission_granted');
        if (cachedPermission === 'true') {
            console.log('Using cached microphone permission');
            return true;
        }

        // Check current platform
        const currentPlatform = isInTauri() ? platform() : 'web';
        
        // Try to request permission first
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            }
        }).catch((error) => {
            console.error('getUserMedia error:', error);
            return null;
        });
        
        if (stream) {
            // Permission granted, stop the stream immediately
            stream.getTracks().forEach(track => track.stop());
            // Cache the granted permission
            localStorage.setItem('microphone_permission_granted', 'true');
            return true;
        }
        
        // Handle platform-specific permission denied scenarios
        if (isAndroid()) {
            const shouldShowSettings = confirm(
                'Microphone permission is required for audio recording.\n\n' +
                'Please grant microphone permission in the app settings.\n\n' +
                'Would you like to open settings now?'
            );
            
            if (shouldShowSettings) {
                try {
                    const { openAppSettings } = await import('tauri-plugin-blinko-api');
                    await openAppSettings();
                } catch (error) {
                    console.error('Failed to open app settings:', error);
                    // Fallback: Show instructions
                    alert('Please go to Settings > Apps > Blinko > Permissions and enable Microphone access.');
                }
            }
        } else if (currentPlatform === 'macos') {
            // macOS specific handling
            alert(
                'Microphone permission is required.\n\n' +
                'Please grant microphone access to this app in:\n' +
                'System Preferences > Security & Privacy > Privacy > Microphone'
            );
        } else if (currentPlatform === 'windows') {
            // Windows specific handling
            alert(
                'Microphone permission is required.\n\n' +
                'Please grant microphone access to this app in:\n' +
                'Settings > Privacy & Security > Microphone'
            );
        } else if (currentPlatform === 'linux') {
            // Linux specific handling
            alert(
                'Microphone permission is required.\n\n' +
                'Please ensure your microphone is properly configured and permissions are granted.'
            );
        }
        
        // Clear cache when permission denied
        localStorage.removeItem('microphone_permission_granted');
        return false;
    } catch (error) {
        console.error('Failed to request microphone permission:', error);
        localStorage.removeItem('microphone_permission_granted');
        return false;
    }
};

export const checkMicrophonePermission = async (): Promise<boolean> => {
    try {
        // Check cached permission first
        const cachedPermission = localStorage.getItem('microphone_permission_granted');
        if (cachedPermission === 'true') {
            console.log('Using cached microphone permission');
            return true;
        }

        // Check if the permission API is available (mainly for web)
        if ('permissions' in navigator) {
            try {
                const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
                if (permission.state === 'granted') {
                    localStorage.setItem('microphone_permission_granted', 'true');
                    return true;
                } else if (permission.state === 'denied') {
                    localStorage.removeItem('microphone_permission_granted');
                    return false;
                }
                // If prompt, fall through to test actual access
            } catch (e) {
                // Permission API might not support microphone query
                console.log('Permission API not supported for microphone:', e);
            }
        }

        // Fallback: Try to access the microphone
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            .catch(() => null);

        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            localStorage.setItem('microphone_permission_granted', 'true');
            return true;
        }

        localStorage.removeItem('microphone_permission_granted');
        return false;
    } catch (error) {
        console.error('Error checking microphone permission:', error);
        localStorage.removeItem('microphone_permission_granted');
        return false;
    }
};

export const usePermissions = () => {
    const [permissions, setPermissions] = useState<PermissionStatus>({
        audio: false,
        camera: false,
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkPermissions = async () => {
            setLoading(true);
            
            try {
                const audioPermission = await checkMicrophonePermission();
                
                setPermissions({
                    audio: audioPermission,
                    camera: false, // Camera permission check can be added later
                });
            } catch (error) {
                console.error('Error checking permissions:', error);
            } finally {
                setLoading(false);
            }
        };

        checkPermissions();
    }, []);

    const requestAudioPermission = async () => {
        const granted = await requestMicrophonePermission();
        setPermissions(prev => ({ ...prev, audio: granted }));
        return granted;
    };

    return {
        permissions,
        loading,
        requestAudioPermission,
    };
};
