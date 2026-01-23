import { prisma } from '../db/prisma';
import { mail } from './mail.service';
import { push } from './push.service';
import type { RealtimeApi } from '../realtime/realtime';

type JoinDecision = 'APPROVED' | 'REJECTED';

class NotificationsService {
  private rt: RealtimeApi | null = null;

  setRealtime(rt: RealtimeApi) {
    this.rt = rt;
  }

  private toEmailArray(recips: string | string[] | undefined | null): string[] {
    if (!recips) return [];
    const arr = Array.isArray(recips) ? recips : [recips];
    return arr.map((e) => e?.trim()).filter(Boolean) as string[];
  }

  /* ============== Password reset ============== */

  async sendPasswordResetEmail(to: string | string[], link: string) {
    const toEmails = this.toEmailArray(to);
    if (!toEmails.length) return;
    await mail.send(
      toEmails,
      'Restablecer contraseña',
      `<h2>Recuperación de cuenta</h2>
       <p>Para restablecer tu contraseña haz clic en el siguiente enlace:</p>
       <p><a href="${link}">Restablecer contraseña</a></p>
       <p>Si no fuiste tú, ignora este mensaje.</p>`,
    );
  }

  async sendPasswordResetCode(to: string | string[], code: string) {
    const toEmails = this.toEmailArray(to);
    if (!toEmails.length) return;
    await mail.send(
      toEmails,
      'Código de recuperación',
      `<h2>Recuperación de cuenta</h2>
       <p>Usa este código en la app para restablecer tu contraseña:</p>
       <p style="font-size:18px"><b>${code}</b></p>
       <p>Caduca en poco tiempo.</p>`,
    );
  }

  async notifyPasswordChanged(identifier: string) {
    const looksEmail = identifier.includes('@');
    const user = looksEmail
      ? await prisma.user.findUnique({ where: { email: identifier } })
      : await prisma.user.findUnique({ where: { id: identifier } });

    const email = looksEmail ? identifier : (user?.email ?? null);
    if (email) {
      await mail.send(
        email,
        'Tu contraseña ha sido actualizada',
        `<h2>Cambio de contraseña</h2>
         <p>Tu contraseña ha sido modificada.</p>
         <p>Si no fuiste tú, cambia la contraseña de inmediato y contacta soporte.</p>`,
      );
    }

    const userId = looksEmail ? (user?.id ?? null) : identifier;
    if (userId) {
      const tokens = await prisma.deviceToken.findMany({
        where: { userId, revoked: false },
        select: { token: true },
      });
      const tokenList = tokens.map((t) => t.token).filter(Boolean);
      if (tokenList.length) {
        await push.sendToTokens(tokenList, {
          notification: { title: 'Seguridad de la cuenta', body: 'Tu contraseña ha sido actualizada' },
          data: { type: 'password_changed' },
        });
      }

      if (this.rt) {
        this.rt.emitToUser(userId, 'password_changed', { at: new Date().toISOString() });
      }
    }
  }

  /* ============== cuenta: solicitudes de unión ============== */

  async notifyNewJoinRequest(householdId: string, requesterId: string) {
    const admins = await prisma.householdMember.findMany({
      where: { householdId, role: { in: ['OWNER', 'ADMIN'] } },
      include: { user: true },
    });
    const requester = await prisma.user.findUnique({ where: { id: requesterId } });

    const toEmails = this.toEmailArray(admins.map((a) => a.user.email));
    if (toEmails.length) {
      await mail.send(
        toEmails,
        'Nueva solicitud para unirse a tu cuenta',
        `<h2>Nueva solicitud pendiente</h2>
         <p><b>${requester?.email ?? 'Usuario'}</b> quiere unirse a tu cuenta.</p>
         <p>Entra en la app → cuenta → Solicitudes para aprobar o rechazar.</p>`,
      );
    }

    const adminIds = admins.map((a) => a.userId);
    const tokens = await prisma.deviceToken.findMany({
      where: { userId: { in: adminIds }, revoked: false },
      select: { token: true },
    });
    const tokenList = tokens.map((t) => t.token).filter(Boolean);
    if (tokenList.length) {
      await push.sendToTokens(tokenList, {
        notification: { title: 'Solicitud de unión', body: `${requester?.email ?? 'Alguien'} quiere unirse` },
        data: { type: 'join_request_new', householdId },
      });
    }

    if (this.rt) {
      this.rt.emitToManyUsers(adminIds, 'join_request_new', {
        householdId,
        requesterId,
        requesterEmail: requester?.email ?? null,
        at: new Date().toISOString(),
      });
    }
  }

  async notifyJoinRequestDecision(householdId: string, requesterId: string, decision: JoinDecision) {
    const approved = decision === 'APPROVED';
    const requester = await prisma.user.findUnique({ where: { id: requesterId } });

    if (requester?.email) {
      await mail.send(
        requester.email,
        approved ? '¡Solicitud aprobada!' : 'Solicitud rechazada',
        approved
          ? `<h2>¡Bienvenido!</h2><p>Tu solicitud fue <b>aprobada</b>. Ya formas parte de la cuenta.</p>`
          : `<h2>Solicitud rechazada</h2><p>Un administrador ha rechazado tu solicitud.</p>`,
      );
    }

    const tokens = await prisma.deviceToken.findMany({
      where: { userId: requesterId, revoked: false },
      select: { token: true },
    });
    const tokenList = tokens.map((t) => t.token).filter(Boolean);
    if (tokenList.length) {
      await push.sendToTokens(tokenList, {
        notification: { title: approved ? 'Aprobado' : 'Rechazado', body: approved ? 'Ya formas parte de la cuenta' : 'No autorizado' },
        data: { type: 'join_request_decision', householdId, status: decision },
      });
    }

    if (this.rt) {
      this.rt.emitToUser(requesterId, 'join_request_decision', { householdId, status: decision, at: new Date().toISOString() });
    }
  }
}

export const notifications = new NotificationsService();
