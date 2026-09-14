import { pool, withTransaction } from '../src/config/db';
import { PeriodoRepository } from '../src/repositories/periodo.repository';
import { SnapshotInformeRepository } from '../src/repositories/snapshot-informe.repository';
import { ReportService } from '../src/services/reports/report.service';

async function repairMissingSnapshots(): Promise<void> {
  const periodoRepo = new PeriodoRepository(pool);
  const periodos = await periodoRepo.findByStatus('FINISHED');
  let repaired = 0;

  for (const periodo of periodos) {
    await withTransaction(async (client) => {
      const snapshotRepo = new SnapshotInformeRepository(client);
      const snapshot = await snapshotRepo.findByPeriodo(periodo.id);
      if (snapshot) {
        return;
      }
      const reportService = new ReportService(client);
      await reportService.generateAndSaveSnapshot(client, periodo.id, periodo.userId);
      repaired += 1;
      console.log(`[ok] snapshot generado para periodo ${periodo.id} (${periodo.name})`);
    });
  }

  console.log(repaired === 0 ? 'No hay periodos FINISHED sin snapshot.' : `Reparados ${repaired} snapshot(s).`);
}

repairMissingSnapshots()
  .catch((error) => {
    console.error('Fallo al reparar snapshots:', error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });