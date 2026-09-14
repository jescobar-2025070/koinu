import { Component, inject, OnInit } from '@angular/core';
import {
  RouterOutlet,
  RouterLink,
  RouterLinkActive,
  Router,
  NavigationEnd,
} from '@angular/router';
import { filter } from 'rxjs';
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
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => void this.redirectFromPublicRoute(event.url));
    void this.authService.ensureInitialized();
  }

  private async redirectFromPublicRoute(url: string): Promise<void> {
    await this.authService.ensureInitialized();
    if (this.authService.isAuthenticated() && this.isPublicRoute(url)) {
      await this.router.navigate(['/dashboard']);
    }
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
