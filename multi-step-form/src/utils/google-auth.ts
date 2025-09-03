// Google OAuth Authentication Service (Browser-compatible)
// Using browser-based Google API instead of Node.js google-auth-library

// Environment variables from memoryupdate.md
const GOOGLE_CLIENT_ID = '1008202205794-ukn77t8vk6e59e153f5ut7n19pjfv0pe.apps.googleusercontent.com';
const GOOGLE_API_KEY = 'AIzaSyCTZCvIo8O8Mk-_CpbPCu3LN37WkTqukDQ';

// OAuth scopes needed
const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/forms.body.readonly',
  'https://www.googleapis.com/auth/forms.responses.readonly'
];

export interface GoogleAuthResponse {
  success: boolean;
  accessToken?: string;
  error?: string;
}

export class GoogleAuthService {
  private static instance: GoogleAuthService;
  private accessToken: string | null = null;
  private isAuthenticated: boolean = false;

  private constructor() {}

  static getInstance(): GoogleAuthService {
    if (!GoogleAuthService.instance) {
      GoogleAuthService.instance = new GoogleAuthService();
    }
    return GoogleAuthService.instance;
  }

  // Initialize Google Auth (load Google API script)
  async initializeGoogleAuth(): Promise<boolean> {
    try {
      // Load Google API script if not already loaded
      if (typeof window !== 'undefined' && !(window as any).google) {
        await this.loadGoogleScript();
      }

      // Initialize gapi client
      await new Promise<void>((resolve, reject) => {
        (window as any).gapi.load('auth2', {
          callback: () => {
            (window as any).gapi.auth2.init({
              client_id: GOOGLE_CLIENT_ID,
            }).then(() => {
              console.log('Google Auth initialized successfully');
              resolve();
            }).catch((error: any) => {
              console.error('Error initializing Google Auth:', error);
              reject(error);
            });
          },
          onerror: () => {
            reject(new Error('Failed to load Google Auth'));
          }
        });
      });

      return true;
    } catch (error) {
      console.error('Failed to initialize Google Auth:', error);
      return false;
    }
  }

  // Load Google API script dynamically
  private loadGoogleScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Google API script'));
      document.head.appendChild(script);
    });
  }

  // Sign in with Google
  async signIn(): Promise<GoogleAuthResponse> {
    try {
      const authInstance = (window as any).gapi.auth2.getAuthInstance();
      
      if (!authInstance) {
        throw new Error('Google Auth not initialized');
      }

      const user = await authInstance.signIn({
        scope: SCOPES.join(' ')
      });

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
      const authInstance = (window as any).gapi.auth2.getAuthInstance();
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

      const authInstance = (window as any).gapi.auth2.getAuthInstance();
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
      const authInstance = (window as any).gapi.auth2.getAuthInstance();
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

  // Make authenticated API call
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
}

// Singleton instance
export const googleAuth = GoogleAuthService.getInstance();