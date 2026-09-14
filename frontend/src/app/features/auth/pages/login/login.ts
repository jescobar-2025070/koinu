import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AuthService } from '../../../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  imports: [RouterLink, FormsModule, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  showPassword = false;
  submitting = false;
  errorMessage = '';
  successMessage = '';
  googleLoading = false;

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  async continueWithGoogle(): Promise<void> {
    this.googleLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      await this.authService.loginWithGoogle();
      if (this.authService.isAuthenticated()) {
        await this.router.navigate(['/dashboard']);
      }
    } catch (error: any) {
      this.errorMessage = 'No se pudo iniciar sesión con Google. Inténtelo nuevamente.';
      this.cdr.markForCheck();
    } finally {
      this.googleLoading = false;
      this.cdr.markForCheck();
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting = true;
    this.errorMessage = '';
    this.successMessage = '';

    const { email, password } = this.form.value;

    try {
      await this.authService.login(email!, password!);
      await this.router.navigate(['/dashboard']);
    } catch (error: any) {
      this.errorMessage = error?.error?.error?.message || 'Las credenciales son incorrectas. Inténtelo nuevamente.';
      this.cdr.markForCheck();
    } finally {
      this.submitting = false;
      this.cdr.markForCheck();
    }
  }
}
