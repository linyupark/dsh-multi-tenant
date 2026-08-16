/**
 * Durable-log title fold for the per-user session list.
 *
 * Why: the stock client list RPC only carries a session's title when the
 * session's object layer is hot — i.e. the session was opened at least once
 * during this host lifetime (titles otherwise live only in the persisted
 * event log as `session/title` events). On a shared multi-user host, another
 * user's cold sessions therefore reach the sidebar with no title at all and
 * the client falls back to the workspace directory basename. The host-side
 * lister below folds titles straight from the persisted log through
 * `sessionQuery.readTitleSnapshots` (live-preferred) so every row carries its
 * latest durable title regardless of object-layer heat.
 */

/** One lister row as produced for /projects/api/my/sessions. */
export interface TitleFoldRow {
  id: string
  /** Folded durable title when one exists. */
  title?: string
}

/**
 * Structural subset of `SessionTitleObservationResult` (dsh-session-query):
 * fulfilled entries carry an optional latest title snapshot.
 */
export interface TitleFoldObservation {
  sessionId: string
  status: 'fulfilled' | 'rejected'
  value?: { title?: { title?: string } }
}

/**
 * Merge folded durable titles into lister rows: a fulfilled observation with
 * a non-empty title wins (the log is the authority); rejected observations
 * and title-less logs leave the row untouched. Row identity and order are
 * preserved.
 */
export function applyTitleFold<R extends TitleFoldRow>(
  rows: readonly R[],
  observations: readonly TitleFoldObservation[],
): R[] {
  const folded = new Map<string, string>()
  for (const observation of observations) {
    if (observation.status !== 'fulfilled') continue
    const title = observation.value?.title?.title
    if (typeof title === 'string' && title.length > 0) folded.set(observation.sessionId, title)
  }
  return rows.map((row) => {
    const title = folded.get(row.id)
    return title === undefined ? row : { ...row, title }
  })
}
