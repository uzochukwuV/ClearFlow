
// Temporary no-op stub so existing pages compile while the real API services
// are wired up. Each method returns empty/null and is NOT a real backend call.
// Pages will be migrated off this stub onto src/api/* + React Query hooks.
export const db = {
  auth: {
    isAuthenticated: async () => false,
    me: async () => null,
    loginViaEmailPassword: async () => { throw new Error('Not implemented — use wallet auth'); },
    loginWithProvider: async () => { throw new Error('Not implemented — use wallet auth'); },
    register: async () => { throw new Error('Not implemented — use wallet auth'); },
    verifyOtp: async () => { throw new Error('Not implemented'); },
    resendOtp: async () => { throw new Error('Not implemented'); },
    setToken: () => {},
    resetPasswordRequest: async () => { throw new Error('Not implemented'); },
    resetPassword: async () => { throw new Error('Not implemented'); },
    updateMe: async () => { throw new Error('Not implemented — use /identity/onboard'); },
  },
  entities: new Proxy(
    {},
    {
      get: () => ({
        filter: async () => [],
        list: async () => [],
        get: async () => null,
        create: async () => ({}),
        update: async () => ({}),
        delete: async () => ({}),
      }),
    }
  ),
  integrations: {
    Core: { UploadFile: async () => ({ file_url: '' }) },
  },
};

export default db;
