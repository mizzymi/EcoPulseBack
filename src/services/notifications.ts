import type { RealtimeApi } from "../realtime/realtime";
import { mail } from "./mail";

class NotificationsService {
  private rt: RealtimeApi | null = null;

  /**
   * Attaches the realtime gateway so this service can emit events.
   * Call this once during app boot (after realtime is initialized).
   */
  setRealtime(rt: RealtimeApi) {
    this.rt = rt;
  }

  private toEmailArray(recips: string | string[] | undefined | null): string[] {
    if (!recips) return [];
    const arr = Array.isArray(recips) ? recips : [recips];
    return arr.map((e) => e?.trim()).filter(Boolean) as string[];
  }

  /* ===================== Email Template ===================== */

  private wrapEmail(opts: {
    title: string;
    subtitle?: string;
    preheader?: string;
    primaryCta?: { label: string; href: string };
    secondaryCta?: { label: string; href: string };
    bodyHtml: string;
    footerNote?: string;
  }): string {
    const year = new Date().getFullYear();
    const subtitle = opts.subtitle ?? "EcoPulse";
    const preheader = opts.preheader ?? subtitle;

    const primaryBtn = opts.primaryCta
      ? `
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 10px 0;">
          <tr>
            <td align="center" style="border-radius:12px;" bgcolor="#0ea5a6">
              <a href="${opts.primaryCta.href}"
                 style="display:inline-block;padding:12px 18px;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;border-radius:12px;">
                ${opts.primaryCta.label}
              </a>
            </td>
          </tr>
        </table>`
      : "";

    const secondaryBtn = opts.secondaryCta
      ? `
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px 0;">
          <tr>
            <td align="center" style="border-radius:12px;" bgcolor="#eef2f7">
              <a href="${opts.secondaryCta.href}"
                 style="display:inline-block;padding:10px 14px;color:#0f766e;text-decoration:none;font-weight:700;font-size:13px;border-radius:12px;">
                ${opts.secondaryCta.label}
              </a>
            </td>
          </tr>
        </table>`
      : "";

    const footer = opts.footerNote
      ? `<p style="margin:10px 0 0 0;font-size:11px;line-height:1.6;color:#9ca3af;">${opts.footerNote}</p>`
      : "";

    return `
<div style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
  <!-- Preheader (hidden) -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    ${preheader}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
          style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#00b3b8,#2dd4bf);padding:22px 24px;color:#ffffff;">
              <div style="font-size:18px;font-weight:700;letter-spacing:0.2px;">EcoPulse</div>
              <div style="font-size:13px;opacity:0.95;margin-top:4px;">${subtitle}</div>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:24px;">
              <h2 style="margin:0 0 10px 0;font-size:20px;line-height:1.25;color:#111827;">
                ${opts.title}
              </h2>

              ${opts.bodyHtml}

              ${primaryBtn}
              ${secondaryBtn}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px;background:#f9fafb;border-top:1px solid #eef2f7;">
              <p style="margin:0;font-size:11px;line-height:1.6;color:#9ca3af;">
                © ${year} EcoPulse · Si necesitas ayuda, responde a este correo.
              </p>
              ${footer}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</div>
`.trim();
  }

  private codeBox(code: string, label = "Código") {
    return `
<div style="border:1px solid #e5e7eb;background:#f9fafb;border-radius:14px;padding:14px 16px;margin:14px 0 0 0;">
  <div style="font-size:12px;color:#6b7280;margin-bottom:6px;">${label}</div>
  <div style="font-size:22px;letter-spacing:2px;font-weight:800;color:#111827;">
    ${code}
  </div>
</div>`.trim();
  }

  private linkPlain(link: string) {
    return `
<p style="margin:14px 0 10px 0;font-size:13px;line-height:1.6;color:#6b7280;">
  Si el botón no funciona, copia y pega este enlace en tu navegador:
</p>
<p style="margin:0 0 8px 0;font-size:12px;line-height:1.6;color:#0f766e;word-break:break-all;">
  ${link}
</p>`.trim();
  }

  /* ============== Password reset ============== */

  /**
   * Sends a password reset email with a code and a link.
   *
   * @param to Recipient email(s). Can be a single email or an array.
   * @param code One-time code shown inside the email and used in the app.
   * @param link URL for resetting the password (CTA button + fallback link).
   */
  async sendPasswordResetCode(to: string | string[], code: string, link: string) {
    const toEmails = this.toEmailArray(to);
    if (!toEmails.length) return;

    const subject = "Recuperación de contraseña";

    const html = this.wrapEmail({
      title: "Restablecer contraseña",
      subtitle: "Recuperación de cuenta",
      preheader: "Código y enlace para recuperar tu cuenta",
      primaryCta: { label: "Restablecer contraseña", href: link },
      bodyHtml: `
        <p style="margin:0 0 14px 0;font-size:14px;line-height:1.6;color:#374151;">
          Hemos recibido una solicitud para restablecer tu contraseña. Si has sido tú, usa el botón de abajo o introduce el código en la app.
        </p>
        ${this.linkPlain(link)}
        ${this.codeBox(code, "Código de recuperación")}
        <p style="margin:14px 0 0 0;font-size:12px;line-height:1.6;color:#6b7280;">
          Este código caduca en poco tiempo. Si no has solicitado este cambio, puedes ignorar este correo.
        </p>
      `,
    });

    await mail.send(toEmails, subject, html);
  }
}

export const notifications = new NotificationsService();
