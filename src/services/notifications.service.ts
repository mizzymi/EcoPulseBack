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

  async sendPasswordResetCode(to: string | string[], code: string, link: string) {
    const toEmails = this.toEmailArray(to);
    if (!toEmails.length) return;

    const subject = 'Recuperación de contraseña';

    const html = `
  <div style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.08);">
            
            <!-- Header -->
            <tr>
              <td style="background:linear-gradient(135deg,#00b3b8,#2dd4bf);padding:22px 24px;color:#ffffff;">
                <div style="font-size:18px;font-weight:700;letter-spacing:0.2px;">EcoPulse</div>
                <div style="font-size:13px;opacity:0.95;margin-top:4px;">Recuperación de cuenta</div>
              </td>
            </tr>

            <!-- Content -->
            <tr>
              <td style="padding:24px;">
                <h2 style="margin:0 0 10px 0;font-size:20px;line-height:1.25;color:#111827;">
                  Restablecer contraseña
                </h2>
                <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#374151;">
                  Hemos recibido una solicitud para restablecer tu contraseña. Si has sido tú, usa el botón de abajo.
                </p>

                <!-- Button -->
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 18px 0;">
                  <tr>
                    <td align="center" style="border-radius:12px;" bgcolor="#0ea5a6">
                      <a href="${link}"
                         style="display:inline-block;padding:12px 18px;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;border-radius:12px;">
                        Restablecer contraseña
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="margin:0 0 10px 0;font-size:13px;line-height:1.6;color:#6b7280;">
                  Si el botón no funciona, copia y pega este enlace en tu navegador:
                </p>
                <p style="margin:0 0 18px 0;font-size:12px;line-height:1.6;color:#0f766e;word-break:break-all;">
                  ${link}
                </p>

                <!-- Code box -->
                <div style="border:1px solid #e5e7eb;background:#f9fafb;border-radius:14px;padding:14px 16px;">
                  <div style="font-size:12px;color:#6b7280;margin-bottom:6px;">Código de recuperación</div>
                  <div style="font-size:22px;letter-spacing:2px;font-weight:800;color:#111827;">
                    ${code}
                  </div>
                </div>

                <p style="margin:16px 0 0 0;font-size:12px;line-height:1.6;color:#6b7280;">
                  Este código caduca en poco tiempo. Si no has solicitado este cambio, puedes ignorar este correo.
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:16px 24px;background:#f9fafb;border-top:1px solid #eef2f7;">
                <p style="margin:0;font-size:11px;line-height:1.6;color:#9ca3af;">
                  © ${new Date().getFullYear()} EcoPulse · Si necesitas ayuda, responde a este correo.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </div>
  `;

    await mail.send(toEmails, subject, html);
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
      const tokenList = tokens.map((t: { token: any; }) => t.token).filter(Boolean);
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

    const toEmails = this.toEmailArray(admins.map((a: { user: { email: any; }; }) => a.user.email));
    if (toEmails.length) {
      await mail.send(
        toEmails,
        'Nueva solicitud para unirse a tu cuenta',
        `<h2>Nueva solicitud pendiente</h2>
         <p><b>${requester?.email ?? 'Usuario'}</b> quiere unirse a tu cuenta.</p>
         <p>Entra en la app → cuenta → Solicitudes para aprobar o rechazar.</p>`,
      );
    }

    const adminIds = admins.map((a: { userId: any; }) => a.userId);
    const tokens = await prisma.deviceToken.findMany({
      where: { userId: { in: adminIds }, revoked: false },
      select: { token: true },
    });
    const tokenList = tokens.map((t: { token: any; }) => t.token).filter(Boolean);
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
    const tokenList = tokens.map((t: { token: any; }) => t.token).filter(Boolean);
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
