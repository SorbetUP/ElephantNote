import { useState, useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { ThemeProvider } from 'next-themes';
import { HeroUIProvider } from '@heroui/react';
import './styles/github-markdown.css';
import 'react-photo-view/dist/react-photo-view.css';
import '@/lib/i18n';
import { initStore } from '@/store/init';
import { CommonLayout } from '@/components/Layout';
import { AppProvider } from '@/store/module/AppProvider';
import { BlinkoMultiSelectPop } from '@/components/BlinkoMultiSelectPop';
import { BlinkoMusicPlayer } from '@/components/BlinkoMusicPlayer';
import { LoadingPage } from '@/components/Common/LoadingPage';
import { PluginManagerStore } from '@/store/plugin/pluginManagerStore';
import { RootStore } from '@/store';
import { UserStore } from '@/store/user';
import { getTokenData, setNavigate } from '@/components/Auth/auth-client';
import { BlinkoStore } from '@/store/blinkoStore';
import { useAndroidShortcuts, useIOSShareInbox } from '@/lib/hooks';
import { useQuickaiHotkey } from '@/hooks/useQuickaiHotkey';
import { useInitialHotkeySetup } from '@/hooks/useInitialHotkeySetup';
import { isInTauri, isDesktop } from "@/lib/tauriHelper";
import { resolveBaseUrl, isLocalMode, saveBlinkoEndpoint, setLocalHttpUnavailable, getBlinkoEndpoint } from "@/lib/blinkoEndpoint";
import { eventBus } from "@/lib/event";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { reinitializeTrpcApi } from "@/lib/trpc";
import { signIn } from "@/components/Auth/auth-client";
import QuickNotePage from "./pages/quicknote";
import QuickAIPage from "./pages/quickai";
import QuickToolPage from "./pages/quicktool";
import { useQuicknoteHotkey } from "./hooks/useQuicknoteHotkey";

const HomePage = lazy(() => import('./pages/index'));
const SignInPage = lazy(() => import('./pages/signin'));
const SignUpPage = lazy(() => import('./pages/signup'));
const HubPage = lazy(() => import('./pages/hub'));
const AIPage = lazy(() => import('./pages/ai'));
const ResourcesPage = lazy(() => import('./pages/resources'));
const ReviewPage = lazy(() => import('./pages/review'));
const SettingsPage = lazy(() => import('./pages/settings'));
const PluginPage = lazy(() => import('./pages/plugin'));
const AnalyticsPage = lazy(() => import('./pages/analytics'));
const AllPage = lazy(() => import('./pages/all'));
const OAuthCallbackPage = lazy(() => import('./pages/oauth-callback'));
const DetailPage = lazy(() => import('./pages/detail'));
const ShareIndexPage = lazy(() => import('./pages/share'));
const ShareDetailPage = lazy(() => import('./pages/share/[id]'));
const AiSharePage = lazy(() => import('./pages/ai-share'));
const E2EProtectedImagesPage = lazy(() => import('./pages/__e2e__/protected-images'));
const DevInspector = lazy(() => import('./components/Common/DevInspector'));

const HomeRedirect = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const blinko = RootStore.Get(BlinkoStore);
  const userStore = RootStore.Get(UserStore);
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const redirectToDefaultPage = async () => {
      // Only try to load config if user is authenticated
      if (userStore.isLogin) {
        try {
          await blinko.config.call();
        } catch (error) {
          // Silently fail if config can't be loaded
          console.debug('Failed to load config:', error);
        }
      }

      const defaultHomePage = blinko.config.value?.defaultHomePage;
      const currentPath = searchParams.get('path');
      const isDirectNavigation = location.key === 'default';
      if (currentPath || !defaultHomePage || defaultHomePage === 'blinko' || !isDirectNavigation) {
        setLoading(false);
        return;
      }

      navigate(`/?path=${defaultHomePage}`, { replace: true });
    };

    redirectToDefaultPage();
  }, [navigate, searchParams, location, userStore.isLogin]);
  
  if (loading) {
    return <LoadingPage />;
  }
  
  return <HomePage />;
};

const ProtectedRoute = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isChecking, setIsChecking] = useState(true);
  const userStore = RootStore.Get(UserStore);

  useEffect(() => {
    setNavigate(navigate);
  }, [navigate]);

  useEffect(() => {
    const checkAuth = async () => {
      const publicRoutes = ['/signin', '/signup', '/share', '/_offline', '/oauth-callback', '/ai-share', '/oauth-callback'];
      const isPublicRoute = publicRoutes.some(route =>
        location.pathname === route || location.pathname.startsWith('/share/') || location.pathname.startsWith('/ai-share/')
      );
      if (!userStore.isLogin && !isPublicRoute) {
        const tokenData = await getTokenData();
        console.log('tokenData', tokenData);

        if (!tokenData?.user?.id) {
          console.log('No valid token, redirecting to login page');
          navigate('/signin', { replace: true });
        }
      }

      setIsChecking(false);
    };

    checkAuth();
  }, [userStore.isLogin]);

  if (isChecking) {
    return <LoadingPage />;
  }

  return children;
};

