/** Fields Better Auth stores on a user row that the profile shape reads. */
type ProfileInput = {
  id: string;
  name: string;
  email: string;
  timezone?: string | null;
  notificationTime?: string | null;
  tintIndex?: number | null;
};

/**
 * The profile shape the client's `User` type expects (`name` is the username).
 * Shared by every route that returns a user (users.ts, friends.ts) so the wire
 * shape stays identical across endpoints.
 */
export function profile(u: ProfileInput) {
  return {
    id: u.id,
    username: u.name,
    email: u.email,
    timezone: u.timezone ?? 'UTC',
    notificationTime: u.notificationTime ?? '08:00',
    tintIndex: u.tintIndex ?? 0,
  };
}
