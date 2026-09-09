import { Router } from 'express';
import { authRouter } from './auth.routes';
import { roleRouter } from './role.routes';
import { userRouter } from './user.routes';
import { systemRouter } from './system.routes';
import { periodoRouter } from './periodo.routes';
import { movimientoRouter } from './movimiento.routes';
import { objetivoRouter } from './objetivo.routes';
import { categoriaRouter } from './categoria.routes';
import { dashboardRouter } from './dashboard.routes';
import { budgetRouter } from './budget.routes';
import { reportRouter } from './report.routes';
import { tratamientoFiscalRouter } from './tratamiento-fiscal.routes';

const apiRouter = Router();

apiRouter.use('/auth', authRouter());
apiRouter.use('/roles', roleRouter());
apiRouter.use('/users', userRouter());
apiRouter.use('/system', systemRouter());
apiRouter.use('/periods', periodoRouter());
apiRouter.use('/periods', dashboardRouter());
apiRouter.use('/periods', budgetRouter());
apiRouter.use('/periods', reportRouter());
apiRouter.use('/movements', movimientoRouter());
apiRouter.use('/objectives', objetivoRouter());
apiRouter.use('/categories', categoriaRouter());
apiRouter.use('/tax-treatments', tratamientoFiscalRouter());

export { apiRouter };
