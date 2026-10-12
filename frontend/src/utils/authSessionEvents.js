/**
 * Supabase refreshes a valid session token without changing the signed-in user.
 * Keep the currently rendered profile in place for this event; revalidate it in
 * the background so a tab focus does not force a full-screen loading state.
 */
export function shouldPreserveProfileOnAuthEvent(event, nextUserId, currentUserId) {
  return event === 'TOKEN_REFRESHED'
    && Boolean(nextUserId)
    && nextUserId === currentUserId
}
