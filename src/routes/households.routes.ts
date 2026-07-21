import { Router } from 'express';
import { jwtAuth } from '../middleware/jwtAuth';
import { asyncHandler } from '../utils/asyncHandler';
import * as svc from '../services/households';

export const householdsRouter = Router();
householdsRouter.use(jwtAuth);

/* ===== Mis cuentas ===== */
householdsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await svc.myHouseholds(req.user!.id));
  }),
);

/* ===== Crear cuenta ===== */
householdsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, currency } = req.body ?? {};
    res.json(await svc.createHousehold(req.user!.id, name, currency ?? 'EUR'));
  }),
);

/* ===== Borrar cuenta ===== */
householdsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await svc.deleteHousehold(req.user!.id, req.params.id));
  }),
);

/* ===== Actualizar cuenta ===== */
householdsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(
      await svc.updateHousehold(req.user!.id, req.params.id, req.body ?? {}),
    );
  }),
);

/* ===== Invitaciones / Join por código ===== */
householdsRouter.post(
  '/:id/invites',
  asyncHandler(async (req, res) => {
    res.json(await svc.createInvite(req.user!.id, req.params.id, req.body ?? {}));
  }),
);

householdsRouter.post(
  '/join',
  asyncHandler(async (req, res) => {
    res.json(await svc.joinByCode(req.user!.id, req.body?.code));
  }),
);

householdsRouter.post(
  '/join-by-code',
  asyncHandler(async (req, res) => {
    res.json(await svc.joinByCode(req.user!.id, req.body?.code));
  }),
);

householdsRouter.get(
  '/:id/join-requests',
  asyncHandler(async (req, res) => {
    const status = req.query.status as any;
    res.json(await svc.listJoinRequests(req.user!.id, req.params.id, status));
  }),
);

householdsRouter.post(
  '/:id/join-requests/:reqId/approve',
  asyncHandler(async (req, res) => {
    res.json(
      await svc.decideJoinRequest(
        req.user!.id,
        req.params.id,
        req.params.reqId,
        'APPROVED',
      ),
    );
  }),
);

householdsRouter.post(
  '/:id/join-requests/:reqId/reject',
  asyncHandler(async (req, res) => {
    res.json(
      await svc.decideJoinRequest(
        req.user!.id,
        req.params.id,
        req.params.reqId,
        'REJECTED',
      ),
    );
  }),
);

householdsRouter.get(
  '/:id/members',
  asyncHandler(async (req, res) => {
    res.json(await svc.listMembers(req.user!.id, req.params.id));
  }),
);

// ===== Members management (role / kick) =====

householdsRouter.patch(
  '/:id/members/:userId',
  asyncHandler(async (req, res) => {
    res.json(
      await svc.updateMemberRole(
        req.user!.id,
        req.params.id,
        req.params.userId,
        req.body ?? {},
      ),
    );
  }),
);

householdsRouter.delete(
  '/:id/members/:userId',
  asyncHandler(async (req, res) => {
    res.json(await svc.removeMember(req.user!.id, req.params.id, req.params.userId));
  }),
);

/* ===== Ledger ===== */
householdsRouter.post(
  '/:id/entries',
  asyncHandler(async (req, res) => {
    res.json(await svc.addEntry(req.user!.id, req.params.id, req.body ?? {}));
  }),
);

householdsRouter.get(
  '/:id/entries',
  asyncHandler(async (req, res) => {
    const { from, to, limit, accountType, category, type } = req.query as any;
    res.json(
      await svc.listEntries(req.user!.id, req.params.id, {
        from,
        to,
        limit: limit ? Number(limit) : undefined,
        accountType,
        category,
        type,
      }),
    );
  }),
);

householdsRouter.get(
  '/:id/summary',
  asyncHandler(async (req, res) => {
    res.json(
      await svc.monthlySummary(
        req.user!.id,
        req.params.id,
        String(req.query.month ?? ''),
      ),
    );
  }),
);

householdsRouter.patch(
  '/:id/entries/:entryId',
  asyncHandler(async (req, res) => {
    res.json(
      await svc.updateEntry(
        req.user!.id,
        req.params.id,
        req.params.entryId,
        req.body ?? {},
      ),
    );
  }),
);

householdsRouter.delete(
  '/:id/entries/:entryId',
  asyncHandler(async (req, res) => {
    res.json(await svc.deleteEntry(req.user!.id, req.params.id, req.params.entryId));
  }),
);

/* ===== Ahorros ===== */
// Metas
householdsRouter.post(
  '/:id/savings-goals',
  asyncHandler(async (req, res) => {
    res.json(await svc.createSavingsGoal(req.user!.id, req.params.id, req.body ?? {}));
  }),
);

