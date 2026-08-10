import React, { useEffect, useCallback, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Wallet, Loader2, Layers } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { useWallet } from '@/lib/wallet';
import { useAuth } from '@/lib/AuthContext';
import { safeReturnTo } from '@/lib/authReturnTo';
import { useIdentityStatus } from '@/api/hooks';
import { isApassActive } from '@/lib/identity';

export default function Login() {
  const navigate = useNavigate();
  const { connect, connecting, address, hasWallet, error, sign } = useWallet();
  const { isAuthenticated, markOnboarded } = useAuth();
  const identityStatus = useIdentityStatus();
  const returnTo = safeReturnTo();
  const [checkingApass, setCheckingApass] = useState(false);

  const goToApp = useCallback(() => {
    navigate(returnTo === '/' ? '/app' : returnTo, { replace: true });
  }, [navigate, returnTo]);

  const lastCheckedAddressRef = useRef(null);

  useEffect(() => {
    if (isAuthenticated) {
      goToApp();
      return;
    }

    if (!address || !sign) return;
    if (lastCheckedAddressRef.current === address) return;
    lastCheckedAddressRef.current = address;

    let cancelled = false;
    const run = async () => {
      setCheckingApass(true);
      try {
        console.log('Checking A-Pass for address:', address);
        const result = await identityStatus.mutateAsync({ walletAddress: address, signer: sign });
        // if (cancelled) return;
        console.log('A-Pass preflight result:', result, result?.data?.registered, result?.data?.status);    
        if (result?.data?.registered && isApassActive(result.data.status)) {
          markOnboarded({
            apassId: result.data.apassId,
            status: result.data.status,
            tier: result.data.tier,
          });
          goToApp();
          return;
        }

        navigate('/onboarding', { replace: true });
      } catch (error) {
        console.error('Error checking A-Pass:', error);
        if (!cancelled) navigate('/onboarding', { replace: true });
      } finally {
        if (!cancelled) setCheckingApass(false);
        
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [address, sign, isAuthenticated, goToApp, identityStatus, markOnboarded, navigate]);


  const handleConnect = async () => {
    try {
      await connect();
      // The effect above will run the A-Pass preflight once address is set.
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
            disabled={connecting || checkingApass}
          >
            {connecting || checkingApass ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {connecting ? 'Connecting�' : 'Checking A-Pass�'}
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
