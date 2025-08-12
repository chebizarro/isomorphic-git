// Stub pack transport adapter. Intentionally minimal; will be wired to the lower-level negotiation in a follow-up.
export const packTransport = {
  async negotiate(_opts) {
    // TODO: route to lower-level fetch negotiation once compat negotiation is implemented
    // Placeholder to satisfy createFetchCompat contracts in tests if needed.
    return { updatedRefs: [] }
  },
}
