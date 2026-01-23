import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';

export type RealtimeApi = {
  io: Server;
  emitToUser: (userId: string, event: string, payload: any) => void;
  emitToManyUsers: (userIds: string[], event: string, payload: any) => void;
};

export function initRealtime(server: HttpServer): RealtimeApi {
  const io = new Server(server, {
    cors: { origin: '*' },
    path: '/realtime',
  });

  const socketUser = new Map<string, string>();

  io.on('connection', (client: Socket) => {
    try {
      const auth = client.handshake.headers['authorization'] as string | undefined;
      if (!auth?.startsWith('Bearer ')) return client.disconnect(true);
      const token = auth.slice(7);
      // Mantengo el comportamiento del Nest original: token "dev:<userId>"
      if (!token.startsWith('dev:')) return client.disconnect(true);
      const userId = token.split(':')[1];
      if (!userId) return client.disconnect(true);

      socketUser.set(client.id, userId);
      client.join(`user:${userId}`);
      // eslint-disable-next-line no-console
      console.log(`[RT] socket ${client.id} conectado como user:${userId}`);

      client.on('disconnect', () => {
        const uid = socketUser.get(client.id);
        if (uid) {
          // eslint-disable-next-line no-console
          console.log(`[RT] socket ${client.id} (user:${uid}) desconectado`);
        }
        socketUser.delete(client.id);
      });
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('[RT] Error de conexión:', e?.message);
      client.disconnect(true);
    }
  });

  const emitToUser = (userId: string, event: string, payload: any) => {
    io.to(`user:${userId}`).emit(event, payload);
  };

  const emitToManyUsers = (userIds: string[], event: string, payload: any) => {
    userIds.forEach((uid) => emitToUser(uid, event, payload));
  };

  return { io, emitToUser, emitToManyUsers };
}
