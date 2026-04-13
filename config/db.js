const { createClient } = require('@libsql/client')

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:linepro.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
})

async function initDB() {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      clerk_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      nickname TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      avatar_color TEXT NOT NULL DEFAULT '#06C755',
      avatar_url TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'offline',
      status_message TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS friendships (
      id TEXT PRIMARY KEY,
      user1_id TEXT NOT NULL,
      user2_id TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(user1_id, user2_id)
    );

    CREATE TABLE IF NOT EXISTS friend_requests (
      id TEXT PRIMARY KEY,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(from_id, to_id)
    );

    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      avatar_color TEXT NOT NULL DEFAULT '#06C755',
      avatar_url TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(group_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      receiver_id TEXT,
      group_id TEXT,
      text TEXT NOT NULL DEFAULT '',
      media_url TEXT NOT NULL DEFAULT '',
      reply_to_id TEXT,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      is_recalled INTEGER NOT NULL DEFAULT 0,
      timestamp INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS message_reactions (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      emoji TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(message_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS message_reads (
      message_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      PRIMARY KEY(message_id, user_id)
    );
  `)
  
  // Safe migrations
  try { await db.execute("ALTER TABLE groups ADD COLUMN avatar_url TEXT NOT NULL DEFAULT '';") } catch (e) {}
  try { await db.execute("ALTER TABLE messages ADD COLUMN reply_to_id TEXT;") } catch (e) {}
  try { await db.execute("ALTER TABLE messages ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;") } catch (e) {}
  try { await db.execute("ALTER TABLE messages ADD COLUMN is_recalled INTEGER NOT NULL DEFAULT 0;") } catch (e) {}

  console.log('✅ Turso DB initialized')
}

// Helper: convert a DB row to a User object (matches MongoDB _id shape)
function rowToUser(row) {
  return {
    _id: row.id,
    clerkId: row.clerk_id,
    name: row.name,
    nickname: row.nickname,
    email: row.email,
    avatarColor: row.avatar_color,
    avatarUrl: row.avatar_url || '',
    status: row.status,
    statusMessage: row.status_message,
  }
}

module.exports = { db, initDB, rowToUser }