householdsRouter.get(
  '/:id/savings-goals',
  asyncHandler(async (req, res) => {
    res.json(await svc.listSavingsGoals(req.user!.id, req.params.id));
  }),
);

householdsRouter.patch(
  '/:id/savings-goals/:goalId',
  asyncHandler(async (req, res) => {
    res.json(
      await svc.updateSavingsGoal(
        req.user!.id,
        req.params.id,
        req.params.goalId,
        req.body ?? {},
      ),
    );
  }),
);

householdsRouter.delete(
  '/:id/savings-goals/:goalId',
  asyncHandler(async (req, res) => {
    res.json(await svc.deleteSavingsGoal(req.user!.id, req.params.id, req.params.goalId));
  }),
);

householdsRouter.delete(
  '/:id/savings-goals/:goalId/txns/:txnId',
  asyncHandler(async (req, res) => {
    res.json(
      await svc.deleteSavingTxn(
        req.user!.id,
        req.params.id,
        req.params.goalId,
        req.params.txnId,
      ),
    );
  }),
);

householdsRouter.get(
  '/savings-goals/:goalId',
  asyncHandler(async (req, res) => {
    res.json(await svc.getSavingsGoalById(req.user!.id, req.params.goalId));
  }),
);

// Transacciones
householdsRouter.post(
  '/:id/savings-goals/:goalId/txns',
  asyncHandler(async (req, res) => {
    res.json(
      await svc.addSavingsTxn(
        req.user!.id,
        req.params.id,
        req.params.goalId,
        req.body ?? {},
      ),
    );
  }),
);

householdsRouter.get(
  '/:id/savings-goals/:goalId/txns',
  asyncHandler(async (req, res) => {
    res.json(await svc.listSavingsTxns(req.user!.id, req.params.id, req.params.goalId));
  }),
);

householdsRouter.get(
  '/:id/savings-goals/:goalId/summary',
  asyncHandler(async (req, res) => {
    res.json(await svc.savingsGoalSummary(req.user!.id, req.params.id, req.params.goalId));
  }),
);

/* ===== PLANNED ===== */
householdsRouter.get(
  '/:id/planned',
  asyncHandler(async (req, res) => {
    res.json(
      await svc.listPlanned(req.user!.id, req.params.id, {
        month: req.query.month as any,
        accountType: req.query.accountType as any,
        category: req.query.category as any,
        type: req.query.type as any,
      }),
    );
  }),
);

householdsRouter.post(
  '/:id/planned',
  asyncHandler(async (req, res) => {
    res.json(await svc.createPlanned(req.user!.id, req.params.id, req.body ?? {}));
  }),
);

householdsRouter.patch(
  '/:id/planned/:plannedId',
  asyncHandler(async (req, res) => {
    res.json(
      await svc.updatePlanned(req.user!.id, req.params.id, req.params.plannedId, req.body ?? {}),
    );
  }),
);

householdsRouter.delete(
  '/:id/planned/:plannedId',
  asyncHandler(async (req, res) => {
    res.json(await svc.deletePlanned(req.user!.id, req.params.id, req.params.plannedId));
  }),
);

householdsRouter.post(
  "/:id/planned/:plannedId/settle",
  asyncHandler(async (req, res) => {
    res.json(await svc.settlePlanned(req.user!.id, req.params.id, req.params.plannedId));
  }),
);

/* ===== RECURRING ===== */
householdsRouter.get(
  '/:id/recurring',
  asyncHandler(async (req, res) => {
    res.json(
      await svc.listRecurring(req.user!.id, req.params.id, {
        month: req.query.month as any,
        accountType: req.query.accountType as any,
        category: req.query.category as any,
        type: req.query.type as any,
      }),
    );
  }),
);

householdsRouter.post(
  '/:id/recurring',
  asyncHandler(async (req, res) => {
    res.json(await svc.createRecurring(req.user!.id, req.params.id, req.body ?? {}));
  }),
);

householdsRouter.patch(
  '/:id/recurring/:recurringId',
  asyncHandler(async (req, res) => {
    res.json(
      await svc.updateRecurring(req.user!.id, req.params.id, req.params.recurringId, req.body ?? {}),
    );
  }),
);

householdsRouter.delete(
  '/:id/recurring/:recurringId',
  asyncHandler(async (req, res) => {
    res.json(await svc.deleteRecurring(req.user!.id, req.params.id, req.params.recurringId));
  }),
);

householdsRouter.post(
  '/:id/recurring/:recurringId/post',
  asyncHandler(async (req, res) => {
    res.json(
      await svc.postRecurringInstance(req.user!.id, req.params.id, req.params.recurringId, req.body ?? {}),
    );
  }),
);