// Detect current window type
type WindowType = 'main' | 'quicknote' | 'quickai' | 'quicktool';

const getWindowType = (): WindowType => {
  if (!isInTauri()) return 'main';

  try {
    const label = getCurrentWebviewWindow().label;
    if (label === 'quicktool' || label === 'quicknote' || label === 'quickai') {
      return label;
    }
    // Any non-quick label (e.g. "main") should stay on main routing.
    return 'main';
  } catch {
    // Fallback to URL path if the window API is unavailable.
  }

  // Fallback: check URL path to determine window type
  const path = window.location.pathname;
  if (path.startsWith('/quicktool')) return 'quicktool';
  if (path.startsWith('/quicknote')) return 'quicknote';
  if (path.startsWith('/quickai')) return 'quickai';
  return 'main';
};

function AppRoutes() {
  const navigate = useNavigate();
  const windowType = getWindowType();
  const shouldEnableDesktopHotkeys = windowType === 'main' && isDesktop();

  // Keep hook order stable and let hooks self-disable based on window type.
  useQuickaiHotkey(shouldEnableDesktopHotkeys);
  useQuicknoteHotkey(shouldEnableDesktopHotkeys);

  // Listen for navigation commands from Tauri (only for current window type)
  useEffect(() => {
    if (!isInTauri()) return;

    let isMounted = true;
    let unlistenNavigation: (() => void) | null = null;

    const setupListener = async () => {
      try {
        if (!isMounted) return;

        unlistenNavigation = await listen('navigate-to-route', (event) => {
          const { route, replace = false, targetWindow } = event.payload as {
            route: string;
            replace?: boolean;
            targetWindow?: string;
          };

          // Only handle navigation for current window type or if no target specified
          if (!targetWindow || targetWindow === windowType) {
            console.log(`🔄 [${windowType}] Received navigation command:`, route, 'replace:', replace);

            if (replace) {
              navigate(route, { replace: true });
            } else {
              navigate(route);
            }

            // Emit event to notify components to refresh configuration
            if (windowType === 'quicktool') {
              console.log("🔄 Emitting config refresh event for quicktool");
              // This will be picked up by quicktool component to refresh its config
              window.dispatchEvent(new CustomEvent('quicktool-config-refresh'));
            }
          }
        });
      } catch (error) {
        console.error('Failed to setup navigation listener:', error);
      }
    };

    setupListener();

    return () => {
      isMounted = false;

      // Only try to unlisten if we have a valid function
      try {
        if (unlistenNavigation && typeof unlistenNavigation === 'function') {
          unlistenNavigation();
        }
      } catch (error) {
        console.error('Error cleaning up navigation listener:', error);
      }
    };
  }, [navigate, windowType]);

  // Return different routes based on window type
  switch (windowType) {
    case 'quicktool':
      return (
        <Suspense fallback={<LoadingPage />}>
          <Routes>
            <Route path="/quicktool" element={<QuickToolPage />} />
            <Route path="*" element={<Navigate to="/quicktool" replace />} />
          </Routes>
        </Suspense>
      );

    case 'quicknote':
      return (
        <Suspense fallback={<LoadingPage />}>
          <Routes>
            <Route path="/quicknote" element={<QuickNotePage />} />
            <Route path="*" element={<Navigate to="/quicknote" replace />} />
          </Routes>
        </Suspense>
      );

    case 'quickai':
      return (
        <Suspense fallback={<LoadingPage />}>
          <Routes>
            <Route path="/quickai" element={<QuickAIPage />} />
            <Route path="*" element={<Navigate to="/quickai" replace />} />
          </Routes>
        </Suspense>
      );

    default: // main window
      return (
        <Suspense fallback={<LoadingPage />}>
          <Routes>
            <Route path="/" element={<ProtectedRoute><HomeRedirect /></ProtectedRoute>} />
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/signup" element={<SignUpPage />} />
            <Route path="/hub" element={<ProtectedRoute><HubPage /></ProtectedRoute>} />
            <Route path="/ai" element={<ProtectedRoute><AIPage /></ProtectedRoute>} />
            <Route path="/resources" element={<ProtectedRoute><ResourcesPage /></ProtectedRoute>} />
            <Route path="/review" element={<ProtectedRoute><ReviewPage /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            <Route path="/plugin" element={<ProtectedRoute><PluginPage /></ProtectedRoute>} />
            <Route path="/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
            <Route path="/all" element={<ProtectedRoute><AllPage /></ProtectedRoute>} />
            <Route path="/oauth-callback" element={<OAuthCallbackPage />} />
            <Route path="/detail/*" element={<ProtectedRoute><DetailPage /></ProtectedRoute>} />
            <Route path="/share" element={<ShareIndexPage />} />
            <Route path="/share/:id" element={<ShareDetailPage />} />
            <Route path="/ai-share/:id" element={<AiSharePage />} />
            <Route path="/quicknote" element={<Navigate to="/" replace />} />
            <Route path="/quickai" element={<Navigate to="/" replace />} />
            <Route path="/quicktool" element={<Navigate to="/" replace />} />
            {import.meta.env.MODE !== 'production' && (
              <Route path="/__e2e__/protected-images" element={<E2EProtectedImagesPage />} />
            )}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      );
  }
}

function App() {
  initStore();

  const [baseReady, setBaseReady] = useState(false);

  const readStoredCredentials = async () => {
    try {
      // Try localStorage first
      const rawUser = localStorage.getItem('username');
      const rawPassword = localStorage.getItem('password');
      const username = rawUser ? JSON.parse(rawUser) : null;
      const password = rawPassword ? JSON.parse(rawPassword) : null;
      if (typeof username === 'string' && typeof password === 'string') {
        return { username, password };
      }

      // If no stored credentials and running in Tauri, try to get auto-generated credentials
      if (isInTauri()) {
        try {
          const creds = await invoke<[string, string] | null>('get_local_credentials');
          if (creds && creds.length === 2) {
            return { username: creds[0], password: creds[1] };
          }
        } catch (error) {
          console.error('Failed to get local credentials:', error);
        }
      }
    } catch (error) {
      // ignore malformed storage
    }
    return null;
  };
  
  // Initialize Android shortcuts handler
  useAndroidShortcuts();
  // iOS Share Extension inbox (App Group payload)
  useIOSShareInbox();

  // Initialize hotkey setup for desktop app only
  if (isDesktop()) {
    useInitialHotkeySetup();
  }

  useEffect(() => {
    RootStore.Get(PluginManagerStore).initInstalledPlugins();
  }, []);

  useEffect(() => {
    let resolvedBase = '';
    resolveBaseUrl()
      .then((base) => {
        resolvedBase = base;
        if (base && (base.startsWith('http://') || base.startsWith('https://'))) {
          reinitializeTrpcApi();
          if (isInTauri()) {
            eventBus.emit('local-api:ready', base);
          }
        }
      })
      .then(async () => {
        if (!isInTauri() || !isLocalMode()) return;
        if (!resolvedBase || !(resolvedBase.startsWith('http://') || resolvedBase.startsWith('https://'))) {
          return;
        }
        try {
          const health = await fetch(getBlinkoEndpoint('/health'), { signal: AbortSignal.timeout(2000) });
          if (!health.ok) {
            setLocalHttpUnavailable(true);
          }
        } catch (error) {
          setLocalHttpUnavailable(true);
        }
        const creds = await readStoredCredentials();
        if (creds) {
          await signIn('credentials', {
            username: creds.username,
            password: creds.password,
            redirect: false,
          });
        }
      })
      .catch(console.error)
      .finally(() => setBaseReady(true));
  }, []);

  useEffect(() => {
    if (!baseReady || !isInTauri()) return;
    let cancelled = false;
    let tries = 0;
    const tick = async () => {
      tries += 1;
      if (cancelled || tries > 20) return;
      try {
        const baseUrl = await invoke<string | null>("get_local_api_base_url");
        if (baseUrl) {
          saveBlinkoEndpoint(baseUrl);
          setLocalHttpUnavailable(false);
          reinitializeTrpcApi();
          eventBus.emit('local-api:ready', baseUrl);
          const creds = await readStoredCredentials();
          if (creds) {
            await signIn('credentials', {
              username: creds.username,
              password: creds.password,
              redirect: false,
            });
          }
          return;
        }
      } catch {
        // ignore and retry
      }
      setTimeout(tick, 500);
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, [baseReady]);

  useEffect(() => {
    if (!isInTauri()) return;
    const handler = () => {
      if (document.visibilityState === 'visible') {
        invoke('sync_now').catch(console.error);
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  if (!baseReady) {
    return <LoadingPage />;
  }

  return (
    <>
      {import.meta.env.DEV && (
        <Suspense fallback={null}>
          <DevInspector />
        </Suspense>
      )}
      <BrowserRouter>
        <HeroUIProvider>
          <ThemeProvider attribute="class" enableSystem={false}>
            <AppProvider />
            <CommonLayout>
              <div className="app-content">
                <AppRoutes />
                <BlinkoMultiSelectPop />
              </div>
            </CommonLayout>
          </ThemeProvider>
        </HeroUIProvider>
        <BlinkoMusicPlayer />
      </BrowserRouter>
    </>
  );
}

export default App;
