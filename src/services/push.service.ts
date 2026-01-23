import * as admin from 'firebase-admin';
import fs from 'fs';

class PushService {
  public ready = false;

  constructor() {
    try {
      if (admin.apps.length) { this.ready = true; return; }

      const cred = this.loadCredential();
      if (!cred) {
        console.warn('[PUSH] FCM not initialized: no credentials provided (OK in dev).');
        return;
      }

      admin.initializeApp({ credential: admin.credential.cert(cred as any) });
      this.ready = true;
      console.log('[PUSH] FCM initialized');
    } catch (e: any) {
      console.error('[PUSH] FCM init error:', e?.message);
    }
  }

  private loadCredential(): object | null {
    const jsonEnv = process.env.FCM_SERVICE_ACCOUNT_JSON;
    const base64 = process.env.FCM_SERVICE_ACCOUNT_BASE64;
    const path = process.env.FCM_SERVICE_ACCOUNT_PATH;

    if (jsonEnv && jsonEnv.trim().startsWith('{')) {
      try { return JSON.parse(jsonEnv); }
      catch (e: any) { console.error('[PUSH] Invalid FCM_SERVICE_ACCOUNT_JSON:', e?.message); }
    }

    if (base64) {
      try {
        const decoded = Buffer.from(base64, 'base64').toString('utf8');
        return JSON.parse(decoded);
      } catch (e: any) {
        console.error('[PUSH] Invalid FCM_SERVICE_ACCOUNT_BASE64:', e?.message);
      }
    }

    if (path && fs.existsSync(path)) {
      try {
        const content = fs.readFileSync(path, 'utf8');
        return JSON.parse(content);
      } catch (e: any) {
        console.error('[PUSH] Cannot read FCM_SERVICE_ACCOUNT_PATH:', e?.message);
      }
    }

    return null;
  }

  async sendToTokens(tokens: string[], payload: admin.messaging.MessagingPayload) {
    if (!this.ready || !tokens?.length) return;
    await admin.messaging().sendEachForMulticast({
      tokens,
      data: payload.data,
      notification: payload.notification,
    });
  }
}

export const push = new PushService();
