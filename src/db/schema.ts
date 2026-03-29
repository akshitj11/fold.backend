import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const memoryTypeEnum = pgEnum("memory_type", ["text", "photo", "video", "audio"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["active", "cancelled", "past_due"]);
export const pushPlatformEnum = pgEnum("push_platform", ["ios", "android"]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  pushToken: text("push_token"),
  walletAddress: text("wallet_address").unique(),
  privyUserId: text("privy_user_id").unique(),
  ceramicDid: text("ceramic_did"),
  lastSeen: timestamp("last_seen"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull(),
  count: integer("count").notNull().default(0),
  lastRequest: timestamp("last_request").notNull().defaultNow(),
});

export const userProfile = pgTable("user_profile", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  foldScore: integer("fold_score").notNull().default(0),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastActiveDate: text("last_active_date"),
  totalEntries: integer("total_entries").notNull().default(0),
  totalAudioMinutes: integer("total_audio_minutes").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const userActivity = pgTable("user_activity", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  entryCount: integer("entry_count").notNull().default(0),
  activityLevel: integer("activity_level").notNull().default(0),
});

export const userBadge = pgTable("user_badge", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  badgeType: text("badge_type").notNull(),
  earnedAt: timestamp("earned_at").notNull().defaultNow(),
});

export const timelineEntry = pgTable("timeline_entry", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  mood: text("mood"),
  location: text("location"),
  caption: text("caption"),
  content: text("content"),
  title: text("title"),
  storyContent: text("story_content"),
  pageCount: integer("page_count"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const share = pgTable("share", {
  id: text("id").primaryKey(),
  entryId: text("entry_id").notNull().references(() => timelineEntry.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  status: text("status").notNull().default("active"),
  viewCount: integer("view_count").notNull().default(0),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const entryMedia = pgTable("entry_media", {
  id: text("id").primaryKey(),
  entryId: text("entry_id").notNull().references(() => timelineEntry.id, { onDelete: "cascade" }),
  uri: text("uri").notNull(),
  type: text("type").notNull(),
  thumbnailUri: text("thumbnail_uri"),
  duration: integer("duration"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const connection = pgTable("connection", {
  id: text("id").primaryKey(),
  requesterId: text("requester_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  receiverId: text("receiver_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  inviteCode: text("invite_code").unique(),
  acceptedAt: timestamp("accepted_at"),
  endedAt: timestamp("ended_at"),
  cooldownUntil: timestamp("cooldown_until"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const userSettings = pgTable("user_settings", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  autoLocation: boolean("auto_location").notNull().default(false),
  screenshotProtection: boolean("screenshot_protection").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const connectMemory = pgTable("connect_memory", {
  id: text("id").primaryKey(),
  connectionId: text("connection_id").notNull().references(() => connection.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  entryId: text("entry_id").notNull().references(() => timelineEntry.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const adminLog = pgTable("admin_log", {
  id: text("id").primaryKey(),
  action: text("action").notNull(),
  entity: text("entity"),
  entityId: text("entity_id"),
  detail: text("detail"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const notificationLog = pgTable("notification_log", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  audience: text("audience").notNull(),
  sentCount: integer("sent_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const cmsEntry = pgTable("cms_entry", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const featureFlag = pgTable("feature_flag", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  enabled: boolean("enabled").notNull().default(false),
  description: text("description"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const apkRelease = pgTable("apk_release", {
  id: text("id").primaryKey(),
  version: text("version").notNull(),
  url: text("url").notNull(),
  changeLog: text("change_log"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export const memories = pgTable("memories", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  ipfsCid: text("ipfs_cid").notNull(),
  manifestCid: text("manifest_cid"),
  ceramicStream: text("ceramic_stream"),
  txHash: text("tx_hash"),
  memoryType: memoryTypeEnum("memory_type").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  syncedAt: timestamp("synced_at"),
});

export const sharedMemories = pgTable("shared_memories", {
  id: uuid("id").defaultRandom().primaryKey(),
  memoryId: uuid("memory_id").notNull().references(() => memories.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  recipientId: text("recipient_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  recipientKeyCid: text("recipient_key_cid").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  revokedAt: timestamp("revoked_at"),
});

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  stripeSubId: text("stripe_sub_id").notNull().unique(),
  status: subscriptionStatusEnum("status").notNull().default("active"),
  sbtMinted: boolean("sbt_minted").notNull().default(false),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const pushTokens = pgTable("push_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  platform: pushPlatformEnum("platform").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const gasLog = pgTable("gas_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  txHash: text("tx_hash").notNull(),
  gasUsed: integer("gas_used").notNull().default(0),
  gasCostMatic: integer("gas_cost_matic").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
