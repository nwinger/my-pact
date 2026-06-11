export type User = {
  id: string;
  username: string;
  email: string;
  timezone: string;
  notificationTime: string; // "HH:MM"
  tintIndex: number; // avatar tint
};

export type FriendshipStatus = 'pending' | 'accepted' | 'declined';

export type Friendship = {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: FriendshipStatus;
  createdAt: string; // date key
};

export type PactType = 'frequency' | 'goal';
export type PactStatus = 'active' | 'completed' | 'incomplete' | 'cancelled';

export type Pact = {
  id: string;
  creatorUserId: string;
  keeperUserId: string;
  title: string;
  description?: string;
  type: PactType;
  status: PactStatus;
  startDate: string; // date key
  endDate: string; // date key
  /** frequency pacts: 0 = Sunday … 6 = Saturday */
  daysOfWeek?: number[];
  /** goal pacts */
  goalTarget?: number;
  goalUnit?: string;
  isMutual: boolean;
  mutualPactId?: string;
  tintIndex: number;
};

export type CheckInStatus = 'completed' | 'failed';

export type CheckIn = {
  id: string;
  pactId: string;
  userId: string;
  date: string; // date key
  status: CheckInStatus;
  progressValue?: number;
};

export type NotificationType =
  | 'daily_reminder'
  | 'friend_request'
  | 'friend_accepted'
  | 'pact_breach'
  | 'pact_completed';

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  sentAt: string; // ISO-ish display string
  readAt?: string;
  pactId?: string;
  friendId?: string;
};
