import { pool } from '../../config/db';
import { AppError } from '../../errors/app-error';
import { ErrorCodes } from '../../errors/error-codes';
import { Objetivo, ObjetivoPriority, ObjetivoStatus } from '../../entities/objetivo.entity';
import { ObjetivoRepository } from '../../repositories/objetivo.repository';
import { PeriodoService } from '../periods/periodo.service';

const OBJETIVO_PRIORITIES: ObjetivoPriority[] = ['ALTA', 'MEDIA', 'BAJA'];

export interface CrearObjetivoInput {
  periodoId?: string;
  name: string;
  description?: string;
  targetAmount: number;
  deadline?: string;
  startDate?: string;
  priority?: ObjetivoPriority;
}

export class ObjetivoService {
  private readonly objetivoRepository: ObjetivoRepository;
  private readonly periodoService: PeriodoService;

  constructor() {
    this.objetivoRepository = new ObjetivoRepository(pool);
    this.periodoService = new PeriodoService();
  }

  async findByUser(userId: string): Promise<Objetivo[]> {
    return this.objetivoRepository.findByUser(userId);
  }

  async findByPeriodo(userId: string, periodoId: string): Promise<Objetivo[]> {
    await this.periodoService.findById(periodoId, userId);
    return this.objetivoRepository.findForReport(userId, periodoId);
  }

  async getById(id: string, userId: string): Promise<Objetivo> {
    const objetivo = await this.assertOwned(id, userId);
    return objetivo;
  }

