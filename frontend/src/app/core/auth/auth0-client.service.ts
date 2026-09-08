import { Injectable } from '@angular/core';
import { Auth0Client, createAuth0Client } from '@auth0/auth0-spa-js';
import { environment } from '../config/environment';

/**
 * Envuelve el cliente de Auth0 (SPA JS) como servicio inyectable para poder
 * sustituirlo fácilmente en pruebas con TestBed. No maneja la sesión de la
 * aplicación: solo se usa para obtener, vía popup, el ID Token de la conexión
 * de Google, que luego AuthService envía al backend en POST /auth/google.
 */
@Injectable({ providedIn: 'root' })
export class Auth0ClientService {
  private clientPromise: Promise<Auth0Client> | null = null;

  getClient(): Promise<Auth0Client> {
    if (!this.clientPromise) {
      this.clientPromise = createAuth0Client({
        domain: environment.auth0Domain,
        clientId: environment.auth0ClientId,
        cacheLocation: 'memory',
        useRefreshTokens: false,
        authorizationParams: {
          redirect_uri: window.location.origin,
        },
      });
    }
    return this.clientPromise;
  }
}
