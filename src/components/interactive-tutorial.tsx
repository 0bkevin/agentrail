"use client";

import { useEffect, useMemo, useState } from "react";
import { Joyride, type EventData, type Step } from "react-joyride";
import { usePathname, useRouter } from "next/navigation";
import { useAppKitAccount } from "@reown/appkit/react";

const TUTORIAL_ROUTES = [
  { path: "/buyer", label: "Buyer" },
  { path: "/provider", label: "Provider" },
  { path: "/operator", label: "Operator" },
  { path: "/arbiter", label: "Arbiter" },
];

const TUTORIAL_DISABLED_KEY = "agentrail:tutorial:disabled";
const TUTORIAL_PANEL_OPEN_KEY = "agentrail:tutorial:panel-open";
const TUTORIAL_MASTER_AUTOSTARTED_KEY = "agentrail:tutorial:master:auto-started";
const TUTORIAL_NUDGE_DISMISSED_KEY = "agentrail:tutorial:nudge-dismissed";

function seenKey(path: string) {
  return `agentrail:tutorial:seen:${path}`;
}

function stepsFor(pathname: string): Step[] {
  if (pathname === "/buyer") {
    return [
      {
        target: "#tour-nav-role-links",
        content: "Switch roles at any time. This walkthrough starts in Buyer, then covers Provider, Operator, and Arbiter end-to-end.",
        skipBeacon: true,
      },
      {
        target: "#tour-wallet-auth",
        content: "You are authenticated. Protected actions are signature-gated and tied to the active wallet identity.",
      },
      {
        target: "#tour-buyer-prompt",
        content: "Describe the service request and generate a proposal with price, stake, and provider route.",
      },
      {
        target: "#tour-orders-queue",
        content: "After funding, track lifecycle states here and decide to approve early settlement or open a dispute.",
      },
    ];
  }

  if (pathname === "/provider") {
    return [
      {
        target: "#tour-provider-identity",
        content: "Choose provider identity. The selected signer must match the assigned provider wallet.",
        skipBeacon: true,
      },
      {
        target: "#tour-orders-queue",
        content: "Accept funded work, post stake, and submit signed fulfillment proof from provider services.",
      },
      {
        target: "#tour-order-actions",
        content: "Actions unlock by order state. As Provider, accept funded work, post stake, then submit signed proofs.",
      },
    ];
  }

  if (pathname === "/operator") {
    return [
      {
        target: "#tour-operator-filter",
        content: "Filter by state to monitor queue health and focus operational intervention.",
        skipBeacon: true,
      },
      {
        target: "#tour-orders-queue",
        content: "Operators verify progress, open challenge windows, and settle when conditions are met.",
      },
      {
        target: "#tour-order-actions",
        content: "Use these controls to open challenge windows, settle valid orders, or escalate suspicious outcomes.",
      },
    ];
  }

  if (pathname === "/arbiter") {
    return [
      {
        target: "#tour-orders-queue",
        content: "Arbiter only handles disputed orders. This keeps the happy path fast and cheap.",
        skipBeacon: true,
      },
      {
        target: "#tour-resolve-provider",
        content: "Resolve in provider favor to release payment and stake.",
      },
      {
        target: "#tour-resolve-buyer",
        content: "Resolve in buyer favor to refund payment and apply configured provider slash. This closes the full lifecycle.",
      },
    ];
  }

  return [];
}

