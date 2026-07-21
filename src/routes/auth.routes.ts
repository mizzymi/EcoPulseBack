import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as auth from '../services';
import { jwtAuth } from '../middleware/jwtAuth';

export const authRouter = Router();

authRouter.post('/register', asyncHandler(async (req, res) => {
  const { email, username, password } = req.body ?? {};
  const out = await auth.register(email, username, password,);
  res.json(out);
}));

authRouter.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body ?? {};
  const out = await auth.login(email, password);
  res.json(out);
}));

authRouter.get('/me', jwtAuth, asyncHandler(async (req, res) => {
  const out = await auth.findUserById(req.user!.id);
  res.json(out);
}));

authRouter.post('/forgot-password', asyncHandler(async (req, res) => {
  const email = (req.body?.email ?? '').trim().toLowerCase();
  await auth.requestPasswordReset(email);
  res.json({ ok: true });
}));

authRouter.post('/reset-password', asyncHandler(async (req, res) => {
  const { email, token, newPassword } = req.body ?? {};
  const out = await auth.resetPassword(email, token, newPassword);
  res.json(out);
}));
