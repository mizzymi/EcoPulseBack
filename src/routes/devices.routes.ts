import { Router } from 'express';
import { jwtAuth } from '../middleware/jwtAuth';
import { asyncHandler } from '../utils/asyncHandler';
import { registerDevice } from '../services/devices.service';

export const devicesRouter = Router();
devicesRouter.use(jwtAuth);

devicesRouter.post('/register', asyncHandler(async (req, res) => {
  const { token, platform } = req.body ?? {};
  res.json(await registerDevice(req.user!.id, token, platform));
}));