export function InteractiveTutorial() {
  const router = useRouter();
  const pathname = usePathname();
  const { address, isConnected } = useAppKitAccount();
  const steps = useMemo(() => stepsFor(pathname), [pathname]);
  const [run, setRun] = useState(false);
  const [masterActive, setMasterActive] = useState(false);
  const [progressVersion, setProgressVersion] = useState(0);
  const [tutorialDisabled, setTutorialDisabled] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [showFirstRunNudge, setShowFirstRunNudge] = useState(false);
  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  const connectedAddress = (isConnected && address ? address : null) as `0x${string}` | null;
  const isAppTutorialRoute = TUTORIAL_ROUTES.some((route) => route.path === pathname);

  useEffect(() => {
    let active = true;

    async function syncSession() {
      if (!connectedAddress) {
        if (!active) return;
        setSessionAddress(null);
        setSessionLoading(false);
        return;
      }

      setSessionLoading(true);
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const json = (await response.json()) as { authenticated?: boolean; address?: string | null };

        if (!active) return;
        if (response.ok && json.authenticated && json.address) {
          setSessionAddress(json.address);
        } else {
          setSessionAddress(null);
        }
      } catch {
        if (active) {
          setSessionAddress(null);
        }
      } finally {
        if (active) {
          setSessionLoading(false);
        }
      }
    }

    void syncSession();

    const handleAuthChange = () => {
      void syncSession();
    };

    window.addEventListener("auth-change", handleAuthChange as EventListener);
    return () => {
      active = false;
      window.removeEventListener("auth-change", handleAuthChange as EventListener);
    };
  }, [connectedAddress]);

  const isAuthenticated = Boolean(
    connectedAddress && sessionAddress && connectedAddress.toLowerCase() === sessionAddress.toLowerCase(),
  );

  const progress = useMemo(() => {
    if (typeof window === "undefined") {
      return TUTORIAL_ROUTES.map((item) => ({ ...item, done: false }));
    }
    return TUTORIAL_ROUTES.map((item) => ({
      ...item,
      done: window.localStorage.getItem(seenKey(item.path)) === "1",
    }));
  }, [progressVersion]);

  const completedCount = progress.filter((item) => item.done).length;

  useEffect(() => {
    const active = window.localStorage.getItem("agentrail:tutorial:master") === "1";
    const disabled = window.localStorage.getItem(TUTORIAL_DISABLED_KEY) === "1";
    const open = window.localStorage.getItem(TUTORIAL_PANEL_OPEN_KEY) === "1";
    setMasterActive(active);
    setTutorialDisabled(disabled);
    setPanelOpen(open);
    setProgressVersion((prev) => prev + 1);
  }, [pathname]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (tutorialDisabled) return;
    if (!steps.length) return;
    if (masterActive && !run) {
      const timer = window.setTimeout(() => setRun(true), 350);
      return () => window.clearTimeout(timer);
    }
  }, [isAuthenticated, pathname, steps.length, masterActive, tutorialDisabled, run]);

  useEffect(() => {
    if (!isAuthenticated || tutorialDisabled) return;

    const alreadyAutoStarted = window.localStorage.getItem(TUTORIAL_MASTER_AUTOSTARTED_KEY) === "1";
    const hasSeenAny = TUTORIAL_ROUTES.some((route) => window.localStorage.getItem(seenKey(route.path)) === "1");
    const nudgeDismissed = window.localStorage.getItem(TUTORIAL_NUDGE_DISMISSED_KEY) === "1";

    if (!alreadyAutoStarted && !hasSeenAny && !nudgeDismissed) {
      window.localStorage.setItem(TUTORIAL_MASTER_AUTOSTARTED_KEY, "1");
      setPanel(true);
      setShowFirstRunNudge(true);
      return;
    }

    setShowFirstRunNudge(false);
  }, [isAuthenticated, tutorialDisabled]);

  function resetTutorialProgress() {
    for (const route of TUTORIAL_ROUTES) {
      window.localStorage.removeItem(seenKey(route.path));
    }
    setProgressVersion((prev) => prev + 1);
  }

  function beginMasterTour() {
    resetTutorialProgress();
    window.localStorage.setItem("agentrail:tutorial:master", "1");
    window.localStorage.setItem("agentrail:tutorial:master:index", "0");
    window.localStorage.removeItem(TUTORIAL_NUDGE_DISMISSED_KEY);
    window.localStorage.removeItem(TUTORIAL_DISABLED_KEY);
    setMasterActive(true);
    setTutorialDisabled(false);
    setShowFirstRunNudge(false);
    setRun(false);
    if (pathname !== "/buyer") {
      router.push("/buyer");
      return;
    }
    window.setTimeout(() => setRun(true), 250);
  }

  function stopMasterTour() {
    window.localStorage.removeItem("agentrail:tutorial:master");
    window.localStorage.removeItem("agentrail:tutorial:master:index");
    setMasterActive(false);
    setRun(false);
  }

  function setPanel(open: boolean) {
    setPanelOpen(open);
    if (open) {
      window.localStorage.setItem(TUTORIAL_PANEL_OPEN_KEY, "1");
    } else {
      window.localStorage.removeItem(TUTORIAL_PANEL_OPEN_KEY);
    }
  }

  function disableTutorialsCompletely() {
    stopMasterTour();
    window.localStorage.setItem(TUTORIAL_DISABLED_KEY, "1");
    window.localStorage.setItem(TUTORIAL_NUDGE_DISMISSED_KEY, "1");
    setTutorialDisabled(true);
    setShowFirstRunNudge(false);
    setPanel(false);
  }

  function enableTutorials() {
    window.localStorage.removeItem(TUTORIAL_DISABLED_KEY);
    window.localStorage.removeItem(TUTORIAL_NUDGE_DISMISSED_KEY);
    setTutorialDisabled(false);
    setShowFirstRunNudge(false);
    setPanel(true);
  }

  function dismissFirstRunNudge() {
    window.localStorage.setItem(TUTORIAL_NUDGE_DISMISSED_KEY, "1");
    setShowFirstRunNudge(false);
  }

  function onEvent(data: EventData) {
    const finished = data.status === "finished";
    const skipped = data.status === "skipped";

    if (skipped) {
      setRun(false);
      if (masterActive) {
        stopMasterTour();
      }
      return;
    }

    if (finished) {
      window.localStorage.setItem(seenKey(pathname), "1");
      setProgressVersion((prev) => prev + 1);
      setRun(false);

      if (!masterActive) {
        return;
      }

      const currentIndex = TUTORIAL_ROUTES.findIndex((item) => item.path === pathname);
      const nextIndex = currentIndex + 1;
      if (nextIndex >= TUTORIAL_ROUTES.length) {
        stopMasterTour();
        return;
      }

      window.localStorage.setItem("agentrail:tutorial:master:index", String(nextIndex));
      router.push(TUTORIAL_ROUTES[nextIndex].path);
    }
  }

  if (pathname === "/") return null;
  if (!isAppTutorialRoute) return null;
  if (sessionLoading) return null;
  if (!isAuthenticated) return null;
  if (!steps.length && tutorialDisabled) return null;

  return (
    <>
      {!tutorialDisabled && steps.length > 0 && (
        <Joyride
          steps={steps}
          run={run}
          continuous
          scrollToFirstStep
          options={{
            showProgress: true,
            overlayClickAction: false,
            buttons: ["back", "close", "primary", "skip"],
            backgroundColor: "#0b0b0b",
            primaryColor: "#d32f2f",
            textColor: "#f5f5f5",
            overlayColor: "rgba(0, 0, 0, 0.75)",
            zIndex: 10000,
          }}
          styles={{
            tooltip: {
              border: "2px solid #d32f2f",
              borderRadius: 0,
            },
          }}
          locale={{
            back: "Back",
            close: "Close",
            last: "Done",
            next: "Next",
            skip: "Skip",
          }}
          onEvent={onEvent}
        />
      )}

      <button
        type="button"
        onClick={() => setPanel(!panelOpen)}
        className="fixed bottom-4 left-4 z-[9998] border-2 border-brut-red bg-black px-3 py-2 text-[10px] font-black uppercase tracking-widest text-brut-red shadow-[4px_4px_0px_0px_var(--brut-red)] hover:bg-brut-red hover:text-black"
      >
        {panelOpen ? "Hide Guide" : tutorialDisabled ? "Enable Guide" : "Open Guide"}
      </button>

      {panelOpen && (
        <section className="fixed bottom-16 left-4 z-[9998] w-[min(92vw,340px)] border-2 border-brut-red bg-black/95 p-4 text-white shadow-[6px_6px_0px_0px_var(--brut-red)]">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-brut-red">Tutorial Progress</p>
          {showFirstRunNudge && !tutorialDisabled && (
            <div className="mt-3 border border-brut-red bg-brut-red/10 p-3">
              <p className="text-[11px] font-mono uppercase text-white/90">
                New here? Start a guided 4-role walkthrough to learn the full order lifecycle.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={beginMasterTour}
                  className="flex-1 border border-brut-red bg-brut-red px-2 py-1 text-[10px] font-black uppercase tracking-widest text-black hover:bg-white"
                >
                  Start Tour
                </button>
                <button
                  type="button"
                  onClick={dismissFirstRunNudge}
                  className="flex-1 border border-brut-red bg-black px-2 py-1 text-[10px] font-black uppercase tracking-widest text-brut-red hover:bg-brut-red hover:text-black"
                >
                  Not Now
                </button>
              </div>
            </div>
          )}
          <p className="mt-2 text-sm font-bold uppercase">
            {completedCount}/{TUTORIAL_ROUTES.length} routes completed
          </p>
          <div className="mt-3 space-y-2">
            {progress.map((item) => (
              <div key={item.path} className="flex items-center justify-between border border-brut-accent px-2 py-1 text-[11px] font-mono uppercase">
                <span>{item.label}</span>
                <span className={item.done ? "text-green-400" : "text-white/40"}>{item.done ? "DONE" : "PENDING"}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {tutorialDisabled ? (
              <button
                type="button"
                onClick={enableTutorials}
                className="flex-1 border-2 border-brut-red bg-brut-red px-2 py-2 text-[10px] font-black uppercase tracking-widest text-black hover:bg-white"
              >
                Enable Tutorials
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setRun(true)}
                  className="flex-1 border-2 border-brut-red bg-black px-2 py-2 text-[10px] font-black uppercase tracking-widest text-brut-red hover:bg-brut-red hover:text-black"
                >
                  Start This Route
                </button>
                <button
                  type="button"
                  onClick={beginMasterTour}
                  className="flex-1 border-2 border-brut-red bg-brut-red px-2 py-2 text-[10px] font-black uppercase tracking-widest text-black hover:bg-white"
                >
                  {masterActive ? "Restart Master" : "Start Master"}
                </button>
                <button
                  type="button"
                  onClick={resetTutorialProgress}
                  className="border-2 border-brut-red bg-black px-2 py-2 text-[10px] font-black uppercase tracking-widest text-brut-red hover:bg-brut-red hover:text-black"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={disableTutorialsCompletely}
                  className="border-2 border-brut-red bg-black px-2 py-2 text-[10px] font-black uppercase tracking-widest text-brut-red hover:bg-brut-red hover:text-black"
                >
                  Disable All
                </button>
              </>
            )}
          </div>
        </section>
      )}
    </>
  );
}
