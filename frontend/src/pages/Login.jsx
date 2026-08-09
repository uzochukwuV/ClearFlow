import React from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Wallet, Loader2, Layers } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { useWallet } from "@/lib/wallet";
import { useAuth } from "@/lib/AuthContext";
import { safeReturnTo } from "@/lib/authReturnTo";

export default function Login() {
  const navigate = useNavigate();
  const { connect, connecting, address, hasWallet, error } = useWallet();
  const { isAuthenticated } = useAuth();
  const returnTo = safeReturnTo();

  // If already connected + onboarded, go to app (or returnTo).
  React.useEffect(() => {
    if (isAuthenticated) {
      navigate(returnTo === "/" ? "/app" : returnTo, { replace: true });
    } else if (address) {
      // Connected but not onboarded → go to onboarding.
      navigate("/onboarding", { replace: true });
    }
  }, [isAuthenticated, address, navigate, returnTo]);

  const handleConnect = async () => {
    try {
      await connect();
      // The useEffect above will redirect once `address` is set.
    } catch {
      /* error shown via wallet provider state */
    }
  };

  return (
    <AuthLayout
      icon={Layers}
      title="Welcome to ClearFlow"
      subtitle="Connect your wallet to continue"
    >
      {!hasWallet ? (
        <div className="space-y-3 text-center">
          <p className="text-sm text-muted-foreground">
            No wallet extension detected. Install MetaMask to continue.
          </p>
          <a
            href="https://metamask.io/download/"
            target="_blank"
            rel="noreferrer"
            className="inline-block"
          >
            <Button variant="outline">Get MetaMask</Button>
          </a>
        </div>
      ) : (
        <>
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}
          <Button
            className="w-full h-12 font-medium"
            onClick={handleConnect}
            disabled={connecting}
          >
            {connecting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Connecting…
              </>
            ) : (
              <>
                <Wallet className="w-4 h-4 mr-2" />
                Connect wallet
              </>
            )}
          </Button>
        </>
      )}
    </AuthLayout>
  );
}
