import { ChangeDetectorRef, Component, inject } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: './register.css',
})
export class Register {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  protected readonly form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8), this.letterAndNumber],
    }),
    confirmPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  }, { validators: this.passwordsMatch });

  protected errorMessage: string | null = null;
  protected submitting = false;
  protected showPassword = false;
  protected googleLoading = false;

  protected togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  async continueWithGoogle(): Promise<void> {
    this.googleLoading = true;
    this.errorMessage = null;

    try {
      await this.authService.loginWithGoogle();
      if (this.authService.isAuthenticated()) {
        await this.router.navigate(['/dashboard']);
      }
    } catch (error: any) {
      this.errorMessage = 'No se pudo completar el registro con Google. Inténtelo nuevamente.';
      this.cdr.markForCheck();
    } finally {
      this.googleLoading = false;
      this.cdr.markForCheck();
    }
  }

  submit(): void {
    if (this.form.invalid) {
      this.errorMessage = 'Por favor, revise los campos marcados antes de continuar.';
      return;
    }

    this.submitting = true;
    this.errorMessage = null;
    const { email, password } = this.form.getRawValue();

    this.authService
      .register(email, password)
      .then(() => this.router.navigate(['/login'], { state: { registered: true } }))
      .catch((error: any) => {
        const msg = error?.error?.error?.message;
        this.errorMessage = msg || 'No se pudo completar el registro. Inténtelo nuevamente.';
        this.cdr.markForCheck();
      })
      .finally(() => {
        this.submitting = false;
        this.cdr.markForCheck();
      });
  }

  private letterAndNumber(control: AbstractControl): Record<string, boolean> | null {
    const value = control.value as string;
    if (!value) {
      return null;
    }
    const hasLetter = /[A-Za-z]/.test(value);
    const hasNumber = /\d/.test(value);
    return hasLetter && hasNumber ? null : { letterAndNumber: true };
  }

  private passwordsMatch(group: AbstractControl): Record<string, boolean> | null {
    const password = group.get('password')?.value;
    const confirmPassword = group.get('confirmPassword')?.value;
    return password === confirmPassword ? null : { passwordsMismatch: true };
  }
}
