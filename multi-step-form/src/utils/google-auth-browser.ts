// Google OAuth Authentication Service (Browser-only version)
// Uses NEW Google Identity Services (GIS) - Updated for 2025

// Environment variables from memoryupdate.md
const GOOGLE_CLIENT_ID = '1008202205794-ukn77t8vk6e59e153f5ut7n19pjfv0pe.apps.googleusercontent.com';
const GOOGLE_API_KEY = 'AIzaSyCTZCvIo8O8Mk-_CpbPCu3LN37WkTqukDQ';

// OAuth scopes needed - Updated for GIS
const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file'
].join(' '); // Removed Forms API scopes for now due to 403 error

export interface GoogleAuthResponse {
  success: boolean;
  accessToken?: string;
  error?: string;
}

// Extend Window interface for Google APIs
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

export class GoogleAuthService {
  private static instance: GoogleAuthService;
  private accessToken: string | null = null;
  private isAuthenticated: boolean = false;
  private gapiInitialized: boolean = false;

  private constructor() {}

  static getInstance(): GoogleAuthService {
    if (!GoogleAuthService.instance) {
      GoogleAuthService.instance = new GoogleAuthService();
    }
    return GoogleAuthService.instance;
  }

  // Load Google API script
  private async loadGoogleScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[src="https://apis.google.com/js/api.js"]')) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Google API script'));
      document.head.appendChild(script);
    });
  }

  // Load Google Identity Services
  private async loadGoogleIdentity(): Promise<void> {
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

  // Initialize Google Auth
  async initializeGoogleAuth(): Promise<boolean> {
    try {
      if (this.gapiInitialized) {
        return true;
      }

      // Load required scripts
      await Promise.all([
        this.loadGoogleScript(),
        this.loadGoogleIdentity()
      ]);

      // Initialize gapi
      await new Promise<void>((resolve, reject) => {
        window.gapi.load('auth2:picker:client', {
          callback: resolve,
          onerror: reject
        });
      });

      // Initialize gapi client
      await window.gapi.client.init({
        apiKey: GOOGLE_API_KEY,
        clientId: GOOGLE_CLIENT_ID,
        discoveryDocs: [
          'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
          'https://forms.googleapis.com/$discovery/rest?version=v1'
        ],
        scope: SCOPES
      });

      this.gapiInitialized = true;
      console.log('Google Auth initialized successfully');
      
      // Check if user is already signed in
      const authInstance = window.gapi.auth2.getAuthInstance();
      if (authInstance.isSignedIn.get()) {
        const user = authInstance.currentUser.get();
        const authResponse = user.getAuthResponse();
        this.accessToken = authResponse.access_token;
        this.isAuthenticated = true;
      }

      return true;
    } catch (error) {
      console.error('Failed to initialize Google Auth:', error);
      return false;
    }
  }

  // Sign in with Google
  async signIn(): Promise<GoogleAuthResponse> {
    try {
      if (!this.gapiInitialized) {
        const initialized = await this.initializeGoogleAuth();
        if (!initialized) {
          throw new Error('Failed to initialize Google Auth');
        }
      }

      const authInstance = window.gapi.auth2.getAuthInstance();
      
      if (!authInstance) {
        throw new Error('Google Auth not initialized');
      }

      const user = await authInstance.signIn();
      const authResponse = user.getAuthResponse();
      
      this.accessToken = authResponse.access_token;
      this.isAuthenticated = true;

      console.log('Successfully signed in to Google');
      
      return {
        success: true,
        accessToken: this.accessToken
      };
    } catch (error: any) {
      console.error('Google sign in failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to sign in'
      };
    }
  }

  // Sign out
  async signOut(): Promise<void> {
    try {
      const authInstance = window.gapi.auth2.getAuthInstance();
      if (authInstance) {
        await authInstance.signOut();
      }
      
      this.accessToken = null;
      this.isAuthenticated = false;
      console.log('Successfully signed out of Google');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }

  // Check if user is authenticated
  isSignedIn(): boolean {
    return this.isAuthenticated && !!this.accessToken;
  }

  // Get current access token
  getAccessToken(): string | null {
    return this.accessToken;
  }

  // Get user info
  async getUserInfo(): Promise<any> {
    try {
      if (!this.isSignedIn()) {
        throw new Error('User not signed in');
      }

      const authInstance = window.gapi.auth2.getAuthInstance();
      const user = authInstance.currentUser.get();
      const profile = user.getBasicProfile();

      return {
        id: profile.getId(),
        name: profile.getName(),
        email: profile.getEmail(),
        imageUrl: profile.getImageUrl()
      };
    } catch (error) {
      console.error('Error getting user info:', error);
      throw error;
    }
  }

  // Refresh token if needed
  async refreshToken(): Promise<boolean> {
    try {
      if (!this.gapiInitialized) return false;
      
      const authInstance = window.gapi.auth2.getAuthInstance();
      const user = authInstance.currentUser.get();
      
      if (user.isSignedIn()) {
        const authResponse = await user.reloadAuthResponse();
        this.accessToken = authResponse.access_token;
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error refreshing token:', error);
      return false;
    }
  }

  // Make authenticated API call using gapi.client
  async makeGapiRequest(request: any): Promise<any> {
    if (!this.isSignedIn()) {
      throw new Error('User not authenticated');
    }

    try {
      const response = await request;
      return response.result;
    } catch (error) {
      console.error('GAPI request failed:', error);
      throw error;
    }
  }

  // Make authenticated HTTP request (fallback)
  async makeAuthenticatedRequest(url: string, options: RequestInit = {}): Promise<Response> {
    if (!this.isSignedIn()) {
      throw new Error('User not authenticated');
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

  // Check if Google APIs are available
  isGapiAvailable(): boolean {
    return typeof window !== 'undefined' && 
           !!window.gapi && 
           this.gapiInitialized;
  }
}

// Singleton instance
export const googleAuth = GoogleAuthService.getInstance();