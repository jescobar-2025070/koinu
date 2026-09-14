import { pool } from '../../config/db';
import { AppError } from '../../errors/app-error';
import { ErrorCodes } from '../../errors/error-codes';
import { CategoriaIngresoRepository } from '../../repositories/categoria-ingreso.repository';
import { CategoriaGastoRepository } from '../../repositories/categoria-gasto.repository';
import { CategoriaIngreso } from '../../entities/categoria-ingreso.entity';
import { CategoriaGasto } from '../../entities/categoria-gasto.entity';

export class CategoriaService {
  private readonly ingresoRepository: CategoriaIngresoRepository;
  private readonly gastoRepository: CategoriaGastoRepository;

  constructor() {
    this.ingresoRepository = new CategoriaIngresoRepository(pool);
    this.gastoRepository = new CategoriaGastoRepository(pool);
  }

  async listIngreso(userId: string): Promise<CategoriaIngreso[]> {
    return this.ingresoRepository.findByUser(userId);
  }

  async listGasto(userId: string): Promise<CategoriaGasto[]> {
    return this.gastoRepository.findByUser(userId);
  }

  async createIngreso(userId: string, data: { name: string }): Promise<CategoriaIngreso> {
    const name = data.name.trim();
    if (!name) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'El nombre de la categoría es obligatorio.',
        statusCode: 400,
      });
    }
    await this.assertNameAvailable(
      (uid, categoryName) => this.ingresoRepository.findActiveByName(uid, categoryName),
      userId,
      name,
    );
    return this.ingresoRepository.create({ userId, name });
  }

  async createGasto(userId: string, data: { name: string }): Promise<CategoriaGasto> {
    const name = data.name.trim();
    if (!name) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'El nombre de la categoría es obligatorio.',
        statusCode: 400,
      });
    }
    await this.assertNameAvailable(
      (uid, categoryName) => this.gastoRepository.findActiveByName(uid, categoryName),
      userId,
      name,
    );
    return this.gastoRepository.create({ userId, name });
  }

  async updateIngreso(userId: string, id: string, name: string): Promise<CategoriaIngreso> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'El nombre de la categoría es obligatorio.',
        statusCode: 400,
      });
    }
    await this.assertOwnedIngreso(userId, id);
    await this.assertNameAvailable(
      (uid, categoryName) => this.ingresoRepository.findActiveByName(uid, categoryName),
      userId,
      trimmed,
      id,
    );
    const updated = await this.ingresoRepository.update(id, trimmed);
    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, {
        message: 'Error al actualizar la categoría.',
        statusCode: 500,
      });
    }
    return updated;
  }

  async updateGasto(userId: string, id: string, name: string): Promise<CategoriaGasto> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'El nombre de la categoría es obligatorio.',
        statusCode: 400,
      });
    }
    await this.assertOwnedGasto(userId, id);
    await this.assertNameAvailable(
      (uid, categoryName) => this.gastoRepository.findActiveByName(uid, categoryName),
      userId,
      trimmed,
      id,
    );
    const updated = await this.gastoRepository.update(id, trimmed);
    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, {
        message: 'Error al actualizar la categoría.',
        statusCode: 500,
      });
    }
    return updated;
  }

  async deleteIngreso(userId: string, id: string): Promise<void> {
    await this.assertOwnedIngreso(userId, id);
    const deleted = await this.ingresoRepository.softDelete(id);
    if (!deleted) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, {
        message: 'Error al eliminar la categoría.',
        statusCode: 500,
      });
    }
  }

  async deleteGasto(userId: string, id: string): Promise<void> {
    await this.assertOwnedGasto(userId, id);
    const deleted = await this.gastoRepository.softDelete(id);
    if (!deleted) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, {
        message: 'Error al eliminar la categoría.',
        statusCode: 500,
      });
    }
  }

  private async assertOwnedIngreso(userId: string, id: string): Promise<void> {
    const categoria = await this.ingresoRepository.findById(id);
    this.assertOwnedCategoria(categoria, userId);
  }

  private async assertOwnedGasto(userId: string, id: string): Promise<void> {
    const categoria = await this.gastoRepository.findById(id);
    this.assertOwnedCategoria(categoria, userId);
  }

  private assertOwnedCategoria(
    categoria: CategoriaIngreso | CategoriaGasto | null,
    userId: string,
  ): void {
    if (!categoria) {
      throw new AppError(ErrorCodes.NOT_FOUND, {
        message: 'Categoría no encontrada.',
        statusCode: 404,
      });
    }
    if (categoria.isDefault) {
      throw new AppError(ErrorCodes.CATEGORY_NOT_EDITABLE, {
        message: 'Las categorías del sistema no se pueden modificar.',
        statusCode: 422,
      });
    }
    if (categoria.userId !== userId) {
      throw new AppError(ErrorCodes.FORBIDDEN, {
        message: 'No tienes acceso a esta categoría.',
        statusCode: 403,
      });
    }
  }

  private async assertNameAvailable(
    findActiveByName: (userId: string, name: string) => Promise<CategoriaIngreso | CategoriaGasto | null>,
    userId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await findActiveByName(userId, name);
    if (existing && existing.id !== excludeId) {
      throw new AppError(ErrorCodes.CATEGORY_ALREADY_EXISTS, {
        message: 'Ya existe una categoría con ese nombre.',
        statusCode: 409,
      });
    }
  }

  async createDefaultsForUser(userId: string): Promise<void> {
    await this.ingresoRepository.createDefaultsForUser(userId);
    await this.gastoRepository.createDefaultsForUser(userId);
  }
}