  async create(userId: string, data: CrearObjetivoInput): Promise<Objetivo> {
    if (!data.name.trim()) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'El nombre del objetivo es obligatorio.',
        statusCode: 400,
      });
    }
    if (typeof data.targetAmount !== 'number' || isNaN(data.targetAmount) || data.targetAmount <= 0) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'La meta del objetivo debe ser un número mayor a 0.',
        statusCode: 400,
      });
    }

    const priority = this.normalizePriority(data.priority, 'MEDIA');
    if (data.priority !== undefined && priority === null) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'La prioridad debe ser ALTA, MEDIA o BAJA.',
        statusCode: 400,
      });
    }

    if (data.periodoId) {
      await this.periodoService.findById(data.periodoId, userId);
    }

    return this.objetivoRepository.create({
      userId,
      periodoId: data.periodoId,
      name: data.name.trim(),
      description: data.description?.trim() || null,
      targetAmount: data.targetAmount,
      deadline: data.deadline ? new Date(data.deadline) : null,
      startDate: data.startDate ? new Date(data.startDate) : new Date(),
      priority: (priority ?? 'MEDIA') as ObjetivoPriority,
    });
  }

  async update(
    id: string,
    userId: string,
    data: {
      name?: string;
      description?: string;
      targetAmount?: number;
      deadline?: string;
      startDate?: string;
      periodoId?: string | null;
      priority?: ObjetivoPriority;
    },
  ): Promise<Objetivo> {
    await this.assertOwned(id, userId);

    const payload: {
      name?: string;
      description?: string | null;
      targetAmount?: number;
      deadline?: Date | null;
      startDate?: Date | null;
      periodoId?: string | null;
      priority?: ObjetivoPriority;
    } = {};

    if (data.name !== undefined) payload.name = data.name.trim();
    if (data.description !== undefined) payload.description = data.description?.trim() || null;
    if (data.targetAmount !== undefined) {
      if (typeof data.targetAmount !== 'number' || isNaN(data.targetAmount) || data.targetAmount <= 0) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, {
          message: 'La meta del objetivo debe ser un número mayor a 0.',
          statusCode: 400,
        });
      }
      payload.targetAmount = data.targetAmount;
    }
    if (data.deadline !== undefined) payload.deadline = data.deadline ? new Date(data.deadline) : null;
    if (data.startDate !== undefined) payload.startDate = data.startDate ? new Date(data.startDate) : null;
    if (data.periodoId !== undefined) {
      if (data.periodoId) {
        await this.periodoService.findById(data.periodoId, userId);
      }
      payload.periodoId = data.periodoId;
    }
    if (data.priority !== undefined) {
      const priority = this.normalizePriority(data.priority, undefined);
      if (priority === null) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, {
          message: 'La prioridad debe ser ALTA, MEDIA o BAJA.',
          statusCode: 400,
        });
      }
      payload.priority = priority;
    }

    const updated = await this.objetivoRepository.update(id, payload);
    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, {
        message: 'Error al actualizar el objetivo.',
        statusCode: 500,
      });
    }

    return updated;
  }

  async delete(id: string, userId: string): Promise<void> {
    const objetivo = await this.assertOwned(id, userId);
    const deleted = await this.objetivoRepository.delete(objetivo.id);
    if (!deleted) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, {
        message: 'Error al eliminar el objetivo.',
        statusCode: 500,
      });
    }
  }

  async deposit(id: string, userId: string, amount: number): Promise<Objetivo> {
    const objetivo = await this.assertOwned(id, userId);
    this.assertActive(objetivo);

    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'El monto debe ser mayor a 0.',
        statusCode: 400,
      });
    }

    const updated = await this.objetivoRepository.deposit(id, amount);
    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, {
        message: 'Error al depositar en el objetivo.',
        statusCode: 500,
      });
    }

    return updated;
  }

  async withdraw(id: string, userId: string, amount: number): Promise<Objetivo> {
    const objetivo = await this.assertOwned(id, userId);
    this.assertActive(objetivo);

    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'El monto debe ser mayor a 0.',
        statusCode: 400,
      });
    }

    if (amount > objetivo.currentAmount) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'No tienes suficiente dinero en este objetivo.',
        statusCode: 400,
      });
    }

    const updated = await this.objetivoRepository.withdraw(id, amount);
    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, {
        message: 'Error al retirar del objetivo.',
        statusCode: 500,
      });
    }

    return updated;
  }

  async complete(id: string, userId: string): Promise<Objetivo> {
    const objetivo = await this.assertOwned(id, userId);
    this.assertActive(objetivo);
    return this.setStatus(objetivo.id, 'COMPLETED');
  }

  async cancel(id: string, userId: string): Promise<Objetivo> {
    const objetivo = await this.assertOwned(id, userId);
    this.assertActive(objetivo);
    return this.setStatus(objetivo.id, 'CANCELLED');
  }

  private async setStatus(id: string, status: ObjetivoStatus): Promise<Objetivo> {
    const updated = await this.objetivoRepository.setStatus(id, status);
    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, {
        message: 'Error al actualizar el estado del objetivo.',
        statusCode: 500,
      });
    }
    return updated;
  }

  private normalizePriority(value: string | undefined, fallback: ObjetivoPriority | undefined): ObjetivoPriority | null {
    const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
    if (!normalized) {
      return fallback ?? null;
    }
    return OBJETIVO_PRIORITIES.includes(normalized as ObjetivoPriority)
      ? (normalized as ObjetivoPriority)
      : null;
  }

  private assertActive(objetivo: Objetivo): void {
    if (objetivo.status !== 'ACTIVE') {
      throw new AppError(ErrorCodes.GOAL_NOT_ACTIVE, {
        message: 'El objetivo no está activo. Solo los objetivos activos aceptan operaciones.',
        statusCode: 422,
      });
    }
  }

  private async assertOwned(id: string, userId: string): Promise<Objetivo> {
    const objetivo = await this.objetivoRepository.findById(id);
    if (!objetivo) {
      throw new AppError(ErrorCodes.NOT_FOUND, {
        message: 'Objetivo no encontrado.',
        statusCode: 404,
      });
    }
    if (objetivo.userId !== userId) {
      throw new AppError(ErrorCodes.FORBIDDEN, {
        message: 'No tienes acceso a este objetivo.',
        statusCode: 403,
      });
    }
    return objetivo;
  }
}