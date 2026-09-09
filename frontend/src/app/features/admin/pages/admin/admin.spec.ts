import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { Admin } from './admin';
import { AdminService } from '../../../../core/services/admin.service';
import { SystemService } from '../../../../core/services/system.service';
import { SidebarService } from '../../../../core/services/sidebar.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { User } from '../../../../core/auth/auth.models';

const adminUser: User = {
  id: 'u-1',
  email: 'admin@finanzas.local',
  isActive: true,
  roles: ['ADMIN'],
  createdAt: '2026-01-01T00:00:00.000Z',
};

const otherUser: User = {
  id: 'u-2',
  email: 'user@koinu.local',
  isActive: false,
  roles: ['USR'],
  createdAt: '2026-01-02T00:00:00.000Z',
};

type Mock<T> = { [K in keyof T]: ReturnType<typeof vi.fn> };

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('Admin', () => {
  let fixture: ComponentFixture<Admin>;
  let component: Admin;
  let adminService: Mock<AdminService>;
  let systemService: Mock<SystemService>;
  let sidebarService: Mock<SidebarService>;

  beforeEach(() => {
    adminService = {
      listUsers: vi.fn(),
      createUser: vi.fn(),
      updateEmail: vi.fn(),
      resetPassword: vi.fn(),
      setActive: vi.fn(),
      setRoles: vi.fn(),
      deleteUser: vi.fn(),
    };
    systemService = { health: vi.fn() };
    sidebarService = { setDashboard: vi.fn() } as Mock<SidebarService>;

    TestBed.configureTestingModule({
      imports: [Admin],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AdminService, useValue: adminService },
        { provide: SystemService, useValue: systemService },
        { provide: SidebarService, useValue: sidebarService },
        { provide: AuthService, useValue: { user: signal<User | null>(adminUser) } },
      ],
    });

    fixture = TestBed.createComponent(Admin);
    component = fixture.componentInstance;
  });

  it('carga usuarios y salud del sistema y los renderiza', async () => {
    adminService.listUsers.mockResolvedValue([adminUser, otherUser]);
    systemService.health.mockResolvedValue({
      status: 'ok',
      db: 'ok',
      uptimeSeconds: 120,
      timestamp: '2026-09-02T00:00:00.000Z',
    });

    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    expect(component.users).toEqual([adminUser, otherUser]);
    expect(component.health?.status).toBe('ok');
    expect(sidebarService.setDashboard).toHaveBeenCalled();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('admin@finanzas.local');
    expect(text).toContain('user@koinu.local');
    expect(text).toContain('API: ok');
    expect(text).toContain('DB: ok');
  });

  it('isSelf identifica al propio usuario', () => {
    expect(component.isSelf('u-1')).toBe(true);
    expect(component.isSelf('u-2')).toBe(false);
  });

  it('marca disabled los controles de la fila propia', async () => {
    adminService.listUsers.mockResolvedValue([adminUser, otherUser]);
    systemService.health.mockResolvedValue(null);

    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('.admin-table tbody tr');
    const ownRow = rows[0];
    const checkboxes = ownRow.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBeGreaterThan(0);
    for (const cb of checkboxes) {
      expect(cb.disabled).toBe(true);
    }
  });

  it('saveRoles exige conservar al menos un rol', async () => {
    component.users = [otherUser];
    component.rolesModel.set('u-2', { ADMIN: false, USR: false });

    await component.saveRoles(otherUser);

    expect(adminService.setRoles).not.toHaveBeenCalled();
    expect(component.rowMsg.get('u-2')).toContain('al menos un rol');
  });

  it('saveRoles llama al servicio con los roles marcados y actualiza la fila', async () => {
    component.users = [otherUser];
    component.rolesModel.set('u-2', { ADMIN: true, USR: false });
    const updated = { ...otherUser, roles: ['ADMIN'] };
    adminService.setRoles.mockResolvedValue(updated);

    await component.saveRoles(otherUser);

    expect(adminService.setRoles).toHaveBeenCalledWith('u-2', ['ADMIN']);
    expect(component.users[0]).toEqual(updated);
    expect(component.rowMsg.get('u-2')).toBe('Roles actualizados.');
  });

  it('toggleActive llama setActive con el nuevo estado', async () => {
    component.users = [otherUser];
    const updated = { ...otherUser, isActive: true };
    adminService.setActive.mockResolvedValue(updated);

    await component.toggleActive(otherUser);

    expect(adminService.setActive).toHaveBeenCalledWith('u-2', true);
    expect(component.users[0]).toEqual(updated);
    expect(component.rowMsg.get('u-2')).toBe('Cuenta activada.');
  });

  it('deleteUser cancela con confirmación en falso', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    await component.deleteUser(otherUser);

    expect(adminService.deleteUser).not.toHaveBeenCalled();
  });

  it('deleteUser elimina la fila tras confirmar', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    component.users = [adminUser, otherUser];
    adminService.deleteUser.mockResolvedValue(undefined);

    await component.deleteUser(otherUser);

    expect(adminService.deleteUser).toHaveBeenCalledWith('u-2');
    expect(component.users).toEqual([adminUser]);
  });

  it('createUser valida que existan correo y contraseña', async () => {
    component.newUserEmail = '';
    component.newUserPassword = '';

    await component.createUser();

    expect(adminService.createUser).not.toHaveBeenCalled();
    expect(component.createMsg).toContain('Indica correo y contraseña');
  });

  it('createUser crea el usuario, lo agrega a la lista y limpia el formulario', async () => {
    const created: User = {
      id: 'u-3',
      email: 'nuevo@finanzas.local',
      isActive: true,
      roles: ['USR'],
      createdAt: '2026-01-03T00:00:00.000Z',
    };
    adminService.createUser.mockResolvedValue(created);
    component.newUserEmail = 'nuevo@finanzas.local';
    component.newUserPassword = 'Contrasena123';
    component.newUserAdmin = false;

    await component.createUser();

    expect(adminService.createUser).toHaveBeenCalledWith('nuevo@finanzas.local', 'Contrasena123', ['USR']);
    expect(component.users[0]).toEqual(created);
    expect(component.rolesModel.get('u-3')).toEqual({ ADMIN: false, USR: true });
    expect(component.newUserEmail).toBe('');
    expect(component.newUserPassword).toBe('');
  });

  it('createUser asigna rol ADMIN si está marcado', async () => {
    const created: User = { ...otherUser, id: 'u-4', roles: ['ADMIN', 'USR'] };
    adminService.createUser.mockResolvedValue(created);
    component.newUserEmail = 'admin2@finanzas.local';
    component.newUserPassword = 'Contrasena123';
    component.newUserAdmin = true;

    await component.createUser();

    expect(adminService.createUser).toHaveBeenCalledWith('admin2@finanzas.local', 'Contrasena123', ['ADMIN', 'USR']);
  });

  it('updateEmail cancela si el prompt no devuelve valor', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue(null);

    await component.updateEmail(otherUser);

    expect(adminService.updateEmail).not.toHaveBeenCalled();
  });

  it('updateEmail actualiza el correo de la fila', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('nuevo@koinu.local');
    const updated = { ...otherUser, email: 'nuevo@koinu.local' };
    adminService.updateEmail.mockResolvedValue(updated);
    component.users = [otherUser];

    await component.updateEmail(otherUser);

    expect(adminService.updateEmail).toHaveBeenCalledWith('u-2', 'nuevo@koinu.local');
    expect(component.users[0]).toEqual(updated);
    expect(component.rowMsg.get('u-2')).toBe('Correo actualizado.');
  });

  it('resetPassword valida la longitud mínima', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('corta1');

    await component.resetPassword(otherUser);

    expect(adminService.resetPassword).not.toHaveBeenCalled();
    expect(component.rowMsg.get('u-2')).toContain('al menos 8 caracteres');
  });

  it('resetPassword llama al servicio con la nueva contraseña', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('NuevaContrasena123');
    adminService.resetPassword.mockResolvedValue(undefined);

    await component.resetPassword(otherUser);

    expect(adminService.resetPassword).toHaveBeenCalledWith('u-2', 'NuevaContrasena123');
    expect(component.rowMsg.get('u-2')).toContain('Contraseña restablecida');
  });
});