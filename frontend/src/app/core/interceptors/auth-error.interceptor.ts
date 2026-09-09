import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { isTerminalSessionError } from '../auth/auth.models';

function isRefreshExempt(url: string): boolean {
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/register') ||
    url.includes('/auth/google') ||
    url.includes('/auth/refresh')
  );
}

export const authErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (isRefreshExempt(req.url)) {
    return next(req).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401 && isTerminalSessionError(error)) {
          authService.handleSessionEnded();
        }
        return throwError(() => error);
      }),
    );
  }

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401) {
        return throwError(() => error);
      }

      if (!authService.getRefreshToken()) {
        if (isTerminalSessionError(error)) {
          authService.handleSessionEnded();
        } else {
          authService.clearSession();
          void router.navigate(['/login']);
        }
        return throwError(() => error);
      }

      return from(authService.refreshSession()).pipe(
        switchMap((ok) => {
          if (!ok) {
            return throwError(() => error);
          }
          return next(req).pipe(
            catchError((retryError: HttpErrorResponse) => {
              if (isTerminalSessionError(retryError)) {
                authService.handleSessionEnded();
              }
              return throwError(() => retryError);
            }),
          );
        }),
      );
    }),
  );
};