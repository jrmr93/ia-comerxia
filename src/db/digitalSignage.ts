import { pool } from './index.ts';
import crypto from 'crypto';

export interface AdvertisingVideo {
  id: number;
  userId: number;
  name: string;
  mediaType?: 'video' | 'image';
  fileUrl: string;
  thumbnailUrl?: string | null;
  duration: number;
  fileSize: number; // in MB or bytes
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdvertisingPlaylistItem {
  id: number;
  playlistId: number;
  videoId: number;
  position: number;
  video?: AdvertisingVideo;
}

export interface AdvertisingPlaylist {
  id: number;
  userId: number;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  items?: AdvertisingPlaylistItem[];
  videoCount?: number;
}

export interface AdvertisingDisplay {
  id: number;
  userId: number;
  name: string;
  token: string;
  playlistId?: number | null;
  playlistName?: string | null;
  active: boolean;
  isPaused: boolean;
  volume: number;
  isMuted: boolean;
  loopMode: boolean;
  orientation: number; // 0, 90, 180, 270
  commandAction?: string | null;
  lastSeen?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicDisplayConfig {
  display: {
    id: number;
    name: string;
    token: string;
    active: boolean;
    isPaused?: boolean;
    volume?: number;
    isMuted?: boolean;
    loopMode?: boolean;
    orientation?: number;
    commandAction?: string | null;
    lastSeen?: string | null;
  };
  controls?: {
    isPaused: boolean;
    volume: number;
    isMuted: boolean;
    loopMode: boolean;
    orientation?: number;
    commandAction?: string | null;
  };
  playlist: {
    id: number;
    name: string;
  } | null;
  videos: Array<{
    id: number;
    name: string;
    mediaType?: 'video' | 'image';
    fileUrl: string;
    thumbnailUrl?: string | null;
    duration: number;
    fileSize: number;
    position: number;
  }>;
}

/**
 * Generates a unique secure display token (e.g., ds_8f1a9b2c...)
 */
export function generateDisplayToken(): string {
  return 'ds_' + crypto.randomBytes(8).toString('hex');
}

// ----------------------------------------------------
// 1. VIDEOS CRUD
// ----------------------------------------------------

export async function getAdvertisingVideos(userId: number): Promise<AdvertisingVideo[]> {
  try {
    const res = await pool.query(
      `SELECT id, user_id as "userId", name, media_type as "mediaType", file_url as "fileUrl", thumbnail_url as "thumbnailUrl",
              duration, file_size as "fileSize", active, created_at as "createdAt", updated_at as "updatedAt"
       FROM advertising_videos
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    return res.rows.map(row => ({
      ...row,
      mediaType: (row.mediaType === 'image' ? 'image' : 'video') as 'video' | 'image',
      duration: Number(row.duration || 0),
      fileSize: Number(row.fileSize || 0),
      active: Boolean(row.active),
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
    }));
  } catch (err) {
    console.error('Error fetching advertising videos:', err);
    return [];
  }
}

export async function createAdvertisingVideo(
  userId: number,
  data: {
    name: string;
    mediaType?: 'video' | 'image';
    fileUrl: string;
    thumbnailUrl?: string | null;
    duration?: number;
    fileSize?: number;
    active?: boolean;
  }
): Promise<AdvertisingVideo> {
  const mediaType = data.mediaType === 'image' ? 'image' : 'video';
  const res = await pool.query(
    `INSERT INTO advertising_videos (user_id, name, media_type, file_url, thumbnail_url, duration, file_size, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, user_id as "userId", name, media_type as "mediaType", file_url as "fileUrl", thumbnail_url as "thumbnailUrl",
               duration, file_size as "fileSize", active, created_at as "createdAt", updated_at as "updatedAt"`,
    [
      userId,
      data.name.trim(),
      mediaType,
      data.fileUrl.trim(),
      data.thumbnailUrl ? data.thumbnailUrl.trim() : null,
      Math.max(0, Math.round(data.duration || 0)),
      Math.max(0, Number(data.fileSize || 0)),
      data.active !== undefined ? Boolean(data.active) : true,
    ]
  );
  const row = res.rows[0];
  return {
    ...row,
    mediaType: (row.mediaType === 'image' ? 'image' : 'video') as 'video' | 'image',
    duration: Number(row.duration || 0),
    fileSize: Number(row.fileSize || 0),
    active: Boolean(row.active),
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
  };
}

export async function updateAdvertisingVideo(
  id: number,
  userId: number,
  data: Partial<{
    name: string;
    mediaType: 'video' | 'image';
    active: boolean;
    duration: number;
    fileSize: number;
    thumbnailUrl: string | null;
  }>
): Promise<AdvertisingVideo | null> {
  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (data.name !== undefined) {
    fields.push(`name = $${idx++}`);
    values.push(data.name.trim());
  }
  if (data.mediaType !== undefined) {
    fields.push(`media_type = $${idx++}`);
    values.push(data.mediaType === 'image' ? 'image' : 'video');
  }
  if (data.active !== undefined) {
    fields.push(`active = $${idx++}`);
    values.push(Boolean(data.active));
  }
  if (data.duration !== undefined) {
    fields.push(`duration = $${idx++}`);
    values.push(Math.max(0, Math.round(data.duration)));
  }
  if (data.fileSize !== undefined) {
    fields.push(`file_size = $${idx++}`);
    values.push(Math.max(0, Number(data.fileSize)));
  }
  if (data.thumbnailUrl !== undefined) {
    fields.push(`thumbnail_url = $${idx++}`);
    values.push(data.thumbnailUrl ? data.thumbnailUrl.trim() : null);
  }

  if (fields.length === 0) {
    const list = await getAdvertisingVideos(userId);
    return list.find(v => v.id === id) || null;
  }

  fields.push(`updated_at = NOW()`);
  values.push(id, userId);

  const res = await pool.query(
    `UPDATE advertising_videos
     SET ${fields.join(', ')}
     WHERE id = $${idx++} AND user_id = $${idx++}
     RETURNING id, user_id as "userId", name, media_type as "mediaType", file_url as "fileUrl", thumbnail_url as "thumbnailUrl",
               duration, file_size as "fileSize", active, created_at as "createdAt", updated_at as "updatedAt"`,
    values
  );

  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  return {
    ...row,
    mediaType: (row.mediaType === 'image' ? 'image' : 'video') as 'video' | 'image',
    duration: Number(row.duration || 0),
    fileSize: Number(row.fileSize || 0),
    active: Boolean(row.active),
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
  };
}

export async function deleteAdvertisingVideo(id: number, userId: number): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM advertising_videos WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  );
  return (res.rowCount ?? 0) > 0;
}

// ----------------------------------------------------
// 2. PLAYLISTS CRUD
// ----------------------------------------------------

export async function getAdvertisingPlaylists(userId: number): Promise<AdvertisingPlaylist[]> {
  try {
    const playlistRes = await pool.query(
      `SELECT id, user_id as "userId", name, active, created_at as "createdAt", updated_at as "updatedAt"
       FROM advertising_playlists
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    const playlists: AdvertisingPlaylist[] = [];

    for (const row of playlistRes.rows) {
      const itemsRes = await pool.query(
        `SELECT pi.id, pi.playlist_id as "playlistId", pi.video_id as "videoId", pi.position,
                v.name as "videoName", v.file_url as "fileUrl", v.thumbnail_url as "thumbnailUrl",
                v.duration, v.file_size as "fileSize", v.active as "videoActive"
         FROM advertising_playlist_items pi
         JOIN advertising_videos v ON pi.video_id = v.id
         WHERE pi.playlist_id = $1
         ORDER BY pi.position ASC`,
        [row.id]
      );

      const items: AdvertisingPlaylistItem[] = itemsRes.rows.map(itemRow => ({
        id: itemRow.id,
        playlistId: itemRow.playlistId,
        videoId: itemRow.videoId,
        position: itemRow.position,
        video: {
          id: itemRow.videoId,
          userId,
          name: itemRow.videoName,
          fileUrl: itemRow.fileUrl,
          thumbnailUrl: itemRow.thumbnailUrl,
          duration: Number(itemRow.duration || 0),
          fileSize: Number(itemRow.fileSize || 0),
          active: Boolean(itemRow.videoActive),
          createdAt: '',
          updatedAt: '',
        },
      }));

      playlists.push({
        id: row.id,
        userId: row.userId,
        name: row.name,
        active: Boolean(row.active),
        createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
        items,
        videoCount: items.length,
      });
    }

    return playlists;
  } catch (err) {
    console.error('Error fetching playlists:', err);
    return [];
  }
}

export async function createAdvertisingPlaylist(
  userId: number,
  data: {
    name: string;
    active?: boolean;
    videoIds?: number[];
  }
): Promise<AdvertisingPlaylist> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const plRes = await client.query(
      `INSERT INTO advertising_playlists (user_id, name, active)
       VALUES ($1, $2, $3)
       RETURNING id, user_id as "userId", name, active, created_at as "createdAt", updated_at as "updatedAt"`,
      [userId, data.name.trim(), data.active !== undefined ? Boolean(data.active) : true]
    );
    const playlistId = plRes.rows[0].id;

    if (Array.isArray(data.videoIds) && data.videoIds.length > 0) {
      for (let pos = 0; pos < data.videoIds.length; pos++) {
        const vId = data.videoIds[pos];
        await client.query(
          `INSERT INTO advertising_playlist_items (playlist_id, video_id, position)
           VALUES ($1, $2, $3)`,
          [playlistId, vId, pos]
        );
      }
    }

    await client.query('COMMIT');

    const playlists = await getAdvertisingPlaylists(userId);
    return playlists.find(p => p.id === playlistId)!;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateAdvertisingPlaylist(
  id: number,
  userId: number,
  data: {
    name?: string;
    active?: boolean;
    videoIds?: number[];
  }
): Promise<AdvertisingPlaylist | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (data.name !== undefined || data.active !== undefined) {
      const fields: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (data.name !== undefined) {
        fields.push(`name = $${idx++}`);
        values.push(data.name.trim());
      }
      if (data.active !== undefined) {
        fields.push(`active = $${idx++}`);
        values.push(Boolean(data.active));
      }
      fields.push(`updated_at = NOW()`);
      values.push(id, userId);

      await client.query(
        `UPDATE advertising_playlists
         SET ${fields.join(', ')}
         WHERE id = $${idx++} AND user_id = $${idx++}`,
        values
      );
    }

    if (Array.isArray(data.videoIds)) {
      // Re-replace items
      await client.query(`DELETE FROM advertising_playlist_items WHERE playlist_id = $1`, [id]);
      for (let pos = 0; pos < data.videoIds.length; pos++) {
        const vId = data.videoIds[pos];
        await client.query(
          `INSERT INTO advertising_playlist_items (playlist_id, video_id, position)
           VALUES ($1, $2, $3)`,
          [id, vId, pos]
        );
      }
    }

    await client.query('COMMIT');

    const playlists = await getAdvertisingPlaylists(userId);
    return playlists.find(p => p.id === id) || null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteAdvertisingPlaylist(id: number, userId: number): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM advertising_playlists WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  );
  return (res.rowCount ?? 0) > 0;
}

// ----------------------------------------------------
// 3. DISPLAYS / PANTALLAS CRUD
// ----------------------------------------------------

export async function getAdvertisingDisplays(userId: number): Promise<AdvertisingDisplay[]> {
  try {
    const res = await pool.query(
      `SELECT d.id, d.user_id as "userId", d.name, d.token, d.playlist_id as "playlistId",
              p.name as "playlistName", d.active, d.is_paused as "isPaused",
              d.volume, d.is_muted as "isMuted", d.loop_mode as "loopMode",
              d.orientation as "orientation", d.command_action as "commandAction",
              d.last_seen as "lastSeen", d.created_at as "createdAt", d.updated_at as "updatedAt"
       FROM advertising_displays d
       LEFT JOIN advertising_playlists p ON d.playlist_id = p.id
       WHERE d.user_id = $1
       ORDER BY d.created_at DESC`,
      [userId]
    );

    return res.rows.map(row => ({
      ...row,
      active: Boolean(row.active),
      isPaused: Boolean(row.isPaused),
      volume: typeof row.volume === 'number' ? row.volume : (parseInt(row.volume, 10) || 100),
      isMuted: row.isMuted !== undefined && row.isMuted !== null ? Boolean(row.isMuted) : false,
      loopMode: row.loopMode !== undefined && row.loopMode !== null ? Boolean(row.loopMode) : true,
      orientation: typeof row.orientation === 'number' ? row.orientation : (parseInt(row.orientation, 10) || 0),
      commandAction: row.commandAction || null,
      lastSeen: row.lastSeen ? new Date(row.lastSeen).toISOString() : null,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
    }));
  } catch (err) {
    console.error('Error fetching advertising displays:', err);
    return [];
  }
}

export async function createAdvertisingDisplay(
  userId: number,
  data: {
    name: string;
    playlistId?: number | null;
    active?: boolean;
    isPaused?: boolean;
    volume?: number;
    isMuted?: boolean;
    loopMode?: boolean;
    orientation?: number;
  }
): Promise<AdvertisingDisplay> {
  const token = generateDisplayToken();
  const res = await pool.query(
    `INSERT INTO advertising_displays (user_id, name, token, playlist_id, active, is_paused, volume, is_muted, loop_mode, orientation, last_seen)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
     RETURNING id, user_id as "userId", name, token, playlist_id as "playlistId",
               active, is_paused as "isPaused", volume, is_muted as "isMuted",
               loop_mode as "loopMode", orientation, command_action as "commandAction",
               last_seen as "lastSeen", created_at as "createdAt", updated_at as "updatedAt"`,
    [
      userId,
      data.name.trim(),
      token,
      data.playlistId || null,
      data.active !== undefined ? Boolean(data.active) : true,
      data.isPaused !== undefined ? Boolean(data.isPaused) : false,
      data.volume !== undefined ? Math.max(0, Math.min(100, data.volume)) : 100,
      data.isMuted !== undefined ? Boolean(data.isMuted) : false,
      data.loopMode !== undefined ? Boolean(data.loopMode) : true,
      data.orientation !== undefined ? Number(data.orientation) : 0,
    ]
  );

  const row = res.rows[0];
  const list = await getAdvertisingDisplays(userId);
  return list.find(d => d.id === row.id) || {
    ...row,
    active: Boolean(row.active),
    isPaused: Boolean(row.isPaused),
    volume: Number(row.volume || 100),
    isMuted: Boolean(row.isMuted),
    loopMode: Boolean(row.loopMode),
    orientation: Number(row.orientation || 0),
    lastSeen: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function updateAdvertisingDisplay(
  id: number,
  userId: number,
  data: Partial<{
    name: string;
    playlistId: number | null;
    active: boolean;
    isPaused: boolean;
    volume: number;
    isMuted: boolean;
    loopMode: boolean;
    orientation: number;
    commandAction: string | null;
  }>
): Promise<AdvertisingDisplay | null> {
  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (data.name !== undefined) {
    fields.push(`name = $${idx++}`);
    values.push(data.name.trim());
  }
  if (data.playlistId !== undefined) {
    fields.push(`playlist_id = $${idx++}`);
    values.push(data.playlistId || null);
  }
  if (data.active !== undefined) {
    fields.push(`active = $${idx++}`);
    values.push(Boolean(data.active));
  }
  if (data.isPaused !== undefined) {
    fields.push(`is_paused = $${idx++}`);
    values.push(Boolean(data.isPaused));
  }
  if (data.volume !== undefined) {
    fields.push(`volume = $${idx++}`);
    values.push(Math.max(0, Math.min(100, data.volume)));
  }
  if (data.isMuted !== undefined) {
    fields.push(`is_muted = $${idx++}`);
    values.push(Boolean(data.isMuted));
  }
  if (data.loopMode !== undefined) {
    fields.push(`loop_mode = $${idx++}`);
    values.push(Boolean(data.loopMode));
  }
  if (data.orientation !== undefined) {
    fields.push(`orientation = $${idx++}`);
    values.push(Number(data.orientation));
  }
  if (data.commandAction !== undefined) {
    fields.push(`command_action = $${idx++}`);
    values.push(data.commandAction);
  }

  if (fields.length === 0) {
    const list = await getAdvertisingDisplays(userId);
    return list.find(d => d.id === id) || null;
  }

  fields.push(`updated_at = NOW()`);
  values.push(id, userId);

  await pool.query(
    `UPDATE advertising_displays
     SET ${fields.join(', ')}
     WHERE id = $${idx++} AND user_id = $${idx++}`,
    values
  );

  const list = await getAdvertisingDisplays(userId);
  return list.find(d => d.id === id) || null;
}

export async function deleteAdvertisingDisplay(id: number, userId: number): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM advertising_displays WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  );
  return (res.rowCount ?? 0) > 0;
}

// ----------------------------------------------------
// 4. PUBLIC PLAYER LOOKUP & HEARTBEAT
// ----------------------------------------------------

export async function getPublicDisplayConfigByToken(token: string): Promise<PublicDisplayConfig | null> {
  try {
    const dispRes = await pool.query(
      `SELECT d.id, d.name, d.token, d.playlist_id, d.active, d.is_paused, d.volume, d.is_muted, d.loop_mode, d.orientation, d.command_action, d.last_seen,
              p.name as playlist_name, p.active as playlist_active
       FROM advertising_displays d
       LEFT JOIN advertising_playlists p ON d.playlist_id = p.id
       WHERE d.token = $1 AND d.active = true`,
      [token.trim()]
    );

    if (dispRes.rows.length === 0) return null;
    const dispRow = dispRes.rows[0];

    const controls = {
      isPaused: Boolean(dispRow.is_paused),
      volume: typeof dispRow.volume === 'number' ? dispRow.volume : (parseInt(dispRow.volume, 10) || 100),
      isMuted: dispRow.is_muted !== null ? Boolean(dispRow.is_muted) : false,
      loopMode: dispRow.loop_mode !== null ? Boolean(dispRow.loop_mode) : true,
      orientation: typeof dispRow.orientation === 'number' ? dispRow.orientation : (parseInt(dispRow.orientation, 10) || 0),
      commandAction: dispRow.command_action || null,
    };

    const displayInfo = {
      id: dispRow.id,
      name: dispRow.name,
      token: dispRow.token,
      active: Boolean(dispRow.active),
      ...controls,
      lastSeen: dispRow.last_seen ? new Date(dispRow.last_seen).toISOString() : null,
    };

    // If there is a one-off commandAction, reset it after reading so it triggers once
    if (dispRow.command_action) {
      pool.query(`UPDATE advertising_displays SET command_action = NULL WHERE token = $1`, [token.trim()]).catch(() => {});
    }

    if (!dispRow.playlist_id || !dispRow.playlist_active) {
      return {
        display: displayInfo,
        controls,
        playlist: null,
        videos: [],
      };
    }

    // Get active videos in playlist
    const videosRes = await pool.query(
      `SELECT v.id, v.name, v.media_type, v.file_url, v.thumbnail_url, v.duration, v.file_size, pi.position
       FROM advertising_playlist_items pi
       JOIN advertising_videos v ON pi.video_id = v.id
       WHERE pi.playlist_id = $1 AND v.active = true
       ORDER BY pi.position ASC`,
      [dispRow.playlist_id]
    );

    const videos = videosRes.rows.map(v => ({
      id: v.id,
      name: v.name,
      mediaType: (v.media_type === 'image' ? 'image' : 'video') as 'video' | 'image',
      fileUrl: v.file_url,
      thumbnailUrl: v.thumbnail_url || null,
      duration: Number(v.duration || 0),
      fileSize: Number(v.file_size || 0),
      position: Number(v.position || 0),
    }));

    return {
      display: displayInfo,
      controls,
      playlist: {
        id: dispRow.playlist_id,
        name: dispRow.playlist_name || 'Playlist Principal',
      },
      videos,
    };
  } catch (err) {
    console.error('Error loading public display by token:', err);
    return null;
  }
}

export async function updateDisplayLastSeen(token: string): Promise<boolean> {
  try {
    const res = await pool.query(
      `UPDATE advertising_displays SET last_seen = NOW() WHERE token = $1 RETURNING id`,
      [token.trim()]
    );
    return (res.rowCount ?? 0) > 0;
  } catch (err) {
    return false;
  }
}
