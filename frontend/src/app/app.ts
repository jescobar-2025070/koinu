import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AuthService } from './core/auth/auth.service';
import { SidebarService } from './core/services/sidebar.service';
import { AlertDialog } from './shared/components/alert-dialog/alert-dialog';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AlertDialog],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  protected readonly authService = inject(AuthService);
  protected readonly sidebarService = inject(SidebarService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    void this.authService.ensureInitialized().then(() => {
      if (this.authService.isAuthenticated() && this.isPublicRoute(this.router.url)) {
        void this.router.navigate(['/dashboard']);
      }
    });
  }

  private isPublicRoute(url: string): boolean {
    const path = url.split('?')[0];
    return path === '' || path === '/' || path === '/login';
  }

  goToLogin(): void {
    this.authService.confirmExpiredRedirect();
    void this.router.navigate(['/login']);
  }

  logout(): void {
    void this.authService.logout();
  }
}
