import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { allowedOrigins, normalizeOrigin } from '../config';
import { verifyAccessToken } from '../middleware/jwtAuth';

export type RealtimeApi = {
  io: Server;
  emitToUser: (userId: string, event: string, payload: unknown) => void;
  emitToManyUsers: (userIds: string[], event: string, payload: unknown) => void;
};

function extractToken(client: Socket): string | null {
  const authToken = client.handshake.auth?.token;
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.replace(/^Bearer\s+/i, '').trim();
  }

  const header = client.handshake.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }

  return null;
}

export function initRealtime(server: HttpServer): RealtimeApi {
  const origins = allowedOrigins();
  const io = new Server(server, {
    cors: {
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (origins.includes(normalizeOrigin(origin))) return callback(null, true);
        return callback(new Error('Origin not allowed'));
      },
      credentials: true,
    },
    path: '/realtime',
  });

  io.use((client, next) => {
    try {
      const token = extractToken(client);
      if (!token) return next(new Error('Unauthorized'));

      const decoded = verifyAccessToken(token);
      client.data.userId = decoded.sub;
      return next();
    } catch {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (client: Socket) => {
    const userId = client.data.userId as string;
    client.join(`user:${userId}`);
    console.log(`[RT] socket ${client.id} connected as user:${userId}`);

    client.on('disconnect', () => {
      console.log(`[RT] socket ${client.id} (user:${userId}) disconnected`);
    });
  });

  const emitToUser = (userId: string, event: string, payload: unknown) => {
    io.to(`user:${userId}`).emit(event, payload);
  };

  const emitToManyUsers = (userIds: string[], event: string, payload: unknown) => {
    [...new Set(userIds)].forEach((uid) => emitToUser(uid, event, payload));
  };

  return { io, emitToUser, emitToManyUsers };
}
