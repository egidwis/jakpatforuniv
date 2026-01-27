// Simplified Google Auth using Google Identity Services (GIS)
// For testing and development - focuses on basic functionality

const GOOGLE_CLIENT_ID = '1008202205794-ukn77t8vk6e59e153f5ut7n19pjfv0pe.apps.googleusercontent.com';
const GOOGLE_API_KEY = 'AIzaSyCTZCvIo8O8Mk-_CpbPCu3LN37WkTqukDQ';

export interface AuthResult {
  success: boolean;
  accessToken?: string;
  error?: string;
  user?: any;
}

// Declare Google Identity Services types
declare global {
  interface Window {
    google: {
      accounts: {
        oauth2: {
          initTokenClient: (config: any) => any;
          hasGrantedAllScopes: (token: any, ...scopes: string[]) => boolean;
        };
        id: {
          initialize: (config: any) => void;
          prompt: () => void;
        };
      };
    };
    gapi: any;
  }
}

export class SimpleGoogleAuth {
  private static instance: SimpleGoogleAuth;
  private tokenClient: any = null;
  private accessToken: string | null = null;
  private initialized: boolean = false;

  private constructor() { }

  static getInstance(): SimpleGoogleAuth {
    if (!SimpleGoogleAuth.instance) {
      SimpleGoogleAuth.instance = new SimpleGoogleAuth();
    }
    return SimpleGoogleAuth.instance;
  }

  // Load Google Identity Services
  async loadGoogleScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[src="https://accounts.google.com/gsi/client"]')) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
      document.head.appendChild(script);
    });
  }

  // Load GAPI library for Picker and other APIs
  async loadGapiScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.gapi) {
        resolve();
        return;
      }

      if (document.querySelector('script[src*="apis.google.com"]')) {
        // Script already loaded, wait for gapi to be available
        const checkGapi = () => {
          if (window.gapi) {
            resolve();
          } else {
            setTimeout(checkGapi, 100);
          }
        };
        checkGapi();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        // Wait for gapi to initialize
        const checkGapi = () => {
          if (window.gapi) {
            resolve();
          } else {
            setTimeout(checkGapi, 100);
          }
        };
        checkGapi();
      };
      script.onerror = () => reject(new Error('Failed to load Google APIs'));
      document.head.appendChild(script);
    });
  }

  // Initialize Google Auth
  async initialize(): Promise<boolean> {
    try {
      if (this.initialized) return true;

      // Load both GIS and GAPI libraries
      await Promise.all([
        this.loadGoogleScript(),
        this.loadGapiScript()
      ]);

      // Wait for both Google and GAPI objects to be available
      let retries = 0;
      while ((!window.google || !window.gapi) && retries < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
      }

      if (!window.google) {
        throw new Error('Google Identity Services not available');
      }

      if (!window.gapi) {
        throw new Error('Google APIs not available');
      }

      // Skip GAPI client initialization for now - we'll use direct API calls
      console.log('✅ Skipping GAPI client initialization - using direct API calls');

      // Initialize Token Client for OAuth2
      this.tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/forms.body.readonly https://www.googleapis.com/auth/forms.responses.readonly https://www.googleapis.com/auth/calendar',
        callback: '', // Will be set per request
      });

      this.initialized = true;
      console.log('✅ Google Identity Services initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Google Identity Services:', error);
      return false;
    }
  }

  // Request Access Token
  async requestAccessToken(): Promise<AuthResult> {
    try {
      if (!this.initialized) {
        const success = await this.initialize();
        if (!success) {
          return { success: false, error: 'Failed to initialize Google services' };
        }
      }

      return new Promise((resolve) => {
        this.tokenClient.callback = (response: any) => {
          if (response.error) {
            resolve({
              success: false,
              error: response.error_description || response.error
            });
            return;
          }

          this.accessToken = response.access_token;
          console.log('✅ Access token received successfully');

          resolve({
            success: true,
            accessToken: this.accessToken
          });
        };

        // Request the token
        this.tokenClient.requestAccessToken({
          prompt: 'consent',
        });
      });
    } catch (error: any) {
      console.error('❌ Error requesting access token:', error);
      return {
        success: false,
        error: error.message || 'Failed to get access token'
      };
    }
  }

  // Get current access token
  getAccessToken(): string | null {
    return this.accessToken;
  }

  // Check if authenticated
  isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  // Make authenticated API call
  async makeAuthenticatedRequest(url: string, options: RequestInit = {}): Promise<Response> {
    if (!this.accessToken) {
      throw new Error('No access token available');
    }

    const headers = {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers
    };

    return fetch(url, {
      ...options,
      headers
    });
  }

  // Check if GAPI is available
  isGapiAvailable(): boolean {
    return !!window.gapi;
  }

  // Note: makeGapiRequest removed - using direct HTTP calls instead

  // Create Calendar Event
  async createCalendarEvent(eventData: any): Promise<any> {
    if (!this.accessToken) {
      throw new Error('No access token available');
    }

    try {
      const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to create calendar event');
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating calendar event:', error);
      throw error;
    }
  }

  // Revoke access token
  revoke(): void {
    if (this.accessToken && window.google && window.google.accounts && window.google.accounts.oauth2) {
      window.google.accounts.oauth2.revoke(this.accessToken, () => {
        this.accessToken = null;
        console.log('✅ Access token revoked');
      });
    }
  }
}

// Singleton instance
export const simpleGoogleAuth = SimpleGoogleAuth.getInstance();